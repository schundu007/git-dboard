import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from database import AsyncSessionLocal
from models import AISettings
from services.llm import PROVIDERS, ENV_KEY_MAP, get_settings

router = APIRouter(prefix="/ai", tags=["ai"])


class AIConfigUpdate(BaseModel):
    provider: str | None = None
    anthropic_key: str | None = None
    gemini_key: str | None = None
    deepseek_key: str | None = None
    cohere_key: str | None = None


def _mask(key: str | None) -> str | None:
    if not key:
        return None
    return key[:8] + "..." + key[-4:]


@router.get("/config")
async def get_config():
    row = await get_settings()
    providers = []
    for pid, meta in PROVIDERS.items():
        db_key = getattr(row, f"{pid}_key", None)
        env_key = os.environ.get(ENV_KEY_MAP[pid])
        providers.append({
            "id": pid,
            "name": meta["name"],
            "model": meta["model"],
            "has_key": bool(db_key or env_key),
            "key_source": "db" if db_key else ("env" if env_key else None),
            "masked_key": _mask(db_key or env_key),
        })
    return {"provider": row.provider or "anthropic", "providers": providers}


@router.post("/config")
async def update_config(body: AIConfigUpdate):
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(AISettings).where(AISettings.id == 1))
        if not row:
            row = AISettings(id=1)
            db.add(row)
        if body.provider is not None:
            if body.provider not in PROVIDERS:
                raise HTTPException(400, f"Unknown provider. Valid: {list(PROVIDERS)}")
            row.provider = body.provider
        for field in ("anthropic_key", "gemini_key", "deepseek_key", "cohere_key"):
            val = getattr(body, field)
            if val is not None:
                setattr(row, field, val.strip() or None)
        await db.commit()
    return {"ok": True, "provider": row.provider}


@router.get("/test")
async def test_ai():
    """Test the configured AI provider (a tiny real call) — for the UI 'Test' button."""
    from services import llm
    try:
        reply = await llm.call("Reply with the single word: OK", "connectivity test")
        return {"ok": True, "reply": (reply or "").strip()[:40]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
