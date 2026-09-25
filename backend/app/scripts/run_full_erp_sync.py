"""Run one complete manual ERP synchronization outside the API process."""

from app.product_sync_service import run_product_sync


def main() -> None:
    run_id = run_product_sync(trigger="manual")
    print(run_id)


if __name__ == "__main__":
    main()
