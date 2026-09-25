import logging
import signal
import threading

from app.config import settings
from app.product_sync_service import run_product_sync
from app.legacy_product_sync import sync_legacy_product_presence
from app.database import SessionLocal
from app.promotion_service import process_scheduled_promotions


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("pytds").setLevel(logging.WARNING)
logger = logging.getLogger("gms.product_sync_worker")
stop_event = threading.Event()


def _stop(*_args) -> None:
    stop_event.set()


def run(worker_stop_event: threading.Event) -> None:
    logger.info("Product synchronization worker started interval=%ss batch=%s", settings.product_sync_interval_seconds, settings.product_sync_batch_size)
    while not worker_stop_event.is_set():
        if settings.product_sync_enabled:
            run_id = run_product_sync(trigger="automatic")
            logger.info("Product synchronization cycle finished run_id=%s", run_id)
            try:
                legacy_result = sync_legacy_product_presence()
                if not legacy_result.get("skipped"):
                    logger.info("Legacy product presence synchronized result=%s", legacy_result)
            except Exception as exc:
                # ERP lifecycle remains authoritative when the retired site is
                # temporarily unavailable; keep the last valid membership data.
                logger.warning("Legacy product presence sync unavailable: %s", type(exc).__name__)
        with SessionLocal() as db:
            promotion_result = process_scheduled_promotions(db)
            if any(promotion_result.values()):
                logger.info("Promotion schedule cycle finished result=%s", promotion_result)
        if worker_stop_event.wait(settings.product_sync_interval_seconds):
            break
    logger.info("Product synchronization worker stopped")


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _stop)
    run(stop_event)


if __name__ == "__main__":
    main()
