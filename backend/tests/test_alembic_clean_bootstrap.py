import os
import sqlite3
import subprocess
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_OPERATIONAL_TABLES = {
    "backup_jobs",
    "backup_schedules",
    "catalogue_category_settings",
    "catalogue_cover_assets",
    "catalogue_cover_files",
    "catalogue_cover_settings",
    "erp_connection_settings",
    "erp_customer_price_levels",
    "erp_product_customer_prices",
    "erp_sync_runs",
    "product_sync_locks",
    "system_metric_snapshots",
}


def test_clean_alembic_bootstrap_registers_erp_and_platform_models(tmp_path):
    """Catches clean PostgreSQL/SQLite schemas silently omitting model modules."""
    database = tmp_path / "clean-bootstrap.sqlite3"
    environment = os.environ.copy()
    environment.update(
        {
            "DATABASE_URL": f"sqlite+pysqlite:///{database.as_posix()}",
            "AUTO_CREATE_TABLES": "false",
            "SEED_DEMO_DATA": "false",
            "SECRET_KEY": "clean-bootstrap-test-secret",
        }
    )

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        tables = {
            row[0]
            for row in db.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
    assert REQUIRED_OPERATIONAL_TABLES <= tables, sorted(
        REQUIRED_OPERATIONAL_TABLES - tables
    )
