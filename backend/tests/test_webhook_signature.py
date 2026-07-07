"""Webhook signature verification must fail CLOSED (public write endpoint)."""

import hashlib
import hmac

import pytest

from stores.webhooks import _verify_signature

BODY = b'{"action":"completed"}'


def _sig(secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), BODY, hashlib.sha256).hexdigest()


def test_rejects_when_secret_unset(monkeypatch):
    monkeypatch.delenv("GITHUB_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("WEBHOOK_ALLOW_UNSIGNED", raising=False)
    assert _verify_signature(BODY, _sig("anything")) is False


def test_accepts_unsigned_only_with_explicit_dev_flag(monkeypatch):
    monkeypatch.delenv("GITHUB_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("WEBHOOK_ALLOW_UNSIGNED", "1")
    assert _verify_signature(BODY, "") is True


def test_accepts_valid_signature(monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "s3cret")
    monkeypatch.delenv("WEBHOOK_ALLOW_UNSIGNED", raising=False)
    assert _verify_signature(BODY, _sig("s3cret")) is True


def test_rejects_bad_signature(monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "s3cret")
    assert _verify_signature(BODY, _sig("wrong")) is False


def test_rejects_missing_signature_when_secret_set(monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "s3cret")
    assert _verify_signature(BODY, "") is False
