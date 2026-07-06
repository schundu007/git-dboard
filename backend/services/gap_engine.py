"""app/services/gap_engine.py

Scores CURRENT (GitHub repo files + live AWS) vs TARGET (target_model).
Repo status comes from GitPulse/GitHub via git-dboard's existing GitHub client;
this module only needs the repo file list + concatenated text, which the router
supplies. AWS current-state comes from aws_state.read_aws_state().
"""
from __future__ import annotations
import re
from typing import Any
from .target_model import TARGET, Check, categories
from .aws_state import read_aws_state


def _repo_ok(check: Check, files: list[str], text: str) -> bool | None:
    if not check.repo_detect:
        return None
    pat = check.repo_detect
    if re.search(pat, "\n".join(files)):
        return True
    if re.search(pat, text, re.M):
        return True
    return False


def _aws_ok(check: Check, aws: dict[str, Any]) -> bool | None:
    if not check.aws_detect or not aws.get("reachable"):
        return None
    v = aws.get(check.aws_detect)
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return v > 0
    return bool(v)


def score_check(check: Check, files: list[str], text: str, aws: dict) -> dict:
    repo = _repo_ok(check, files, text)
    live = _aws_ok(check, aws)
    # Decision matrix:
    #  repo defines it AND aws confirms it  -> OK
    #  repo defines, aws not yet / unknown  -> PARTIAL (coded, not provisioned)
    #  repo missing                         -> GAP
    if repo is False:
        status = "GAP"
    elif repo is True and live is True:
        status = "OK"
    elif repo is True and live is False:
        status = "PARTIAL"        # defined in IaC but not live in AWS
    elif repo is True and live is None:
        status = "OK"             # repo-only checks (e.g. workflow exists)
    else:
        status = "GAP"
    return {
        "id": check.id, "category": check.category, "title": check.title,
        "target": check.target, "fix": check.fix, "severity": check.severity,
        "status": status, "in_repo": repo, "in_aws": live,
    }


def run_gap(files: list[str], text: str, prefix: str = "myrock") -> dict:
    aws = read_aws_state(prefix)
    rows = [score_check(c, files, text, aws) for c in TARGET]
    total = len(rows)
    ok = sum(1 for r in rows if r["status"] == "OK")
    partial = sum(1 for r in rows if r["status"] == "PARTIAL")
    by_cat = {}
    for cat in categories():
        crows = [r for r in rows if r["category"] == cat]
        by_cat[cat] = {
            "ok": sum(1 for r in crows if r["status"] == "OK"),
            "total": len(crows),
        }
    return {
        "prefix": prefix,
        "aws": {"reachable": aws.get("reachable"), "account": aws.get("account"),
                "error": aws.get("error")},
        "score": {"ok": ok, "partial": partial, "total": total,
                  "pct": round(ok / total * 100) if total else 0},
        "by_category": by_cat,
        "checks": rows,
        # provisioning actions = the fixes for non-OK, high first
        "actions": [
            {"id": r["id"], "title": r["title"], "fix": r["fix"],
             "severity": r["severity"], "status": r["status"]}
            for r in sorted(rows, key=lambda r: (r["status"] == "PARTIAL", r["severity"] != "high"))
            if r["status"] != "OK"
        ],
    }
