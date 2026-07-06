"""app/services/aws_state.py

Reads LIVE AWS state (read-only) so 'current state' reflects what's actually
provisioned — not just repo files. Every call is best-effort and degrades to
'unknown' so a missing permission never crashes the gap scan.

Uses the git-dboard host's default AWS credential chain (env/role/profile).
Recommended: attach a READ-ONLY role (iam:List*/Get*, s3:List*, ec2:Describe*,
eks:List/Describe) — no write perms needed for analysis.
"""
from __future__ import annotations
import os
from functools import lru_cache
from typing import Any

try:
    import boto3
    from botocore.config import Config
except ImportError:  # keep import-safe if boto3 not installed yet
    boto3 = None


def _client(svc: str):
    if boto3 is None:
        return None
    region = os.environ.get("AWS_REGION", "us-east-2")
    return boto3.client(svc, region_name=region, config=Config(retries={"max_attempts": 2}))


@lru_cache(maxsize=1)
def read_aws_state(prefix: str = "myrock") -> dict[str, Any]:
    """Return a dict keyed to target_model aws_detect keys."""
    state: dict[str, Any] = {"reachable": False}
    if boto3 is None:
        return {**state, "error": "boto3 not installed"}
    try:
        ident = _client("sts").get_caller_identity()
        state.update(reachable=True, account=ident["Account"])
    except Exception as e:
        return {**state, "error": f"AWS unreachable: {e}"}

    # --- OIDC provider + roles ---
    try:
        iam = _client("iam")
        provs = iam.list_open_id_connect_providers().get("OpenIDConnectProviderList", [])
        state["oidc_provider"] = any("token.actions.githubusercontent.com" in p["Arn"] for p in provs)
        roles = iam.list_roles(MaxItems=1000).get("Roles", [])
        names = [r["RoleName"] for r in roles]
        state["oidc_roles"] = sum(1 for n in names if n.startswith(prefix) and
                                  any(t in n for t in ("ci", "dev", "nightly", "external"))) >= 2
        state["signing_key"] = None  # set below
        # static keys anywhere = bad
        users = iam.list_users(MaxItems=1000).get("Users", [])
        static = 0
        for u in users[:50]:
            static += len(iam.list_access_keys(UserName=u["UserName"]).get("AccessKeyMetadata", []))
        state["static_keys"] = static == 0  # True == good (none)
    except Exception as e:
        state["iam_error"] = str(e)

    # --- S3: artifact + sccache buckets, encryption ---
    try:
        s3 = _client("s3")
        buckets = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
        state["sccache_bucket"] = any(f"{prefix}-sccache" in b for b in buckets)
        state["state_backend"] = any(f"{prefix}-tfstate" in b for b in buckets)
        art = [b for b in buckets if b.startswith(prefix) and "artifacts" in b]
        state["artifact_buckets"] = len(art)
    except Exception as e:
        state["s3_error"] = str(e)

    # --- KMS signing key ---
    try:
        kms = _client("kms")
        aliases = kms.list_aliases().get("Aliases", [])
        state["signing_key"] = any(f"{prefix}-signing" in a.get("AliasName", "") for a in aliases)
    except Exception as e:
        state["kms_error"] = str(e)

    # --- EC2: ASGs (runner pools), custom AMIs ---
    try:
        asg = _client("autoscaling")
        groups = asg.describe_auto_scaling_groups().get("AutoScalingGroups", [])
        state["asgs"] = sum(1 for g in groups if g["AutoScalingGroupName"].startswith(prefix))
        ec2 = _client("ec2")
        imgs = ec2.describe_images(Owners=["self"]).get("Images", [])
        state["custom_amis"] = sum(1 for i in imgs if i.get("Name", "").startswith(prefix))
    except Exception as e:
        state["ec2_error"] = str(e)

    # --- EFS + EKS ---
    try:
        efs = _client("efs")
        fs = efs.describe_file_systems().get("FileSystems", [])
        state["efs"] = len(fs) > 0
    except Exception as e:
        state["efs_error"] = str(e)
    try:
        eks = _client("eks")
        clusters = eks.list_clusters().get("clusters", [])
        state["eks_cluster"] = any(c.startswith(prefix) for c in clusters)
    except Exception as e:
        state["eks_error"] = str(e)

    return state
