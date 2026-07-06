import asyncio
import json
import time
import httpx
from pathlib import Path
from typing import Optional
from config import settings

_BASE = "https://api.github.com"

# ── Active repo override (set by /repos/{id}/activate) ───────────────────────
_active_owner: Optional[str] = None
_active_repo_name: Optional[str] = None
_active_pat: Optional[str] = None


def set_active_repo(owner: str, repo: str, pat: Optional[str] = None) -> None:
    global _active_owner, _active_repo_name, _active_pat
    _active_owner = owner
    _active_repo_name = repo
    _active_pat = pat or None
    _stats_mem.clear()
    _clear_workflow_cache()


def clear_active_repo() -> None:
    global _active_owner, _active_repo_name, _active_pat
    _active_owner = None
    _active_repo_name = None
    _active_pat = None
    _stats_mem.clear()
    _clear_workflow_cache()


def get_active_repo_slug() -> str:
    owner = _active_owner or settings.GH_OWNER
    repo = _active_repo_name or settings.GH_REPO
    return f"{owner}/{repo}"


def get_active_repo_parts() -> tuple[str, str]:
    """Return (owner, repo) for the currently active repository."""
    return (_active_owner or settings.GH_OWNER, _active_repo_name or settings.GH_REPO)


# ── Workflow detection cache ──────────────────────────────────────────────────
# Keyed by repo slug, invalidated when active repo changes.
_workflow_names_cache: dict[str, list[str]] = {}


def _clear_workflow_cache() -> None:
    _workflow_names_cache.clear()


async def get_repo_workflow_names() -> list[str]:
    """Return the list of workflow filenames for the active repo (cached per slug)."""
    slug = get_active_repo_slug()
    if slug in _workflow_names_cache:
        return _workflow_names_cache[slug]
    try:
        data = await get_workflows()
        names = [w.get("path", "").split("/")[-1] for w in data.get("workflows", [])]
    except Exception:
        names = []
    _workflow_names_cache[slug] = names
    return names


def _pick(*candidates: str, from_names: list[str]) -> str | None:
    """Return the first candidate that exists in the repo's workflow list."""
    for c in candidates:
        if c in from_names:
            return c
    return None


async def get_primary_workflows() -> dict[str, str | None]:
    """Return the best-match workflow filenames for CI, nightly, and publish for the active repo."""
    names = await get_repo_workflow_names()
    return {
        "ci": _pick(
            "postmerge-ci.yml", "ci.yml", "test.yml", "build.yml",
            "main.yml", "push.yml", "workflow.yml",
            from_names=names,
        ),
        "nightly": _pick(
            "nightly.yml", "daily-compatibility.yml", "daily.yml",
            "schedule.yml", "scheduled.yml", "cron.yml",
            from_names=names,
        ),
        "publish": _pick(
            "publish-images.yaml", "publish-images.yml", "release.yml",
            "publish.yml", "docker.yml", "docker-publish.yml",
            from_names=names,
        ),
        "all": names,
    }


# ── Stats cache ───────────────────────────────────────────────────────────────
# Two-layer cache: memory (fast, 1h TTL) + disk (survives restart, 24h TTL).
# GitHub Stats API returns 202 while computing; once fetched we persist to disk
# so subsequent restarts/202s still serve real data.
_stats_mem: dict[str, tuple[float, object]] = {}
_MEM_TTL = 3600.0
_DISK_TTL = 86400.0
_DISK_CACHE = Path(__file__).parent.parent / "stats_cache.json"


def _disk_load() -> dict:
    try:
        return json.loads(_DISK_CACHE.read_text())
    except Exception:
        return {}


def _disk_save(key: str, data: object) -> None:
    try:
        store = _disk_load()
        store[key] = {"ts": time.time(), "data": data}
        _DISK_CACHE.write_text(json.dumps(store))
    except Exception:
        pass


def _disk_get(key: str) -> object:
    store = _disk_load()
    entry = store.get(key)
    if entry and (time.time() - entry["ts"]) < _DISK_TTL:
        return entry["data"]
    return None


async def _get_cached_stat(path: str, retries: int = 3, sleep_s: float = 5.0) -> object:
    """Fetch a GitHub stats endpoint with two-layer cache + 202-retry logic.
    Returns None only when both caches are cold AND GitHub is still computing."""
    slug = _repo()
    url = f"{_BASE}/repos/{slug}{path}"
    key = f"{slug}:{path}"  # repo-scoped key so switching repos never serves stale data

    # 1. Memory cache (hot path)
    mem = _stats_mem.get(key)
    if mem and (time.monotonic() - mem[0]) < _MEM_TTL:
        return mem[1]

    # 2. Disk cache (survives restarts, serves stale-while-revalidate)
    disk = _disk_get(key)
    if disk is not None:
        _stats_mem[key] = (time.monotonic(), disk)  # promote to memory
        return disk

    # 3. GitHub API
    async with httpx.AsyncClient(timeout=15) as c:
        for _ in range(retries):
            r = await c.get(url, headers=_headers())
            if r.status_code == 200:
                data = r.json()
                _stats_mem[key] = (time.monotonic(), data)
                _disk_save(key, data)
                return data
            if r.status_code == 202:
                await asyncio.sleep(sleep_s)
    return None


def _headers() -> dict:
    token = _active_pat or settings.GH_PAT
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _repo() -> str:
    owner = _active_owner or settings.GH_OWNER
    repo = _active_repo_name or settings.GH_REPO
    return f"{owner}/{repo}"


async def get_prs(state: str = "open", per_page: int = 30, page: int = 1):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/pulls",
            headers=_headers(),
            params={"state": state, "per_page": per_page, "page": page},
        )
        r.raise_for_status()
        return r.json()


async def get_pr(pr_number: int):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{_BASE}/repos/{_repo()}/pulls/{pr_number}", headers=_headers())
        r.raise_for_status()
        return r.json()


async def get_check_runs(ref: str):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/commits/{ref}/check-runs",
            headers=_headers(),
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()


async def get_workflow_runs(
    workflow_id: str,
    per_page: int = 30,
    page: int = 1,
    branch: Optional[str] = None,
):
    params: dict = {"per_page": per_page, "page": page}
    if branch:
        params["branch"] = branch
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/workflows/{workflow_id}/runs",
            headers=_headers(),
            params=params,
        )
        # 404 means the workflow has never been run on this fork yet — return empty
        if r.status_code == 404:
            return {"total_count": 0, "workflow_runs": []}
        r.raise_for_status()
        return r.json()


async def get_run(run_id: int):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{_BASE}/repos/{_repo()}/actions/runs/{run_id}", headers=_headers())
        r.raise_for_status()
        return r.json()


async def get_run_jobs(run_id: int):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/runs/{run_id}/jobs",
            headers=_headers(),
            params={"filter": "all", "per_page": 100},
        )
        r.raise_for_status()
        return r.json()


async def get_job_logs(job_id: int) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/jobs/{job_id}/logs",
            headers=_headers(),
        )
        if r.status_code == 200:
            return r.text
        return ""


async def trigger_workflow(workflow_id: str, ref: str, inputs: dict = {}):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{_BASE}/repos/{_repo()}/actions/workflows/{workflow_id}/dispatches",
            headers=_headers(),
            json={"ref": ref, "inputs": inputs},
        )
        r.raise_for_status()


async def rerun_workflow(run_id: int):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{_BASE}/repos/{_repo()}/actions/runs/{run_id}/rerun",
            headers=_headers(),
        )
        r.raise_for_status()


async def get_runners():
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/runners",
            headers=_headers(),
        )
        if r.status_code == 403:
            return {
                "runners": [],
                "total_count": 0,
                "access_denied": True,
                "hint": "PAT needs 'manage_runners:repo' scope",
            }
        r.raise_for_status()
        return r.json()


async def get_pr_labels(pr_number: int):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/issues/{pr_number}/labels",
            headers=_headers(),
        )
        r.raise_for_status()
        return r.json()


async def merge_pr(pr_number: int, commit_title: str = "", merge_method: str = "squash"):
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.put(
            f"{_BASE}/repos/{_repo()}/pulls/{pr_number}/merge",
            headers=_headers(),
            json={"commit_title": commit_title, "merge_method": merge_method},
        )
        r.raise_for_status()
        return r.json()


async def get_workflows():
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{_BASE}/repos/{_repo()}/actions/workflows", headers=_headers(), params={"per_page": 100})
        r.raise_for_status()
        return r.json()


async def get_repo_info():
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{_BASE}/repos/{_repo()}", headers=_headers())
        r.raise_for_status()
        return r.json()


async def get_commits(
    per_page: int = 100,
    author: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    page: int = 1,
):
    params: dict = {"per_page": per_page, "page": page}
    if author:
        params["author"] = author
    if since:
        params["since"] = since
    if until:
        params["until"] = until
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{_BASE}/repos/{_repo()}/commits", headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


async def compare_commits(base: str, head: str, per_page: int = 250) -> dict:
    """GitHub compare API — commits in the range base..head (up to 250)."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/compare/{base}...{head}",
            headers=_headers(),
            params={"per_page": min(per_page, 250)},
        )
        r.raise_for_status()
        return r.json()


async def get_closed_prs(per_page: int = 100, page: int = 1) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/pulls",
            headers=_headers(),
            params={"state": "closed", "per_page": per_page, "page": page, "sort": "updated"},
        )
        r.raise_for_status()
        return r.json()


async def get_contributors_list(per_page: int = 100) -> list:
    """Regular contributors endpoint — returns immediately (no 202 delay)."""
    results = []
    for page in range(1, 4):  # up to 300 contributors
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{_BASE}/repos/{_repo()}/contributors",
                headers=_headers(),
                params={"per_page": per_page, "page": page, "anon": "false"},
            )
            if r.status_code != 200:
                break
            batch = r.json()
            results.extend(batch)
            if len(batch) < per_page:
                break
    return results


async def get_contributor_stats(retries: int = 3) -> list | None:
    return await _get_cached_stat("/stats/contributors", retries=retries)


async def get_pr_reviews(pr_number: int) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/pulls/{pr_number}/reviews",
            headers=_headers(),
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()


async def get_pr_files(pr_number: int) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/pulls/{pr_number}/files",
            headers=_headers(),
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()


async def get_run_artifacts(run_id: int) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/runs/{run_id}/artifacts",
            headers=_headers(),
        )
        r.raise_for_status()
        return r.json()


async def cancel_run(run_id: int) -> bool:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{_BASE}/repos/{_repo()}/actions/runs/{run_id}/cancel",
            headers=_headers(),
        )
        return r.status_code in (202, 200)


async def rerun_failed_jobs(run_id: int) -> None:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{_BASE}/repos/{_repo()}/actions/runs/{run_id}/rerun-failed-jobs",
            headers=_headers(),
        )
        r.raise_for_status()


async def _compute_commit_activity() -> list:
    """Compute 52-week commit activity from the commits API (no 202 issue)."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    since = (now - timedelta(weeks=53)).isoformat()
    commits = []
    async with httpx.AsyncClient(timeout=20) as c:
        for page in range(1, 20):  # up to 1900 commits
            r = await c.get(
                f"{_BASE}/repos/{_repo()}/commits",
                headers=_headers(),
                params={"since": since, "per_page": 100, "page": page},
            )
            if r.status_code != 200:
                break
            batch = r.json()
            if not batch:
                break
            commits.extend(batch)
            if len(batch) < 100:
                break

    weekly: dict[int, int] = {}
    for commit in commits:
        date_str = (commit.get("commit") or {}).get("author", {}).get("date") or ""
        if not date_str:
            continue
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        # Snap to Sunday (GitHub convention)
        week_start = dt - timedelta(days=(dt.weekday() + 1) % 7)
        week_ts = int(week_start.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc).timestamp())
        weekly[week_ts] = weekly.get(week_ts, 0) + 1

    result = [{"week": ts, "total": count, "days": [0] * 7} for ts, count in sorted(weekly.items())]
    if result:
        _disk_save("/stats/commit_activity", result)
        _stats_mem["/stats/commit_activity"] = (time.monotonic(), result)
    return result


async def get_commit_activity(retries: int = 3) -> list | None:
    cached = await _get_cached_stat("/stats/commit_activity", retries=retries)
    if cached is not None:
        return cached
    return await _compute_commit_activity()


async def get_branches(per_page: int = 50) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/branches",
            headers=_headers(),
            params={"per_page": per_page},
        )
        r.raise_for_status()
        return r.json()


async def get_branch_commits(branch: str, per_page: int = 10) -> list:
    """Commits on a specific branch (using sha= param)."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/commits",
            headers=_headers(),
            params={"sha": branch, "per_page": per_page},
        )
        r.raise_for_status()
        return r.json()


async def get_all_runs(
    per_page: int = 50,
    page: int = 1,
    branch: Optional[str] = None,
    event: Optional[str] = None,
    status: Optional[str] = None,
    actor: Optional[str] = None,
) -> dict:
    """All workflow runs across every workflow, with multi-filter support."""
    params: dict = {"per_page": per_page, "page": page}
    if branch:
        params["branch"] = branch
    if event:
        params["event"] = event
    if status:
        params["status"] = status
    if actor:
        params["actor"] = actor
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/runs",
            headers=_headers(),
            params=params,
        )
        r.raise_for_status()
        return r.json()


async def get_caches(per_page: int = 100, ref: Optional[str] = None, key: Optional[str] = None) -> dict:
    params: dict = {"per_page": per_page}
    if ref:
        params["ref"] = ref
    if key:
        params["key"] = key
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/caches",
            headers=_headers(),
            params=params,
        )
        r.raise_for_status()
        return r.json()


async def delete_cache(cache_id: int) -> bool:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.delete(
            f"{_BASE}/repos/{_repo()}/actions/caches/{cache_id}",
            headers=_headers(),
        )
        return r.status_code in (200, 204)


async def get_deployments(
    per_page: int = 30,
    environment: Optional[str] = None,
    ref: Optional[str] = None,
    page: int = 1,
) -> list:
    params: dict = {"per_page": per_page, "page": page}
    if environment:
        params["environment"] = environment
    if ref:
        params["ref"] = ref
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/deployments",
            headers=_headers(),
            params=params,
        )
        r.raise_for_status()
        return r.json()


async def get_deployment_statuses(deployment_id: int) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/deployments/{deployment_id}/statuses",
            headers=_headers(),
            params={"per_page": 5},
        )
        r.raise_for_status()
        return r.json()


async def get_environments() -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/environments",
            headers=_headers(),
            params={"per_page": 100},
        )
        if r.status_code in (403, 404, 422):
            return {"environments": [], "total_count": 0}
        r.raise_for_status()
        return r.json()


async def get_workflow_timing(workflow_id: str) -> dict:
    """Returns billable minutes for a workflow."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/workflows/{workflow_id}/timing",
            headers=_headers(),
        )
        if r.status_code in (404, 422, 403):
            return {}
        r.raise_for_status()
        return r.json()


async def get_issues(
    state: str = "open",
    labels: Optional[str] = None,
    assignee: Optional[str] = None,
    milestone: Optional[str] = None,
    per_page: int = 30,
    page: int = 1,
) -> list:
    params: dict = {"state": state, "per_page": per_page, "page": page}
    if labels:
        params["labels"] = labels
    if assignee:
        params["assignee"] = assignee
    if milestone:
        params["milestone"] = milestone
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/issues",
            headers=_headers(),
            params=params,
        )
        r.raise_for_status()
        return r.json()


async def get_issue_labels() -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/labels",
            headers=_headers(),
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()


async def get_milestones(state: str = "open") -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/milestones",
            headers=_headers(),
            params={"state": state, "per_page": 30},
        )
        r.raise_for_status()
        return r.json()


async def _compute_code_frequency() -> list:
    """Compute weekly additions/deletions from individual commit stats (no 202 issue)."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    since = (now - timedelta(weeks=53)).isoformat()
    sha_list = []
    async with httpx.AsyncClient(timeout=20) as c:
        for page in range(1, 20):
            r = await c.get(
                f"{_BASE}/repos/{_repo()}/commits",
                headers=_headers(),
                params={"since": since, "per_page": 100, "page": page},
            )
            if r.status_code != 200:
                break
            batch = r.json()
            if not batch:
                break
            for commit in batch:
                sha_list.append((commit["sha"], (commit.get("commit") or {}).get("author", {}).get("date") or ""))
            if len(batch) < 100:
                break

    weekly: dict[int, list[int]] = {}
    async with httpx.AsyncClient(timeout=20) as c:
        for sha, date_str in sha_list:
            if not date_str:
                continue
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            week_start = dt - timedelta(days=(dt.weekday() + 1) % 7)
            week_ts = int(week_start.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc).timestamp())
            if week_ts not in weekly:
                weekly[week_ts] = [0, 0]
            r = await c.get(f"{_BASE}/repos/{_repo()}/commits/{sha}", headers=_headers())
            if r.status_code == 200:
                stats = r.json().get("stats", {})
                weekly[week_ts][0] += stats.get("additions", 0)
                weekly[week_ts][1] += stats.get("deletions", 0)

    # Match GitHub Stats API format: [timestamp, additions, -deletions]
    result = [[ts, v[0], -v[1]] for ts, v in sorted(weekly.items())]
    if result:
        _disk_save("/stats/code_frequency", result)
        _stats_mem["/stats/code_frequency"] = (time.monotonic(), result)
    return result


async def get_code_frequency(retries: int = 3) -> list | None:
    cached = await _get_cached_stat("/stats/code_frequency", retries=retries)
    if cached is not None:
        return cached
    return await _compute_code_frequency()


async def get_forks(sort: str = "newest", per_page: int = 30, page: int = 1) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/forks",
            headers=_headers(),
            params={"sort": sort, "per_page": per_page, "page": page},
        )
        r.raise_for_status()
        return r.json()


async def get_participation(retries: int = 3) -> dict | None:
    return await _get_cached_stat("/stats/participation", retries=retries)


# ── PR automation helpers ─────────────────────────────────────────────────────

async def add_label(pr_number: int, label: str) -> None:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{_BASE}/repos/{_repo()}/issues/{pr_number}/labels",
            headers=_headers(),
            json={"labels": [label]},
        )
        r.raise_for_status()


async def set_labels(pr_number: int, labels: list[str]) -> None:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.put(
            f"{_BASE}/repos/{_repo()}/issues/{pr_number}/labels",
            headers=_headers(),
            json={"labels": labels},
        )
        r.raise_for_status()


async def list_issue_comments(pr_number: int) -> list:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/issues/{pr_number}/comments",
            headers=_headers(),
            params={"per_page": 100},
        )
        r.raise_for_status()
        return r.json()


async def create_comment(pr_number: int, body: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{_BASE}/repos/{_repo()}/issues/{pr_number}/comments",
            headers=_headers(),
            json={"body": body},
        )
        r.raise_for_status()
        return r.json()


async def update_comment(comment_id: int, body: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.patch(
            f"{_BASE}/repos/{_repo()}/issues/comments/{comment_id}",
            headers=_headers(),
            json={"body": body},
        )
        r.raise_for_status()
        return r.json()


async def ensure_label_exists(name: str, color: str = "ededed", description: str = "") -> None:
    """Create label if it doesn't already exist."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{_BASE}/repos/{_repo()}/labels/{name}", headers=_headers())
        if r.status_code == 200:
            return
        await c.post(
            f"{_BASE}/repos/{_repo()}/labels",
            headers=_headers(),
            json={"name": name, "color": color, "description": description},
        )


async def get_live_runs(per_page: int = 20) -> list:
    """Fetch currently in-progress workflow runs with their active jobs."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"{_BASE}/repos/{_repo()}/actions/runs",
            headers=_headers(),
            params={"status": "in_progress", "per_page": per_page},
        )
        if r.status_code != 200:
            return []
        runs = r.json().get("workflow_runs", [])

    async def _jobs_for(run: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as c2:
                jr = await c2.get(
                    f"{_BASE}/repos/{_repo()}/actions/runs/{run['id']}/jobs",
                    headers=_headers(),
                    params={"filter": "latest", "per_page": 30},
                )
                jobs = jr.json().get("jobs", []) if jr.status_code == 200 else []
        except Exception:
            jobs = []

        active_jobs = [
            {
                "id": j["id"],
                "name": j["name"],
                "status": j["status"],
                "runner_name": j.get("runner_name"),
                "labels": j.get("labels", []),
                "started_at": j.get("started_at"),
            }
            for j in jobs
            if j.get("status") in ("in_progress", "queued")
        ]
        return {
            "id": run["id"],
            "name": run["name"],
            "display_title": run.get("display_title", run["name"]),
            "workflow": run.get("path", "").split("/")[-1],
            "branch": run.get("head_branch", ""),
            "actor": run.get("triggering_actor", {}).get("login", ""),
            "created_at": run.get("created_at", ""),
            "updated_at": run.get("updated_at", ""),
            "html_url": run.get("html_url", ""),
            "active_jobs": active_jobs,
            "total_jobs": len(jobs),
        }

    results = await asyncio.gather(*[_jobs_for(r) for r in runs[:8]])
    return list(results)
