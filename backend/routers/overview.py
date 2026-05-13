import asyncio
from datetime import datetime as _dt
from fastapi import APIRouter

from services import github_client as gh

router = APIRouter(prefix="/overview", tags=["overview"])


async def _safe(coro):
    try:
        return await coro
    except Exception:
        return None


def _fmt_dur(secs):
    if secs is None:
        return None
    if secs < 60:
        return f"{secs}s"
    return f"{secs // 60}m {secs % 60}s"


@router.get("/summary")
async def get_summary():
    prs_raw, builds_raw, nightly_raw, runners_raw, repo_raw, build_all_raw = await asyncio.gather(
        _safe(gh.get_prs(state="open", per_page=100)),
        _safe(gh.get_workflow_runs("postmerge-ci.yml", per_page=20)),
        # build.yml is the active per-PR/push CI (daily-compatibility.yml is disabled)
        _safe(gh.get_workflow_runs("build.yml", per_page=15)),
        _safe(gh.get_runners()),
        _safe(gh.get_repo_info()),
        _safe(gh.get_workflow_runs("build.yml", per_page=30)),
    )

    prs: list = prs_raw if isinstance(prs_raw, list) else []
    builds: list = (builds_raw or {}).get("workflow_runs", [])
    build_all: list = (build_all_raw or {}).get("workflow_runs", [])
    nightly: list = (nightly_raw or {}).get("workflow_runs", [])
    runners: list = (runners_raw or {}).get("runners", [])

    # ── Nightly: consecutive failures + failed jobs from latest run ──────────
    consec_fail = 0
    for n in nightly:
        if n.get("conclusion") == "failure":
            consec_fail += 1
        else:
            break

    # Fetch jobs for the latest nightly run to show which jobs failed
    nightly_failed_jobs: list[dict] = []
    if nightly:
        latest_nightly = nightly[0]
        if latest_nightly.get("conclusion") == "failure":
            try:
                jobs_data = await gh.get_run_jobs(latest_nightly["id"])
                for j in jobs_data.get("jobs", []):
                    if j.get("conclusion") == "failure":
                        failed_steps = [
                            s["name"] for s in j.get("steps", [])
                            if s.get("conclusion") == "failure"
                        ]
                        nightly_failed_jobs.append({
                            "job": j["name"],
                            "failed_steps": failed_steps[:3],
                            "url": j.get("html_url", ""),
                        })
            except Exception:
                pass

    # ── Builds: success rate + recent failed builds with detail ─────────────
    all_recent = builds[:20] + [b for b in build_all[:20] if b not in builds]
    all_recent.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    recent_failures: list[dict] = []
    for b in all_recent:
        if b.get("conclusion") in ("failure", "timed_out"):
            from datetime import datetime
            try:
                start = b.get("run_started_at") or b.get("created_at")
                end = b.get("updated_at")
                if start and end:
                    s = datetime.fromisoformat(start.replace("Z", "+00:00"))
                    e = datetime.fromisoformat(end.replace("Z", "+00:00"))
                    dur = max(0, int((e - s).total_seconds()))
                else:
                    dur = None
            except Exception:
                dur = None
            recent_failures.append({
                "id": b["id"],
                "title": b.get("display_title", b.get("name", ""))[:80],
                "branch": b.get("head_branch", ""),
                "sha": b.get("head_sha", "")[:7],
                "workflow": b.get("name", ""),
                "event": b.get("event", ""),
                "created_at": b.get("created_at"),
                "duration_label": _fmt_dur(dur),
                "url": b.get("html_url", ""),
                "actor": (b.get("actor") or {}).get("login", ""),
                "actor_avatar": (b.get("actor") or {}).get("avatar_url", ""),
            })
        if len(recent_failures) >= 8:
            break

    # Use build.yml (most active CI) for success-rate; fall back to postmerge-ci.yml
    ci_runs_for_rate = build_all[:10] if build_all else builds[:10]
    succeeded_10 = sum(1 for b in ci_runs_for_rate if b.get("conclusion") == "success")
    build_success_rate = round(succeeded_10 / min(10, len(ci_runs_for_rate)) * 100) if ci_runs_for_rate else 0

    # ── PRs: today count + attention items ────────────────────────────────────
    today_str = _dt.utcnow().strftime("%Y-%m-%d")
    prs_today = sum(1 for p in prs if p.get("created_at", "")[:10] == today_str)

    _CHECK_CATS = [
        ("lint", ["pre-commit", "lint", "format"]),
        ("docs", ["docs", "sphinx", "documentation"]),
        ("test", ["test", "pytest", "build"]),
    ]

    async def _pr_check_status(sha: str) -> dict:
        try:
            data = await gh.get_check_runs(sha)
            runs = data.get("check_runs", [])
            result: dict[str, str] = {}
            for cat, keywords in _CHECK_CATS:
                matching = [r for r in runs if any(kw in r["name"].lower() for kw in keywords)]
                if not matching:
                    result[cat] = "missing"
                elif any(r["conclusion"] == "failure" for r in matching):
                    result[cat] = "fail"
                elif any(r.get("status") in ("in_progress", "queued") for r in matching):
                    result[cat] = "pending"
                elif all(r.get("conclusion") == "success" for r in matching):
                    result[cat] = "pass"
                else:
                    result[cat] = "missing"
            return result
        except Exception:
            return {}

    attention_prs: list[dict] = []
    for pr in prs:
        reasons = []
        if pr.get("draft"):
            reasons.append("draft")
        reviewers = pr.get("requested_reviewers") or []
        if reviewers:
            reasons.append(f"{len(reviewers)} reviewer{'s' if len(reviewers)>1 else ''} requested")
        labels = [l["name"] for l in (pr.get("labels") or [])]
        if any("bug" in l.lower() or "critical" in l.lower() for l in labels):
            reasons.append("critical")
        attention_prs.append({
            "number": pr["number"],
            "title": pr["title"][:70],
            "author": (pr.get("user") or {}).get("login", ""),
            "avatar": (pr.get("user") or {}).get("avatar_url", ""),
            "branch": pr.get("head", {}).get("ref", ""),
            "base": pr.get("base", {}).get("ref", ""),
            "draft": pr.get("draft", False),
            "reviewers_requested": len(reviewers),
            "labels": labels[:3],
            "updated_at": pr.get("updated_at"),
            "url": pr.get("html_url", ""),
            "reasons": reasons,
            "_sha": pr.get("head", {}).get("sha", ""),
        })

    # Sort: non-draft with reviewers first
    attention_prs.sort(key=lambda x: (-x["reviewers_requested"], x["draft"]))

    # Fetch check statuses for top 4 PRs in parallel
    top_prs = attention_prs[:4]
    check_results = await asyncio.gather(
        *[_pr_check_status(p["_sha"]) for p in top_prs],
        return_exceptions=True,
    )
    for pr_item, checks in zip(top_prs, check_results):
        pr_item["lint_status"] = (checks or {}).get("lint", "missing")
        pr_item["docs_status"] = (checks or {}).get("docs", "missing")
        pr_item["test_status"] = (checks or {}).get("test", "missing")
        del pr_item["_sha"]
    for pr_item in attention_prs[4:]:
        pr_item.pop("_sha", None)
        pr_item["lint_status"] = "missing"
        pr_item["docs_status"] = "missing"
        pr_item["test_status"] = "missing"

    return {
        "prs": {
            "open": len(prs),
            "draft": sum(1 for p in prs if p.get("draft")),
            "ready": sum(1 for p in prs if not p.get("draft")),
            "review_requested": sum(1 for p in prs if p.get("requested_reviewers")),
            "prs_today": prs_today,
            "attention": attention_prs[:8],
        },
        "builds": {
            "total": (builds_raw or {}).get("total_count", 0),
            "in_progress": sum(1 for b in builds if b.get("status") == "in_progress"),
            "last_status": builds[0].get("conclusion") if builds else None,
            "last_branch": builds[0].get("head_branch") if builds else None,
            "success_rate_last10": build_success_rate,
            "recent_failures": recent_failures[:6],
            "recent": [
                {
                    "id": b["id"],
                    "status": b.get("conclusion") or b.get("status"),
                    "branch": b.get("head_branch"),
                    "title": b.get("display_title", "")[:60],
                    "created_at": b.get("created_at"),
                    "url": b.get("html_url"),
                }
                for b in builds[:5]
            ],
        },
        "nightly": {
            "last_status": nightly[0].get("conclusion") if nightly else None,
            "last_run_id": nightly[0].get("id") if nightly else None,
            "last_date": nightly[0].get("created_at", "")[:10] if nightly else None,
            "consecutive_failures": consec_fail,
            "total_runs": (nightly_raw or {}).get("total_count", 0),
            "failed_jobs": nightly_failed_jobs,
        },
        "runners": {
            "total": len(runners),
            "online": sum(1 for r in runners if r["status"] == "online"),
            "busy": sum(1 for r in runners if r.get("busy")),
            "offline": sum(1 for r in runners if r["status"] == "offline"),
            "access_denied": (runners_raw or {}).get("access_denied", False),
            "list": [
                {
                    "name": r["name"],
                    "status": r["status"],
                    "busy": r.get("busy", False),
                    "os": r.get("os", ""),
                    "labels": [l["name"] for l in r.get("labels", []) if l.get("type") == "custom"][:4],
                }
                for r in runners[:10]
            ],
        },
        "repo": {
            "name": (repo_raw or {}).get("full_name"),
            "default_branch": (repo_raw or {}).get("default_branch"),
            "open_issues": (repo_raw or {}).get("open_issues_count"),
            "stars": (repo_raw or {}).get("stargazers_count"),
            "forks": (repo_raw or {}).get("forks_count"),
            "language": (repo_raw or {}).get("language"),
            "updated_at": (repo_raw or {}).get("updated_at"),
        },
        "recent_activity": [
            {
                "type": "build",
                "status": b.get("conclusion") or b.get("status"),
                "title": b.get("display_title", "")[:60],
                "branch": b.get("head_branch"),
                "at": b.get("created_at"),
                "url": b.get("html_url"),
            }
            for b in builds[:4]
        ] + [
            {
                "type": "pr",
                "status": p.get("state"),
                "title": p.get("title", "")[:60],
                "branch": p.get("head", {}).get("ref"),
                "at": p.get("updated_at"),
                "url": p.get("html_url"),
            }
            for p in prs[:3]
        ],
    }
