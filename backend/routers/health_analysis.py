"""
Health Analysis router — DORA metrics, CI failure triage, pipeline performance,
and GPU runner health. Designed for SRE observability and operational excellence.
"""
import asyncio
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter
from services import github_client as gh

router = APIRouter(prefix="/health-analysis", tags=["health"])

# Job name patterns that indicate infrastructure-owned failures (not product bugs)
INFRA_PATTERNS = [
    "setup", "install", "checkout", "configure", "docker", "build-image",
    "prepare", "bootstrap", "environment", "dependencies", "pre-build",
    "initialize", "cache", "pull", "push-image", "login",
]

TIMEOUT_PATTERNS = ["timed_out", "timeout"]


def _is_infra_job(job_name: str) -> bool:
    lower = job_name.lower()
    return any(p in lower for p in INFRA_PATTERNS)


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _dora_rating(metric: str, value: float) -> str:
    """DORA research-based rating thresholds."""
    if metric == "deploy_freq_per_day":
        if value >= 1: return "Elite"
        if value >= 1/7: return "High"
        if value >= 1/30: return "Medium"
        return "Low"
    if metric == "lead_time_min":
        if value < 60: return "Elite"
        if value < 1440: return "High"
        if value < 10080: return "Medium"
        return "Low"
    if metric == "mttr_min":
        if value < 60: return "Elite"
        if value < 1440: return "High"
        if value < 10080: return "Medium"
        return "Low"
    if metric == "cfr_pct":
        if value < 5: return "Elite"
        if value < 10: return "High"
        if value < 15: return "Medium"
        return "Low"
    return "Unknown"


@router.get("/dora")
async def dora_metrics():
    """DORA metrics: Deployment Frequency, Lead Time for Changes, MTTR, Change Failure Rate."""
    now = datetime.now(timezone.utc)
    since_30d = (now - timedelta(days=30)).isoformat()

    deployments_raw, postmerge_runs = await asyncio.gather(
        gh.get_deployments(per_page=100),
        gh.get_workflow_runs("postmerge-ci.yml", per_page=100),
        return_exceptions=True,
    )
    deployments = deployments_raw if isinstance(deployments_raw, list) else []
    wf_data = postmerge_runs if isinstance(postmerge_runs, dict) else {}
    workflow_runs = wf_data.get("workflow_runs", [])

    # ── 1. Deployment Frequency ──────────────────────────────────────────────
    recent_deploys = [d for d in deployments if (d.get("created_at") or "") >= since_30d]
    deploy_freq = len(recent_deploys) / 30

    deploy_by_day: dict[str, int] = defaultdict(int)
    for d in recent_deploys:
        day = (d.get("created_at") or "")[:10]
        if day:
            deploy_by_day[day] += 1

    chart_14d = []
    for i in range(13, -1, -1):
        dt = now - timedelta(days=i)
        chart_14d.append({
            "date": dt.strftime("%m/%d"),
            "deploys": deploy_by_day.get(dt.strftime("%Y-%m-%d"), 0),
        })

    # ── 2. Lead Time for Changes (run start → completion) ────────────────────
    completed = [
        r for r in workflow_runs
        if r.get("status") == "completed"
        and r.get("conclusion") == "success"
        and (r.get("run_started_at") or "") >= since_30d
    ]
    lead_times = []
    lead_chart = []
    for run in completed:
        s = _parse_dt(run.get("run_started_at"))
        e = _parse_dt(run.get("updated_at"))
        if s and e:
            mins = (e - s).total_seconds() / 60
            if 0 < mins < 480:
                lead_times.append(mins)
                lead_chart.append({"date": (run.get("run_started_at") or "")[:10], "minutes": round(mins, 1)})

    avg_lead = round(sum(lead_times) / len(lead_times), 1) if lead_times else 0

    # ── 3. MTTR ──────────────────────────────────────────────────────────────
    sorted_runs = sorted(
        [r for r in workflow_runs if r.get("status") == "completed"],
        key=lambda r: r.get("run_started_at", ""),
    )
    mttr_samples = []
    for i, run in enumerate(sorted_runs):
        if run.get("conclusion") == "failure":
            fail_t = _parse_dt(run.get("updated_at"))
            for j in range(i + 1, len(sorted_runs)):
                if sorted_runs[j].get("conclusion") == "success":
                    recover_t = _parse_dt(sorted_runs[j].get("run_started_at"))
                    if fail_t and recover_t:
                        mins = (recover_t - fail_t).total_seconds() / 60
                        if 0 < mins < 14400:
                            mttr_samples.append(mins)
                    break

    avg_mttr = round(sum(mttr_samples) / len(mttr_samples), 1) if mttr_samples else 0

    # ── 4. Change Failure Rate ────────────────────────────────────────────────
    recent_runs = [r for r in workflow_runs if (r.get("run_started_at") or "") >= since_30d]
    total_completed = [r for r in recent_runs if r.get("status") == "completed"]
    failed_runs = [r for r in total_completed if r.get("conclusion") in ("failure", "timed_out")]
    cfr = round(len(failed_runs) / len(total_completed) * 100, 1) if total_completed else 0

    # Run failure trend (last 14 days)
    fail_by_day: dict[str, int] = defaultdict(int)
    pass_by_day: dict[str, int] = defaultdict(int)
    for r in total_completed:
        day = (r.get("run_started_at") or "")[:10]
        if r.get("conclusion") in ("failure", "timed_out"):
            fail_by_day[day] += 1
        else:
            pass_by_day[day] += 1

    failure_trend = []
    for i in range(13, -1, -1):
        dt = now - timedelta(days=i)
        day = dt.strftime("%Y-%m-%d")
        failure_trend.append({
            "date": dt.strftime("%m/%d"),
            "failed": fail_by_day.get(day, 0),
            "passed": pass_by_day.get(day, 0),
        })

    return {
        "period_days": 30,
        "deployment_frequency": {
            "per_day": round(deploy_freq, 3),
            "per_week": round(deploy_freq * 7, 1),
            "total_30d": len(recent_deploys),
            "rating": _dora_rating("deploy_freq_per_day", deploy_freq),
            "chart": chart_14d,
        },
        "lead_time": {
            "avg_min": avg_lead,
            "avg_hours": round(avg_lead / 60, 1) if avg_lead else 0,
            "sample_count": len(lead_times),
            "rating": _dora_rating("lead_time_min", avg_lead),
            "recent": lead_chart[-10:],
        },
        "mttr": {
            "avg_min": avg_mttr,
            "avg_hours": round(avg_mttr / 60, 1) if avg_mttr else 0,
            "sample_count": len(mttr_samples),
            "rating": _dora_rating("mttr_min", avg_mttr),
        },
        "change_failure_rate": {
            "pct": cfr,
            "failed_runs": len(failed_runs),
            "total_runs": len(total_completed),
            "rating": _dora_rating("cfr_pct", cfr),
            "trend": failure_trend,
        },
    }


@router.get("/ci-triage")
async def ci_triage():
    """Categorize CI failures: infrastructure vs product/test vs flaky vs timeout."""
    workflows = ["postmerge-ci.yml", "nightly.yml"]

    all_failed: list[tuple] = []
    for wf in workflows:
        try:
            data = await gh.get_workflow_runs(wf, per_page=30)
            runs = data.get("workflow_runs", [])
            for r in runs:
                if r.get("conclusion") in ("failure", "timed_out", "cancelled", "startup_failure"):
                    all_failed.append((r, wf))
        except Exception:
            pass

    async def _categorize(run: dict, wf: str) -> dict | None:
        try:
            jobs_data = await gh.get_run_jobs(run["id"])
            jobs = jobs_data.get("jobs", [])
        except Exception:
            return None

        failed_jobs = [j for j in jobs if j.get("conclusion") == "failure"]
        timeout_jobs = [j for j in jobs if j.get("conclusion") == "timed_out"]

        job_names = [j["name"] for j in (failed_jobs + timeout_jobs)]

        if timeout_jobs:
            category = "timeout"
        elif not failed_jobs:
            category = "unknown"
        else:
            infra_count = sum(1 for j in failed_jobs if _is_infra_job(j["name"]))
            attempt = run.get("run_attempt", 1)
            if infra_count == len(failed_jobs):
                category = "infra"
            elif attempt > 1:
                # Failed on re-run → intermittent (flaky)
                category = "flaky"
            elif infra_count > 0:
                category = "mixed"
            else:
                category = "product"

        s = _parse_dt(run.get("run_started_at"))
        dur = None
        if s:
            e = _parse_dt(run.get("updated_at"))
            if e:
                dur = round((e - s).total_seconds() / 60, 1)

        return {
            "run_id": run["id"],
            "workflow": wf,
            "name": run.get("display_title") or run.get("head_commit", {}).get("message", "")[:60],
            "category": category,
            "failed_jobs": job_names[:6],
            "run_attempt": run.get("run_attempt", 1),
            "duration_min": dur,
            "created_at": run.get("run_started_at"),
            "url": run.get("html_url"),
            "branch": run.get("head_branch"),
        }

    tasks = [_categorize(run, wf) for run, wf in all_failed[:25]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    summary: dict[str, int] = defaultdict(int)
    failures = []
    for r in results:
        if isinstance(r, Exception) or r is None:
            continue
        summary[r["category"]] += 1
        failures.append(r)

    total = sum(summary.values())
    failures.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    return {
        "summary": dict(summary),
        "total_analyzed": total,
        "pcts": {k: round(v / total * 100) for k, v in summary.items()} if total else {},
        "failures": failures,
    }


@router.get("/pipeline-perf")
async def pipeline_performance():
    """Pipeline performance: run durations, p95, slowest workflows, trend."""
    workflows = [
        ("postmerge-ci.yml", "Post-Merge CI"),
        ("nightly.yml", "Nightly Tests"),
    ]

    result = []
    for wf_file, wf_name in workflows:
        try:
            data = await gh.get_workflow_runs(wf_file, per_page=30)
        except Exception:
            continue

        runs = [r for r in data.get("workflow_runs", []) if r.get("status") == "completed"]
        durations = []
        trend = []

        for run in runs:
            s = _parse_dt(run.get("run_started_at"))
            e = _parse_dt(run.get("updated_at"))
            if s and e:
                mins = round((e - s).total_seconds() / 60, 1)
                if 0 < mins < 600:
                    durations.append(mins)
                    trend.append({
                        "date": (run.get("run_started_at") or "")[:10],
                        "minutes": mins,
                        "conclusion": run.get("conclusion"),
                        "run_id": run["id"],
                    })

        if not durations:
            continue

        sorted_d = sorted(durations)
        p95_idx = max(0, int(len(sorted_d) * 0.95) - 1)
        p50_idx = max(0, int(len(sorted_d) * 0.50) - 1)

        result.append({
            "workflow": wf_name,
            "file": wf_file,
            "avg_min": round(sum(durations) / len(durations), 1),
            "p50_min": sorted_d[p50_idx],
            "p95_min": sorted_d[p95_idx],
            "min_min": sorted_d[0],
            "max_min": sorted_d[-1],
            "sample_count": len(durations),
            "trend": list(reversed(trend[:20])),
        })

    return {"workflows": result}


@router.get("/runner-health")
async def runner_health():
    """GPU/self-hosted runner health, utilization, and capacity analysis."""
    try:
        runners_data = await gh.get_runners()
        runners = runners_data.get("runners", [])
        if runners_data.get("access_denied"):
            return {
                "access_denied": True,
                "hint": runners_data.get("hint", ""),
                "summary": {"total": 0, "online": 0, "offline": 0, "busy": 0, "idle": 0, "utilization_pct": 0},
                "gpu": {"total": 0, "online": 0, "busy": 0, "idle": 0, "utilization_pct": 0},
                "groups": [], "runners": [],
            }
    except Exception as e:
        msg = str(e)
        if "403" in msg or "Forbidden" in msg:
            return {
                "access_denied": True,
                "hint": "GitHub PAT needs 'manage_runners:repo' scope",
                "summary": {"total": 0, "online": 0, "offline": 0, "busy": 0, "idle": 0, "utilization_pct": 0},
                "gpu": {"total": 0, "online": 0, "busy": 0, "idle": 0, "utilization_pct": 0},
                "groups": [], "runners": [],
            }
        return {"error": f"Failed to fetch runner data: {msg}", "runners": []}

    def _runner_tags(r: dict) -> list[str]:
        return [lbl.get("name", "") for lbl in r.get("labels", [])]

    def _is_gpu(r: dict) -> bool:
        tags = " ".join(_runner_tags(r)).lower()
        return any(k in tags for k in ("gpu", "a100", "v100", "h100", "t4", "cuda"))

    all_r = runners
    online = [r for r in all_r if r.get("status") == "online"]
    offline = [r for r in all_r if r.get("status") == "offline"]
    busy = [r for r in online if r.get("busy")]
    idle = [r for r in online if not r.get("busy")]

    gpu_r = [r for r in all_r if _is_gpu(r)]
    gpu_online = [r for r in gpu_r if r.get("status") == "online"]
    gpu_busy = [r for r in gpu_online if r.get("busy")]
    gpu_idle = [r for r in gpu_online if not r.get("busy")]

    runner_list = []
    for r in all_r:
        tags = _runner_tags(r)
        runner_list.append({
            "id": r["id"],
            "name": r["name"],
            "status": r.get("status"),
            "busy": r.get("busy", False),
            "gpu": _is_gpu(r),
            "os": r.get("os"),
            "labels": tags,
        })

    # Group by OS + GPU type
    groups: dict[str, dict] = {}
    for r in runner_list:
        key = ("GPU" if r["gpu"] else "CPU") + f" / {r.get('os', 'unknown')}"
        if key not in groups:
            groups[key] = {"total": 0, "online": 0, "busy": 0, "offline": 0}
        groups[key]["total"] += 1
        if r["status"] == "online":
            groups[key]["online"] += 1
            if r["busy"]:
                groups[key]["busy"] += 1
        else:
            groups[key]["offline"] += 1

    return {
        "summary": {
            "total": len(all_r),
            "online": len(online),
            "offline": len(offline),
            "busy": len(busy),
            "idle": len(idle),
            "utilization_pct": round(len(busy) / len(online) * 100, 1) if online else 0,
        },
        "gpu": {
            "total": len(gpu_r),
            "online": len(gpu_online),
            "busy": len(gpu_busy),
            "idle": len(gpu_idle),
            "utilization_pct": round(len(gpu_busy) / len(gpu_online) * 100, 1) if gpu_online else 0,
        },
        "groups": [{"name": k, **v} for k, v in groups.items()],
        "runners": sorted(runner_list, key=lambda r: (r["status"] != "online", not r["gpu"], r["name"])),
    }
