from collections.abc import Generator
import sqlite3

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


is_sqlite = settings.database_url.startswith("sqlite")
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"timeout": 30} if is_sqlite else {},
)


@event.listens_for(Engine, "connect")
def _configure_sqlite(dbapi_connection, _connection_record) -> None:
    if not isinstance(dbapi_connection, sqlite3.Connection):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=30000")
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError:
        # Another process may be completing the one-time journal transition.
        pass
    cursor.execute("PRAGMA synchronous=NORMAL")
    # Demo databases contain large immutable catalogue-version JSON snapshots.
    # The SQLite defaults (roughly a 2 MB page cache and no memory mapping)
    # repeatedly evict the product/category indexes used by the dashboard.
    # These settings are connection-local, safe with WAL, and leave production
    # PostgreSQL deployments untouched.
    cursor.execute("PRAGMA cache_size=-32768")
    cursor.execute("PRAGMA mmap_size=268435456")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()

SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
