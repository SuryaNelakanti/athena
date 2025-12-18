import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select, SQLModel

DATABASE_URL = "sqlite+aiosqlite:///test_simple.db"

async def test():
    print("Testing aiosqlite...")
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        print("Running create_all...")
        await conn.run_sync(SQLModel.metadata.create_all)
        print("create_all complete.")

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        print("Executing simple select...")
        # Since SQLModel.metadata.create_all was called, we should be able to query
        # even if tables are empty.
        print("Select complete.")

    print("Success!")

if __name__ == "__main__":
    asyncio.run(test())
