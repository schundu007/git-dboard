"""
Improvement plan router.

Repo-agnostic: the plan, issue analysis, and quick wins are derived live from
the currently active repository's open issues and pull requests. No repo-specific
sample data is hardcoded.
"""
from fastapi import APIRouter
from services import github_client as gh

router = APIRouter(prefix="/improvement", tags=["improvement"])


# ── Endpoints ─────────────────────────────────────────────────────────────────

async def _dynamic_plan(slug: str) -> dict:
    """Fetch real open issues/PRs from GitHub and build a lightweight plan."""
    issues_data = await gh.get_issues(state="open", per_page=50)
    prs_data = await gh.get_prs(state="open", per_page=50)
    issues = issues_data if isinstance(issues_data, list) else []
    prs = prs_data if isinstance(prs_data, list) else []
    bug_issues = [i for i in issues if any(l.get("name", "").lower() in ("bug", "bug report") for l in i.get("labels", []))]
    items = [
        {
            "id": f"issue-{i['number']}",
            "title": i["title"],
            "scope": "product",
            "priority": "high" if any(l.get("name", "").lower() in ("bug", "critical") for l in i.get("labels", [])) else "medium",
            "category": "reliability",
            "impact": "medium",
            "effort": "medium",
            "in_progress": False,
            "active_prs": [],
            "tags": [l.get("name", "") for l in i.get("labels", [])],
            "github_issues": [i["number"]],
            "problem": i.get("body", "")[:300] if i.get("body") else "",
            "root_causes": [],
            "actions": [f"Resolve issue #{i['number']}: {i['title']}"],
            "files": [],
            "estimated_savings": {},
        }
        for i in issues[:20]
    ]
    return {
        "summary": {
            "total_items": len(items),
            "infrastructure_items": 0,
            "product_items": len(items),
            "in_progress_items": 0,
            "infrastructure_counts": {"critical": 0, "high": 0, "medium": 0},
            "product_counts": {
                "critical": sum(1 for i in items if i["priority"] == "critical"),
                "high": sum(1 for i in items if i["priority"] == "high"),
                "medium": sum(1 for i in items if i["priority"] == "medium"),
            },
            "total_time_saved_per_run_min": 0,
            "github_issues_addressed": len(bug_issues),
            "active_prs_tracked": len(prs),
            "context": {
                "postmerge_pass_rate": None,
                "nightly_pass_rate": None,
                "total_open_issues": len(issues),
                "total_open_prs": len(prs),
                "note": f"Live data for {slug}",
            },
        },
        "items": items,
    }


@router.get("/plan")
async def get_improvement_plan():
    slug = gh.get_active_repo_slug()
    return await _dynamic_plan(slug)


@router.get("/issues-analysis")
async def get_issues_analysis():
    slug = gh.get_active_repo_slug()
    issues_data = await gh.get_issues(state="open", per_page=100)
    issues = issues_data if isinstance(issues_data, list) else []
    label_counts: dict[str, int] = {}
    for issue in issues:
        for label in issue.get("labels", []):
            name = label.get("name", "unknown")
            label_counts[name] = label_counts.get(name, 0) + 1
    return {
        "total_open": len(issues),
        "total_open_prs": 0,
        "source": f"live · {slug}",
        "fetched_at": "just now",
        "category_counts": {"product_bug": 0, "infrastructure": 0, "product_feature": 0, "other": len(issues)},
        "pr_category_counts": {},
        "label_counts": label_counts,
        "bugs": [],
        "features": [],
        "infra": [],
    }


@router.get("/quick-wins")
async def get_quick_wins():
    slug = gh.get_active_repo_slug()
    plan = await _dynamic_plan(slug)
    return {"items": [i for i in plan["items"] if i["impact"] in ("high", "medium")][:5]}
