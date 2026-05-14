"""
Improvement plan router.

Data sourced from:
  - Live pipeline metrics (postmerge CI 16% pass, nightly 0% for 14+ days)
  - Deep analysis of 150 open GitHub issues (isaac-sim/IsaacLab)
  - 100 open pull requests analysed for active in-flight work
  - Analysis date: 2026-05-13
"""
from fastapi import APIRouter
from services import github_client as gh

router = APIRouter(prefix="/improvement", tags=["improvement"])

_ISAACLAB_SLUG = "isaac-sim/IsaacLab"

# ── Plan items ────────────────────────────────────────────────────────────────
# scope:       "infrastructure" | "product"
# in_progress: True if active PRs are already working on this item

PLAN: list[dict] = [

    # ── INFRASTRUCTURE — CRITICAL ─────────────────────────────────────────────

    {
        "id": "fix-ecr-push-failures",
        "title": "Fix ECR push failures in build-and-push-images",
        "scope": "infrastructure",
        "priority": "critical",
        "category": "reliability",
        "impact": "high",
        "effort": "low",
        "in_progress": True,
        "active_prs": [5602, 5537, 5563, 5559],
        "tags": ["nightly", "postmerge", "ecr", "infra", "ci"],
        "github_issues": [5351, 5341, 5249, 5558, 5076, 5517, 5388],
        "problem": (
            "Build-and-push-images accounts for 96% of postmerge-ci failures; nightly at 0% pass for 14+ days. "
            "Issues #5558 (packaging==23.0 pin), #5351 (broken pip in Docker), #5517 (isaaclab.sh --install failures), "
            "and #5388 (silent build failures from source) are all confirmed open. "
            "PR #5602 disables test timeout retry and PR #5537 addresses nightly changelog deprecations, "
            "but the root ECR credential and packaging conflicts remain unfixed."
        ),
        "root_causes": [
            "ECR push credentials expired or OIDC token TTL exceeded during long GPU builds",
            "isaacsim-core pins packaging==23.0, conflicts with pip vendored module (#5558)",
            "Missing vendored packaging module inside Isaac Lab Docker image (#5351)",
            "isaaclab.sh --install fails silently with isaacsim on certain configurations (#5517)",
            "No retry logic: single network blip or auth failure fails entire job",
        ],
        "actions": [
            "Verify ECR IAM role trust policy and OIDC provider configuration",
            "Rotate AWS credentials used by GitHub Actions OIDC",
            "Land PR #5571 (centralize external pins) to prevent future packaging conflicts",
            "Land PR #5563 (installation tests for conda/uv) to catch install regressions in CI",
            "Add retry logic using nick-fields/retry (3 attempts, 60s delay) to ECR push step",
            "Add ecr-push-health workflow: hourly run alerting on first failure",
        ],
        "files": [
            ".github/workflows/postmerge-ci.yml",
            ".github/workflows/nightly.yml",
            "docker/Dockerfile",
            "tools/python_deps.py",
        ],
        "estimated_savings": {
            "pass_rate_delta": "+80% postmerge, +100% nightly",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    # ── PRODUCT — CRITICAL ────────────────────────────────────────────────────

    {
        "id": "blackwell-gpu-support",
        "title": "Fix Blackwell GPU (RTX 5090 / 5070 Ti) crashes and NVRTC arch errors",
        "scope": "product",
        "priority": "critical",
        "category": "reliability",
        "impact": "high",
        "effort": "medium",
        "in_progress": False,
        "active_prs": [],
        "tags": ["blackwell", "rtx-5090", "nvrtc", "cuda", "tiled-camera", "gpu"],
        "github_issues": [5140, 4951, 5001, 5520],
        "problem": (
            "Issue #5520 (13 comments — most engaged issue) reports NVRTC error: invalid value for --gpu-architecture (-arch) "
            "blocking CUDA kernel compilation on Blackwell GPUs. "
            "Issues #4951 and #5001 show TiledCamera hanging on RTX 5090 (sm_120 architecture). "
            "Issue #5140 shows GUI crashes on RTX 5070 Ti with driver 595.79. "
            "Blackwell is the current-gen GPU family; no fix in flight."
        ),
        "root_causes": [
            "CUDA compilation flags don't include sm_90a (Hopper) or sm_120 (Blackwell) targets (#5520)",
            "TiledCamera CUDA kernel is not compiled for GB202/GB203 silicon (#4951, #5001)",
            "Driver 595.79 exposes a new GPU init path that crashes the legacy headless GUI (#5140)",
            "No Blackwell-class runner in CI matrix — regressions not caught before release",
        ],
        "actions": [
            "Add sm_90a and sm_120 to CUDA_ARCH_LIST in CMakeLists / setup.py (#5520 fix)",
            "Update TiledCamera CUDA kernel to support sm_120 architecture",
            "Test with RTX 5090 Desktop (GB202) and Laptop (GB203) — different silicon (#5001)",
            "Add Blackwell driver compatibility check to isaaclab.sh startup",
            "Add at least one Blackwell-class runner to the nightly CI matrix",
        ],
        "files": [
            "source/isaaclab/isaaclab/sensors/camera/tiled_camera.py",
            "setup.py",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Unblocks entire Blackwell GPU user base",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    {
        "id": "dependency-management-overhaul",
        "title": "Fix dependency hell: pip conflicts, packaging pins, isaaclab.sh install",
        "scope": "product",
        "priority": "critical",
        "category": "reliability",
        "impact": "high",
        "effort": "medium",
        "in_progress": True,
        "active_prs": [5571, 5566, 5201],
        "tags": ["pip", "packaging", "docker", "installation", "uv", "conda"],
        "github_issues": [5558, 5351, 5249, 5341, 5517, 5388, 5368],
        "problem": (
            "49 open issues (33% of all issues) relate to Docker/pip/install failures. "
            "PR #5571 (DRAFT: centralize external pins in tools/python_deps.py) and "
            "PR #5566 (drop mujoco/mujoco-warp explicit pins) are in flight but not landed. "
            "PR #5201 adds pip/uv installable workspace meta-package. "
            "Root conflicts: isaacsim-core pins packaging==23.0, isaaclab.sh --install fails silently, "
            "CloudXR teleop extension not resolved in Isaac Sim 6.0 pip install (#5368)."
        ),
        "root_causes": [
            "isaacsim-core hard-pins packaging==23.0 conflicting with pip internals (#5558)",
            "No single source of truth for dependency versions — each package pins independently",
            "isaaclab.sh --install silently exits without error on isaacsim conflicts (#5517)",
            "CloudXR extension (isaacsim.kit.xr.teleop.bridge) not published in Isaac Sim 6.0 pip (#5368)",
            "No lock file — resolves differently per environment, Python version, and OS",
        ],
        "actions": [
            "Land PR #5571: centralize all external pins in tools/python_deps.py",
            "Land PR #5566: drop explicit mujoco pins, defer to newton[sim] extras",
            "Land PR #5201: make IsaacLab pip/uv installable via workspace meta-package",
            "Add post-install smoke test to isaaclab.sh: python -c 'import isaaclab'",
            "Generate requirements-lock.txt via pip-compile for all supported Python versions",
            "Land PR #5563: installation tests (conda/uv) in CI to catch regressions",
        ],
        "files": [
            "tools/python_deps.py",
            "setup.py",
            "isaaclab.sh",
            "docker/Dockerfile",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Closes ~49 open install issues",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
            "cost_note": "Reduces user support burden significantly",
        },
    },

    # ── INFRASTRUCTURE — HIGH ─────────────────────────────────────────────────

    {
        "id": "right-runner-assignment",
        "title": "Assign right runners by PR classification",
        "scope": "infrastructure",
        "priority": "high",
        "category": "cost",
        "impact": "high",
        "effort": "medium",
        "in_progress": False,
        "active_prs": [],
        "tags": ["runners", "gpu", "cost", "ci", "paths-filter"],
        "github_issues": [],
        "problem": (
            "33 check runs per PR; 70% skipped. "
            "Of 100 open PRs, 32 are documentation-only — all still trigger GPU runners unnecessarily. "
            "Docs, refactor, and dependency-bump PRs spin up A100-80GB runners that finish skipped in <1 min."
        ),
        "root_causes": [
            "No PR classification in CI dispatch — all PRs trigger the same full matrix",
            "32% of open PRs are documentation-only but still trigger GPU runners",
            "ci-only PRs (workflow changes) trigger GPU builds with no validation value",
        ],
        "actions": [
            "Add dorny/paths-filter job at workflow start to classify PRs",
            "Gate GPU matrix: if: needs.classify.outputs.source == 'true'",
            "docs/refactor/dependency PRs → ubuntu-latest only (no GPU)",
            "source PRs → GPU matrix limited to latest Isaac Sim on PRs; full on merge",
            "Reduces wasted GPU runner starts by ~70% based on current PR mix",
        ],
        "files": [
            ".github/workflows/build.yml",
            ".github/workflows/postmerge-ci.yml",
        ],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": "~40 GPU-hours/week saved",
            "time_per_run_min": 30,
        },
    },

    {
        "id": "pr-matrix-reduction",
        "title": "Reduce PR CI matrix: 1 Isaac Sim version on PRs, all 3 on merge",
        "scope": "infrastructure",
        "priority": "high",
        "category": "performance",
        "impact": "high",
        "effort": "medium",
        "in_progress": False,
        "active_prs": [],
        "tags": ["matrix", "gpu", "pr-ci", "cost", "isaac-sim-6"],
        "github_issues": [5435, 5520],
        "problem": (
            "PRs run the full 10-cell matrix against all 3 Isaac Sim versions. "
            "With Isaac Sim 6.0 compatibility gaps (#5435), running old versions on every PR "
            "wastes GPU and masks which version is actually broken. "
            "60% of matrix work on every PR can be eliminated."
        ),
        "root_causes": [
            "No distinction between PR CI and post-merge CI matrix strategy",
            "PR CI designed for maximum coverage at maximum GPU cost",
            "Running 3 Isaac Sim versions on every PR delays feedback by running irrelevant combinations",
        ],
        "actions": [
            "Gate full matrix behind: if: github.event_name != 'pull_request'",
            "On PRs: run 4 cells (latest Isaac Sim × 4 extensions) only",
            "On push/merge: run full 10-cell matrix for comprehensive regression detection",
            "Nightly: retain full matrix as the cross-version compatibility gate",
        ],
        "files": [".github/workflows/build.yml"],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": "60% reduction in PR GPU usage",
            "time_per_run_min": 35,
        },
    },

    {
        "id": "dockerfile-buildkit-caching",
        "title": "Optimize Dockerfile layer ordering and BuildKit cache mounts",
        "scope": "infrastructure",
        "priority": "high",
        "category": "performance",
        "impact": "high",
        "effort": "medium",
        "in_progress": True,
        "active_prs": [5376, 5274, 5198],
        "tags": ["docker", "buildkit", "cache", "ci-time"],
        "github_issues": [5388, 5341, 5076, 5068, 5350],
        "problem": (
            "Issues #5388 and #5341 confirm silent failures and broken pip inside Docker. "
            "Issue #5350 reports Isaac Sim overconsumes RAM — a significant memory bottleneck. "
            "PRs #5376 (Dockerfile.curobo ROOT user fix), #5274 (Dockerize docs rendering), "
            "and #5198 (mount path alignment with Isaac Sim 5.1.0) are in flight but don't "
            "address the core layer caching and dependency ordering problems."
        ),
        "root_causes": [
            "COPY . . placed before pip install invalidates all pip cache layers on file change",
            "No BuildKit cache mounts — pip packages re-downloaded every build",
            "System libraries (openblas, libhdf5) installed after Python packages — causes #5068, #5076",
            "Isaac Sim RAM overconsumption (#5350) — no memory limit in Docker run flags",
        ],
        "actions": [
            "Reorder Dockerfile: COPY requirements*.txt first, RUN pip install, then COPY source",
            "Add BuildKit cache mounts: RUN --mount=type=cache,target=/root/.cache/pip pip install ...",
            "Add apt cache mount: RUN --mount=type=cache,target=/var/cache/apt apt-get install ...",
            "Pre-install system libraries (openblas, libhdf5) before Python packages",
            "Add --memory and --memory-swap flags to docker run in isaaclab.sh for RAM limits (#5350)",
            "Enable DOCKER_BUILDKIT=1 and --cache-from type=registry in all CI workflows",
        ],
        "files": [
            "docker/Dockerfile",
            "docker/Dockerfile.base",
            ".github/workflows/postmerge-ci.yml",
        ],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": "~8 GPU-hours/week (faster builds)",
            "time_per_run_min": 18,
        },
    },

    {
        "id": "matrix-base-deduplication",
        "title": "Build base image once per Isaac Sim version; extend in parallel",
        "scope": "infrastructure",
        "priority": "high",
        "category": "performance",
        "impact": "high",
        "effort": "high",
        "in_progress": False,
        "active_prs": [],
        "tags": ["matrix", "docker", "ci-time", "deduplication"],
        "github_issues": [],
        "problem": (
            "The 4×3 matrix rebuilds the base IsaacLab image 4 times per Isaac Sim version. "
            "With 22 Newton-related PRs in flight and OVPHYSX integration adding more matrix cells, "
            "this redundancy will compound. 12 redundant base rebuilds per nightly run today "
            "will grow to 16+ as new backends are added."
        ),
        "root_causes": [
            "No dependency between base and extension jobs — each matrix cell starts from scratch",
            "22 Newton PRs add new backend variants, each needing a separate base build",
            "No registry-hosted intermediate base image for extensions to inherit",
        ],
        "actions": [
            "Stage 1: build-base (1 job per Isaac Sim version → push isaaclab-base:{version} to ECR)",
            "Stage 2: build-extensions (matrix 4 ext × 3 sim, needs: build-base, FROM isaaclab-base)",
            "Stage 2 extension layers are ~1–5 min each once base is pre-built",
            "Use --cache-from type=registry to skip Stage 1 when base is unchanged",
            "On PRs: Stage 1 for latest Isaac Sim only; Stage 2 all 4 extensions",
        ],
        "files": [
            ".github/workflows/postmerge-ci.yml",
            ".github/workflows/nightly.yml",
            "docker/Dockerfile",
        ],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": "~20 GPU-hours/week",
            "time_per_run_min": 28,
        },
    },

    # ── PRODUCT — HIGH ────────────────────────────────────────────────────────

    {
        "id": "isaac-sim-6-compatibility",
        "title": "Systematic Isaac Sim 6.0 extension and API compatibility fixes",
        "scope": "product",
        "priority": "high",
        "category": "reliability",
        "impact": "high",
        "effort": "high",
        "in_progress": True,
        "active_prs": [5598, 5553, 5394, 5569],
        "tags": ["isaac-sim-6", "compatibility", "extensions", "migration", "ovphysx"],
        "github_issues": [5435, 5520, 5590, 5572, 5221, 5368],
        "problem": (
            "35% of all issues mention Isaac Sim 6.0, Blackwell, or new GPU drivers. "
            "PR #5598 fixes 'No module named isaaclab_physx' (critical — landed). "
            "PR #5553 switches assets.py to async omni.client calls (Isaac Sim 6.0 API). "
            "PR #5394 updates URDF/MJCF importer to latest Isaac Sim importer. "
            "But #5435 (extensions missing in 6.0), #5221 (CloudXR bridge missing), "
            "and #5572 (--viz kit ignored in 3.0 beta) remain open."
        ),
        "root_causes": [
            "Extension import paths changed in Isaac Sim 6.0 (omni.isaac.* → isaacsim.*) (#5435)",
            "CloudXR extension (isaacsim.kit.xr.teleop.bridge) not in Isaac Sim 6.0 pip (#5221, #5368)",
            "AppLauncher --viz/--livestream flags not updated for Isaac Sim 6.0 launch API (#5572)",
            "USD asset relative path resolution changed behavior (#5590)",
            "OVPHYSX integration (15+ PRs in flight) adds new extension dependency surface area",
        ],
        "actions": [
            "Audit all omni.isaac.* imports; replace with isaacsim.* — track in migration checklist",
            "Fix AppLauncher to respect --viz/--livestream flags in Isaac Sim 6.0",
            "Coordinate with Isaac Sim team on CloudXR extension availability in pip (#5221)",
            "Update USD asset loading to use absolute paths or explicit stage resolver (#5590)",
            "Add Isaac Sim 6.0 as required matrix cell in nightly CI",
            "Create migration guide: Isaac Sim 5.x → 6.0 API changes",
        ],
        "files": [
            "source/isaaclab/isaaclab/app/app_launcher.py",
            "source/isaaclab/isaaclab/utils/assets.py",
            ".github/workflows/nightly.yml",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Closes 6 open issues, unblocks Isaac Sim 6.0 users",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    {
        "id": "rsl-rl-compatibility",
        "title": "Fix RSL-RL 4.0+ / 5.0 compatibility across train and play scripts",
        "scope": "product",
        "priority": "high",
        "category": "reliability",
        "impact": "high",
        "effort": "low",
        "in_progress": True,
        "active_prs": [5390, 5551, 5554],
        "tags": ["rsl-rl", "training", "compatibility", "scripts"],
        "github_issues": [5363, 5393, 5562],
        "problem": (
            "PR #5390 fixes compatibility with rsl-rl-lib 5.0.1 (already in review). "
            "PR #5551 updates configs to new conventions from rsl_rl >= 5.0. "
            "PR #5554 refactors train/play scripts to a single entry point. "
            "But #5363 (play.py hangs with rsl-rl 4.0+) and #5393 (Isaac-Ant-v0 crash) are unresolved. "
            "Multi-GPU training (#5562) is also broken and has no PR in flight."
        ),
        "root_causes": [
            "rsl-rl 4.0.0+ changed OnPolicyRunner API; obs_groups key renamed (#5363)",
            "rsl-rl 5.0 changed config conventions; IsaacLab configs not updated (#5551)",
            "Isaac-Ant-v0 task uses deprecated physics API incompatible with Isaac Sim 6.0 (#5393)",
            "Multi-GPU NCCL init hangs silently when one rank fails to initialize (#5562)",
        ],
        "actions": [
            "Land PR #5390: rsl-rl 5.0.1 compatibility fixes",
            "Land PR #5551: update all training configs to rsl_rl >= 5.0 conventions",
            "Land PR #5554: unified train/play entry point reduces future compat surface",
            "Fix Isaac-Ant-v0 physics API call for Isaac Sim 6.0 (#5393)",
            "Add NCCL timeout + explicit error on multi-GPU init failure (#5562)",
            "Add compatibility matrix to docs: IsaacLab version vs rsl-rl version",
        ],
        "files": [
            "setup.py",
            "scripts/reinforcement_learning/rsl_rl/train.py",
            "source/isaaclab_tasks/",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Closes 3 high-impact training issues",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    {
        "id": "multi-gpu-distributed-training",
        "title": "Fix multi-GPU training: device mismatch, NCCL hangs, buffer sync",
        "scope": "product",
        "priority": "high",
        "category": "reliability",
        "impact": "high",
        "effort": "high",
        "in_progress": True,
        "active_prs": [5594, 5514, 5395, 5472],
        "tags": ["multi-gpu", "distributed", "nccl", "performance", "buffer"],
        "github_issues": [5562, 5252],
        "problem": (
            "Issue #5562 reports multi-GPU training failures in v2.3.2 (no PR in flight). "
            "PR #5594 fixes OVRTX renderer device mismatch on multi-GPU (in review). "
            "PR #5514 enables mgpu in FrameView. "
            "PR #5395 removes GPU syncs from CircularBuffer/DelayBuffer hot path (perf fix). "
            "PR #5472 (DRAFT) fixes per-substep host syncs in InHandManipulationEnv. "
            "These are all partial fixes; NCCL init hang (#5562) has no fix yet."
        ),
        "root_causes": [
            "OVRTX renderer defaults to device 0 regardless of assigned GPU rank (#5594 fixes)",
            "FrameView not multi-GPU aware — all ranks read from rank-0 data (#5514 fixes)",
            "CircularBuffer/DelayBuffer had unnecessary GPU syncs on every step (#5395 fixes)",
            "NCCL fails silently on multi-GPU init when one rank errors — hangs all ranks (#5562)",
        ],
        "actions": [
            "Land PR #5594: OVRTX device mismatch fix for multi-GPU",
            "Land PR #5514: enable mgpu support in FrameView",
            "Land PR #5395: remove GPU syncs from buffer hot path",
            "Add NCCL timeout config + explicit error propagation for multi-GPU launch (#5562)",
            "Add multi-GPU smoke test to nightly CI (2-GPU, 100 steps, assert completion)",
        ],
        "files": [
            "source/isaaclab/isaaclab/utils/buffers/circular_buffer.py",
            "scripts/reinforcement_learning/rsl_rl/train.py",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Fixes 2 open issues, 4 PRs accelerated",
            "gpu_hours_per_week": "Faster per-step via buffer sync removal",
            "time_per_run_min": None,
        },
    },

    {
        "id": "physics-buffer-correctness",
        "title": "Fix physics correctness: velocity buffer staleness, rigid_body_view, height scanner",
        "scope": "product",
        "priority": "high",
        "category": "reliability",
        "impact": "high",
        "effort": "medium",
        "in_progress": True,
        "active_prs": [5476, 5559, 5485, 5395],
        "tags": ["physics", "buffer", "physx", "articulation", "correctness"],
        "github_issues": [5593, 5126, 5115, 5137],
        "problem": (
            "Issue #5593 (velocity-only write paths don't invalidate cache) silently corrupts training data. "
            "PR #5476 adds FrameView staleness regression test. "
            "PR #5559 (DRAFT) attempts to fix articulation timeout in Isaac Sim CI. "
            "PR #5485 fixes tendon ID resolver dtype handling. "
            "Issue #5126 (PhysX rigid_body_view body matching) and #5137 (height scanner gap terrain) remain open."
        ),
        "root_causes": [
            "Velocity write path skips cache invalidation that position write path correctly does (#5593)",
            "rigid_body_view body matching uses string comparison that breaks with USD path changes (#5126)",
            "Armature values not transferred in sim2sim scenarios (#5115)",
            "Height scanner raycasting returns incorrect values on gap terrain edges (#5137)",
            "Articulation timeout in CI causes flaky tests rather than fixing root issue (#5559)",
        ],
        "actions": [
            "Add cache invalidation after velocity-only writes in Articulation.write_joint_velocities()",
            "Land PR #5476: FrameView staleness regression test (prevents recurrence)",
            "Land PR #5485: tendon ID resolver dtype fix",
            "Fix rigid_body_view to use prim path hash instead of string comparison (#5126)",
            "Fix height scanner raycasting for gap terrain (#5137)",
            "Replace #5559 timeout workaround with root cause fix for articulation CI timeout",
        ],
        "files": [
            "source/isaaclab/isaaclab/assets/articulation/articulation.py",
            "source/isaaclab/isaaclab/sensors/ray_caster/ray_caster.py",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Fixes 4 correctness bugs that corrupt training data",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    # ── INFRASTRUCTURE — MEDIUM ───────────────────────────────────────────────

    {
        "id": "skip-ci-deduplication",
        "title": "Reduce 33 PR check runs to ~8 with paths-filter gating",
        "scope": "infrastructure",
        "priority": "medium",
        "category": "cost",
        "impact": "medium",
        "effort": "low",
        "in_progress": False,
        "active_prs": [],
        "tags": ["ci", "pr", "cost", "github-actions"],
        "github_issues": [],
        "problem": (
            "Every PR triggers 33 check runs; 70% skipped. "
            "Of 100 open PRs, 32 are docs-only and 6 are dependency bumps — none need GPU checks. "
            "Skipped jobs still consume runner startup time (~30s each) and GitHub API rate limits."
        ),
        "root_causes": [
            "Workflow runs entire matrix on every PR trigger without pre-filtering",
            "32% docs PRs and 6% dependency PRs still trigger full GPU matrix",
        ],
        "actions": [
            "Use dorny/paths-filter to output changed_docs, changed_source, changed_tests, changed_ci",
            "Gate entire GPU matrix: if: needs.filter.outputs.changed_source == 'true'",
            "docs/refactor/dependency PRs: run only pre-validate job (lint + license + link check)",
            "Update required status checks: list only 3–5 required checks (not all 33)",
        ],
        "files": [".github/workflows/build.yml"],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": "~5 GPU-hours/week",
            "time_per_run_min": 8,
        },
    },

    {
        "id": "nightly-scripts-optimization",
        "title": "Optimize nightly scripts: batch API calls, cache matrix resolution",
        "scope": "infrastructure",
        "priority": "medium",
        "category": "performance",
        "impact": "medium",
        "effort": "medium",
        "in_progress": False,
        "active_prs": [],
        "tags": ["nightly", "scripts", "optimization"],
        "github_issues": [],
        "problem": (
            "nightly-tags.sh makes serial git/ECR API calls. "
            "resolve-matrix.py recalculates the full matrix for each extension. "
            "With OVPHYSX integration (15 new PRs) adding more matrix cells, "
            "this inefficiency will compound as the matrix grows."
        ),
        "root_causes": [
            "Serial git describe calls that could be a single git tag -l | grep | sort -V | tail -1",
            "resolve-matrix.py has no caching between cells — same lookups repeated 10× (growing)",
            "aggregate-manifest.py iterates manifests one-by-one instead of using jq merge",
        ],
        "actions": [
            "Batch git API calls: git tag -l | grep pattern | sort -V | tail -1",
            "Add @lru_cache to resolve-matrix.py for repeated version lookups",
            "Merge manifests: jq -s 'reduce .[] as $x ({}; . * $x)'",
            "Store resolved matrix JSON as workflow artifact in Stage 1; download in Stage 2",
        ],
        "files": [
            "scripts/nightly-tags.sh",
            "scripts/resolve-matrix.py",
            "scripts/aggregate-manifest.py",
        ],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": None,
            "time_per_run_min": 4,
        },
    },

    {
        "id": "ecr-ttl-lifecycle-policy",
        "title": "Enforce ECR lifecycle policies and GitHub cache TTLs",
        "scope": "infrastructure",
        "priority": "medium",
        "category": "cost",
        "impact": "medium",
        "effort": "low",
        "in_progress": False,
        "active_prs": [],
        "tags": ["ecr", "registry", "cache", "ttl", "cost"],
        "github_issues": [],
        "problem": (
            "ECR images accumulate without automated cleanup. "
            "With nightly at 0% pass rate for 14+ days, broken images are accumulating "
            "without being pruned. GitHub Actions cache approaching 10 GB limit "
            "causes eviction misses forcing full re-downloads."
        ),
        "root_causes": [
            "No ECR lifecycle policy for nightly images",
            "GitHub cache managed manually with no automation",
            "Broken nightly images still pushed to ECR and not purged",
        ],
        "actions": [
            "Add ECR lifecycle policy: nightly images expire after 30 days, keep last 10",
            "Add cleanup-caches.yml workflow (weekly cron: delete caches older than 7 days)",
            "Tag broken nightly images and exclude from production pull targets",
            "Add ECR storage cost trend to Registry Manager dashboard page",
        ],
        "files": [
            ".github/workflows/cleanup-caches.yml",
            "scripts/ecr-lifecycle-policy.json",
        ],
        "estimated_savings": {
            "pass_rate_delta": None,
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
            "cost_note": "~$50–200/month ECR storage savings",
        },
    },

    {
        "id": "ci-failure-alerting",
        "title": "Add automated failure alerting for nightly and postmerge CI",
        "scope": "infrastructure",
        "priority": "medium",
        "category": "observability",
        "impact": "medium",
        "effort": "low",
        "in_progress": False,
        "active_prs": [],
        "tags": ["alerting", "nightly", "monitoring"],
        "github_issues": [],
        "problem": (
            "Nightly has been at 0% pass rate for 14+ consecutive days with no automated alert. "
            "PR #5284 (switches docs deployment from gh-pages to artifact) shows infrastructure "
            "is being modernized, but there is still no failure notification system. "
            "The 14-day streak would have been caught day 2 with alerting."
        ),
        "root_causes": [
            "No GitHub Actions failure notification configured on nightly workflow",
            "Dashboard shows metrics but has no push/email notification",
        ],
        "actions": [
            "Add notify-failure.yml: on: workflow_run [nightly, postmerge-ci] types: [completed]",
            "Send notification when nightly fails for 2+ consecutive runs",
            "Add dashboard alert banner on Overview page if nightly pass rate < 50%",
            "Track consecutive failure streak in Health Analysis page",
        ],
        "files": [".github/workflows/notify-failure.yml"],
        "estimated_savings": {
            "pass_rate_delta": "Faster MTTR — catch failures within hours not days",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    # ── PRODUCT — MEDIUM ──────────────────────────────────────────────────────

    {
        "id": "newton-backend-expansion",
        "title": "Accelerate Newton backend: IK, deformables, OVPHYSX integration",
        "scope": "product",
        "priority": "medium",
        "category": "performance",
        "impact": "high",
        "effort": "high",
        "in_progress": True,
        "active_prs": [5400, 5383, 5287, 5437, 5570, 5471, 5566],
        "tags": ["newton", "backend", "ik", "deformable", "ovphysx", "feature"],
        "github_issues": [5451, 5285, 5217, 4943],
        "problem": (
            "20 Newton issues open; 22 Newton PRs actively in flight. "
            "PR #5400 adds backend-agnostic task-space accessors for IK/OSC (addresses #5451). "
            "PRs #5383 and #5287 add Newton deformable object API (addresses #5285). "
            "PR #5437 adds Shadow-Hand-Over MAPPO on Newton backend. "
            "PR #5570 adds OVPHYSX RigidObjectCollection asset. "
            "PR #5471 (DRAFT) adds runtime backend compatibility check. "
            "These need expedited review to close the Newton feature gap."
        ),
        "root_causes": [
            "Newton backend is new — lacks feature parity with mature PhysX backend",
            "IK solver only partially ported (PR #5400 in review, not landed)",
            "Deformable object API in two competing PRs (#5383 and #5287) — need consolidation",
            "OVPHYSX integration has 15 PRs but no single owner tracking progress",
        ],
        "actions": [
            "Land PR #5400: backend-agnostic IK/OSC task-space accessors",
            "Consolidate PRs #5383 and #5287 into one deformable object PR and land",
            "Land PR #5437: Shadow-Hand-Over MAPPO Newton backend",
            "Land PR #5471: runtime backend compatibility check (warn on unsupported features)",
            "Create Newton backend tracking issue to coordinate the 22 in-flight PRs",
            "Add Newton compatibility flag to all assets; warn when unsupported feature used",
        ],
        "files": [
            "source/isaaclab/isaaclab/controllers/differential_ik.py",
            "source/isaaclab/isaaclab/assets/deformable_object/",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Closes 4 feature issues, 22 PRs accelerated",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },

    {
        "id": "installation-ux",
        "title": "Improve installation UX: pip/uv installable, air-gap, third-party packaging",
        "scope": "product",
        "priority": "medium",
        "category": "reliability",
        "impact": "medium",
        "effort": "medium",
        "in_progress": True,
        "active_prs": [5201, 5334, 5255],
        "tags": ["installation", "packaging", "airgap", "uv", "pip"],
        "github_issues": [5313, 5084, 4742],
        "problem": (
            "PR #5201 makes IsaacLab pip/uv installable via workspace meta-package (in review). "
            "PR #5334 adds agentic installation guide to AGENTS.md. "
            "PR #5255 adds Remote GPU setup instructions. "
            "Issue #5313 (air-gap/standalone) and #4742 (remove pxr import from utils) remain open. "
            "pxr imported at module level in utils forces full Isaac Sim as hard dep for any downstream tool."
        ),
        "root_causes": [
            "No offline install bundle or wheel distribution for air-gapped environments",
            "pxr (USD) imported at module level — forces Isaac Sim as hard dep for utils-only usage",
            "isaaclab.sh ties all operations to Isaac Sim binary installation path",
        ],
        "actions": [
            "Land PR #5201: pip/uv installable workspace meta-package",
            "Move pxr imports inside functions / use TYPE_CHECKING guard (#4742)",
            "Add make-bundle.sh to create offline installable tar of all wheels (#5313)",
            "Split isaaclab into isaaclab-core (no Isaac Sim dep) and isaaclab-sim",
        ],
        "files": [
            "source/isaaclab/isaaclab/utils/__init__.py",
            "isaaclab.sh",
            "setup.py",
        ],
        "estimated_savings": {
            "pass_rate_delta": "Closes 3 issues, enables enterprise and air-gap deployments",
            "gpu_hours_per_week": None,
            "time_per_run_min": None,
        },
    },
]


# ── Issues analysis dataset ───────────────────────────────────────────────────
# Updated from deep GitHub analysis on 2026-05-13 (150 issues, 100 PRs)

ISSUES_ANALYSIS = {
    "total_open": 150,
    "total_open_prs": 100,
    "fetched_at": "2026-05-13",
    "source": "isaac-sim/IsaacLab",
    "category_counts": {
        "product_bug":     75,
        "infrastructure":  54,
        "product_feature": 17,
        "other":            4,
    },
    "pr_category_counts": {
        "documentation":  32,
        "infrastructure": 24,
        "product_bugfix": 22,
        "product_feature": 9,
        "refactor":        6,
        "dependency":      6,
    },
    "infrastructure_issues": [
        {"number": 5558, "title": "Pip dependency resolver conflict: isaacsim-core pins packaging==23.0", "labels": ["bug"], "severity": "critical"},
        {"number": 5517, "title": "isaaclab.sh --install cannot work with isaacsim", "labels": ["bug"], "severity": "critical"},
        {"number": 5435, "title": "Develop branch fails to launch: Isaac Sim 6.0 extensions missing", "labels": ["bug"], "severity": "critical"},
        {"number": 5388, "title": "Building Isaac Lab v2.3.2 from source fails silently (binary + Docker)", "labels": ["bug"], "severity": "critical"},
        {"number": 5351, "title": "Broken pip in Isaac Lab Docker (missing vendored packaging module)", "labels": ["bug"], "severity": "critical"},
        {"number": 5350, "title": "Isaac Sim overconsumes RAM — significant memory bottleneck", "labels": [], "severity": "critical"},
        {"number": 5368, "title": "isaacsim.kit.xr.teleop.bridge extension not resolved in Isaac Sim 6.0 pip", "labels": ["bug"], "severity": "high"},
        {"number": 5341, "title": "Install fail because of old API dependency", "labels": ["bug"], "severity": "high"},
        {"number": 5249, "title": "Dependency conflict during isaaclab installation v3.0.0-beta", "labels": ["bug"], "severity": "high"},
        {"number": 5245, "title": "Include CUDA 570 requirement in installation steps", "labels": [], "severity": "high"},
        {"number": 5221, "title": "isaacsim.kit.xr.teleop.bridge extension not found — CloudXR cannot function", "labels": [], "severity": "high"},
        {"number": 5076, "title": "ImportError: DLL load failed (h5py)", "labels": ["bug"], "severity": "high"},
        {"number": 5068, "title": "ImportError: libopenblas64_p missing when importing Replicator", "labels": ["bug"], "severity": "high"},
        {"number": 5313, "title": "Stand-alone / air-gap installation support", "labels": ["enhancement"], "severity": "medium"},
        {"number": 5302, "title": "PhysX joint actuation ineffective with legacy _setup_scene cloning path", "labels": [], "severity": "medium"},
        {"number": 5084, "title": "Improvements to support distribution & third-party packaging", "labels": ["enhancement"], "severity": "medium"},
        {"number": 4742, "title": "Remove pxr import from isaaclab.utils.*", "labels": [], "severity": "medium"},
    ],
    "product_bug_issues": [
        {"number": 5520, "title": "RuntimeError: invalid value for --gpu-architecture (-arch) [13 comments]", "labels": ["question"], "severity": "critical"},
        {"number": 5593, "title": "Articulation velocity-only write paths don't invalidate cached buffers", "labels": ["bug"], "severity": "critical"},
        {"number": 5562, "title": "Multi-GPU Training fails in IsaacLab 2.3.2", "labels": [], "severity": "critical"},
        {"number": 5572, "title": "lift_cube_sm.py ignores --viz kit in Isaac Lab 3.0 beta", "labels": ["bug"], "severity": "critical"},
        {"number": 5480, "title": "Unable to run example: add a new robot to Isaac Lab", "labels": ["bug"], "severity": "critical"},
        {"number": 5416, "title": "Cannot start UR10-reach task training", "labels": ["bug"], "severity": "critical"},
        {"number": 5363, "title": "play.py hangs in OnPolicyRunner init with rsl-rl 4.0.0+", "labels": ["bug"], "severity": "critical"},
        {"number": 5362, "title": "AppLauncher deadlocks at ~6.3s with streaming experience", "labels": ["bug"], "severity": "critical"},
        {"number": 5140, "title": "GUI crash on RTX 5070 Ti (Blackwell) with driver 595.79", "labels": ["bug"], "severity": "critical"},
        {"number": 4951, "title": "TiledCamera hangs on RTX 5090 (Blackwell sm_120)", "labels": ["bug"], "severity": "critical"},
        {"number": 5001, "title": "TiledCamera hangs on RTX 5090 Laptop (GB203) vs Desktop (GB202)", "labels": ["bug"], "severity": "critical"},
        {"number": 5393, "title": "Training example crashes on Isaac-Ant-v0 task", "labels": [], "severity": "high"},
        {"number": 5364, "title": "play.py with --livestream 2 has blank viewport", "labels": ["bug"], "severity": "high"},
        {"number": 5355, "title": "RSL-RL 4.0+ obs_groups key missing — training hangs", "labels": ["bug"], "severity": "high"},
        {"number": 5262, "title": "VisualizationMarkers uses wrong prototype", "labels": ["bug"], "severity": "high"},
        {"number": 5237, "title": "Isaac Lab develop branch drops Python return codes", "labels": ["bug"], "severity": "high"},
        {"number": 5126, "title": "PhysX rigid_body_view fails to match bodies", "labels": ["bug"], "severity": "high"},
        {"number": 5115, "title": "Inconsistency in Sim2Sim Transfer with Armature", "labels": ["bug"], "severity": "high"},
        {"number": 5137, "title": "Misleading height scanner reading on gap terrains", "labels": ["bug"], "severity": "high"},
        {"number": 5590, "title": "Relative texture path doesn't work in IsaacLab Beta", "labels": [], "severity": "medium"},
        {"number": 5252, "title": "WandB logging broken with skrl 2.0.0 in IsaacLab 2.3.2", "labels": ["bug"], "severity": "medium"},
        {"number": 5159, "title": "Deformables visualization issues", "labels": ["bug"], "severity": "medium"},
        {"number": 5057, "title": "Multiple wp.to_torch wrappers are missing", "labels": [], "severity": "medium"},
    ],
    "product_feature_issues": [
        {"number": 5451, "title": "Support Differential IK on the Newton backend", "labels": ["enhancement"], "demand": "very_high"},
        {"number": 5285, "title": "Add Newton deformable object API with rigid-deformable simulation", "labels": ["enhancement"], "demand": "very_high"},
        {"number": 5217, "title": "Configurable self-collision group filtering for Newton articulations", "labels": ["enhancement"], "demand": "high"},
        {"number": 4943, "title": "Hydroelastic Contact Model support with Newton", "labels": [], "demand": "high"},
        {"number": 5305, "title": "Add resample_interval_on_reset to EventTermCfg", "labels": ["enhancement"], "demand": "high"},
        {"number": 5173, "title": "Extend FrameTransformer to report velocity & acceleration", "labels": ["enhancement"], "demand": "high"},
        {"number": 5313, "title": "Stand-alone / air-gap installation support", "labels": [], "demand": "medium"},
        {"number": 5084, "title": "Better third-party packaging and distribution support", "labels": ["enhancement"], "demand": "medium"},
        {"number": 4742, "title": "Remove pxr import from isaaclab.utils.* (packaging blocker)", "labels": [], "demand": "medium"},
        {"number": 5186, "title": "Imitation learning pipeline (standardized)", "labels": [], "demand": "medium"},
        {"number": 5163, "title": "Integrate frontier world models", "labels": [], "demand": "medium"},
        {"number": 5216, "title": "Document clone_environments requirement for DirectRLEnv on Newton", "labels": [], "demand": "medium"},
    ],
    "active_pr_clusters": [
        {
            "cluster": "Newton Backend",
            "pr_count": 22,
            "description": "Core physics, deformables, OVPHYSX sensors, IK/OSC, runtime compat checks",
            "key_prs": [5400, 5383, 5287, 5437, 5570, 5471, 5566, 5433, 5497],
            "status": "active",
        },
        {
            "cluster": "Documentation & Guides",
            "pr_count": 32,
            "description": "API docs, tutorials, preset CLI, remote GPU setup, agentic install guide",
            "key_prs": [5587, 5535, 5582, 5581, 5334, 5255],
            "status": "active",
        },
        {
            "cluster": "Infrastructure & CI",
            "pr_count": 24,
            "description": "Docker fixes, dependency centralization, installation tests, CI deprecations",
            "key_prs": [5571, 5563, 5602, 5537, 5376, 5274, 5198],
            "status": "active",
        },
        {
            "cluster": "Product Bug Fixes",
            "pr_count": 22,
            "description": "Multi-GPU fixes, buffer correctness, RSL-RL compat, physics fixes, Warp integration",
            "key_prs": [5594, 5598, 5395, 5390, 5551, 5476, 5485, 5447],
            "status": "active",
        },
        {
            "cluster": "RSL-RL 5.0 Compatibility",
            "pr_count": 3,
            "description": "Config convention updates, single entry point, rsl-rl 5.0.1 fixes",
            "key_prs": [5390, 5551, 5554],
            "status": "active",
        },
    ],
    "key_insights": [
        "Installation fragility: 49 issues (33%) are Docker/pip/install failures — single biggest pain point for new users",
        "Blackwell GPU gap: RTX 5090/5070 Ti users hit TiledCamera hangs and NVRTC -arch errors (#5520 is most commented); zero PRs in flight",
        "Newton backend: 22 PRs actively in flight — highest development velocity of any area, needs coordination",
        "Isaac Sim 6.0 migration: 35% of issues reference 6.0 or new GPU hardware — systematic API migration underway but incomplete",
        "RSL-RL version chaos: 3 breaking RSL-RL versions (4.0, 5.0.1) active in parallel; 3 PRs in review to fix",
        "Physics correctness: velocity buffer staleness (#5593) silently corrupts training data — no PR yet",
        "Multi-GPU unblocked for renderer but NCCL hang (#5562) has no fix in flight",
        "Documentation surge: 32 doc PRs (32% of all PRs) shows active investment in developer experience",
        "Draft PR bottleneck: 10 DRAFT PRs including critical dependency centralization (#5571) and install tests (#5563)",
    ],
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

async def _dynamic_plan(slug: str) -> dict:
    """Fetch real open issues/PRs from GitHub and build a lightweight plan."""
    issues_data = await gh.get_issues(state="open", per_page=50)
    prs_data = await gh.get_prs(state="open", per_page=50)
    issues = issues_data if isinstance(issues_data, list) else []
    prs = prs_data if isinstance(prs_data, list) else []
    bug_issues = [i for i in issues if any(l.get("name", "").lower() in ("bug", "bug report") for l in i.get("labels", []))]
    items = [
        {
            "id": f"issue-{i['number']}",
            "title": i["title"],
            "scope": "product",
            "priority": "high" if any(l.get("name", "").lower() in ("bug", "critical") for l in i.get("labels", [])) else "medium",
            "category": "reliability",
            "impact": "medium",
            "effort": "medium",
            "in_progress": False,
            "active_prs": [],
            "tags": [l.get("name", "") for l in i.get("labels", [])],
            "github_issues": [i["number"]],
            "problem": i.get("body", "")[:300] if i.get("body") else "",
            "root_causes": [],
            "actions": [f"Resolve issue #{i['number']}: {i['title']}"],
            "files": [],
            "estimated_savings": {},
        }
        for i in issues[:20]
    ]
    return {
        "summary": {
            "total_items": len(items),
            "infrastructure_items": 0,
            "product_items": len(items),
            "in_progress_items": 0,
            "infrastructure_counts": {"critical": 0, "high": 0, "medium": 0},
            "product_counts": {
                "critical": sum(1 for i in items if i["priority"] == "critical"),
                "high": sum(1 for i in items if i["priority"] == "high"),
                "medium": sum(1 for i in items if i["priority"] == "medium"),
            },
            "total_time_saved_per_run_min": 0,
            "github_issues_addressed": len(bug_issues),
            "active_prs_tracked": len(prs),
            "context": {
                "postmerge_pass_rate": None,
                "nightly_pass_rate": None,
                "total_open_issues": len(issues),
                "total_open_prs": len(prs),
                "note": f"Live data for {slug}",
            },
        },
        "items": items,
    }


@router.get("/plan")
async def get_improvement_plan():
    slug = gh.get_active_repo_slug()
    if slug.lower() != _ISAACLAB_SLUG.lower():
        return await _dynamic_plan(slug)

    infra_items  = [i for i in PLAN if i["scope"] == "infrastructure"]
    product_items = [i for i in PLAN if i["scope"] == "product"]

    total_time_saved = sum(
        item["estimated_savings"].get("time_per_run_min") or 0
        for item in PLAN
    )

    def counts(items):
        return {
            "critical": sum(1 for i in items if i["priority"] == "critical"),
            "high":     sum(1 for i in items if i["priority"] == "high"),
            "medium":   sum(1 for i in items if i["priority"] == "medium"),
        }

    in_progress_items = [i for i in PLAN if i.get("in_progress")]
    all_active_prs = sorted({n for i in PLAN for n in i.get("active_prs", [])})
    all_issues_addressed = sorted({n for i in PLAN for n in i.get("github_issues", [])})

    return {
        "summary": {
            "total_items":              len(PLAN),
            "infrastructure_items":     len(infra_items),
            "product_items":            len(product_items),
            "in_progress_items":        len(in_progress_items),
            "infrastructure_counts":    counts(infra_items),
            "product_counts":           counts(product_items),
            "total_time_saved_per_run_min": total_time_saved,
            "github_issues_addressed":  len(all_issues_addressed),
            "active_prs_tracked":       len(all_active_prs),
            "context": {
                "postmerge_pass_rate":      16,
                "nightly_pass_rate":         0,
                "checks_per_pr":            33,
                "checks_skipped_pct":       70,
                "infra_failure_pct":        96,
                "nightly_fail_streak_days": 14,
                "total_open_issues":       ISSUES_ANALYSIS["total_open"],
                "total_open_prs":          ISSUES_ANALYSIS["total_open_prs"],
            },
        },
        "items": PLAN,
    }


@router.get("/issues-analysis")
async def get_issues_analysis():
    slug = gh.get_active_repo_slug()
    if slug.lower() != _ISAACLAB_SLUG.lower():
        issues_data = await gh.get_issues(state="open", per_page=100)
        issues = issues_data if isinstance(issues_data, list) else []
        label_counts: dict[str, int] = {}
        for issue in issues:
            for label in issue.get("labels", []):
                name = label.get("name", "unknown")
                label_counts[name] = label_counts.get(name, 0) + 1
        return {
            "total_open": len(issues),
            "total_open_prs": 0,
            "source": f"live · {slug}",
            "fetched_at": "just now",
            "category_counts": {"product_bug": 0, "infrastructure": 0, "product_feature": 0, "other": len(issues)},
            "pr_category_counts": {},
            "label_counts": label_counts,
            "bugs": [],
            "features": [],
            "infra": [],
        }
    return ISSUES_ANALYSIS


@router.get("/quick-wins")
async def get_quick_wins():
    slug = gh.get_active_repo_slug()
    if slug.lower() != _ISAACLAB_SLUG.lower():
        plan = await _dynamic_plan(slug)
        return {"items": [i for i in plan["items"] if i["impact"] in ("high", "medium")][:5]}
    wins = [
        item for item in PLAN
        if item["effort"] == "low" and item["impact"] in ("high", "medium")
    ]
    return {"items": wins}
