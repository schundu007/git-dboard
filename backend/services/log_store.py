from datetime import datetime, timedelta

from sqlalchemy import delete, select, func, cast, String, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models import LogEntry


def _default_slug() -> str:
    from config import settings
    return f"{settings.GH_OWNER}/{settings.GH_REPO}"


async def save_log(
    db: AsyncSession,
    source: str,
    run_id: str,
    level: str,
    message: str,
    meta: dict = {},
    repo_slug: str | None = None,
) -> None:
    if repo_slug:
        meta = {**meta, "repo": repo_slug}
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
    repo_slug: str | None = None,
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
    if repo_slug:
        repo_col = cast(func.json_extract(LogEntry.meta, "$.repo"), String)
        if repo_slug == _default_slug():
            # Default repo: include legacy logs with no repo tag
            q = q.where(or_(repo_col == repo_slug, repo_col.is_(None)))
        else:
            # Non-default repo: only show logs explicitly tagged for this repo
            q = q.where(repo_col == repo_slug)
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


async def run_has_logs(db: AsyncSession, run_id: str, repo_slug: str | None = None) -> bool:
    q = select(LogEntry.id).where(LogEntry.run_id == run_id)
    if repo_slug:
        repo_col = cast(func.json_extract(LogEntry.meta, "$.repo"), String)
        if repo_slug == _default_slug():
            q = q.where(or_(repo_col == repo_slug, repo_col.is_(None)))
        else:
            q = q.where(repo_col == repo_slug)
    q = q.limit(1)
    result = await db.execute(q)
    return result.scalar() is not None


async def purge_old_logs(db: AsyncSession, days: int = 30) -> int:
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(delete(LogEntry).where(LogEntry.timestamp < cutoff))
    await db.commit()
    return result.rowcount
