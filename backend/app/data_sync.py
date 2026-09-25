import uuid
import csv
import io
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import require_permission
from app.config import settings
from app.database import get_db
from app.erp_models import ErpConnectionSetting, ErpSyncRun, ProductSyncLock
from app.models import AuditLog, User
from app.product_sync_schemas import ProductSyncRunResponse, ProductSyncStatusResponse
from app.product_sync_service import run_product_sync


router = APIRouter(prefix="/admin/data-sync", tags=["Product data synchronization"])


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _run_response(run: ErpSyncRun | None) -> ProductSyncRunResponse | None:
    return ProductSyncRunResponse.model_validate(run) if run else None


def _active_running_run(db: Session) -> ErpSyncRun | None:
    lock = db.get(ProductSyncLock, 1)
    if not lock or not lock.owner_token or not lock.locked_until or _as_utc(lock.locked_until) <= datetime.now(UTC):
        return None
    return db.scalar(select(ErpSyncRun).where(
        ErpSyncRun.sync_type == "product_source_data", ErpSyncRun.status == "running"
    ).order_by(ErpSyncRun.started_at.desc()))


@router.get("/status", response_model=ProductSyncStatusResponse)
def data_sync_status(_: User = Depends(require_permission("data_sync.view")), db: Session = Depends(get_db)) -> ProductSyncStatusResponse:
    latest = db.scalar(select(ErpSyncRun).where(ErpSyncRun.sync_type == "product_source_data").order_by(ErpSyncRun.started_at.desc()))
    running = _active_running_run(db)
    success = db.scalar(select(ErpSyncRun).where(ErpSyncRun.sync_type == "product_source_data", ErpSyncRun.status.in_(["completed", "completed_with_warnings"])).order_by(ErpSyncRun.completed_at.desc()))
    failed = db.scalar(select(ErpSyncRun).where(ErpSyncRun.sync_type == "product_source_data", ErpSyncRun.status == "failed").order_by(ErpSyncRun.completed_at.desc()))
    last_success = _as_utc(success.completed_at) if success else None
    age = (datetime.now(UTC) - last_success).total_seconds() if last_success else None
    stale_level = "critical" if age is None or age >= settings.product_sync_stale_critical_seconds else "warning" if age >= settings.product_sync_stale_warning_seconds else "fresh"
    next_base = _as_utc(latest.completed_at) if latest and latest.completed_at else None
    next_sync = (next_base + timedelta(seconds=settings.product_sync_interval_seconds)) if next_base else None
    connection = db.get(ErpConnectionSetting, 1)
    return ProductSyncStatusResponse(
        status=running.status if running else latest.status if latest else "never",
        enabled=settings.product_sync_enabled,
        interval_seconds=settings.product_sync_interval_seconds,
        batch_size=settings.product_sync_batch_size,
        next_scheduled_sync=next_sync,
        last_successful_sync=last_success,
        last_failed_sync=_as_utc(failed.completed_at) if failed else None,
        current_run=_run_response(running),
        latest_run=_run_response(latest),
        source_database_status=connection.last_test_status if connection else "not_configured",
        records_read=latest.rows_read if latest else 0,
        products_updated=latest.rows_updated if latest else 0,
        stock_values_updated=latest.stock_values_updated if latest else 0,
        price_values_updated=latest.price_values_updated if latest else 0,
        products_missing=latest.products_missing if latest else 0,
        duration_seconds=latest.duration_seconds if latest else None,
        data_is_stale=stale_level != "fresh",
        stale_level=stale_level,
        stale_warning_seconds=settings.product_sync_stale_warning_seconds,
        stale_critical_seconds=settings.product_sync_stale_critical_seconds,
    )


@router.get("/history", response_model=list[ProductSyncRunResponse])
def data_sync_history(_: User = Depends(require_permission("data_sync.view")), db: Session = Depends(get_db)) -> list[ProductSyncRunResponse]:
    rows = db.scalars(select(ErpSyncRun).where(ErpSyncRun.sync_type == "product_source_data").order_by(ErpSyncRun.started_at.desc()).limit(100))
    return [ProductSyncRunResponse.model_validate(item) for item in rows]


@router.get("/history/{run_id}", response_model=ProductSyncRunResponse)
def data_sync_history_detail(run_id: uuid.UUID, _: User = Depends(require_permission("data_sync.view")), db: Session = Depends(get_db)) -> ProductSyncRunResponse:
    run = db.get(ErpSyncRun, run_id)
    if not run or run.sync_type != "product_source_data":
        raise HTTPException(status_code=404, detail="Synchronization run not found.")
    return ProductSyncRunResponse.model_validate(run)


@router.get("/history/{run_id}/errors.csv")
def data_sync_error_report(run_id: uuid.UUID, _: User = Depends(require_permission("data_sync.view")), db: Session = Depends(get_db)) -> Response:
    run = db.get(ErpSyncRun, run_id)
    if not run or run.sync_type != "product_source_data":
        raise HTTPException(status_code=404, detail="Synchronization run not found.")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["run_id", "started_at", "status", "failed_records", "retry_count", "safe_error_summary"])
    writer.writerow([str(run.id), run.started_at.isoformat(), run.status, run.error_count, run.retry_count, run.error_summary])
    return Response(
        output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="product-sync-{run.id}-errors.csv"'},
    )


@router.post("/run", response_model=ProductSyncRunResponse)
def run_data_sync(request: Request, actor: User = Depends(require_permission("data_sync.run")), db: Session = Depends(get_db)) -> ProductSyncRunResponse:
    running = _active_running_run(db)
    if running:
        return ProductSyncRunResponse.model_validate(running)
    db.add(AuditLog(user_id=actor.id, action="manual_product_sync_started", module="data_sync", status="success", identifier=None, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"), details={"request_id": request.headers.get("x-request-id")}))
    db.commit()
    run_id = run_product_sync(trigger="manual", actor_id=actor.id)
    run = db.get(ErpSyncRun, run_id)
    if not run:
        raise HTTPException(status_code=500, detail="Synchronization status could not be loaded.")
    return ProductSyncRunResponse.model_validate(run)
