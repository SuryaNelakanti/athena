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

        # Add dataset_version column if missing.
        if not has_column(cur, "dataset_row", "dataset_version"):
            cur.execute("ALTER TABLE dataset_row ADD COLUMN dataset_version INTEGER DEFAULT 1")
            print("Added dataset_row.dataset_version")

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

        conn.commit()
    finally:
        conn.close()

    print("Migration complete.")


if __name__ == "__main__":
    main()

