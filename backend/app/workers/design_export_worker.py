"""Background worker for Catalogue Design Studio PDF and image exports."""

from __future__ import annotations

import argparse
import logging
import threading
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.database import SessionLocal
from app.design_studio_browser_export import render_browser_pdf
from app.design_studio_export import design_snapshot, render_pdf, render_raster
from app.design_studio_models import CatalogueDesign, CatalogueExportJob
from app.design_studio_service import apply_promotion_schedule
from app.storage import cover_storage


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def process_next() -> bool:
    with SessionLocal() as db:
        promotions = list(db.scalars(select(CatalogueDesign).where(
            CatalogueDesign.catalogue_type == "promotion",
            CatalogueDesign.deleted_at.is_(None),
            CatalogueDesign.promotion_status.in_(("approved", "scheduled", "active")),
        )))
        if any(apply_promotion_schedule(item) for item in promotions):
            db.commit()
        job_id = db.scalar(
            select(CatalogueExportJob.id)
            .where(CatalogueExportJob.status == "queued")
            .order_by(CatalogueExportJob.created_at)
            .limit(1)
        )
        if not job_id:
            return False
        # Claim conditionally so an embedded worker and a dedicated worker can
        # never render or overwrite the same export concurrently.
        claimed = db.execute(
            update(CatalogueExportJob)
            .where(CatalogueExportJob.id == job_id, CatalogueExportJob.status == "queued")
            .values(status="running", started_at=datetime.now(UTC))
        )
        if claimed.rowcount != 1:
            db.rollback()
            return False
        db.commit()
        job = db.get(CatalogueExportJob, job_id)
        if job is None:
            return False
        try:
            design = db.get(CatalogueDesign, job.design_id)
            if not design or design.deleted_at:
                raise ValueError("The catalogue design is unavailable.")
            snapshot = design_snapshot(db, design, job.version_id)
            extension = "pdf" if job.export_type in {"pdf", "print_pdf", "web_pdf"} else "jpg" if job.export_type == "jpeg" else "png"
            key = f"catalogue-studio/exports/{job.id}.{extension}"
            output_path = cover_storage.resolve(key)
            if extension == "pdf":
                try:
                    render_browser_pdf(
                        db,
                        snapshot,
                        output_path,
                        job.options_json,
                        design_id=job.design_id,
                        version_id=job.version_id,
                        requested_by_id=job.requested_by_id,
                    )
                except (NotImplementedError, RuntimeError):
                    # Browser rendering depends on a separately running frontend
                    # and on its session cookie reaching the API host. Exports
                    # must still complete when that optional path is unavailable
                    # or the worker and web processes use different hostnames.
                    logger.warning("Browser PDF rendering failed for export %s; using the authenticated native Studio renderer", job.id, exc_info=True)
                    render_pdf(db, snapshot, output_path, job.options_json)
            else:
                render_raster(db, snapshot, output_path, job.options_json, job.export_type)
            job.storage_key = key; job.file_size = output_path.stat().st_size
            job.status = "completed"; job.completed_at = datetime.now(UTC); job.error_message = None
            db.commit()
            logger.info("Completed design export %s", job.id)
        except Exception as error:
            logger.exception("Design export %s failed", job.id)
            job.status = "failed"; job.completed_at = datetime.now(UTC)
            detail = str(error).strip() or type(error).__name__
            job.error_message = detail[:500] or "Export failed while rendering the saved catalogue design."
            db.commit()
        return True


def run(stop_event: threading.Event, poll_seconds: float = 2.0) -> None:
    """Continuously process exports until the hosting application stops."""
    logger.info("Catalogue export worker started poll_seconds=%s", poll_seconds)
    while not stop_event.is_set():
        processed = process_next()
        if not processed and stop_event.wait(max(.5, poll_seconds)):
            break
    logger.info("Catalogue export worker stopped")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process the queue once and exit.")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args()
    if args.once:
        process_next()
        return
    run(threading.Event(), args.poll_seconds)


if __name__ == "__main__":
    main()
