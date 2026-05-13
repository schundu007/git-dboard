"""
Analytics router — commit trends, contributor rankings, build failure rates,
PR velocity, nightly job failure analysis, and error pattern detection.
"""
import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services import github_client as gh
from services import log_store

router = APIRouter(prefix="/analytics", tags=["analytics"])

_POSTMERGE = "postmerge-ci.yml"
_BUILD = "build.yml"
_NIGHTLY = "daily-compatibility.yml"
_SKIP_JOBS = {"setup-versions", "notify-compatibility-status", "combine-compat-results"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _iso(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))


def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


# ── Commits & contributors ────────────────────────────────────────────────────

@router.get("/commits")
async def get_recent_commits(per_page: int = 50, author: Optional[str] = None):
    """Recent commits with author, message, sha, stats."""
    raw = await gh.get_commits(per_page=per_page, author=author)
    commits = []
    for c in raw:
        commits.append(
            {
                "sha": c["sha"][:7],
                "full_sha": c["sha"],
                "message": c["commit"]["message"].split("\n")[0][:120],
                "author": c["commit"]["author"]["name"],
                "author_login": (c.get("author") or {}).get("login", ""),
                "author_avatar": (c.get("author") or {}).get("avatar_url", ""),
                "date": c["commit"]["author"]["date"],
                "url": c["html_url"],
                "additions": (c.get("stats") or {}).get("additions", 0),
                "deletions": (c.get("stats") or {}).get("deletions", 0),
            }
        )
    return {"commits": commits, "total": len(commits)}


@router.get("/commit-activity")
async def get_commit_activity(days: int = 30):
    """
    Commits per day for the last N days derived from raw commit list.
    Falls back gracefully if GitHub stats API is still warming up.
    """
    days = min(max(days, 7), 180)
    since = _days_ago(days)
    raw = await gh.get_commits(per_page=100, since=since)

    by_day: dict[str, int] = defaultdict(int)
    by_author: dict[str, dict] = {}

    for c in raw:
        date = c["commit"]["author"]["date"][:10]
        by_day[date] += 1
        login = (c.get("author") or {}).get("login") or c["commit"]["author"]["name"]
        avatar = (c.get("author") or {}).get("avatar_url", "")
        if login not in by_author:
            by_author[login] = {"login": login, "avatar": avatar, "count": 0}
        by_author[login]["count"] += 1

    # Build full N-day series (fill zeros)
    series = []
    for i in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({"date": day, "commits": by_day.get(day, 0)})

    top_authors = sorted(by_author.values(), key=lambda x: x["count"], reverse=True)[:10]
    return {
        "series": series,
        "top_authors": top_authors,
        "total_commits": sum(by_day.values()),
        "days": days,
    }


@router.get("/contributors")
async def get_contributors():
    """
    Top contributors with weekly commit breakdown.
    Uses GitHub stats API with retry; falls back to raw commits.
    """
    stats = await gh.get_contributor_stats(retries=2)
    if stats:
        top = sorted(stats, key=lambda x: x["total"], reverse=True)[:15]
        return {
            "contributors": [
                {
                    "login": c["author"]["login"],
                    "avatar": c["author"]["avatar_url"],
                    "total": c["total"],
                    "url": f"https://github.com/{c['author']['login']}",
                    # last 4 weeks
                    "recent_weeks": c["weeks"][-4:] if c.get("weeks") else [],
                }
                for c in top
            ],
            "source": "stats_api",
        }

    # Fallback: raw commits
    raw = await gh.get_commits(per_page=100, since=_days_ago(90))
    by_login: dict[str, dict] = {}
    for c in raw:
        login = (c.get("author") or {}).get("login") or c["commit"]["author"]["name"]
        avatar = (c.get("author") or {}).get("avatar_url", "")
        if login not in by_login:
            by_login[login] = {"login": login, "avatar": avatar, "total": 0, "recent_weeks": [], "url": f"https://github.com/{login}"}
        by_login[login]["total"] += 1
    return {
        "contributors": sorted(by_login.values(), key=lambda x: x["total"], reverse=True)[:15],
        "source": "raw_commits_90d",
    }


# ── Build trends ──────────────────────────────────────────────────────────────

@router.get("/build-trends")
async def get_build_trends(days: int = 30):
    """
    Daily build success/failure counts for postmerge-ci.yml.
    Returns per-day breakdown + rolling 7-day success rate.
    """
    runs_data = await gh.get_workflow_runs(_POSTMERGE, per_page=100)
    runs = runs_data.get("workflow_runs", [])

    by_day: dict[str, dict] = {}
    since = datetime.now(timezone.utc) - timedelta(days=days)

    for r in runs:
        dt = _iso(r["created_at"])
        if dt < since:
            continue
        date = dt.strftime("%Y-%m-%d")
        if date not in by_day:
            by_day[date] = {"date": date, "success": 0, "failure": 0, "other": 0, "total": 0}
        c = r.get("conclusion") or r.get("status", "")
        by_day[date]["total"] += 1
        if c == "success":
            by_day[date]["success"] += 1
        elif c in ("failure", "timed_out"):
            by_day[date]["failure"] += 1
        else:
            by_day[date]["other"] += 1

    # Fill zeros + compute rate
    series = []
    for i in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        row = by_day.get(day, {"date": day, "success": 0, "failure": 0, "other": 0, "total": 0})
        rate = round(row["success"] / row["total"] * 100, 1) if row["total"] else None
        series.append({**row, "success_rate": rate})

    # Overall stats
    total = sum(r["total"] for r in series)
    succeeded = sum(r["success"] for r in series)
    return {
        "series": series,
        "summary": {
            "total_runs": total,
            "succeeded": succeeded,
            "failed": sum(r["failure"] for r in series),
            "success_rate": round(succeeded / total * 100, 1) if total else None,
        },
    }


# ── Nightly failure analysis ──────────────────────────────────────────────────

@router.get("/failure-analysis")
async def get_failure_analysis(runs: int = 30):
    """
    Per-job failure rate across the last N nightly runs.
    Returns ranked job list with failure %, consecutive failures, and trend.
    """
    data = await gh.get_workflow_runs(_NIGHTLY, per_page=min(runs * 2, 100))
    workflow_runs = data.get("workflow_runs", [])[:runs]

    async def fetch_jobs(run: dict):
        try:
            jd = await gh.get_run_jobs(run["id"])
            return run["created_at"][:10], jd.get("jobs", [])
        except Exception:
            return run["created_at"][:10], []

    results = await asyncio.gather(*[fetch_jobs(r) for r in workflow_runs])

    job_stats: dict[str, dict] = {}
    for date, jobs in results:
        for j in jobs:
            name = j["name"]
            if name in _SKIP_JOBS:
                continue
            if name not in job_stats:
                job_stats[name] = {
                    "name": name,
                    "total": 0,
                    "failed": 0,
                    "success": 0,
                    "history": [],  # newest first
                }
            conclusion = j.get("conclusion") or j.get("status", "unknown")
            job_stats[name]["total"] += 1
            if conclusion == "success":
                job_stats[name]["success"] += 1
            elif conclusion in ("failure", "timed_out"):
                job_stats[name]["failed"] += 1
            job_stats[name]["history"].append(
                {"date": date, "status": conclusion, "url": j.get("html_url", "")}
            )

    analysis = []
    for name, s in job_stats.items():
        rate = round(s["failed"] / s["total"] * 100, 1) if s["total"] else 0
        # Consecutive failures from most recent
        streak = 0
        for h in s["history"]:
            if h["status"] in ("failure", "timed_out"):
                streak += 1
            else:
                break
        analysis.append(
            {
                "name": name,
                "total": s["total"],
                "failed": s["failed"],
                "success": s["success"],
                "failure_rate": rate,
                "consecutive_failures": streak,
                "history": s["history"][:14],
            }
        )

    analysis.sort(key=lambda x: x["failure_rate"], reverse=True)
    return {"jobs": analysis, "runs_analysed": len(workflow_runs)}


# ── PR velocity ───────────────────────────────────────────────────────────────

@router.get("/pr-velocity")
async def get_pr_velocity(limit: int = 100):
    """
    PR merge time distribution: avg, median, p90, per-author breakdown,
    and weekly open-vs-merged trend.
    """
    closed = await gh.get_closed_prs(per_page=min(limit, 100))
    merged = [p for p in closed if p.get("merged_at")]

    durations_h = []
    by_author: dict[str, dict] = {}
    by_week: dict[str, dict] = defaultdict(lambda: {"opened": 0, "merged": 0})

    for p in merged:
        created = _iso(p["created_at"])
        merged_at = _iso(p["merged_at"])
        dur_h = (merged_at - created).total_seconds() / 3600
        durations_h.append(dur_h)

        week = created.strftime("%Y-%W")
        by_week[week]["merged"] += 1

        login = p["user"]["login"]
        if login not in by_author:
            by_author[login] = {
                "login": login,
                "avatar": p["user"]["avatar_url"],
                "merged": 0,
                "total_hours": 0.0,
            }
        by_author[login]["merged"] += 1
        by_author[login]["total_hours"] += dur_h

    # Open PRs by week
    open_prs = await gh.get_prs(state="open", per_page=100)
    for p in (open_prs if isinstance(open_prs, list) else []):
        week = _iso(p["created_at"]).strftime("%Y-%W")
        by_week[week]["opened"] += 1

    durations_h.sort()
    n = len(durations_h)
    avg = round(sum(durations_h) / n, 1) if n else None
    median = round(durations_h[n // 2], 1) if n else None
    p90 = round(durations_h[int(n * 0.9)], 1) if n else None

    author_list = [
        {
            **a,
            "avg_hours": round(a["total_hours"] / a["merged"], 1) if a["merged"] else 0,
        }
        for a in sorted(by_author.values(), key=lambda x: x["merged"], reverse=True)[:10]
    ]

    # Build weekly trend (last 12 weeks)
    weeks_sorted = sorted(by_week.keys())[-12:]
    weekly_trend = [{"week": w, **by_week[w]} for w in weeks_sorted]

    return {
        "summary": {
            "merged_count": n,
            "avg_hours": avg,
            "median_hours": median,
            "p90_hours": p90,
        },
        "top_authors": author_list,
        "weekly_trend": weekly_trend,
        # Distribution buckets: <1h, 1-8h, 8-24h, 1-3d, >3d
        "distribution": {
            "lt_1h": sum(1 for d in durations_h if d < 1),
            "1_to_8h": sum(1 for d in durations_h if 1 <= d < 8),
            "8_to_24h": sum(1 for d in durations_h if 8 <= d < 24),
            "1_to_3d": sum(1 for d in durations_h if 24 <= d < 72),
            "gt_3d": sum(1 for d in durations_h if d >= 72),
        },
    }


# ── Error pattern detection ───────────────────────────────────────────────────

@router.get("/error-patterns")
async def get_error_patterns(db: AsyncSession = Depends(get_db), limit: int = 200):
    """
    Scans the local log store for ERROR-level messages and returns
    the most frequent patterns (de-duplicated by first 80 chars).
    """
    entries = await log_store.get_logs(db, level="ERROR", limit=limit)

    pattern_counts: dict[str, dict] = {}
    for e in entries:
        key = e.message[:80].strip()
        if key not in pattern_counts:
            pattern_counts[key] = {
                "pattern": key,
                "count": 0,
                "sources": set(),
                "last_seen": e.timestamp.isoformat() if e.timestamp else None,
            }
        pattern_counts[key]["count"] += 1
        pattern_counts[key]["sources"].add(e.source)

    patterns = sorted(pattern_counts.values(), key=lambda x: x["count"], reverse=True)[:20]
    for p in patterns:
        p["sources"] = list(p["sources"])

    return {"patterns": patterns, "total_errors": len(entries)}


# ── User metrics leaderboard ──────────────────────────────────────────────────

@router.get("/user-metrics")
async def get_user_metrics(days: int = 30):
    """
    Aggregated per-user leaderboard: commits, PRs merged, avg merge time,
    PRs opened, build triggers, and review activity — all over `days` window.
    """
    days = min(max(days, 7), 180)
    since = _days_ago(days)

    commits_raw, closed_prs, build_runs, open_prs = await asyncio.gather(
        gh.get_commits(per_page=100, since=since),
        gh.get_closed_prs(per_page=100),
        gh.get_workflow_runs("postmerge-ci.yml", per_page=100),
        gh.get_prs(state="open", per_page=100),
    )

    users: dict[str, dict] = {}

    def _user(login: str, avatar: str = "", url: str = "") -> dict:
        if login not in users:
            users[login] = {
                "login": login,
                "avatar": avatar,
                "url": url or f"https://github.com/{login}",
                "commits": 0,
                "prs_merged": 0,
                "prs_open": 0,
                "merge_hours": [],
                "ci_triggers": 0,
            }
        if avatar and not users[login]["avatar"]:
            users[login]["avatar"] = avatar
        return users[login]

    # Commits
    for c in commits_raw:
        login = (c.get("author") or {}).get("login") or c["commit"]["author"]["name"]
        avatar = (c.get("author") or {}).get("avatar_url", "")
        _user(login, avatar)["commits"] += 1

    # Merged PRs (filter to window)
    since_dt = datetime.fromisoformat(since)
    for p in closed_prs:
        if not p.get("merged_at"):
            continue
        merged_dt = _iso(p["merged_at"])
        if merged_dt < since_dt:
            continue
        login = (p.get("user") or {}).get("login", "unknown")
        avatar = (p.get("user") or {}).get("avatar_url", "")
        u = _user(login, avatar)
        u["prs_merged"] += 1
        dur_h = (merged_dt - _iso(p["created_at"])).total_seconds() / 3600
        u["merge_hours"].append(round(dur_h, 1))

    # Open PRs
    for p in (open_prs if isinstance(open_prs, list) else []):
        login = (p.get("user") or {}).get("login", "unknown")
        avatar = (p.get("user") or {}).get("avatar_url", "")
        _user(login, avatar)["prs_open"] += 1

    # Build triggers
    for r in build_runs.get("workflow_runs", []):
        actor = (r.get("triggering_actor") or r.get("actor") or {})
        login = actor.get("login", "unknown")
        avatar = actor.get("avatar_url", "")
        _user(login, avatar)["ci_triggers"] += 1

    # Compute summary fields
    result = []
    for u in users.values():
        hours = u.pop("merge_hours")
        u["avg_merge_hours"] = round(sum(hours) / len(hours), 1) if hours else None
        u["score"] = u["commits"] * 3 + u["prs_merged"] * 5 + u["ci_triggers"]
        result.append(u)

    result.sort(key=lambda x: x["score"], reverse=True)
    return {
        "users": result[:20],
        "days": days,
        "total_users": len(result),
    }


# ── Branch statistics ─────────────────────────────────────────────────────────

@router.get("/branches")
async def get_branch_overview(limit: int = 15):
    """
    Active branches with: last commit info, # open PRs (from and to this branch),
    recent CI status, and commit count hint.
    Uses 3 parallel API calls and joins client-side — no per-branch round trips.
    """
    branches_raw, open_prs_raw, build_runs_raw, merged_prs_raw = await asyncio.gather(
        gh.get_branches(per_page=50),
        gh.get_prs(state="open", per_page=100),
        gh.get_workflow_runs("build.yml", per_page=100),
        gh.get_closed_prs(per_page=100),
    )

    open_prs: list = open_prs_raw if isinstance(open_prs_raw, list) else []
    merged_prs: list = [p for p in merged_prs_raw if p.get("merged_at")]
    build_runs: list = build_runs_raw.get("workflow_runs", [])

    # Index PRs by head branch (FROM) and base branch (TO)
    prs_from: dict[str, list] = {}
    prs_to: dict[str, list] = {}
    for pr in open_prs:
        head = pr.get("head", {}).get("ref", "")
        base = pr.get("base", {}).get("ref", "")
        prs_from.setdefault(head, []).append({"number": pr["number"], "title": pr["title"][:60]})
        prs_to.setdefault(base, []).append({"number": pr["number"], "title": pr["title"][:60]})

    # Index build runs by branch (first run per branch = latest)
    latest_run_by_branch: dict[str, dict] = {}
    for r in build_runs:
        branch = r.get("head_branch", "")
        if branch not in latest_run_by_branch:
            latest_run_by_branch[branch] = r

    # Index merged PRs by base branch (changelog)
    changelog_by_branch: dict[str, list] = {}
    for p in merged_prs[:50]:
        base = p.get("base", {}).get("ref", "")
        changelog_by_branch.setdefault(base, []).append({
            "number": p["number"],
            "title": p["title"][:80],
            "merged_at": p.get("merged_at", ""),
            "author": (p.get("user") or {}).get("login", ""),
            "avatar": (p.get("user") or {}).get("avatar_url", ""),
        })

    results = []
    for b in branches_raw:
        name = b["name"]
        sha = (b.get("commit") or {}).get("sha", "")
        short_sha = sha[:7]
        protected = b.get("protected", False)

        latest_run = latest_run_by_branch.get(name)
        ci_status = None
        ci_run_id = None
        ci_url = None
        if latest_run:
            ci_status = latest_run.get("conclusion") or latest_run.get("status")
            ci_run_id = latest_run.get("id")
            ci_url = latest_run.get("html_url")

        from_prs = prs_from.get(name, [])
        to_prs = prs_to.get(name, [])
        changelog = changelog_by_branch.get(name, [])[:5]

        results.append({
            "branch": name,
            "sha": short_sha,
            "full_sha": sha,
            "protected": protected,
            "prs_from": from_prs,   # open PRs whose head is this branch
            "prs_to": to_prs,       # open PRs targeting this branch as base
            "ci_status": ci_status,
            "ci_run_id": ci_run_id,
            "ci_url": ci_url,
            "changelog": changelog,  # recently merged PRs into this branch
            "active": bool(from_prs or to_prs or ci_run_id),
        })

    # Sort: branches with PRs first, then active, then alphabetical
    results.sort(key=lambda x: (-len(x["prs_from"]) - len(x["prs_to"]), x["branch"]))
    return {"branches": results[:limit], "total": len(results)}


@router.get("/branches/{branch:path}/commits")
async def get_branch_commits(branch: str, per_page: int = 15):
    """Recent commits for a specific branch."""
    commits = await gh.get_branch_commits(branch, per_page=per_page)
    result = []
    for c in commits:
        commit_data = c.get("commit", {})
        result.append({
            "sha": c.get("sha", "")[:7],
            "full_sha": c.get("sha", ""),
            "message": (commit_data.get("message") or "").split("\n")[0][:100],
            "author": (c.get("author") or {}).get("login") or commit_data.get("author", {}).get("name", ""),
            "avatar": (c.get("author") or {}).get("avatar_url", ""),
            "date": commit_data.get("author", {}).get("date", ""),
            "url": c.get("html_url", ""),
        })
    return {"commits": result, "branch": branch}
