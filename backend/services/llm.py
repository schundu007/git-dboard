import os
import httpx
from sqlalchemy import select
from database import AsyncSessionLocal
from models import AISettings

PROVIDERS = {
    "gemini":    {"name": "Gemini (Google)",    "model": "gemini-2.5-flash"},
    "deepseek":  {"name": "DeepSeek",           "model": "deepseek-chat"},
    "anthropic": {"name": "Claude (Anthropic)", "model": "claude-sonnet-5"},
}

# Tried in order — first provider with a key wins; falls back on error too.
# Claude (Anthropic) is the default/primary provider.
FALLBACK_ORDER = ["anthropic", "gemini", "deepseek"]

ENV_KEY_MAP = {
    "gemini":    "GEMINI_API_KEY",
    "deepseek":  "DEEPSEEK_API_KEY",
    "anthropic": "ANTHROPIC_GITPULSE_API_KEY",
}


async def get_settings() -> AISettings:
    async with AsyncSessionLocal() as db:
        row = await db.scalar(select(AISettings).where(AISettings.id == 1))
        if not row:
            row = AISettings(id=1, provider="anthropic")
            db.add(row)
            await db.commit()
            await db.refresh(row)
        return row


def _resolve_key(row: AISettings, provider: str) -> str | None:
    db_key = getattr(row, f"{provider}_key", None)
    return db_key or os.environ.get(ENV_KEY_MAP[provider])


async def call(prompt: str, system: str) -> str:
    row = await get_settings()
    primary = row.provider or "anthropic"

    # Build ordered list: primary first, then remaining fallbacks in order
    order = [primary] + [p for p in FALLBACK_ORDER if p != primary]

    last_error: Exception | None = None
    for provider in order:
        key = _resolve_key(row, provider)
        if not key:
            continue  # no key configured — skip silently
        try:
            return await _dispatch(prompt, system, provider, key)
        except Exception as exc:
            last_error = exc
            # try next provider

    if last_error:
        raise last_error
    raise ValueError("No AI provider keys configured. Set ANTHROPIC_GITPULSE_API_KEY (or add a key in Settings → AI Provider).")


async def _dispatch(prompt: str, system: str, provider: str, key: str) -> str:
    if provider == "anthropic":
        from anthropic import AsyncAnthropic
        msg = await AsyncAnthropic(api_key=key).messages.create(
            model=PROVIDERS["anthropic"]["model"], max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        # Newer models can return thinking blocks first — pick the text block(s).
        return "\n".join(b.text for b in msg.content if getattr(b, "type", None) == "text")

    if provider == "gemini":
        payload = {
            "model": PROVIDERS["gemini"]["model"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "max_tokens": 4096,
        }
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                json=payload, headers={"Authorization": f"Bearer {key}"},
            )
            r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    if provider == "deepseek":
        payload = {
            "model": PROVIDERS["deepseek"]["model"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "max_tokens": 4096,
        }
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post("https://api.deepseek.com/chat/completions", json=payload,
                             headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
            r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    raise ValueError(f"Unknown provider: {provider}")
