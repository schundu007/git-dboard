"""app/services/target_model.py

The TARGET state the gap engine scores against — derived from the rocm-ci repo
(Terraform modules + pipelines). Each check knows how to detect its CURRENT
state from (a) the GitHub repo files and (b) live AWS via boto3.

Categories map to the architect domains: IaC, Pipelines, DevSecOps, CloudSec.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Literal

Status = Literal["OK", "PARTIAL", "GAP"]


@dataclass
class Check:
    id: str
    category: str            # IaC | Pipeline | DevSecOps | CloudSec | Runners | Cache
    title: str
    target: str              # what "good" looks like
    fix: str                 # provisioning action to close the gap
    # detectors return True if satisfied; either may be None
    repo_detect: str | None = None    # regex/path hint evaluated against repo files
    aws_detect: str | None = None     # key into AwsState (see aws_state.py)
    severity: Literal["low", "medium", "high"] = "medium"


# ---- TARGET MODEL (rocm-ci) -------------------------------------------------
TARGET: list[Check] = [
    # ---------------- IaC ----------------
    Check("iac_modules", "IaC", "Terraform modules present",
          "infra/modules/* with env/prod stack",
          "Add/keep Terraform modules; run terraform validate in CI",
          repo_detect=r"infra/modules/.+/main\.tf", severity="high"),
    Check("iac_remote_state", "IaC", "Remote state backend",
          "S3 state bucket + DynamoDB lock (backend.hcl)",
          "Run scripts/bootstrap.sh to create S3+DynamoDB and backend.hcl",
          repo_detect=r"backend\.hcl|backend \"s3\"", aws_detect="state_backend",
          severity="high"),
    Check("iac_fmt_ci", "IaC", "terraform fmt/validate gate in CI",
          "provision/iac-security workflow runs fmt+validate",
          "Add terraform fmt -check + validate step to CI",
          repo_detect=r"terraform (fmt|validate)"),

    # ---------------- CloudSec ----------------
    Check("oidc_provider", "CloudSec", "GitHub OIDC provider in AWS",
          "aws_iam_openid_connect_provider for token.actions.githubusercontent.com",
          "terraform apply module.oidc (provision.yml)",
          repo_detect=r"aws_iam_openid_connect_provider", aws_detect="oidc_provider",
          severity="high"),
    Check("oidc_roles", "CloudSec", "Scoped CI roles (ci/ci-external/dev/nightly)",
          "IAM roles trust repo:ORG/REPO:* only, no static keys",
          "terraform apply module.oidc; verify trust conditions",
          repo_detect=r"aws_iam_role.+tier|role_subjects", aws_detect="oidc_roles",
          severity="high"),
    Check("no_static_keys", "CloudSec", "No static AWS keys",
          "OIDC only; zero aws_iam_access_key / long-lived secrets",
          "Remove any static keys; use OIDC role assumption",
          repo_detect=r"aws_iam_access_key", aws_detect="static_keys", severity="high"),
    Check("kms_encryption", "CloudSec", "KMS/SSE on buckets + EFS + EBS",
          "server_side_encryption + encrypted=true everywhere",
          "terraform apply artifact-buckets/signing (KMS enabled)",
          repo_detect=r"server_side_encryption_configuration|encrypted\s*=\s*true"),
    Check("imdsv2", "CloudSec", "IMDSv2 enforced on runners",
          "metadata_options http_tokens = required",
          "Set http_tokens=required in launch templates",
          repo_detect=r"http_tokens\s*=\s*\"required\""),
    Check("signing_key", "CloudSec", "Firmware/artifact signing key",
          "KMS (CloudHSM-swappable) SIGN_VERIFY key, scoped to fw pool",
          "terraform apply module.signing",
          repo_detect=r"aws_kms_key.+SIGN_VERIFY|customer_master_key_spec",
          aws_detect="signing_key"),

    # ---------------- Runners ----------------
    Check("runner_pools", "Runners", "EC2 runner pools (cpu/gpu/firmware)",
          "3 pools w/ real TheRock labels + custom AMIs",
          "terraform apply module.runner_pools (needs AMIs)",
          repo_detect=r"modules/runner-pools", aws_detect="asgs", severity="high"),
    Check("golden_amis", "Runners", "Golden AMIs (build/gpu/fw)",
          "Packer AMIs: Ubuntu 24.04 + docker/sccache/amdgpu-dkms/cosign",
          "packer build; feed ami_* into tfvars",
          repo_detect=r"packer/.+\.pkr\.hcl", aws_detect="custom_amis"),
    Check("eks_arc", "Runners", "EKS + ARC backend (optional)",
          "EKS node groups cpu/gpu/firmware + ARC scale sets",
          "terraform apply -var enable_k8s=true",
          repo_detect=r"modules/eks-arc", aws_detect="eks_cluster", severity="low"),

    # ---------------- Cache ----------------
    Check("sccache_s3", "Cache", "sccache S3 bucket",
          "namespaced <group>/<arch>/ compiler cache in S3",
          "terraform apply module.cache",
          repo_detect=r"modules/build-cache|SCCACHE_BUCKET", aws_detect="sccache_bucket"),
    Check("ccache_efs", "Cache", "ccache on EFS (RWX)",
          "EFS filesystem; EC2 mount + EKS CSI PVC",
          "terraform apply module.signing/eks-cache (EFS)",
          repo_detect=r"aws_efs_file_system", aws_detect="efs"),

    # ---------------- Pipeline ----------------
    Check("graph_build", "Pipeline", "Multi-arch dependency-graph build",
          "impact->matrix->parallel waves w/ cache (graph-build.yml)",
          "Add/keep graph-build.yml + buildgraph/graph.py",
          repo_detect=r"graph-build\.yml|buildgraph/graph\.py", severity="high"),
    Check("provision_pipeline", "Pipeline", "Automated provisioning pipeline",
          "provision.yml: plan->gates->apply w/ environment approval",
          "Add provision.yml (dispatch path)",
          repo_detect=r"\.github/workflows/provision\.yml", severity="high"),
    Check("hud_metrics", "Pipeline", "CI observability (HUD metrics)",
          "per-job metrics to S3 + Athena for a HUD",
          "Add hud-metrics.yml + module.hud",
          repo_detect=r"hud-metrics\.yml"),

    # ---------------- DevSecOps ----------------
    Check("opa_gate", "DevSecOps", "OPA policy gate on plan",
          "conftest guardrails: no public S3, IMDSv2, no static keys",
          "Add OPA step + infra/policies/*.rego",
          repo_detect=r"conftest|policies/.+\.rego", severity="high"),
    Check("trivy_iac", "DevSecOps", "Trivy IaC scan",
          "trivy config on infra, fail CRITICAL/HIGH",
          "Add trivy-action config scan to CI",
          repo_detect=r"trivy-action|trivy config"),
    Check("gitleaks", "DevSecOps", "Secret scanning",
          "gitleaks on every push/PR",
          "Add gitleaks workflow",
          repo_detect=r"gitleaks"),
    Check("ai_risk_gate", "DevSecOps", "AI plan-risk gate",
          "Claude reviews plan; blocks high-risk before apply",
          "Add ai/plan-risk/analyze.py step to provision.yml",
          repo_detect=r"ai/plan-risk/analyze\.py|plan-risk"),
    Check("artifact_signing", "DevSecOps", "Artifact SBOM + sign (net-new)",
          "syft SBOM + Trivy CVE + cosign + SLSA on build output",
          "Add artifact-security.yml (signs with module.signing key)",
          repo_detect=r"sbom-action|cosign", severity="medium"),
    Check("slsa_attestation", "DevSecOps", "SLSA L3 provenance",
          "SLSA L3 build provenance/attestation on release artifacts",
          "Add slsa-github-generator / in-toto provenance step",
          repo_detect=r"slsa|provenance|attestation|in-toto"),

    # ---------------- Observability (diagram: OBSERVABILITY LAYER) ----------------
    Check("obs_prometheus", "Observability", "Prometheus metrics + alerts",
          "Prometheus scrapes CI/runner/GPU + alert rules",
          "Add module.observability (Prometheus) + alert rules",
          repo_detect=r"prometheus|alert.*rules|servicemonitor"),
    Check("obs_grafana", "Observability", "Grafana dashboards + SLOs",
          "Grafana dashboards-as-code with pipeline SLOs",
          "Provision Grafana + dashboards-as-code",
          repo_detect=r"grafana|dashboards?/.+\.json"),
    Check("obs_result_reporting", "Observability", "Result reporting (JUnit/pass-rate)",
          "JUnit + pass-rate published per run",
          "Emit JUnit + publish pass-rate to result store",
          repo_detect=r"junit|pass[_-]?rate|test-results"),
    Check("obs_gpu_telemetry", "Observability", "GPU telemetry (rocm-smi exporter)",
          "rocm-smi exporter -> Prometheus GPU metrics",
          "Deploy rocm-smi exporter on GPU runners",
          repo_detect=r"rocm[-_]smi|dcgm|gpu.*exporter"),
    Check("obs_pagerduty", "Observability", "On-call routing (PagerDuty)",
          "PagerDuty routing on pipeline/SLO breach",
          "Wire alertmanager -> PagerDuty",
          repo_detect=r"pagerduty|opsgenie|alertmanager", severity="low"),

    # ---------------- GPU / Instinct (diagram: GPU INFRA · INSTINCT) ----------------
    Check("gpu_slurm", "GPU", "SLURM workload scheduler",
          "SLURM controller + compute for GPU job scheduling",
          "Provision SLURM (module.slurm)",
          repo_detect=r"slurm|sbatch|slurmd", severity="low"),
    Check("gpu_k8s_operator", "GPU", "K8s runner operator (ARC/Slinky)",
          "ARC/Slinky scale-set operator for GPU runners",
          "Install ARC controller / Slinky operator on EKS",
          repo_detect=r"actions-runner-controller|slinky|scale[-_]?set"),
    Check("gpu_sriov", "GPU", "MxGPU SR-IOV partitioning",
          "SR-IOV GPU partitioning for shared Instinct",
          "Enable MxGPU SR-IOV on GPU launch templates",
          repo_detect=r"sr-?iov|mxgpu", severity="low"),
    Check("gpu_instinct_pools", "GPU", "Instinct GPU pools (MI300X->MI50)",
          "Dedicated Instinct pools across MI300X..MI50",
          "Add Instinct pools to runner-pools tfvars",
          repo_detect=r"mi300|mi250|mi210|mi100|mi50|instinct"),

    # ---------------- extra CloudSec (diagram: SECURITY GATE + SIGNING) ----------------
    Check("secure_boot", "CloudSec", "Secure Boot / signed kernel modules",
          "Secure Boot + signed amdgpu-dkms kernel modules",
          "Sign kernel modules; enable Secure Boot in AMIs",
          repo_detect=r"secure[-_]?boot|mokutil|module.*sign"),

    # ---------------- extra Runners (diagram: RUNNER PROVISIONING) ----------------
    Check("runner_isolation", "Runners", "Isolated runner network",
          "Private subnets, no public IP, egress-only NAT",
          "Place runners in private subnets + NAT (module.network)",
          repo_detect=r"map_public_ip.*false|private.*subnet|nat_gateway"),
    Check("runner_nfs", "Runners", "NFS host-side tool mounts",
          "NFS mounts for firmware/host-side tooling",
          "Add NFS mount targets for firmware runners",
          repo_detect=r"aws_efs_mount_target|\bnfs\b"),

    # ---------------- extra Pipeline (diagram: BUILD hermetic·sealed / NIGHTLY HW-in-loop) ----------------
    Check("hermetic_build", "Pipeline", "Hermetic sealed builds",
          "No-net, pinned-deps reproducible builds",
          "Enforce hermetic build (no network, pinned deps)",
          repo_detect=r"hermetic|--no-network|sandbox.*no-net"),
    Check("hwil_nightly", "Pipeline", "HW-in-loop nightly + chaos/soak",
          "Real-silicon nightly regression + chaos/soak",
          "Add nightly HW-in-loop + chaos/soak stages",
          repo_detect=r"hw-in-loop|hwil|chaos|soak", severity="low"),
]


def categories() -> list[str]:
    seen = []
    for c in TARGET:
        if c.category not in seen:
            seen.append(c.category)
    return seen
