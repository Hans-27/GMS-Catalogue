r"""Verify that catalogue business records and media references are persisted safely.

Run from ``backend`` with::

    .\.venv\Scripts\python.exe -m app.scripts.audit_database

The audit is read-only. It never prints credentials or the database URL.
"""

from pathlib import Path

from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine
from app.storage import cover_storage


REQUIRED_TABLES = {
    "users",
    "roles",
    "permissions",
    "departments",
    "positions",
    "teams",
    "brands",
    "products",
    "categories",
    "product_images",
    "product_prices",
    "catalogues",
    "catalogue_products",
    "catalogue_versions",
    "catalogue_cover_settings",
    "catalogue_cover_assets",
    "demo_feedback",
    "catalogue_audit_logs",
}

RECORD_TABLES = (
    "users",
    "roles",
    "permissions",
    "departments",
    "positions",
    "teams",
    "brands",
    "products",
    "categories",
    "product_images",
    "product_prices",
    "catalogues",
    "catalogue_products",
    "catalogue_versions",
    "catalogue_cover_settings",
    "catalogue_cover_assets",
    "demo_feedback",
    "catalogue_audit_logs",
)

ORPHAN_CHECKS = {
    "catalogue products without catalogue": """
        SELECT COUNT(*) FROM catalogue_products item
        LEFT JOIN catalogues parent ON parent.id = item.catalogue_id
        WHERE parent.id IS NULL
    """,
    "catalogue products without product": """
        SELECT COUNT(*) FROM catalogue_products item
        LEFT JOIN products parent ON parent.id = item.product_id
        WHERE parent.id IS NULL
    """,
    "product images without product": """
        SELECT COUNT(*) FROM product_images item
        LEFT JOIN products parent ON parent.id = item.product_id
        WHERE parent.id IS NULL
    """,
    "catalogue versions without catalogue": """
        SELECT COUNT(*) FROM catalogue_versions item
        LEFT JOIN catalogues parent ON parent.id = item.catalogue_id
        WHERE parent.id IS NULL
    """,
    "cover settings without catalogue": """
        SELECT COUNT(*) FROM catalogue_cover_settings item
        LEFT JOIN catalogues parent ON parent.id = item.catalogue_id
        WHERE parent.id IS NULL
    """,
}


def _local_product_image_exists(storage_name: str) -> bool:
    root = Path(settings.upload_dir).resolve()
    candidate = (root / storage_name).resolve()
    return root in candidate.parents and candidate.is_file()


def audit() -> tuple[list[str], list[str]]:
    failures: list[str] = []
    notices: list[str] = []
    available = set(inspect(engine).get_table_names())
    missing_tables = sorted(REQUIRED_TABLES - available)
    if missing_tables:
        failures.append(f"Missing required tables: {', '.join(missing_tables)}")

    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            integrity = connection.exec_driver_sql("PRAGMA integrity_check").scalar_one()
            if integrity != "ok":
                failures.append(f"SQLite integrity check failed: {integrity}")
            foreign_key_violations = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            if foreign_key_violations:
                failures.append(f"Foreign-key violations: {len(foreign_key_violations)}")
        else:
            connection.execute(text("SELECT 1"))

        for table in RECORD_TABLES:
            if table in available:
                count = connection.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
                notices.append(f"{table}: {count}")

        for label, query in ORPHAN_CHECKS.items():
            if all(table in available for table in REQUIRED_TABLES):
                count = connection.execute(text(query)).scalar_one()
                if count:
                    failures.append(f"{label}: {count}")

        missing_media = 0
        external_demo_media = 0
        if "product_images" in available:
            rows = connection.execute(text("SELECT public_url, storage_name FROM product_images")).mappings()
            for row in rows:
                url = str(row["public_url"] or "")
                if url.startswith(("http://", "https://")):
                    external_demo_media += 1
                elif not _local_product_image_exists(str(row["storage_name"])):
                    missing_media += 1

        if "catalogue_cover_assets" in available:
            rows = connection.execute(text("""
                SELECT storage_key, preview_storage_key FROM catalogue_cover_assets
                WHERE deleted_at IS NULL
            """)).mappings()
            for row in rows:
                for key in (row["storage_key"], row["preview_storage_key"]):
                    if key:
                        try:
                            exists = cover_storage.resolve(str(key)).is_file()
                        except Exception:
                            exists = False
                        if not exists:
                            missing_media += 1

        notices.append(f"external demo image URLs: {external_demo_media}")
        notices.append(f"missing local media files: {missing_media}")
        if missing_media:
            failures.append(f"Missing local media files: {missing_media}")

    return failures, notices


def main() -> None:
    failures, notices = audit()
    print(f"Database persistence audit ({engine.dialect.name})")
    for notice in notices:
        print(f"  {notice}")
    if failures:
        for failure in failures:
            print(f"ERROR: {failure}")
        raise SystemExit(1)
    print("RESULT: OK - business records are database-backed and local media references are valid.")


if __name__ == "__main__":
    main()
