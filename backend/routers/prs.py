import asyncio
import re
from fastapi import APIRouter, HTTPException
from typing import Optional

from services import github_client as gh

router = APIRouter(prefix="/prs", tags=["prs"])

# ── PR classifier ─────────────────────────────────────────────────────────────
# Maps file paths → category.  Order matters: first match wins per file.
_FILE_PATTERNS: list[tuple[str, list[str]]] = [
    ('docs',   [r'^docs/', r'\.rst$', r'\.md$', r'^CHANGELOG', r'^README']),
    ('tests',  [r'^tests/', r'_test\.py$', r'^test_', r'/test_']),
    ('source', [r'^source/', r'\.py$', r'\.cpp$', r'\.cu$', r'\.h$', r'\.hpp$']),
    ('ci',     [r'^\.github/', r'^docker/', r'Dockerfile', r'\.yml$', r'\.yaml$',
                r'requirements.*\.txt$', r'setup\.(py|cfg)$', r'pyproject\.toml$']),
]

def _classify_files(filenames: list[str]) -> str:
    categories: set[str] = set()
    for fname in filenames:
        matched = False
        for cat, patterns in _FILE_PATTERNS:
            if any(re.search(p, fname) for p in patterns):
                categories.add(cat)
                matched = True
                break
        if not matched:
            categories.add('mixed')
    if len(categories) == 1:
        return next(iter(categories))
    return 'mixed'

# Keyword patterns used to bucket real check-run names → category
_CHECK_PATTERNS: dict[str, list[str]] = {
    'lint':    [r'pre.?commit', r'\blint\b', r'flake', r'ruff', r'pylint', r'style'],
    'tests':   [r'\btest', r'pytest', r'postmerge', r'ci.*run', r'\bbuild\b'],
    'docs':    [r'\bdoc', r'sphinx', r'link.?check', r'mkdocs'],
    'license': [r'licen[sc]e', r'copyright', r'spdx'],
}

def _evaluate_gate(
    classification: str,
    labels: list[str],
    check_runs: list[dict],
) -> dict:
    if 'skip-ci' in labels:
        return {'verdict': 'skipped', 'reason': 'skip-ci label',
                'required_categories': [], 'category_results': {}}
    if 'wip' in labels:
        return {'verdict': 'pending', 'reason': 'WIP draft',
                'required_categories': [], 'category_results': {}}

    # Required categories by classification + label overrides
    if 'docs-only' in labels or classification == 'docs':
        required = ['docs', 'license']
    elif classification == 'ci':
        required = ['lint', 'license']
    elif classification == 'tests':
        required = ['lint', 'tests', 'license']
    else:  # source or mixed
        required = ['lint', 'tests', 'docs', 'license']

    if 'skip-tests' in labels and 'tests' in required:
        required.remove('tests')

    # Build a name → conclusion map from actual check runs
    check_map: dict[str, str] = {}
    for run in check_runs:
        name = run.get('name', '')
        check_map[name] = run.get('conclusion') or run.get('status', 'pending')

    # Score each required category
    category_results: dict[str, str] = {}
    matched_checks: dict[str, list[tuple[str, str]]] = {}  # cat → [(name, conclusion)]
    for cat in required:
        hits = [
            (n, c) for n, c in check_map.items()
            if any(re.search(p, n, re.IGNORECASE) for p in _CHECK_PATTERNS.get(cat, []))
        ]
        matched_checks[cat] = hits
        if not hits:
            category_results[cat] = 'missing'
        elif any(c == 'failure' for _, c in hits):
            category_results[cat] = 'failure'
        elif any(c in ('queued', 'in_progress', 'waiting', 'pending') for _, c in hits):
            category_results[cat] = 'pending'
        else:
            category_results[cat] = 'success'

    verdicts = list(category_results.values())
    if any(v == 'failure' for v in verdicts):
        overall = 'failure'
    elif any(v in ('pending', 'missing') for v in verdicts):
        overall = 'pending'
    else:
        overall = 'success'

    return {
        'verdict': overall,
        'required_categories': required,
        'category_results': category_results,
        'matched_checks': {cat: [n for n, _ in hits] for cat, hits in matched_checks.items()},
        'auto_merge': 'auto-merge' in labels,
        'skip_tests': 'skip-tests' in labels,
        'reason': None,
    }


@router.get("")
async def list_prs(state: str = "open", per_page: int = 30, page: int = 1):
    return await gh.get_prs(state=state, per_page=per_page, page=page)


@router.get("/repo-permissions")
async def get_repo_permissions():
    info = await gh.get_repo_info()
    perms = info.get("permissions", {})
    return {
        "can_push": perms.get("push", False),
        "can_admin": perms.get("admin", False),
        "can_triage": perms.get("triage", False),
        "can_maintain": perms.get("maintain", False),
        "read_only": not perms.get("push", False),
    }


@router.get("/gate-overview")
async def get_gate_overview():
    """Lightweight gate verdict for all open PRs using check runs + labels (no file fetch)."""
    data = await gh.get_prs(state="open", per_page=50)
    prs = data if isinstance(data, list) else []

    async def _eval_one(pr: dict) -> dict | None:
        try:
            sha = pr["head"]["sha"]
            checks = await gh.get_check_runs(sha)
            labels = [lbl["name"] for lbl in pr.get("labels", [])]
            # Without fetching files, use labels to infer classification
            if 'docs-only' in labels:
                classification = 'docs'
            elif 'skip-ci' in labels:
                classification = 'mixed'
            else:
                classification = 'mixed'
            gate = _evaluate_gate(classification, labels, checks.get("check_runs", []))
            return {
                "pr_number": pr["number"],
                "title": pr["title"][:70],
                "verdict": gate["verdict"],
                "classification": classification,
                "draft": pr.get("draft", False),
                "labels": labels,
            }
        except Exception:
            return None

    results = await asyncio.gather(*[_eval_one(pr) for pr in prs[:30]])
    items = [r for r in results if r is not None]
    return {
        "prs": items,
        "summary": {
            "success": sum(1 for r in items if r["verdict"] == "success"),
            "failure": sum(1 for r in items if r["verdict"] == "failure"),
            "pending": sum(1 for r in items if r["verdict"] == "pending"),
            "skipped": sum(1 for r in items if r["verdict"] == "skipped"),
        },
    }


@router.get("/stats")
async def get_pr_stats():
    data = await gh.get_prs(state="open", per_page=100)
    prs = data if isinstance(data, list) else []
    by_base: dict[str, int] = {}
    for pr in prs:
        base = pr.get("base", {}).get("ref", "unknown")
        by_base[base] = by_base.get(base, 0) + 1
    return {
        "open": len(prs),
        "draft": sum(1 for p in prs if p.get("draft")),
        "ready": sum(1 for p in prs if not p.get("draft")),
        "review_requested": sum(1 for p in prs if p.get("requested_reviewers")),
        "has_conflicts": sum(1 for p in prs if p.get("mergeable_state") in ("dirty", "conflicting")),
        "by_base_branch": by_base,
    }


@router.get("/{pr_number}")
async def get_pr(pr_number: int):
    return await gh.get_pr(pr_number)


@router.get("/{pr_number}/checks")
async def get_pr_checks(pr_number: int):
    pr = await gh.get_pr(pr_number)
    sha = pr["head"]["sha"]
    return await gh.get_check_runs(sha)


@router.get("/{pr_number}/reviews")
async def get_pr_reviews(pr_number: int):
    reviews = await gh.get_pr_reviews(pr_number)
    # Deduplicate: keep latest review state per user
    by_user: dict[str, dict] = {}
    for r in reviews:
        login = r["user"]["login"]
        by_user[login] = {
            "login": login,
            "avatar": r["user"]["avatar_url"],
            "state": r["state"],
            "submitted_at": r.get("submitted_at"),
            "url": r.get("html_url", ""),
            "body": (r.get("body") or "")[:200],
        }
    return {
        "reviews": list(by_user.values()),
        "approved": sum(1 for v in by_user.values() if v["state"] == "APPROVED"),
        "changes_requested": sum(1 for v in by_user.values() if v["state"] == "CHANGES_REQUESTED"),
        "commented": sum(1 for v in by_user.values() if v["state"] == "COMMENTED"),
    }


@router.get("/{pr_number}/files")
async def get_pr_files(pr_number: int):
    files = await gh.get_pr_files(pr_number)
    return {
        "files": [
            {
                "filename": f["filename"],
                "status": f["status"],
                "additions": f.get("additions", 0),
                "deletions": f.get("deletions", 0),
                "changes": f.get("changes", 0),
                "blob_url": f.get("blob_url", ""),
            }
            for f in files
        ],
        "total": len(files),
    }


@router.get("/{pr_number}/gate")
async def get_pr_gate(pr_number: int):
    """Classify the PR by changed files and evaluate its gate status against real check runs."""
    pr, files_raw = await asyncio.gather(
        gh.get_pr(pr_number),
        gh.get_pr_files(pr_number),
    )
    sha = pr["head"]["sha"]
    checks = await gh.get_check_runs(sha)

    filenames = [f["filename"] for f in files_raw]
    labels = [lbl["name"] for lbl in pr.get("labels", [])]
    check_runs = checks.get("check_runs", [])

    classification = _classify_files(filenames)
    gate = _evaluate_gate(classification, labels, check_runs)

    return {
        "pr_number": pr_number,
        "classification": classification,
        "labels": labels,
        "file_count": len(filenames),
        "check_count": len(check_runs),
        "head_sha": sha[:8],
        "gate": gate,
    }


@router.get("/{pr_number}/labels")
async def get_pr_labels(pr_number: int):
    return await gh.get_pr_labels(pr_number)


@router.get("/{pr_number}/summary")
async def get_pr_summary(pr_number: int):
    pr, perms = await asyncio.gather(
        gh.get_pr(pr_number),
        gh.get_repo_info(),
    )
    sha = pr["head"]["sha"]
    checks = await gh.get_check_runs(sha)
    runs = checks.get("check_runs", [])
    failed = [r for r in runs if r.get("conclusion") == "failure"]
    pending = [r for r in runs if r.get("status") in ("queued", "in_progress")]
    can_push = perms.get("permissions", {}).get("push", False)
    return {
        "pr": pr,
        "checks": {
            "total": len(runs),
            "failed": len(failed),
            "pending": len(pending),
            "passed": len(runs) - len(failed) - len(pending),
            "all_passed": len(runs) > 0 and len(failed) == 0 and len(pending) == 0,
            "runs": runs,
        },
        "can_merge": can_push and not pr.get("draft") and pr.get("mergeable") is not False,
    }


@router.post("/{pr_number}/merge")
async def merge_pr(pr_number: int, merge_method: str = "squash"):
    try:
        return await gh.merge_pr(pr_number, merge_method=merge_method)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pr_number}/trigger-ci")
async def trigger_ci_for_pr(pr_number: int):
    try:
        pr = await gh.get_pr(pr_number)
        ref = pr["head"]["ref"]
        await gh.trigger_workflow("build.yml", ref=ref)
        return {"status": "triggered", "branch": ref, "pr": pr_number}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
