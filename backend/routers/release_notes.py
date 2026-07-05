"""Release-notes generation — list merged PRs between two commits, categorized.

Mirrors TheRock HUD's Release Notes: paste two commit SHAs, we resolve every PR
merged in that range (via the GitHub compare API) and bucket each into a category
using an ordered rule chain (first match wins).
"""
import asyncio
import re
from fastapi import APIRouter, HTTPException, Query

from services import github_client as gh

router = APIRouter(prefix="/release-notes", tags=["release-notes"])

# PR references inside commit messages: squash "(#123)" or merge "Merge pull request #123".
_PR_RE = re.compile(r"#(\d+)")

# Ordered category buckets (render order + empty-section suppression happens client-side).
CATEGORY_ORDER = [
    "Breaking", "Features", "Fixes", "Documentation",
    "CI/Build", "Dependencies", "Refactor", "Internal", "Other",
]


def _categorize(title: str, labels: list[str]) -> str:
    """Rule chain, first match wins — mirrors TheRock HUD's 5 rules."""
    t = title.strip()
    tl = t.lower()
    lset = {l.lower() for l in labels}

    # 1. GitHub label match
    if lset & {"breaking", "breaking-change", "breaking change"}:
        return "Breaking"
    if lset & {"bug", "fix"}:
        return "Fixes"
    if lset & {"feature", "enhancement", "feat"}:
        return "Features"
    if lset & {"documentation", "docs"}:
        return "Documentation"
    if lset & {"dependencies", "dependency", "deps"}:
        return "Dependencies"

    # 2. Conventional-commit prefix (feat:, fix:, docs:, chore:, ci:, refactor:)
    m = re.match(r"^(\w+)(\([^)]*\))?!?:", tl)
    if m:
        kind = m.group(1)
        conv = {
            "feat": "Features", "fix": "Fixes", "docs": "Documentation",
            "chore": "Internal", "ci": "CI/Build", "build": "CI/Build",
            "refactor": "Refactor", "perf": "Internal", "test": "Internal",
            "style": "Internal", "revert": "Fixes",
        }
        if kind in conv:
            return conv[kind]

    # 3. Bracket prefix ([CI], [docs], [bump], ...)
    b = re.match(r"^\[(\w+)\]", tl)
    if b:
        tag = b.group(1)
        bracket = {
            "ci": "CI/Build", "build": "CI/Build", "docs": "Documentation",
            "bump": "Dependencies", "deps": "Dependencies", "fix": "Fixes",
            "feat": "Features", "feature": "Features",
        }
        if tag in bracket:
            return bracket[tag]

    # 4. Verb-start heuristic
    first = tl.split(" ", 1)[0]
    verb = {
        "add": "Features", "added": "Features", "implement": "Features",
        "introduce": "Features", "support": "Features",
        "fix": "Fixes", "fixed": "Fixes", "correct": "Fixes", "resolve": "Fixes",
        "refactor": "Refactor", "rework": "Refactor", "cleanup": "Refactor",
        "bump": "Dependencies", "update": "Dependencies", "upgrade": "Dependencies",
        "remove": "Internal", "delete": "Internal", "document": "Documentation",
    }
    if first in verb:
        return verb[first]

    # 5. Fallback
    return "Other"


@router.get("/generate")
async def generate(
    base: str = Query(..., description="Older commit SHA (7+ hex chars)"),
    head: str = Query(..., description="Newer commit SHA (7+ hex chars)"),
):
    base, head = base.strip(), head.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", base) or not re.fullmatch(r"[0-9a-fA-F]{7,40}", head):
        raise HTTPException(400, "Provide two commit SHAs (7+ hex chars).")

    try:
        cmp = await gh.compare_commits(base, head)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"GitHub compare failed — check the SHAs and their order (older…newer). {e}")

    commits = cmp.get("commits", [])

    # Collect PR numbers from commit subjects, preserving first-seen order.
    pr_nums: list[int] = []
    seen: set[int] = set()
    for cm in commits:
        subject = (cm.get("commit", {}).get("message") or "").split("\n", 1)[0]
        for m in _PR_RE.findall(subject):
            n = int(m)
            if n not in seen:
                seen.add(n)
                pr_nums.append(n)

    async def _fetch(n: int):
        try:
            return await gh.get_pr(n)
        except Exception:  # noqa: BLE001
            return None

    # Bound the fan-out; only keep genuinely-merged PRs.
    raw = await asyncio.gather(*[_fetch(n) for n in pr_nums[:300]])
    prs = [p for p in raw if p and p.get("merged_at")]

    buckets: dict[str, list] = {c: [] for c in CATEGORY_ORDER}
    for p in prs:
        labels = [l.get("name", "") for l in (p.get("labels") or [])]
        cat = _categorize(p.get("title", ""), labels)
        buckets[cat].append({
            "number": p.get("number"),
            "title": p.get("title", ""),
            "url": p.get("html_url"),
            "author": (p.get("user") or {}).get("login"),
            "labels": labels,
            "merged_at": p.get("merged_at"),
        })

    categories = [
        {"name": c, "prs": buckets[c]} for c in CATEGORY_ORDER if buckets[c]
    ]

    return {
        "base": base,
        "head": head,
        "compare_url": cmp.get("html_url"),
        "total_commits": cmp.get("total_commits", len(commits)),
        "pr_count": len(prs),
        "categories": categories,
    }
