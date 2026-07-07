"""
Analytics data store layer.

Abstracts over GitHub live API vs. ClickHouse warehouse.
New endpoints use AnalyticsStore; legacy endpoints gradually migrate.
"""

import asyncio
from typing import Optional

from .base import AnalyticsStore
from .clickhouse_store import ClickHouseStore

__all__ = ["AnalyticsStore", "ClickHouseStore", "get_store"]

_store: Optional[ClickHouseStore] = None
_store_lock = asyncio.Lock()


async def get_store() -> ClickHouseStore:
    """Return the process-wide ClickHouse store, connecting once (race-safe)."""
    global _store
    if _store is None:
        async with _store_lock:
            if _store is None:
                s = ClickHouseStore()
                await s.connect()
                _store = s
    return _store
