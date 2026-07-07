import asyncio
import re
import statistics
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from typing import Optional

from services import github_client as gh
from services import llm

router = APIRouter(prefix="/nightly", tags=["nightly"])

_SKIP_JOBS = {"setup-versions", "notify-compatibility-status", "combine-compat-results", "combine-results"}


async def _nightly_workflow() -> str | None:
    wf = await gh.get_primary_workflows()
    return wf["nightly"] or wf["ci"]


@router.get("/runs")
async def list_nightly_runs(per_page: int = 30, page: int = 1):
    wf = await _nightly_workflow()
    if not wf:
        return {"workflow_runs": [], "total_count": 0}
    return await gh.get_workflow_runs(wf, per_page=per_page, page=page)


@router.get("/runs/{run_id}")
async def get_nightly_run(run_id: int):
    return await gh.get_run(run_id)


@router.get("/runs/{run_id}/jobs")
async def get_nightly_jobs(run_id: int):
    return await gh.get_run_jobs(run_id)


async def _build_matrix(days: int = 14) -> dict:
    """
    Per-job matrix:
      rows  = job names  (e.g. "test-tasks-compat (5.0.0)")
      cols  = dates      (YYYY-MM-DD, newest first)
      cells = {status, run_id, job_id, url}
    """
    data = await gh.get_workflow_runs(await _nightly_workflow() or "nightly.yml", per_page=min(days * 2, 100))
    runs = data.get("workflow_runs", [])

    # Deduplicate to one run per date (take the latest)
    seen_dates: dict[str, dict] = {}
    for run in runs:
        date = run["created_at"][:10]
        if date not in seen_dates:
            seen_dates[date] = run

    recent_runs = sorted(seen_dates.values(), key=lambda r: r["created_at"], reverse=True)[:days]

    async def fetch_jobs(run: dict):
        try:
            jobs_data = await gh.get_run_jobs(run["id"])
            return run, jobs_data.get("jobs", [])
        except Exception:
            return run, []

    results = await asyncio.gather(*[fetch_jobs(r) for r in recent_runs])

    matrix: dict[str, dict] = {}
    all_job_names: list[str] = []

    for run, jobs in results:
        date = run["created_at"][:10]
        matrix.setdefault(date, {})
        for job in jobs:
            name = job["name"]
            if name in _SKIP_JOBS:
                continue
            matrix[date][name] = {
                "status": job.get("conclusion") or job.get("status", "unknown"),
                "run_id": run["id"],
                "job_id": job["id"],
                "url": job.get("html_url", run["html_url"]),
                "started_at": job.get("started_at"),
                "completed_at": job.get("completed_at"),
            }
            if name not in all_job_names:
                all_job_names.append(name)

    dates = sorted(matrix.keys(), reverse=True)

    # Compute flakiness: jobs that have both success and failure in window
    flaky: list[str] = []
    for name in all_job_names:
        statuses = {matrix[d][name]["status"] for d in dates if name in matrix.get(d, {})}
        if "success" in statuses and "failure" in statuses:
            flaky.append(name)

    # Consecutive failures per job (from most recent)
    consecutive: dict[str, int] = {}
    for name in all_job_names:
        count = 0
        for d in dates:
            cell = matrix.get(d, {}).get(name)
            if cell and cell["status"] == "failure":
                count += 1
            else:
                break
        consecutive[name] = count

    return {
        "matrix": matrix,
        "dates": dates,
        "job_names": all_job_names,
        "flaky_jobs": flaky,
        "consecutive_failures": consecutive,
        "workflow": await _nightly_workflow(),
    }


@router.get("/matrix")
async def get_nightly_matrix(days: int = 14):
    return await _build_matrix(days)


@router.get("/digest")
async def get_nightly_digest(days: int = 7):
    """Heuristic CI health digest — failure hotspots, worst architectures, needs-attention."""
    return await _compute_digest(days)


async def _compute_digest(days: int = 7) -> dict:
    m = await _build_matrix(days)
    matrix, dates, job_names = m["matrix"], m["dates"], m["job_names"]
    consecutive, flaky = m["consecutive_failures"], m["flaky_jobs"]

    total = failures = 0
    fail_by_job: dict[str, dict] = {}
    for d in dates:
        for name in job_names:
            cell = matrix.get(d, {}).get(name)
            if not cell:
                continue
            total += 1
            if cell.get("status") == "failure":
                failures += 1
                fj = fail_by_job.setdefault(name, {"count": 0, "days": set(), "url": cell.get("url")})
                fj["count"] += 1
                fj["days"].add(d)

    hotspots = sorted(fail_by_job.items(), key=lambda kv: -kv[1]["count"])[:6]
    hotspots_out = [
        {"job": n, "failures": i["count"], "days": len(i["days"]), "url": i["url"]}
        for n, i in hotspots
    ]

    arch_fail: dict[str, int] = {}
    for name, info in fail_by_job.items():
        for arch in set(re.findall(r"gfx[0-9a-zA-Z]+(?:-[a-z0-9]+)?", name)):
            arch_fail[arch] = arch_fail.get(arch, 0) + info["count"]
    total_arch = sum(arch_fail.values()) or 1
    arch_out = [
        {"arch": a, "failures": c, "pct": round(c / total_arch * 100, 1)}
        for a, c in sorted(arch_fail.items(), key=lambda kv: -kv[1])[:5]
    ]

    attention_out = [
        {"job": n, "streak": consecutive.get(n, 0)}
        for n in sorted(job_names, key=lambda x: -consecutive.get(x, 0))
        if consecutive.get(n, 0) >= 3
    ]

    return {
        "days": days,
        "dates_covered": len(dates),
        "total_jobs": total,
        "total_failures": failures,
        "failure_rate": round(failures / total * 100, 1) if total else 0.0,
        "hotspots": hotspots_out,
        "top_architectures": arch_out,
        "needs_attention": attention_out,
        "flaky_jobs": flaky[:10],
    }


# ── AI weekly digest ─────────────────────────────────────────────────────────
# Cache the LLM-written narrative per (repo, days) so the Summary page loads
# instantly and we don't re-bill a generation on every view. Served with a
# cache-age indicator and force-refreshable via ?refresh=true.
_AI_DIGEST_CACHE: dict[tuple[str, int], dict] = {}
_AI_DIGEST_TTL = 6 * 3600  # seconds

_AI_SYSTEM = (
    "You are a CI reliability analyst. Given structured CI health metrics, write a concise, "
    "high-signal weekly digest in GitHub-flavored markdown. Structure it exactly as:\n"
    "1. An H3 title line: '### CI Health Digest — Weekly report (<start> -> <end>)'.\n"
    "2. One executive-summary paragraph with the headline numbers (jobs, failures, failure rate) "
    "and the 2-3 dominant themes.\n"
    "3. '**Top failure hotspots**' as a bullet list — each bullet names the job in `code` and, in "
    "plain language, what the number implies.\n"
    "4. '**Most affected architectures**' as a bullet list with the failure share and a one-line "
    "interpretation.\n"
    "5. '**What needs immediate attention**' as a numbered list of 1-3 concrete, reasoned actions.\n"
    "6. A final '**Bottom line:**' one-sentence TL;DR.\n"
    "Be specific and reference the real numbers. Do not invent data not present in the input. "
    "If there is no failure data, say so plainly in one line."
)


def _digest_to_prompt(d: dict, start: str, end: str) -> str:
    import json
    return (
        f"Date range: {start} -> {end} ({d['days']} days, {d['dates_covered']} with data).\n"
        f"Metrics JSON:\n{json.dumps(d, indent=2)}"
    )


async def _generate_ai_digest(days: int) -> dict:
    d = await _compute_digest(days)
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days)).date().isoformat()
    end = now.date().isoformat()

    if d["total_jobs"] == 0:
        markdown = f"### CI Health Digest — Weekly report ({start} -> {end})\n\nNo nightly job data in this window."
        provider = model = None
    else:
        row = await llm.get_settings()
        provider = row.provider or "anthropic"
        model = llm.PROVIDERS.get(provider, {}).get("model")
        markdown = await llm.call(_digest_to_prompt(d, start, end), _AI_SYSTEM)

    return {
        "days": days,
        "date_range": {"start": start, "end": end},
        "generated_at": now.isoformat(),
        "_generated_epoch": now.timestamp(),
        "provider": provider,
        "model": model,
        "markdown": markdown.strip(),
        "digest": d,
    }


@router.get("/ai-digest")
async def get_ai_digest(days: int = 7, refresh: bool = False):
    """AI-written weekly CI health digest (Claude via llm.call), cached per repo."""
    slug = gh.get_active_repo_slug() or "default"
    key = (slug, days)
    cached = _AI_DIGEST_CACHE.get(key)
    now_epoch = datetime.now(timezone.utc).timestamp()

    if cached and not refresh and (now_epoch - cached["_generated_epoch"]) < _AI_DIGEST_TTL:
        out = cached
    else:
        try:
            out = await _generate_ai_digest(days)
            _AI_DIGEST_CACHE[key] = out
        except Exception as e:
            if cached:  # generation failed — serve the last good digest rather than error out
                out = cached
            else:
                raise HTTPException(status_code=503, detail=f"AI digest generation failed: {e}")

    resp = {k: v for k, v in out.items() if k != "_generated_epoch"}
    resp["cache_age_seconds"] = int(now_epoch - out["_generated_epoch"])
    return resp


@router.get("/failures")
async def get_nightly_failures(days: int = 14):
    """Failures-over-time timeline + slowest jobs (median wall-time)."""
    m = await _build_matrix(days)
    matrix, dates, job_names = m["matrix"], m["dates"], m["job_names"]

    timeline = []
    for d in sorted(dates):
        total = fails = 0
        for name in job_names:
            c = matrix.get(d, {}).get(name)
            if not c:
                continue
            total += 1
            if c.get("status") == "failure":
                fails += 1
        timeline.append({"date": d, "failures": fails, "passed": total - fails, "total": total})

    durs: dict[str, list] = {}
    for d in dates:
        for name in job_names:
            c = matrix.get(d, {}).get(name)
            if not c:
                continue
            st, en = c.get("started_at"), c.get("completed_at")
            if not st or not en:
                continue
            try:
                secs = (datetime.fromisoformat(en.replace("Z", "+00:00"))
                        - datetime.fromisoformat(st.replace("Z", "+00:00"))).total_seconds()
                if secs > 0:
                    durs.setdefault(name, []).append(secs)
            except Exception:
                continue

    slowest = sorted(
        ({"job": n, "median_sec": round(statistics.median(v)), "runs": len(v)} for n, v in durs.items()),
        key=lambda x: -x["median_sec"],
    )[:15]

    return {"days": days, "timeline": timeline, "slowest": slowest}


_STAGE_ORDER = ["Setup", "Builds", "Packaging", "Publish", "Tests", "PyTorch Builds", "PyTorch Tests", "Other"]
_OS_ORDER = ["Linux", "Windows", ""]


def _stage_of(name: str) -> tuple[str, str]:
    """Derive (os, stage) lane from a job name like 'Linux::gfx::release / Build Artifacts'."""
    first = name.split("::", 1)[0].strip().lower()
    os_ = "Linux" if first == "linux" else "Windows" if first == "windows" else ""
    seg = name.split(" / ")[-1] if " / " in name else name.split("::")[-1]
    sl = seg.lower()
    if "pytorch" in sl and "test" in sl:
        stage = "PyTorch Tests"
    elif "pytorch" in sl:
        stage = "PyTorch Builds"
    elif "packag" in sl:
        stage = "Packaging"
    elif "publish" in sl:
        stage = "Publish"
    elif "validate" in sl or "configure" in sl or "setup" in sl:
        stage = "Setup"
    elif "build" in sl:
        stage = "Builds"
    elif "test" in sl:
        stage = "Tests"
    else:
        stage = "Other"
    return os_, stage


@router.get("/multiarch")
async def get_multiarch(days: int = 14):
    """Multi-arch lane view — runs (rows) x pipeline-stage lanes (cols), fractional pass cells."""
    m = await _build_matrix(days)
    matrix, dates, job_names = m["matrix"], m["dates"], m["job_names"]

    grid: dict[str, dict] = {}
    lane_set: set[tuple[str, str]] = set()
    for d in dates:
        grid[d] = {}
        for name in job_names:
            c = matrix.get(d, {}).get(name)
            if not c:
                continue
            os_, stage = _stage_of(name)
            lane_set.add((os_, stage))
            key = f"{os_}|{stage}"
            cell = grid[d].setdefault(key, {"passed": 0, "failed": 0, "running": 0, "total": 0, "url": c.get("url")})
            st = (c.get("status") or "").lower()
            cell["total"] += 1
            if st == "success":
                cell["passed"] += 1
            elif st == "failure":
                cell["failed"] += 1
            elif st in ("in_progress", "queued"):
                cell["running"] += 1

    ordered = sorted(
        lane_set,
        key=lambda t: (_OS_ORDER.index(t[0]) if t[0] in _OS_ORDER else 9,
                       _STAGE_ORDER.index(t[1]) if t[1] in _STAGE_ORDER else 9),
    )
    lanes = [{"key": f"{o}|{s}", "os": o, "stage": s, "label": (f"{o} {s}").strip()} for o, s in ordered]
    rows = [{"date": d, "cells": grid[d]} for d in dates]
    return {"days": days, "lanes": lanes, "rows": rows}


@router.get("/multiarch-trends")
async def get_multiarch_trends(days: int = 30):
    """Build-vs-test failures per day, split by OS (Linux / Windows)."""
    m = await _build_matrix(days)
    matrix, dates, job_names = m["matrix"], m["dates"], m["job_names"]
    test_stages = {"Tests", "PyTorch Tests"}

    by_os: dict[str, dict[str, dict]] = {"Linux": {}, "Windows": {}}
    for d in dates:
        for osn in by_os:
            by_os[osn][d] = {"build": 0, "test": 0}
    for d in dates:
        for name in job_names:
            c = matrix.get(d, {}).get(name)
            if not c or (c.get("status") or "").lower() != "failure":
                continue
            os_, stage = _stage_of(name)
            if os_ not in by_os:
                continue
            by_os[os_][d]["test" if stage in test_stages else "build"] += 1

    def series(osn: str):
        return [{"date": d, "build": by_os[osn][d]["build"], "test": by_os[osn][d]["test"]} for d in sorted(dates)]

    return {"days": days, "linux": series("Linux"), "windows": series("Windows")}


def _arch_of(name: str) -> str:
    m = re.search(r"gfx[0-9a-zA-Z]+(?:-[a-z0-9]+)?", name)
    return m.group(0) if m else ""


# (kind, full name, filename keywords, what it catches) — display order
_SANITIZERS = [
    ("ASan", "AddressSanitizer", ["asan"], "Buffer overflows, use-after-free, double-free & memory leaks"),
    ("TSan", "ThreadSanitizer", ["tsan"], "Data races — concurrent unsynchronized memory access across threads"),
    ("MSan", "MemorySanitizer", ["msan"], "Reads of uninitialized memory"),
    ("UBSan", "UndefinedBehaviorSanitizer", ["ubsan"], "Signed integer overflow, null deref, out-of-bounds shifts"),
    ("HWASan", "Hardware-assisted AddressSanitizer", ["hwasan"], "Low-memory ASan for ARM64"),
]
# Most-specific first so 'asan' doesn't steal a 'hwasan' workflow (asan ⊂ hwasan).
_CLAIM_ORDER = ["HWASan", "UBSan", "MSan", "TSan", "ASan"]


@router.get("/sanitizers")
async def get_sanitizers():
    """ASan / TSan / MSan / UBSan / HWASan build+test status (latest run of each)."""
    names = await gh.get_repo_workflow_names()
    meta = {k: (full, kws, desc) for k, full, kws, desc in _SANITIZERS}

    claimed: set[str] = set()
    assigned: dict[str, str] = {}
    for kind in _CLAIM_ORDER:
        _full, kws, _desc = meta[kind]
        wf = next((n for n in names if n not in claimed and any(k in n.lower() for k in kws)), None)
        if wf:
            claimed.add(wf)
            assigned[kind] = wf

    async def build(kind: str, wf: str | None):
        full, _kws, desc = meta[kind]
        if not wf:
            return {"kind": kind, "full": full, "desc": desc, "workflow": None,
                    "configured": False, "run": None, "jobs": []}
        try:
            runs = (await gh.get_workflow_runs(wf, per_page=1)).get("workflow_runs", [])
        except Exception:
            runs = []
        run = runs[0] if runs else None
        jobs = []
        if run:
            try:
                jobs = (await gh.get_run_jobs(run["id"])).get("jobs", [])
            except Exception:
                jobs = []
        jobs_out = [{
            "name": j.get("name"),
            "arch": _arch_of(j.get("name", "")),
            "status": (j.get("conclusion") or j.get("status") or "unknown"),
            "url": j.get("html_url"),
        } for j in jobs if j.get("name") not in _SKIP_JOBS]
        return {
            "kind": kind,
            "full": full,
            "desc": desc,
            "workflow": wf,
            "configured": True,
            "run": ({
                "number": run.get("run_number"),
                "url": run.get("html_url"),
                "created_at": run.get("created_at"),
                "status": (run.get("conclusion") or run.get("status")),
            } if run else None),
            "jobs": jobs_out,
        }

    suites = [await build(kind, assigned.get(kind)) for kind, *_ in _SANITIZERS]
    return {"suites": suites, "configured": sum(1 for s in suites if s["configured"])}


@router.get("/trend")
async def get_nightly_trend(days: int = 30):
    """Daily pass-rate trend for charting."""
    data = await gh.get_workflow_runs(await _nightly_workflow() or "nightly.yml", per_page=min(days * 2, 100))
    runs = data.get("workflow_runs", [])

    by_date: dict[str, list[str]] = {}
    for r in runs:
        date = r["created_at"][:10]
        conclusion = r.get("conclusion") or r.get("status", "unknown")
        by_date.setdefault(date, []).append(conclusion)

    trend = []
    for date in sorted(by_date.keys(), reverse=True)[:days]:
        conclusions = by_date[date]
        passed = sum(1 for c in conclusions if c == "success")
        trend.append({
            "date": date,
            "passed": passed,
            "failed": len(conclusions) - passed,
            "total": len(conclusions),
            "pass_rate": round(passed / len(conclusions) * 100, 1) if conclusions else 0,
        })
    return {"trend": trend}


@router.post("/trigger")
async def trigger_nightly(ref: str = "main"):
    wf = await _nightly_workflow()
    if not wf:
        raise HTTPException(status_code=404, detail="No nightly/CI workflow found for this repo")
    try:
        await gh.trigger_workflow(wf, ref=ref)
        return {"status": "triggered", "workflow": wf, "ref": ref}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/image-matrix")
async def get_nightly_image_matrix():
    """
    Image publish status from the active repo's publish workflow.
    Returns per-job breakdown and per-date history.
    """
    wf = await gh.get_primary_workflows()
    publish_wf = wf["publish"]

    if not publish_wf:
        return {"jobs": [], "history": [], "run_date": None, "run_url": None, "no_data": True, "source": None}

    try:
        data = await gh.get_workflow_runs(publish_wf, per_page=20)
        publish_runs = data.get("workflow_runs", [])
    except Exception:
        publish_runs = []

    if not publish_runs:
        return {"jobs": [], "history": [], "run_date": None, "run_url": None, "no_data": True, "source": publish_wf}

    latest_run = publish_runs[0]

    try:
        jobs_data = await gh.get_run_jobs(latest_run["id"])
        latest_jobs = jobs_data.get("jobs", [])
    except Exception:
        latest_jobs = []

    jobs = [
        {
            "name": j.get("name", ""),
            "status": j.get("conclusion") or j.get("status", "in_progress"),
            "url": j.get("html_url", latest_run["html_url"]),
            "job_id": j.get("id"),
        }
        for j in latest_jobs
    ]

    history = [
        {
            "date": r.get("created_at", "")[:10],
            "status": r.get("conclusion") or r.get("status", "in_progress"),
            "url": r.get("html_url", ""),
            "title": r.get("display_title", ""),
        }
        for r in publish_runs[:10]
    ]

    return {
        "jobs": jobs,
        "history": history,
        "run_date": latest_run.get("created_at", "")[:10],
        "run_url": latest_run.get("html_url", ""),
        "source": publish_wf,
        "no_data": False,
    }


@router.get("/yaml")
async def get_nightly_matrix_yaml():
    """Return the generated nightly-build GitHub Actions workflow YAML."""
    yaml_content = """\
name: nightly-build

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  build:
    name: build (${{ matrix.runtime_version }}, ${{ matrix.image_ext }})
    runs-on: [self-hosted, gpu, gpu-driver]
    fail-fast: false
    strategy:
      matrix:
        runtime_version: ["4.5.0", "5.0.0", "5.1.0"]
        image_ext: [base, ros2, cloudxr, slim]

    steps:
      - uses: actions/checkout@v4

      - name: Build image
        env:
          RUNTIME_VERSION: ${{ matrix.runtime_version }}
          IMAGE_EXT: ${{ matrix.image_ext }}
        run: |
          python docker/container.py \\
            --version $RUNTIME_VERSION \\
            --ext $IMAGE_EXT \\
            --tag nightly-$(date +%Y%m%d)-${IMAGE_EXT}-rt${RUNTIME_VERSION%.*}

      - name: Export build manifest
        run: python docker/container.py manifest > manifest.json

      - uses: actions/upload-artifact@v4
        with:
          name: manifest-${{ matrix.runtime_version }}-${{ matrix.image_ext }}
          path: manifest.json

      - name: Dispatch registry push
        uses: peter-evans/repository-dispatch@v3
        with:
          event-type: nightly-push
          client-payload: >-
            {
              "runtime_version": "${{ matrix.runtime_version }}",
              "image_ext": "${{ matrix.image_ext }}"
            }
"""
    return {"yaml": yaml_content}
