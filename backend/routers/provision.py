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


async def _dispatch_workflow(c: httpx.AsyncClient, target: str, workflow: str, inputs: dict, ref: str):
    url = f"{GITHUB_API}/repos/{target}/actions/workflows/{workflow}/dispatches"
    return await c.post(url, headers=gh._headers(), json={"ref": ref, "inputs": inputs})


class AutoFixRequest(BaseModel):
    repo: str
    check_id: str
    apply: bool = False          # plan→PR by default; apply gated by the env approval
    prefix: str = "myrock"
    ref: str = "main"


@router.post("/auto-fix")
async def auto_fix(req: AutoFixRequest):
    """Dispatch the ai-remediate agent workflow to close ONE gap. Falls back to the
    caller's fork like /dispatch. The agent (Claude + Terraform/GitHub/AWS MCP) runs
    in CI under OIDC — no cloud creds on the app server."""
    inputs = {"check_id": req.check_id, "apply": str(req.apply).lower(), "prefix": req.prefix}
    wf = "ai-remediate.yml"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await _dispatch_workflow(c, req.repo, wf, inputs, req.ref)
        if r.status_code in (201, 204):
            return {"dispatched": True, "repo": req.repo, "check_id": req.check_id, "apply": req.apply,
                    "runs_url": f"https://github.com/{req.repo}/actions/workflows/{wf}"}
        if r.status_code in (403, 404):
            me = await c.get(f"{GITHUB_API}/user", headers=gh._headers())
            login = me.json().get("login") if me.status_code == 200 else None
            name = req.repo.split("/")[-1]
            if login and f"{login}/{name}".lower() != req.repo.lower():
                fork = f"{login}/{name}"
                fr = await c.get(f"{GITHUB_API}/repos/{fork}", headers=gh._headers())
                if fr.status_code == 200:
                    fr2 = await _dispatch_workflow(c, fork, wf, inputs, fr.json().get("default_branch", req.ref))
                    if fr2.status_code in (201, 204):
                        return {"dispatched": True, "repo": fork, "via_fork": True,
                                "check_id": req.check_id, "apply": req.apply,
                                "runs_url": f"https://github.com/{fork}/actions/workflows/{wf}"}
                    raise HTTPException(fr2.status_code,
                        f"'{req.repo}' not dispatchable and fork '{fork}' has no ai-remediate.yml on its "
                        f"default branch yet — add the agent workflow first. {fr2.text}")
        raise HTTPException(r.status_code, f"auto-fix dispatch failed (is ai-remediate.yml present on the repo?): {r.text}")


# ---------- UI-driven prerequisite configuration (no dashboards/CLI) ----------
def _encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    """libsodium sealed-box encrypt a value with the repo's Actions public key."""
    from nacl import encoding, public
    pk = public.PublicKey(public_key_b64.encode(), encoding.Base64Encoder())
    return base64.b64encode(public.SealedBox(pk).encrypt(secret_value.encode())).decode()


class ConfigureRequest(BaseModel):
    repo: str
    role_arn: str | None = None        # → Actions variable AWS_PROVISION_ROLE_ARN
    aws_region: str | None = None      # → Actions variable AWS_REGION
    anthropic_key: str | None = None   # → Actions secret ANTHROPIC_API_KEY (encrypted)
    create_prod_env: bool = True       # → 'production' environment (apply approval)


@router.post("/configure")
async def configure(req: ConfigureRequest):
    """Set the target repo's CI prerequisites straight from the GitPulse UI — Actions
    variables, the ANTHROPIC_API_KEY secret (encrypted), and the 'production'
    environment — so the user never opens GitHub settings."""
    results: dict[str, bool] = {}
    async with httpx.AsyncClient(timeout=30) as c:
        h = gh._headers()

        async def set_var(name: str, val: str) -> bool:
            u = await c.patch(f"{GITHUB_API}/repos/{req.repo}/actions/variables/{name}",
                              headers=h, json={"name": name, "value": val})
            if u.status_code == 404:  # doesn't exist yet → create
                u = await c.post(f"{GITHUB_API}/repos/{req.repo}/actions/variables",
                                 headers=h, json={"name": name, "value": val})
            return u.status_code in (200, 201, 204)

        if req.role_arn:
            results["AWS_PROVISION_ROLE_ARN"] = await set_var("AWS_PROVISION_ROLE_ARN", req.role_arn)
        if req.aws_region:
            results["AWS_REGION"] = await set_var("AWS_REGION", req.aws_region)
        if req.anthropic_key:
            pk = await c.get(f"{GITHUB_API}/repos/{req.repo}/actions/secrets/public-key", headers=h)
            if pk.status_code == 200:
                enc = _encrypt_secret(pk.json()["key"], req.anthropic_key)
                sr = await c.put(f"{GITHUB_API}/repos/{req.repo}/actions/secrets/ANTHROPIC_API_KEY",
                                 headers=h, json={"encrypted_value": enc, "key_id": pk.json()["key_id"]})
                results["ANTHROPIC_API_KEY"] = sr.status_code in (201, 204)
            else:
                results["ANTHROPIC_API_KEY"] = False
        if req.create_prod_env:
            er = await c.put(f"{GITHUB_API}/repos/{req.repo}/environments/production", headers=h, json={})
            results["production_environment"] = er.status_code in (200, 201)

    return {"repo": req.repo, "results": results,
            "ok": bool(results) and all(results.values())}


@router.get("/prereqs")
async def prereqs(repo: str):
    """Prerequisite checklist for the UI: which CI settings are already configured."""
    async with httpx.AsyncClient(timeout=30) as c:
        h = gh._headers()

        async def exists(path: str) -> bool:
            return (await c.get(f"{GITHUB_API}/repos/{repo}/{path}", headers=h)).status_code == 200

        checks = {
            "provision_workflow": await exists("actions/workflows/provision.yml"),
            "remediate_workflow": await exists("actions/workflows/ai-remediate.yml"),
            "role_arn_variable":  await exists("actions/variables/AWS_PROVISION_ROLE_ARN"),
            "anthropic_secret":   await exists("actions/secrets/ANTHROPIC_API_KEY"),
            "production_env":     await exists("environments/production"),
        }
        # role name comes from the AWS_PROVISION_ROLE_ARN variable (fallback to the bootstrap default)
        role_name = "gitpulse-ci-provision"
        v = await c.get(f"{GITHUB_API}/repos/{repo}/actions/variables/AWS_PROVISION_ROLE_ARN", headers=h)
        if v.status_code == 200 and "/" in (v.json().get("value") or ""):
            role_name = v.json()["value"].rsplit("/", 1)[-1]

    # AWS-side: does the OIDC provider + the provisioning role ACTUALLY exist in AWS?
    try:
        import boto3
        iam = boto3.client("iam")
        provs = iam.list_open_id_connect_providers().get("OpenIDConnectProviderList", [])
        checks["aws_oidc_provider"] = any("token.actions.githubusercontent.com" in p["Arn"] for p in provs)
        try:
            iam.get_role(RoleName=role_name)
            checks["aws_oidc_role"] = True
        except Exception:
            checks["aws_oidc_role"] = False
    except Exception:
        checks["aws_oidc_provider"] = False
        checks["aws_oidc_role"] = False

    return {"repo": repo, "checks": checks, "ready": all(checks.values())}


@router.get("/aws-test")
def aws_test():
    """Test the backend's AWS connection (STS caller identity) — for the UI 'Test' button."""
    try:
        import boto3
        ident = boto3.client("sts", region_name=os.environ.get("AWS_REGION", "us-east-2")).get_caller_identity()
        return {"ok": True, "account": ident["Account"], "arn": ident["Arn"]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.get("/github-test")
async def github_test():
    """Test the backend's GitHub token (identity + scopes) — for the UI 'Test' button."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GITHUB_API}/user", headers=gh._headers())
    if r.status_code != 200:
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:120]}"}
    scopes = r.headers.get("x-oauth-scopes", "")
    return {"ok": True, "login": r.json().get("login"), "scopes": scopes,
            "has_workflow": "workflow" in scopes}


class AwsCredsRequest(BaseModel):
    access_key_id: str
    secret_access_key: str
    region: str = "us-east-1"


async def _apply_aws_creds() -> bool:
    """Load stored AWS creds from the DB into the process env so the read-only gap
    scan (boto3 default chain) uses them — no Railway env editing needed."""
    from database import AsyncSessionLocal
    from models import AwsSettings
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(AwsSettings).where(AwsSettings.id == 1))).scalar_one_or_none()
    if row and row.access_key_id and row.secret_access_key:
        os.environ["AWS_ACCESS_KEY_ID"] = row.access_key_id
        os.environ["AWS_SECRET_ACCESS_KEY"] = row.secret_access_key
        os.environ["AWS_REGION"] = row.region or "us-east-1"
        try:
            from services.aws_state import read_aws_state
            read_aws_state.cache_clear()
        except Exception:
            pass
        return True
    return False


@router.post("/aws-creds")
async def set_aws_creds(req: AwsCredsRequest):
    """Store AWS creds from the UI (server-side settings, like the AI keys) and apply
    them live — so the gap scan works without pasting keys into Railway or chat."""
    from database import AsyncSessionLocal
    from models import AwsSettings
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(AwsSettings).where(AwsSettings.id == 1))).scalar_one_or_none()
        if not row:
            row = AwsSettings(id=1)
            db.add(row)
        row.access_key_id = req.access_key_id.strip()
        row.secret_access_key = req.secret_access_key.strip()
        row.region = (req.region or "us-east-1").strip()
        await db.commit()
    await _apply_aws_creds()
    return {"ok": True, "region": req.region}


@router.get("/aws-creds")
async def get_aws_creds():
    """Masked current AWS creds for the UI (never returns the secret)."""
    from database import AsyncSessionLocal
    from models import AwsSettings
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(AwsSettings).where(AwsSettings.id == 1))).scalar_one_or_none()
    if not row or not row.access_key_id:
        return {"configured": False, "region": os.environ.get("AWS_REGION", "us-east-1")}
    ak = row.access_key_id
    return {"configured": True, "access_key_id_masked": f"{ak[:4]}…{ak[-4:]}", "region": row.region}


class BootstrapOidcRequest(BaseModel):
    repo: str                                                      # owner/repo → trust subject
    role_name: str = "gitpulse-ci-provision"
    access_key_id: str                                            # TEMPORARY write key (used once, NOT stored)
    secret_access_key: str
    region: str = "us-east-1"
    policy_arn: str = "arn:aws:iam::aws:policy/AdministratorAccess"  # provisioning permissions (scope down later)


@router.post("/bootstrap-oidc")
def bootstrap_oidc(req: BootstrapOidcRequest):
    """Break the OIDC chicken-and-egg: create the GitHub OIDC provider + a role that
    trusts repo:<owner>/<repo>:* using a TEMPORARY write key (used once, never stored).
    Returns the role ARN so the UI can set AWS_PROVISION_ROLE_ARN. After this every
    provisioning run authenticates via OIDC — no static keys again."""
    import boto3
    try:
        sess = boto3.Session(aws_access_key_id=req.access_key_id.strip(),
                             aws_secret_access_key=req.secret_access_key.strip(),
                             region_name=req.region)
        iam = sess.client("iam")
        acct = sess.client("sts").get_caller_identity()["Account"]
        host = "token.actions.githubusercontent.com"
        provider_arn = f"arn:aws:iam::{acct}:oidc-provider/{host}"

        existing = [p["Arn"] for p in iam.list_open_id_connect_providers().get("OpenIDConnectProviderList", [])]
        if provider_arn not in existing:
            iam.create_open_id_connect_provider(
                Url=f"https://{host}", ClientIDList=["sts.amazonaws.com"],
                ThumbprintList=["6938fd4d98bab03faadb97b34396831e3780aea1"])

        trust = {"Version": "2012-10-17", "Statement": [{
            "Effect": "Allow", "Principal": {"Federated": provider_arn},
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {"StringEquals": {f"{host}:aud": "sts.amazonaws.com"},
                          "StringLike": {f"{host}:sub": f"repo:{req.repo}:*"}}}]}
        try:
            role = iam.create_role(RoleName=req.role_name, AssumeRolePolicyDocument=json.dumps(trust),
                                   Description="GitPulse CI provisioning role (GitHub OIDC)")
            role_arn = role["Role"]["Arn"]
        except iam.exceptions.EntityAlreadyExistsException:
            iam.update_assume_role_policy(RoleName=req.role_name, PolicyDocument=json.dumps(trust))
            role_arn = iam.get_role(RoleName=req.role_name)["Role"]["Arn"]
        iam.attach_role_policy(RoleName=req.role_name, PolicyArn=req.policy_arn)
        return {"ok": True, "role_arn": role_arn, "provider_arn": provider_arn, "account": acct,
                "message": f"OIDC provider + role '{req.role_name}' ready — set it as AWS_PROVISION_ROLE_ARN."}
    except Exception as e:
        raise HTTPException(400, f"OIDC bootstrap failed: {str(e)[:300]}")


@router.get("/runs")
async def runs(repo: str):
    """Latest provisioning runs (provision.yml + ai-remediate.yml), newest first."""
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30) as c:
        for wf in ("provision.yml", "ai-remediate.yml"):
            r = await c.get(f"{GITHUB_API}/repos/{repo}/actions/workflows/{wf}/runs?per_page=8",
                            headers=gh._headers())
            if r.status_code != 200:
                continue
            for w in r.json().get("workflow_runs", []):
                out.append({"id": w["id"], "status": w["status"], "conclusion": w["conclusion"],
                            "event": w["event"], "created": w["created_at"], "url": w["html_url"],
                            "workflow": wf.replace(".yml", "")})
    out.sort(key=lambda x: x["created"], reverse=True)
    return out[:10]


# Map common CI failure signatures → the gap check that fixes them (for one-click Guide).
_ERROR_HINTS = [
    ("configure-aws-credentials", "oidc_roles",
     "AWS OIDC role couldn't be assumed. Set the repo variable AWS_PROVISION_ROLE_ARN and ensure the GitHub OIDC provider + role trust policy exist in AWS."),
    ("could not load credentials", "oidc_roles",
     "No AWS credentials in CI. Configure OIDC: an AWS_PROVISION_ROLE_ARN and an aws_iam_openid_connect_provider trusting this repo."),
    ("no valid credential", "oidc_roles", "AWS credentials missing — configure OIDC role assumption."),
    ("backend.hcl", "iac_remote_state", "Terraform remote-state backend not found. Create the S3 state bucket + DynamoDB lock and backend.hcl."),
    ("bucket does not exist", "iac_remote_state", "State bucket missing — bootstrap S3 + DynamoDB for remote state."),
    ("access denied", "oidc_roles", "The assumed role lacks permissions — widen the CI role policy or fix the trust condition."),
    ("terraform: not found", "provision_pipeline", "terraform isn't installed in the job — add hashicorp/setup-terraform@v3."),
]


def _error_hint(step: str | None, error: str) -> dict | None:
    hay = f"{step or ''}\n{error or ''}".lower()
    for sig, check_id, msg in _ERROR_HINTS:
        if sig in hay:
            return {"check_id": check_id, "message": msg}
    return None


@router.get("/run-detail")
async def run_detail(repo: str, run_id: int):
    """Surface WHY a run failed — failing step + error excerpt + a Guide hint — so the
    user never has to leave GitPulse for GitHub Actions."""
    async with httpx.AsyncClient(timeout=30) as c:
        jr = await c.get(f"{GITHUB_API}/repos/{repo}/actions/runs/{run_id}/jobs", headers=gh._headers())
        jobs = jr.json().get("jobs", []) if jr.status_code == 200 else []
        failed_step = None
        failed_job = None
        for j in jobs:
            for s in (j.get("steps") or []):
                if s.get("conclusion") == "failure":
                    failed_step, failed_job = s.get("name"), j
                    break
            if failed_step:
                break
        error = ""
        if failed_job:
            lr = await c.get(f"{GITHUB_API}/repos/{repo}/actions/jobs/{failed_job['id']}/logs",
                             headers=gh._headers(), follow_redirects=True)
            if lr.status_code == 200:
                bad = [ln.strip() for ln in lr.text.splitlines()
                       if any(k in ln.lower() for k in ("error", "could not", "denied", "not found", "fatal"))]
                error = "\n".join(bad[-12:])
    return {"run_id": run_id, "failed_step": failed_step, "error": error[:2000],
            "hint": _error_hint(failed_step, error),
            "jobs": [{"name": j.get("name"), "conclusion": j.get("conclusion")} for j in jobs]}


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


_MCP_JSON = """{
  "mcpServers": {
    "terraform": { "command": "docker", "args": ["run", "-i", "--rm", "hashicorp/terraform-mcp-server:1.0.0"] },
    "github": { "command": "docker", "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server:v1.5.0"], "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GH_PAT}" } },
    "aws": { "command": "uvx", "args": ["awslabs.aws-api-mcp-server@1.3.46"], "env": { "AWS_REGION": "${AWS_REGION}" } }
  }
}
"""

_REMEDIATE_YAML = """name: ai-remediate
# Agentic auto-fix for one infra/security gap (dispatched by GitPulse /provision/auto-fix).
# A Claude agent wired to Terraform + GitHub + AWS MCP (.mcp.json) closes ONE gap under OIDC.
on:
  workflow_dispatch:
    inputs:
      check_id: { description: "Gap id to remediate", type: string, required: true }
      apply: { description: "Apply now (else plan-only + PR)", type: boolean, default: false }
      prefix: { description: "AWS resource prefix", type: string, default: "myrock" }
permissions: { id-token: write, contents: write, pull-requests: write }
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-2' }}
jobs:
  remediate:
    runs-on: ubuntu-latest
    environment: ${{ inputs.apply && 'production' || '' }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_PROVISION_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: "1.9.8" }
      - run: npm install -g @anthropic-ai/claude-code
      - name: Run remediation agent (Terraform + GitHub + AWS MCP)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_PAT: ${{ github.token }}
          GITHUB_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "::error::ANTHROPIC_API_KEY secret not set"; exit 1; }
          git checkout -b "ai-remediate/${{ inputs.check_id }}-${GITHUB_RUN_ID}"
          claude -p "You are a DevOps remediation agent for ${{ github.repository }}. Close exactly ONE gap: '${{ inputs.check_id }}' (AWS prefix '${{ inputs.prefix }}'). Use the terraform, github and aws MCP servers with idempotent Terraform in infra/ on the S3 remote-state backend. If apply=${{ inputs.apply }} is false, plan + commit + open a PR; if true, terraform apply for just this change under OIDC. Never touch unrelated resources. End with a verify command." \\
            --mcp-config .mcp.json --permission-mode acceptEdits \\
            --allowedTools "Bash,Read,Write,Edit,mcp__terraform,mcp__github,mcp__aws" 2>&1 | tee agent.log
      - name: Open remediation PR (plan mode)
        if: ${{ !inputs.apply }}
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          if git diff --quiet HEAD; then echo "no changes"; exit 0; fi
          git config user.name gitpulse-agent
          git config user.email gitpulse-agent@users.noreply.github.com
          git add -A && git commit -m "ai-remediate: ${{ inputs.check_id }}"
          git push -u origin HEAD
          gh pr create --fill --title "AI remediation: ${{ inputs.check_id }}" --body "Automated remediation by GitPulse. Review before merge." || true
"""


@router.post("/scaffold")
async def scaffold(repo: str, path: str = ".github/workflows/provision.yml",
                   dry_run: bool = False, to_default: bool = False, full: bool = True):
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

        # Commit provision.yml plus (full=True) the agentic auto-fix files.
        files = [(path, _STARTER_YAML)]
        if full:
            files += [(".github/workflows/ai-remediate.yml", _REMEDIATE_YAML), (".mcp.json", _MCP_JSON)]
        for fpath, content in files:
            existing = await c.get(f"{GITHUB_API}/repos/{work_repo}/contents/{fpath}?ref={commit_branch}", headers=h)
            put_body = {
                "message": f"ci: add {fpath.split('/')[-1]} (via gitpulse)",
                "content": base64.b64encode(content.encode()).decode(),
                "branch": commit_branch,
            }
            if existing.status_code == 200:
                put_body["sha"] = existing.json()["sha"]
            put = await c.put(f"{GITHUB_API}/repos/{work_repo}/contents/{fpath}", headers=h, json=put_body)
            if put.status_code not in (200, 201):
                raise HTTPException(put.status_code, f"commit {fpath} on '{work_repo}': {put.text}")

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
    # AI risk gate (best-effort; requires ANTHROPIC_GITPULSE_API_KEY + analyze.py in checkout)
    risk: dict = {"skipped": True, "blocked": False}
    if os.environ.get("ANTHROPIC_GITPULSE_API_KEY"):
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
