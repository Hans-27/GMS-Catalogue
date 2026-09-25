"""Add the catalogue-owned product display name to an existing database."""

from sqlalchemy import inspect

from app.database import engine


def main() -> None:
    columns = {
        column["name"]
        for column in inspect(engine).get_columns("catalogue_entries")
    }
    if "display_name" not in columns:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "ALTER TABLE catalogue_entries "
                "ADD COLUMN display_name VARCHAR(255) NOT NULL DEFAULT ''"
            )
    print("display_name migration: OK")


if __name__ == "__main__":
    main()
