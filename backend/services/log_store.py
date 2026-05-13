from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LogEntry


async def save_log(
    db: AsyncSession,
    source: str,
    run_id: str,
    level: str,
    message: str,
    meta: dict = {},
) -> None:
    entry = LogEntry(source=source, run_id=run_id, level=level, message=message, meta=meta)
    db.add(entry)
    await db.commit()


async def get_logs(
    db: AsyncSession,
    source: str | None = None,
    run_id: str | None = None,
    level: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> list[LogEntry]:
    q = select(LogEntry).order_by(LogEntry.timestamp.desc())
    if source:
        q = q.where(LogEntry.source == source)
    if run_id:
        q = q.where(LogEntry.run_id == run_id)
    if level:
        q = q.where(LogEntry.level == level)
    if search:
        q = q.where(LogEntry.message.ilike(f"%{search}%"))
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


async def run_has_logs(db: AsyncSession, run_id: str) -> bool:
    result = await db.execute(
        select(LogEntry.id).where(LogEntry.run_id == run_id).limit(1)
    )
    return result.scalar() is not None


async def purge_old_logs(db: AsyncSession, days: int = 30) -> int:
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(delete(LogEntry).where(LogEntry.timestamp < cutoff))
    await db.commit()
    return result.rowcount
