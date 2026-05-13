import asyncio
from fastapi import APIRouter
from services import github_client as gh

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/contributors")
async def contributors():
    # Use regular /contributors endpoint (instant) as primary source.
    # Enrich with weekly stats data if the stats cache is already warm.
    list_data, stats_data = await asyncio.gather(
        gh.get_contributors_list(),
        gh.get_contributor_stats(retries=1),  # non-blocking: return None if 202
        return_exceptions=True,
    )
    if isinstance(list_data, Exception) or not list_data:
        return {"contributors": [], "total": 0, "computing": False}

    # Build lookup from stats (weekly data) if available
    stats_by_login: dict = {}
    if isinstance(stats_data, list) and stats_data:
        for s in stats_data:
            author = s.get("author") or {}
            login = author.get("login", "")
            if login:
                weeks = s.get("weeks", [])
                recent = weeks[-26:] if len(weeks) >= 26 else weeks
                stats_by_login[login] = [
                    {"w": w["w"], "a": w["a"], "d": w["d"], "c": w["c"]} for w in recent
                ]

    has_weekly = bool(stats_by_login)
    result = []
    for c in list_data:
        login = c.get("login", "unknown")
        result.append({
            "login": login,
            "avatar_url": c.get("avatar_url"),
            "total": c.get("contributions", 0),
            "weeks": stats_by_login.get(login, []),
        })

    return {"contributors": result[:30], "total": len(result), "computing": False, "has_weekly": has_weekly}


@router.get("/commit-activity")
async def commit_activity():
    data = await gh.get_commit_activity()
    if data is None:
        return {"weeks": [], "computing": True}
    return {"weeks": data, "computing": len(data) == 0}


@router.get("/code-frequency")
async def code_frequency():
    data = await gh.get_code_frequency()
    if data is None:
        return {"weeks": [], "computing": True}
    result = [{"week": row[0], "additions": row[1], "deletions": abs(row[2])} for row in data]
    return {"weeks": result[-52:], "computing": len(result) == 0}


@router.get("/participation")
async def participation():
    data = await gh.get_participation()
    if data is None:
        return {"all": [], "owner": [], "computing": True}
    all_weeks = data.get("all", [])
    owner_weeks = data.get("owner", [])
    return {
        "all": all_weeks[-26:],
        "owner": owner_weeks[-26:],
        "computing": not data,
    }


@router.get("/forks")
async def forks(sort: str = "newest", page: int = 1):
    data = await gh.get_forks(sort=sort, per_page=30, page=page)
    result = []
    for f in data:
        result.append({
            "id": f["id"],
            "full_name": f["full_name"],
            "owner": {"login": f["owner"]["login"], "avatar_url": f["owner"]["avatar_url"]},
            "stars": f.get("stargazers_count", 0),
            "forks": f.get("forks_count", 0),
            "open_issues": f.get("open_issues_count", 0),
            "updated_at": f.get("updated_at"),
            "pushed_at": f.get("pushed_at"),
            "default_branch": f.get("default_branch", "main"),
            "html_url": f["html_url"],
        })
    return {"forks": result}


@router.get("/pulse")
async def pulse(period: str = "monthly"):
    """Aggregate activity stats: merged PRs, new PRs, opened/closed issues, commits."""
    repo_info, commit_activity, open_issues, closed_issues = await asyncio.gather(
        gh.get_repo_info(),
        gh.get_commit_activity(),
        gh.get_issues(state="open", per_page=100),
        gh.get_issues(state="closed", per_page=100),
    )

    recent_weeks = (commit_activity or [])[-4:]
    recent_commits = sum(w.get("total", 0) for w in recent_weeks)

    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    cutoff_s = cutoff.isoformat()

    new_issues = [i for i in open_issues if not i.get("pull_request") and i.get("created_at", "") >= cutoff_s]
    closed_recently = [i for i in closed_issues if not i.get("pull_request") and (i.get("closed_at") or "") >= cutoff_s]

    return {
        "stars": repo_info.get("stargazers_count", 0),
        "watchers": repo_info.get("subscribers_count", 0),
        "forks": repo_info.get("forks_count", 0),
        "open_issues": repo_info.get("open_issues_count", 0),
        "recent_commits": recent_commits,
        "new_issues_30d": len(new_issues),
        "closed_issues_30d": len(closed_recently),
        "default_branch": repo_info.get("default_branch", "main"),
        "description": repo_info.get("description", ""),
        "size_kb": repo_info.get("size", 0),
        "language": repo_info.get("language"),
    }
