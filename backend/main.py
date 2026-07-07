import asyncio
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()  # loads all .env vars into os.environ before boto3 initialises

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from database import init_db, AsyncSessionLocal
from routers import analytics, ai_config, automation, builds, gap, groups, health_analysis, improvement, infra, issues, insights, logs, nightly, overview, provision, prs, registry, release_notes, repos, security, tags
from stores import webhooks as ch_webhooks, ci_router as ch_ci
from services import github_client as gh
from services import log_store
from services import pr_automation

logger = logging.getLogger("auto_ingest")

import os as _os, re as _re
_extra = [o.strip() for o in _os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
CORS_ORIGINS = [f"http://localhost:{p}" for p in range(5173, 5180)] + ["http://localhost:3000", "https://gitpulser.vercel.app"] + _extra
# Allow the Vercel production domain AND dynamic preview subdomains (*.vercel.app).
CORS_ORIGIN_REGEX = r"https://([a-z0-9-]+\.)*vercel\.app"


def _cors_allowed(origin: str) -> bool:
    return bool(origin) and (origin in CORS_ORIGINS or _re.match(CORS_ORIGIN_REGEX, origin) is not None)

AUTO_INGEST_INTERVAL = 300  # seconds between polls


async def _ingest_run(run_id: int) -> int:
    """Ingest all job logs for a single GHA run into the DB. Returns line count."""
    repo_slug = gh.get_active_repo_slug()
    async with AsyncSessionLocal() as db:
        if await log_store.run_has_logs(db, str(run_id), repo_slug=repo_slug):
            return 0
        jobs_data = await gh.get_run_jobs(run_id)
        count = 0
        for job in jobs_data.get("jobs", []):
            raw = await gh.get_job_logs(job["id"])
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                low = line.lower()
                level = "ERROR" if "error" in low else "WARNING" if "warn" in low else "INFO"
                await log_store.save_log(db, "gha", str(run_id), level, line, {"job": job["name"]}, repo_slug=repo_slug)
                count += 1
    return count


async def _warm_stats_cache():
    """Keep retrying GitHub stats endpoints until all are cached.
    Stats API returns 202 while computing; for large repos this can take many minutes."""
    await asyncio.sleep(5)
    pending = {
        "contributors": gh.get_contributor_stats,
        "commit_activity": gh.get_commit_activity,
        "code_frequency": gh.get_code_frequency,
        "participation": gh.get_participation,
    }
    logger.info("Pre-warming GitHub stats cache for: %s", list(pending))
    while pending:
        for name in list(pending):
            try:
                result = await pending[name](retries=1)
                if result is not None:
                    del pending[name]
                    logger.info("Stats cached: %s (%d remaining)", name, len(pending))
            except Exception as exc:
                logger.warning("Stats warm-up error for %s: %s", name, exc)
        if pending:
            await asyncio.sleep(20)
    logger.info("All GitHub stats cached.")


async def _warm_ai_digest():
    """Pre-compute the 7-day AI weekly digest for the active repo shortly after
    boot so the Summary page's first load is instant (served from cache)."""
    await asyncio.sleep(30)
    try:
        from routers import nightly
        slug = gh.get_active_repo_slug() or "default"
        nightly._AI_DIGEST_CACHE[(slug, 7)] = await nightly._generate_ai_digest(7)
        logger.info("AI weekly digest pre-warmed for %s", slug)
    except Exception as exc:
        logger.warning("AI digest warm-up failed: %s", exc)


async def _auto_ingest_loop():
    """Background task: every AUTO_INGEST_INTERVAL seconds, pull logs for new completed runs."""
    await asyncio.sleep(10)  # small delay to let the app fully start
    while True:
        try:
            wf_map = await gh.get_primary_workflows()
            workflows = [w for w in [wf_map["ci"], wf_map["nightly"]] if w]
            for workflow in workflows:
                data = await gh.get_workflow_runs(workflow, per_page=10)
                for run in data.get("workflow_runs", []):
                    if run.get("status") != "completed":
                        continue
                    run_id = run["id"]
                    ingested = await _ingest_run(run_id)
                    if ingested:
                        logger.info("Auto-ingested %d lines from run %s (%s)", ingested, run_id, workflow)
        except Exception as exc:
            logger.warning("Auto-ingest error: %s", exc)
        await asyncio.sleep(AUTO_INGEST_INTERVAL)


async def _restore_active_repo():
    """On startup, re-apply any DB-persisted active repo to the github_client override."""
    from sqlalchemy import select
    from models import RepoConfig
    async with AsyncSessionLocal() as db:
        r = (await db.execute(
            select(RepoConfig).where(RepoConfig.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if r:
            gh.set_active_repo(r.owner, r.repo, r.gh_pat or None)
            logger.info("Restored active repo: %s/%s", r.owner, r.repo)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _restore_active_repo()
    try:
        from routers.provision import _apply_aws_creds
        await _apply_aws_creds()  # apply UI-stored AWS creds to the process env
    except Exception as exc:
        logger.warning("apply AWS creds: %s", exc)
    ingest_task = asyncio.create_task(_auto_ingest_loop())
    asyncio.create_task(_warm_stats_cache())
    asyncio.create_task(_warm_ai_digest())
    pr_automation.start_scheduler()  # starts paused (enabled=False by default)
    yield
    ingest_task.cancel()
    pr_automation.stop_scheduler()
    try:
        await ingest_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="GitPulse API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return JSON errors with CORS headers so the browser can read them."""
    origin = request.headers.get("origin", "")
    headers = {}
    if _cors_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers=headers,
    )

app.include_router(ai_config.router)
app.include_router(overview.router)
app.include_router(analytics.router)
app.include_router(automation.router)
app.include_router(prs.router)
app.include_router(builds.router)
app.include_router(nightly.router)
app.include_router(release_notes.router)
app.include_router(logs.router)
app.include_router(infra.router)
app.include_router(registry.router)
app.include_router(issues.router)
app.include_router(insights.router)
app.include_router(health_analysis.router)
app.include_router(improvement.router)
app.include_router(repos.router)
app.include_router(groups.router)
app.include_router(security.router)
app.include_router(tags.router)
app.include_router(gap.router)
app.include_router(provision.router)
app.include_router(ch_webhooks.router)  # POST /webhooks/github — CI event ingestion
app.include_router(ch_ci.router)        # GET /ci/* — Failure Intelligence (ClickHouse)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/proxy/tree")
async def proxy_tree(owner: str, repo: str):
    """Proxy GitHub repo tree fetch using the server-side PAT (supports private repos)."""
    import httpx
    headers = gh._headers()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1",
            headers=headers,
        )
    if not r.is_success:
        from fastapi import HTTPException
        raise HTTPException(status_code=r.status_code, detail=f"GitHub API {r.status_code}")
    return r.json()


@app.get("/proxy/content")
async def proxy_content(owner: str, repo: str, path: str):
    """Proxy GitHub file content fetch using the server-side PAT (supports private repos)."""
    import httpx
    headers = gh._headers()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            headers=headers,
        )
    if not r.is_success:
        from fastapi import HTTPException
        raise HTTPException(status_code=r.status_code, detail=f"GitHub API {r.status_code}")
    return r.json()


@app.post("/cache/clear")
async def clear_cache():
    """Bust all server-side in-process caches. Called by frontend on repo switch."""
    from services import github_client as _gh
    _gh._stats_mem.clear()
    return {"cleared": True}


@app.get("/config")
async def get_config():
    return {"owner": settings.GH_OWNER, "repo": settings.GH_REPO}


@app.patch("/config")
async def patch_config(body: dict):
    if "owner" in body and body["owner"]:
        settings.GH_OWNER = body["owner"].strip()
    if "repo" in body and body["repo"]:
        settings.GH_REPO = body["repo"].strip()
    return {"owner": settings.GH_OWNER, "repo": settings.GH_REPO}
