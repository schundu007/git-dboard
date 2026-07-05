import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileCode, ExternalLink, Loader2, AlertCircle, Search,
  Code2, BookOpen, Bug, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react'
import { getActiveRepo } from '../lib/api'
import { cn } from '../lib/cn'

// ─── Strict DevOps-only filter ────────────────────────────────────────────────
// Excludes documentation, diagrams, test fixtures, generated assets.
// Includes only hands-on CI/infra scripts relevant to DevOps/Platform work.

const EXCLUDED_DIR_PARTS = new Set([
  'mermaid', 'diagram', 'diagrams', 'docs', 'doc', 'documentation',
  'assets', 'public', 'static', 'images', 'media', 'icons', 'fonts',
  'tests', 'test', 'spec', 'specs', '__pycache__', 'node_modules',
  'coverage', 'dist', 'vendor', 'third_party', 'extern', 'external',
  'examples', 'example', 'sample', 'samples', 'demo', 'demos',
  'notebooks', 'notebook', 'data', 'dataset', 'datasets',
  'src', 'source', 'lib', 'libs', 'app', 'components', 'pages',
])

const INFRA_DIR_NAMES = new Set([
  '.github', 'workflows', 'actions',
  'scripts', 'script',
  'ci', 'ci-scripts', 'cicd',
  'docker', 'dockerfiles', 'containers',
  'infra', 'infrastructure', 'deploy', 'deployment',
  'tools', 'tool', 'tooling',
  'ops', 'devops', 'automation',
  'build', 'make',
  'pipeline', 'pipelines',
  'release', 'releases',
  'provision', 'ansible', 'terraform',
])

const ROOT_INFRA_FILES = new Set([
  'Dockerfile', 'Makefile', 'Procfile', 'Justfile',
  'docker-compose.yml', 'docker-compose.yaml',
  '.travis.yml', 'Jenkinsfile',
  'nixpacks.toml', 'railway.toml', 'vercel.json', 'fly.toml',
  '.env.example',
])

const INFRA_PY_KEYWORDS = [
  'deploy', 'build', 'publish', 'release', 'ci', 'check',
  'lint', 'format', 'test_runner', 'setup', 'install',
  'docker', 'infra', 'sync', 'update', 'migrate', 'provision',
  'run_tests', 'gen_', 'generate', 'manage', 'entrypoint',
]

function isExcludedDir(dir: string): boolean {
  const parts = dir.toLowerCase().split('/')
  return parts.some(p =>
    EXCLUDED_DIR_PARTS.has(p) ||
    p.includes('mermaid') ||
    p.includes('diagram') ||
    p.startsWith('tmp') ||
    p.startsWith('temp'),
  )
}

function isInInfraDir(dir: string): boolean {
  const parts = dir.toLowerCase().split('/')
  return parts.some(p => INFRA_DIR_NAMES.has(p))
}

function isInfraScript(path: string): boolean {
  const filename  = path.split('/').pop() ?? ''
  const fileLower = filename.toLowerCase()
  const ext       = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : ''
  const dir       = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

  // Never include excluded directories
  if (dir && isExcludedDir(dir)) return false

  // Root-level canonical infra files
  if (!dir && ROOT_INFRA_FILES.has(filename)) return true

  // Dockerfile variants anywhere (except excluded dirs)
  if (fileLower.startsWith('dockerfile')) return true

  // docker-compose variants anywhere
  if (fileLower.startsWith('docker-compose')) return true

  // GitHub Actions workflows / custom actions — always include
  const dirLower = dir.toLowerCase()
  if (dirLower.startsWith('.github/workflows') || dirLower.startsWith('.github/actions')) {
    return ext === '.yml' || ext === '.yaml'
  }

  // Shell scripts — only inside a recognised infra directory
  if (ext === '.sh' || ext === '.bash') {
    return isInInfraDir(dir)
  }

  // Python — only in infra dirs AND filename has an infra keyword
  if (ext === '.py') {
    if (fileLower === '__init__.py') return false
    return isInInfraDir(dir) && INFRA_PY_KEYWORDS.some(kw => fileLower.includes(kw))
  }

  // Makefile / Justfile anywhere in an infra dir
  if (filename === 'Makefile' || filename === 'Justfile' || filename === 'Procfile') {
    return !dir || isInInfraDir(dir)
  }

  // TOML / JSON config in root or known config dir
  if ((ext === '.toml' || ext === '.json') && !dir) return true

  return false
}

// ─── Language + type helpers ──────────────────────────────────────────────────

type ScriptTypeId = 'all' | 'actions' | 'shell' | 'docker' | 'python' | 'makefile'

const SCRIPT_TYPE_TABS: { id: ScriptTypeId; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'actions',  label: 'Actions'  },
  { id: 'shell',    label: 'Shell'    },
  { id: 'docker',   label: 'Docker'   },
  { id: 'python',   label: 'Python'   },
  { id: 'makefile', label: 'Make'     },
]

function langFromPath(path: string): string {
  const filename = path.split('/').pop() ?? ''
  if (filename === 'Dockerfile' || filename.startsWith('Dockerfile.')) return 'dockerfile'
  if (filename === 'Makefile' || filename === 'Justfile' || filename === 'Procfile') return 'makefile'
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : ''
  const map: Record<string, string> = {
    '.sh': 'bash', '.bash': 'bash',
    '.py': 'python',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.json': 'json',
  }
  return map[ext] ?? 'text'
}

function typeFromPath(path: string): Exclude<ScriptTypeId, 'all'> {
  const dir      = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).toLowerCase() : ''
  const filename = path.split('/').pop() ?? ''
  const lang     = langFromPath(path)
  if (dir.startsWith('.github/workflows') || dir.startsWith('.github/actions')) return 'actions'
  if (lang === 'dockerfile' || filename.toLowerCase().startsWith('docker-compose')) return 'docker'
  if (lang === 'bash') return 'shell'
  if (lang === 'python') return 'python'
  if (lang === 'makefile') return 'makefile'
  return 'shell'
}

function titleFromPath(path: string): string {
  const filename = path.split('/').pop() ?? path
  // Strip extension for clean display
  const noExt = filename.includes('.')
    ? filename.slice(0, filename.lastIndexOf('.'))
    : filename
  return noExt || filename
}

const LANG_DISPLAY: Record<string, string> = {
  bash: 'bash', python: 'python', yaml: 'yaml',
  dockerfile: 'dockerfile', makefile: 'make', toml: 'toml', json: 'json', text: 'txt',
}

const LANG_COLOR: Record<string, string> = {
  bash: 'text-[#76b900]', python: 'text-[#3b82f6]', yaml: 'text-[#f59e0b]',
  dockerfile: 'text-[#0db7ed]', toml: 'text-[#a855f7]', json: 'text-[#f97316]',
  makefile: 'text-neutral-400',
}

// ─── GitHub fetch (proxied through backend to support private repos) ──────────

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

async function fetchTree(owner: string, repo: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/proxy/tree?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const data = await res.json()
  return (data.tree ?? [])
    .filter((f: any) => f.type === 'blob' && isInfraScript(f.path))
    .map((f: any) => f.path as string)
}

async function fetchContent(owner: string, repo: string, path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/proxy/content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const data = await res.json()
  if (data.encoding === 'base64') return atob(data.content.replace(/\n/g, ''))
  return data.content ?? ''
}

// ─── Explain / Issues / Deep Dive content (keyed by lang) ────────────────────

// Concept tags by language
const JD_CONCEPTS: Record<string, string[]> = {
  bash: ['set -euo pipefail', 'multi-repo orchestration', 'batch/HPC job submission', 'container runtime', 'Docker build/push', 'self-hosted runner setup', 'CI entrypoint design', 'artifact staging'],
  python: ['release automation', 'semantic versioning', 'registry artifact publishing', 'CI pipeline orchestration', 'subprocess.run', 'GITHUB_STEP_SUMMARY', 'health-check automation', 'multi-repo dependency resolution'],
  yaml: ['pre-merge validation', 'nightly test pipeline', 'release pipeline', 'multi-arch builds (ARM64/x86-64)', 'self-hosted runners', 'reusable workflows (workflow_call)', 'matrix strategy', 'registry image publishing', 'concurrency/cancel-in-progress', 'permissions: least privilege'],
  dockerfile: ['multi-stage build', 'multi-arch (buildx/QEMU)', 'pinned base image', 'ARM64 target', 'layer cache efficiency', 'distroless/minimal final stage', 'ENTRYPOINT signal handling'],
  makefile: ['phony targets', 'variable overrides', 'parallel build (-j)', 'cross-compilation', 'build-system integration', 'reproducible builds'],
}

function describeScript(path: string): { summary: string; steps: string[]; concepts: string[] } {
  const lang     = langFromPath(path)
  const filename = path.split('/').pop() ?? path
  const dir      = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const dirL     = dir.toLowerCase()

  const isAction  = dirL.startsWith('.github/workflows') || dirL.startsWith('.github/actions')
  const isRelease = filename.toLowerCase().includes('release') || filename.toLowerCase().includes('publish')
  const isNightly = filename.toLowerCase().includes('nightly') || filename.toLowerCase().includes('schedule')
  const isPremerge = filename.toLowerCase().includes('pr') || filename.toLowerCase().includes('premerge') || filename.toLowerCase().includes('pre-merge') || filename.toLowerCase().includes('ci')
  const isDocker  = lang === 'dockerfile' || filename.toLowerCase().startsWith('docker-compose')
  const isMultiArch = filename.toLowerCase().includes('arm') || filename.toLowerCase().includes('aarch') || filename.toLowerCase().includes('multiarch') || filename.toLowerCase().includes('multi-arch')

  const summary: Record<string, string> = {
    bash: `Shell script at \`${path}\`. Shell scripts orchestrate multi-step build/test/deploy flows — setting up the build/runtime environment, invoking the project's build command, managing Docker image builds, coordinating batch/HPC scheduler jobs (e.g. SLURM) for heavier test runs, and wrapping application launch sequences for CI runners.`,
    python: `Python automation script at \`${path}\`. Python is a common choice for CI glue: build matrix resolution, test result aggregation into \`$GITHUB_STEP_SUMMARY\`, semantic version bumping, artifact publishing to a container registry, and multi-repo dependency graph management.`,
    yaml: isRelease
      ? `Release pipeline workflow at \`${filename}\`. Release pipelines publish versioned Docker images to a container registry (e.g. GHCR/ECR), generate changelogs, tag the git tree with semantic versions, and distribute pre-built packages via artifact stores.`
      : isNightly
      ? `Nightly scheduled workflow at \`${filename}\`. Nightly pipelines execute the full test matrix — all build/platform combinations, longer-running integration tests on self-hosted runners, optional batch/HPC scheduler jobs — and publish a pass/fail report to the GitHub step summary and Slack.`
      : isPremerge
      ? `Pre-merge CI workflow at \`${filename}\`. Pre-merge pipelines run fast, parallelised smoke tests to gate every pull request: lint, unit tests, a build on ubuntu/x86-64, and optionally ARM64 cross-build validation. Failures block the merge queue.`
      : `GitHub Actions workflow at \`${filename}\`. Defines the trigger events, runner configuration, and steps to build, test, or deploy the project.`,
    dockerfile: isMultiArch
      ? `Multi-architecture Dockerfile at \`${path}\`. Builds images for both x86-64 and ARM64 targets using Docker buildx and QEMU emulation. Containers that must run on ARM64 targets and x86-64 development machines require verified multi-arch manifests published to a container registry (e.g. GHCR/ECR).`
      : `Dockerfile at \`${path}\`. Containers extend a base image to layer the build/runtime environment, compiled artifacts, and runtime dependencies. Pinned base image digests ensure reproducible builds across pre-merge, nightly, and release pipelines.`,
    makefile: `Makefile at \`${path}\`. Provides \`make\` targets for common development workflows: \`make build\` (the project's build), \`make test\` (the test suite), \`make docker-build\` (multi-arch image), \`make lint\`, and \`make clean\`.`,
  }

  const steps: Record<string, string[]> = {
    bash: [
      'Shebang + `set -euo pipefail` establish interpreter and strict failure mode — any unset var or failed command aborts immediately.',
      'Environment validation: required vars (e.g. REGISTRY_TOKEN, BUILD_VERSION, TARGET_ARCH) are checked before side effects occur.',
      'The build/runtime environment is sourced or activated (e.g. `source ./scripts/env.sh` or activating a virtualenv).',
      'Core logic runs: the project build, `docker buildx build --platform linux/amd64,linux/arm64`, or a batch/HPC scheduler submission (e.g. SLURM `sbatch`).',
      'Artifacts are staged and `trap cleanup EXIT` ensures temporary resources are removed even on failure.',
    ],
    python: [
      'Module-level imports and constants define the build matrix, registry endpoints, and version constraints.',
      'CLI args or environment variables parameterise the run (dry-run, target platform, version override).',
      'Core logic executes: resolve the multi-repo dependency graph, build Docker manifests, publish to a container registry, or aggregate test cell JSON into a status table.',
      'Results are written to `$GITHUB_STEP_SUMMARY` as a Markdown table and to stdout for pipeline log capture.',
      'Non-zero exit on any failure propagates cleanly to the GitHub Actions runner.',
    ],
    yaml: isRelease ? [
      '`on: push: tags:` triggers on semantic version tags (e.g. `v*`).',
      'Build job: checks out repo, authenticates to the container registry, runs `docker buildx build --platform linux/amd64,linux/arm64 --push`.',
      'Publish job: generates changelog, creates GitHub Release, uploads build artifacts (e.g. `.whl`/`.deb`).',
      'Notify job: posts success/failure to a Slack channel with image digest and changelog link.',
    ] : isNightly ? [
      '`on: schedule: cron` triggers at a fixed UTC time (e.g. `0 3 * * *`).',
      'Matrix job fans out across the build matrix (e.g. version × platform) on self-hosted runners.',
      'Each cell runs the full test suite, uploads a JSON result artifact, and sets `continue-on-error: true` to collect all results.',
      'Summary job downloads all cell artifacts, merges them into a Markdown table, and writes to `$GITHUB_STEP_SUMMARY`.',
    ] : [
      '`on: pull_request` triggers on PR open/synchronise against protected branches.',
      'Concurrency group cancels superseded runs: `group: ${{ github.workflow }}-${{ github.ref }}`.',
      'Build/lint/test steps run in parallel jobs; `needs:` enforces ordering for publish steps.',
      'Required status checks must pass before the PR is mergeable — enforced via branch protection rules.',
    ],
    dockerfile: [
      '`FROM` selects a pinned base image by digest for bit-for-bit reproducibility.',
      '`RUN apt-get` layers install system packages and build dependencies, ordered for maximum cache reuse.',
      '`COPY` brings in manifests (e.g. `requirements.txt`, lockfiles) or pre-built artifacts.',
      '`RUN` completes the build (e.g. `make build` or `pip install`) inside the container.',
      '`ENTRYPOINT`/`CMD` wrap the application entry point with PID 1 signal handling via `exec`.',
    ],
    makefile: [
      '`.PHONY` declares all non-file targets to prevent false-up-to-date matches.',
      'Variables at the top (e.g. `BUILD_TYPE ?= Release`, `ARCH ?= amd64`) allow CI overrides without editing the file.',
      '`build` target invokes the project build with configurable flags.',
      '`test` target runs the test suite and reports results.',
      '`docker-build` target invokes `docker buildx build --platform linux/amd64,linux/arm64`.',
    ],
  }

  return {
    summary: summary[lang] ?? `CI/infra file at \`${path}\`.`,
    steps:   steps[lang]   ?? ['Load configuration.', 'Execute primary logic.', 'Report results.'],
    concepts: JD_CONCEPTS[lang] ?? [lang, 'CI automation'],
  }
}

// Common issues keyed by language
const COMMON_ISSUES: Record<string, Array<{ title: string; severity: 'critical' | 'high' | 'medium'; description: string; fix: string }>> = {
  bash: [
    {
      title: 'Missing `set -euo pipefail` in CI entrypoint',
      severity: 'high',
      description: 'Without `set -e`, a failed build or Docker push is silently ignored and the script continues. Without `set -u`, an unset `$BUILD_VERSION` or `$TARGET_ARCH` expands to empty — passing empty values to the build or docker buildx without error. Without `set -o pipefail`, `make test 2>&1 | tee results.log` hides a test failure if `tee` succeeds. All three together are mandatory for CI scripts.',
      fix: 'Add `set -euo pipefail` as the second line. For subshells and sourced scripts that must not abort the parent, wrap in `( set -euo pipefail; ... )` or use `|| { echo "step failed"; exit 1; }`.',
    },
    {
      title: 'Sourcing an environment script inside CI without isolation',
      severity: 'medium',
      description: 'Sourcing an environment setup script modifies `$PATH`, `$PYTHONPATH`, `$LD_LIBRARY_PATH`, and similar. If multiple jobs run on the same self-hosted runner without environment isolation, sourcing an overlay environment can pollute subsequent jobs with stale paths.',
      fix: 'Run each CI job in a fresh Docker container (`runs-on: [self-hosted]` + `container: image: ...`) or source the environment inside the step shell, not at a persistent script level.',
    },
    {
      title: 'Batch scheduler submission not checking result',
      severity: 'high',
      description: 'A submission to a batch/HPC scheduler (e.g. `sbatch job.sh`) returns immediately with a job ID. The script continues assuming submission succeeded. If the scheduler rejects the job (queue full, wrong partition, missing resources), the error is silently discarded and downstream steps wait forever or run on missing results.',
      fix: 'Capture the job ID and check the exit code: `JOB_ID=$(sbatch --parsable job.sh) || { echo "sbatch failed"; exit 1; }`. Then poll completion and capture the exit status (e.g. via `squeue`/`sacct`).',
    },
  ],
  yaml: [
    {
      title: 'Expensive jobs run on self-hosted runners for every PR',
      severity: 'high',
      description: 'Running heavy, resource-intensive tests on every PR commit is expensive and creates runner contention. External contributors\' PRs (forks) trigger the workflow but cannot access secrets, causing silent failures or misleading status checks. Fork PRs should be gated explicitly.',
      fix: 'Gate expensive jobs with `if: github.event.pull_request.head.repo.full_name == github.repository`. For forks, run only lint, unit tests, and a plain build on GitHub-hosted runners. Use `concurrency: cancel-in-progress: true` to cancel stale runs on push.',
    },
    {
      title: 'Nightly matrix not capturing per-cell failures',
      severity: 'critical',
      description: 'A nightly matrix job with `fail-fast: false` and `continue-on-error: true` suppresses individual cell failures — the overall workflow reports "success" even when 3 of 12 version × platform combinations failed. The signal is wrong.',
      fix: 'Each matrix cell should upload a structured JSON result artifact. A final summary job downloads all artifacts, checks each cell\'s `status` field, and fails the workflow (`exit 1`) if any cell failed. Write the full matrix table to `$GITHUB_STEP_SUMMARY` for visibility.',
    },
    {
      title: 'Missing `permissions:` block on release workflow',
      severity: 'medium',
      description: 'Without `permissions: contents: write`, the workflow cannot create GitHub Releases or push tags. Without `packages: write`, it cannot push to GHCR. Without an explicit `id-token: write`, OIDC-based registry authentication (e.g. ECR) fails. Implicit permissions from repo defaults are fragile and change with org policy.',
      fix: 'Add explicit `permissions:` block scoped to the minimum required: `contents: write` (releases/tags), `packages: write` (GHCR), `id-token: write` (OIDC for cloud registries). Deny all others with `permissions: {}` at workflow level and override per job.',
    },
  ],
  python: [
    {
      title: 'Build matrix JSON deduplication gap on re-run',
      severity: 'critical',
      description: 'If a partial re-run uploads a second cell artifact with the same `(version, platform)` key, the dict comprehension `{(c["version"], c["platform"]): c for c in cells}` silently keeps the last-seen result. An earlier failure retried into success hides a real flake in the summary table.',
      fix: 'Deduplicate by keeping the worst-status result: iterate all cells and update the dict only if the new entry has a worse status (`failed > success > skipped`). Log when a duplicate key is seen: `logger.warning("Duplicate cell %s — keeping worst status", key)`.',
    },
    {
      title: 'Unchecked subprocess in release automation',
      severity: 'high',
      description: '`subprocess.run(["docker", "push", image])` without `check=True` silently ignores a registry push failure (network error, auth timeout, rate limit). The release script reports success while the image was never published to the registry.',
      fix: 'Always pass `check=True`. Wrap in a retry loop for transient registry errors: use `tenacity.retry` with exponential backoff for `subprocess.CalledProcessError` with exit code 1.',
    },
    {
      title: 'Version bumping without lock on shared branch',
      severity: 'medium',
      description: 'Two concurrent release jobs running on the same branch both read `version = "1.2.3"`, both bump to `1.2.4`, and the second push force-pushes over the first tag. This corrupts the release history.',
      fix: 'Use a GitHub Actions `concurrency` group scoped to the release workflow: `concurrency: group: release-${{ github.ref }} cancel-in-progress: false`. The `false` ensures the second job waits, not cancels.',
    },
  ],
  dockerfile: [
    {
      title: 'Mutable base-image tag (e.g. `:latest`)',
      severity: 'high',
      description: 'Base images are often published with both a version tag and `latest`. Using a mutable tag means the same Dockerfile produces different images on different build dates — breaking reproducibility for nightly and release pipelines. The same build may fail against a newer base image if APT keys or package versions shift.',
      fix: 'Pin to a digest: `FROM registry.example.com/base:1.2.3@sha256:<digest>`. Use Renovate with a `packageRules` entry targeting the registry to auto-PR digest updates.',
    },
    {
      title: 'QEMU binfmt_misc not verified for ARM64 cross-build',
      severity: 'critical',
      description: '`docker buildx build --platform linux/arm64` on an x86-64 runner requires `binfmt_misc` to be mounted and writable. On some self-hosted runners, the kernel module is not loaded or the mount is read-only. The `setup-qemu-action` returns exit 0 even when registration silently fails, and the cross-build fails later with `exec format error`.',
      fix: 'Add a pre-flight step: `if ! grep -q enabled /proc/sys/fs/binfmt_misc/qemu-aarch64; then echo "QEMU not registered"; exit 1; fi`. Alternatively, use native ARM64 self-hosted runners for final multi-arch validation.',
    },
    {
      title: 'Build performed in the final image layer (not multi-stage)',
      severity: 'medium',
      description: 'Building in the final image layer installs all build-time dependencies (compilers, dev headers, build tools) into the production image. Images can bloat to many GB, and the attack surface includes all build tools.',
      fix: 'Use a multi-stage build: `FROM base AS builder` — install build deps and run the build. `FROM base-slim AS runtime` — `COPY --from=builder /app/install ./install`. Only the compiled output lands in the final image.',
    },
  ],
  makefile: [
    {
      title: 'Build target not forwarding build flags',
      severity: 'medium',
      description: '`make build` invoking a bare build command without forwarding flags means Release/Debug mode, sanitizer flags, and cross-compilation toolchains are not configurable from CI without editing the Makefile. This prevents the same Makefile from serving both dev (Debug+sanitizers) and release (Release+stripped) builds.',
      fix: 'Accept a `BUILD_ARGS ?=` variable and forward it: `$(BUILD_CMD) $(BUILD_ARGS)`. CI then calls `make build BUILD_ARGS="-DCMAKE_BUILD_TYPE=Release"` without editing the file.',
    },
    {
      title: 'Missing `.PHONY` on `clean` target',
      severity: 'medium',
      description: 'If a file or directory named `clean` exists in the repo root (possible after a partial build), `make clean` silently does nothing — the build directory is not removed. CI flakiness caused by stale build artifacts is hard to diagnose.',
      fix: 'Add `.PHONY: clean build test lint docker-build` to the top of the Makefile. All CI targets should be phony.',
    },
  ],
}

// Deep Dive Q&A by language
const DEEP_DIVE: Record<string, Array<{ q: string; a: string }>> = {
  bash: [
    {
      q: 'How would you structure a shell script that submits a batch/HPC scheduler job and waits for results in a CI pipeline?',
      a: 'Using SLURM as an example: `JOB_ID=$(sbatch --parsable --partition=compute --time=02:00:00 job.sh) || { echo "sbatch submission failed"; exit 1; }`. Then poll: `until [[ "$(sacct -j $JOB_ID -o State -n | tr -d " ")" =~ ^(COMPLETED|FAILED|CANCELLED) ]]; do sleep 30; done`. Finally: `[[ $(sacct -j $JOB_ID -o ExitCode -n | tr -d " ") == "0:0" ]] || { echo "job $JOB_ID failed"; exit 1; }`. This pattern distinguishes CI infrastructure failures from product test failures.',
    },
    {
      q: 'How do you build and push a multi-architecture Docker image (x86-64 + ARM64) from a CI shell script?',
      a: 'Set up buildx: `docker buildx create --use --name multi-arch-builder`. Then build and push in one step: `docker buildx build --platform linux/amd64,linux/arm64 --push -t $REGISTRY/$IMAGE:$TAG -f Dockerfile .`. For ARM64 targets, verify the ARM64 base image exists before building: `docker manifest inspect $BASE_IMAGE:$TAG | jq ".manifests[].platform.architecture"`. If the base image has no ARM64 manifest for the requested version, fail the script early with a clear message rather than producing a broken multi-arch manifest.',
    },
    {
      q: 'How do you distinguish an infrastructure failure from a product failure when triaging CI?',
      a: 'Infrastructure failures exhibit patterns: runner-level (same job fails on different PRs at the same time, job never starts, SSH connection refused), environment-level (package install fails, disk full, resource not available), or transient (retry succeeds immediately). Product failures are consistent for the same code: test assertion fails, compilation error for a specific change, runtime segfault on a specific input. In shell scripts: capture stderr separately (`2>infra.log`), check for known infra error patterns (`grep -qE "No space left|Connection refused|OOMKilled" infra.log`), and emit a distinct exit code or annotation (`echo "::error::INFRASTRUCTURE_FAILURE detected"`) so the CI dashboard can categorise it without manual triage.',
    },
    {
      q: 'Why use `exec "$@"` at the end of a Docker entrypoint script?',
      a: '`exec` replaces the shell process with the given command, making it PID 1. Without `exec`, the shell is PID 1 and the application runs as a child. On `docker stop`, Docker sends SIGTERM to PID 1 — the shell. The shell may or may not forward it to the child, and `SIGTERM` handling in shell is inconsistent. With `exec "$@"`, the application is PID 1 and receives SIGTERM directly, enabling graceful shutdown (closing DB connections, flushing logs). Critical for any long-running service that needs to run shutdown hooks on termination.',
    },
  ],
  yaml: [
    {
      q: 'How do you structure pre-merge, nightly, and release pipelines in a single GitHub Actions repo?',
      a: 'Three separate workflow files with different triggers. Pre-merge (`ci-premerge.yml`): `on: pull_request`, runs fast lint + unit test + build on GitHub-hosted runners; gates merges via branch protection required status checks; uses `concurrency: cancel-in-progress: true`. Nightly (`ci-nightly.yml`): `on: schedule: cron`, runs the full test matrix across versions and platforms on self-hosted runners with `fail-fast: false`; final summary job aggregates results and fails if any cell failed. Release (`ci-release.yml`): `on: push: tags: ["v*"]`, builds multi-arch Docker images, publishes to a container registry, creates GitHub Release with changelog. Sharing logic: use `workflow_call` to factor common build steps into a reusable `_build.yml` called by all three.',
    },
    {
      q: 'How do you prevent fork PRs from accessing secrets while still giving them CI feedback?',
      a: 'GitHub Actions restricts secrets on `pull_request` events from forks — `secrets.*` resolves to empty. Use `pull_request_target` with care (it runs with maintainer permissions — never check out untrusted code). Better: use `if: github.event.pull_request.head.repo.full_name == github.repository` to gate jobs that need secrets (self-hosted runners, registry push). For fork PRs, run only the subset that needs no secrets: lint, build, unit tests on GitHub-hosted runners. Gate the privileged jobs on a `workflow_dispatch` or a maintainer applying a label.',
    },
    {
      q: 'How do you manage self-hosted runner availability in a CI matrix?',
      a: 'Tag runners by capability: `[self-hosted, linux, x64]`, `[self-hosted, linux, arm64]`, `[self-hosted, gpu]`. Use `runs-on: ${{ matrix.runner }}` in the matrix to direct each cell to the right hardware. Set `timeout-minutes` to prevent runaway jobs from blocking the queue. For queue depth management: set `max-parallel` in the matrix to avoid saturating the runner pool. Monitor runner utilisation with GitHub\'s runner API or Prometheus exporters — a queue depth above 10 is a signal to add runner capacity.',
    },
    {
      q: 'How do you publish a multi-arch Docker image to a cloud registry (e.g. ECR) in a release workflow?',
      a: 'Authenticate with OIDC (preferred over static credentials): set `permissions: id-token: write`, use `aws-actions/configure-aws-credentials` with `role-to-assume`. Then: `aws ecr get-login-password | docker login --username AWS --password-stdin $REGISTRY`. Build and push: `docker buildx build --platform linux/amd64,linux/arm64 --push -t $REGISTRY/$REPO:$VERSION -t $REGISTRY/$REPO:latest .`. Capture the image digest from the push output and record it in the GitHub Release notes and `$GITHUB_STEP_SUMMARY` so downstream consumers can pin to the immutable digest rather than the mutable tag.',
    },
  ],
  python: [
    {
      q: 'How do you build a nightly build matrix summary that correctly captures per-cell failures?',
      a: 'Each matrix cell writes a JSON file: `{"version": "4.2.0", "platform": "linux/amd64", "status": "failed", "url": "$RUN_URL", "duration": 312}` and uploads it as an artifact named `cell-${{ matrix.version }}-${{ matrix.platform }}`. The summary job downloads all artifacts with `actions/download-artifact`, reads each JSON, builds a dict keyed on `(version, platform)` keeping the worst status (failed > success > skipped), renders a Markdown table to `$GITHUB_STEP_SUMMARY`, and calls `sys.exit(1)` if any cell failed.',
    },
    {
      q: 'How would you automate semantic version bumping across a multi-repo workspace?',
      a: 'Read the current version from the project manifest (e.g. `pyproject.toml`, `package.json`, or a `VERSION` file). Parse as semver. Determine bump type from commit messages since last tag: `feat:` bumps minor, `fix:`/`refactor:` bumps patch, `BREAKING CHANGE:` in footer bumps major (Conventional Commits). Write the new version back, commit, and tag: `git tag -a v$NEW_VERSION -m "release $NEW_VERSION"`. For multi-repo: resolve the dependency graph to determine which packages depend on which, and bump leaf packages first. Publish updated packages to the registry before bumping dependents.',
    },
    {
      q: 'How do you write a health-check automation script that distinguishes infra failures from test failures?',
      a: 'Run the test command in a subprocess capturing stdout and stderr separately: `result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)`. Classify: parse stderr for known infra patterns (`"No space left"`, `"Cannot connect"`, `"OOMKilled"`) — these are infrastructure failures. Parse stdout for test output patterns (`FAILED`, `AssertionError`, `Segmentation fault`) — these are product failures. Emit structured output: `{"status": "infra_failure"|"product_failure"|"success", "exit_code": N, "stderr_excerpt": ...}`. The CI summary job aggregates these and routes infra failures to the platform oncall, product failures to the engineering team.',
    },
  ],
  dockerfile: [
    {
      q: 'How do you build a container image that runs on both ARM64 and x86-64?',
      a: 'Use a multi-stage Dockerfile with an `ARG TARGETPLATFORM` build arg populated automatically by `docker buildx`. In the builder stage: `FROM --platform=$TARGETPLATFORM base:tag AS builder`. Use `RUN case "$TARGETPLATFORM" in "linux/arm64") ... ;; "linux/amd64") ... ;; esac` for platform-specific package installs. Build and push: `docker buildx build --platform linux/amd64,linux/arm64 --push`. Verify both manifests exist: `docker manifest inspect $IMAGE | jq ".manifests[].platform"`.',
    },
    {
      q: 'How do you minimise Docker image size for CI without losing reproducibility?',
      a: 'Multi-stage build: `FROM base AS builder` — install build deps and run the build. `FROM base-slim AS runtime` — `COPY --from=builder /app/install /app/install`. Strip debug symbols in the builder: `RUN strip --strip-debug /app/install/**/*.so`. Remove the APT cache in the same `RUN` layer it was created: `RUN apt-get install -y ... && rm -rf /var/lib/apt/lists/*`. Use BuildKit `--mount=type=cache` for APT and pip to avoid cache layers in the final image. Pin the base image by digest and generate a lock file recording the exact layer digests used.',
    },
    {
      q: 'Why pin a base image by digest rather than by tag?',
      a: 'A tag like `base:1.2.3` is mutable — the maintainer can re-push it, so the same Dockerfile can resolve to different bytes over time, breaking reproducibility for nightly and release pipelines. A digest (`base@sha256:<digest>`) is content-addressed and immutable: it always resolves to the exact same layers. Pin the base image by digest so builds are bit-for-bit reproducible, and use a tool like Renovate to auto-PR digest bumps when the upstream tag moves. This also mitigates a supply-chain risk where a compromised upstream re-pushes a malicious image under an existing tag.',
    },
  ],
  makefile: [
    {
      q: 'How do you integrate the project build into a Makefile so a pipe failure is not masked?',
      a: '`build` target: `$(BUILD_CMD) --build-type=$(BUILD_TYPE) $(BUILD_EXTRA_ARGS) 2>&1 | tee build.log; [ $${PIPESTATUS[0]} -eq 0 ]`. The `PIPESTATUS` check ensures `tee` success does not mask a build failure. `test` target: `$(TEST_CMD) 2>&1 | tee test.log; [ $${PIPESTATUS[0]} -eq 0 ]`. Accept `BUILD_EXTRA_ARGS ?=` for CI overrides (sanitizers, cross-compilation toolchain). This makes the same Makefile usable for local dev and CI without modification.',
    },
    {
      q: 'How would you add a cross-compilation target to a Makefile for ARM64?',
      a: 'Add a `cross-build` target: `docker run --rm --platform linux/arm64 -v $(PWD):/ws -w /ws $TOOLCHAIN_IMAGE $(BUILD_CMD) --toolchain=/opt/cross/aarch64.cmake`. Or use a QEMU-enabled buildx: `make cross-build ARCH=aarch64`. Define `ARCH ?= x86_64` at the top and derive the toolchain: `TOOLCHAIN = $(if $(filter aarch64,$(ARCH)),/opt/cross/aarch64.cmake,)`. In CI, the nightly matrix calls `make build ARCH=x86_64` and `make build ARCH=aarch64` in parallel matrix jobs, each on the appropriate runner.',
    },
  ],
}

// ─── Tab content panes ────────────────────────────────────────────────────────

function CodePane({ content, loading }: { content: string | undefined; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 size={16} className="animate-spin text-neutral-500" />
    </div>
  )
  return (
    <pre className="p-4 text-[11.5px] font-mono leading-[1.65] text-neutral-300 whitespace-pre overflow-x-auto min-h-full">
      {content}
    </pre>
  )
}

function ExplainPane({ path }: { path: string }) {
  const { summary, steps, concepts } = describeScript(path)
  return (
    <div className="p-4 space-y-5">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">What this script does</p>
        <p className="text-[12px] text-gray-300 leading-relaxed">{summary}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Step by step</p>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-[10px] font-mono text-gray-400 w-4 flex-shrink-0 pt-0.5">{i + 1}</span>
              <p className="text-[11.5px] text-gray-300 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Key concepts</p>
        <div className="flex flex-wrap gap-1.5">
          {concepts.map(c => (
            <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-surface-2 text-gray-400">{c}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function IssuesPane({ path }: { path: string }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setRevealed(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const lang   = langFromPath(path)
  const issues = COMMON_ISSUES[lang] ?? COMMON_ISSUES['bash']

  const SEV_BADGE: Record<string, string> = {
    critical: 'bg-accent-red/10 text-accent-red border-accent-red/20',
    high:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
    medium:   'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] text-gray-500">
        Common issues to look for in this file type. Identify the issue before revealing — then check your reasoning.
      </p>
      {issues.map((iss, i) => {
        const open = revealed.has(i)
        return (
          <div key={i} className={cn(
            'rounded-xl border overflow-hidden transition-colors',
            open
              ? iss.severity === 'critical' ? 'border-accent-red/30 bg-accent-red/[.04]'
                : iss.severity === 'high'   ? 'border-orange-400/30 bg-orange-400/[.04]'
                : 'border-accent-yellow/30 bg-accent-yellow/[.04]'
              : 'border-border bg-surface-2',
          )}>
            <button onClick={() => toggle(i)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-white font-mono">{iss.title}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase', SEV_BADGE[iss.severity])}>
                    {iss.severity}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 flex-shrink-0">{open ? 'Hide' : 'Reveal'}</span>
            </button>
            {open && (
              <div className="px-3.5 pb-3.5 pt-0 space-y-2.5">
                <div className="border-t border-border/40 pt-2.5">
                  <p className="text-[11px] text-gray-300 leading-relaxed">{iss.description}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fix</p>
                  <div className="bg-surface-3 border border-border rounded-lg p-3">
                    <p className="text-[11px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">{iss.fix}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DeepDivePane({ path }: { path: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const lang  = langFromPath(path)
  const items = DEEP_DIVE[lang] ?? DEEP_DIVE['bash']
  return (
    <div className="space-y-2 p-4">
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2 transition-colors"
          >
            <MessageSquare size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-[11.5px] text-gray-100 font-medium leading-snug">{item.q}</span>
            {open === i
              ? <ChevronUp   size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
              : <ChevronDown size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />}
          </button>
          {open === i && (
            <div className="px-3.5 pb-3 pt-0">
              <p className="text-[11px] text-gray-400 leading-relaxed border-t border-border/40 pt-2.5">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'code' | 'explain' | 'issues' | 'qa'

export default function ScriptBrowser() {
  const [selected,  setSelected]  = useState<string | null>(null)
  const [search,    setSearch]    = useState('')
  const [typeTab,   setTypeTab]   = useState<ScriptTypeId>('all')
  const [tab,       setTab]       = useState<Tab>('code')

  const { data: repoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const owner = repoData?.active?.owner ?? ''
  const repo  = repoData?.active?.repo  ?? ''
  const slug  = repoData?.active?.slug  ?? ''

  const { data: paths = [], isLoading, error } = useQuery({
    queryKey: ['repo-tree', owner, repo],
    queryFn: () => fetchTree(owner, repo),
    enabled: !!owner && !!repo,
    staleTime: 300_000,
  })

  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: ['file-content', owner, repo, selected],
    queryFn: () => fetchContent(owner, repo, selected!),
    enabled: !!selected && !!owner && !!repo,
    staleTime: 300_000,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const byType = typeTab === 'all' ? paths : paths.filter(p => typeFromPath(p) === typeTab)
    if (!q) return byType
    return byType.filter(p => p.toLowerCase().includes(q))
  }, [paths, search, typeTab])

  function selectFile(path: string) {
    setSelected(path)
    setTab('code')
  }

  function switchTypeTab(id: ScriptTypeId) {
    setTypeTab(id)
    const first = id === 'all' ? paths[0] : paths.find(p => typeFromPath(p) === id)
    if (first) { setSelected(first); setTab('code') }
  }

  const selectedFilename = selected?.split('/').pop() ?? ''
  const selectedDir      = selected?.includes('/') ? selected.slice(0, selected.lastIndexOf('/')) : ''
  const selectedLang     = selected ? langFromPath(selected) : ''
  const githubFileUrl    = selected ? `https://github.com/${slug}/blob/HEAD/${selected}` : ''

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'code',    label: 'Code',      icon: <Code2 size={11} /> },
    { id: 'explain', label: 'Explain',   icon: <BookOpen size={11} /> },
    { id: 'issues',  label: 'Issues',    icon: <Bug size={11} /> },
    { id: 'qa',      label: 'Deep Dive', icon: <MessageSquare size={11} /> },
  ]

  return (
    <div className="flex h-full min-h-0 bg-surface">

      {/* ── Left: script list ───────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">

        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[12px] font-bold text-white">Scripts</p>
            {slug && (
              <a href={`https://github.com/${slug}`} target="_blank" rel="noreferrer"
                className="text-[10px] text-nvidia hover:underline font-mono flex items-center gap-0.5">
                GitHub <ExternalLink size={9} />
              </a>
            )}
          </div>
          <p className="text-[10px] text-gray-500 leading-snug">Browse · explain · review issues</p>
          <div className="relative mt-2.5">
            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter scripts…"
              className="w-full bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/40 transition-colors"
            />
          </div>
        </div>

        {/* Type filter tabs */}
        <div className="px-2 py-1.5 border-b border-border flex flex-wrap gap-1">
          {SCRIPT_TYPE_TABS.map(t => {
            const count = t.id === 'all' ? paths.length : paths.filter(p => typeFromPath(p) === t.id).length
            if (t.id !== 'all' && count === 0) return null
            return (
              <button
                key={t.id}
                onClick={() => switchTypeTab(t.id)}
                className={cn(
                  'flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded transition-colors',
                  t.id === typeTab
                    ? 'bg-nvidia/15 text-nvidia border border-nvidia/30'
                    : 'text-gray-400 hover:text-gray-300 border border-transparent hover:border-border',
                )}
              >
                {t.label}
                <span className={cn('text-[8px] font-mono', t.id === typeTab ? 'text-nvidia/70' : 'text-gray-400')}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Script list */}
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={16} className="animate-spin text-neutral-500" />
            </div>
          )}
          {error && (
            <div className="px-3 py-6 flex flex-col items-center gap-2 text-center">
              <AlertCircle size={16} className="text-accent-red" />
              <p className="text-[11px] text-neutral-400">Could not load repo</p>
              <p className="text-[10px] text-neutral-600 font-mono">{(error as Error).message}</p>
            </div>
          )}
          {!isLoading && !error && paths.length === 0 && slug && (
            <p className="px-3 py-6 text-[11px] text-neutral-500 text-center">No CI/infra scripts found</p>
          )}
          {filtered.length === 0 && paths.length > 0 && (
            <p className="text-center text-[11px] text-gray-400 py-6">No scripts match</p>
          )}
          {filtered.map(path => {
            const isSelected = selected === path
            const lang       = langFromPath(path)
            const dir        = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
            return (
              <button
                key={path}
                onClick={() => selectFile(path)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                  isSelected && 'bg-nvidia/[.07] border-r-2 border-nvidia',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[11.5px] font-semibold truncate', isSelected ? 'text-white' : 'text-gray-300')}>
                    {titleFromPath(path)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-gray-500 font-mono truncate max-w-[110px]">
                      {dir || 'root'}
                    </span>
                    <span className="text-gray-600">·</span>
                    <span className={cn('text-[9px] font-semibold', LANG_COLOR[lang] ?? 'text-neutral-400')}>
                      {lang}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-gray-400 mt-0.5 flex-shrink-0 bg-surface-3 px-1.5 py-0.5 rounded border border-border/60">
                  {LANG_DISPLAY[lang] ?? 'txt'}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-border">
          {paths.length > 0 && (
            <p className="text-[9px] text-neutral-600 font-mono">{paths.length} scripts · {slug}</p>
          )}
        </div>
      </div>

      {/* ── Right: content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <FileCode size={28} className="text-neutral-600" />
            <p className="text-[13px] font-semibold text-neutral-400">Select a script to view</p>
            <p className="text-[11px] text-neutral-600 max-w-xs">
              {slug
                ? `${paths.length} CI/infra scripts found in ${slug}`
                : 'No repo active. Select a repo from the sidebar.'}
            </p>
          </div>
        ) : (
          <>
            {/* Script header */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[13px] font-bold font-mono', LANG_COLOR[selectedLang] ?? 'text-white')}>
                    {selectedFilename}
                  </span>
                  <span className="text-[9px] font-mono text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">
                    {selectedLang}
                  </span>
                  {selectedDir && (
                    <span className="text-[9px] text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">
                      {selectedDir}
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug font-mono truncate">{selected}</p>
              </div>
              <a href={githubFileUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] text-nvidia hover:underline font-mono flex-shrink-0">
                View on GitHub <ExternalLink size={9} />
              </a>
            </div>

            {/* Tab bar — exact same style as ScriptLibrary */}
            <div className={cn(
              'flex-shrink-0 flex items-center gap-1 p-1 m-2 rounded-xl border',
              'bg-gradient-to-br from-surface-2 to-surface-2/60',
              'border-border/60',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.25)]',
            )}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 border',
                    t.id === tab
                      ? ['bg-surface-3 text-white border-border/80',
                         'shadow-[0_2px_8px_rgba(0,0,0,0.35),0_0_0_1px_rgba(118,185,0,0.14),0_0_12px_rgba(118,185,0,0.08)]']
                      : 'text-neutral-500 border-transparent hover:text-neutral-200 hover:bg-surface-3/30',
                  )}
                >
                  <span className={cn('flex-shrink-0', t.id === tab && 'text-nvidia')}>{t.icon}</span>
                  {t.label}
                  {t.id === tab && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-nvidia/60" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tab === 'code'    && <CodePane      content={content} loading={contentLoading} />}
              {tab === 'explain' && <ExplainPane   path={selected} />}
              {tab === 'issues'  && <IssuesPane    path={selected} />}
              {tab === 'qa'      && <DeepDivePane  path={selected} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
