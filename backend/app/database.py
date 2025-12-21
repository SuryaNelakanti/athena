from typing import AsyncGenerator
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite+aiosqlite:///athena.db"

engine = create_async_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})

async_sessionmaker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Alias for direct context manager usage
AsyncSessionLocal = async_sessionmaker

async def init_db():
    async with engine.begin() as conn:
        # await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
        await _ensure_log_columns(conn)


async def _ensure_log_columns(conn) -> None:
    result = await conn.exec_driver_sql("PRAGMA table_info(log)")
    columns = {row[1] for row in result.fetchall()}
    if "status" not in columns:
        await conn.exec_driver_sql("ALTER TABLE log ADD COLUMN status TEXT")
    if "event_type" not in columns:
        await conn.exec_driver_sql("ALTER TABLE log ADD COLUMN event_type TEXT")

    result = await conn.exec_driver_sql("PRAGMA table_info(log)")
    columns = {row[1] for row in result.fetchall()}
    if "level" in columns:
        await conn.exec_driver_sql(
            "UPDATE log "
            "SET status = CASE WHEN level = 'ERROR' THEN 'error' ELSE 'success' END "
            "WHERE status IS NULL"
        )

    await conn.exec_driver_sql(
        "UPDATE log "
        "SET event_type = CASE "
        "WHEN message LIKE 'LLM stream call%' THEN 'llm_stream' "
        "WHEN message LIKE 'LLM call%' THEN 'llm_call' "
        "ELSE 'custom' "
        "END "
        "WHERE event_type IS NULL"
    )

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_sessionmaker() as session:
        yield session
