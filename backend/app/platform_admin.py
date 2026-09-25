import hashlib
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psutil
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.access import require_permission
from app.config import settings
from app.database import engine, get_db
from app.models import AuditLog, User
from app.platform_models import BackupJob, BackupSchedule
from app.platform_schemas import BackupCreate, BackupResponse, BackupScheduleResponse, BackupScheduleUpdate, SystemMetricsResponse


router = APIRouter(prefix="/admin", tags=["Administration"])
PROCESS_STARTED_AT = time.time()
BACKUP_COMPONENTS = {"source", "uploads", "static", "config_templates", "migrations"}
EXCLUDED_DIRS = {"node_modules", ".venv", "__pycache__", ".next", ".git", "backups", "logs", ".pytest_cache", ".mypy_cache"}
EXCLUDED_FILES = {".env", ".env.local", ".env.production", "secrets.json"}
DIRECTORY_SIZE_CACHE_SECONDS = 300
_directory_size_cache: dict[Path, tuple[float, int]] = {}
_directory_size_cache_lock = threading.Lock()


def now() -> datetime:
    return datetime.now(UTC)


def backup_root() -> Path:
    root = Path(settings.backup_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_backup_path(path_value: str | None) -> Path:
    if not path_value:
        raise HTTPException(status_code=404, detail="Backup file is unavailable.")
    root = backup_root()
    path = Path(path_value).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Backup file is unavailable.")
    return path


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audit(db: Session, request: Request, actor: User, action: str, job: BackupJob | None = None, details: dict | None = None, outcome: str = "success"):
    safe_details = {key: value for key, value in (details or {}).items() if key not in {"password", "database_url", "token", "secret"}}
    db.add(AuditLog(user_id=actor.id, action=action, module="backups" if job else "settings", status=outcome, identifier=str(job.id) if job else None, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"), details=safe_details or None))


def job_response(db: Session, job: BackupJob) -> BackupResponse:
    requester = db.get(User, job.requested_by) if job.requested_by else None
    return BackupResponse(
        id=job.id, backup_type=job.backup_type, status=job.status, description=job.description,
        requested_by=job.requested_by, requested_by_name=requester.full_name if requester else None,
        started_at=job.started_at, completed_at=job.completed_at, duration_seconds=job.duration_seconds,
        file_name=job.file_name, file_size=job.file_size, checksum=job.checksum,
        application_version=job.application_version, error_message=job.error_message,
        metadata_json=job.metadata_json, created_at=job.created_at, deleted_at=job.deleted_at,
    )


def create_job(db: Session, backup_type: str, payload: BackupCreate, actor: User) -> BackupJob:
    active = db.scalar(select(BackupJob).where(BackupJob.backup_type == backup_type, BackupJob.status.in_(["pending", "running"])))
    if active:
        raise HTTPException(status_code=409, detail=f"A {backup_type} backup is already running.")
    job = BackupJob(backup_type=backup_type, status="pending", description=payload.description.strip(), requested_by=actor.id, application_version=settings.demo_version)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def finish_job(db: Session, job: BackupJob, path: Path, metadata: dict):
    job.status = "completed"
    job.completed_at = now()
    job.duration_seconds = max(0, (job.completed_at - job.started_at).total_seconds()) if job.started_at else 0
    job.file_name = path.name
    job.storage_path = str(path)
    job.file_size = path.stat().st_size
    job.checksum = checksum(path)
    job.metadata_json = metadata


def fail_job(job: BackupJob, error: Exception):
    job.status = "failed"
    job.completed_at = now()
    job.duration_seconds = max(0, (job.completed_at - job.started_at).total_seconds()) if job.started_at else 0
    job.error_message = str(error)[:2000]


def run_database_backup(db: Session, job: BackupJob):
    url = make_url(settings.database_url)
    if not url.drivername.startswith("postgresql"):
        raise RuntimeError("Database backup requires PostgreSQL and pg_dump.")
    executable = shutil.which(settings.pg_dump_path) if not Path(settings.pg_dump_path).is_absolute() else settings.pg_dump_path
    if not executable or not Path(executable).is_file():
        raise RuntimeError("pg_dump was not found. Configure PG_DUMP_PATH on this server.")
    timestamp = now().strftime("%Y%m%d-%H%M%S")
    path = backup_root() / "database" / f"catalogue-db-{timestamp}-{job.id.hex[:8]}.dump"
    path.parent.mkdir(parents=True, exist_ok=True)
    args = [str(executable), "--format=custom", "--no-password", "--file", str(path)]
    if url.host:
        args.extend(["--host", url.host])
    if url.port:
        args.extend(["--port", str(url.port)])
    if url.username:
        args.extend(["--username", url.username])
    args.append(url.database or "")
    environment = os.environ.copy()
    if url.password:
        environment["PGPASSWORD"] = url.password
    result = subprocess.run(args, env=environment, capture_output=True, text=True, timeout=3600, check=False, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    environment.pop("PGPASSWORD", None)
    if result.returncode != 0:
        if path.exists():
            path.unlink()
        raise RuntimeError((result.stderr or "pg_dump failed.").strip()[:1500])
    finish_job(db, job, path, {"database": url.database, "format": "PostgreSQL custom", "tool": "pg_dump"})


def add_tree(archive: zipfile.ZipFile, root: Path, source: Path, prefix: str):
    if not source.exists():
        return
    for path in source.rglob("*"):
        relative_parts = path.relative_to(source).parts
        if not path.is_file() or any(part in EXCLUDED_DIRS for part in relative_parts) or path.name in EXCLUDED_FILES:
            continue
        if path.suffix.casefold() in {".log", ".tmp", ".pyc"}:
            continue
        archive.write(path, Path(prefix) / Path(*relative_parts))


def run_application_backup(db: Session, job: BackupJob, requested: list[str]):
    components = set(requested) or {"source", "uploads", "static", "config_templates", "migrations"}
    if not components.issubset(BACKUP_COMPONENTS):
        raise RuntimeError("Unsupported application backup component.")
    app_root = Path(settings.application_root).resolve()
    if not app_root.is_dir():
        raise RuntimeError("APPLICATION_ROOT does not point to an application directory.")
    timestamp = now().strftime("%Y%m%d-%H%M%S")
    path = backup_root() / "application" / f"catalogue-app-{timestamp}-{job.id.hex[:8]}.zip"
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        if "source" in components:
            add_tree(archive, app_root, app_root / "backend" / "app", "backend/app")
            add_tree(archive, app_root, app_root / "frontend" / "src", "frontend/src")
        if "uploads" in components:
            add_tree(archive, app_root, Path(settings.upload_dir).resolve(), "uploads")
            add_tree(archive, app_root, Path(settings.cover_upload_dir).resolve(), "private-cover-assets")
        if "static" in components:
            add_tree(archive, app_root, app_root / "frontend" / "public", "frontend/public")
        if "migrations" in components:
            add_tree(archive, app_root, app_root / "backend" / "alembic", "backend/alembic")
        if "config_templates" in components:
            for candidate in [app_root / "docker-compose.yml", app_root / "backend" / ".env.example", app_root / "backend" / "Dockerfile", app_root / "frontend" / "Dockerfile"]:
                if candidate.is_file():
                    archive.write(candidate, candidate.relative_to(app_root))
        archive.writestr("BACKUP-METADATA.txt", f"Application version: {settings.demo_version}\nCreated: {now().isoformat()}\nComponents: {', '.join(sorted(components))}\n")
    finish_job(db, job, path, {"components": sorted(components), "format": "ZIP"})


@router.get("/backups/{backup_type}", response_model=list[BackupResponse])
def list_backups(backup_type: str, _: User = Depends(require_permission("backups.view")), db: Session = Depends(get_db)):
    if backup_type not in {"database", "application"}:
        raise HTTPException(status_code=404, detail="Backup type not found.")
    jobs = db.scalars(select(BackupJob).where(BackupJob.backup_type == backup_type).order_by(BackupJob.created_at.desc()).limit(100)).all()
    return [job_response(db, job) for job in jobs]


@router.post("/backups/{backup_type}", response_model=BackupResponse, status_code=status.HTTP_201_CREATED)
def create_backup(backup_type: str, payload: BackupCreate, request: Request, actor: User = Depends(require_permission("backups.create")), db: Session = Depends(get_db)):
    if backup_type not in {"database", "application"}:
        raise HTTPException(status_code=404, detail="Backup type not found.")
    job = create_job(db, backup_type, payload, actor)
    job.status = "running"
    job.started_at = now()
    audit(db, request, actor, f"{backup_type}_backup_started", job)
    db.commit()
    try:
        if backup_type == "database":
            run_database_backup(db, job)
        else:
            run_application_backup(db, job, payload.components)
        audit(db, request, actor, f"{backup_type}_backup_completed", job, {"file_size": job.file_size, "checksum": job.checksum})
    except Exception as error:
        fail_job(job, error)
        audit(db, request, actor, f"{backup_type}_backup_failed", job, {"reason": job.error_message}, "failed")
    db.commit()
    db.refresh(job)
    return job_response(db, job)


@router.get("/backups/{backup_type}/{backup_id}", response_model=BackupResponse)
def get_backup(backup_type: str, backup_id: uuid.UUID, _: User = Depends(require_permission("backups.view")), db: Session = Depends(get_db)):
    job = db.get(BackupJob, backup_id)
    if not job or job.backup_type != backup_type:
        raise HTTPException(status_code=404, detail="Backup not found.")
    return job_response(db, job)


@router.get("/backups/{backup_type}/{backup_id}/download")
def download_backup(backup_type: str, backup_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("backups.download")), db: Session = Depends(get_db)):
    job = db.get(BackupJob, backup_id)
    if not job or job.backup_type != backup_type or job.status != "completed":
        raise HTTPException(status_code=404, detail="Completed backup not found.")
    path = safe_backup_path(job.storage_path)
    audit(db, request, actor, "backup_downloaded", job, {"backup_type": backup_type})
    db.commit()
    return FileResponse(path, filename=job.file_name, media_type="application/octet-stream")


@router.delete("/backups/{backup_type}/{backup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_backup(backup_type: str, backup_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("backups.delete")), db: Session = Depends(get_db)):
    job = db.get(BackupJob, backup_id)
    if not job or job.backup_type != backup_type:
        raise HTTPException(status_code=404, detail="Backup not found.")
    if job.status == "running":
        raise HTTPException(status_code=409, detail="A running backup cannot be deleted.")
    if job.storage_path:
        try:
            safe_backup_path(job.storage_path).unlink()
        except HTTPException:
            pass
    job.status = "deleted"
    job.deleted_at = now()
    audit(db, request, actor, "backup_deleted", job, {"backup_type": backup_type})
    db.commit()


@router.get("/backup-schedules/{backup_type}", response_model=BackupScheduleResponse)
def get_schedule(backup_type: str, _: User = Depends(require_permission("backups.view")), db: Session = Depends(get_db)):
    schedule = db.scalar(select(BackupSchedule).where(BackupSchedule.backup_type == backup_type))
    if not schedule:
        schedule = BackupSchedule(backup_type=backup_type, retention_days=settings.backup_retention_days, retention_count=settings.backup_retention_count)
        db.add(schedule); db.commit(); db.refresh(schedule)
    return schedule


@router.put("/backup-schedules/{backup_type}", response_model=BackupScheduleResponse)
def update_schedule(backup_type: str, payload: BackupScheduleUpdate, request: Request, actor: User = Depends(require_permission("backups.schedule")), db: Session = Depends(get_db)):
    if backup_type not in {"database", "application"}:
        raise HTTPException(status_code=404, detail="Backup type not found.")
    schedule = db.scalar(select(BackupSchedule).where(BackupSchedule.backup_type == backup_type)) or BackupSchedule(backup_type=backup_type, created_by=actor.id)
    for field, value in payload.model_dump().items(): setattr(schedule, field, value)
    schedule.updated_by = actor.id
    db.add(schedule)
    audit(db, request, actor, "backup_schedule_changed", details={"backup_type": backup_type, "enabled": payload.is_enabled})
    db.commit(); db.refresh(schedule)
    return schedule


def directory_size(path: Path) -> int:
    """Return an approximate storage size without rescanning every request.

    The product-media directory contains tens of thousands of files. Walking
    that tree for every dashboard visit used to add several seconds to an
    otherwise small overview response. Storage totals are operational metrics,
    so a five-minute process-local cache is accurate enough and keeps the API
    responsive.
    """

    resolved = path.resolve()
    measured_at = time.monotonic()
    with _directory_size_cache_lock:
        cached = _directory_size_cache.get(resolved)
        if cached and measured_at - cached[0] < DIRECTORY_SIZE_CACHE_SECONDS:
            return cached[1]
        try:
            size = sum(
                item.stat().st_size for item in resolved.rglob("*") if item.is_file()
            )
        except OSError:
            size = 0
        _directory_size_cache[resolved] = (time.monotonic(), size)
        return size


@router.get("/system/metrics", response_model=SystemMetricsResponse)
def system_metrics(
    _: User = Depends(require_permission("system_metrics.view")),
    db: Session = Depends(get_db),
    include_storage_sizes: bool = True,
):
    measured_at = now()
    cpu = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()
    disk_root = Path(settings.application_root).resolve().anchor or str(Path.cwd().anchor)
    disk = psutil.disk_usage(disk_root)
    warnings = []
    if cpu >= settings.health_cpu_warning: warnings.append("CPU usage is above the warning threshold.")
    if memory.percent >= settings.health_memory_warning: warnings.append("Memory usage is above the warning threshold.")
    if disk.percent >= settings.health_disk_warning: warnings.append("Disk usage is above the warning threshold.")
    database_status = "connected"
    database_ms = 0.0
    pg_version = None
    database_size = None
    active_connections = None
    start = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
        database_ms = round((time.perf_counter() - start) * 1000, 2)
        if engine.dialect.name == "postgresql":
            pg_version = db.scalar(text("SHOW server_version"))
            database_size = db.scalar(text("SELECT pg_database_size(current_database())"))
            active_connections = db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"))
    except Exception:
        database_status = "disconnected"
        warnings.append("Database connection failed.")
    if database_ms >= settings.health_database_ms_warning: warnings.append("Database response time is above the warning threshold.")
    latest = {kind: db.scalar(select(BackupJob).where(BackupJob.backup_type == kind, BackupJob.status == "completed").order_by(BackupJob.completed_at.desc())) for kind in ("database", "application")}
    running = db.scalar(select(BackupJob).where(BackupJob.status == "running").order_by(BackupJob.started_at.desc()))
    status_value = "critical" if database_status != "connected" or disk.percent >= 95 else "warning" if warnings else "healthy"
    try:
        load_average = list(os.getloadavg()) if hasattr(os, "getloadavg") else None
    except OSError:
        load_average = None
    return SystemMetricsResponse(
        status=status_value, timestamp=measured_at,
        thresholds={"cpu_percent": settings.health_cpu_warning, "memory_percent": settings.health_memory_warning, "disk_percent": settings.health_disk_warning, "database_response_ms": settings.health_database_ms_warning},
        system={"platform": platform.system(), "platform_release": platform.release(), "uptime_seconds": int(time.time() - psutil.boot_time()), "cpu_percent": cpu, "physical_cores": psutil.cpu_count(logical=False), "logical_processors": psutil.cpu_count(logical=True), "per_core_percent": psutil.cpu_percent(percpu=True), "load_average": load_average, "load_average_supported": load_average is not None, "memory_total_bytes": memory.total, "memory_used_bytes": memory.used, "memory_available_bytes": memory.available, "memory_percent": memory.percent, "disk_total_bytes": disk.total, "disk_used_bytes": disk.used, "disk_free_bytes": disk.free, "disk_percent": disk.percent, "backup_storage_bytes": directory_size(backup_root()) if include_storage_sizes else None, "media_storage_bytes": directory_size(Path(settings.upload_dir).resolve()) + directory_size(Path(settings.cover_upload_dir).resolve()) if include_storage_sizes else None},
        application={"version": settings.demo_version, "uptime_seconds": int(time.time() - PROCESS_STARTED_AT), "environment": "demo" if settings.demo_mode else settings.app_env, "api_response_ms": round((time.perf_counter() - start) * 1000, 2), "active_sessions": 0, "recent_failed_logins": db.scalar(select(func.count(AuditLog.id)).where(AuditLog.action == "login_failed", AuditLog.created_at >= measured_at - timedelta(hours=24))) or 0, "recent_server_errors": 0, "current_background_jobs": 1 if running else 0},
        database={"status": database_status, "response_ms": database_ms, "postgresql_version": pg_version, "size_bytes": database_size, "active_connections": active_connections, "last_successful_backup": latest["database"].completed_at if latest["database"] else None},
        backups={"last_database_backup": latest["database"].completed_at if latest["database"] else None, "last_application_backup": latest["application"].completed_at if latest["application"] else None, "current_job": str(running.id) if running else None, "restore_enabled": settings.enable_backup_restore},
        warnings=warnings,
    )


@router.get("/system/information")
def system_information(_: User = Depends(require_permission("system_information.view"))):
    return {"application_name": settings.app_name, "application_version": settings.demo_version, "environment": "demo" if settings.demo_mode else settings.app_env, "python_version": platform.python_version(), "operating_system": platform.system(), "architecture": platform.machine(), "restore_enabled": settings.enable_backup_restore}
