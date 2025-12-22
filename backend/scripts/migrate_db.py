import sqlite3
from pathlib import Path

from sqlmodel import SQLModel
from sqlalchemy import create_engine

from app import models  # noqa: F401


def has_column(cursor: sqlite3.Cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def main() -> None:
    db_path = Path(__file__).resolve().parents[1] / "athena.db"
    if not db_path.exists():
        print(f"Database not found at {db_path}")
        return

    # Create new tables if missing.
    engine = create_engine(f"sqlite:///{db_path}")
    SQLModel.metadata.create_all(engine)

    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()

        # Dataset columns
        if not has_column(cur, "dataset", "kind"):
            cur.execute("ALTER TABLE dataset ADD COLUMN kind TEXT DEFAULT 'eval'")
            print("Added dataset.kind")
        if not has_column(cur, "dataset", "schema"):
            cur.execute("ALTER TABLE dataset ADD COLUMN schema TEXT DEFAULT '{}'")
            print("Added dataset.schema")
        if not has_column(cur, "dataset", "schema_version"):
            cur.execute("ALTER TABLE dataset ADD COLUMN schema_version INTEGER DEFAULT 1")
            print("Added dataset.schema_version")
        if not has_column(cur, "dataset", "review_policy"):
            cur.execute("ALTER TABLE dataset ADD COLUMN review_policy TEXT DEFAULT '{}'")
            print("Added dataset.review_policy")

        # Add dataset_version column if missing.
        if not has_column(cur, "dataset_row", "dataset_version"):
            cur.execute("ALTER TABLE dataset_row ADD COLUMN dataset_version INTEGER DEFAULT 1")
            print("Added dataset_row.dataset_version")

        # Dataset row columns
        if not has_column(cur, "dataset_row", "row_kind"):
            cur.execute("ALTER TABLE dataset_row ADD COLUMN row_kind TEXT DEFAULT 'eval'")
            print("Added dataset_row.row_kind")
        if not has_column(cur, "dataset_row", "eval_label"):
            cur.execute("ALTER TABLE dataset_row ADD COLUMN eval_label TEXT")
            print("Added dataset_row.eval_label")

        # Backfill dataset_version for existing rows.
        cur.execute(
            """
            UPDATE dataset_row
            SET dataset_version = (
                SELECT dataset.version FROM dataset WHERE dataset.id = dataset_row.dataset_id
            )
            WHERE dataset_version IS NULL OR dataset_version = 0
            """
        )

        # Backfill dataset defaults.
        cur.execute(
            """
            UPDATE dataset
            SET kind = 'eval'
            WHERE kind IS NULL OR kind = ''
            """
        )
        cur.execute(
            """
            UPDATE dataset
            SET schema_version = 1
            WHERE schema_version IS NULL OR schema_version = 0
            """
        )
        cur.execute(
            """
            UPDATE dataset
            SET review_policy = '{}'
            WHERE review_policy IS NULL OR review_policy = ''
            """
        )

        # Backfill dataset row defaults.
        cur.execute(
            """
            UPDATE dataset_row
            SET row_kind = 'eval'
            WHERE row_kind IS NULL OR row_kind = ''
            """
        )
        cur.execute(
            """
            UPDATE dataset_row
            SET eval_label = COALESCE(example_type, 'gold')
            WHERE eval_label IS NULL OR eval_label = ''
            """
        )

        conn.commit()
    finally:
        conn.close()

    print("Migration complete.")


if __name__ == "__main__":
    main()
