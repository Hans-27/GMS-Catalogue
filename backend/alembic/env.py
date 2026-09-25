from logging.config import fileConfig

from alembic import context
from alembic.script import ScriptDirectory
from sqlalchemy import Column, MetaData, String, Table, engine_from_config, inspect, pool

from app import (  # noqa: F401 - register mappings
    commerce_models,
    design_studio_models,
    erp_models,
    feedback_models,
    models,
    platform_models,
    promotion_models,
)
from app.config import settings
from app.database import Base


config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def bootstrap_empty_database(connection) -> None:
    """Create the current schema for a genuinely empty installation.

    The original 0001 baseline intentionally used live SQLAlchemy metadata.
    As the application grew, that meant it created future tables and columns
    before later historical revisions attempted to add them.  Existing
    databases must still run the historical chain, but a new installation can
    safely create the current metadata and stamp the single current head.
    """

    if inspect(connection).get_table_names():
        return
    target_metadata.create_all(connection)
    head = ScriptDirectory.from_config(config).get_current_head()
    if not head:
        raise RuntimeError("Alembic has no current migration head.")
    version = Table(
        "alembic_version",
        MetaData(),
        Column("version_num", String(32), primary_key=True, nullable=False),
    )
    version.create(connection)
    connection.execute(version.insert().values(version_num=head))
    # SQLAlchemy 2 starts an implicit transaction for create_all/insert.
    # Commit the bootstrap before Alembic opens its own migration transaction;
    # otherwise SQLite keeps the DDL but rolls back the version stamp on close.
    connection.commit()


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        bootstrap_empty_database(connection)
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
        # Python 3.14's sqlite driver keeps batch-DDL and the Alembic version
        # update in an implicit transaction even though Alembic reports
        # non-transactional DDL. Commit it before closing the connection.
        if connection.in_transaction():
            connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
