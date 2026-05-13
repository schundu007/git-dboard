import asyncio
from fastapi import APIRouter
from services import github_client as gh

router = APIRouter(prefix="/issues", tags=["issues"])


@router.get("")
async def list_issues(
    state: str = "open",
    labels: str = "",
    assignee: str = "",
    milestone: str = "",
    per_page: int = 30,
    page: int = 1,
):
    issues = await gh.get_issues(
        state=state,
        labels=labels or None,
        assignee=assignee or None,
        milestone=milestone or None,
        per_page=per_page,
        page=page,
    )
    # Filter out pull requests (GitHub issues API returns PRs too)
    issues = [i for i in issues if not i.get("pull_request")]
    result = []
    for i in issues:
        result.append({
            "number": i["number"],
            "title": i["title"],
            "state": i["state"],
            "body": (i.get("body") or "")[:300],
            "labels": [{"name": l["name"], "color": l["color"], "description": l.get("description")} for l in i.get("labels", [])],
            "assignees": [{"login": a["login"], "avatar_url": a["avatar_url"]} for a in i.get("assignees", [])],
            "milestone": {"title": i["milestone"]["title"], "number": i["milestone"]["number"]} if i.get("milestone") else None,
            "comments": i.get("comments", 0),
            "created_at": i["created_at"],
            "updated_at": i["updated_at"],
            "closed_at": i.get("closed_at"),
            "user": {"login": i["user"]["login"], "avatar_url": i["user"]["avatar_url"]} if i.get("user") else None,
            "html_url": i["html_url"],
            "reactions": {
                "total_count": i.get("reactions", {}).get("total_count", 0),
                "+1": i.get("reactions", {}).get("+1", 0),
            },
        })
    return result


@router.get("/stats")
async def issue_stats():
    open_issues, closed_issues, labels, milestones = await asyncio.gather(
        gh.get_issues(state="open", per_page=100),
        gh.get_issues(state="closed", per_page=100),
        gh.get_issue_labels(),
        gh.get_milestones(state="open"),
    )
    # Filter out PRs
    open_issues = [i for i in open_issues if not i.get("pull_request")]
    closed_issues = [i for i in closed_issues if not i.get("pull_request")]

    # Seed counts from all defined labels (so 0-use labels still appear)
    label_counts: dict = {
        l["name"]: {"name": l["name"], "color": l["color"], "count": 0}
        for l in labels
    }
    # Tally open-issue usage
    for i in open_issues:
        for l in i.get("labels", []):
            name = l["name"]
            if name not in label_counts:
                label_counts[name] = {"name": name, "color": l["color"], "count": 0}
            label_counts[name]["count"] += 1
    top_labels = sorted(label_counts.values(), key=lambda x: -x["count"])

    # Milestone progress
    milestone_stats = []
    for m in milestones:
        total = m.get("open_issues", 0) + m.get("closed_issues", 0)
        pct = round(m.get("closed_issues", 0) / total * 100) if total > 0 else 0
        milestone_stats.append({
            "number": m["number"],
            "title": m["title"],
            "state": m["state"],
            "open_issues": m.get("open_issues", 0),
            "closed_issues": m.get("closed_issues", 0),
            "total": total,
            "pct": pct,
            "due_on": m.get("due_on"),
            "html_url": m.get("html_url"),
        })

    return {
        "open_count": len(open_issues),
        "closed_count": len(closed_issues),
        "label_count": len(labels),
        "top_labels": top_labels,
        "milestones": milestone_stats,
    }


@router.get("/labels")
async def list_labels():
    labels = await gh.get_issue_labels()
    return [{"name": l["name"], "color": l["color"], "description": l.get("description", "")} for l in labels]


@router.get("/milestones")
async def list_milestones(state: str = "open"):
    return await gh.get_milestones(state=state)
