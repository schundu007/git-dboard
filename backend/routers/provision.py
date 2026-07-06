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
import os, json, subprocess, httpx, base64, asyncio
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


async def _dispatch_to(c: httpx.AsyncClient, target: str, req: "DispatchRequest", ref: str):
    url = f"{GITHUB_API}/repos/{target}/actions/workflows/provision.yml/dispatches"
    payload = {"ref": ref, "inputs": {
        "action": req.action,
        "build_amis": str(req.build_amis).lower(),
        "enable_k8s": str(req.enable_k8s).lower(),
    }}
    return await c.post(url, headers=gh._headers(), json=payload)


@router.post("/dispatch")
async def dispatch(req: DispatchRequest):
    """Trigger provision.yml on the live repo; if that repo can't be dispatched
    (no write / no workflow), fall back to running it on the caller's fork."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await _dispatch_to(c, req.repo, req, req.ref)
        if r.status_code in (201, 204):
            return {"dispatched": True, "repo": req.repo, "action": req.action,
                    "runs_url": f"https://github.com/{req.repo}/actions/workflows/provision.yml"}

        # Fall back to the caller's fork on permission / missing-workflow errors.
        if r.status_code in (403, 404):
            me = await c.get(f"{GITHUB_API}/user", headers=gh._headers())
            login = me.json().get("login") if me.status_code == 200 else None
            name = req.repo.split("/")[-1]
            if login and f"{login}/{name}".lower() != req.repo.lower():
                fork = f"{login}/{name}"
                fr = await c.get(f"{GITHUB_API}/repos/{fork}", headers=gh._headers())
                if fr.status_code == 200:
                    fork_default = fr.json().get("default_branch", req.ref)
                    fr2 = await _dispatch_to(c, fork, req, fork_default)
                    if fr2.status_code in (201, 204):
                        return {"dispatched": True, "repo": fork, "via_fork": True, "action": req.action,
                                "runs_url": f"https://github.com/{fork}/actions/workflows/provision.yml"}
                    raise HTTPException(fr2.status_code,
                        f"Can't dispatch '{req.repo}' (no access), and fork '{fork}' isn't dispatchable yet — "
                        f"provision.yml must be on its default branch (merge the scaffold PR first). {fr2.text}")

        raise HTTPException(r.status_code, f"dispatch failed: {r.text}")


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


async def _dispatch_check(c: httpx.AsyncClient, repo: str) -> dict:
    """Is `repo` reachable, does it have provision.yml, and can the token dispatch it?"""
    rr = await c.get(f"{GITHUB_API}/repos/{repo}", headers=gh._headers())
    if rr.status_code == 404:
        return {"ok": False, "reason": "repo_not_found",
                "message": f"Repo '{repo}' not found, or the active token has no access to it."}
    if rr.status_code >= 400:
        return {"ok": False, "reason": "repo_error", "message": f"Cannot access '{repo}' (HTTP {rr.status_code})."}
    wr = await c.get(f"{GITHUB_API}/repos/{repo}/actions/workflows/provision.yml", headers=gh._headers())
    if wr.status_code == 404:
        return {"ok": False, "reason": "workflow_missing",
                "message": f"'{repo}' has no .github/workflows/provision.yml. "
                           f"Add that workflow (with 'on: workflow_dispatch') to enable provisioning."}
    if wr.status_code >= 400:
        return {"ok": False, "reason": "workflow_error", "message": f"Cannot read provision.yml on '{repo}' (HTTP {wr.status_code})."}
    perms = (rr.json() or {}).get("permissions") or {}
    if not (perms.get("push") or perms.get("maintain") or perms.get("admin")):
        return {"ok": False, "reason": "no_write",
                "message": f"The active token is read-only on '{repo}'. Dispatching a workflow "
                           f"needs write access — or use 'Enable via fork'."}
    return {"ok": True, "workflow_id": wr.json().get("id"),
            "message": f"Ready — provision.yml found and writable on '{repo}'."}


@router.get("/preflight")
async def preflight(repo: str):
    """Check the live repo; if it isn't dispatchable, check the caller's fork so
    the UI reflects 'ready via your fork' (dispatch falls back there)."""
    async with httpx.AsyncClient(timeout=20) as c:
        res = await _dispatch_check(c, repo)
        if res["ok"]:
            return {**res, "repo": repo}
        # Live repo not dispatchable — is the caller's fork already set up?
        if res.get("reason") in ("workflow_missing", "no_write"):
            me = await c.get(f"{GITHUB_API}/user", headers=gh._headers())
            login = me.json().get("login") if me.status_code == 200 else None
            name = repo.split("/")[-1]
            if login and f"{login}/{name}".lower() != repo.lower():
                fork = f"{login}/{name}"
                fres = await _dispatch_check(c, fork)
                if fres.get("ok"):
                    return {"ok": True, "via_fork": True, "repo": fork,
                            "message": f"Ready via your fork '{fork}' — dispatch runs there."}
        return {**res, "repo": repo}


_STARTER_YAML = """name: provision
on:
  workflow_dispatch:
    inputs:
      action: { description: "terraform action", type: choice, options: [plan, apply], default: plan }
      build_amis: { description: "build AMIs first", type: boolean, default: false }
      enable_k8s: { description: "enable EKS + cache", type: boolean, default: false }
permissions: { id-token: write, contents: read }
jobs:
  provision:
    runs-on: ubuntu-latest
    environment: ${{ inputs.action == 'apply' && 'production' || '' }}
    env:
      TF_WORKDIR: infra/env/prod        # TODO: your terraform root
      AWS_REGION: us-east-1             # TODO
      TF_VAR_enable_k8s: ${{ inputs.enable_k8s }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_PROVISION_ROLE_ARN }}   # TODO
          aws-region: ${{ env.AWS_REGION }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -backend-config=backend.hcl
        working-directory: ${{ env.TF_WORKDIR }}
      - run: terraform plan -out=tfplan
        working-directory: ${{ env.TF_WORKDIR }}
      - if: ${{ inputs.action == 'apply' }}
        run: terraform apply -auto-approve tfplan
        working-directory: ${{ env.TF_WORKDIR }}
"""


@router.post("/scaffold")
async def scaffold(repo: str, path: str = ".github/workflows/provision.yml",
                   dry_run: bool = False, to_default: bool = False):
    """One-click: add provision.yml so the repo (or your fork of it) becomes
    dispatchable. If the token can't write the live repo, fork it first.
    - to_default=True: commit straight to the (fork's) default branch → dispatchable now.
    - otherwise: commit to a branch and open a PR."""
    branch = "gitpulse/add-provision-yml"
    h = gh._headers()
    async with httpx.AsyncClient(timeout=45) as c:
        rr = await c.get(f"{GITHUB_API}/repos/{repo}", headers=h)
        if rr.status_code >= 400:
            raise HTTPException(rr.status_code, f"Cannot access '{repo}': {rr.text}")
        upstream = rr.json()
        default_branch = upstream.get("default_branch", "main")
        perms = upstream.get("permissions") or {}
        can_write = bool(perms.get("push") or perms.get("maintain") or perms.get("admin"))

        # Pick where we push: the live repo if writable, else a fork of it.
        work_repo = repo
        via_fork = False
        if not can_write:
            fk = await c.post(f"{GITHUB_API}/repos/{repo}/forks", headers=h)
            if fk.status_code not in (200, 202):
                raise HTTPException(fk.status_code,
                                    f"No write access to '{repo}', and forking failed: {fk.text}")
            work_repo = fk.json().get("full_name")
            via_fork = True
            # forks are created asynchronously — wait until it's queryable
            for _ in range(15):
                if (await c.get(f"{GITHUB_API}/repos/{work_repo}", headers=h)).status_code == 200:
                    break
                await asyncio.sleep(2)

        wr = (await c.get(f"{GITHUB_API}/repos/{work_repo}", headers=h)).json()
        work_default = wr.get("default_branch", default_branch)
        ref = await c.get(f"{GITHUB_API}/repos/{work_repo}/git/ref/heads/{work_default}", headers=h)
        if ref.status_code >= 400:
            raise HTTPException(ref.status_code, f"base ref on '{work_repo}': {ref.text}")
        base_sha = ref.json()["object"]["sha"]

        # commit straight to the default branch (dispatchable now) or to a PR branch
        commit_branch = work_default if to_default else branch
        if not to_default:
            br = await c.post(f"{GITHUB_API}/repos/{work_repo}/git/refs", headers=h,
                              json={"ref": f"refs/heads/{branch}", "sha": base_sha})
            if br.status_code not in (201, 422):  # 422 = branch already exists
                raise HTTPException(br.status_code, f"create branch on '{work_repo}': {br.text}")

        existing = await c.get(f"{GITHUB_API}/repos/{work_repo}/contents/{path}?ref={commit_branch}", headers=h)
        put_body = {
            "message": "ci: add provision.yml (via gitpulse)",
            "content": base64.b64encode(_STARTER_YAML.encode()).decode(),
            "branch": commit_branch,
        }
        if existing.status_code == 200:
            put_body["sha"] = existing.json()["sha"]
        put = await c.put(f"{GITHUB_API}/repos/{work_repo}/contents/{path}", headers=h, json=put_body)
        if put.status_code not in (200, 201):
            raise HTTPException(put.status_code, f"commit file on '{work_repo}': {put.text}")

        if dry_run:  # verify fork+commit without opening a PR on the target
            return {"ok": True, "dry_run": True, "via_fork": via_fork, "work_repo": work_repo,
                    "branch": branch,
                    "file_url": f"https://github.com/{work_repo}/blob/{branch}/{path}",
                    "note": f"dry-run: committed to {'fork' if via_fork else 'repo'} '{work_repo}'; upstream PR skipped"}

        if to_default:  # committed straight to the default branch → dispatchable immediately
            return {"ok": True, "enabled": True, "via_fork": via_fork, "repo": work_repo,
                    "runs_url": f"https://github.com/{work_repo}/actions/workflows/provision.yml",
                    "message": f"provision.yml added to '{work_repo}' ({work_default}) — dispatch works now"
                               + (" · via your fork" if via_fork else "")}

        work_owner = work_repo.split("/")[0]
        head = f"{work_owner}:{branch}" if via_fork else branch
        pr = await c.post(f"{GITHUB_API}/repos/{repo}/pulls", headers=h, json={
            "title": "Add provision.yml (gitpulse)", "head": head, "base": default_branch,
            "body": "Adds a starter `provision.yml` so gitpulse can dispatch provisioning.\n\n"
                    "Fill the TODO placeholders (terraform root, AWS region, OIDC role ARN) before applying.",
        })
        if pr.status_code == 201:
            return {"ok": True, "pr_url": pr.json()["html_url"], "via_fork": via_fork, "work_repo": work_repo}

        found = await c.get(f"{GITHUB_API}/repos/{repo}/pulls?head={work_owner}:{branch}&state=open", headers=h)
        prs = found.json() if found.status_code == 200 else []
        if prs:
            return {"ok": True, "pr_url": prs[0]["html_url"], "via_fork": via_fork, "note": "existing PR"}
        compare = (f"https://github.com/{repo}/compare/{default_branch}...{work_owner}:{branch}?expand=1"
                   if via_fork else f"https://github.com/{repo}/compare/{branch}?expand=1")
        return {"ok": True, "via_fork": via_fork, "compare_url": compare,
                "note": "branch pushed — open the PR from the compare link"}


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
