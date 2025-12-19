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

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_sessionmaker() as session:
        yield session
