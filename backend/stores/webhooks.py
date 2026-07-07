"""
GitHub webhook receiver for CI events.

Verifies HMAC signature (X-Hub-Signature-256), parses events, ingests to ClickHouse.
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Request, HTTPException

from . import get_store
from .parse import parse_workflow_run, parse_workflow_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_signature(body: bytes, signature: str) -> bool:
    """Verify GitHub webhook X-Hub-Signature-256 (fail closed).

    The endpoint is public and writes to the warehouse, so an unsigned or
    unverifiable request must be REJECTED. Unsigned requests are only accepted
    when WEBHOOK_ALLOW_UNSIGNED=1 is explicitly set (local dev) — never in prod.
    """
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "").encode()
    if not secret:
        if os.getenv("WEBHOOK_ALLOW_UNSIGNED") == "1":
            logger.warning("WEBHOOK_ALLOW_UNSIGNED=1 — accepting UNVERIFIED webhook")
            return True
        logger.error("GITHUB_WEBHOOK_SECRET unset — rejecting webhook (fail closed)")
        return False

    if not signature:
        return False

    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


@router.post("/github")
async def webhook_github(request: Request) -> dict[str, str]:
    """
    GitHub webhook receiver.
    
    Handles: workflow_run, workflow_job events.
    Verifies HMAC; ignores if signature invalid.
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not _verify_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    event_type = request.headers.get("X-GitHub-Event", "")
    payload = json.loads(body)
    store = await get_store()

    if event_type == "workflow_run":
        await _handle_workflow_run(store, payload)
    elif event_type == "workflow_job":
        await _handle_workflow_job(store, payload)

    return {"status": "accepted"}


async def _handle_workflow_run(store, payload: dict[str, Any]) -> None:
    """Ingest workflow_run event."""
    action = payload.get("action", "")
    if action not in ("requested", "completed"):
        return

    await store.ingest_workflow_run(parse_workflow_run(payload))


async def _handle_workflow_job(store, payload: dict[str, Any]) -> None:
    """Ingest workflow_job event."""
    action = payload.get("action", "")
    if action not in ("completed", "in_progress"):
        return

    await store.ingest_job(parse_workflow_job(payload))
