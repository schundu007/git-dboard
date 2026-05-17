"""
Security & Compliance router — Dependabot alerts, code scanning, secret scanning,
branch protection, workflow permissions, and OIDC credential hygiene.
"""
import asyncio
from fastapi import APIRouter
from services import github_client as gh

router = APIRouter(prefix="/security", tags=["security"])


async def _gh_get(path: str) -> dict | list | None:
    """Generic authenticated GET against the active repo."""
    import httpx
    headers = gh._headers()
    url = f"https://api.github.com/repos/{gh._repo()}{path}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url, headers=headers)
            if r.status_code in (403, 404, 451):
                return None          # feature not enabled or no access
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


async def _gh_get_org(path: str) -> dict | list | None:
    """GET against the org (for security advisories etc.)."""
    import httpx
    headers = gh._headers()
    url = f"https://api.github.com{path}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url, headers=headers)
            if r.status_code in (403, 404):
                return None
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


def _sev_counts(items: list, key: str = "severity") -> dict:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for item in items or []:
        sev = (item.get(key) or item.get("rule", {}).get("severity") or "low").lower()
        if sev in counts:
            counts[sev] += 1
    return counts


@router.get("/overview")
async def security_overview():
    """
    Aggregate security & compliance posture:
    - Dependabot vulnerability alerts
    - Code scanning (CodeQL) alerts
    - Secret scanning alerts
    - Branch protection on main/develop
    - Workflow permissions & OIDC configuration
    - Repo security feature flags
    """
    # Fan out all requests concurrently
    (
        dependabot_raw,
        codescan_raw,
        secrets_raw,
        repo_info,
        main_protection,
        develop_protection,
        workflow_perms,
        workflows_raw,
    ) = await asyncio.gather(
        _gh_get("/dependabot/alerts?state=open&per_page=100"),
        _gh_get("/code-scanning/alerts?state=open&per_page=100"),
        _gh_get("/secret-scanning/alerts?state=open&per_page=50"),
        gh.get_repo_info(),
        _gh_get("/branches/main/protection"),
        _gh_get("/branches/develop/protection"),
        _gh_get_org(f"/repos/{gh._repo()}/actions/permissions"),
        gh.get_workflows(),
    )

    # ── Dependabot ────────────────────────────────────────────────────────────
    dependabot_list = dependabot_raw if isinstance(dependabot_raw, list) else []
    dep_counts = _sev_counts(
        [d.get("security_advisory", {}) for d in dependabot_list],
        key="severity"
    )
    dep_total = sum(dep_counts.values())

    # ── Code scanning ─────────────────────────────────────────────────────────
    codescan_list  = codescan_raw if isinstance(codescan_raw, list) else []
    scan_counts    = _sev_counts(codescan_list)
    scan_total     = sum(scan_counts.values())

    # ── Secret scanning ───────────────────────────────────────────────────────
    secret_list    = secrets_raw if isinstance(secrets_raw, list) else []
    secret_total   = len(secret_list)
    secret_types   = list({s.get("secret_type_display_name", "Unknown") for s in secret_list})[:5]

    # ── Repo security feature flags ───────────────────────────────────────────
    sa = (repo_info or {}).get("security_and_analysis", {})
    features = {
        "advanced_security":         (sa.get("advanced_security",         {}) or {}).get("status") == "enabled",
        "secret_scanning":           (sa.get("secret_scanning",           {}) or {}).get("status") == "enabled",
        "secret_scanning_push_protect": (sa.get("secret_scanning_push_protection", {}) or {}).get("status") == "enabled",
        "dependabot_alerts":         (repo_info or {}).get("security_and_analysis", {}) is not None,
        "private_vulnerability_reporting": (sa.get("private_vulnerability_reporting", {}) or {}).get("status") == "enabled",
    }

    # ── Branch protection ─────────────────────────────────────────────────────
    def _parse_protection(data: dict | None, branch: str) -> dict:
        if not data:
            return {
                "branch": branch,
                "enabled": False,
                "require_pr_reviews": False,
                "required_approvals": 0,
                "dismiss_stale_reviews": False,
                "require_code_owner_reviews": False,
                "require_status_checks": False,
                "required_checks": [],
                "enforce_admins": False,
                "restrict_pushes": False,
                "allow_force_push": True,
                "allow_deletions": True,
            }
        rpr = data.get("required_pull_request_reviews") or {}
        rsc = data.get("required_status_checks") or {}
        return {
            "branch": branch,
            "enabled": True,
            "require_pr_reviews":          bool(rpr),
            "required_approvals":          rpr.get("required_approving_review_count", 0),
            "dismiss_stale_reviews":       rpr.get("dismiss_stale_reviews", False),
            "require_code_owner_reviews":  rpr.get("require_code_owner_reviews", False),
            "require_status_checks":       bool(rsc),
            "required_checks":             [c.get("context") or c.get("app_id","") for c in (rsc.get("checks") or [])],
            "enforce_admins":              (data.get("enforce_admins") or {}).get("enabled", False),
            "restrict_pushes":             bool(data.get("restrictions")),
            "allow_force_push":            (data.get("allow_force_pushes") or {}).get("enabled", True),
            "allow_deletions":             (data.get("allow_deletions") or {}).get("enabled", True),
        }

    branch_protection = [
        _parse_protection(main_protection,    "main"),
        _parse_protection(develop_protection, "develop"),
    ]

    # ── Workflow permissions ───────────────────────────────────────────────────
    wp = workflow_perms or {}
    wf_list = (workflows_raw or {}).get("workflows", [])
    # Scan workflows for permission declarations
    oidc_used     = any("id-token" in str(w) for w in wf_list)
    write_all_perm_wfs = []   # workflows that use permissions: write-all (risky)

    workflow_security = {
        "default_permissions":   wp.get("default_workflow_permissions", "unknown"),
        "can_approve_pr_reviews": wp.get("can_approve_pull_request_reviews", False),
        "oidc_configured":       oidc_used,
        "workflow_count":        len(wf_list),
    }

    # ── Compliance checks ──────────────────────────────────────────────────────
    main_prot  = branch_protection[0]
    dev_prot   = branch_protection[1]

    compliance_checks = [
        {
            "id": "branch-protection-main",
            "name": "Main branch protection enabled",
            "status": "pass" if main_prot["enabled"] else "fail",
            "severity": "critical",
            "details": "Require PR reviews and status checks on main to prevent direct pushes.",
        },
        {
            "id": "require-pr-reviews",
            "name": "Pull request reviews required (≥1 approver)",
            "status": "pass" if main_prot["required_approvals"] >= 1 else "fail",
            "severity": "high",
            "details": f"Current: {main_prot['required_approvals']} required approver(s). Minimum 1 required.",
        },
        {
            "id": "no-force-push-main",
            "name": "Force push to main disabled",
            "status": "pass" if not main_prot["allow_force_push"] else "fail",
            "severity": "high",
            "details": "Force push can rewrite history and bypass audit trails.",
        },
        {
            "id": "status-checks-required",
            "name": "Required status checks configured",
            "status": "pass" if main_prot["require_status_checks"] else "warn",
            "severity": "medium",
            "details": f"Checks required: {len(main_prot['required_checks'])}. At minimum CI and lint should be gated.",
        },
        {
            "id": "secret-scanning-enabled",
            "name": "Secret scanning enabled",
            "status": "pass" if features["secret_scanning"] else ("warn" if secret_total == 0 else "fail"),
            "severity": "high",
            "details": "Detects accidentally committed credentials and tokens in real time.",
        },
        {
            "id": "push-protection-enabled",
            "name": "Secret scanning push protection",
            "status": "pass" if features["secret_scanning_push_protect"] else "warn",
            "severity": "medium",
            "details": "Blocks pushes containing known secret patterns before they land in history.",
        },
        {
            "id": "no-open-secrets",
            "name": "No exposed secrets in codebase",
            "status": "pass" if secret_total == 0 else "fail",
            "severity": "critical",
            "details": f"{secret_total} open secret alert(s) detected. Rotate immediately.",
        },
        {
            "id": "dependabot-critical",
            "name": "No critical/high dependency vulnerabilities",
            "status": "pass" if (dep_counts["critical"] + dep_counts["high"]) == 0 else "fail",
            "severity": "high",
            "details": f"Critical: {dep_counts['critical']}, High: {dep_counts['high']} open Dependabot alerts.",
        },
        {
            "id": "dismiss-stale-reviews",
            "name": "Stale reviews dismissed on new commits",
            "status": "pass" if main_prot["dismiss_stale_reviews"] else "warn",
            "severity": "medium",
            "details": "Prevents approved PRs from merging after subsequent untested commits.",
        },
        {
            "id": "codeowner-reviews",
            "name": "Code owner review required",
            "status": "pass" if main_prot["require_code_owner_reviews"] else "warn",
            "severity": "low",
            "details": "Ensures domain experts review changes to critical paths.",
        },
        {
            "id": "workflow-least-privilege",
            "name": "Workflow default permissions set to read-only",
            "status": "pass" if workflow_security["default_permissions"] == "read" else "warn",
            "severity": "medium",
            "details": f"Current: {workflow_security['default_permissions']}. Read-only default + explicit write grants = least privilege.",
        },
        {
            "id": "develop-branch-protection",
            "name": "Develop branch protection enabled",
            "status": "pass" if dev_prot["enabled"] else "warn",
            "severity": "low",
            "details": "Development branch should have at least basic protection to prevent accidental force pushes.",
        },
        {
            "id": "enforce-admins",
            "name": "Branch protection enforced for admins",
            "status": "pass" if main_prot["enforce_admins"] else "warn",
            "severity": "medium",
            "details": "Admin bypass allows repository owners to merge without reviews, creating an audit gap. Enable enforce_admins to close it.",
        },
        {
            "id": "advanced-security-ghas",
            "name": "GitHub Advanced Security (GHAS) enabled",
            "status": "pass" if features["advanced_security"] else "warn",
            "severity": "medium",
            "details": "GHAS unlocks CodeQL code scanning, secret scanning, and security overview. Required for SLSA L2+ supply-chain attestation.",
        },
    ]

    passed  = sum(1 for c in compliance_checks if c["status"] == "pass")
    warned  = sum(1 for c in compliance_checks if c["status"] == "warn")
    failed  = sum(1 for c in compliance_checks if c["status"] == "fail")
    total   = len(compliance_checks)

    # ── Security score (0–100) ─────────────────────────────────────────────────
    WEIGHTS = {"critical": 25, "high": 15, "medium": 8, "low": 3}
    deductions = 0
    for c in compliance_checks:
        if c["status"] == "fail":
            deductions += WEIGHTS.get(c["severity"], 5)
        elif c["status"] == "warn":
            deductions += WEIGHTS.get(c["severity"], 5) // 3

    # Extra deductions for open alerts
    deductions += min(dep_counts["critical"] * 10, 20)
    deductions += min(dep_counts["high"] * 5, 10)
    deductions += min(secret_total * 15, 30)
    deductions += min(scan_counts.get("critical", 0) * 8, 16)

    security_score = max(0, min(100, 100 - deductions))

    if security_score >= 85:   score_label, score_grade = "Secure",           "A"
    elif security_score >= 70: score_label, score_grade = "Mostly Secure",    "B"
    elif security_score >= 50: score_label, score_grade = "Needs Hardening",  "C"
    elif security_score >= 30: score_label, score_grade = "At Risk",          "D"
    else:                      score_label, score_grade = "Critical Exposure", "F"

    # ── Recommendations ───────────────────────────────────────────────────────
    recommendations = []
    failing = [c for c in compliance_checks if c["status"] == "fail"]
    warning = [c for c in compliance_checks if c["status"] == "warn"]

    for c in (failing + warning)[:8]:
        recommendations.append({
            "priority": "critical" if c["status"] == "fail" and c["severity"] == "critical"
                        else "high"   if c["status"] == "fail"
                        else "medium",
            "action": c["name"],
            "why": c["details"],
            "effort": "low" if c["severity"] in ("medium", "low") else "medium",
        })

    if secret_total > 0:
        recommendations.insert(0, {
            "priority": "critical",
            "action": f"Rotate {secret_total} exposed secret(s) immediately",
            "why": f"Exposed secrets detected: {', '.join(secret_types[:3])}. Rotate all credentials and revoke compromised tokens now.",
            "effort": "low",
        })

    if dep_counts["critical"] > 0:
        recommendations.insert(0, {
            "priority": "critical",
            "action": f"Patch {dep_counts['critical']} critical dependency vulnerabilities",
            "why": "Critical CVEs in direct or transitive dependencies can be exploited without authentication.",
            "effort": "medium",
        })

    return {
        "score":              security_score,
        "grade":              score_grade,
        "label":              score_label,
        "compliance": {
            "passed":  passed,
            "warned":  warned,
            "failed":  failed,
            "total":   total,
            "checks":  compliance_checks,
        },
        "dependabot": {
            "total":   dep_total,
            "enabled": True,
            "counts":  dep_counts,
            "items":   [
                {
                    "pkg":      d.get("dependency", {}).get("package", {}).get("name", "unknown"),
                    "severity": (d.get("security_advisory") or {}).get("severity", "unknown"),
                    "summary":  (d.get("security_advisory") or {}).get("summary", ""),
                    "cve":      (d.get("security_advisory") or {}).get("cve_id", ""),
                    "url":      d.get("html_url", ""),
                }
                for d in dependabot_list[:10]
            ],
        },
        "code_scanning": {
            "total":   scan_total,
            "enabled": codescan_raw is not None,
            "counts":  scan_counts,
        },
        "secret_scanning": {
            "total":   secret_total,
            "enabled": features["secret_scanning"],
            "types":   secret_types,
        },
        "branch_protection":  branch_protection,
        "workflow_security":  workflow_security,
        "features":           features,
        "recommendations":    recommendations,
    }
