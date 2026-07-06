"""
PR Automation service.

Runs as a background loop (or on-demand) over all open PRs and applies:
  1. Auto-label   — adds classification label based on changed file paths
  2. Auto-trigger — dispatches missing CI workflows
  3. Auto-comment — upserts a gate-status comment on each PR
  4. Auto-merge   — merges when gate passes + auto-merge label present

All actions are idempotent: running multiple times has the same effect as once.
"""

import asyncio
from datetime import datetime, timezone

from services import github_client as gh
from routers.prs import _classify_files, _evaluate_gate

# ── Label definitions ─────────────────────────────────────────────────────────
# Maps PR classification → GitHub label name + colour
CLASSIFICATION_LABELS: dict[str, tuple[str, str]] = {
    "docs":   ("documentation", "0075ca"),
    "tests":  ("testing",       "d4c5f9"),
    "source": ("enhancement",   "a2eeef"),
    "ci":     ("ci/cd",         "e4e669"),
}

# Runner recommendations per classification
RUNNER_RECOMMENDATIONS: dict[str, dict] = {
    "docs":   {"runner": "ubuntu-latest", "gpu": False, "reason": "Docs builds need no GPU; use cheap hosted runners"},
    "tests":  {"runner": "ubuntu-latest", "gpu": False, "reason": "Unit/CPU tests run fine on hosted runners"},
    "source": {"runner": "gpu",           "gpu": True,  "reason": "Source changes may need GPU smoke tests"},
    "ci":     {"runner": "ubuntu-latest", "gpu": False, "reason": "CI config changes only need lightweight validation"},
    "mixed":  {"runner": "gpu",           "gpu": True,  "reason": "Mixed changes — use GPU runner to be safe"},
}

GATE_COMMENT_MARKER = "<!-- gitpulse-gate-v1 -->"

# ── In-memory state ───────────────────────────────────────────────────────────
STATE: dict = {
    "enabled": False,
    "interval_minutes": 10,
    "last_run_at": None,
    "last_run_results": [],
    "running": False,
    "total_runs": 0,
    "actions_taken": 0,
}

_scheduler_task: asyncio.Task | None = None


# ── Comment builder ───────────────────────────────────────────────────────────

def _build_gate_comment(
    pr_number: int,
    classification: str,
    gate: dict,
    labels: list[str],
) -> str:
    verdict = gate.get("verdict", "pending")
    verdict_icon = {"success": "✅", "failure": "❌", "pending": "⏳", "skipped": "⏭️"}.get(verdict, "❓")
    verdict_text = {"success": "Gate passing", "failure": "Gate failing", "pending": "Awaiting checks", "skipped": "Skipped (skip-ci)"}.get(verdict, verdict)

    runner_rec = RUNNER_RECOMMENDATIONS.get(classification, RUNNER_RECOMMENDATIONS["mixed"])
    cat_results = gate.get("category_results", {})
    matched = gate.get("matched_checks", {})
    required = gate.get("required_categories", [])

    rows = []
    for cat in required:
        result = cat_results.get(cat, "missing")
        icon = {"success": "✅", "failure": "❌", "pending": "⏳", "missing": "⚪"}.get(result, "❓")
        checks = matched.get(cat, [])
        check_str = f"`{checks[0]}`" + (f" +{len(checks)-1}" if len(checks) > 1 else "") if checks else "_no matching check_"
        rows.append(f"| {icon} | **{cat}** | {result} | {check_str} |")

    table = "\n".join(rows) if rows else "_No checks required_"

    label_badges = " ".join(f"`{l}`" for l in labels[:6]) or "_none_"
    auto_merge_note = "\n> 🔀 **auto-merge** label detected — will merge automatically once gate passes." if "auto-merge" in labels else ""

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return f"""{GATE_COMMENT_MARKER}
## {verdict_icon} PR Gate — {verdict_text}

**Classification:** `{classification}` · **Labels:** {label_badges}{auto_merge_note}

| | Category | Status | Matched check |
|---|---|---|---|
{table}

**Runner recommendation:** `{runner_rec["runner"]}` {"🖥️ GPU" if runner_rec["gpu"] else "☁️ Hosted"} — {runner_rec["reason"]}

<sub>Updated by GitPulse · {now}</sub>
"""


async def _upsert_gate_comment(pr_number: int, body: str) -> None:
    """Update existing gate comment or create a new one."""
    comments = await gh.list_issue_comments(pr_number)
    for c in comments:
        if GATE_COMMENT_MARKER in (c.get("body") or ""):
            await gh.update_comment(c["id"], body)
            return
    await gh.create_comment(pr_number, body)


# ── Core automation pass ──────────────────────────────────────────────────────

async def _process_pr(pr: dict) -> dict:
    n = pr["number"]
    actions: list[dict] = []
    errors: list[str] = []

    labels = [l["name"] for l in pr.get("labels", [])]
    sha = pr["head"]["sha"]

    # 1. Classify by changed files
    try:
        files = await gh.get_pr_files(n)
        filenames = [f["filename"] for f in files]
        classification = _classify_files(filenames)
    except Exception as e:
        errors.append(f"classify: {e}")
        classification = "mixed"

    # 2. Auto-label
    label_name, label_color = CLASSIFICATION_LABELS.get(classification, ("", ""))
    if label_name and label_name not in labels:
        try:
            await gh.ensure_label_exists(label_name, label_color)
            await gh.add_label(n, label_name)
            labels.append(label_name)
            actions.append({"type": "labeled", "detail": label_name})
        except Exception as e:
            errors.append(f"label: {e}")

    # 3. Evaluate gate
    try:
        checks = await gh.get_check_runs(sha)
        gate = _evaluate_gate(classification, labels, checks.get("check_runs", []))
    except Exception as e:
        errors.append(f"gate: {e}")
        gate = {"verdict": "pending", "required_categories": [], "category_results": {}, "matched_checks": {}}

    # 4. Auto-trigger CI for missing check categories
    if gate.get("verdict") == "pending" and "skip-ci" not in labels:
        missing = [c for c, v in gate.get("category_results", {}).items() if v == "missing"]
        if "tests" in missing or "lint" in missing:
            try:
                ref = pr["head"]["ref"]
                await gh.trigger_workflow("build.yml", ref=ref)
                actions.append({"type": "triggered-ci", "detail": f"build.yml @ {ref}"})
            except Exception as e:
                errors.append(f"trigger: {e}")

    # 5. Auto-comment gate status
    try:
        body = _build_gate_comment(n, classification, gate, labels)
        await _upsert_gate_comment(n, body)
        actions.append({"type": "commented", "detail": gate.get("verdict", "?")})
    except Exception as e:
        errors.append(f"comment: {e}")

    # 6. Auto-merge if gate passes + auto-merge label
    if (gate.get("verdict") == "success"
            and "auto-merge" in labels
            and not pr.get("draft")
            and pr.get("mergeable") is not False):
        try:
            await gh.merge_pr(n, merge_method="squash")
            actions.append({"type": "merged", "detail": "squash merge"})
        except Exception as e:
            errors.append(f"merge: {e}")

    return {
        "pr_number": n,
        "title": pr["title"][:60],
        "classification": classification,
        "gate_verdict": gate.get("verdict", "?"),
        "actions": actions,
        "errors": errors,
    }


async def run_once() -> list[dict]:
    """Run one full automation pass. Updates STATE in place."""
    STATE["running"] = True
    results = []
    try:
        prs_data = await gh.get_prs(state="open", per_page=30)
        prs = prs_data if isinstance(prs_data, list) else []
        # Process PRs sequentially to avoid hammering the API
        for pr in prs[:20]:
            result = await _process_pr(pr)
            if result["actions"] or result["errors"]:
                results.append(result)
        STATE["total_runs"] += 1
        STATE["actions_taken"] += sum(len(r["actions"]) for r in results)
        STATE["last_run_at"] = datetime.now(timezone.utc).isoformat()
        STATE["last_run_results"] = results
    finally:
        STATE["running"] = False
    return results


# ── Background scheduler ──────────────────────────────────────────────────────

async def _scheduler_loop() -> None:
    while True:
        interval = STATE["interval_minutes"] * 60
        await asyncio.sleep(interval)
        if STATE["enabled"] and not STATE["running"]:
            try:
                await run_once()
            except Exception:
                pass


def start_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())


def stop_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None
