from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    import models  # noqa: F401 — registers all ORM classes against Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add business_unit column if it doesn't exist (migration for existing DBs)
        try:
            await conn.exec_driver_sql(
                "ALTER TABLE repo_configs ADD COLUMN business_unit VARCHAR(100)"
            )
        except Exception:
            pass  # column already exists
