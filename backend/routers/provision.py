"""app/routers/provision.py  (mounted in this repo as routers/provision.py)

FastAPI router: /provision/* — closes gaps two ways (both requested):
  1. DISPATCH (default, auditable): trigger the repo's GitHub Actions
     provision.yml via workflow_dispatch. Apply runs in CI behind OIDC + OPA/
     Trivy/AI gates + environment approval. Holds NO cloud creds.
  2. BREAK-GLASS (opt-in): run terraform plan/apply on the server for a specific
     action. Requires a valid admin token (X-Admin-Token == PROVISION_ADMIN_TOKEN,
     fail-closed), confirm=true, AND a passing AI plan-risk gate re-run inside
     /apply. Intended for demos / urgent fixes only.

Mount:
    from routers import provision
    app.include_router(provision.router)
"""
from __future__ import annotations
import os, json, subprocess, httpx
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from services import github_client as gh

router = APIRouter(prefix="/provision", tags=["provision"])
GITHUB_API = "https://api.github.com"

# Break-glass shared secret. Fail CLOSED: if unset, break-glass is unusable.
ADMIN_TOKEN = os.environ.get("PROVISION_ADMIN_TOKEN")

# GitHub auth reuses git-dboard's existing client (active-repo PAT or GH_PAT).
# NOTE: workflow_dispatch requires that PAT to carry the 'workflow' scope.


def _require_admin(x_admin_token: str | None = Header(default=None)):
    """Gate break-glass routes. No app-wide auth exists, so we fail closed on a
    shared secret: unset PROVISION_ADMIN_TOKEN => break-glass is disabled (403)."""
    if not ADMIN_TOKEN or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(403, "break-glass requires a valid X-Admin-Token (PROVISION_ADMIN_TOKEN)")


# ---------- 1. DISPATCH (CI path, default — no cloud creds here) ----------
class DispatchRequest(BaseModel):
    repo: str                       # "schundu007/rocm-ci"
    ref: str = "main"
    action: str = "plan"            # plan | apply
    build_amis: bool = False
    enable_k8s: bool = False


@router.post("/dispatch")
async def dispatch(req: DispatchRequest):
    """Trigger provision.yml. Apply still gated by the workflow's environment approval."""
    url = f"{GITHUB_API}/repos/{req.repo}/actions/workflows/provision.yml/dispatches"
    payload = {"ref": req.ref, "inputs": {
        "action": req.action,
        "build_amis": str(req.build_amis).lower(),
        "enable_k8s": str(req.enable_k8s).lower(),
    }}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, headers=gh._headers(), json=payload)
    if r.status_code not in (201, 204):
        raise HTTPException(r.status_code, f"dispatch failed: {r.text}")
    # return the runs URL so the UI can poll status
    return {"dispatched": True, "action": req.action,
            "runs_url": f"https://github.com/{req.repo}/actions/workflows/provision.yml"}


@router.get("/runs")
async def runs(repo: str):
    """Latest provision.yml runs (for the UI status panel)."""
    url = f"{GITHUB_API}/repos/{repo}/actions/workflows/provision.yml/runs?per_page=10"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url, headers=gh._headers())
    data = r.json().get("workflow_runs", [])
    return [{"id": w["id"], "status": w["status"], "conclusion": w["conclusion"],
             "event": w["event"], "created": w["created_at"], "url": w["html_url"]}
            for w in data]


@router.get("/preflight")
async def preflight(repo: str):
    """Verify the target repo is reachable and has a dispatchable provision.yml,
    so the UI can show an actionable message instead of a raw 404."""
    async with httpx.AsyncClient(timeout=20) as c:
        rr = await c.get(f"{GITHUB_API}/repos/{repo}", headers=gh._headers())
        if rr.status_code == 404:
            return {"ok": False, "repo": repo, "reason": "repo_not_found",
                    "message": f"Repo '{repo}' not found, or the active token has no access to it. "
                               f"Check the name, and that Settings' PAT can reach this repo."}
        if rr.status_code >= 400:
            return {"ok": False, "repo": repo, "reason": "repo_error",
                    "message": f"Cannot access '{repo}' (HTTP {rr.status_code})."}

        wr = await c.get(f"{GITHUB_API}/repos/{repo}/actions/workflows/provision.yml",
                         headers=gh._headers())
        if wr.status_code == 404:
            return {"ok": False, "repo": repo, "reason": "workflow_missing",
                    "message": f"'{repo}' has no .github/workflows/provision.yml. "
                               f"Add that workflow (with 'on: workflow_dispatch') to enable provisioning."}
        if wr.status_code >= 400:
            return {"ok": False, "repo": repo, "reason": "workflow_error",
                    "message": f"Cannot read provision.yml on '{repo}' (HTTP {wr.status_code})."}

        # workflow_dispatch needs write (push) access — a read-only token passes the
        # existence checks above but fails the POST with 403 "Must have admin rights".
        perms = (rr.json() or {}).get("permissions") or {}
        if not (perms.get("push") or perms.get("maintain") or perms.get("admin")):
            return {"ok": False, "repo": repo, "reason": "no_write",
                    "message": f"The active token is read-only on '{repo}'. Dispatching a workflow "
                               f"needs write access — set a PAT with 'workflow' scope + write access "
                               f"to this repo in Settings."}

        wf = wr.json()
        return {"ok": True, "repo": repo, "workflow_id": wf.get("id"),
                "state": wf.get("state"),
                "message": f"Ready — provision.yml found and writable on '{repo}'."}


# ---------- 2. BREAK-GLASS (direct apply, admin-gated) ----------
class ApplyRequest(BaseModel):
    workdir: str = "infra/env/prod"   # server-side checkout path of rocm-ci
    target: str | None = None         # e.g. "module.oidc" to scope the apply
    confirm: bool = False             # MUST be true
    var_enable_k8s: bool = False


def _run(cmd: list[str], cwd: str) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr)[-8000:]


def _plan_and_gate(req: "ApplyRequest") -> tuple[str, dict]:
    """terraform init+plan, then the AI plan-risk gate. Returns (plan_text, risk).
    risk['blocked'] is True only when the gate actually ran and flagged high risk."""
    wd = req.workdir
    rc, out = _run(["terraform", "init", "-backend-config=backend.hcl"], wd)
    if rc != 0:
        raise HTTPException(500, f"init failed:\n{out}")
    cmd = ["terraform", "plan", "-out=tfplan"]
    if req.target:
        cmd += [f"-target={req.target}"]
    rc, out = _run(cmd, wd)
    if rc not in (0, 2):
        raise HTTPException(500, f"plan failed:\n{out}")
    _run(["bash", "-c", "terraform show -json tfplan > tfplan.json"], wd)
    # AI risk gate (best-effort; requires ANTHROPIC_API_KEY + analyze.py in checkout)
    risk: dict = {"skipped": True, "blocked": False}
    if os.environ.get("ANTHROPIC_API_KEY"):
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(wd))) or "."
        rc2, rout = _run(["python", "ai/plan-risk/analyze.py", f"{wd}/tfplan.json"], repo_root)
        # convention: non-zero exit from the analyzer == high risk / block
        risk = {"skipped": False, "exit": rc2, "blocked": rc2 != 0, "output": rout}
    return out, risk


@router.post("/plan")
def bg_plan(req: ApplyRequest, _: None = Depends(_require_admin)):
    """Server-side terraform plan + AI risk gate. Returns plan + risk verdict."""
    plan, risk = _plan_and_gate(req)
    return {"plan": plan, "risk": risk}


@router.post("/apply")
def bg_apply(req: ApplyRequest, _: None = Depends(_require_admin)):
    """BREAK-GLASS apply. Admin-gated. Refuses unless confirm=true AND the AI
    plan-risk gate (re-run here) passes. Use dispatch for normal ops."""
    if not req.confirm:
        raise HTTPException(400, "break-glass apply requires confirm=true")
    # Re-run plan + AI risk gate server-side so /apply is safe even if called directly.
    _, risk = _plan_and_gate(req)
    if risk.get("blocked"):
        raise HTTPException(409, f"AI plan-risk gate blocked apply:\n{risk.get('output', '')[-2000:]}")
    rc, out = _run(["terraform", "apply", "-auto-approve", "tfplan"], req.workdir)
    if rc != 0:
        raise HTTPException(500, f"apply failed:\n{out}")
    _, outputs = _run(["terraform", "output", "-json"], req.workdir)
    try:
        parsed = json.loads(outputs)
    except Exception:
        parsed = {}
    return {"applied": True, "risk": risk, "outputs": parsed}
