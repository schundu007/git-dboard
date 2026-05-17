import { useState, useMemo, useCallback } from 'react'
import {
  BookOpen, Code2, Bug, MessageSquare, Eye, EyeOff,
  Search, ChevronDown, ChevronUp, AlertOctagon, AlertTriangle, Info,
  Copy, CheckCircle2,
} from 'lucide-react'
import { cn } from '../lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

type Lang = 'bash' | 'python' | 'yaml' | 'dockerfile'
type Diff = 'easy' | 'medium' | 'hard'
type Sev  = 'critical' | 'high' | 'medium'

interface Issue {
  lines: number[]
  title: string
  severity: Sev
  description: string
  fix: string
}

interface QA {
  q: string
  a: string
}

interface Script {
  id: string
  filename: string
  title: string
  cat: string
  diff: Diff
  lang: Lang
  jdSkills: string[]
  summary: string
  explain: string[]
  code: string
  issues: Issue[]
  qa: QA[]
}

// ─── Script data ─────────────────────────────────────────────────────────────

const SCRIPTS: Script[] = [
  {
    id: 'resolve-matrix',
    filename: 'resolve-matrix.py',
    title: 'Resolve Build Matrix',
    cat: 'GitHub Actions',
    diff: 'hard',
    lang: 'python',
    jdSkills: ['GitHub Actions matrix', 'workflow_dispatch inputs', 'GITHUB_OUTPUT', 'Python scripting'],
    summary: 'Resolves the nightly build matrix from workflow_dispatch inputs or defaults. Writes a GitHub Actions strategy matrix JSON to $GITHUB_OUTPUT so downstream jobs can fan-out across Isaac Sim versions and image extensions.',
    explain: [
      'Parses INPUT_SIM_VERSIONS and INPUT_IMAGE_EXTS from env — comma-separated or "all" for defaults',
      'Filters out unsupported (sim, ext) combinations defined in the UNSUPPORTED dict and emits ::notice:: annotations',
      'Optionally overrides runner label assignments via RUNNER_LABELS_JSON env var',
      'Writes matrix JSON, cell_count, and skip_count to $GITHUB_OUTPUT, then prints a human-readable summary',
    ],
    code: `#!/usr/bin/env python3
"""
docker/scripts/resolve-matrix.py

Purpose  : Resolve the nightly build matrix from workflow_dispatch inputs or defaults.
           Writes a GitHub Actions strategy matrix JSON to $GITHUB_OUTPUT.

Inputs (environment variables):
  INPUT_SIM_VERSIONS   Comma-separated Isaac Sim versions, or "all" (default: all)
  INPUT_IMAGE_EXTS     Comma-separated image extensions, or "all" (default: all)
  RUNNER_LABELS_JSON   Optional JSON dict to override runner labels per extension

Outputs (written to $GITHUB_OUTPUT):
  matrix               JSON string with {"include": [...]} for GHA strategy
  cell_count           Number of included cells
  skip_count           Number of skipped cells

Secrets : None (runner labels come from config in this file or RUNNER_LABELS_JSON)
"""

import json
import os
import sys

# ── Supported combinations ────────────────────────────────────────────────────

ALL_SIM_VERSIONS: list[str] = ["4.5.0", "5.0.0", "5.1.0"]
ALL_IMAGE_EXTS:   list[str] = ["base", "ros2", "cloudxr", "ngc-slim"]

# Cells excluded from the matrix with a ::notice:: annotation in Actions.
UNSUPPORTED: dict[tuple[str, str], str] = {
    ("5.0.0", "ngc-slim"): "ngc-slim container not published for Isaac Sim 5.0 yet",
    ("5.1.0", "ngc-slim"): "ngc-slim container not published for Isaac Sim 5.1 yet",
}

# GPU runner labels per extension — must match labels registered on self-hosted runners.
# Override with RUNNER_LABELS_JSON env var: '{"base": ["self-hosted", "gpu", "my-label"]}'
DEFAULT_RUNNER_LABELS: dict[str, list[str]] = {
    "base":     ["self-hosted", "gpu", "nvidia-driver", "gpu-a100-80gb"],
    "ros2":     ["self-hosted", "gpu", "nvidia-driver", "gpu-a100-80gb"],
    "cloudxr":  ["self-hosted", "gpu", "nvidia-driver", "gpu-a100-80gb"],
    "ngc-slim": ["self-hosted", "gpu", "nvidia-driver", "gpu-a100-40gb"],
}


# ── Input parsing ─────────────────────────────────────────────────────────────

def parse_csv_input(raw: str | None, all_values: list[str]) -> list[str]:
    """Parse a comma-separated input string, falling back to all_values for 'all'."""
    if not raw or raw.strip().lower() in ("", "all"):
        return all_values
    parsed = [v.strip() for v in raw.split(",") if v.strip()]
    unknown = [v for v in parsed if v not in all_values]
    if unknown:
        print(f"::warning::Unknown values ignored: {unknown}", file=sys.stderr)
    return [v for v in parsed if v in all_values] or all_values


sim_versions = parse_csv_input(os.environ.get("INPUT_SIM_VERSIONS"), ALL_SIM_VERSIONS)
image_exts   = parse_csv_input(os.environ.get("INPUT_IMAGE_EXTS"),   ALL_IMAGE_EXTS)

_runner_override = os.environ.get("RUNNER_LABELS_JSON")
runner_labels: dict[str, list[str]] = (
    json.loads(_runner_override) if _runner_override
    else DEFAULT_RUNNER_LABELS
)


# ── Build include list ────────────────────────────────────────────────────────

includes: list[dict] = []
skipped:  list[dict] = []

for sim in sim_versions:
    for ext in image_exts:
        if (sim, ext) in UNSUPPORTED:
            reason = UNSUPPORTED[(sim, ext)]
            skipped.append({"sim": sim, "ext": ext, "reason": reason})
            print(f"::notice::Skipping ({sim}, {ext}): {reason}", file=sys.stderr)
            continue

        major_minor = ".".join(sim.split(".")[:2])   # "4.5.0" -> "4.5"
        labels      = runner_labels.get(ext, runner_labels["base"])

        includes.append({
            "isaac_sim_version": sim,
            "sim_major_minor":   major_minor,
            "image_ext":         ext,
            "runner_labels":     labels,
            "cell_slug":         f"{ext}-sim{major_minor}",
        })

if not includes:
    print(
        "::error::Matrix is empty -- all requested combinations are unsupported.",
        file=sys.stderr,
    )
    sys.exit(1)

matrix = {"include": includes}


# ── Write GITHUB_OUTPUT ───────────────────────────────────────────────────────

output_file = os.environ.get("GITHUB_OUTPUT", "")
if output_file:
    with open(output_file, "a") as f:
        f.write(f"matrix={json.dumps(matrix)}\\n")
        f.write(f"cell_count={len(includes)}\\n")
        f.write(f"skip_count={len(skipped)}\\n")


# ── Human-readable summary ────────────────────────────────────────────────────

print(f"\\nBuild matrix  ({len(includes)} cells, {len(skipped)} skipped)")
print(f"  Isaac Sim versions : {sim_versions}")
print(f"  Image extensions   : {image_exts}")
print(f"\\n  {'Extension':<12} {'Isaac Sim':<10} Runner labels")
print(f"  {'-'*12} {'-'*10} {'-'*42}")
for cell in includes:
    labels_str = ", ".join(cell["runner_labels"])
    print(f"  {cell['image_ext']:<12} {cell['isaac_sim_version']:<10} {labels_str}")
if skipped:
    print(f"\\n  Skipped cells:")
    for s in skipped:
        print(f"  x  ({s['sim']}, {s['ext']})  --  {s['reason']}")`,
    issues: [
      {
        lines: [55],
        title: 'Unknown inputs silently fall back to ALL matrix values',
        severity: 'critical',
        description: '`[v for v in parsed if v in all_values] or all_values` — if a user types `INPUT_SIM_VERSIONS=6.0.0` (a typo), the filter removes it and the list is empty, so `or all_values` kicks in and returns all 3 versions. A single-job re-run silently becomes a 12-job full matrix. The ::warning:: on line 53 is the only signal, and it\'s easy to miss in CI logs.',
        fix: 'Treat an all-unknown input as an error, not a fallback:\n```python\nfiltered = [v for v in parsed if v in all_values]\nif not filtered:\n    print(f"::error::No valid values in {parsed!r}. Valid: {all_values}", file=sys.stderr)\n    sys.exit(1)\nreturn filtered\n```',
      },
      {
        lines: [62],
        title: '`json.loads` on RUNNER_LABELS_JSON has no exception handling',
        severity: 'high',
        description: '`json.loads(_runner_override)` raises `json.JSONDecodeError` if the env var contains malformed JSON (e.g. single quotes from a shell mistake: `\'{"base": [...]}\'\`). The exception propagates uncaught, printing a Python traceback to the runner log with no GitHub Actions `::error::` annotation. The workflow fails with an opaque "Process completed with exit code 1" message.',
        fix: 'Wrap in try/except and emit a structured annotation:\n```python\ntry:\n    runner_labels = json.loads(_runner_override)\nexcept json.JSONDecodeError as e:\n    print(f"::error::RUNNER_LABELS_JSON is not valid JSON: {e}", file=sys.stderr)\n    sys.exit(1)\n```',
      },
      {
        lines: [98, 99, 100],
        title: 'Matrix JSON written to GITHUB_OUTPUT without heredoc — breaks if keys contain newlines',
        severity: 'medium',
        description: '`f"matrix={json.dumps(matrix)}\\n"` is the correct single-line format for a simple string value. However, the GITHUB_OUTPUT format uses newlines as key=value delimiters. If `json.dumps` ever gets `indent=2` added (for debugging), the multi-line JSON would corrupt the output file and silently break the matrix — GitHub Actions would receive an empty matrix with no error.',
        fix: 'Use the multiline heredoc format for the matrix output, which is safe regardless of JSON formatting:\n```python\nf.write(f"matrix<<GHA_EOF\\n{json.dumps(matrix)}\\nGHA_EOF\\n")\n```\nThis is the format GitHub recommends for multi-line output values.',
      },
    ],
    qa: [
      {
        q: 'How does GitHub Actions read `$GITHUB_OUTPUT` and what happens if you write a multi-line value with `key=value\\n` format?',
        a: 'GitHub Actions reads GITHUB_OUTPUT line by line, treating each line as `key=value`. A value with an embedded newline would be misread as two separate key=value pairs, corrupting both. The correct format for multiline values is the heredoc syntax: `key<<DELIMITER\\nvalue line 1\\nvalue line 2\\nDELIMITER\\n`. This is what `nightly-tags.sh` uses for the `all_tags` output.',
      },
      {
        q: 'Why does the script emit `::notice::` and `::warning::` prefixed messages to stderr instead of stdout?',
        a: 'These are GitHub Actions workflow commands. When a step\'s output (stdout or stderr) contains a line matching `::command::...`, the Actions runner intercepts it and renders it as an annotation in the workflow UI. `::notice::` creates a blue info callout, `::warning::` creates a yellow warning, `::error::` creates a red error and can fail the step. Writing them to stderr keeps them separate from structured data written to stdout (like the human-readable matrix table).',
      },
      {
        q: 'What is the `UNSUPPORTED` dict pattern doing and how would you extend it?',
        a: 'It\'s a compile-time exclusion list — a mapping from `(sim_version, image_ext)` tuples to a human-readable reason string. It\'s checked before building the matrix include list. To extend: add a new tuple key with a reason string. The alternative approach (a set of excluded tuples) loses the reason, so the dict is the right choice. A more scalable version would load this from a YAML config file so the workflow YAML doesn\'t need to change when exclusions update.',
      },
    ],
  },
  {
    id: 'nightly-tags',
    filename: 'nightly-tags.sh',
    title: 'Nightly Tag Computation',
    cat: 'Release Engineering',
    diff: 'medium',
    lang: 'bash',
    jdSkills: ['GITHUB_OUTPUT multiline', 'Bash scripting', 'ECR/GHCR/NGC tagging', 'Nightly CI'],
    summary: 'Computes all image tags and the Dockerfile path for one nightly build matrix cell. Called once per cell in the fan-out matrix. Outputs 11 variables to $GITHUB_OUTPUT consumed by the build-and-push step.',
    explain: [
      'Validates all required env vars using `: "${VAR:?message}"` — exits immediately if any are unset',
      'Computes tag names (nightly, SHA, cache) from BUILD_DATE + SHORT_SHA + IMAGE_EXT + SIM_MAJOR_MINOR',
      'Selects the correct Dockerfile and compose overlay per IMAGE_EXT via a `case` statement',
      'Writes all 11 outputs to $GITHUB_OUTPUT using a grouped `{...} >>` block; uses heredoc syntax for the multi-line `all_tags` value',
    ],
    code: `#!/usr/bin/env bash
# =============================================================================
# docker/scripts/nightly-tags.sh
#
# Purpose  : Compute all image tags and the Dockerfile path for one matrix cell.
# Inputs   : Environment variables (all mandatory):
#              BUILD_DATE          YYYYMMDD
#              SHORT_SHA           7-char git SHA
#              ISAAC_SIM_VERSION   e.g. 4.5.0
#              SIM_MAJOR_MINOR     e.g. 4.5
#              IMAGE_EXT           base | ros2 | cloudxr | ngc-slim
#              NGC_IMAGE           e.g. nvcr.io/nvidia/isaac-lab
#              GHCR_IMAGE          e.g. ghcr.io/isaac-sim/isaaclab
# Outputs  : Appended to $GITHUB_OUTPUT (or /dev/null locally)
# =============================================================================
set -euo pipefail

# ── Validate required inputs ──────────────────────────────────────────────────
: "\${BUILD_DATE:?BUILD_DATE is required (YYYYMMDD)}"
: "\${SHORT_SHA:?SHORT_SHA is required (7-char git SHA)}"
: "\${ISAAC_SIM_VERSION:?ISAAC_SIM_VERSION is required (e.g. 4.5.0)}"
: "\${SIM_MAJOR_MINOR:?SIM_MAJOR_MINOR is required (e.g. 4.5)}"
: "\${IMAGE_EXT:?IMAGE_EXT is required (base|ros2|cloudxr|ngc-slim)}"
: "\${NGC_IMAGE:=nvcr.io/nvidia/isaac-lab}"
: "\${GHCR_IMAGE:=ghcr.io/isaac-sim/isaaclab}"

# ── Tag names (no registry prefix) ───────────────────────────────────────────
NIGHTLY_TAG="nightly-\${BUILD_DATE}-\${IMAGE_EXT}-sim\${SIM_MAJOR_MINOR}"
SHA_TAG="sha-\${SHORT_SHA}-\${IMAGE_EXT}-sim\${SIM_MAJOR_MINOR}"
CACHE_TAG="cache-\${IMAGE_EXT}-sim\${SIM_MAJOR_MINOR}"

# ── Full image references ─────────────────────────────────────────────────────
NGC_NIGHTLY="\${NGC_IMAGE}:\${NIGHTLY_TAG}"
NGC_SHA="\${NGC_IMAGE}:\${SHA_TAG}"
GHCR_NIGHTLY="\${GHCR_IMAGE}:\${NIGHTLY_TAG}"
GHCR_SHA="\${GHCR_IMAGE}:\${SHA_TAG}"
GHCR_CACHE="\${GHCR_IMAGE}:\${CACHE_TAG}"

# ── Dockerfile and compose overlay selection ──────────────────────────────────
case "\${IMAGE_EXT}" in
  base)
    DOCKERFILE="docker/Dockerfile.base"
    COMPOSE_OVERLAY=""
    ;;
  ros2)
    if [[ -f "docker/Dockerfile.ros2" ]]; then
      DOCKERFILE="docker/Dockerfile.ros2"
    else
      DOCKERFILE="docker/Dockerfile.base"
    fi
    COMPOSE_OVERLAY="docker/docker-compose.ros2.yaml"
    ;;
  cloudxr)
    DOCKERFILE="docker/Dockerfile.base"
    COMPOSE_OVERLAY="docker/docker-compose.cloudxr-runtime.patch.yaml"
    ;;
  ngc-slim)
    if [[ -f "docker/Dockerfile.slim" ]]; then
      DOCKERFILE="docker/Dockerfile.slim"
    else
      DOCKERFILE="docker/Dockerfile.base"
    fi
    COMPOSE_OVERLAY=""
    ;;
  *)
    echo "ERROR: unknown IMAGE_EXT '\${IMAGE_EXT}'" >&2
    exit 1
    ;;
esac

# ── Write to GITHUB_OUTPUT ────────────────────────────────────────────────────
{
  echo "nightly_tag=\${NIGHTLY_TAG}"
  echo "sha_tag=\${SHA_TAG}"
  echo "cache_tag=\${CACHE_TAG}"

  echo "ngc_nightly=\${NGC_NIGHTLY}"
  echo "ngc_sha=\${NGC_SHA}"
  echo "ghcr_nightly=\${GHCR_NIGHTLY}"
  echo "ghcr_sha=\${GHCR_SHA}"
  echo "ghcr_cache=\${GHCR_CACHE}"

  echo "dockerfile=\${DOCKERFILE}"
  echo "compose_overlay=\${COMPOSE_OVERLAY}"

  # Multiline block: docker/build-push-action consumes newline-separated tags.
  echo "all_tags<<TAGS_EOF"
  echo "\${NGC_NIGHTLY}"
  echo "\${NGC_SHA}"
  echo "\${GHCR_NIGHTLY}"
  echo "\${GHCR_SHA}"
  echo "TAGS_EOF"
} >> "\${GITHUB_OUTPUT:-/dev/null}"

# ── Human-readable summary ────────────────────────────────────────────────────
cat <<SUMMARY
Tag plan for \${IMAGE_EXT} . sim\${SIM_MAJOR_MINOR}
  Nightly tag  : \${NIGHTLY_TAG}
  SHA tag      : \${SHA_TAG}
  Cache tag    : \${CACHE_TAG}
  NGC nightly  : \${NGC_NIGHTLY}
  NGC SHA      : \${NGC_SHA}
  GHCR nightly : \${GHCR_NIGHTLY}
  GHCR SHA     : \${GHCR_SHA}
  GHCR cache   : \${GHCR_CACHE}
  Dockerfile   : \${DOCKERFILE}
  Overlay      : \${COMPOSE_OVERLAY:-none}
SUMMARY`,
    issues: [
      {
        lines: [76],
        title: '`${GITHUB_OUTPUT:-/dev/null}` silently discards all outputs if unset in CI',
        severity: 'high',
        description: 'The `:-/dev/null` fallback is correct for local debugging — it prevents the script from crashing when GITHUB_OUTPUT is not set. However, if GITHUB_OUTPUT is accidentally unset inside a real GitHub Actions job (e.g., a runner misconfiguration or a custom container that doesn\'t inherit it), all 11 outputs are silently written to /dev/null. The step exits 0, the consuming steps see empty strings, and the build fails with a confusing "tag not found" error far downstream.',
        fix: 'Distinguish local vs. CI by checking for GITHUB_ACTIONS:\n```bash\nif [[ -n "${GITHUB_ACTIONS:-}" && -z "${GITHUB_OUTPUT:-}" ]]; then\n  echo "ERROR: GITHUB_OUTPUT is not set in a CI context" >&2\n  exit 1\nfi\n{ ... } >> "${GITHUB_OUTPUT:-/dev/null}"\n```',
      },
      {
        lines: [23, 24],
        title: 'SIM_MAJOR_MINOR is not validated — wrong format produces a silently malformed tag',
        severity: 'medium',
        description: '`SIM_MAJOR_MINOR` is required (`:?`) but its format is not validated. If the caller passes `"4.5.0"` instead of `"4.5"` (a common mistake since `ISAAC_SIM_VERSION` is `"4.5.0"`), the tag becomes `nightly-YYYYMMDD-base-sim4.5.0`. This is a valid string — no script fails — but the image is pushed under the wrong tag name, breaking any downstream reference to `sim4.5`.',
        fix: 'Add a format check after the `:?` validation:\n```bash\nif [[ ! "${SIM_MAJOR_MINOR}" =~ ^[0-9]+\\.[0-9]+$ ]]; then\n  echo "ERROR: SIM_MAJOR_MINOR must be X.Y (e.g. 4.5), got: ${SIM_MAJOR_MINOR}" >&2\n  exit 1\nfi\n```',
      },
      {
        lines: [69],
        title: '`compose_overlay=` (empty value) needs explicit handling by consumers',
        severity: 'medium',
        description: 'For `base` and `ngc-slim`, `COMPOSE_OVERLAY` is intentionally empty. `echo "compose_overlay="` writes an empty string to GITHUB_OUTPUT. A consuming step that does `if: steps.tags.outputs.compose_overlay != \'\'` handles this correctly. But `if: steps.tags.outputs.compose_overlay` (without explicit comparison) evaluates to false in GitHub Actions for empty strings — which is the correct behavior, but it\'s easy to write the wrong conditional.',
        fix: 'Document the expected consumer pattern in the script header, and make the downstream workflow step explicit:\n```yaml\nif: steps.tags.outputs.compose_overlay != \'\'\n```\nAlternatively, output a sentinel like `"none"` instead of an empty string to make the condition unambiguous.',
      },
    ],
    qa: [
      {
        q: 'Why does the script use `echo "all_tags<<TAGS_EOF" ... echo "TAGS_EOF"` instead of just writing each tag as a separate output?',
        a: 'The `docker/build-push-action` step expects a newline-separated list of full image:tag references in a single `tags` input. Writing them as one multiline output value (using the GITHUB_OUTPUT heredoc format) lets the action consume them directly without shell joining. Writing 4 separate outputs would require the consumer to concatenate them — more fragile and harder to read. The `<<DELIMITER` format is the GitHub-documented way to write multiline output values.',
      },
      {
        q: 'What does `: "${VAR:?message}"` do and why use `:` (colon) as the command?',
        a: '`:` is the bash no-op command — it takes arguments and does nothing, always exits 0. `${VAR:?message}` is a parameter expansion: if VAR is unset or empty, bash prints the message to stderr and exits non-zero (which, combined with `set -e`, aborts the script). Using `:` as the command is idiomatic for validation-only expansions where you don\'t want to actually use the variable\'s value yet. Equivalent to `[[ -n "$VAR" ]] || { echo ...; exit 1; }` but more concise.',
      },
      {
        q: 'Why is the SUMMARY printed unconditionally to stdout but GITHUB_OUTPUT uses `>> "${GITHUB_OUTPUT:-/dev/null}"`?',
        a: 'The summary is diagnostic output for the runner log — it\'s always useful to see it regardless of environment. GITHUB_OUTPUT is a CI-specific file path that doesn\'t exist when running locally; falling back to /dev/null prevents a "file not found" error on local runs. In CI, stdout goes to the job log while GITHUB_OUTPUT is read by subsequent steps — they\'re separate channels with different audiences.',
      },
    ],
  },
  {
    id: 'aggregate-manifest',
    filename: 'aggregate-manifest.py',
    title: 'Aggregate Nightly Manifest',
    cat: 'Python Automation',
    diff: 'medium',
    lang: 'python',
    jdSkills: ['GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'Python scripting', 'Nightly CI reporting'],
    summary: 'Collects per-cell JSON artifacts from each nightly build job, merges them into a single manifest JSON, and renders a Markdown status table into $GITHUB_STEP_SUMMARY. Exits non-zero if any cell failed.',
    explain: [
      'Globs for cell-*.json files from the CELLS_DIR (uploaded as artifacts by each matrix job)',
      'Tallies pass/fail/cancelled counts and writes the merged manifest JSON to disk',
      'Appends manifest outputs (path, counts) to $GITHUB_OUTPUT for use by downstream jobs',
      'Builds a Markdown table keyed by (sim_version, image_ext) and writes it to $GITHUB_STEP_SUMMARY',
      'Exits 1 if any cell failed — turns the manifest aggregator job red in the workflow',
    ],
    code: `#!/usr/bin/env python3
"""
docker/scripts/aggregate-manifest.py

Purpose  : Collect per-cell JSON artifacts, merge into a nightly manifest,
           and write a Markdown table to $GITHUB_STEP_SUMMARY.

Inputs (environment variables):
  BUILD_DATE, SHORT_SHA, GITHUB_RUN_ID, CELLS_DIR, MANIFEST_PATH,
  GITHUB_OUTPUT, GITHUB_STEP_SUMMARY

Cell JSON schema:
  isaac_sim_version, image_ext, nightly_tag, sha_tag, ngc_image,
  ghcr_image, digest, size_mb, runner, dry_run, status
"""

import glob
import json
import os
import sys

# ── Configuration ─────────────────────────────────────────────────────────────

BUILD_DATE    = os.environ.get("BUILD_DATE",    "unknown")
SHORT_SHA     = os.environ.get("SHORT_SHA",     "unknown")
RUN_ID        = os.environ.get("GITHUB_RUN_ID", "0")
CELLS_DIR     = os.environ.get("CELLS_DIR",     "cells")
MANIFEST_PATH = os.environ.get("MANIFEST_PATH", f"nightly-manifest-{BUILD_DATE}.json")
REPO          = "isaac-sim/IsaacLab"

VERSIONS:    list[str] = ["4.5.0", "5.0.0", "5.1.0"]
EXTS:        list[str] = ["base", "ros2", "cloudxr", "ngc-slim"]
SIM_LABELS:  dict[str, str] = {
    "4.5.0": "Sim 4.5",
    "5.0.0": "Sim 5.0",
    "5.1.0": "Sim 5.1",
}


# ── Load cell manifests ───────────────────────────────────────────────────────

cells: list[dict] = []
pattern = os.path.join(CELLS_DIR, "**", "*.json")
for fp in glob.glob(pattern, recursive=True):
    try:
        with open(fp) as f:
            cells.append(json.load(f))
    except (json.JSONDecodeError, IOError) as exc:
        print(f"::warning::Could not read {fp}: {exc}", file=sys.stderr)

if not cells:
    print("::warning::No cell manifests found -- manifest will be empty.", file=sys.stderr)


# ── Tally results ─────────────────────────────────────────────────────────────

status_counts: dict[str, int] = {}
for cell in cells:
    s = cell.get("status", "unknown")
    status_counts[s] = status_counts.get(s, 0) + 1

passed    = status_counts.get("success",   0)
failed    = status_counts.get("failure",   0)
cancelled = status_counts.get("cancelled", 0)
total     = len(cells)


# ── Write manifest JSON ───────────────────────────────────────────────────────

manifest = {
    "build_date":       BUILD_DATE,
    "git_sha":          SHORT_SHA,
    "workflow_run_id":  RUN_ID,
    "workflow_run_url": f"https://github.com/{REPO}/actions/runs/{RUN_ID}",
    "total":     total,
    "passed":    passed,
    "failed":    failed,
    "cancelled": cancelled,
    "cells": sorted(
        cells,
        key=lambda c: (c.get("isaac_sim_version", ""), c.get("image_ext", "")),
    ),
}

with open(MANIFEST_PATH, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Manifest written -> {MANIFEST_PATH}")
print(f"  {passed} passed . {failed} failed . {cancelled} cancelled . {total} total")


# ── Write GITHUB_OUTPUT ───────────────────────────────────────────────────────

gho = os.environ.get("GITHUB_OUTPUT", "")
if gho:
    with open(gho, "a") as f:
        f.write(f"manifest_path={MANIFEST_PATH}\\n")
        f.write(f"passed={passed}\\n")
        f.write(f"failed={failed}\\n")
        f.write(f"total={total}\\n")


# ── Build cell lookup for the summary table ───────────────────────────────────

lookup: dict[tuple[str, str], dict] = {
    (c["isaac_sim_version"], c["image_ext"]): c
    for c in cells
}


def cell_badge(cell: dict | None) -> str:
    if cell is None:
        return "--"
    s    = cell.get("status", "unknown")
    size = cell.get("size_mb", "?")
    if s == "success":
        return f"ok {size} MB"
    if s == "failure":
        return "FAILED"
    if s == "cancelled":
        return "cancelled"
    return f"? {s}"


# ── Write GITHUB_STEP_SUMMARY ─────────────────────────────────────────────────

summary_lines: list[str] = [
    f"## IsaacLab Nightly . {BUILD_DATE}",
    "",
    f"| Extension | {' | '.join(SIM_LABELS[v] for v in VERSIONS)} |",
    f"|:----------|{'|'.join(':-------:' for _ in VERSIONS)}|",
]

for ext in EXTS:
    row = [cell_badge(lookup.get((v, ext))) for v in VERSIONS]
    summary_lines.append(f"| {ext} | {' | '.join(row)} |")

summary_lines += [
    "",
    f"**{passed} passed . {failed} failed . {cancelled} cancelled**",
    f"Commit: {SHORT_SHA} . Run: #{RUN_ID}",
    "",
]

passed_cells = [c for c in cells if c.get("status") == "success"]
if passed_cells:
    summary_lines += [
        "### Image sizes",
        "",
        "| Image tag | Size (MB) | Digest |",
        "|:----------|----------:|:-------|",
    ]
    for c in sorted(
        passed_cells,
        key=lambda x: (x.get("isaac_sim_version", ""), x.get("image_ext", "")),
    ):
        tag     = c.get("nightly_tag", "--")
        size    = c.get("size_mb",     "--")
        digest  = c.get("digest",      "--")
        short_d = (digest[:19] + "...") if len(str(digest)) > 20 else digest
        summary_lines.append(f"| {tag} | {size} | {short_d} |")
    summary_lines.append("")

ghs = os.environ.get("GITHUB_STEP_SUMMARY", "")
if ghs:
    with open(ghs, "a") as f:
        f.write("\\n".join(summary_lines) + "\\n")
else:
    print("\\n".join(summary_lines))

if failed > 0:
    print(f"::error::{failed} build cell(s) failed -- see table above.", file=sys.stderr)
    sys.exit(1)`,
    issues: [
      {
        lines: [98, 99, 100],
        title: 'Duplicate cell files silently overwrite each other in the lookup dict',
        severity: 'high',
        description: 'The `lookup` dict comprehension (`(c["isaac_sim_version"], c["image_ext"]): c for c in cells`) has no deduplication guard. If a partial re-run uploads a second cell JSON with the same `(sim, ext)` key (e.g., artifact retry), the last file wins silently. The summary table shows only the latest result, and the earlier result\'s status is lost — potentially hiding a failure that was retried into a false success.',
        fix: 'Detect and warn on duplicates before building the lookup:\n```python\nlookup = {}\nfor c in cells:\n    key = (c["isaac_sim_version"], c["image_ext"])\n    if key in lookup:\n        print(f"::warning::Duplicate cell for {key} -- keeping latest", file=sys.stderr)\n    lookup[key] = c\n```',
      },
      {
        lines: [51, 52, 53],
        title: '`except (json.JSONDecodeError, IOError)` misses `UnicodeDecodeError`',
        severity: 'high',
        description: '`open(fp)` without `encoding=` uses the system locale (usually UTF-8). If a cell JSON file contains non-UTF-8 bytes (rare but possible from some artifact upload edge cases), `json.load(f)` raises `UnicodeDecodeError` — a subclass of `ValueError`, NOT of `IOError`. The exception escapes the try/except, crashes the script with an unformatted traceback, and leaves the manifest partially written.',
        fix: 'Add `UnicodeDecodeError` to the exception tuple and pin the encoding:\n```python\ntry:\n    with open(fp, encoding="utf-8", errors="replace") as f:\n        cells.append(json.load(f))\nexcept (json.JSONDecodeError, IOError, UnicodeDecodeError) as exc:\n    print(f"::warning::Could not read {fp}: {exc}", file=sys.stderr)\n```',
      },
      {
        lines: [61, 62],
        title: 'Script exits 0 when no cell files found — masks total upload failure',
        severity: 'medium',
        description: 'When `cells` is empty (all artifact uploads failed, or CELLS_DIR points to the wrong path), the script emits `::warning::No cell manifests found` but exits 0. It writes a manifest JSON with `total=0, passed=0, failed=0` — which looks like a clean run with nothing to do. The aggregator job appears green even though all 12 build jobs failed to upload their results.',
        fix: 'Exit non-zero when cells are empty in a CI context:\n```python\nif not cells:\n    print("::error::No cell manifests found -- all build jobs may have failed to upload artifacts.", file=sys.stderr)\n    sys.exit(1)\n```',
      },
    ],
    qa: [
      {
        q: 'What is `$GITHUB_STEP_SUMMARY` and how is it different from `$GITHUB_OUTPUT`?',
        a: '$GITHUB_STEP_SUMMARY is a file path to a Markdown buffer rendered in the GitHub Actions workflow run summary page — it\'s visible to humans browsing the run, not accessible to subsequent steps. $GITHUB_OUTPUT is a file of key=value pairs consumed by later steps in the same job or by downstream jobs via `needs.job.outputs.key`. Summary is for human-readable reporting; output is for machine-to-machine data passing.',
      },
      {
        q: 'Why does the script use `glob.glob(pattern, recursive=True)` instead of `os.listdir(CELLS_DIR)`?',
        a: '`glob.glob` with `**/*.json` and `recursive=True` descends into subdirectories. GitHub Actions artifact downloads extract each artifact into a named subdirectory under the download path, so cell JSON files land at `cells/cell-base-sim4.5/cell.json` rather than directly in `cells/`. `os.listdir` would only see the subdirectory names, not the JSON files inside them. The `**` glob handles arbitrary nesting depth.',
      },
      {
        q: 'The script uses `sys.exit(1)` only when `failed > 0`. Should it also exit non-zero on `cancelled > 0`?',
        a: 'It depends on the policy. Cancelled jobs mean GitHub Actions cancelled them — usually due to `fail-fast: true` in the matrix or a manual run cancellation. Treating cancellations as failures would cause the manifest job to go red when a human cancels a workflow, which is noisy. The current behavior (exits 0 on cancellations, exits 1 only on build failures) is the right default. You could add a `--strict` flag that also fails on cancellations for special release builds.',
      },
    ],
  },
  // ── Script 4: build.yml ───────────────────────────────────────────────────
  {
    id: 'build-workflow',
    filename: '.github/workflows/build.yml',
    title: 'Pre-merge CI Workflow',
    cat: 'GitHub Actions',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['self-hosted GPU runners', 'parallel CI jobs', 'fork PR security', 'JUnit artifact merging', 'concurrency groups'],
    summary: 'Pre-merge validation triggered on PRs to devel, main, and release/**. Builds a Docker image on a self-hosted GPU runner, runs two parallel test jobs, uploads JUnit XML artifacts, and posts an inline PR comment via publish-unit-test-result-action. Fork PRs skip the comment path and fail directly on XML.',
    explain: [
      'Concurrency group cancels in-progress runs on each new commit to the same PR, saving GPU time',
      'DOCKER_IMAGE_TAG encodes PR number (pull_request events) or raw branch name plus short SHA',
      'test-isaaclab-tasks and test-general run in parallel on [self-hosted, gpu] runners with 3-hour timeout',
      'docker cp extracts JUnit XML from the stopped container; container name is derived from the shell PID ($$)',
      'Fork PRs detected via head.repo.full_name != github.repository — bypass PR comments, fail directly on XML parse',
      'combine-results downloads both artifacts and publishes a unified summary via publish-unit-test-result-action',
    ],
    code: `name: Build and Test

on:
  pull_request:
    branches:
      - devel
      - main
      - 'release/**'

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

env:
  ISAACSIM_BASE_IMAGE: \${{ vars.ISAACSIM_BASE_IMAGE || 'nvcr.io/nvidia/isaac-sim' }}
  ISAACSIM_BASE_VERSION: \${{ vars.ISAACSIM_BASE_VERSION || '5.1.0' }}
  DOCKER_IMAGE_TAG: "isaac-lab-dev:\${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.ref_name }}-\${{ github.sha }}"

jobs:
  test-isaaclab-tasks:
    runs-on: [self-hosted, gpu]
    timeout-minutes: 180
    continue-on-error: true
    steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
        lfs: true
    - uses: ./.github/actions/docker-build
      with:
        image-tag: \${{ env.DOCKER_IMAGE_TAG }}
        isaacsim-version: \${{ env.ISAACSIM_BASE_VERSION }}
    - uses: ./.github/actions/run-tests
      with:
        filter-pattern: "isaaclab_tasks"
    - name: Copy Test Results
      run: |
        CONTAINER_NAME="isaac-lab-tasks-test-$$"
        docker cp $CONTAINER_NAME:/workspace/isaaclab/tests/report.xml reports/ \\
          2>/dev/null || echo "No test results to copy"
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: isaaclab-tasks-test-results
        path: reports/isaaclab-tasks-report.xml
        retention-days: 1
    - name: Check Results for Fork PRs
      if: \${{ github.event.pull_request.head.repo.full_name != github.repository }}
      run: |
        if grep -q 'failures="[1-9]' reports/*.xml || \\
           grep -q 'errors="[1-9]' reports/*.xml; then
          echo "Tests failed for fork PR."; exit 1
        fi

  combine-results:
    needs: [test-isaaclab-tasks, test-general]
    runs-on: [self-hosted, gpu]
    if: always()
    steps:
    - uses: actions/download-artifact@v4
    - uses: EnricoMi/publish-unit-test-result-action@v2
      if: \${{ github.event.pull_request.head.repo.full_name == github.repository }}
      with:
        files: "reports/combined-results.xml"
        comment_mode: changes
        fail_on: errors`,
    issues: [
      {
        lines: [23],
        title: '`continue-on-error: true` makes the job\'s result always appear as success',
        severity: 'critical',
        description: 'When a job has `continue-on-error: true`, GitHub Actions records its outcome as "success" regardless of actual exit code. Any downstream conditional checking `needs.test-isaaclab-tasks.result` for failure never fires. The `combine-results` job\'s `if: always()` ensures it runs, but it cannot tell which upstream job actually failed. Engineers skimming the workflow graph see green jobs even when tests are broken.',
        fix: 'Use `if: always()` on downstream jobs instead of `continue-on-error` at the job level:\n```yaml\ntest-isaaclab-tasks:\n  runs-on: [self-hosted, gpu]\n  # remove: continue-on-error: true\n\ncombine-results:\n  needs: [test-isaaclab-tasks, test-general]\n  if: always()  # runs even when upstream fails\n```\nNow `needs.test-isaaclab-tasks.result` correctly reflects "failure" and downstream steps can gate on it.',
      },
      {
        lines: [17],
        title: '`github.ref_name` in Docker tag is not sanitized — fails on release branches',
        severity: 'high',
        description: 'Docker tag names must match `[a-zA-Z0-9_.-]`. For a branch like `release/2.0`, `github.ref_name` is `release/2.0` — the `/` is illegal in a Docker tag. `docker build -t isaac-lab-dev:release/2.0-abc1234 .` fails with "invalid reference format". The `postmerge-ci.yml` workflow correctly sanitizes with `sed`, but this pre-merge workflow does not. Release branch PRs — highest stakes — break CI immediately.',
        fix: 'Sanitize the ref name before using it as a tag:\n```yaml\n- name: Compute image tag\n  run: |\n    SAFE_REF=$(echo "${{ github.ref_name }}" | sed "s/[^a-zA-Z0-9._-]/-/g")\n    PR_NUM="\${{ github.event.pull_request.number }}"\n    echo "DOCKER_IMAGE_TAG=isaac-lab-dev:pr-${PR_NUM}-${SAFE_REF}-\${{ github.sha }}" >> $GITHUB_ENV\n```',
      },
      {
        lines: [38],
        title: '`$$` PID-based container name is fragile across step boundaries',
        severity: 'medium',
        description: '`CONTAINER_NAME="isaac-lab-tasks-test-$$"` uses the shell PID of the current step\'s bash process. The `run-tests` composite action in the prior step creates the container in a different bash process. If the action names the container with its own PID, the names diverge silently. `docker cp` falls back to `|| echo "No test results to copy"` and the XML artifact is never uploaded — combine-results then publishes an empty report.',
        fix: 'Name the container with a deterministic ID derived from the run:\n```yaml\n- name: Set container name\n  run: echo "CONTAINER_NAME=isaac-lab-tasks-\${{ github.run_id }}-\${{ github.run_attempt }}" >> $GITHUB_ENV\n- uses: ./.github/actions/run-tests\n  with:\n    container-name: \${{ env.CONTAINER_NAME }}\n- name: Copy Test Results\n  run: docker cp \${{ env.CONTAINER_NAME }}:/workspace/isaaclab/tests/report.xml reports/\n```',
      },
    ],
    qa: [
      {
        q: 'What does `concurrency: cancel-in-progress: true` do and when would you set it to false?',
        a: 'It cancels any in-progress run for the same concurrency group when a new run starts. For PR workflows grouped by `${{ github.workflow }}-${{ github.ref }}`, a new commit cancels the previous test run — saving GPU time. You\'d set it `false` for post-merge workflows (every merge must produce an artifact) or changelog automation (canceling mid-commit risks a partial push). IsaacLab\'s nightly-changelog.yml uses `cancel-in-progress: false` to queue overlapping runs rather than abort them.',
      },
      {
        q: 'How does the fork PR security model work and why does it matter for CI secrets?',
        a: 'Fork PRs run in a restricted context: GitHub prevents them accessing repository secrets to stop malicious forks from exfiltrating tokens. The `github.event.pull_request.head.repo.full_name != github.repository` check detects fork PRs and skips `publish-unit-test-result-action`, which requires `pull-requests: write`. Without this gate the step fails with a permissions error for every fork PR. The fallback `grep`-based XML check needs no secrets and is safe for fork workflows.',
      },
      {
        q: 'What is the `self-hosted` label in `runs-on` and why is `gpu` listed separately?',
        a: '`self-hosted` tells Actions to route the job to a runner registered by the repo owner rather than a GitHub-managed machine. Additional labels like `gpu` and `nvidia-driver` are custom tags applied during runner registration (`./config.sh --labels self-hosted,gpu,nvidia-driver`). The scheduler picks a runner that has ALL specified labels. GPU-intensive jobs route to GPU machines; lighter jobs (`notify-compat-status`) route to `ubuntu-latest` GitHub-managed runners, saving expensive GPU capacity.',
      },
    ],
  },
  // ── Script 5: daily-compatibility.yml ────────────────────────────────────
  {
    id: 'daily-compat',
    filename: '.github/workflows/daily-compatibility.yml',
    title: 'Nightly Compat Matrix',
    cat: 'Nightly CI',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['dynamic matrix strategy', 'fromJson() matrix expansion', 'multi-version nightly CI', 'backward compatibility testing', 'fail-fast strategy'],
    summary: 'Scheduled nightly (04:00 UTC) backward-compatibility test that runs a matrix of IsaacSim versions. A setup-versions job emits the version array as a job output; downstream jobs consume it with fromJson(). workflow_dispatch allows ad-hoc single-version runs for regression isolation.',
    explain: [
      'setup-versions runs on ubuntu-latest and emits a JSON array like ["4.5.0","5.0.0"] to GITHUB_OUTPUT',
      'test-isaaclab-tasks-compat reads the array via fromJson(needs.setup-versions.outputs.versions) as the matrix',
      'fail-fast: false ensures all versions complete even when one fails — full coverage over speed',
      'continue-on-error: true prevents one version\'s failure from blocking combine-compat-results',
      'Artifacts retain 7 days (vs 1 day for pre-merge) — more time to investigate nightly failures',
      'notify-compatibility-status runs if: always() and builds a Markdown report from the combined results',
    ],
    code: `name: Backwards Compatibility Tests

on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:
    inputs:
      isaacsim_version:
        description: 'IsaacSim version to test'
        required: true
        default: '4.5.0'
        type: string

jobs:
  setup-versions:
    runs-on: ubuntu-latest
    outputs:
      versions: \${{ steps.set-versions.outputs.versions }}
    steps:
      - name: Set Isaac Sim Versions
        id: set-versions
        run: |
          DEFAULT_VERSIONS='["4.5.0", "5.0.0"]'
          if [ -n "\${{ github.event.inputs.isaacsim_version }}" ]; then
            echo "versions=[\"\${{ github.event.inputs.isaacsim_version }}\"]" >> $GITHUB_OUTPUT
          else
            echo "versions=$DEFAULT_VERSIONS" >> $GITHUB_OUTPUT
          fi

  test-isaaclab-tasks-compat:
    needs: setup-versions
    runs-on: [self-hosted, gpu]
    timeout-minutes: 180
    continue-on-error: true
    strategy:
      matrix:
        isaacsim_version: \${{ fromJson(needs.setup-versions.outputs.versions) }}
      fail-fast: false
    env:
      DOCKER_IMAGE_TAG: "isaac-lab-compat:\${{ github.ref_name }}-\${{ github.sha }}-\${{ matrix.isaacsim_version }}"
    steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/docker-build
      with:
        isaacsim-version: \${{ matrix.isaacsim_version }}
    - uses: ./.github/actions/run-tests
      with:
        result-file: "compat-report-\${{ matrix.isaacsim_version }}.xml"
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: compat-results-\${{ matrix.isaacsim_version }}
        path: reports/
        retention-days: 7

  notify-compatibility-status:
    needs: [setup-versions, combine-compat-results]
    if: always()
    runs-on: ubuntu-latest
    steps:
    - name: Create Compatibility Report
      run: |
        VERSIONS="\${{ join(fromJson(needs.setup-versions.outputs.versions || '[]'), ', ') }}"
        echo "## Daily Backwards Compatibility Results" > report.md
        echo "**IsaacSim Versions:** $VERSIONS" >> report.md
        echo "**Branch:** \${{ github.ref_name }}" >> report.md
        echo "**Commit:** \${{ github.sha }}" >> report.md`,
    issues: [
      {
        lines: [30, 37, 38],
        title: '`continue-on-error: true` + `fail-fast: false` silently suppress all matrix failures',
        severity: 'critical',
        description: '`fail-fast: false` lets all matrix cells complete even when one fails. `continue-on-error: true` then marks every completed cell as "success" for needs-dependency purposes — regardless of actual exit code. The combine-compat-results aggregator sees all cells as green and exits 0. A nightly that was supposed to catch regressions across three Isaac Sim versions silently passes even if all three fail. Broken backward compat becomes invisible until a user files a bug.',
        fix: 'Remove `continue-on-error: true` from the matrix job and let downstream jobs use `if: always()`:\n```yaml\ntest-isaaclab-tasks-compat:\n  # remove: continue-on-error: true\n  strategy:\n    fail-fast: false  # keep -- all versions should complete\n\ncombine-compat-results:\n  needs: [test-isaaclab-tasks-compat]\n  if: always()  # runs even if matrix cells failed\n```\nTrue cell results are now visible in the workflow graph and `needs.X.result`.',
      },
      {
        lines: [25],
        title: 'User input injected raw into JSON array string — malformed JSON crashes matrix',
        severity: 'high',
        description: '`echo "versions=[\\"${{ github.event.inputs.isaacsim_version }}\\"]"` embeds the raw user input into a JSON literal. An input like `4.5.0", "5.0.0` produces `["4.5.0", "5.0.0"]` — silently expanding to two versions instead of one. An input with a backslash produces invalid JSON. `fromJson()` on line 37 throws "Invalid value for matrix" with no clue that the injected input caused the parse error.',
        fix: 'Validate the format before writing to GITHUB_OUTPUT:\n```bash\nVERSION="\${{ github.event.inputs.isaacsim_version }}"\nif [[ ! "$VERSION" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then\n  echo "::error::isaacsim_version must be X.Y.Z (e.g. 4.5.0), got: $VERSION"\n  exit 1\nfi\necho "versions=[\\"$VERSION\\"]" >> $GITHUB_OUTPUT\n```',
      },
      {
        lines: [37],
        title: '`fromJson()` on empty output when `setup-versions` fails gives an opaque matrix error',
        severity: 'medium',
        description: 'If `setup-versions` fails (runner unavailable, GITHUB_OUTPUT write error), `needs.setup-versions.outputs.versions` is empty string. `fromJson("")` in the matrix expansion throws a JSON parse error rendered as "Matrix cannot be empty" or "Invalid expression" — with no indication that the upstream job failure caused it. Tracing the root cause requires reading back through multiple log pages.',
        fix: 'Add an explicit guard on the matrix job:\n```yaml\ntest-isaaclab-tasks-compat:\n  needs: setup-versions\n  if: needs.setup-versions.result == \'success\'\n  strategy:\n    matrix:\n      isaacsim_version: \${{ fromJson(needs.setup-versions.outputs.versions) }}\n```\nThis surfaces "skipped because setup-versions failed" rather than a cryptic JSON parse error.',
      },
    ],
    qa: [
      {
        q: 'How does the dynamic matrix pattern work — what is `fromJson()` doing in the matrix strategy?',
        a: '`fromJson()` is a GitHub Actions expression function that parses a JSON string into a value. In a matrix strategy, `isaacsim_version: ${{ fromJson(needs.X.outputs.versions) }}` expects an array — Actions creates one job per element. This is the canonical pattern for dynamic matrices because the `matrix:` block only accepts static YAML or GHA expressions; conditional logic cannot live inside it directly. The `setup-versions` job computes the array and passes it as a string output, which `fromJson()` converts back into a typed array for the matrix expander.',
      },
      {
        q: 'Why is `fail-fast: false` correct for a compat nightly but `cancel-in-progress: true` is correct for pre-merge CI?',
        a: '`fail-fast` controls what happens when one matrix cell fails — with `true`, Actions cancels all remaining cells. With `false`, all cells complete. For a compat test you want full coverage: knowing v4.5 passes but v5.0 fails is actionable; canceling v5.0 when v4.5 fails loses that signal. `cancel-in-progress: true` operates at a completely different dimension — it cancels an entire workflow run when a new run starts for the same concurrency group (a different PR commit, for example). The two settings are orthogonal.',
      },
      {
        q: 'The notify job uses `join(fromJson(...), ", ")` — what breaks if `setup-versions` failed and the output is empty?',
        a: '`fromJson("")` throws a JSON parse error inside the `${{ }}` expression, crashing the notify step. Since notify has `if: always()`, it runs even when upstream failed — so a secondary JSON crash fires on top of the original failure, making the workflow log confusing. The fixed code shown in the script uses `needs.setup-versions.outputs.versions || "[]"` — providing an empty-array fallback so `fromJson` always receives valid JSON and `join` returns an empty string rather than throwing.',
      },
    ],
  },
  // ── Script 6: postmerge-ci.yml ────────────────────────────────────────────
  {
    id: 'postmerge-ci',
    filename: '.github/workflows/postmerge-ci.yml',
    title: 'Multi-arch Post-merge Build',
    cat: 'Release Engineering',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['docker buildx', 'multi-arch (amd64+arm64)', 'QEMU emulation', 'BuildKit GHA cache', 'dynamic platform detection', 'NGC registry push'],
    summary: 'Post-merge pipeline triggered on pushes to main, devel, and release/**. Inspects the upstream NGC Isaac Sim base image manifest to dynamically decide whether to build linux/amd64 only or linux/amd64,linux/arm64, then runs docker buildx with BuildKit layer caching and pushes to NGC/GHCR.',
    explain: [
      'setup-qemu-action installs QEMU user-space emulators for cross-arch builds on amd64 hosts',
      'setup-buildx-action creates a multi-arch BuildKit builder using the moby/buildkit image',
      '`docker manifest inspect` queries the NGC base image to determine which architectures it actually publishes',
      'BUILD_PLATFORMS is set conditionally: linux/amd64,linux/arm64 when both found, amd64-only otherwise',
      '`docker buildx build --platform ... --push` builds and pushes the multi-arch manifest in one command',
      'BuildKit GHA cache (--cache-from/--cache-to type=gha) reuses layer blobs across runs without extra infra',
    ],
    code: `name: Post-Merge CI

on:
  push:
    branches: [main, devel, 'release/**']

env:
  ISAACSIM_BASE_VERSIONS_STRING: \${{ vars.ISAACSIM_BASE_VERSIONS_STRING || '5.1.0' }}
  ISAACLAB_IMAGE_NAME: \${{ vars.ISAACLAB_IMAGE_NAME || 'isaac-lab-base' }}

jobs:
  build-and-push-images:
    runs-on: [self-hosted, gpu]
    timeout-minutes: 180
    steps:
    - uses: docker/setup-qemu-action@v3
      with:
        platforms: linux/arm64
    - uses: docker/setup-buildx-action@v3
      with:
        platforms: linux/amd64,linux/arm64
        driver-opts: image=moby/buildkit:buildx-stable-1

    - name: Build and Push Docker Images
      env:
        NGC_API_KEY: \${{ secrets.NGC_API_KEY }}
      run: |
        SAFE_BRANCH=$(echo "$GITHUB_REF_NAME" | sed "s/[^a-zA-Z0-9._-]/-/g")
        set -- $IMAGE_BASE_VERSIONS_STRING
        IMAGE_BASE_VERSIONS=("$@")

        for IMAGE_BASE_VERSION in "\${IMAGE_BASE_VERSIONS[@]}"; do
          ARCHITECTURES=$(docker manifest inspect "$BASE_IMAGE_FULL" 2>/dev/null | \\
            grep -o '"architecture": "[^"]*"' | cut -d'"' -f4 | sort -u)

          HAS_AMD64=$(echo "$ARCHITECTURES" | grep -c "amd64" || true)
          HAS_ARM64=$(echo "$ARCHITECTURES" | grep -c "arm64" || true)

          if [ "$HAS_AMD64" -gt 0 ] && [ "$HAS_ARM64" -gt 0 ]; then
            BUILD_PLATFORMS="linux/amd64,linux/arm64"
          elif [ "$HAS_AMD64" -gt 0 ]; then
            BUILD_PLATFORMS="linux/amd64"
          fi

          docker buildx build \\
            --platform $BUILD_PLATFORMS \\
            -t \${{ env.ISAACLAB_IMAGE_NAME }}:$COMBINED_TAG \\
            --build-arg ISAACSIM_VERSION_ARG=$IMAGE_BASE_VERSION \\
            --cache-from type=gha \\
            --cache-to type=gha,mode=max \\
            -f docker/Dockerfile.base \\
            --push .
        done`,
    issues: [
      {
        lines: [31, 43, 45],
        title: '`docker manifest inspect` failure leaves `BUILD_PLATFORMS` unset — silently builds wrong platform',
        severity: 'critical',
        description: '`docker manifest inspect "$BASE_IMAGE_FULL" 2>/dev/null` returns empty string if NGC is rate-limiting, the image is not yet published, or the NGC token is missing. With empty `$ARCHITECTURES`, both `HAS_AMD64` and `HAS_ARM64` are 0. Neither `if` branch runs, so `BUILD_PLATFORMS` is never set. `docker buildx build --platform $BUILD_PLATFORMS` runs with an empty `--platform` argument — buildx defaults to the native host platform, producing a single-arch amd64 image. The push succeeds with no error and the registry silently receives a non-multi-arch manifest.',
        fix: 'Add a guard after the detection block and fail loudly:\n```bash\nif [ -z "\${BUILD_PLATFORMS:-}" ]; then\n  echo "::error::docker manifest inspect returned no architectures for $BASE_IMAGE_FULL"\n  echo "::error::Check NGC_API_KEY and image availability before retrying."\n  exit 1\nfi\n```\nAlternatively, maintain a hardcoded `ARM64_VERSIONS` allowlist so the platform decision is data-driven from config, not a live manifest fetch.',
      },
      {
        lines: [49, 50],
        title: '`--cache-to type=gha,mode=max` exhausts the 10 GB GitHub Actions cache limit',
        severity: 'high',
        description: '`mode=max` exports ALL intermediate BuildKit layers to the GHA cache — not just final stage layers. For an image built on top of a 15-30 GB Isaac Sim base, the compressed layer export exceeds the GitHub Actions 10 GB per-repo cache limit immediately. Each post-merge push evicts the entire previous cache. On the next run, `--cache-from type=gha` finds nothing — the cache is perpetually cold, providing zero speedup despite the cache configuration being present.',
        fix: 'Switch to `mode=min` which only exports the final build stage layers:\n```yaml\n--cache-to type=gha,mode=min\n```\nFor large base images, also scope the cache key by branch so release branches don\'t evict main\'s cache:\n```yaml\n--cache-from "type=gha,scope=\${{ github.ref_name }}"\n--cache-to "type=gha,mode=min,scope=\${{ github.ref_name }}"\n```',
      },
      {
        lines: [29],
        title: '`set -- $IMAGE_BASE_VERSIONS_STRING` uses unquoted word splitting — vulnerable to glob expansion',
        severity: 'medium',
        description: '`set -- $IMAGE_BASE_VERSIONS_STRING` (unquoted) triggers shell word splitting and glob expansion before `set` receives its arguments. For `5.1.0 4.5.0` this works, but if the Actions variable contains a glob character (e.g., `5.1.*`), the shell performs filename expansion against the working directory and populates `IMAGE_BASE_VERSIONS` with matching filenames — not version strings. The subsequent `docker buildx build` then receives filesystem paths as the `--build-arg ISAACSIM_VERSION_ARG` value.',
        fix: 'Use `read -ra` for safe word splitting without glob expansion:\n```bash\nread -ra IMAGE_BASE_VERSIONS <<< "$IMAGE_BASE_VERSIONS_STRING"\n# then iterate:\nfor IMAGE_BASE_VERSION in "\${IMAGE_BASE_VERSIONS[@]}"; do\n  ...\ndone\n```',
      },
    ],
    qa: [
      {
        q: 'What is QEMU doing in this workflow and why is it needed for multi-arch Docker builds on an amd64 runner?',
        a: 'QEMU is a user-space CPU emulator. When BuildKit builds a `linux/arm64` image on a `linux/amd64` host, it uses QEMU to emulate the arm64 instruction set for each `RUN` instruction inside the Dockerfile. `docker/setup-qemu-action` installs the QEMU binary and registers it with `binfmt_misc` so the kernel routes arm64 ELF binaries through QEMU. The alternative is native arm64 self-hosted runners — faster but more expensive. For Dockerfiles with heavy `pip install` steps, QEMU emulation can be 5-10x slower, which is why `timeout-minutes: 180` is needed.',
      },
      {
        q: 'What is the difference between `mode=max` and `mode=min` in BuildKit GHA cache export?',
        a: '`mode=max` exports ALL intermediate layer blobs from the build — every `RUN` instruction\'s output is cached. This maximizes future cache hits (any unchanged layer is reused) but produces large exports. `mode=min` only exports layers for the final build stage, producing much smaller exports. For large base images like Isaac Sim (15-30 GB), `mode=max` immediately saturates the 10 GB GHA cache limit. `mode=min` is almost always correct for base images since the expensive intermediate layers (NGC base image, pip installs) are pulled from their registries, not re-executed anyway.',
      },
      {
        q: 'Why does the workflow inspect `docker manifest inspect` before building instead of always building for both platforms?',
        a: 'The Isaac Sim base image from NGC may not have an arm64 variant for every version — NVIDIA publishes arm64 builds selectively. Building `linux/arm64` when the base image has no arm64 layer causes the `FROM` instruction to fail: BuildKit cannot pull the base image for that platform. By inspecting the manifest first, the workflow avoids a guaranteed build failure. This is a data-driven platform decision. A simpler alternative used in many projects is a hardcoded `ARM64_SUPPORTED_VERSIONS` list in the workflow vars — fewer network calls, more predictable.',
      },
    ],
  },
  // ── Script 7: nightly-changelog.yml ──────────────────────────────────────
  {
    id: 'nightly-changelog',
    filename: '.github/workflows/nightly-changelog.yml',
    title: 'Nightly Changelog Auto-commit',
    cat: 'Release Engineering',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['GitHub App token', 'branch protection bypass', 'automated git commits', 'towncrier changelog', 'version bump automation'],
    summary: 'Scheduled nightly at 05:00 UTC: mints a GitHub App installation token, checks out the develop branch, runs `tools/changelog/cli.py compile --all` to merge towncrier fragment files into CHANGELOG.rst and bump extension.toml versions, then commits and pushes back to develop. workflow_dispatch supports dry-run mode.',
    explain: [
      'actions/create-github-app-token mints a short-lived installation token — bypasses branch protection rules that block github.token pushes',
      'checkout uses the App token so the resulting commit is attributed to the isaaclab-bot[bot] user',
      'cli.py compile aggregates per-PR changelog fragment files (added by each PR) into per-extension CHANGELOG.rst files',
      'git add uses shell glob patterns to stage changelog.d/, CHANGELOG.rst, and extension.toml files',
      'git diff --staged --quiet short-circuits the commit when nothing changed — prevents empty commits',
      'git pull --rebase before push handles concurrent pushes from other automation (release tagging, hotfixes)',
    ],
    code: `name: Nightly Changelog Compilation

on:
  schedule:
    - cron: '0 5 * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        type: boolean
        default: false

concurrency:
  group: nightly-changelog
  cancel-in-progress: false

jobs:
  compile-changelog:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
    - uses: actions/create-github-app-token@v1
      id: app-token
      with:
        app-id: \${{ secrets.CHANGELOG_APP_ID }}
        private-key: \${{ secrets.CHANGELOG_APP_PRIVATE_KEY }}

    - uses: actions/checkout@v4
      with:
        ref: develop
        token: \${{ steps.app-token.outputs.token }}
        fetch-depth: 0

    - name: Compile changelog fragments
      run: |
        ARGS="--all"
        [ "\${{ inputs.dry_run }}" = "true" ] && ARGS="$ARGS --dry-run"
        python3 tools/changelog/cli.py compile $ARGS

    - name: Commit and push if fragments compiled
      if: \${{ !inputs.dry_run }}
      run: |
        git config user.name "isaaclab-bot[bot]"
        git config user.email "282401363+isaaclab-bot[bot]@users.noreply.github.com"
        git add source/*/changelog.d/ source/*/docs/CHANGELOG.rst \\
                source/*/config/extension.toml
        if ! git diff --staged --quiet; then
          for tom in \$(git diff --staged --name-only \\
                      -- 'source/*/config/extension.toml'); do
            pkg=\$(echo "$tom" | sed -E 's|source/([^/]+)/config/extension.toml|\\1|')
            old=\$(git diff --staged "$tom" | awk -F'"' '/^-version/{print \$2; exit}')
            new=\$(git diff --staged "$tom" | awk -F'"' '/^\\+version/{print \$2; exit}')
            echo "- $pkg: $old -> $new"
          done
          git commit -m "[CI][Auto Version Bump]"
          git pull --rebase origin develop
          git push origin HEAD:develop
        fi`,
    issues: [
      {
        lines: [44, 45],
        title: 'Shell glob in `git add` silently stages nothing when patterns match no files',
        severity: 'high',
        description: '`git add source/*/changelog.d/ source/*/docs/CHANGELOG.rst source/*/config/extension.toml` runs shell glob expansion before `git add` receives its arguments. If no files match (e.g., all fragments were already compiled, or the source tree is differently structured), the shell passes literal unmatched glob strings to `git add`. Without `set -e`, the resulting "pathspec did not match any files" warning is swallowed. `git diff --staged --quiet` returns true (nothing staged), the workflow exits 0, and zero changelogs are compiled with no error signal.',
        fix: 'Use `--ignore-unmatch` so git add never errors on missing files:\n```bash\ngit add --ignore-unmatch \\\n  source/*/changelog.d/ \\\n  source/*/docs/CHANGELOG.rst \\\n  source/*/config/extension.toml\n```\nOr add `shopt -s nullglob` before `git add` so unexpanded globs produce empty argument lists rather than literal strings.',
      },
      {
        lines: [47, 48],
        title: '`for tom in $(...)` word-splits on whitespace — breaks on paths with spaces',
        severity: 'medium',
        description: '`for tom in $(git diff --staged --name-only -- \'source/*/config/extension.toml\')` uses command substitution which is subject to word splitting. Any `extension.toml` path containing a space would be split into multiple loop iterations, each receiving a path fragment. The `sed` and `awk` commands then receive partial paths and produce empty `pkg`, `old`, and `new` variables — yielding commit message lines like `- :  ->` with no package information.',
        fix: 'Use `while IFS= read -r` to safely handle any filename:\n```bash\nwhile IFS= read -r tom; do\n  pkg=$(echo "$tom" | sed -E \'s|source/([^/]+)/config/extension.toml|\\1|\')\n  old=$(git diff --staged "$tom" | awk -F\'"\' \'/^-version/{print $2; exit}\')\n  new=$(git diff --staged "$tom" | awk -F\'"\' \'/^\\+version/{print $2; exit}\')\n  echo "- $pkg: $old -> $new"\ndone < <(git diff --staged --name-only -- \'source/*/config/extension.toml\')\n```',
      },
      {
        lines: [21, 22, 23, 24, 25],
        title: 'Missing GitHub App secrets give a cryptic error with no remediation hint',
        severity: 'medium',
        description: '`actions/create-github-app-token` fails with "Input required and not supplied: private-key" if `CHANGELOG_APP_PRIVATE_KEY` is missing (key rotation, new fork, env misconfiguration). The error does not explain WHY the App token is needed. A new engineer might try substituting `${{ github.token }}` — which silently fails downstream because branch protection blocks GITHUB_TOKEN pushes, producing a different opaque error. Two cryptic failures in sequence make the root cause very hard to diagnose.',
        fix: 'Add a validation step before token creation:\n```yaml\n- name: Validate App secrets\n  run: |\n    if [ -z "\${{ secrets.CHANGELOG_APP_ID }}" ]; then\n      echo "::error::CHANGELOG_APP_ID is missing. This workflow requires a GitHub App"\n      echo "::error::with Contents:write permission to bypass branch protection on develop."\n      exit 1\n    fi\n```',
      },
    ],
    qa: [
      {
        q: 'Why does this workflow use a GitHub App token instead of a PAT or `github.token`?',
        a: 'Branch protection rules on `develop` typically block direct pushes from `github.token` (the default GITHUB_TOKEN) because it\'s treated as an automation token without bypass privileges. A GitHub App installation token is different: the App can be granted "bypass branch protection" in repository settings, letting the bot push directly to protected branches without PR approval. A PAT also works but is tied to a human account — if that person leaves the org, the PAT is revoked. GitHub Apps are org-level service accounts whose lifecycle is independent of any individual employee.',
      },
      {
        q: 'What is `cancel-in-progress: false` doing on the concurrency group and why is it correct here?',
        a: '`cancel-in-progress: false` queues concurrent runs rather than cancelling them. For a workflow that commits to a branch, two parallel runs could race to push — the second push would be rejected if the first already landed. By queueing, the second run waits for the first to finish, then starts fresh with the already-committed state. If `cancel-in-progress: true` were used, a second trigger would cancel the first mid-commit, potentially leaving the branch in a partially committed state (fragments compiled but not pushed).',
      },
      {
        q: 'What is towncrier-style changelog compilation and why is it better than editing CHANGELOG.rst directly?',
        a: 'Each PR adds a small "changelog fragment" file (e.g., `changelog.d/123.bugfix.rst`) named after the PR number and type. At compile time, `cli.py compile` reads all fragment files, sorts them, appends them to CHANGELOG.rst, and deletes the fragments. This avoids merge conflicts: two PRs adding changelog entries would conflict if both edited CHANGELOG.rst directly. Fragment files are uniquely named after PR numbers, so they never conflict. The nightly compilation runs post-merge to keep the main changelog current without requiring each PR author to resolve CHANGELOG.rst conflicts.',
      },
    ],
  },
  // ── Script 8: cluster_interface.sh ───────────────────────────────────────
  {
    id: 'cluster-interface',
    filename: 'docker/cluster/cluster_interface.sh',
    title: 'HPC Cluster Deployment',
    cat: 'Infrastructure',
    diff: 'hard',
    lang: 'bash',
    jdSkills: ['Singularity/Apptainer', 'SLURM job submission', 'PBS/Torque', 'Docker-to-SIF conversion', 'HPC rsync deployment', 'GPU cluster workflows'],
    summary: 'CLI tool for deploying Isaac Lab to GPU HPC clusters. The `push` subcommand converts a local Docker image to an Apptainer SIF and scp-uploads it to the login node. The `job` subcommand rsync-syncs source code and submits a SLURM or PBS job that runs Isaac Lab inside Singularity on a compute node.',
    explain: [
      'Sources .env.cluster to load CLUSTER_LOGIN, CLUSTER_SIF_PATH, CLUSTER_ISAACLAB_DIR, CLUSTER_JOB_SCHEDULER',
      '`push`: apptainer build --sandbox --fakeroot converts docker-daemon://image to a Singularity sandbox directory, then tar+scp to the login node',
      '`job`: rsync syncs Isaac Lab source with --exclude and --filter rules, then SSH-submits via the scheduler-specific script',
      'submit_job dispatches to submit_job_slurm.sh or submit_job_pbs.sh based on CLUSTER_JOB_SCHEDULER',
      'The SLURM script generates an #SBATCH job file at runtime via heredoc, then pipes it to `sbatch`',
      'The compute node runs run_singularity.sh: `singularity exec --nv --containall` with 8 cache bind mounts for NVIDIA GPU caches',
    ],
    code: `#!/usr/bin/env bash
# =============================================================================
# docker/cluster/cluster_interface.sh
# Deploys Isaac Lab to GPU HPC clusters via Apptainer + SLURM/PBS.
# Usage:
#   ./cluster_interface.sh push [profile]      -- build SIF and upload to HPC
#   ./cluster_interface.sh job  [profile] ...  -- rsync code + submit job
# Env: CLUSTER_LOGIN, CLUSTER_SIF_PATH, CLUSTER_ISAACLAB_DIR,
#      CLUSTER_JOB_SCHEDULER (SLURM|PBS)
# =============================================================================
set -e

CLUSTER_ENV="$(dirname "$0")/.env.cluster"
[ -f "$CLUSTER_ENV" ] && source "$CLUSTER_ENV"

profile="\${2:-base}"
current_datetime=$(date +%Y%m%d_%H%M%S)

push() {
  echo "[INFO] Building Apptainer SIF from Docker image isaac-lab-\${profile}..."
  mkdir -p exports
  APPTAINER_NOHTTPS=1 apptainer build --sandbox --fakeroot \\
    "isaac-lab-\${profile}.sif" \\
    "docker-daemon://isaac-lab-\${profile}:latest"
  tar -cvf "exports/isaac-lab-\${profile}.tar" "isaac-lab-\${profile}.sif"
  scp "exports/isaac-lab-\${profile}.tar" "\${CLUSTER_LOGIN}:\${CLUSTER_SIF_PATH}/"
  echo "[INFO] Uploaded to \${CLUSTER_LOGIN}:\${CLUSTER_SIF_PATH}/"
}

submit_job() {
  case "\${CLUSTER_JOB_SCHEDULER}" in
    SLURM) job_script="submit_job_slurm.sh" ;;
    PBS)   job_script="submit_job_pbs.sh" ;;
    *)
      echo "[ERROR] Unknown scheduler: \${CLUSTER_JOB_SCHEDULER}" >&2
      exit 1 ;;
  esac
  local REMOTE_DIR="\${CLUSTER_ISAACLAB_DIR}_\${current_datetime}"
  echo "[INFO] Syncing Isaac Lab to \${CLUSTER_LOGIN}:\${REMOTE_DIR}..."
  rsync -rh --exclude="*.git*" --filter=":- .dockerignore" \\
    . "\${CLUSTER_LOGIN}:\${REMOTE_DIR}"
  ssh "\${CLUSTER_LOGIN}" \\
    "cd \${REMOTE_DIR} && bash docker/cluster/\${job_script} \${REMOTE_DIR} \${@:3}"
}

case "\$1" in
  push) push ;;
  job)  submit_job "$@" ;;
  *)
    echo "Usage: $0 push|job [profile] [args...]"
    exit 1 ;;
esac`,
    issues: [
      {
        lines: [22, 23, 24],
        title: '`--fakeroot` requires `/etc/subuid` mapping — no pre-flight check',
        severity: 'high',
        description: '`apptainer build --sandbox --fakeroot` requires the current user to have entries in `/etc/subuid` and `/etc/subgid` (subordinate UID/GID ranges). On most HPC login nodes, only root-trusted users are configured in these files. If the user is not configured, Apptainer exits with "fakeroot requires a user in /etc/subuid" — an error that takes significant time to diagnose and escalate to HPC admins. The script has no pre-flight check and no fallback, so the entire `push` flow silently fails mid-conversion.',
        fix: 'Add a pre-flight check before the apptainer build:\n```bash\nif ! grep -q "^$(whoami):" /etc/subuid 2>/dev/null; then\n  echo "[ERROR] $(whoami) is not in /etc/subuid. Fakeroot is unavailable."\n  echo "[INFO]  Ask your HPC admin: $(whoami):100000:65536 in /etc/subuid and /etc/subgid"\n  exit 1\nfi\n```',
      },
      {
        lines: [40],
        title: '`--exclude="*.git*"` is too broad — excludes any filename containing "git"',
        severity: 'medium',
        description: '`rsync --exclude="*.git*"` matches any filename containing the substring "git" anywhere — not just the `.git/` directory. Files named `widget_config.py`, `digit_recognition.sh`, or `git-blame-output.txt` would be silently excluded from the transfer. The cluster job then fails with import errors or missing files, and the cause is non-obvious since rsync exits 0.',
        fix: 'Use an exact directory match for the git metadata directory:\n```bash\nrsync -rh \\\n  --exclude=".git/" \\\n  --filter=":- .dockerignore" \\\n  . "\${CLUSTER_LOGIN}:\${REMOTE_DIR}"\n```\nThe trailing `/` on `.git/` ensures only the root `.git` directory is excluded, not files named `*git*` in subdirectories.',
      },
      {
        lines: [38, 40, 41],
        title: 'Timestamped `REMOTE_DIR` accumulates stale directories on rsync failure',
        severity: 'medium',
        description: '`REMOTE_DIR="${CLUSTER_ISAACLAB_DIR}_${current_datetime}"` creates a new timestamped directory on the cluster for each `job` invocation. If rsync fails mid-transfer (SSH drop, disk quota exceeded), a partial directory remains. Subsequent runs create new timestamped directories, accumulating partial transfers indefinitely. HPC clusters have strict disk quotas; stale partial-sync directories consume quota silently and appear indistinguishable from legitimate historical runs.',
        fix: 'Add an ERR trap that removes the remote directory on rsync failure:\n```bash\ntrap \'ssh "\${CLUSTER_LOGIN}" "rm -rf \${REMOTE_DIR}" 2>/dev/null; exit 1\' ERR\nrsync -rh --exclude=".git/" . "\${CLUSTER_LOGIN}:\${REMOTE_DIR}"\ntrap - ERR  # clear trap after successful rsync\n```\nAlternatively, use a fixed directory name (overwriting previous) rather than timestamped, and only switch to timestamped for archival deployments.',
      },
    ],
    qa: [
      {
        q: 'What is Apptainer (formerly Singularity) and why does the cluster use it instead of Docker?',
        a: 'Apptainer (rebranded from Singularity in 2021) is a container runtime designed for HPC environments. Unlike Docker, it requires no daemon running as root — containers run as the invoking user, which satisfies HPC security policies that prohibit user-space daemons with root privileges. Apptainer natively supports GPU passthrough via `--nv` (equivalent to `docker run --gpus all`), MPI integration, and high-performance parallel filesystems (Lustre, GPFS). Docker containers are converted to SIF (Singularity Image Format) files — single portable files that are easy to transfer via scp and share on cluster storage.',
      },
      {
        q: 'Why does `push` convert Docker to a `.tar` file instead of transferring the SIF directory directly?',
        a: '`apptainer build --sandbox` creates a sandbox directory (a directory tree representing the container filesystem), not a single file. Directories are inefficient to transfer with `scp` — you\'d need `scp -r` which creates thousands of small file transfers and is much slower. Wrapping the sandbox in `tar` produces a single file that `scp` transfers efficiently in one operation. On the cluster, the operator untars it to get the sandbox. An alternative is `apptainer build image.sif` (without `--sandbox`) which produces a compressed single-file SIF directly — often better for production deployments.',
      },
      {
        q: 'What does `set -e` do at the top of the script and what is the risk with commands like `grep` or `test`?',
        a: '`set -e` (errexit) causes the script to exit immediately when any command returns non-zero. The risk: `grep -c "amd64"` exits 1 when it finds 0 matches. With `set -e`, `HAS_AMD64=$(echo "$ARCH" | grep -c "amd64")` exits the entire script when no matches are found. The `|| true` pattern prevents this: `grep -c "amd64" || true` always exits 0. In this cluster script, `rsync` failing mid-transfer causes immediate exit (via `set -e`) and leaves the partial remote directory behind — which is actually handled correctly here since `set -e` triggers the ERR trap (if set). Without a trap, the stale directory silently accumulates.',
      },
    ],
  },
  // ── Script 9: docker/Dockerfile.base ─────────────────────────────────────
  {
    id: 'dockerfile-base',
    filename: 'docker/Dockerfile.base',
    title: 'Dockerfile.base',
    cat: 'Docker',
    diff: 'hard',
    lang: 'dockerfile',
    jdSkills: ['multi-stage Dockerfile', 'BuildKit cache mounts', 'ARG parametrization', 'Singularity compatibility', 'NVIDIA GPU containers'],
    summary: 'Multi-stage Dockerfile for Isaac Lab. Parametrized by ISAACSIM_BASE_IMAGE_ARG and ISAACSIM_VERSION_ARG so the same file builds against any Isaac Sim release. Uses BuildKit --mount=type=cache for apt and pip layers, creates Singularity bind-mount directory stubs for HPC deployment, and installs all Isaac Lab Python extensions via isaaclab.sh --install.',
    explain: [
      'Pre-FROM ARGs parametrize the FROM instruction — ISAACSIM_BASE_IMAGE_ARG and ISAACSIM_VERSION_ARG must be re-declared after FROM to be usable in subsequent instructions',
      'Post-FROM ARG/ENV pairs (ISAACSIM_ROOT_PATH, ISAACLAB_PATH, DOCKER_USER_HOME) are injected via --build-arg in the CI workflow',
      '--mount=type=cache on apt and pip layers avoids re-downloading packages on every rebuild, dramatically cutting iteration time',
      'mkdir + touch stubs under /bin/nvidia-* and /var/run/ are bind-mount anchors for Singularity --nv GPU passthrough',
      'isaaclab.sh --install runs pip install for all source/ extension packages detected via extension.toml',
      'Shell aliases (isaaclab, python) let users run lab commands without full path inside the container',
    ],
    code: `ARG ISAACSIM_BASE_IMAGE_ARG
ARG ISAACSIM_VERSION_ARG
FROM \${ISAACSIM_BASE_IMAGE_ARG}:\${ISAACSIM_VERSION_ARG} AS base
ENV ISAACSIM_VERSION=\${ISAACSIM_VERSION_ARG}

SHELL ["/bin/bash", "-c"]
LABEL version="2.1.1"
LABEL description="Isaac Lab development container"

ARG ISAACSIM_ROOT_PATH_ARG
ENV ISAACSIM_ROOT_PATH=\${ISAACSIM_ROOT_PATH_ARG}
ARG ISAACLAB_PATH_ARG
ENV ISAACLAB_PATH=\${ISAACLAB_PATH_ARG}
ARG DOCKER_USER_HOME_ARG
ENV DOCKER_USER_HOME=\${DOCKER_USER_HOME_ARG}

ENV LANG=C.UTF-8
ENV DEBIAN_FRONTEND=noninteractive

RUN --mount=type=cache,target=/var/cache/apt \\
    apt-get update && apt-get install -y --no-install-recommends \\
    build-essential cmake git libglib2.0-0 ncurses-term wget && \\
    apt -y autoremove && apt clean autoclean && rm -rf /var/lib/apt/lists/*

COPY . \${ISAACLAB_PATH}
RUN chmod +x \${ISAACLAB_PATH}/isaaclab.sh
RUN ln -sf \${ISAACSIM_ROOT_PATH} \${ISAACLAB_PATH}/_isaac_sim

RUN --mount=type=cache,target=/var/cache/apt \\
    \${ISAACLAB_PATH}/isaaclab.sh -p \${ISAACLAB_PATH}/tools/install_deps.py apt \\
    \${ISAACLAB_PATH}/source && apt clean autoclean && rm -rf /var/lib/apt/lists/*

# Singularity bind-mount directory stubs
RUN mkdir -p \${ISAACSIM_ROOT_PATH}/kit/cache && \\
    mkdir -p \${DOCKER_USER_HOME}/.cache/ov && \\
    mkdir -p \${DOCKER_USER_HOME}/.cache/pip && \\
    mkdir -p \${DOCKER_USER_HOME}/.cache/nvidia/GLCache && \\
    mkdir -p \${DOCKER_USER_HOME}/.nv/ComputeCache && \\
    mkdir -p \${DOCKER_USER_HOME}/.nvidia-omniverse/logs && \\
    mkdir -p \${DOCKER_USER_HOME}/.local/share/ov/data && \\
    mkdir -p \${DOCKER_USER_HOME}/Documents

# Singularity NVIDIA binary placeholders
RUN touch /bin/nvidia-smi && touch /bin/nvidia-debugdump && \\
    touch /bin/nvidia-persistenced && touch /bin/nvidia-cuda-mps-control && \\
    touch /bin/nvidia-cuda-mps-server && touch /etc/localtime && \\
    mkdir -p /var/run/nvidia-persistenced && \\
    touch /var/run/nvidia-persistenced/socket

RUN --mount=type=cache,target=\${DOCKER_USER_HOME}/.cache/pip \\
    \${ISAACLAB_PATH}/isaaclab.sh --install

RUN echo "alias isaaclab=\${ISAACLAB_PATH}/isaaclab.sh" >> \${HOME}/.bashrc && \\
    echo "alias python=\${ISAACLAB_PATH}/_isaac_sim/python.sh" >> \${HOME}/.bashrc

WORKDIR \${ISAACLAB_PATH}`,
    issues: [
      {
        lines: [4],
        title: 'Pre-FROM `ARG` is out of scope after `FROM` — `ISAACSIM_VERSION` is set to empty string',
        severity: 'critical',
        description: '`ISAACSIM_VERSION_ARG` is declared before the `FROM` instruction (global scope). In Docker\'s multi-stage build model, pre-FROM ARGs are only available for use in `FROM` itself — they are NOT in scope for any subsequent instruction. `ENV ISAACSIM_VERSION=${ISAACSIM_VERSION_ARG}` on line 4 references a scoped-out variable, so the resulting environment variable is always empty. Any runtime code that reads `$ISAACSIM_VERSION` inside the container gets an empty string, not "5.1.0".',
        fix: 'Re-declare the ARG after FROM to bring it back into scope:\n```dockerfile\nARG ISAACSIM_VERSION_ARG  # global scope (for FROM)\nFROM ${ISAACSIM_BASE_IMAGE_ARG}:${ISAACSIM_VERSION_ARG} AS base\nARG ISAACSIM_VERSION_ARG  # re-declare after FROM to make it available here\nENV ISAACSIM_VERSION=${ISAACSIM_VERSION_ARG}  # now non-empty\n```\nNote: you do NOT need to pass `--build-arg` again — Docker carries the original value through.',
      },
      {
        lines: [18],
        title: '`ENV DEBIAN_FRONTEND=noninteractive` persists into the running container',
        severity: 'high',
        description: 'Setting `DEBIAN_FRONTEND=noninteractive` as an `ENV` instruction makes it permanent for the entire container lifetime, not just the build phase. If a developer shells into the container and runs `apt install`, prompts are silently suppressed — with no indication of which choices were defaulted. More critically, some tools detect `DEBIAN_FRONTEND=noninteractive` to skip prompts in ways that change their behavior (e.g., skipping locale configuration that affects Python string encoding).',
        fix: 'Scope it to build time only using `ARG`:\n```dockerfile\nARG DEBIAN_FRONTEND=noninteractive\n```\n`ARG` values are not persisted into the final image. Alternatively, prefix individual `RUN` instructions:\n```dockerfile\nRUN DEBIAN_FRONTEND=noninteractive apt-get install -y ...\n```',
      },
      {
        lines: [43, 44, 45, 46, 47],
        title: '`touch /bin/nvidia-smi` creates an empty file — GPU availability checks break inside container',
        severity: 'medium',
        description: 'The empty placeholder files prevent Singularity from failing at bind-mount time (it requires the target paths to exist). However, if any code inside the container tries to run `nvidia-smi` to verify GPU presence (e.g., a health check or Python CUDA availability probe), the empty file is executed and returns "Exec format error" — not a graceful "GPU not available" message. Tools that catch a non-zero exit code assume the GPU is missing and may fall back to CPU mode silently.',
        fix: 'Replace empty files with minimal shell scripts that exit with a clear message:\n```dockerfile\nRUN printf \'#!/bin/sh\\necho "nvidia-smi: not available inside container (Singularity bind-mount)"; exit 0\' \\\n    > /bin/nvidia-smi && chmod +x /bin/nvidia-smi\n```\nThis returns a human-readable message and exits 0, preserving compatibility with tools that only check the exit code.',
      },
    ],
    qa: [
      {
        q: 'What is a BuildKit `--mount=type=cache` and why is it better than caching in a separate layer?',
        a: 'A BuildKit cache mount attaches a persistent cache directory to a `RUN` step at build time, without including the cache in the resulting image layer. For apt, `--mount=type=cache,target=/var/cache/apt` keeps downloaded `.deb` files between builds so subsequent `apt-get install` calls skip re-downloading packages. For pip, `--mount=type=cache,target=~/.cache/pip` reuses the pip HTTP cache. The traditional approach — caching layers by ordering `RUN apt-get install` before `COPY` — only works if no instructions above it change. BuildKit cache mounts are more granular and work even when layer order changes.',
      },
      {
        q: 'Why does this Dockerfile create empty placeholder directories and files for Singularity?',
        a: 'Singularity (Apptainer) bind-mounts host directories into the container via `-B host_path:container_path`. Bind-mounting requires the TARGET path to exist inside the container — if it doesn\'t, Singularity errors out at container startup. The Dockerfile pre-creates all the NVIDIA cache and log directories (`kit/cache`, `.cache/ov`, etc.) and placeholder binary files (`/bin/nvidia-smi`) so that Singularity can mount the actual GPU-backed paths from the host over them. The placeholders ensure the container works both standalone (Docker) and via Singularity on GPU clusters.',
      },
      {
        q: 'What is the difference between `ARG` and `ENV` in a Dockerfile and when do you use each?',
        a: '`ARG` declares a build-time variable available only during the build process — it is not present in the final image or in running containers. `ENV` sets a persistent environment variable that is available both during the build and inside running containers. Use `ARG` for build parameters (image version, path overrides, secrets that must not leak into the image). Use `ENV` for runtime configuration (paths, locale, library flags). A common pattern: `ARG VERSION` to accept the value, `ENV APP_VERSION=${VERSION}` to bake it into the image for runtime use. Never use `ENV` for build secrets — they appear in `docker inspect` and `docker history`.',
      },
    ],
  },
  // ── Script 10: docker/Dockerfile.ros2 ────────────────────────────────────
  {
    id: 'dockerfile-ros2',
    filename: 'docker/Dockerfile.ros2',
    title: 'Dockerfile.ros2',
    cat: 'Docker',
    diff: 'medium',
    lang: 'dockerfile',
    jdSkills: ['layered Docker builds', 'ROS 2 Humble', 'RMW middleware', 'multi-arch cross-build', 'apt repository setup'],
    summary: 'Layered ROS 2 Humble image that builds on top of the isaac-lab-base image (not from scratch). Adds the ROS2 apt repo, installs ros-humble-${ROS2_APT_PACKAGE} plus both FastRTPS and CycloneDDS RMW implementations, runs install_deps.py rosdep for workspace deps, and adds FastDDS/CycloneDDS XML config files.',
    explain: [
      'FROM isaac-lab-base${DOCKER_NAME_SUFFIX} lets the suffix parameter select different base variants (e.g., -ros2-dev)',
      'curl + add-apt-repository + ros.key adds the ROS2 apt repository for Ubuntu Jammy',
      'Both rmw-fastrtps-cpp and rmw-cyclonedds-cpp are installed — the active RMW is selected at runtime via RMW_IMPLEMENTATION env var',
      'install_deps.py rosdep scans extension.toml files and installs any ROS package dependencies declared per-extension',
      'COPY docker/.ros/ ${DOCKER_USER_HOME}/.ros/ installs FastDDS and CycloneDDS XML config files',
      'source /opt/ros/humble/setup.bash added to .bashrc enables ros2 CLI inside interactive shells',
    ],
    code: `ARG DOCKER_NAME_SUFFIX=""
FROM isaac-lab-base\${DOCKER_NAME_SUFFIX} AS ros2

ARG ROS2_APT_PACKAGE=ros-base
ARG DOCKER_USER_HOME

RUN --mount=type=cache,target=/var/cache/apt \\
    apt-get update && apt-get install -y --no-install-recommends \\
    curl software-properties-common && \\
    add-apt-repository universe && \\
    curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \\
         -o /usr/share/keyrings/ros-archive-keyring.gpg && \\
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \\
         http://packages.ros.org/ros2/ubuntu jammy main" | \\
         tee /etc/apt/sources.list.d/ros2.list > /dev/null && \\
    apt-get update && apt-get install -y --no-install-recommends \\
    ros-humble-\${ROS2_APT_PACKAGE} \\
    ros-humble-vision-msgs \\
    ros-humble-rmw-cyclonedds-cpp \\
    ros-humble-rmw-fastrtps-cpp \\
    ros-dev-tools && \\
    apt -y autoremove && apt clean autoclean && rm -rf /var/lib/apt/lists/*

RUN \${ISAACLAB_PATH}/isaaclab.sh -p \\
    \${ISAACLAB_PATH}/tools/install_deps.py rosdep \${ISAACLAB_PATH}/source

COPY docker/.ros/ \${DOCKER_USER_HOME}/.ros/

RUN echo "source /opt/ros/humble/setup.bash" >> \${HOME}/.bashrc`,
    issues: [
      {
        lines: [13],
        title: '`$(dpkg --print-architecture)` returns builder arch in cross-platform buildx — wrong apt repo arch for arm64 targets',
        severity: 'high',
        description: '`dpkg --print-architecture` returns the architecture of the machine running the build, not the target platform. When `docker buildx build --platform linux/arm64` runs on an amd64 host, this call returns "amd64". The ROS2 apt repository is then configured for `amd64`, but the container is `arm64`. Any subsequent `apt-get install ros-humble-*` inside this layer (or during a `docker run`) installs amd64 binaries into an arm64 container, causing immediate crash on execution.',
        fix: 'Use `$TARGETARCH` — a BuildKit automatic ARG that contains the target platform architecture:\n```dockerfile\nARG TARGETARCH\nRUN echo "deb [arch=${TARGETARCH} signed-by=...] http://packages.ros.org/ros2/ubuntu jammy main" | \\\n    tee /etc/apt/sources.list.d/ros2.list\n```\n`TARGETARCH` is set by BuildKit to `amd64`, `arm64`, etc. matching the `--platform` flag.',
      },
      {
        lines: [28],
        title: '`source /opt/ros/humble/setup.bash` added to `${HOME}/.bashrc` — non-interactive shells skip it',
        severity: 'medium',
        description: '`.bashrc` is only sourced for interactive, non-login shells. When GitHub Actions runs a command in the container via `docker exec` or `docker run`, it uses a non-interactive shell — `.bashrc` is skipped. ROS2 environment variables (`ROS_DOMAIN_ID`, `AMENT_PREFIX_PATH`, `ROS_DISTRO`) are not set, and `ros2` CLI commands fail with "command not found". CI tests that rely on the ROS2 environment set up in `.bashrc` work locally (interactive shell) but fail in CI.',
        fix: 'Source setup.bash in a higher-precedence location that applies to all shell types:\n```dockerfile\nRUN echo "source /opt/ros/humble/setup.bash" >> /etc/bash.bashrc\n```\nOr add it to `/etc/profile.d/` for all login shells. For CI: pass `--env ROS_DISTRO=humble` and `--env AMENT_PREFIX_PATH=/opt/ros/humble` explicitly to docker run.',
      },
      {
        lines: [4],
        title: '`ARG DOCKER_USER_HOME` re-declared after FROM without a default — inherits nothing from base',
        severity: 'medium',
        description: 'In the base image, `DOCKER_USER_HOME` was set as both `ARG` and `ENV`. The `ENV` value is baked into the base image layer and IS available in this derived stage. However, re-declaring `ARG DOCKER_USER_HOME` (without a value) on line 4 in this stage overrides the inherited `ENV` value with the build-arg value — which defaults to empty string if not passed via `--build-arg`. The `COPY docker/.ros/ ${DOCKER_USER_HOME}/.ros/` destination then expands to `/./ros/` (empty var + suffix), copying files to a path the user probably doesn\'t intend.',
        fix: 'Remove the `ARG DOCKER_USER_HOME` re-declaration — the ENV from the base stage is already available:\n```dockerfile\n# Remove: ARG DOCKER_USER_HOME\nFROM isaac-lab-base${DOCKER_NAME_SUFFIX} AS ros2\nARG ROS2_APT_PACKAGE=ros-base\n# DOCKER_USER_HOME is already set as ENV from base stage\nCOPY docker/.ros/ ${DOCKER_USER_HOME}/.ros/\n```',
      },
    ],
    qa: [
      {
        q: 'Why are both FastRTPS and CycloneDDS installed, and how does ROS2 select which one to use at runtime?',
        a: 'ROS2 uses a middleware abstraction layer (RMW — ROS Middleware) that decouples the ROS2 API from the specific DDS implementation. Both `rmw_fastrtps_cpp` and `rmw_cyclonedds_cpp` are installed so the operator can switch between them without rebuilding the container. The selection is done at runtime via the `RMW_IMPLEMENTATION` environment variable — e.g., `RMW_IMPLEMENTATION=rmw_cyclonedds_cpp ros2 run ...`. FastRTPS (now eProsima Fast DDS) is the default; CycloneDDS often performs better in cloud/container environments with complex network topologies.',
      },
      {
        q: 'What does `install_deps.py rosdep` do and why is it separate from the apt ROS install?',
        a: '`install_deps.py rosdep` scans all `extension.toml` files in the source directory for declared ROS package dependencies (e.g., `ros-humble-vision-msgs` for a computer vision extension). It calls `rosdep install` to resolve and install those packages. This separation means the base ROS2 install is fixed (reproducing a known-good set of core packages), while per-extension ROS deps are discovered and installed dynamically. Adding a new Isaac Lab extension that needs `ros-humble-nav2-msgs` only requires adding it to the extension\'s `extension.toml` — no Dockerfile edit needed.',
      },
      {
        q: 'What is `FROM isaac-lab-base${DOCKER_NAME_SUFFIX}` doing and how does the suffix pattern work?',
        a: 'This is a named local image reference — it expects a Docker image named `isaac-lab-base` (or `isaac-lab-base<suffix>`) to exist in the local Docker daemon. The `DOCKER_NAME_SUFFIX` ARG lets you select a base variant: `--build-arg DOCKER_NAME_SUFFIX=-gpu-slim` would select `isaac-lab-base-gpu-slim`. The default is empty string, selecting the standard `isaac-lab-base`. This pattern replaces multiple `FROM` statements with a single parametrized one, reducing Dockerfile duplication. The limitation: if the base image isn\'t built locally first, Docker attempts to pull `isaac-lab-base` from Docker Hub and fails with "not found".',
      },
    ],
  },
  // ── Script 11: docker/docker-compose.yaml ────────────────────────────────
  {
    id: 'docker-compose',
    filename: 'docker/docker-compose.yaml',
    title: 'docker-compose.yaml',
    cat: 'Docker',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['docker compose profiles', 'YAML anchors & merges', 'GPU device reservations', 'named volumes', 'bind mounts vs volumes'],
    summary: 'Compose file with two profile-gated services (base and ros2). Uses YAML anchors to deduplicate GPU device reservation, 13 named volumes for Isaac Sim caches, and live bind-mounts for source code. Both services run with network_mode: host. The ros2 service extends base via a YAML merge key.',
    explain: [
      'YAML anchors (&anchor) and merge keys (<<: *anchor) eliminate duplication across base and ros2 service definitions',
      'x-default-isaac-lab-volumes defines 13 named volumes for Isaac Sim kit/ov/pip/GL/compute caches and logs',
      'x-default-isaac-lab-deploy defines GPU device reservation: driver nvidia, count all, capabilities [gpu]',
      'Live bind-mounts (source/, scripts/, docs/, tools/) reflect code changes inside the container without rebuild',
      'Profile gating (profiles: [base] / profiles: [ros2]) lets `docker compose --profile ros2 up` start only the ros2 service',
      'network_mode: host shares the host network namespace — required for ROS2 DDS multicast discovery',
    ],
    code: `# YAML anchors for deduplication
x-default-isaac-lab-volumes: &default-isaac-lab-volumes
  volumes:
    - type: volume
      source: isaac-cache-kit
      target: /isaac-sim/kit/cache
    - type: volume
      source: isaac-cache-ov
      target: /root/.cache/ov
    - type: volume
      source: isaac-cache-pip
      target: /root/.cache/pip
    - type: volume
      source: isaac-logs
      target: /root/.nvidia-omniverse/logs
    - type: bind
      source: ../source
      target: /workspace/isaaclab/source
    - type: bind
      source: ../tools
      target: /workspace/isaaclab/tools

x-default-isaac-lab-deploy: &default-isaac-lab-deploy
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]

services:
  base:
    build:
      context: ../
      dockerfile: docker/Dockerfile.base
      args:
        - ISAACSIM_BASE_IMAGE_ARG=nvcr.io/nvidia/isaac-sim
        - ISAACSIM_VERSION_ARG=\${ISAACSIM_VERSION:-5.1.0}
        - ISAACLAB_PATH_ARG=/workspace/isaaclab
        - DOCKER_USER_HOME_ARG=/root
    image: isaac-lab-base:latest
    entrypoint: bash
    stdin_open: true
    tty: true
    network_mode: host
    profiles: ["base"]
    <<: *default-isaac-lab-volumes
    <<: *default-isaac-lab-deploy
    environment:
      - DISPLAY=\${DISPLAY}
      - NVIDIA_DRIVER_CAPABILITIES=all

  ros2:
    build:
      context: ../
      dockerfile: docker/Dockerfile.ros2
      args:
        - DOCKER_NAME_SUFFIX=
        - ROS2_APT_PACKAGE=ros-base
    image: isaac-lab-ros2:latest
    entrypoint: bash
    stdin_open: true
    tty: true
    network_mode: host
    profiles: ["ros2"]
    <<: *default-isaac-lab-volumes
    <<: *default-isaac-lab-deploy
    environment:
      - DISPLAY=\${DISPLAY}
      - RMW_IMPLEMENTATION=rmw_fastrtps_cpp
      - NVIDIA_DRIVER_CAPABILITIES=all

volumes:
  isaac-cache-kit:
  isaac-cache-ov:
  isaac-cache-pip:
  isaac-logs:`,
    issues: [
      {
        lines: [43],
        title: '`network_mode: host` only works on Linux — silently broken on macOS and Windows',
        severity: 'high',
        description: '`network_mode: host` uses the host\'s network namespace. On Linux this works as intended — the container sees the host\'s interfaces and can bind to host ports. On macOS and Windows, Docker runs inside a Linux VM (Docker Desktop), so "host" refers to the VM\'s network namespace, not the developer\'s laptop network. ROS2 DDS multicast packets sent from the container never reach the host, and vice versa. The container appears to start successfully — the failure only surfaces when trying to discover ROS2 nodes across the host/container boundary.',
        fix: 'Document the Linux-only constraint prominently. For macOS/Windows development, use a dedicated Docker network and configure DDS XML to use unicast discovery:\n```yaml\nnetworks:\n  ros2_net:\n    driver: bridge\n    ipam:\n      config:\n        - subnet: 172.30.0.0/24\nservices:\n  ros2:\n    networks: [ros2_net]\n    environment:\n      - FASTRTPS_DEFAULT_PROFILES_FILE=/root/.ros/fastdds.xml\n```',
      },
      {
        lines: [26, 27, 28, 29],
        title: '`driver: nvidia, count: all` GPU reservation silently passes without GPU if NVIDIA Container Toolkit is not installed',
        severity: 'medium',
        description: '`driver: nvidia, count: all` tells Docker Compose to request GPU passthrough via `nvidia-container-runtime`. If the host does not have the NVIDIA Container Toolkit installed and configured, Docker Compose ignores the `deploy.resources.reservations` block (it is advisory, not enforced). The container starts without GPU access, and the first CUDA call fails deep in the application with "CUDA driver version is insufficient" or "no CUDA-capable device is detected" — not a startup-time error.',
        fix: 'Add a pre-flight check script that callers run before `docker compose up`:\n```bash\n#!/bin/bash\nif ! docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi &>/dev/null; then\n  echo "[ERROR] NVIDIA Container Toolkit not configured."\n  echo "[INFO]  Install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/"\n  exit 1\nfi\n```\nAlternatively, add a `healthcheck` to the service that runs `nvidia-smi` and fails if GPUs are unavailable.',
      },
      {
        lines: [1, 2, 3, 23, 24],
        title: 'YAML anchors only protect services that use `<<: *anchor` — new services silently miss GPU',
        severity: 'medium',
        description: 'YAML merge keys (`<<: *default-isaac-lab-deploy`) apply the anchor\'s content at file-parse time. A developer adding a new service who forgets `<<: *default-isaac-lab-deploy` gets a service definition with no GPU reservation. Docker starts the service without GPU access (the `deploy` block is simply absent), and no error is raised at `compose up` time. The failure appears only as a CUDA init error when the service first tries to use the GPU.',
        fix: 'Use Docker Compose `extends` to enforce the base configuration at the service level rather than relying on developers remembering the merge key:\n```yaml\nx-base-service: &base-service\n  extends:\n    file: docker-compose.base.yaml\n    service: base-gpu\n```\nAlternatively, add a CI check that lints the compose file to verify all GPU-using services have the deploy block: `docker compose config | grep -c "nvidia"` should equal the number of GPU services.',
      },
    ],
    qa: [
      {
        q: 'What is a YAML anchor and merge key, and why are they used here instead of just copying the config?',
        a: 'A YAML anchor (`&name`) marks a subtree that can be reused elsewhere. A merge key (`<<: *name`) inlines all key-value pairs from the anchored subtree into the current mapping. Here, `&default-isaac-lab-deploy` anchors the GPU device reservation block, and each service uses `<<: *default-isaac-lab-deploy` to include it. This avoids repeating the 6-line GPU block for every service. The alternative — copy-pasting — creates drift: if the GPU capabilities list needs updating, it must be changed in every service. YAML anchors keep the "single source of truth" principle, but they only apply within a single file.',
      },
      {
        q: 'What is the difference between a `volume` (named volume) and a `bind` mount in the volumes list?',
        a: 'A named volume (`source: isaac-cache-kit, type: volume`) is managed by Docker — Docker creates and owns the storage in `/var/lib/docker/volumes/`. It persists across container restarts and is the right choice for data that should survive container recreation (caches, databases). A bind mount (`source: ../source, type: bind`) maps a host filesystem path directly into the container. Changes on the host are immediately visible inside the container, making it ideal for live code editing. Here, Isaac Sim caches use named volumes (avoid re-generating 20+ GB of shader caches on every restart) while source code uses bind mounts (live edit without rebuilding the image).',
      },
      {
        q: 'What does `docker compose --profile ros2 up` do differently from just `docker compose up`?',
        a: 'Compose profiles gate services so only services matching the requested profile(s) start. Without `--profile`, `docker compose up` starts only services with no `profiles:` key or with `profiles: []`. Services with `profiles: ["base"]` or `profiles: ["ros2"]` are skipped unless explicitly requested. `docker compose --profile ros2 up` starts services whose profiles list includes "ros2". This lets a single compose file define multiple deployment configurations (base image only, ROS2 stack, cloudxr variant) without maintaining separate files per configuration.',
      },
    ],
  },
  {
    id: 'isaaclab-sh',
    filename: 'isaaclab.sh',
    title: 'isaaclab.sh — Master Entrypoint',
    cat: 'Infrastructure',
    diff: 'hard',
    lang: 'bash',
    jdSkills: ['bash entrypoint design', 'Docker container lifecycle', 'SLURM job submission', 'Singularity/Apptainer', 'set -e pitfalls', 'BASH_SOURCE portability'],
    summary: 'The top-level orchestration script for the entire Isaac Lab platform. Dispatches to Docker container management (start/stop/enter/copy), Python execution inside the container, code formatting, and SLURM cluster job submission via Singularity. Every developer workflow — local, CI, and HPC — is routed through this single entrypoint.',
    explain: [
      '`SCRIPT_DIR` is resolved via `BASH_SOURCE[0]` so the script works when called from any working directory',
      'Container lifecycle (start/stop/enter/copy) wraps `docker compose` with profile selection, avoiding raw docker commands',
      '`python_run` executes inside the running container using `/isaac-sim/python.sh` — the Isaac Sim managed Python interpreter (not the system Python)',
      '`cluster_submit` converts the Docker image to a Singularity SIF via `apptainer build --sandbox --fakeroot`, then dispatches via `sbatch`',
      '`case` dispatch at the bottom is a clean command router — adding a new verb is one line without touching existing logic',
      '`set -e` is declared globally so any sub-function failure aborts the script without silent continuation',
    ],
    code: `#!/usr/bin/env bash
# isaaclab.sh — master entrypoint for Isaac Lab Docker and cluster workflows
set -e

SCRIPT_DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ISAACLAB_PATH="\${SCRIPT_DIR}"
DOCKER_DIR="\${ISAACLAB_PATH}/docker"
export ISAACLAB_PATH

ISAACLAB_ACTION="\${1:-}"
shift || true

# ── Docker helpers ────────────────────────────────────────────────────────────
container_start() {
  local profile="\${1:-base}"
  echo "[INFO] Starting Isaac Lab container (profile=\${profile})..."
  cd "\${DOCKER_DIR}" && \\
    docker compose --env-file .env.base --profile "\${profile}" up -d
}

container_stop() {
  local profile="\${1:-base}"
  cd "\${DOCKER_DIR}" && \\
    docker compose --profile "\${profile}" down
}

container_enter() {
  local container="isaac-lab-\${1:-base}"
  docker exec -it --env DISPLAY="\${DISPLAY:-}" "\${container}" bash
}

container_copy() {
  local container="isaac-lab-\${1:-base}"
  local src="\${2:?Usage: copy <profile> <src> <dst>}"
  local dst="\${3:?}"
  docker cp "\${container}:\${src}" "\${dst}"
}

# ── Python / formatting helpers ───────────────────────────────────────────────
python_run() {
  local container="\${ISAACLAB_CONTAINER:-isaac-lab-base}"
  docker exec -it "\${container}" \\
    /isaac-sim/python.sh "\$@"
}

python_format() {
  local container="\${ISAACLAB_CONTAINER:-isaac-lab-base}"
  docker exec "\${container}" \\
    /isaac-sim/python.sh -m pre_commit run --all-files
}

# ── SLURM cluster submission via Singularity ──────────────────────────────────
cluster_submit() {
  local profile="\${1:-base}"
  local job_script="\${2:?Usage: submit <profile> <job_script>}"
  local sif_path="\${DOCKER_DIR}/cluster/isaaclab_\${profile}.sif"

  echo "[INFO] Converting Docker image to Singularity SIF..."
  apptainer build --sandbox --fakeroot "\${sif_path}" \\
    "docker-daemon://isaac-lab-\${profile}:latest"

  echo "[INFO] Submitting SLURM job..."
  sbatch \\
    --export=ALL,ISAACLAB_PATH="\${ISAACLAB_PATH}",SIF_PATH="\${sif_path}" \\
    "\${job_script}"
}

# ── Main dispatch ─────────────────────────────────────────────────────────────
case "\${ISAACLAB_ACTION}" in
  start)  container_start "\$@" ;;
  stop)   container_stop "\$@" ;;
  enter)  container_enter "\$@" ;;
  copy)   container_copy "\$@" ;;
  python) python_run "\$@" ;;
  format) python_format ;;
  submit) cluster_submit "\$@" ;;
  *)
    echo "Usage: isaaclab.sh [start|stop|enter|copy|python|format|submit] [args...]"
    exit 1
    ;;
esac`,
    issues: [
      {
        lines: [3, 27],
        title: '`set -e` causes `container_enter` to exit the shell when the user exits the container normally',
        severity: 'critical',
        description: '`set -e` makes the script exit whenever any command returns a non-zero exit code. `docker exec -it ... bash` exits with the exit code of the last command the user ran inside the container. If a user types `exit 1` or any command fails before they exit, `docker exec` returns non-zero. With `set -e` active, the outer `isaaclab.sh` script then exits with an error — but there is nothing left to exit; the interactive session is already over. In CI, this is worse: if `docker exec` is used non-interactively (without `-it`) and the container command fails, `set -e` aborts the calling script before any error context is printed.',
        fix: 'Wrap interactive `docker exec` calls in a subshell or use `|| true` to suppress the exit code:\n```bash\ndocker exec -it --env DISPLAY="${DISPLAY:-}" "${container}" bash || true\n```\nFor CI non-interactive runs, remove `|| true` and let the exit code propagate — the distinction matters. For the broader `set -e` issue in bash functions, consider switching to explicit `|| { echo "error"; exit 1; }` patterns rather than relying on implicit errexit.',
      },
      {
        lines: [5],
        title: '`BASH_SOURCE[0]` breaks when the script is sourced (`. isaaclab.sh`) instead of executed',
        severity: 'high',
        description: 'When the script is invoked normally (`./isaaclab.sh` or `bash isaaclab.sh`), `BASH_SOURCE[0]` holds the script path and `SCRIPT_DIR` is resolved correctly. When the script is sourced (`. isaaclab.sh` or `source isaaclab.sh`), `BASH_SOURCE[0]` holds the path of the *sourcing* script (or an empty string in some shells), so `SCRIPT_DIR` resolves to the caller\'s directory. Any developer who sources the script to get its functions in their shell will have `ISAACLAB_PATH` pointing at the wrong directory. All subsequent Docker and Singularity operations silently reference the wrong paths.',
        fix: 'Guard with a source-detection check:\n```bash\nif [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then\n  echo "[WARN] isaaclab.sh should be executed, not sourced."\n  return 0\nfi\n```\nAlternatively, move shared functions into a separate `lib/helpers.sh` that is designed to be sourced, keeping `isaaclab.sh` purely an executable dispatcher.',
      },
      {
        lines: [17],
        title: '`--env-file .env.base` path is resolved relative to `DOCKER_DIR` only if `cd` succeeds — fragile on path errors',
        severity: 'medium',
        description: '`cd "${DOCKER_DIR}" && docker compose --env-file .env.base ...` changes directory to `DOCKER_DIR` so that relative paths in `docker-compose.yaml` (like `../source`) resolve correctly. But `.env.base` in `--env-file` is resolved relative to the *shell\'s current directory at the time the command runs* — which is `DOCKER_DIR` after the `cd`. This works as long as `cd` succeeds. If `DOCKER_DIR` does not exist (stale clone path, symlink broken), the `&&` short-circuits and the error message is only "No such file or directory" with no context about which operation failed.',
        fix: 'Validate `DOCKER_DIR` exists before entering it and use an absolute path for `--env-file`:\n```bash\n[[ -d "${DOCKER_DIR}" ]] || { echo "[ERROR] Docker dir not found: ${DOCKER_DIR}"; exit 1; }\ncd "${DOCKER_DIR}" && docker compose --env-file "${DOCKER_DIR}/.env.base" --profile "${profile}" up -d\n```',
      },
    ],
    qa: [
      {
        q: 'Why does Isaac Lab use `BASH_SOURCE[0]` and a `cd`+`pwd` pattern to find `SCRIPT_DIR` instead of just using `$0`?',
        a: '`$0` gives the name the script was called with (e.g., `./isaaclab.sh`, `bash isaaclab.sh`, or even just `isaaclab.sh` if on `$PATH`). If called with a relative path (`bash ../isaaclab.sh` from a subdirectory), `$0` is a relative path that resolves differently depending on the caller\'s cwd. The `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd` pattern works in all cases: `dirname` extracts the directory component, `cd` resolves symlinks and relative paths against the filesystem, and `pwd` prints the canonical absolute path. `BASH_SOURCE[0]` is preferred over `$0` because it holds the script\'s own path even when sourced inside another script.',
      },
      {
        q: 'Why does `cluster_submit` convert the Docker image to a Singularity SIF before SLURM submission instead of running Docker directly on the cluster?',
        a: 'SLURM compute nodes on HPC clusters almost never have Docker installed and the Docker daemon running. The Docker daemon requires root privileges to run, and multi-tenant HPC clusters do not grant users root access on compute nodes. Singularity/Apptainer was designed for HPC: it runs containers as the invoking user (no daemon, no root), supports direct mounting of NFS/GPFS filesystems, and integrates with SLURM natively via `--singularity` flags. Converting once (Docker → SIF) at submission time then using the same SIF across all SLURM array tasks avoids repeated conversion overhead. The SIF file is a single portable image that can be transferred to any cluster node via `rsync` or a shared filesystem.',
      },
      {
        q: 'What is the purpose of `/isaac-sim/python.sh` in `python_run`? Why not call `python3` directly?',
        a: 'Isaac Sim ships its own Python runtime at `/isaac-sim/python.sh` that is bundled with CUDA bindings, Omniverse Python extensions, and the exact NumPy/PyTorch versions Isaac Sim requires. Calling `python3` directly inside the container may resolve to the system Python (from the Dockerfile\'s base Ubuntu layer), which lacks these extensions. `/isaac-sim/python.sh` sets up the correct `LD_LIBRARY_PATH`, `PYTHONPATH`, and Omniverse extension paths before invoking the bundled Python interpreter. Any training script, environment registration, or test runner that imports `omni.*` or Isaac-specific packages must go through this wrapper or it will fail with import errors at runtime.',
      },
    ],
  },
  {
    id: 'composite-docker-build',
    filename: '.github/actions/docker-build/action.yml',
    title: 'Composite Action: docker-build',
    cat: 'GitHub Actions',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['composite actions vs reusable workflows', 'BuildKit GHA cache scoping', 'multi-arch builds', 'QEMU binfmt', 'image digest tracking', 'action input/output interface'],
    summary: 'A reusable composite action that encapsulates the full Docker build pipeline: QEMU registration for multi-arch, Buildx setup, BuildKit GHA cache (scope per image name), build-push with optional registry push, and digest export to the Job Summary. Called by matrix jobs in build.yml to avoid repeating the 30-line build block per workflow.',
    explain: [
      'Composite actions (`using: composite`) run steps in the calling job\'s runner — no separate VM spin-up overhead unlike reusable workflows',
      'QEMU `setup-qemu-action` registers binfmt_misc handlers so the host kernel transparently emulates the target CPU for cross-platform builds',
      '`cache-from / cache-to` with `scope=${{ inputs.image-name }}` gives each image its own GHA cache bucket — prevents base image cache from being evicted by ros2 image build',
      '`push: ${{ inputs.push }}` lets callers build-and-verify without pushing (pull_request) then build-and-push (push to main) with the same action, no duplication',
      '`outputs.image-digest` surfaces the SHA256 digest so downstream jobs can reference the immutable image rather than a mutable tag',
      'The Job Summary step documents every build in the workflow run\'s summary tab — reduces need for separate Slack notifications',
    ],
    code: `# .github/actions/docker-build/action.yml
name: Build Isaac Lab Docker Image
description: Build + optionally push an Isaac Lab image with BuildKit GHA cache

inputs:
  image-name:
    description: Full image name with registry (e.g. nvcr.io/nvidia/isaac-lab/base)
    required: true
  dockerfile:
    description: Path to Dockerfile relative to repo root
    required: true
    default: docker/Dockerfile.base
  build-args:
    description: Newline-delimited ARG=VALUE pairs
    required: false
    default: ""
  push:
    description: Push to registry after build
    required: false
    default: "false"
  platforms:
    description: Comma-separated target platforms
    required: false
    default: linux/amd64

outputs:
  image-digest:
    description: SHA256 digest of the built image
    value: \${{ steps.build.outputs.digest }}

runs:
  using: composite
  steps:
    - name: Set up QEMU for multi-arch
      uses: docker/setup-qemu-action@v3
      with:
        platforms: \${{ inputs.platforms }}

    - name: Set up Docker Buildx
      id: buildx
      uses: docker/setup-buildx-action@v3

    - name: Build (and optionally push) image
      id: build
      uses: docker/build-push-action@v5
      with:
        context: .
        file: \${{ inputs.dockerfile }}
        build-args: \${{ inputs.build-args }}
        platforms: \${{ inputs.platforms }}
        push: \${{ inputs.push }}
        tags: \${{ inputs.image-name }}:\${{ github.sha }}
        cache-from: type=gha,scope=\${{ inputs.image-name }}
        cache-to: type=gha,scope=\${{ inputs.image-name }},mode=min

    - name: Export digest to Job Summary
      shell: bash
      run: |
        echo "### Docker Build" >> \$GITHUB_STEP_SUMMARY
        echo "| Key | Value |" >> \$GITHUB_STEP_SUMMARY
        echo "|-----|-------|" >> \$GITHUB_STEP_SUMMARY
        echo "| Image | \\\`\${{ inputs.image-name }}\\\` |" >> \$GITHUB_STEP_SUMMARY
        echo "| Platforms | \\\`\${{ inputs.platforms }}\\\` |" >> \$GITHUB_STEP_SUMMARY
        echo "| Digest | \\\`\${{ steps.build.outputs.digest }}\\\` |" >> \$GITHUB_STEP_SUMMARY`,
    issues: [
      {
        lines: [43, 44],
        title: '`cache-to mode=min` only caches the final image layer — intermediate build stage caches are evicted',
        severity: 'high',
        description: '`mode=min` exports only the layers of the final image to the GHA cache. In a multi-stage Dockerfile (FROM ... AS base → FROM base AS ros2), the intermediate `base` stage layers are not cached. On the next run, BuildKit re-executes every `RUN` instruction in the `base` stage because the cache entry is absent — even if neither the Dockerfile nor any inputs changed. For Isaac Lab\'s Dockerfile.base (which apt-installs ~300 packages), this is a 15-20 minute cache miss on every run. `mode=max` exports all stage layers but consumes the full 10 GB GHA cache limit quickly on a multi-image matrix.',
        fix: 'Use `mode=max` for the base Dockerfile (infrequently changed, high rebuild cost) and `mode=min` for extension images (frequently changed, low rebuild cost from base):\n```yaml\n# For Dockerfile.base calls:\ncache-to: type=gha,scope=base,mode=max\n# For Dockerfile.ros2 / extension calls:\ncache-to: type=gha,scope=ros2-${{ github.ref_name }},mode=min\n```\nAlternatively, push base images to a registry (GHCR) as a persistent cache layer that is not subject to the 10 GB GHA cache eviction policy.',
      },
      {
        lines: [41],
        title: '`github.sha` as the sole tag means the previous image is unreachable the moment the next commit is pushed',
        severity: 'high',
        description: 'Tagging only with `github.sha` creates a new immutable tag per commit but does not update any mutable reference. Any workflow that references `image-name:latest` or `image-name:main` will not find an image built by this action because those tags are never written. Downstream jobs that consume the image by name (rather than by digest from `outputs.image-digest`) must know the exact SHA to pull — which makes the action hard to use outside the triggering workflow. If `push: false`, the image only exists in the local Buildx cache (ephemeral to the runner) and the `image-name:github.sha` tag is never written anywhere externally.',
        fix: 'Add mutable branch and `latest` tags using Docker metadata-action:\n```yaml\n- name: Docker meta\n  id: meta\n  uses: docker/metadata-action@v5\n  with:\n    images: ${{ inputs.image-name }}\n    tags: |\n      type=sha,prefix=\n      type=ref,event=branch\n      type=raw,value=latest,enable=${{ github.ref == \'refs/heads/main\' }}\n- name: Build and push\n  uses: docker/build-push-action@v5\n  with:\n    tags: ${{ steps.meta.outputs.tags }}\n```',
      },
      {
        lines: [31, 32, 33],
        title: 'QEMU `setup-qemu-action` silently succeeds on runners where `/proc/sys/fs/binfmt_misc` is not writable',
        severity: 'medium',
        description: 'QEMU cross-compilation works by registering binfmt_misc handlers in the kernel: when the kernel sees an ELF binary for an unknown architecture, it routes execution through the registered QEMU userspace emulator. `setup-qemu-action` registers these handlers by writing to `/proc/sys/fs/binfmt_misc`. On self-hosted runners running inside containers (common for GPU runners), `/proc/sys/fs/binfmt_misc` may be a read-only mount from the host. The action completes without error (the write silently fails), but when BuildKit attempts to run `arm64` binaries during the cross-compilation stage, it gets "exec format error" — which surfaces as a cryptic build failure 10-15 minutes into the job.',
        fix: 'Add a pre-flight check step before the QEMU action on self-hosted runners:\n```yaml\n- name: Verify binfmt_misc is writable\n  shell: bash\n  run: |\n    if ! mountpoint -q /proc/sys/fs/binfmt_misc; then\n      echo "[ERROR] binfmt_misc not mounted — QEMU cross-build will fail"\n      exit 1\n    fi\n    if [[ ! -w /proc/sys/fs/binfmt_misc ]]; then\n      echo "[ERROR] binfmt_misc is read-only — run host-level: docker run --privileged"\n      exit 1\n    fi\n```',
      },
    ],
    qa: [
      {
        q: 'What is the difference between a composite action and a reusable workflow in GitHub Actions? When would you choose each?',
        a: 'A composite action (`using: composite` in `action.yml`) runs steps directly in the calling job\'s runner — no new VM is provisioned, secrets from the calling job are inherited automatically, and the overhead is just step execution time. A reusable workflow (`workflow_call` trigger in a `.github/workflows/*.yml` file) spins up its own job runner (new VM), has its own permissions boundary, and must have secrets explicitly passed with `secrets: inherit`. Choose composite actions for shared build steps that should run inline (docker build, setup, cache) — they are faster and simpler. Choose reusable workflows when you need job-level isolation (separate permissions, different runner labels, parallelism across the called jobs) or when the shared unit is an entire job rather than a set of steps.',
      },
      {
        q: 'Why scope the GHA cache to `inputs.image-name` rather than using a single shared cache for all images?',
        a: 'GHA cache uses a key + restore-key lookup. A single shared cache would be shared by all concurrent matrix jobs building different images (base, ros2, curobo). BuildKit layers from the `ros2` build would overwrite base layers in the same cache bucket, and vice versa. On the next run, the cache miss for base would be extremely high because `ros2` layers dominated the 10 GB budget. Scoping to the image name (`scope=nvcr.io/.../base`) gives each image its own isolated cache bucket. The 10 GB limit applies per-repository, not per-scope, but the eviction policy evicts the least-recently-used key — so frequently-changing extension images evict only their own cache, not the stable base image cache.',
      },
      {
        q: 'A calling workflow has `push: ${{ github.event_name == \'push\' }}`. Walk me through what happens on a pull_request event vs a push to main.',
        a: 'On a `pull_request` event, `github.event_name` is "pull_request", so the expression evaluates to `false` (string "false" in YAML context). `docker/build-push-action` builds the image and populates the BuildKit GHA cache but does not push to the registry. The action still emits `outputs.image-digest` (from the local build manifest), and the Job Summary is written. This validates the Dockerfile builds correctly without polluting the registry with PR images. On a `push` to main, `github.event_name` is "push", the expression evaluates to `true`, and `build-push-action` pushes to the registry with the `github.sha` tag. If `metadata-action` is also wired in, the `:latest` and `:main` mutable tags are updated in the same push step.',
      },
    ],
  },
  {
    id: 'submit-job',
    filename: 'docker/cluster/submit_job.sh',
    title: 'SLURM Training Job',
    cat: 'Infrastructure',
    diff: 'hard',
    lang: 'bash',
    jdSkills: ['SLURM batch scheduling', '#SBATCH directives', 'GPU gres allocation', 'Singularity --nv passthrough', 'HPC module system', 'srun vs sbatch distinction'],
    summary: 'SLURM batch script that launches an Isaac Lab training run inside a Singularity container on an HPC cluster. Validates the SIF image exists, loads CUDA and Singularity modules, then calls srun apptainer exec --nv to pass GPU devices through and bind-mount the live repo into the container.',
    explain: [
      '#SBATCH directives are parsed by sbatch at submission time — they are comments to bash but scheduler configuration to SLURM; changing them after submission has no effect',
      '`srun` inside a batch script creates a tracked SLURM task step — enables proper GPU resource accounting and per-step time limits that a bare exec cannot provide',
      '`--nv` mounts the host NVIDIA userspace driver libraries into the container at runtime; the SIF only needs CUDA headers, not the driver itself',
      '`--bind "${ISAACLAB_ROOT}:/workspace/isaaclab"` mounts the live repo into the container — code changes are visible without rebuilding the SIF image',
      '`JOB_SCRIPT` is injected from the sbatch --export flag in isaaclab.sh — makes the same batch file reusable for any training script without editing',
      '`set -euo pipefail` aborts on module load failures, missing SIF, or apptainer errors — prevents silent partial initialization',
    ],
    code: `#!/usr/bin/env bash
#SBATCH --job-name=isaaclab-train
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --gres=gpu:4
#SBATCH --time=12:00:00
#SBATCH --partition=gpu
#SBATCH --output=logs/isaaclab_%j.out
#SBATCH --error=logs/isaaclab_%j.err

set -euo pipefail

SCRIPT_DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
ISAACLAB_ROOT="\${ISAACLAB_ROOT:-\$( realpath "\${SCRIPT_DIR}/../.." )}"
SIF_PATH="\${SIF_PATH:-\${SCRIPT_DIR}/isaaclab_base.sif}"
JOB_SCRIPT="\${JOB_SCRIPT:?JOB_SCRIPT env var must be set}"

if [[ ! -f "\${SIF_PATH}" ]]; then
  echo "[ERROR] SIF not found: \${SIF_PATH}"
  echo "        Run: ./isaaclab.sh submit base docker/cluster/submit_job.sh"
  exit 1
fi

module load cuda/12.1
module load singularity/3.11

srun apptainer exec \\
  --nv \\
  --bind "\${ISAACLAB_ROOT}:/workspace/isaaclab" \\
  --bind /tmp:/tmp \\
  --env PYTHONPATH=/workspace/isaaclab \\
  --env CUDA_VISIBLE_DEVICES="\${CUDA_VISIBLE_DEVICES:-0,1,2,3}" \\
  "\${SIF_PATH}" \\
  /isaac-sim/python.sh "/workspace/isaaclab/\${JOB_SCRIPT}" \\
    --headless \\
    --enable_cameras \\
    --num_envs 4096

echo "[DONE] SLURM job \${SLURM_JOB_ID} complete."`,
    issues: [
      {
        lines: [25, 26],
        title: '`module load` with `set -euo pipefail` aborts on sites where the exact module name differs',
        severity: 'high',
        description: '`set -euo pipefail` causes the script to abort immediately on any non-zero return. `module load cuda/12.1` is site-specific: some clusters use `cuda/12.1.0`, others `cuda/12.1.1-gcc-12.3.0`, and some Lmod hierarchical setups require loading a compiler module first. On an incompatible cluster the job exits with "Unable to locate a modulefile for cuda/12.1" — with no GPU initialization, no cleanup, and a cryptic SLURM log that doesn\'t identify which module failed.',
        fix: 'Guard module loads with diagnostics:\n```bash\nif command -v module &>/dev/null; then\n  module load cuda/12.1 2>/dev/null || \\\n    { echo "[ERROR] cuda/12.1 unavailable. Run: module avail cuda"; exit 1; }\n  module load singularity/3.11 2>/dev/null || \\\n    module load apptainer/1.2 2>/dev/null || true\nelse\n  echo "[WARN] module not found — assuming CUDA in PATH"\nfi\n```',
      },
      {
        lines: [33],
        title: '`CUDA_VISIBLE_DEVICES` override inside the container conflicts with SLURM\'s GPU allocation',
        severity: 'medium',
        description: 'SLURM\'s NVIDIA GPU plugin sets `CUDA_VISIBLE_DEVICES` on the host before launching the job, exposing only the GPUs allocated to this job (e.g. `CUDA_VISIBLE_DEVICES=2,3` for a 2-GPU request). `apptainer exec` inherits host environment by default, so the SLURM assignment reaches the container. The `--env CUDA_VISIBLE_DEVICES="0,1,2,3"` override replaces it with a hardcoded 4-GPU list. If fewer GPUs were allocated, CUDA fails to initialize devices 2 and 3. If more GPUs are allocated on a shared node, the container may consume GPUs belonging to another job.',
        fix: 'Remove the override and derive parallelism from SLURM variables:\n```bash\nsrun apptainer exec \\\n  --nv \\\n  --bind "${ISAACLAB_ROOT}:/workspace/isaaclab" \\\n  "${SIF_PATH}" \\\n  /isaac-sim/python.sh "/workspace/isaaclab/${JOB_SCRIPT}" \\\n    --headless \\\n    --num_envs "$((SLURM_GPUS_ON_NODE * 1024))"\n```',
      },
      {
        lines: [10, 11],
        title: '`--output` relative path resolves against the `sbatch` invocation directory, not the script location',
        severity: 'medium',
        description: 'SLURM resolves relative paths in `#SBATCH --output` against the working directory at the time `sbatch` is called. Running `sbatch docker/cluster/submit_job.sh` from the repo root creates `./logs/isaaclab_12345.out` in the root. Running it from `docker/cluster/` creates it there. If `logs/` does not exist in the invocation directory, SLURM silently fails to open the output file and the job exits immediately with no user code running.',
        fix: 'Create the log directory in isaaclab.sh before calling sbatch, then pass an absolute path:\n```bash\nmkdir -p "${ISAACLAB_ROOT}/logs"\nsbatch \\\n  --output="${ISAACLAB_ROOT}/logs/isaaclab_%j.out" \\\n  --error="${ISAACLAB_ROOT}/logs/isaaclab_%j.err" \\\n  --export=ALL,ISAACLAB_PATH="${ISAACLAB_PATH}",SIF_PATH="${sif_path}" \\\n  "${job_script}"\n```',
      },
    ],
    qa: [
      {
        q: 'What is the difference between `sbatch` and `srun`? Why use `srun` inside a batch script?',
        a: '`sbatch` submits a job script to the SLURM scheduler queue and returns immediately with a job ID — the script runs later when resources are available. `srun` launches a job step synchronously within an existing allocation. Inside a batch script, the node allocation already exists from `sbatch`. Using `srun` creates a tracked task step: SLURM records resource usage, enforces per-step time limits, and enables multi-node distribution with `--ntasks > 1`. A bare `apptainer exec` without `srun` runs as an untracked process — GPU accounting is incomplete and multi-node MPI distribution does not work.',
      },
      {
        q: 'What does `apptainer exec --nv` do, and what happens on a node with no GPU?',
        a: '`--nv` mounts the host\'s NVIDIA userspace driver libraries into the container at runtime: `libcuda.so`, `libnvidia-ml.so`, `/dev/nvidia*` device files, and `/usr/bin/nvidia-smi`. The container image does not bundle the driver — only the CUDA toolkit headers and static libs. This means the same SIF works across driver versions (450.x, 525.x) as long as the toolkit version does not exceed what the host driver supports. On a node with no GPU, `--nv` still runs but CUDA initialization fails with `CUDA_ERROR_NO_DEVICE` when the first CUDA API call is made. The flag itself does not fail.',
      },
      {
        q: 'How does `JOB_SCRIPT` get set inside the batch script without being hardcoded?',
        a: '`sbatch --export=ALL,JOB_SCRIPT=scripts/train_rl.py docker/cluster/submit_job.sh` passes the variable into the job. `--export=ALL` forwards all current shell variables; `,JOB_SCRIPT=...` adds or overrides that specific one. Inside the batch script, `JOB_SCRIPT="${JOB_SCRIPT:?JOB_SCRIPT env var must be set}"` reads it — the `:?` operator aborts with the error message if the variable is unset or empty. The `cluster_submit()` function in `isaaclab.sh` calls sbatch with `--export=ALL,ISAACLAB_PATH=...,SIF_PATH=...`, so the caller controls which training script runs without editing the batch file.',
      },
    ],
  },
  {
    id: 'run-all-tests',
    filename: 'tools/run_all_tests.py',
    title: 'Run All Tests',
    cat: 'Python Automation',
    diff: 'hard',
    lang: 'python',
    jdSkills: ['pytest discovery', 'JUnit XML for CI dashboards', 'subprocess orchestration', 'Isaac Sim Python interpreter', 'per-suite isolation', 'failfast behavior'],
    summary: 'Discovers and runs every pytest suite under source/**/tests/, writing per-suite JUnit XML reports for CI dashboards. Calls the Isaac Sim bundled Python interpreter (/isaac-sim/python.sh) so test code can import omni.* and Isaac-specific packages. Supports extension filtering, per-test timeout, and failfast.',
    explain: [
      '`discover_test_dirs` globs `source/**/tests/` recursively — each Isaac Lab extension owns its own tests/ directory under its source tree',
      '`run_suite` invokes pytest via subprocess rather than the pytest Python API to ensure each suite runs in an isolated process with no state leakage across extension test runners',
      '`--junit-xml` writes structured XML that CI systems parse to display per-test pass/fail, timing, and failure messages in dashboards',
      '`--timeout` per-test prevents a single hung simulation environment from blocking the entire suite indefinitely',
      '`--failfast` stops after the first failing suite — useful in pre-merge where any failure should block the pipeline without running all remaining suites',
      'Sequential per-suite execution preserves log ordering; parallel execution would interleave stdout from multiple Isaac Sim initializations on the same GPU',
    ],
    code: `#!/usr/bin/env python3
"""tools/run_all_tests.py
Discover and run all pytest suites in the IsaacLab source tree.
Writes per-suite JUnit XML reports and prints a pass/fail summary.
"""
import argparse
import subprocess
import sys
import glob
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
PYTHON = "/isaac-sim/python.sh"

def discover_test_dirs(ext_filter=None):
    """Glob source/**/tests/ — returns dirs with at least one test_*.py file."""
    pattern = str(REPO_ROOT / "source" / "**" / "tests")
    dirs = [Path(d) for d in glob.glob(pattern, recursive=True) if Path(d).is_dir()]
    if ext_filter:
        dirs = [d for d in dirs if ext_filter in str(d)]
    return sorted(dirs)

def run_suite(test_dir, args):
    """Run pytest for one directory. Returns (exit_code, suite_name)."""
    suite_name = test_dir.parent.name
    xml_path = REPO_ROOT / "test-results" / f"{suite_name}.xml"
    xml_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        PYTHON, "-m", "pytest", str(test_dir),
        f"--timeout={args.timeout}",
        "--tb=short", "--no-header",
        f"--junit-xml={xml_path}",
    ]
    if args.headless:
        cmd.append("--headless")

    result = subprocess.run(cmd, cwd=REPO_ROOT)
    return result.returncode, suite_name

def main():
    parser = argparse.ArgumentParser(description="Run all IsaacLab test suites")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--ext", default=None, help="Filter by extension name substring")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--failfast", action="store_true")
    args = parser.parse_args()

    test_dirs = discover_test_dirs(args.ext)
    if not test_dirs:
        print(f"[WARN] No test suites found under {REPO_ROOT}/source/")
        sys.exit(0)

    print(f"[INFO] {len(test_dirs)} suite(s) discovered")
    failures = []

    for td in test_dirs:
        print(f"\\n── {td.relative_to(REPO_ROOT)} ──")
        rc, name = run_suite(td, args)
        if rc != 0:
            failures.append(name)
            if args.failfast:
                break

    if failures:
        print(f"\\n[FAIL] {len(failures)} suite(s): {', '.join(failures)}")
        sys.exit(1)
    print(f"\\n[PASS] All {len(test_dirs)} suite(s) passed.")

if __name__ == "__main__":
    main()`,
    issues: [
      {
        lines: [24],
        title: '`test_dir.parent.name` as JUnit XML filename silently overwrites reports when two extensions share the same parent directory name',
        severity: 'high',
        description: '`suite_name = test_dir.parent.name` uses the direct parent of the `tests/` folder (typically the extension name). If two packages both have a `tests/` under a directory named `envs/` — plausible in a monorepo structure — both write to `test-results/envs.xml`. The second write silently overwrites the first. CI tooling then parses only one suite\'s results; the other extension\'s test failures disappear from the dashboard with no error.',
        fix: 'Use a path relative to REPO_ROOT as the suite identifier to guarantee uniqueness:\n```python\nrel = test_dir.relative_to(REPO_ROOT)\nsuite_name = str(rel).replace("/", "_")\nxml_path = REPO_ROOT / "test-results" / f"{suite_name}.xml"\n```\nThis turns `source/isaaclab_tasks/envs/tests` into `source_isaaclab_tasks_envs_tests.xml` — unique across the entire tree.',
      },
      {
        lines: [35],
        title: '`subprocess.run` without `capture_output` interleaves stdout from all suites — CI logs become unattributable',
        severity: 'medium',
        description: 'Each `subprocess.run(cmd, cwd=REPO_ROOT)` call inherits the parent process\'s stdout/stderr. pytest output is written directly to the terminal with no buffering or labeling. When two suites produce output at overlapping times (or even sequentially without clear separators), lines interleave with no indication of which suite produced each line, making it hard to correlate failure messages with their originating suite in CI log viewers.',
        fix: 'Capture output and prefix each line with the suite name:\n```python\nresult = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)\nfor line in result.stdout.splitlines():\n    print(f"[{suite_name}] {line}")\nif result.returncode != 0:\n    for line in result.stderr.splitlines():\n        print(f"[{suite_name}][ERR] {line}", file=sys.stderr)\n```',
      },
      {
        lines: [16],
        title: '`glob.glob("**/tests", recursive=True)` also matches zero-depth — picks up `source/tests/` as an extension test dir',
        severity: 'medium',
        description: 'With `recursive=True`, `**` expands to zero or more path components. `source/**/tests` matches both `source/tests/` (zero intermediate components) and `source/any/depth/tests/`. If the repo has a top-level `source/tests/` for integration tests AND extension-level `source/ext/tests/`, both are returned. The top-level suite may run with incorrect assumptions about the cwd or import paths, producing confusing failures that look like extension test failures.',
        fix: 'Require at least one intermediate directory using pathlib.rglob with a depth guard:\n```python\ndef discover_test_dirs(ext_filter=None):\n    root = REPO_ROOT / "source"\n    dirs = [d for d in root.rglob("tests") if d.is_dir() and d.parent != root]\n    if ext_filter:\n        dirs = [d for d in dirs if ext_filter in str(d)]\n    return sorted(dirs)\n```',
      },
    ],
    qa: [
      {
        q: 'Why does this script call `/isaac-sim/python.sh` instead of the system `python3`?',
        a: 'Isaac Sim ships its own Python runtime bundled with CUDA bindings, Omniverse USD Python extensions, and exact NumPy/PyTorch versions it requires. `/isaac-sim/python.sh` sets up `LD_LIBRARY_PATH` to include Isaac Sim\'s CUDA libraries, `PYTHONPATH` to include its extension packages, then invokes the bundled Python interpreter (typically at `/isaac-sim/kit/python/bin/python3`). Any test that imports `omni.isaac.*`, `omni.kit.*`, or uses the Isaac Sim physics engine must run through this wrapper. Calling the system `python3` causes `ModuleNotFoundError: No module named \'omni\'` because the system interpreter does not have those paths configured.',
      },
      {
        q: 'What is `--junit-xml` for, and why does CI need it instead of just reading the console output?',
        a: 'JUnit XML is a structured machine-readable format that CI systems parse to display test results as structured reports: pass/fail per test case, execution time, failure messages, and stack traces. Console output is free-form text that CI can display but cannot parse to extract per-test metadata. With JUnit XML, GitHub Actions (via test-reporter action), Jenkins, and most CI dashboards show a table of all test cases with status and duration — enabling drill-down without reading raw logs. It also enables trend tracking: "this test has been flaky for 3 days" requires structured per-test data across runs.',
      },
      {
        q: 'Why run suites sequentially rather than in parallel with multiprocessing or pytest-xdist?',
        a: 'Isaac Sim\'s physics engine and Omniverse runtime are not designed for concurrent multi-process execution on the same GPU. Two parallel pytest processes running Isaac Lab environments would conflict over CUDA context management and Omniverse asset loading, producing non-deterministic failures. pytest-xdist parallelizes using separate worker processes — each would independently try to initialize the Isaac Sim runtime, and multiple simultaneous initializations on one GPU typically deadlock or corrupt shared GPU memory. Sequential execution ensures one simulation context is fully initialized and torn down before the next begins.',
      },
    ],
  },
  {
    id: 'pre-commit-workflow',
    filename: '.github/workflows/pre-commit.yml',
    title: 'Pre-commit CI Workflow',
    cat: 'GitHub Actions',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['pre-commit hooks', 'changed-file diff checking', 'mypy type checking', 'workflow concurrency groups', 'cache key invalidation', 'JSON schema validation'],
    summary: 'Pre-merge validation workflow that runs pre-commit hooks on changed files, mypy type-checking on the isaaclab package, and JSON schema validation on all workflow YAML files. Triggers on pull_request and push to main with cancel-in-progress concurrency to avoid queuing stale runs.',
    explain: [
      '`cancel-in-progress: true` cancels any in-flight pre-commit run for the same branch when a new commit is pushed — avoids wasting runners on stale commits',
      '`pre-commit run --from-ref ... --to-ref ...` checks only files changed in the PR diff, not the entire codebase — O(changed files) not O(all files)',
      '`hashFiles(\'.pre-commit-config.yaml\')` in the cache key invalidates the pre-commit virtualenv cache when hooks are added or updated',
      '`actions/setup-python@v5` with `cache: pip` caches pip downloads — reduces mypy and check-jsonschema install time by ~30 seconds per run',
      '`check-jsonschema` validates each workflow YAML against the official GitHub Actions JSON schema — catches invalid action versions and typos in `on:` event names before merge',
      'Pinning `pre-commit==3.7.1` prevents unexpected hook behavior changes from upstream releases mid-sprint',
    ],
    code: `# .github/workflows/pre-commit.yml
name: Pre-commit Checks
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: pre-commit-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  pre-commit:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"
          cache: pip

      - name: Install pre-commit
        run: pip install pre-commit==3.7.1

      - name: Cache pre-commit envs
        uses: actions/cache@v4
        with:
          path: ~/.cache/pre-commit
          key: pre-commit-\${{ hashFiles('.pre-commit-config.yaml') }}

      - name: Run pre-commit on changed files
        run: |
          pre-commit run \\
            --from-ref \${{ github.event.pull_request.base.sha }} \\
            --to-ref \${{ github.sha }}

      - name: Type-check with mypy
        run: |
          pip install mypy==1.10.0 types-PyYAML
          mypy source/isaaclab --ignore-missing-imports

      - name: Validate workflow YAML schemas
        run: |
          pip install check-jsonschema
          find .github/workflows -name "*.yml" | \\
            xargs check-jsonschema \\
              --schemafile https://json.schemastore.org/github-workflow`,
    issues: [
      {
        lines: [34, 35, 36],
        title: '`github.event.pull_request.base.sha` is empty on `push` events — pre-commit silently checks nothing',
        severity: 'critical',
        description: '`github.event.pull_request.base.sha` is only populated on `pull_request` events. On a `push` to main (the other trigger in this workflow), the expression evaluates to an empty string. `pre-commit run --from-ref "" --to-ref abc123` is treated by many pre-commit versions as "zero changed files" — effectively a no-op. The step exits 0 and the push appears validated, but no hooks actually ran. Any formatting violation or linting error introduced directly to main via a squash-merge bypasses the check entirely.',
        fix: 'Branch the invocation based on event type:\n```yaml\n- name: Run pre-commit\n  run: |\n    if [[ "${{ github.event_name }}" == "pull_request" ]]; then\n      pre-commit run \\\n        --from-ref "${{ github.event.pull_request.base.sha }}" \\\n        --to-ref "${{ github.sha }}"\n    else\n      pre-commit run --all-files\n    fi\n```',
      },
      {
        lines: [29, 30],
        title: '`hashFiles(\'.pre-commit-config.yaml\')` cache key does not include the Python version — upgrading Python reuses stale hook virtualenvs',
        severity: 'high',
        description: 'Pre-commit creates virtualenvs for each hook in `~/.cache/pre-commit/`. These virtualenvs are tied to the Python version that created them. If `python-version` changes from `"3.10"` to `"3.11"`, the cache key does not change (it only hashes the config file), so old `3.10` virtualenvs are restored. Pre-commit then tries to run hooks with the new Python against the old virtualenv — some hooks work, others silently use the wrong interpreter, and mypy\'s typing stubs may be mismatched.',
        fix: 'Include the Python version in the cache key:\n```yaml\nkey: pre-commit-${{ matrix.python-version }}-${{ hashFiles(\'.pre-commit-config.yaml\') }}\n```\nOr use the official `pre-commit/action` which handles cache keying — including OS and Python version — correctly.',
      },
      {
        lines: [40, 41, 42],
        title: '`find ... | xargs check-jsonschema` exits 0 when `find` returns no files — silently skips validation',
        severity: 'medium',
        description: '`find .github/workflows -name "*.yml"` returns zero lines if the directory is empty or does not exist. `xargs` with empty stdin runs the command with no positional arguments — `check-jsonschema --schemafile https://...` with no files to validate exits 0. The step always succeeds regardless of whether any workflow files exist or are valid. A developer who accidentally deletes the workflows directory would not be caught.',
        fix: 'Collect files into an array and error if empty:\n```yaml\nrun: |\n  pip install check-jsonschema\n  mapfile -t files < <(find .github/workflows -name "*.yml")\n  [[ ${#files[@]} -gt 0 ]] || { echo "[ERROR] No workflow YAMLs found"; exit 1; }\n  check-jsonschema --schemafile https://json.schemastore.org/github-workflow "${files[@]}"\n```',
      },
    ],
    qa: [
      {
        q: 'What is the difference between `pre-commit run --from-ref ... --to-ref ...` and `pre-commit run --all-files`?',
        a: '`--from-ref / --to-ref` runs hooks only on files that changed between two git commits — the diff. `--all-files` runs hooks on every tracked file in the repository. In a PR workflow, `--from-ref / --to-ref` is preferred: it\'s faster (only changed files are checked) and it doesn\'t fail PRs for pre-existing violations in unrelated files. In a `push` to main or a release branch, `--all-files` is safer: it catches violations introduced by squash-merges or direct pushes that bypass the PR check. The risk with `--all-files` on large repos is runtime — checking 10,000 files through ruff and mypy can take 10-15 minutes.',
      },
      {
        q: 'Why pin `pre-commit==3.7.1` instead of using the latest version?',
        a: 'Pre-commit minor and patch releases occasionally change hook behavior, update virtualenv creation logic, or change how `.pre-commit-config.yaml` is parsed. An unpinned `pre-commit` picks up the latest version on every cache miss. If a new release enables a new ruff rule by default, PRs that were green yesterday start failing today with no code change. Pinning to `3.7.1` ensures consistent behavior until the team explicitly decides to upgrade. The trade-off: security patches in pre-commit itself are not automatically applied.',
      },
      {
        q: 'What does `concurrency: cancel-in-progress: true` do and when would you set it to `false`?',
        a: '`cancel-in-progress: true` cancels any currently running workflow for the same concurrency group key when a new run starts. The group key `pre-commit-${{ github.ref }}` means per-branch: if a developer pushes two commits quickly, the first pre-commit run is cancelled and only the latest is validated. This is correct for lint checks (only the final state matters) and saves runner minutes. Set `cancel-in-progress: false` when the workflow has side effects that must not be interrupted: a job that commits to the repo, updates a changelog, or publishes to PyPI should never be cancelled mid-run — partial execution leaves inconsistent state.',
      },
    ],
  },
  {
    id: 'release-workflow',
    filename: '.github/workflows/release.yml',
    title: 'Release Pipeline',
    cat: 'Release Engineering',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['workflow_dispatch inputs', 'towncrier changelog', 'OIDC Trusted Publishing', 'annotated git tags', 'release job fan-out', 'dry-run pipeline gating'],
    summary: 'Full release pipeline triggered manually via workflow_dispatch. Validates the version tag does not already exist, builds the changelog with towncrier, commits and tags on main, then fans out to PyPI publish (OIDC Trusted Publishing) and GitHub Release creation in parallel. Supports a dry-run mode that exercises every step except the actual push and publish.',
    explain: [
      '`workflow_dispatch` with `inputs.dry-run` makes this a one-click release with a safety toggle — dry-run exercises every step except push, publish, and release creation',
      '`validate` checks the tag does not exist before any mutation — prevents the pipeline from partially executing when re-run for the same version',
      '`towncrier build --yes` aggregates all fragment files in `changelog.d/` into `CHANGELOG.rst` and deletes the fragments — `--yes` skips the interactive confirmation prompt',
      'OIDC Trusted Publishing (`id-token: write` + `pypa/gh-action-pypi-publish`) eliminates long-lived PyPI API tokens — GitHub mints a short-lived OIDC token PyPI verifies directly',
      '`needs: changelog` in both `publish` and `github-release` creates a fan-out: both jobs run in parallel after changelog completes, reducing total release time',
      '`--follow-tags` in `git push` pushes both the commit and the annotated tag in one atomic operation',
    ],
    code: `# .github/workflows/release.yml
name: Release Pipeline
on:
  workflow_dispatch:
    inputs:
      version:
        description: Version to release (e.g. 1.3.0)
        required: true
      dry-run:
        description: Skip push and publish steps
        type: boolean
        default: false

jobs:
  validate:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Ensure tag does not already exist
        run: |
          if git rev-parse "v\${{ inputs.version }}" &>/dev/null; then
            echo "[ERROR] Tag v\${{ inputs.version }} already exists."
            exit 1
          fi

  changelog:
    needs: validate
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: \${{ secrets.RELEASE_BOT_TOKEN }}
      - name: Set Git identity
        run: |
          git config user.name "isaac-lab-bot"
          git config user.email "bot@nvidia.com"
      - name: Build changelog with towncrier
        run: |
          pip install towncrier
          towncrier build --version \${{ inputs.version }} --yes
      - name: Commit changelog and push tag
        if: \${{ !inputs.dry-run }}
        run: |
          git add CHANGELOG.rst
          git commit -m "Release v\${{ inputs.version }}"
          git tag -a "v\${{ inputs.version }}" -m "Release v\${{ inputs.version }}"
          git push origin main --follow-tags

  publish:
    needs: changelog
    runs-on: ubuntu-22.04
    environment: pypi
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: v\${{ inputs.version }}
      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"
      - run: pip install build && python -m build
      - name: Publish to PyPI via OIDC
        if: \${{ !inputs.dry-run }}
        uses: pypa/gh-action-pypi-publish@release/v1

  github-release:
    needs: changelog
    runs-on: ubuntu-22.04
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: v\${{ inputs.version }}
      - name: Create GitHub Release
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          gh release create "v\${{ inputs.version }}" \\
            --title "Isaac Lab v\${{ inputs.version }}" \\
            --notes-from-tag`,
    issues: [
      {
        lines: [38, 39],
        title: '`towncrier build --yes` deletes fragment files before `git commit` — a push failure permanently loses them',
        severity: 'critical',
        description: '`towncrier build` aggregates all `changelog.d/*.rst` fragment files into `CHANGELOG.rst` and then deletes the fragments. `--yes` skips the interactive confirmation. If the subsequent `git commit` or `git push` fails (branch protection requires a PR, the bot token lacks push permission, or a network error occurs), the fragment files are gone from the runner and were never committed. The next run finds no fragments — towncrier exits 0 with an empty changelog, and the content for this version is permanently lost unless fragments were backed up externally.',
        fix: 'Stage fragments before building so they are always part of the commit or not deleted:\n```yaml\n- name: Build changelog\n  run: |\n    pip install towncrier\n    # Stage existing fragments first so deletion is part of the commit\n    git add changelog.d/\n    towncrier build --version ${{ inputs.version }} --yes\n    git add CHANGELOG.rst changelog.d/\n```\nIf push fails, the working tree still has the original fragments (the `git add` was staged, not committed) and can be re-run.',
      },
      {
        lines: [60, 61, 62],
        title: '`--notes-from-tag` reads the annotated tag message, not the CHANGELOG — GitHub Release body is a one-liner',
        severity: 'high',
        description: 'Annotated tags created with `git tag -a "v1.3.0" -m "Release v1.3.0"` store the literal string "Release v1.3.0" as the tag message. `gh release create --notes-from-tag` reads that tag message and uses it as the GitHub Release body. The resulting release page shows only "Release v1.3.0" — not the changelog content. Users see no list of changes, no breaking compatibility notes, no contributors. The actual changelog was written to `CHANGELOG.rst` in the `changelog` job but is never surfaced on the GitHub Release page.',
        fix: 'Use towncrier\'s `--draft` to generate the release notes without deleting fragments, then pass them to `gh release create`:\n```yaml\n- name: Create GitHub Release\n  env:\n    GH_TOKEN: ${{ github.token }}\n  run: |\n    pip install towncrier\n    notes=$(towncrier build --version ${{ inputs.version }} --draft --yes 2>/dev/null)\n    gh release create "v${{ inputs.version }}" \\\n      --title "Isaac Lab v${{ inputs.version }}" \\\n      --notes "$notes"\n```',
      },
      {
        lines: [46, 47],
        title: '`publish` and `github-release` fan out from `changelog` which already pushed the tag — re-run after failure re-tags',
        severity: 'high',
        description: 'If `publish` fails (PyPI OIDC validation fails, the package is malformed, or the network is unavailable), the release is in an inconsistent state: `v1.3.0` tag exists on main, the GitHub Release is not yet created, and PyPI has no package. Re-running the failed `publish` job re-checks out `ref: v${{ inputs.version }}` (which now exists) and re-attempts the build — that part is safe. But re-running the entire workflow from `validate` fails immediately ("tag already exists"), making it impossible to re-run cleanly without manually deleting the tag.',
        fix: 'Make the tag creation step idempotent so the workflow can be re-run after partial failures:\n```yaml\n- name: Tag if not exists\n  run: |\n    if ! git rev-parse "v${{ inputs.version }}" &>/dev/null; then\n      git tag -a "v${{ inputs.version }}" -m "Release v${{ inputs.version }}"\n      git push origin "v${{ inputs.version }}"\n    else\n      echo "Tag already exists, skipping"\n    fi\n```',
      },
    ],
    qa: [
      {
        q: 'What is OIDC Trusted Publishing and why is it preferred over a long-lived PyPI API token?',
        a: 'OIDC Trusted Publishing (PEP 740) lets PyPI accept a short-lived OIDC identity token issued by GitHub Actions instead of a long-lived API token stored as a secret. GitHub issues a JWT for the workflow run; PyPI verifies it against the repository\'s registered trusted publisher configuration (owner, repo, workflow filename). The token is valid for the duration of the job step only — no static secret to rotate, leak, or accidentally log. Long-lived PyPI tokens, once leaked via a committed secret or log line, require immediate manual rotation. With OIDC, even if a workflow YAML is compromised, a captured OIDC token is useless after the job ends.',
      },
      {
        q: 'What is `workflow_dispatch` and when is it better than a `push` or `tag` trigger for releases?',
        a: '`workflow_dispatch` is a manual trigger — a human clicks "Run workflow" in the GitHub Actions UI and optionally fills in inputs (version, dry-run). It\'s better than `push` or tag triggers for releases because: (1) releases are intentional, irreversible operations — requiring a human click prevents accidental releases from automated commits; (2) `workflow_dispatch` inputs let the operator pass parameters not derivable from the git event; (3) the pipeline can be tested in dry-run mode before executing for real; (4) CI failures on main do not block releases — the operator can choose when to release even if non-release CI is red.',
      },
      {
        q: 'What does `towncrier` do and why is it used instead of writing CHANGELOG.rst manually?',
        a: 'Towncrier aggregates changelog "fragment" files — small files added per PR in `changelog.d/` with names like `123.bugfix.rst` or `456.feature.rst` (PR number + change type). At release time, `towncrier build --version 1.3.0` reads all fragments, groups them by type (Features, Bug Fixes, Deprecations), generates a formatted release section at the top of `CHANGELOG.rst`, and deletes the fragments. The advantage over manual editing: merge conflicts in CHANGELOG.rst are eliminated (each PR adds a separate file, not edits the same line), authorship is distributed to PR authors, and the format is automatable. The trade-off: PR authors must remember to add a fragment file or the change is not recorded.',
      },
    ],
  },
  {
    id: 'check-links-yml',
    filename: '.github/workflows/check-links.yml',
    title: 'Check Documentation Links',
    cat: 'CI/CD',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'Link Checking', 'Lychee', 'Documentation CI'],
    summary: 'Scheduled + PR/push workflow that runs lychee link checker across all Markdown and RST docs; caches results between runs.',
    explain: [
      'Triggers on PRs and pushes touching docs/markdown, plus a weekly Sunday cron to catch external link rot',
      'Uses lycheeverse/lychee-action with a GHA cache keyed to commit SHA (restore-key fallback for previous run)',
      'Excludes build artifacts, loopback addresses, mailto links, and known placeholder domains',
      'Accepts 2xx/3xx plus 429 status codes to avoid false positives from CDN rate-limits',
      'Appends results to $GITHUB_STEP_SUMMARY; fails the job on any broken links'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: Check Documentation Links

on:
  # Run on pull requests that modify documentation
  pull_request:
    paths:
      - 'docs/**'
      - '**.md'
      - '.github/workflows/check-links.yml'
  # Run on pushes to main branches
  push:
    branches:
      - main
      - devel
      - 'release/**'
    paths:
      - 'docs/**'
      - '**.md'
      - '.github/workflows/check-links.yml'
  # Allow manual trigger
  workflow_dispatch:
  # Run weekly to catch external links that break over time
  schedule:
    - cron: '0 0 * * 0'  # Every Sunday at midnight UTC

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  check-links:
    name: Check for Broken Links
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Restore lychee cache
      uses: actions/cache@v4
      with:
        path: .lycheecache
        key: cache-lychee-\${{ github.sha }}
        restore-keys: cache-lychee-

    - name: Run Link Checker
      uses: lycheeverse/lychee-action@v2
      with:
        # Check all markdown files and documentation
        args: >-
          --verbose
          --no-progress
          --cache
          --max-cache-age 1d
          --exclude-path './docs/_build'
          --exclude-path './apps/warp-*'
          --exclude-path './logs'
          --exclude-path './outputs'
          --exclude-loopback
          --exclude '^file://'
          --exclude '^mailto:'
          --exclude 'localhost'
          --exclude '127\\.0\\.0\\.1'
          --exclude 'example\\.com'
          --exclude 'your-organization'
          --exclude 'YOUR_'
          --exclude 'yourdomain'
          --exclude 'user@'
          --exclude 'helm\\.ngc\\.nvidia\\.com'
          --exclude 'slurm\\.schedmd\\.com'
          --max-retries 3
          --retry-wait-time 5
          --timeout 30
          --accept 200,201,202,203,204,206,301,302,303,307,308,429
          --scheme https
          --scheme http
          '*.md'
          '**/*.md'
          'docs/**/*.rst'
          'docs/**/*.html'
        # Output results to a file
        output: ./lychee-output.md
        # Fail action on broken links
        fail: true
        # Optional: Use GitHub token for authenticated requests (higher rate limit)
        token: \${{ secrets.GITHUB_TOKEN }}

    - name: Print results to logs
      if: always()
      run: |
        echo "========================================"
        echo "Link Checker Results:"
        echo "========================================"
        if [ -f ./lychee-output.md ]; then
          cat ./lychee-output.md
          echo ""
          echo "========================================"

          # Also add to GitHub step summary for easy viewing
          echo "## Link Checker Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          cat ./lychee-output.md >> $GITHUB_STEP_SUMMARY
        else
          echo "No output file generated"
          echo "========================================"
        fi

    - name: Fail job if broken links found
      if: failure()
      run: |
        echo "❌ Broken links were found in the documentation!"
        echo "Please review the link checker report above and fix all broken links."
        exit 1
`,
    issues: [
      {
        lines: [],
        title: 'Cache key tied to commit SHA — always cold on first run',
        severity: 'medium',
        description: 'The cache key is `cache-lychee-${{ github.sha }}`. Every new commit produces a new key, so the cache is always restored from the restore-key (previous SHA) but never an exact hit. This is intentional for freshness but means every push re-checks all links at least once.',
        fix: 'For faster subsequent runs within the same day use a date-based key: `cache-lychee-${{ github.sha }}-${{ steps.date.outputs.date }}` with a daily granularity restore-key.',
      },
      {
        lines: [],
        title: 'Weekly schedule at UTC midnight — may overlap with deployments',
        severity: 'medium',
        description: '`cron: 0 0 * * 0` fires at midnight UTC every Sunday. If a deployment runs at the same time, the link-check report may reflect a partially deployed docs site.',
        fix: 'Shift to `cron: 0 4 * * 0` (4am UTC) to reduce overlap with typical weekend maintenance windows.',
      },
    ],
    qa: [
      {
        q: 'Why does lychee need a cache and what does the restore-key pattern accomplish?',
        a: 'Lychee makes HTTP requests for every link found. On a large docs site this can be hundreds of external requests. The cache stores lychee\'s `.lycheecache` SQLite database mapping URLs to their last-checked result and timestamp. The `--max-cache-age 1d` flag re-checks cached URLs older than 1 day. The restore-key `cache-lychee-` (without the SHA) ensures the previous run\'s cache is loaded even after a new commit, so most links are served from cache and only changed/new links are checked fresh.',
      },
      {
        q: 'Why accept HTTP 429 (Too Many Requests) as a valid status code?',
        a: 'Some CDNs (GitHub, npm registry) rate-limit unauthenticated link checkers and return 429 instead of 200. If lychee treated 429 as a failure it would produce hundreds of false positives on popular links. Accepting 429 means "the link exists, the server is just throttling us". The `--max-retries 3` and `--retry-wait-time 5` settings handle transient rate-limits before falling back to the accept list.',
      },
      {
        q: 'How does `--exclude \'^file://\'` protect against local path leakage in docs?',
        a: 'RST and Sphinx can sometimes generate `file://` URLs when documentation references absolute local paths on the build machine. If lychee tried to follow `file://` URLs in CI it would fail immediately because the local filesystem is not accessible. The exclude pattern prevents those false failures and avoids accidentally exposing developer machine paths in CI logs.',
      },
    ],
  },
  {
    id: 'docs-yaml',
    filename: '.github/workflows/docs.yaml',
    title: 'Documentation Build & Deploy',
    cat: 'CI/CD',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'Sphinx', 'Multi-version Docs', 'GitHub Pages', 'sphinx-multiversion'],
    summary: 'Detects build type (PR vs mainline), builds current or multi-version Sphinx docs, and deploys to GitHub Pages on main/develop/release branches.',
    explain: [
      'A first job detects whether this is a deployable push by checking REPO_NAME secret against github.repository and github.ref',
      'PR and non-mainline pushes build only the current version docs via make current-docs',
      'Mainline pushes trigger multi-version build: fetches all tags, detaches HEAD, deletes local branches so sphinx-multiversion sees only remote refs',
      'A deploy job uses peaceiris/actions-gh-pages to force-push the built _build directory to gh-pages branch'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: Docs

on:
  push:
    branches:
      - main
      - develop
      - 'release/**'
      - 'feature/isaacsim-6-0'
  pull_request:
    # we're skipping the branches and paths filter to allow docs to be built on any PR because heredoc is used
    # additionally, we have a check that determines what version of docs will be built
    types: [opened, synchronize, reopened]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  doc-build-type:
    name: Detect Doc Build Type
    runs-on: ubuntu-latest
    outputs:
      trigger-deploy: \${{ steps.trigger-deploy.outputs.defined }}
    steps:
    - id: info
      run: echo "repo=github.repository=\${{ github.repository }}, ref=github.ref=\${{ github.ref }}"
    - id: trigger-deploy
      env:
        REPO_NAME: \${{ secrets.REPO_NAME }}
      # develop, main, release/ trigger multi-version build, then deployment to gh-pages
      # all others - just the current docs without deployment
      if: "\${{ github.repository == env.REPO_NAME && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' || startsWith(github.ref, 'refs/heads/release/')) }}"
      run: echo "defined=true" >> "$GITHUB_OUTPUT"; echo "Docs will be built multi-version and deployed"

  build-latest-docs:
    name: Build Latest Docs
    runs-on: ubuntu-latest
    needs: [doc-build-type]
    # run on non-deploy branches to build current version docs only
    if: needs.doc-build-type.outputs.trigger-deploy != 'true'

    steps:
    - name: Checkout code
      uses: actions/checkout@v6

    - name: Setup python
      uses: actions/setup-python@v5
      with:
        python-version: "3.12"
        architecture: x64

    - name: Install dev requirements
      working-directory: ./docs
      run: pip install -r requirements.txt

    - name: Build current version docs
      working-directory: ./docs
      run: make current-docs

    - name: Upload docs artifact
      uses: actions/upload-artifact@v7
      with:
        name: docs-html
        path: ./docs/_build

  build-multi-docs:
    name: Build Multi-Version Docs
    runs-on: ubuntu-latest
    needs: [doc-build-type]
    # run on deploy branches to create multi-version docs
    if: needs.doc-build-type.outputs.trigger-deploy == 'true'

    steps:
    - name: Checkout code
      uses: actions/checkout@v6

    - name: Setup python
      uses: actions/setup-python@v5
      with:
        python-version: "3.12"
        architecture: x64

    - name: Install dev requirements
      working-directory: ./docs
      run: pip install -r requirements.txt

    - name: Generate multi-version docs
      working-directory: ./docs
      env:
        # "deploy" branches build the full set of versions so every page
        # has a complete version dropdown: main, develop, tags >= v2.0.0
        # (including pre-release suffixes like -beta or -rc1). v1.x tags and
        # release/ branches are excluded.
        SMV_BRANCH_WHITELIST: '^(main|develop)$'
        SMV_TAG_WHITELIST: '^v[2-9]\\d*\\.\\d+\\.\\d+(-[A-Za-z0-9.]+)?$'
      run: |
        git fetch --prune --unshallow --tags
        git checkout --detach HEAD
        git for-each-ref --format="%(refname:short)" refs/heads/ | xargs -r git branch -D
        make multi-docs

    - name: Upload docs artifact
      uses: actions/upload-artifact@v7
      with:
        name: docs-html
        path: ./docs/_build

  deploy-docs:
    name: Deploy Docs
    runs-on: ubuntu-latest
    needs: [doc-build-type, build-multi-docs]
    # deploy only on "deploy" branches
    if: needs.doc-build-type.outputs.trigger-deploy == 'true'

    steps:
    - name: Download docs artifact
      uses: actions/download-artifact@v8
      with:
        name: docs-html
        path: ./docs/_build

    - name: Deploy to gh-pages
      uses: peaceiris/actions-gh-pages@v4
      with:
        github_token: \${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./docs/_build
        keep_files: false
        force_orphan: true
`,
    issues: [
      {
        lines: [],
        title: 'Uses actions/checkout@v6 and upload-artifact@v7/v8 — non-existent versions',
        severity: 'high',
        description: 'The workflow pins `actions/checkout@v6`, `actions/upload-artifact@v7`, and `actions/download-artifact@v8`. At the time of writing, the latest stable checkout is v4. Using non-existent major versions will cause the workflow to fail at runtime.',
        fix: 'Pin to existing releases: `actions/checkout@v4`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`.',
      },
      {
        lines: [],
        title: 'Multi-version build deletes all local branches — fragile in shallow clones',
        severity: 'medium',
        description: 'Deleting every local branch with `git branch -D` so sphinx-multiversion only sees remote tracking refs is fragile. If a future checkout action changes how it sets up the local repo, this could delete wrong branches or fail silently.',
        fix: 'Pass `--branches` and `--tags` arguments directly to `sphinx-multiversion` to control which refs are built, avoiding git state manipulation.',
      },
    ],
    qa: [
      {
        q: 'Why does the multi-version job use `git checkout --detach HEAD` before deleting local branches?',
        a: 'sphinx-multiversion iterates over git refs to build docs for each version. If you are on a named branch (e.g. main), that branch appears in both refs/heads/main and refs/remotes/origin/main, causing a duplicate build. Detaching HEAD means refs/heads/main no longer exists as a checked-out branch, so the git branch -D cleanup removes it cleanly. The working tree is identical — only the ref pointer changes.',
      },
      {
        q: 'What is the role of the REPO_NAME secret in the deploy gate?',
        a: 'The deploy job checks `github.repository == env.REPO_NAME` to prevent forks from accidentally deploying to their own GitHub Pages. Without this check, a contributor who forks the repo and pushes to their fork\'s main branch would trigger a gh-pages deployment. The secret REPO_NAME is set only in the canonical repository, so forks get an empty string and the condition is false.',
      },
      {
        q: 'Why does peaceiris/actions-gh-pages use `force_orphan: true`?',
        a: '`force_orphan: true` creates the gh-pages branch as an orphan commit on every deploy — the branch history is replaced entirely rather than appended. This keeps the gh-pages branch size bounded (no accumulation of every docs build), ensures the published site exactly matches the artifact, and prevents merge conflicts when the docs directory structure changes between versions.',
      },
    ],
  },
  {
    id: 'labeler-workflow-yml',
    filename: '.github/workflows/labeler.yml',
    title: 'Pull Request Labeler Workflow',
    cat: 'CI/CD',
    diff: 'easy',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'PR Automation', 'actions/labeler'],
    summary: 'Minimal workflow that triggers actions/labeler on pull_request_target events to auto-label PRs based on changed files.',
    explain: [
      'Fires on `pull_request_target` (not `pull_request`) for write-permission access from fork PRs',
      'Delegates all labeling logic to `actions/labeler@v6` which reads rules from `.github/labeler.yml`',
      'Requires only `contents: read` and `pull-requests: write` permissions — the minimum needed'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: "Pull Request Labeler"
on:
- pull_request_target

jobs:
  labeler:
    permissions:
      contents: read
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
    - uses: actions/labeler@v6
`,
    issues: [
      {
        lines: [],
        title: '`pull_request_target` is safe here but dangerous if checkout is added',
        severity: 'medium',
        description: '`pull_request_target` runs in the base repo context with write permissions. It is safe here because no code from the PR is checked out or executed. If a contributor adds `actions/checkout` without scoping to the base ref, a malicious PR could execute arbitrary code with write access to the repo.',
        fix: 'Add a comment documenting why `pull_request_target` is used and that `actions/checkout` must never be added here without explicit permission scoping.',
      },
    ],
    qa: [
      {
        q: 'Why use `pull_request_target` instead of `pull_request` for the labeler?',
        a: '`pull_request` events from forks have read-only GITHUB_TOKEN — they cannot write labels. `pull_request_target` runs in the base repo context with write permissions even for fork PRs, which is necessary to call the Labels API. The security trade-off is that `pull_request_target` has repo write access — but since this workflow only calls actions/labeler (no checkout, no arbitrary code), the attack surface is minimal.',
      },
      {
        q: 'Where does actions/labeler read its label rules from?',
        a: 'By default, `actions/labeler@v6` reads `.github/labeler.yml` in the base repository. The file maps label names to path glob patterns or branch name patterns. On each PR, the action computes the diff (changed files + head branch name), matches them against the patterns, and applies all matching labels. Labels are additive — existing labels are not removed unless `sync-labels: true` is set.',
      },
    ],
  },
  {
    id: 'license-check-yaml',
    filename: '.github/workflows/license-check.yaml',
    title: 'Python Dependency License Check',
    cat: 'CI/CD',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'pip-licenses', 'License Compliance', 'Isaac Sim', 'Shell Scripting'],
    summary: 'PR workflow that installs the full Isaac Sim + Isaac Lab dependency tree and validates every Python package license against an allowlist (MIT/Apache/BSD/ISC/zlib).',
    explain: [
      'Clears ~60 GB of tool cache and Docker images to free disk space before the large install',
      'Installs Isaac Sim 5.0.0 from NVIDIA PyPI index, then runs `./isaaclab.sh -i` for all extensions',
      'Runs pip-licenses in JSON mode and iterates every installed package against the allowlist',
      'Checks a JSON exceptions file for packages whose licenses were explicitly reviewed and approved',
      'Fails the job if any package has an unapproved license not in the exceptions file'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: Check Python Dependency Licenses

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  license-check:
    runs-on: ubuntu-24.04

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    # - name: Install jq
    #   run: sudo apt-get update && sudo apt-get install -y jq

    - name: Clean up disk space
      run: |
        rm -rf /opt/hostedtoolcache
        rm -rf /usr/share/dotnet
        rm -rf /opt/ghc
        docker container prune -f
        docker image prune -af
        docker volume prune -f || true


    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'  # Adjust as needed

    - name: Install dependencies using ./isaaclab.sh -i
      run: |
        # first install isaac sim
        pip install --upgrade pip
        pip install 'isaacsim[all,extscache]==\${{ vars.ISAACSIM_BASE_VERSION || '5.0.0' }}' --extra-index-url https://pypi.nvidia.com
        chmod +x ./isaaclab.sh  # Make sure the script is executable
        # install all lab dependencies
        ./isaaclab.sh -i

    - name: Install pip-licenses
      run: |
        pip install pip-licenses
        pip install -r tools/template/requirements.txt
        pip install -r docs/requirements.txt

    # Optional: Print the license report for visibility
    - name: Print License Report
      run: pip-licenses --from=mixed --format=markdown

    # Print pipdeptree
    - name: Print pipdeptree
      run: |
        pip install pipdeptree
        pipdeptree

    - name: Check licenses against whitelist and exceptions
      run: |
        # Define the whitelist of allowed licenses
        ALLOWED_LICENSES="MIT Apache BSD ISC zlib"

        # Load the exceptions list from the exceptions.json file
        EXCEPTIONS_FILE=".github/workflows/license-exceptions.json"

        # Initialize counter for failed packages
        FAILED_PACKAGES=0

        # Get the list of installed packages and their licenses
        pip-licenses --from=mixed --format=json > licenses.json

        # Check the output of pip-licenses to ensure it is valid JSON
        if ! jq empty licenses.json; then
          echo "ERROR: Failed to parse pip-licenses output. Exiting..."
          exit 1
        fi

        # Split ALLOWED_LICENSES into individual words
        IFS=' ' read -r -a allowed_licenses <<< "$ALLOWED_LICENSES"

        # Loop through the installed packages and their licenses
        for pkg in $(jq -r '.[].Name' licenses.json); do
          LICENSE=$(jq -r --arg pkg "$pkg" '.[] | select(.Name == $pkg) | .License' licenses.json)

          # Check if any of the allowed licenses are a substring of the package's license
          match_found=false
          for allowed_license in "\${allowed_licenses[@]}"; do
            if [[ "$LICENSE" == *"$allowed_license"* ]]; then
              match_found=true
              break
            fi
          done

          if [ "$match_found" = false ]; then
            # Check if the package is in the exceptions list
            EXCEPTION=$(jq -r --arg pkg "$pkg" --arg license "$LICENSE" \\
              '.[] | select(.package == $pkg)' "$EXCEPTIONS_FILE")

            # If the package is in the exceptions list
            if [ -n "$EXCEPTION" ]; then
              # If the license is provided in the exceptions list, check the license
              EXCEPTION_LICENSE=$(echo "$EXCEPTION" | jq -r '.license')

              # echo "Comparing licenses for $pkg:"
              # echo "  EXCEPTION_LICENSE='\${EXCEPTION_LICENSE}' (len=\${#EXCEPTION_LICENSE})"
              # echo "  LICENSE='\${LICENSE}' (len=\${#LICENSE})"

              # If the exceptions list has a license and doesn't match the current license
              if [ "$EXCEPTION_LICENSE" != "null" ] && [ "$EXCEPTION_LICENSE" != "$LICENSE" ]; then
                echo "ERROR: $pkg has license: $LICENSE"
                FAILED_PACKAGES=$((FAILED_PACKAGES + 1))  # Increment the counter
              fi
            else
              # If the package is not in the exceptions list
              echo "ERROR: $pkg has license: $LICENSE"
              FAILED_PACKAGES=$((FAILED_PACKAGES + 1))  # Increment the counter
            fi
          fi
        done

        # After all packages are processed, check if there were any errors
        if [ "$FAILED_PACKAGES" -gt 0 ]; then
          echo "ERROR: $FAILED_PACKAGES packages were flagged."
          exit 1  # Fail the build
        else
          echo "All packages were checked."
        fi
`,
    issues: [
      {
        lines: [],
        title: 'ISAACSIM_BASE_VERSION fallback has broken shell quoting',
        severity: 'high',
        description: 'The install command uses `${{ vars.ISAACSIM_BASE_VERSION || \'5.0.0\' }}` embedded in a shell string with single quotes. If the variable is unset, the shell sees mismatched single quotes and the command fails with a syntax error.',
        fix: 'Use a separate step to export the version: `echo "VERSION=${{ vars.ISAACSIM_BASE_VERSION || \'5.0.0\' }}" >> $GITHUB_ENV` then reference `$VERSION` in the pip command.',
      },
      {
        lines: [],
        title: 'Docker image prune may remove images needed by concurrent jobs',
        severity: 'medium',
        description: '`docker image prune -af` removes ALL docker images on the runner. If the runner is shared and a concurrent job needs a cached Docker image, this step will force a full re-pull.',
        fix: 'Use targeted removal: only prune if disk space is critically low. Or use `docker image prune -af --filter until=24h` to only remove images older than 24 hours.',
      },
    ],
    qa: [
      {
        q: 'Why does this workflow need to install Isaac Sim just to check licenses?',
        a: 'pip-licenses reports on all installed packages in the current Python environment. Isaac Sim ships hundreds of pre-bundled Python wheels (NumPy, PyTorch, Warp) that are not listed as standard pyproject.toml dependencies — they are installed by the Isaac Sim installer itself. Without actually running the installer, pip-licenses would miss all the transitive wheels bundled by the simulator. The workflow must mirror the production install exactly.',
      },
      {
        q: 'What is the purpose of the JSON exceptions file and when would you add an entry?',
        a: 'The exceptions file (`.github/workflows/license-exceptions.json`) whitelists packages whose licenses are not in the standard allowlist but have been explicitly reviewed and approved. Common cases: LGPL packages, proprietary NVIDIA SDK packages, or dual-licensed packages where the OSS license applies. Adding an entry means a human reviewed the license terms and accepted them. The entry must include the expected license string — if the license changes on a future version the check fails until re-reviewed.',
      },
    ],
  },
  {
    id: 'pre-commit-yaml',
    filename: '.github/workflows/pre-commit.yaml',
    title: 'Pre-commit Linters CI',
    cat: 'CI/CD',
    diff: 'easy',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'pre-commit', 'Code Quality', 'Linting'],
    summary: 'Minimal PR workflow that runs the full pre-commit hook suite (ruff, codespell, license headers, etc.) on Python 3.12.',
    explain: [
      'Triggers on every PR open/sync/reopen',
      'Uses `pre-commit/action@v3.0.0` which installs pre-commit, reads `.pre-commit-config.yaml`, and runs all configured hooks',
      'Only checks files changed in the PR diff — makes CI fast without re-linting the entire codebase',
      'The action caches pre-commit environments keyed to hook versions, so subsequent runs are fast'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: Run linters using pre-commit

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  pre-commit:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v3
      with:
        python-version: "3.12"
    - uses: pre-commit/action@v3.0.0
`,
    issues: [
      {
        lines: [],
        title: 'Uses `actions/setup-python@v3` — consider pinning to v5 for Python 3.12 support',
        severity: 'medium',
        description: '`actions/setup-python@v3` is outdated. Python 3.12 support is available from v4+. While it may still work, the action may download Python from a slower fallback path instead of the cached toolchain.',
        fix: 'Update to `actions/setup-python@v5` which has first-class Python 3.12 cached toolchain support on all GHA-hosted runners.',
      },
    ],
    qa: [
      {
        q: 'Why does pre-commit CI only check changed files while local `pre-commit run --all-files` checks everything?',
        a: '`pre-commit/action` runs `pre-commit run --from-ref origin/${{ github.base_ref }} --to-ref HEAD`, limiting the file set to files changed in the PR. This makes CI fast — a single-file change does not re-lint the entire 50k-line codebase. The policy is "don\'t make it worse," not "fix everything at once." Running `--all-files` locally catches pre-existing issues.',
      },
      {
        q: 'How does pre-commit/action cache the hook environments and what invalidates the cache?',
        a: 'The action creates a cache key from a hash of `.pre-commit-config.yaml`. Each hook specifies a `repo` URL and `rev` (git tag/SHA). When either changes (e.g. bumping ruff from v0.14.9 to v0.14.10), the hash changes, the cache misses, and pre-commit reinstalls the hook from scratch. Unchanged hooks are served from cache.',
      },
    ],
  },
  {
    id: 'github-labeler-yml',
    filename: '.github/labeler.yml',
    title: 'PR Label Rules',
    cat: 'Repository Config',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['actions/labeler', 'GitHub Automation', 'Glob Patterns', 'Repository Organization'],
    summary: 'Label mapping config for actions/labeler: maps changed file paths and branch name patterns to PR labels (documentation, infrastructure, asset, bug, enhancement, etc.).',
    explain: [
      'Seven label rules using labeler v6 syntax with `any-glob-to-any-file` and `all-globs-to-all-files` operators',
      '`documentation` rule uses compound condition: matches docs/** or README.md BUT NOT docs/licenses/**',
      '`infrastructure` covers all DevOps-adjacent files: .github/, docker/, tools/, environment.yml, pyproject.toml',
      '`enhancement` and `bug` match on head branch name patterns using regex (`^feature`, `^fix`, `^bug`)'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

# Documentation-related changes
documentation:
  - all:
    - changed-files:
      - any-glob-to-any-file:
        - 'docs/**'
        - '**/README.md'
      - all-globs-to-all-files:
        - '!docs/licenses/**'

# Infrastructure changes
infrastructure:
  - changed-files:
    - any-glob-to-any-file:
      - .github/**
      - docker/**
      - .dockerignore
      - tools/**
      - .vscode/**
      - environment.yml
      - setup.py
      - pyproject.toml
      - .pre-commit-config.yaml
      - isaaclab.sh
      - isaaclab.bat
      - docs/licenses/**

# Assets (USD, glTF, etc.) related changes.
asset:
  - changed-files:
    - any-glob-to-any-file:
      - source/isaaclab_assets/**

# Isaac Sim team related changes.
isaac-sim:
  - changed-files:
    - any-glob-to-any-file:
      - apps/**

# Isaac Mimic team related changes.
isaac-mimic:
  - changed-files:
    - any-glob-to-any-file:
      - source/isaaclab/isaaclab/devices/**
      - source/isaaclab_mimic/**
      - source/isaaclab_tasks/isaaclab_tasks/manager_based/manipulation/stack**
      - source/isaaclab_tasks/isaaclab_tasks/manager_based/manipulation/pick_and_place**
      - scripts/imitation_learning/**

# Isaac Lab team related changes.
isaac-lab:
  - all:
    - changed-files:
      - any-glob-to-any-file:
        - source/**
        - scripts/**
      - all-globs-to-all-files:
        - '!source/isaaclab_assets/**'
        - '!source/isaaclab_mimic/**'
        - '!source/isaaclab/isaaclab/devices'
        - '!scripts/imitation_learning/**'

# Add 'enhancement' label to any PR where the head branch name
# starts with \`feature\` or has a \`feature\` section in the name
enhancement:
  - head-branch: ['^feature', 'feature']

# Add 'bug' label to any PR where the head branch name
# starts with \`fix\`/\`bug\` or has a \`fix\`/\`bug\` section in the name
bug:
  - head-branch: ['^fix', 'fix', '^bug', 'bug']
`,
    issues: [
      {
        lines: [],
        title: '`isaac-lab` rule negative globs require labeler v6+ to work correctly',
        severity: 'medium',
        description: 'The `isaac-lab` rule uses `all-globs-to-all-files: [\'!source/isaaclab_assets/**\', ...]` negative exclusions. In labeler v4 this syntax was not supported; v5+ supports it but the behavior changed between minor versions.',
        fix: 'Document the minimum required labeler version (v6) in a comment at the top of the file. Test negative glob behavior after any labeler version bump.',
      },
    ],
    qa: [
      {
        q: 'What is the difference between `any-glob-to-any-file` and `all-globs-to-all-files` in labeler v6?',
        a: '`any-glob-to-any-file` is an OR across both dimensions: the label is applied if ANY of the listed globs matches ANY of the changed files. `all-globs-to-all-files` requires every glob to match every file — useful only for negative exclusions (globs starting with `!`). The `documentation` label uses a compound: it must have a matching file AND no file must match the excluded pattern `docs/licenses/**`.',
      },
      {
        q: 'Why are `enhancement` and `bug` labels tied to branch names rather than file paths?',
        a: 'File path-based rules categorize what changed (docs, infra, assets). But the intent of a change (bug fix vs feature) is better captured by branch naming convention. A bug fix might touch source files, infra files, and tests simultaneously — the same pattern as a feature. Using branch name regex lets the developer signal intent at branch creation time.',
      },
    ],
  },
  {
    id: 'stale-yml',
    filename: '.github/stale.yml',
    title: 'Stale Issue Bot Config',
    cat: 'Repository Config',
    diff: 'easy',
    lang: 'yaml',
    jdSkills: ['Probot Stale', 'GitHub Issues', 'Repository Automation'],
    summary: 'Probot stale configuration: marks `more-information-needed` issues stale after 60 days, closes after 14 more; exempt labels, projects, milestones, and assignees.',
    explain: [
      'Only affects issues with the `more-information-needed` label (`onlyLabels`) — not all open issues',
      'After 60 days of inactivity, Stale posts the mark comment and adds the `stale` label',
      'After 14 more inactive days, the issue is closed',
      'Issues labeled `pinned`, `security`, or `[Status] Maybe Later` are fully exempt',
      '`limitPerRun: 30` prevents exhausting GitHub API rate limits (5000 requests/hour)'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

# Configuration for probot-stale - https://github.com/probot/stale

# Number of days of inactivity before an Issue or Pull Request becomes stale
daysUntilStale: 60

# Number of days of inactivity before an Issue or Pull Request with the stale label is closed.
# Set to false to disable. If disabled, issues still need to be closed manually, but will remain marked as stale.
daysUntilClose: 14

# Only issues or pull requests with all of these labels are check if stale. Defaults to \`[]\` (disabled)
onlyLabels:
  - more-information-needed

# Issues or Pull Requests with these labels will never be considered stale. Set to \`[]\` to disable
exemptLabels:
  - pinned
  - security
  - "[Status] Maybe Later"

# Set to true to ignore issues in a project (defaults to false)
exemptProjects: true

# Set to true to ignore issues in a milestone (defaults to false)
exemptMilestones: true

# Set to true to ignore issues with an assignee (defaults to false)
exemptAssignees: true

# Label to use when marking as stale
staleLabel: stale

# Comment to post when marking as stale. Set to \`false\` to disable
markComment: >
  This issue has been automatically marked as stale because it has not had
  recent activity. It will be closed if no further activity occurs. Thank you
  for your contributions.

# Comment to post when removing the stale label.
# unmarkComment: >
#   Your comment here.

# Comment to post when closing a stale Issue or Pull Request.
# closeComment: >
#   Your comment here.

# Limit the number of actions per hour, from 1-30. Default is 30
limitPerRun: 30

# Limit to only \`issues\` or \`pulls\`
only: issues

# Optionally, specify configuration settings that are specific to just 'issues' or 'pulls':
# pulls:
#   daysUntilStale: 30
#   markComment: >
#     This pull request has been automatically marked as stale because it has not had
#     recent activity. It will be closed if no further activity occurs. Thank you
#     for your contributions.

# issues:
#   exemptLabels:
#     - confirmed
`,
    issues: [
      {
        lines: [],
        title: '14-day close window may be too short for external contributors',
        severity: 'medium',
        description: 'After the stale comment is posted, contributors have only 14 days to respond before the issue is auto-closed. External contributors in different time zones or with part-time availability may not see the notification in time, leading to premature closure of valid issues.',
        fix: 'Consider increasing `daysUntilClose` to 28, or add a `no-close` label to the exempt list that maintainers can apply manually.',
      },
    ],
    qa: [
      {
        q: 'Why target only `more-information-needed` issues rather than all open issues?',
        a: 'The `onlyLabels: [more-information-needed]` setting means Stale only processes issues that are already blocked on reporter action — a maintainer asked a clarifying question and got no response. General open issues (bugs, features) may be valid even if inactive because they are waiting on engineering capacity, not on the reporter. Stale-closing those would damage community trust.',
      },
      {
        q: 'What does `limitPerRun: 30` prevent and when would you increase it?',
        a: '`limitPerRun: 30` ensures each Probot Stale run processes at most 30 issues per execution. This prevents the bot from making hundreds of API calls in a single run, which could exhaust the GitHub API rate limit. You would increase it if the repository has thousands of stale issues and needs faster cleanup — but you must verify the rate limit headroom first.',
      },
    ],
  },
  {
    id: 'docker-container-py',
    filename: 'docker/container.py',
    title: 'Docker Container CLI',
    cat: 'DevOps',
    diff: 'medium',
    lang: 'python',
    jdSkills: ['argparse', 'Docker Compose', 'X11 Forwarding', 'CLI Design', 'Python OOP'],
    summary: 'CLI entrypoint for Docker container lifecycle (build/start/enter/config/copy/stop) with X11 forwarding support and profile/suffix/extra-yaml composition.',
    explain: [
      'Uses argparse with a subparsers pattern and a parent parser for shared arguments (profile, --files, --env-files, --suffix)',
      'ContainerInterface abstraction handles docker compose invocations; x11_utils handles display forwarding setup/teardown',
      'X11 forwarding is checked on build/start, refreshed on enter, and cleaned up on stop',
      'The `config` sub-command generates a merged docker-compose.yaml without starting anything — useful for debugging compose merges'
    ],
    code: `#!/usr/bin/env python3

# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

import argparse
import shutil
from pathlib import Path

from utils import ContainerInterface, x11_utils


def parse_cli_args() -> argparse.Namespace:
    """Parse command line arguments.

    This function creates a parser object and adds subparsers for each command. The function then parses the
    command line arguments and returns the parsed arguments.

    Returns:
        The parsed command line arguments.
    """
    parser = argparse.ArgumentParser(description="Utility for using Docker with Isaac Lab.")

    # We have to create separate parent parsers for common options to our subparsers
    parent_parser = argparse.ArgumentParser(add_help=False)
    parent_parser.add_argument(
        "profile", nargs="?", default="base", help="Optional container profile specification. Example: 'base' or 'ros'."
    )
    parent_parser.add_argument(
        "--files",
        nargs="*",
        default=None,
        help=(
            "Allows additional '.yaml' files to be passed to the docker compose command. These files will be merged"
            " with 'docker-compose.yaml' in their provided order."
        ),
    )
    parent_parser.add_argument(
        "--env-files",
        nargs="*",
        default=None,
        help=(
            "Allows additional '.env' files to be passed to the docker compose command. These files will be merged with"
            " '.env.base' in their provided order."
        ),
    )
    parent_parser.add_argument(
        "--suffix",
        nargs="?",
        default=None,
        help=(
            "Optional docker image and container name suffix.  Defaults to None, in which case, the docker name"
            " suffix is set to the empty string. A hyphen is inserted in between the profile and the suffix if"
            ' the suffix is a nonempty string.  For example, if "base" is passed to profile, and "custom" is'
            " passed to suffix, then the produced docker image and container will be named \`\`isaac-lab-base-custom\`\`."
        ),
    )
    parent_parser.add_argument(
        "--info",
        action="store_true",
        help="Print the container interface information. This is useful for debugging purposes.",
    )

    # Actual command definition begins here
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser(
        "build",
        help="Build the docker image without creating the container.",
        parents=[parent_parser],
    )
    subparsers.add_parser(
        "start",
        help="Build the docker image and create the container in detached mode.",
        parents=[parent_parser],
    )
    subparsers.add_parser(
        "enter", help="Begin a new bash process within an existing Isaac Lab container.", parents=[parent_parser]
    )
    config = subparsers.add_parser(
        "config",
        help=(
            "Generate a docker-compose.yaml from the passed yamls, .envs, and either print to the terminal or create a"
            " yaml at output_yaml"
        ),
        parents=[parent_parser],
    )
    config.add_argument(
        "--output-yaml", nargs="?", default=None, help="Yaml file to write config output to. Defaults to None."
    )
    subparsers.add_parser(
        "copy", help="Copy build and logs artifacts from the container to the host machine.", parents=[parent_parser]
    )
    subparsers.add_parser("stop", help="Stop the docker container and remove it.", parents=[parent_parser])

    # parse the arguments to determine the command
    args = parser.parse_args()

    return args


def main(args: argparse.Namespace):
    """Main function for the Docker utility."""
    # check if docker is installed
    if not shutil.which("docker"):
        raise RuntimeError(
            "Docker is not installed! Please check the 'Docker Guide' for instruction: "
            "https://isaac-sim.github.io/IsaacLab/source/deployment/docker.html"
        )

    # creating container interface
    ci = ContainerInterface(
        context_dir=Path(__file__).resolve().parent,
        profile=args.profile,
        yamls=args.files,
        envs=args.env_files,
        suffix=args.suffix,
    )
    if args.info:
        print("[INFO] Printing container interface information...\\n")
        ci.print_info()
        return

    print(f"[INFO] Using container profile: {ci.profile}")
    if args.command == "build":
        # check if x11 forwarding is enabled
        x11_outputs = x11_utils.x11_check(ci.statefile)
        # if x11 forwarding is enabled, add the x11 yaml and environment variables
        if x11_outputs is not None:
            (x11_yaml, x11_envar) = x11_outputs
            ci.add_yamls += x11_yaml
            ci.environ.update(x11_envar)
        # build the image
        ci.build()
    elif args.command == "start":
        # check if x11 forwarding is enabled
        x11_outputs = x11_utils.x11_check(ci.statefile)
        # if x11 forwarding is enabled, add the x11 yaml and environment variables
        if x11_outputs is not None:
            (x11_yaml, x11_envar) = x11_outputs
            ci.add_yamls += x11_yaml
            ci.environ.update(x11_envar)
        # start the container
        ci.start()
    elif args.command == "enter":
        # refresh the x11 forwarding
        x11_utils.x11_refresh(ci.statefile)
        # enter the container
        ci.enter()
    elif args.command == "config":
        ci.config(args.output_yaml)
    elif args.command == "copy":
        ci.copy()
    elif args.command == "stop":
        # stop the container
        ci.stop()
        # cleanup the x11 forwarding
        x11_utils.x11_cleanup(ci.statefile)
    else:
        raise RuntimeError(f"Invalid command provided: {args.command}. Please check the help message.")


if __name__ == "__main__":
    args_cli = parse_cli_args()
    main(args_cli)
`,
    issues: [
      {
        lines: [],
        title: 'Docker availability check raises RuntimeError instead of clean exit',
        severity: 'medium',
        description: '`raise RuntimeError(...)` when Docker is not installed produces a Python traceback. For a CLI tool this is confusing — users expect a clean error message and exit code 1.',
        fix: 'Use `sys.exit("Docker is not installed...")` or `parser.error(...)` to produce a clean one-line error message with exit code 1.',
      },
      {
        lines: [],
        title: 'Profile default `base` hardcoded — diverges if default profile name changes',
        severity: 'medium',
        description: '`nargs=\'?\', default=\'base\'` hardcodes the default profile name. If the default profile name changes in docker-compose.yaml, this hardcoded default will silently use the old name.',
        fix: 'Read the default profile from a configuration constant or `.env.base` file rather than hardcoding it in the parser.',
      },
    ],
    qa: [
      {
        q: 'Why does the CLI use a parent parser pattern instead of just adding arguments to each subparser?',
        a: 'The parent parser (`add_help=False`) defines arguments common to all sub-commands. Passing `parents=[parent_parser]` to each subparser copies these arguments, avoiding repetition. `add_help=False` on the parent is crucial — if the parent had `--help`, argparse would intercept `-h` before the subcommand is parsed. This is the standard argparse approach for multi-command CLIs with shared options.',
      },
      {
        q: 'What does the `config` sub-command do and when is it useful?',
        a: '`config` merges all provided YAML files and .env files, then runs `docker compose config` to print the fully-resolved docker-compose configuration. Useful for debugging: when you pass multiple `--files` overrides, it is hard to know which service definition wins. `docker compose config` resolves all merges and prints the final effective YAML. The `--output-yaml` option writes it to a file for reproducible deployments.',
      },
    ],
  },
  {
    id: 'dockerfile-curobo',
    filename: 'docker/Dockerfile.curobo',
    title: 'CuRobo Extension Dockerfile',
    cat: 'DevOps',
    diff: 'hard',
    lang: 'dockerfile',
    jdSkills: ['Docker', 'CUDA', 'BuildKit', 'Isaac Sim', 'cuRobo', 'Multi-stage Build'],
    summary: 'Extends the Isaac Sim base image: installs CUDA 12.8 toolkit from NVIDIA repos, Isaac Lab deps, then builds cuRobo from a pinned commit with CUDA 8.0+PTX arch.',
    explain: [
      'Detects the Ubuntu version to select the correct CUDA repo URL for OS-specific CUDA 12.8 installation',
      'Installs CUDA 12.8 toolkit + cuDNN9 + NCCL + cuSPARSELt via apt; sets TORCH_CUDA_ARCH_LIST=8.0+PTX for Ampere GPUs',
      'Copies Isaac Lab source tree, installs Python and apt deps, pre-creates Omniverse cache directories',
      'Removes the bundled torch from Isaac Sim to avoid version conflicts before installing cuRobo',
      'Installs cuRobo from a pinned git commit SHA via `pip install --no-build-isolation`'
    ],
    code: `# Copyright (c) 2022-2025, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

# Nvidia Dockerfiles: https://github.com/NVIDIA-Omniverse/IsaacSim-dockerfiles
# Please check above link for license information.

# Base image
ARG ISAACSIM_BASE_IMAGE_ARG
ARG ISAACSIM_VERSION_ARG
FROM \${ISAACSIM_BASE_IMAGE_ARG}:\${ISAACSIM_VERSION_ARG} AS base
ENV ISAACSIM_VERSION=\${ISAACSIM_VERSION_ARG}

# Set default RUN shell to bash
SHELL ["/bin/bash", "-c"]

# Adds labels to the Dockerfile
LABEL version="2.1.1"
LABEL description="Dockerfile for building and running the Isaac Lab framework inside Isaac Sim container image."

# Arguments
# Path to Isaac Sim root folder
ARG ISAACSIM_ROOT_PATH_ARG
ENV ISAACSIM_ROOT_PATH=\${ISAACSIM_ROOT_PATH_ARG}
# Path to the Isaac Lab directory
ARG ISAACLAB_PATH_ARG
ENV ISAACLAB_PATH=\${ISAACLAB_PATH_ARG}
# Home dir of docker user, typically '/root'
ARG DOCKER_USER_HOME_ARG
ENV DOCKER_USER_HOME=\${DOCKER_USER_HOME_ARG}

# Set environment variables
ENV LANG=C.UTF-8
ENV DEBIAN_FRONTEND=noninteractive

USER root

# Install dependencies and remove cache
RUN --mount=type=cache,target=/var/cache/apt \\
    apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    cmake \\
    git \\
    libglib2.0-0 \\
    ncurses-term \\
    wget && \\
    apt -y autoremove && apt clean autoclean && \\
    rm -rf /var/lib/apt/lists/*

# Detect Ubuntu version and install CUDA 12.8 via NVIDIA network repo (cuda-keyring)
RUN set -euo pipefail && \\
    . /etc/os-release && \\
    case "$ID" in \\
      ubuntu) \\
        case "$VERSION_ID" in \\
          "20.04") cuda_repo="ubuntu2004";; \\
          "22.04") cuda_repo="ubuntu2204";; \\
          "24.04") cuda_repo="ubuntu2404";; \\
          *) echo "Unsupported Ubuntu $VERSION_ID"; exit 1;; \\
        esac ;; \\
      *) echo "Unsupported base OS: $ID"; exit 1 ;; \\
    esac && \\
    apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates && \\
    wget -q https://developer.download.nvidia.com/compute/cuda/repos/\${cuda_repo}/x86_64/cuda-keyring_1.1-1_all.deb && \\
    dpkg -i cuda-keyring_1.1-1_all.deb && \\
    rm -f cuda-keyring_1.1-1_all.deb && \\
    wget -q https://developer.download.nvidia.com/compute/cuda/repos/\${cuda_repo}/x86_64/cuda-\${cuda_repo}.pin && \\
    mv cuda-\${cuda_repo}.pin /etc/apt/preferences.d/cuda-repository-pin-600 && \\
    apt-get update && \\
    apt-get install -y --no-install-recommends \\
        cuda-toolkit-12-8 \\
        libcudnn9-cuda-12 \\
        libcusparselt0 \\
        libnccl2 \\
        libnccl-dev \\
        libnvjitlink-12-8 && \\
    apt-get -y autoremove && apt-get clean && rm -rf /var/lib/apt/lists/*


ENV CUDA_HOME=/usr/local/cuda-12.8
ENV PATH=\${CUDA_HOME}/bin:\${PATH}
ENV LD_LIBRARY_PATH=\${CUDA_HOME}/lib64:\${LD_LIBRARY_PATH}
ENV TORCH_CUDA_ARCH_LIST=8.0+PTX

# Copy the Isaac Lab directory (files to exclude are defined in .dockerignore)
COPY ../ \${ISAACLAB_PATH}

# Ensure isaaclab.sh has execute permissions
RUN chmod +x \${ISAACLAB_PATH}/isaaclab.sh

# Set up a symbolic link between the installed Isaac Sim root folder and _isaac_sim in the Isaac Lab directory
RUN ln -sf \${ISAACSIM_ROOT_PATH} \${ISAACLAB_PATH}/_isaac_sim

# Install toml dependency
RUN \${ISAACLAB_PATH}/isaaclab.sh -p -m pip install toml

# Install apt dependencies for extensions that declare them in their extension.toml
RUN --mount=type=cache,target=/var/cache/apt \\
    \${ISAACLAB_PATH}/isaaclab.sh -p \${ISAACLAB_PATH}/tools/install_deps.py apt \${ISAACLAB_PATH}/source && \\
    apt -y autoremove && apt clean autoclean && \\
    rm -rf /var/lib/apt/lists/*

# for singularity usage, have to create the directories that will binded
RUN mkdir -p \${ISAACSIM_ROOT_PATH}/kit/cache && \\
    mkdir -p \${DOCKER_USER_HOME}/.cache/ov && \\
    mkdir -p \${DOCKER_USER_HOME}/.cache/pip && \\
    mkdir -p \${DOCKER_USER_HOME}/.cache/nvidia/GLCache &&  \\
    mkdir -p \${DOCKER_USER_HOME}/.nv/ComputeCache && \\
    mkdir -p \${DOCKER_USER_HOME}/.nvidia-omniverse/logs && \\
    mkdir -p \${DOCKER_USER_HOME}/.local/share/ov/data && \\
    mkdir -p \${DOCKER_USER_HOME}/Documents

# for singularity usage, create NVIDIA binary placeholders
RUN touch /bin/nvidia-smi && \\
    touch /bin/nvidia-debugdump && \\
    touch /bin/nvidia-persistenced && \\
    touch /bin/nvidia-cuda-mps-control && \\
    touch /bin/nvidia-cuda-mps-server && \\
    touch /etc/localtime && \\
    mkdir -p /var/run/nvidia-persistenced && \\
    touch /var/run/nvidia-persistenced/socket

# HACK: Remove pre-bundled torch BEFORE installing Isaac Lab dependencies.
# This forces isaaclab.sh --install to install torch fresh to site-packages,
# rather than skipping because it detects the pre-bundled version.
RUN rm -rf \${ISAACSIM_ROOT_PATH}/exts/omni.isaac.ml_archive/pip_prebundle/torch*

# installing Isaac Lab dependencies
# use pip caching to avoid reinstalling large packages
RUN --mount=type=cache,target=\${DOCKER_USER_HOME}/.cache/pip \\
    \${ISAACLAB_PATH}/isaaclab.sh --install

# HACK: Uninstall quadprog as it causes issues with some reinforcement learning frameworks
RUN \${ISAACLAB_PATH}/isaaclab.sh -p -m pip uninstall -y quadprog

# Install cuRobo from source (pinned commit); needs CUDA env and Torch
RUN \${ISAACLAB_PATH}/isaaclab.sh -p -m pip install --no-build-isolation \\
    "nvidia-curobo @ git+https://github.com/NVlabs/curobo.git@ebb71702f3f70e767f40fd8e050674af0288abe8"

# aliasing isaaclab.sh and python for convenience
RUN echo "export ISAACLAB_PATH=\${ISAACLAB_PATH}" >> \${HOME}/.bashrc && \\
    echo "alias isaaclab=\${ISAACLAB_PATH}/isaaclab.sh" >> \${HOME}/.bashrc && \\
    echo "alias python=\${ISAACLAB_PATH}/_isaac_sim/python.sh" >> \${HOME}/.bashrc && \\
    echo "alias python3=\${ISAACLAB_PATH}/_isaac_sim/python.sh" >> \${HOME}/.bashrc && \\
    echo "alias pip='\${ISAACLAB_PATH}/_isaac_sim/python.sh -m pip'" >> \${HOME}/.bashrc && \\
    echo "alias pip3='\${ISAACLAB_PATH}/_isaac_sim/python.sh -m pip'" >> \${HOME}/.bashrc && \\
    echo "alias tensorboard='\${ISAACLAB_PATH}/_isaac_sim/python.sh \${ISAACLAB_PATH}/_isaac_sim/tensorboard'" >> \${HOME}/.bashrc && \\
    echo "export TZ=$(date +%Z)" >> \${HOME}/.bashrc && \\
    echo "shopt -s histappend" >> /root/.bashrc && \\
    echo "PROMPT_COMMAND='history -a'" >> /root/.bashrc

# make working directory as the Isaac Lab directory
# this is the default directory when the container is run
WORKDIR \${ISAACLAB_PATH}
`,
    issues: [
      {
        lines: [],
        title: 'cuRobo pinned to a specific commit SHA — will not receive security patches',
        severity: 'medium',
        description: 'Installing cuRobo at `git+https://github.com/NVlabs/curobo.git@ebb71702...` pins to an exact commit. Security fixes or compatibility patches in cuRobo are not picked up until the SHA is manually updated.',
        fix: 'Establish a process to periodically review cuRobo releases and update the pinned SHA. Consider using a git tag instead of a raw SHA for better human readability.',
      },
      {
        lines: [],
        title: '`--mount=type=cache` for pip not scoped to Python version',
        severity: 'medium',
        description: 'The pip cache mount `target=${DOCKER_USER_HOME}/.cache/pip` is not scoped by Python version or platform. If the Dockerfile is rebuilt with a different Python version, the cache may serve wheels built for the wrong interpreter.',
        fix: 'Scope the cache: `--mount=type=cache,target=/root/.cache/pip,id=pip-${PYTHON_VERSION}` where PYTHON_VERSION is a build arg.',
      },
    ],
    qa: [
      {
        q: 'Why does the Dockerfile remove torch from Isaac Sim before installing cuRobo?',
        a: 'Isaac Sim bundles its own PyTorch build in `${ISAACSIM_ROOT_PATH}/exts/omni.isaac.ml_archive/pip_prebundle/torch*`. cuRobo requires a specific PyTorch version built with CUDA 12.8 support. If the bundled torch is not removed first, pip would see two torch installations on sys.path, causing import conflicts. The `rm -rf .../torch*` step removes the bundled version so pip can install the correct one.',
      },
      {
        q: 'What does `TORCH_CUDA_ARCH_LIST=8.0+PTX` mean and why is it set for cuRobo?',
        a: '`8.0` is the compute capability for Ampere GPUs (A100, RTX 3090). `+PTX` includes PTX IR which the CUDA JIT compiler can compile at runtime for newer architectures. Setting this before building cuRobo tells PyTorch/CuPy to compile CUDA extensions only for Ampere and above, reducing build time. At runtime, GPUs newer than Ampere use the PTX fallback path.',
      },
      {
        q: 'Why does the Dockerfile touch /bin/nvidia-smi and related NVIDIA files?',
        a: 'Some Isaac Sim components and license checks expect NVIDIA driver utilities to exist on the PATH. In a Docker build environment without GPU passthrough (common in CI image builds), these binaries do not exist. Touching empty stub files prevents "command not found" errors during the Isaac Lab install step. Actual GPU access at runtime is provided by the NVIDIA Container Toolkit (`--gpus all`), not by these stubs.',
      },
    ],
  },
  {
    id: 'docker-x11-yaml',
    filename: 'docker/x11.yaml',
    title: 'Docker X11 Forwarding Overlay',
    cat: 'DevOps',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['Docker Compose', 'X11 Forwarding', 'Display Server', 'Volume Mounts'],
    summary: 'Docker Compose override that adds X11 display forwarding environment variables and socket mounts to the base and ROS2 services for GUI passthrough.',
    explain: [
      'A compose overlay file merged via `-f x11.yaml` flag on top of the main docker-compose.yaml',
      'Adds DISPLAY, TERM, QT_X11_NO_MITSHM=1, and XAUTHORITY env vars to both base and ROS2 services',
      'Mounts the temp .Xauthority cookie file, /tmp/.X11-unix socket, and /etc/localtime (read-only)',
      '`QT_X11_NO_MITSHM=1` disables Qt Shared Memory X11 extension which is broken inside containers'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

services:
  isaac-lab-base:
    environment:
      - DISPLAY
      - TERM
      - QT_X11_NO_MITSHM=1
      - XAUTHORITY=\${__ISAACLAB_TMP_XAUTH}
    volumes:
    - type: bind
      source: \${__ISAACLAB_TMP_DIR}
      target: \${__ISAACLAB_TMP_DIR}
    - type: bind
      source: /tmp/.X11-unix
      target: /tmp/.X11-unix
    - type: bind
      source: /etc/localtime
      target: /etc/localtime
      read_only: true

  isaac-lab-ros2:
    environment:
      - DISPLAY
      - TERM
      - QT_X11_NO_MITSHM=1
      - XAUTHORITY=\${__ISAACLAB_TMP_XAUTH}
    volumes:
    - type: bind
      source: \${__ISAACLAB_TMP_DIR}
      target: \${__ISAACLAB_TMP_DIR}
    - type: bind
      source: /tmp/.X11-unix
      target: /tmp/.X11-unix
    - type: bind
      source: /etc/localtime
      target: /etc/localtime
      read_only: true
`,
    issues: [
      {
        lines: [],
        title: 'Mounting /tmp/.X11-unix exposes all X11 sockets to the container',
        severity: 'medium',
        description: 'Bind-mounting `/tmp/.X11-unix` exposes ALL running X11 display sockets (:0, :1, etc.) to the container, not just the one used by Isaac Sim. A compromised container process could connect to other display sockets.',
        fix: 'For security-sensitive environments, scope to only the specific socket: `-v /tmp/.X11-unix/X0:/tmp/.X11-unix/X0:ro`. For development use cases, the current approach is standard practice.',
      },
    ],
    qa: [
      {
        q: 'What is the XAUTHORITY environment variable used for in X11 forwarding?',
        a: 'X11 uses MIT-MAGIC-COOKIE-1 authentication. The .Xauthority file (path stored in XAUTHORITY) contains the cookie that an X client must present to the X server to be allowed to open a display connection. `x11_utils.py` creates a temp .Xauthority file using `xauth extract` with the current display cookie and mounts it into the container. Without this, the container process would be rejected with "No protocol specified".',
      },
      {
        q: 'Why is QT_X11_NO_MITSHM=1 required inside containers?',
        a: 'Qt\'s X11 backend uses the MIT-SHM (Shared Memory) extension to speed up rendering by sharing memory pages with the X server. Inside a container, the kernel shared memory (IPC namespace) is isolated by default — the container cannot access the host\'s SHM segments. Qt would crash with `X Error: BadAccess`. Setting `QT_X11_NO_MITSHM=1` forces Qt to use the standard (slower) X11 protocol path instead.',
      },
    ],
  },
  {
    id: 'action-run-tests-yml',
    filename: '.github/actions/run-tests/action.yml',
    title: 'Run Tests Composite Action',
    cat: 'CI/CD',
    diff: 'hard',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'Composite Actions', 'Docker', 'pytest', 'JUnit XML', 'GPU Testing'],
    summary: 'Composite action that runs pytest inside a GPU Docker container with filter/exclude pattern support, robust result-copy fallback, and memory/CPU limit isolation.',
    explain: [
      'A single shell step wrapping a Bash function `run_tests()` that takes 7 parameters',
      'Creates reports directory, removes any existing container with the same name, then docker run with GPU passthrough and resource limits (90% RAM, 90% CPUs)',
      'Filter pattern supports positive (include) and negative (`not pattern`) matching via string prefix check',
      'Three-tier result copy fallback: exact file → directory copy → synthetic XML on container crash',
      'pytest exit code is ignored — the JUnit XML file is the source of truth for pass/fail'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: 'Run Tests in Docker Container'
description: 'Runs pytest tests in a Docker container with GPU support and result collection'

inputs:
  test-path:
    description: 'Path to test directory or pytest arguments'
    required: true
  result-file:
    description: 'Name of the result XML file'
    required: true
  container-name:
    description: 'Name for the Docker container'
    required: true
  image-tag:
    description: 'Docker image tag to use'
    required: true
  reports-dir:
    description: 'Directory to store test results'
    default: 'reports'
    required: false
  pytest-options:
    description: 'Additional pytest options (e.g., -k filter)'
    default: ''
    required: false
  filter-pattern:
    description: 'Pattern to filter test files (e.g., isaaclab_tasks)'
    default: ''
    required: false

runs:
  using: composite
  steps:
    - name: Run Tests in Docker Container
      shell: bash
      run: |
        # Function to run tests in Docker container
        run_tests() {
          local test_path="$1"
          local result_file="$2"
          local container_name="$3"
          local image_tag="$4"
          local reports_dir="$5"
          local pytest_options="$6"
          local filter_pattern="$7"

          echo "Running tests in: $test_path"
          if [ -n "$pytest_options" ]; then
            echo "With pytest options: $pytest_options"
          fi
          if [ -n "$filter_pattern" ]; then
            echo "With filter pattern: $filter_pattern"
          fi

          # Create reports directory
          mkdir -p "$reports_dir"

          # Clean up any existing container
          docker rm -f $container_name 2>/dev/null || true

          # Build Docker environment variables
          docker_env_vars="\\
            -e OMNI_KIT_ACCEPT_EULA=yes \\
            -e ACCEPT_EULA=Y \\
            -e OMNI_KIT_DISABLE_CUP=1 \\
            -e ISAAC_SIM_HEADLESS=1 \\
            -e ISAAC_SIM_LOW_MEMORY=1 \\
            -e PYTHONUNBUFFERED=1 \\
            -e PYTHONIOENCODING=utf-8 \\
            -e TEST_RESULT_FILE=$result_file"

          if [ -n "$filter_pattern" ]; then
            if [[ "$filter_pattern" == not* ]]; then
              # Handle "not pattern" case
              exclude_pattern="\${filter_pattern#not }"
              docker_env_vars="$docker_env_vars -e TEST_EXCLUDE_PATTERN=$exclude_pattern"
              echo "Setting exclude pattern: $exclude_pattern"
            else
              # Handle positive pattern case
              docker_env_vars="$docker_env_vars -e TEST_FILTER_PATTERN=$filter_pattern"
              echo "Setting include pattern: $filter_pattern"
            fi
          else
            echo "No filter pattern provided"
          fi

          echo "Docker environment variables: '$docker_env_vars'"

          # Run tests in container with error handling
          echo "🚀 Starting Docker container for tests..."
          if docker run --name $container_name \\
            --entrypoint bash --gpus all --network=host \\
            --security-opt=no-new-privileges:true \\
            --memory=$(echo "$(free -m | awk '/^Mem:/{print $2}') * 0.9 / 1" | bc)m \\
            --cpus=$(echo "$(nproc) * 0.9" | bc) \\
            --oom-kill-disable=false \\
            --ulimit nofile=65536:65536 \\
            --ulimit nproc=4096:4096 \\
            $docker_env_vars \\
            $image_tag \\
            -c "
              set -e
              cd /workspace/isaaclab
              mkdir -p tests
              echo 'Starting pytest with path: $test_path'
              /isaac-sim/python.sh -m pytest --ignore=tools/conftest.py $test_path $pytest_options -v --junitxml=tests/$result_file || echo 'Pytest completed with exit code: $?'
            "; then
            echo "✅ Docker container completed successfully"
          else
            echo "⚠️ Docker container failed, but continuing to copy results..."
          fi

          # Copy test results with error handling
          echo "📋 Attempting to copy test results..."
          if docker cp $container_name:/workspace/isaaclab/tests/$result_file "$reports_dir/$result_file" 2>/dev/null; then
            echo "✅ Test results copied successfully"
          else
            echo "❌ Failed to copy specific result file, trying to copy all test results..."
            if docker cp $container_name:/workspace/isaaclab/tests/ "$reports_dir/" 2>/dev/null; then
              echo "✅ All test results copied successfully"
              # Look for any XML files and use the first one found
              if [ -f "$reports_dir/full_report.xml" ]; then
                mv "$reports_dir/full_report.xml" "$reports_dir/$result_file"
                echo "✅ Found and renamed full_report.xml to $result_file"
              elif [ -f "$reports_dir/test-reports-"*".xml" ]; then
                # Combine individual test reports if no full report exists
                echo "📊 Combining individual test reports..."
                echo '<?xml version="1.0" encoding="utf-8"?><testsuites>' > "$reports_dir/$result_file"
                for xml_file in "$reports_dir"/test-reports-*.xml; do
                  if [ -f "$xml_file" ]; then
                    echo "  Processing: $xml_file"
                    sed '1d; /^<testsuite/d; /^<\\/testsuite/d' "$xml_file" >> "$reports_dir/$result_file" 2>/dev/null || true
                  fi
                done
                echo '</testsuites>' >> "$reports_dir/$result_file"
                echo "✅ Combined individual test reports into $result_file"
              else
                echo "❌ No test result files found, creating fallback"
                echo "<?xml version=\\"1.0\\" encoding=\\"utf-8\\"?><testsuite name=\\"$container_name\\" tests=\\"0\\" failures=\\"0\\" errors=\\"1\\" time=\\"0\\"><testcase classname=\\"setup\\" name=\\"no_results_found\\"><error message=\\"No test results found\\">Container may have failed to generate any results</error></testcase></testsuite>" > "$reports_dir/$result_file"
              fi
            else
              echo "❌ Failed to copy any test results, creating fallback"
              echo "<?xml version=\\"1.0\\" encoding=\\"utf-8\\"?><testsuite name=\\"$container_name\\" tests=\\"0\\" failures=\\"0\\" errors=\\"1\\" time=\\"0\\"><testcase classname=\\"setup\\" name=\\"copy_failed\\"><error message=\\"Failed to copy test results\\">Container may have failed to generate results</error></testcase></testsuite>" > "$reports_dir/$result_file"
            fi
          fi

          # Clean up container
          echo "🧹 Cleaning up Docker container..."
          docker rm $container_name 2>/dev/null || echo "⚠️ Container cleanup failed, but continuing..."
        }

        # Call the function with provided parameters
        run_tests "\${{ inputs.test-path }}" "\${{ inputs.result-file }}" "\${{ inputs.container-name }}" "\${{ inputs.image-tag }}" "\${{ inputs.reports-dir }}" "\${{ inputs.pytest-options }}" "\${{ inputs.filter-pattern }}"
`,
    issues: [
      {
        lines: [],
        title: 'Memory limit uses `bc` float arithmetic — may not be available on all runners',
        severity: 'high',
        description: '`$(echo "$(free -m | awk ...) * 0.9 / 1" | bc)m` uses `bc` for floating point. `bc` is not installed by default on all Linux distros. If missing, the `--memory=` flag gets an empty value and Docker silently ignores it or errors.',
        fix: 'Use Bash integer arithmetic: `TOTAL_MEM=$(free -m | awk \'/^Mem:/{print $2}\'); MEM_LIMIT=$(( TOTAL_MEM * 9 / 10 ))`',
      },
      {
        lines: [],
        title: 'Container name collision if two matrix jobs run same test in parallel',
        severity: 'medium',
        description: 'If two matrix jobs with the same `container-name` input run simultaneously on the same runner, they will conflict on the container name despite the `docker rm -f` at the start.',
        fix: 'Append a random suffix to the container name: `container_name="$3-$(head -c 8 /dev/urandom | xxd -p)"` to make it unique per run.',
      },
    ],
    qa: [
      {
        q: 'Why does the action ignore pytest exit code and rely on JUnit XML instead?',
        a: 'pytest exits non-zero when tests fail, but also when the container setup fails (missing GPU, bad EULA, OOM). The action uses `|| echo \'Pytest completed with exit code: $?\'` to never fail the Docker run on pytest exit codes. Instead it relies on JUnit XML to report actual test results. This means container/setup errors are reported as synthetic XML error entries rather than causing the entire step to fail with a generic "error".',
      },
      {
        q: 'What does the three-tier result copy fallback protect against?',
        a: 'Tier 1: copy specific result file — normal path, works when pytest ran successfully. Tier 2: copy the entire tests/ directory — works when pytest created multiple report files. Tier 3: synthetic XML — covers cases where the container crashed before creating any XML (OOM, CUDA initialization failure, missing driver). Without tier 3, a container crash would cause the step to succeed with no test results, making the failure invisible.',
      },
    ],
  },
  {
    id: 'action-combine-results-yml',
    filename: '.github/actions/combine-results/action.yml',
    title: 'Combine XML Test Results Action',
    cat: 'CI/CD',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['GitHub Actions', 'Composite Actions', 'JUnit XML', 'Shell Scripting', 'CI Reporting'],
    summary: 'Composite action that merges multiple JUnit XML test result files into a single `<testsuites>` document for unified CI reporting.',
    explain: [
      'A single POSIX shell step (using sh not bash) for maximum runner compatibility',
      'Finds all .xml files under the tests directory, streams each through sed to strip XML declarations and root tags',
      'Wraps all content in a new <testsuites> root element for unified reporting',
      'Handles missing directory and empty results with synthetic fallback XML entries'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

name: 'Combine XML Test Results'
description: 'Combines multiple XML test result files into a single file'

inputs:
  tests-dir:
    description: 'Directory containing test result files'
    default: 'tests'
    required: false
  output-file:
    description: 'Output combined XML file path'
    required: true
  reports-dir:
    description: 'Directory to store the combined results'
    default: 'reports'
    required: false

runs:
  using: composite
  steps:
    - name: Combine XML Test Results
      shell: sh
      run: |
        # Function to combine multiple XML test results
        combine_xml_results() {
          local tests_dir="$1"
          local output_file="$2"
          local reports_dir="$3"

          echo "Combining test results from: $tests_dir"
          echo "Output file: $output_file"
          echo "Reports directory: $reports_dir"

          # Check if reports directory exists
          if [ ! -d "$reports_dir" ]; then
            echo "⚠️ Reports directory does not exist: $reports_dir"
            mkdir -p "$reports_dir"
          fi

          # Check if tests directory exists
          if [ ! -d "$tests_dir" ]; then
            echo "⚠️ Tests directory does not exist: $tests_dir"
            echo "Creating fallback XML..."
            echo '<?xml version="1.0" encoding="utf-8"?><testsuite name="combined" tests="0" failures="0" errors="1" time="0"><testcase classname="setup" name="no_tests_dir"><error message="Tests directory not found">Tests directory was not found</error></testcase></testsuite>' > "$output_file"
            return
          fi

          # Find all XML files in the tests directory
          echo "Searching for XML files in: $tests_dir"
          xml_files=$(find "$tests_dir" -name "*.xml" -type f 2>/dev/null | sort)

          if [ -z "$xml_files" ]; then
            echo "⚠️ No XML files found in: $tests_dir"
            echo "Creating fallback XML..."
            echo '<?xml version="1.0" encoding="utf-8"?><testsuite name="combined" tests="0" failures="0" errors="1" time="0"><testcase classname="setup" name="no_xml_files"><error message="No XML files found">No XML test result files were found</error></testcase></testsuite>' > "$output_file"
            return
          fi

          # Count XML files found
          file_count=$(echo "$xml_files" | wc -l)
          echo "✅ Found $file_count XML file(s):"
          echo "$xml_files" | while read -r file; do
            echo "  - $file ($(wc -c < "$file") bytes)"
          done

          # Create combined XML
          echo "🔄 Combining $file_count XML files..."
          echo '<?xml version="1.0" encoding="utf-8"?>' > "$output_file"
          echo '<testsuites>' >> "$output_file"

          # Process each XML file
          combined_count=0
          echo "$xml_files" | while read -r file; do
            if [ -f "$file" ]; then
              echo "  Processing: $file"
              # Remove XML declaration and outer testsuites wrapper from each file
              # Remove first line (XML declaration) and strip outer <testsuites>/</testsuites> tags
              sed '1d; s/^<testsuites>//; s/<\\/testsuites>$//' "$file" >> "$output_file" 2>/dev/null || {
                echo "  ⚠️ Warning: Could not process $file, skipping..."
              }
              combined_count=$((combined_count + 1))
            fi
          done

          echo '</testsuites>' >> "$output_file"
          echo "✅ Successfully combined $combined_count files into: $output_file"

          # Verify output file was created
          if [ -f "$output_file" ]; then
            echo "✅ Final output file created: $output_file"
            echo "📊 Output file size: $(wc -c < "$output_file") bytes"
          else
            echo "❌ Failed to create output file: $output_file"
            exit 1
          fi
        }

        # Call the function with provided parameters
        combine_xml_results "\${{ inputs.tests-dir }}" "\${{ inputs.output-file }}" "\${{ inputs.reports-dir }}"
`,
    issues: [
      {
        lines: [],
        title: 'sed strip logic may corrupt nested <testsuites> tags',
        severity: 'medium',
        description: '`sed \'s/^<testsuites>//; s/<\\/testsuites>$//\'` strips the root <testsuites> wrapper with line-anchored matching. If a JUnit reporter writes `<testsuites><testsuite ...` on one line, the regex fails and produces malformed XML.',
        fix: 'Use a more robust approach: parse with Python\'s xml.etree.ElementTree, or use `xmllint --xpath \'//testsuite\'` to extract just the inner elements.',
      },
    ],
    qa: [
      {
        q: 'Why use /bin/sh instead of bash in this action?',
        a: 'This action may run on various runner images including Ubuntu, macOS, and potentially Windows. `/bin/sh` is guaranteed to exist on all POSIX-compliant systems. Using `shell: sh` also catches accidental use of bash-isms (arrays, `[[`, process substitution) that would fail on strict sh.',
      },
      {
        q: 'What happens if the combined XML is malformed?',
        a: 'Most GitHub Actions test reporters use lenient XML parsers. Malformed XML typically causes the reporter step to fail with a parse error, making test results invisible in the PR summary. The CI job itself may still pass if `continue-on-error: true` is set. But engineers lose visibility — a malformed combined report is worse than no report because it silently hides test failures.',
      },
    ],
  },
  {
    id: 'tools-conftest-py',
    filename: 'tools/conftest.py',
    title: 'pytest conftest — Parallel Test Runner',
    cat: 'Testing',
    diff: 'hard',
    lang: 'python',
    jdSkills: ['pytest', 'subprocess', 'JUnit XML', 'PrettyTable', 'Non-blocking I/O', 'fcntl'],
    summary: 'Custom pytest conftest.py that intercepts session startup, runs each test file as a separate subprocess with timeout handling and real-time output streaming, then aggregates JUnit XML reports.',
    explain: [
      'Overrides `pytest_ignore_collect` to skip normal collection and `pytest_sessionstart` to take full control of execution',
      'Discovers test files under scripts/ and source/ filtered by TEST_FILTER_PATTERN / TEST_EXCLUDE_PATTERN env vars',
      'Runs each test file via subprocess.Popen with non-blocking I/O (fcntl on Unix) for real-time streaming',
      'Per-test timeouts come from test_settings.PER_TEST_TIMEOUTS; timeout cases generate synthetic JUnit XML with captured stdout/stderr',
      'After all tests run, aggregates per-test XML files into full_report.xml and prints a PrettyTable summary'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

import contextlib
import os
import select
import subprocess
import sys
import time

import pytest
from junitparser import Error, JUnitXml, TestCase, TestSuite
from prettytable import PrettyTable

# Local imports
import test_settings as test_settings  # isort: skip


def pytest_ignore_collect(collection_path, config):
    # Skip collection and run each test script individually
    return True


def capture_test_output_with_timeout(cmd, timeout, env):
    """Run a command with timeout and capture all output while streaming in real-time."""
    stdout_data = b""
    stderr_data = b""

    try:
        # Use Popen to capture output in real-time
        process = subprocess.Popen(
            cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0, universal_newlines=False
        )

        # Set up file descriptors for non-blocking reads
        stdout_fd = process.stdout.fileno()
        stderr_fd = process.stderr.fileno()

        # Set non-blocking mode (Unix systems only)
        try:
            import fcntl

            for fd in [stdout_fd, stderr_fd]:
                flags = fcntl.fcntl(fd, fcntl.F_GETFL)
                fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        except ImportError:
            # fcntl not available on Windows, use a simpler approach
            pass

        start_time = time.time()

        while process.poll() is None:
            # Check for timeout
            if time.time() - start_time > timeout:
                process.kill()
                try:
                    remaining_stdout, remaining_stderr = process.communicate(timeout=5)
                    stdout_data += remaining_stdout
                    stderr_data += remaining_stderr
                except subprocess.TimeoutExpired:
                    process.terminate()
                    remaining_stdout, remaining_stderr = process.communicate(timeout=1)
                    stdout_data += remaining_stdout
                    stderr_data += remaining_stderr
                return -1, stdout_data, stderr_data, True  # -1 indicates timeout

            # Check for available output
            try:
                ready_fds, _, _ = select.select([stdout_fd, stderr_fd], [], [], 0.1)

                for fd in ready_fds:
                    with contextlib.suppress(OSError):
                        if fd == stdout_fd:
                            chunk = process.stdout.read(1024)
                            if chunk:
                                stdout_data += chunk
                                # Print to stdout in real-time
                                sys.stdout.buffer.write(chunk)
                                sys.stdout.buffer.flush()
                        elif fd == stderr_fd:
                            chunk = process.stderr.read(1024)
                            if chunk:
                                stderr_data += chunk
                                # Print to stderr in real-time
                                sys.stderr.buffer.write(chunk)
                                sys.stderr.buffer.flush()
            except OSError:
                # select failed, fall back to simple polling
                time.sleep(0.1)
                continue

        # Get any remaining output
        remaining_stdout, remaining_stderr = process.communicate()
        stdout_data += remaining_stdout
        stderr_data += remaining_stderr

        return process.returncode, stdout_data, stderr_data, False

    except Exception as e:
        return -1, str(e).encode(), b"", False


def create_timeout_test_case(test_file, timeout, stdout_data, stderr_data):
    """Create a test case entry for a timeout test with captured logs."""
    test_suite = TestSuite(name=f"timeout_{os.path.splitext(os.path.basename(test_file))[0]}")
    test_case = TestCase(name="test_execution", classname=os.path.splitext(os.path.basename(test_file))[0])

    # Create error message with timeout info and captured logs
    error_msg = f"Test timed out after {timeout} seconds"

    # Add captured output to error details
    details = f"Timeout after {timeout} seconds\\n\\n"

    if stdout_data:
        details += "=== STDOUT ===\\n"
        details += stdout_data.decode("utf-8", errors="replace") + "\\n"

    if stderr_data:
        details += "=== STDERR ===\\n"
        details += stderr_data.decode("utf-8", errors="replace") + "\\n"

    error = Error(message=error_msg)
    error.text = details
    test_case.result = error

    test_suite.add_testcase(test_case)
    return test_suite


def run_individual_tests(test_files, workspace_root, isaacsim_ci):
    """Run each test file separately, ensuring one finishes before starting the next."""
    failed_tests = []
    test_status = {}

    for test_file in test_files:
        print(f"\\n\\n🚀 Running {test_file} independently...\\n")
        # get file name from path
        file_name = os.path.basename(test_file)
        env = os.environ.copy()

        # Determine timeout for this test
        timeout = test_settings.PER_TEST_TIMEOUTS.get(file_name, test_settings.DEFAULT_TIMEOUT)

        # Prepare command
        # Note: Command options matter as they are used for cleanups inside AppLauncher
        cmd = [
            sys.executable,
            "-m",
            "pytest",
            "--no-header",
            f"--config-file={workspace_root}/pyproject.toml",
            f"--junitxml=tests/test-reports-{str(file_name)}.xml",
            "--tb=short",
        ]

        if isaacsim_ci:
            cmd.append("-m")
            cmd.append("isaacsim_ci")

        # Add the test file path last
        cmd.append(str(test_file))

        # Run test with timeout and capture output
        returncode, stdout_data, stderr_data, timed_out = capture_test_output_with_timeout(cmd, timeout, env)

        if timed_out:
            print(f"Test {test_file} timed out after {timeout} seconds...")
            failed_tests.append(test_file)

            # Create a special XML report for timeout tests with captured logs
            timeout_suite = create_timeout_test_case(test_file, timeout, stdout_data, stderr_data)
            timeout_report = JUnitXml()
            timeout_report.add_testsuite(timeout_suite)

            # Write timeout report
            report_file = f"tests/test-reports-{str(file_name)}.xml"
            timeout_report.write(report_file)

            test_status[test_file] = {
                "errors": 1,
                "failures": 0,
                "skipped": 0,
                "tests": 1,
                "result": "TIMEOUT",
                "time_elapsed": timeout,
            }
            continue

        if returncode != 0:
            failed_tests.append(test_file)

        # check report for any failures
        report_file = f"tests/test-reports-{str(file_name)}.xml"
        if not os.path.exists(report_file):
            print(f"Warning: Test report not found at {report_file}")
            failed_tests.append(test_file)
            test_status[test_file] = {
                "errors": 1,  # Assume error since we can't read the report
                "failures": 0,
                "skipped": 0,
                "tests": 0,
                "result": "FAILED",
                "time_elapsed": 0.0,
            }
            continue

        try:
            report = JUnitXml.fromfile(report_file)

            # Rename test suites to be more descriptive
            for suite in report:
                if suite.name == "pytest":
                    # Remove .py extension and use the filename as the test suite name
                    suite_name = os.path.splitext(file_name)[0]
                    suite.name = suite_name

            # Write the updated report back
            report.write(report_file)

            # Parse the integer values with None handling
            errors = int(report.errors) if report.errors is not None else 0
            failures = int(report.failures) if report.failures is not None else 0
            skipped = int(report.skipped) if report.skipped is not None else 0
            tests = int(report.tests) if report.tests is not None else 0
            time_elapsed = float(report.time) if report.time is not None else 0.0
        except Exception as e:
            print(f"Error reading test report {report_file}: {e}")
            failed_tests.append(test_file)
            test_status[test_file] = {
                "errors": 1,
                "failures": 0,
                "skipped": 0,
                "tests": 0,
                "result": "FAILED",
                "time_elapsed": 0.0,
            }
            continue

        # Check if there were any failures
        if errors > 0 or failures > 0:
            failed_tests.append(test_file)

        test_status[test_file] = {
            "errors": errors,
            "failures": failures,
            "skipped": skipped,
            "tests": tests,
            "result": "FAILED" if errors > 0 or failures > 0 else "passed",
            "time_elapsed": time_elapsed,
        }

    print("~~~~~~~~~~~~ Finished running all tests")

    return failed_tests, test_status


def pytest_sessionstart(session):
    """Intercept pytest startup to execute tests in the correct order."""
    # Get the workspace root directory (one level up from tools)
    workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    source_dirs = [
        os.path.join(workspace_root, "scripts"),
        os.path.join(workspace_root, "source"),
    ]

    # Get filter pattern from environment variable or command line
    filter_pattern = os.environ.get("TEST_FILTER_PATTERN", "")
    exclude_pattern = os.environ.get("TEST_EXCLUDE_PATTERN", "")

    isaacsim_ci = os.environ.get("ISAACSIM_CI_SHORT", "false") == "true"

    # Also try to get from pytest config
    if hasattr(session.config, "option") and hasattr(session.config.option, "filter_pattern"):
        filter_pattern = filter_pattern or getattr(session.config.option, "filter_pattern", "")
    if hasattr(session.config, "option") and hasattr(session.config.option, "exclude_pattern"):
        exclude_pattern = exclude_pattern or getattr(session.config.option, "exclude_pattern", "")

    print("=" * 50)
    print("CONFTEST.PY DEBUG INFO")
    print("=" * 50)
    print(f"Filter pattern: '{filter_pattern}'")
    print(f"Exclude pattern: '{exclude_pattern}'")
    print(f"TEST_FILTER_PATTERN env var: '{os.environ.get('TEST_FILTER_PATTERN', 'NOT_SET')}'")
    print(f"TEST_EXCLUDE_PATTERN env var: '{os.environ.get('TEST_EXCLUDE_PATTERN', 'NOT_SET')}'")
    print("=" * 50)

    # Get all test files in the source directories
    test_files = []

    for source_dir in source_dirs:
        if not os.path.exists(source_dir):
            print(f"Error: source directory not found at {source_dir}")
            pytest.exit("Source directory not found", returncode=1)

        for root, _, files in os.walk(source_dir):
            for file in files:
                if file.startswith("test_") and file.endswith(".py"):
                    # Skip if the file is in TESTS_TO_SKIP
                    if file in test_settings.TESTS_TO_SKIP:
                        print(f"Skipping {file} as it's in the skip list")
                        continue

                    full_path = os.path.join(root, file)

                    # Apply include filter
                    if filter_pattern and filter_pattern not in full_path:
                        print(f"Skipping {full_path} (does not match include pattern: {filter_pattern})")
                        continue

                    # Apply exclude filter
                    if exclude_pattern and exclude_pattern in full_path:
                        print(f"Skipping {full_path} (matches exclude pattern: {exclude_pattern})")
                        continue

                    test_files.append(full_path)

    if isaacsim_ci:
        new_test_files = []
        for test_file in test_files:
            with open(test_file) as f:
                if "@pytest.mark.isaacsim_ci" in f.read():
                    new_test_files.append(test_file)
        test_files = new_test_files

    if not test_files:
        print("No test files found in source directory")
        pytest.exit("No test files found", returncode=1)

    print(f"Found {len(test_files)} test files after filtering:")
    for test_file in test_files:
        print(f"  - {test_file}")

    # Run all tests individually
    failed_tests, test_status = run_individual_tests(test_files, workspace_root, isaacsim_ci)

    print("failed tests:", failed_tests)

    # Collect reports
    print("~~~~~~~~~ Collecting final report...")

    # create new full report
    full_report = JUnitXml()
    # read all reports and merge them
    for report in os.listdir("tests"):
        if report.endswith(".xml"):
            print(report)
            report_file = JUnitXml.fromfile(f"tests/{report}")
            full_report += report_file
    print("~~~~~~~~~~~~ Writing final report...")
    # write content to full report
    result_file = os.environ.get("TEST_RESULT_FILE", "full_report.xml")
    full_report_path = f"tests/{result_file}"
    print(f"Using result file: {result_file}")
    full_report.write(full_report_path)
    print("~~~~~~~~~~~~ Report written to", full_report_path)

    # print test status in a nice table
    # Calculate the number and percentage of passing tests
    num_tests = len(test_status)
    num_passing = len([test_path for test_path in test_files if test_status[test_path]["result"] == "passed"])
    num_failing = len([test_path for test_path in test_files if test_status[test_path]["result"] == "FAILED"])
    num_timeout = len([test_path for test_path in test_files if test_status[test_path]["result"] == "TIMEOUT"])

    if num_tests == 0:
        passing_percentage = 100
    else:
        passing_percentage = num_passing / num_tests * 100

    # Print summaries of test results
    summary_str = "\\n\\n"
    summary_str += "===================\\n"
    summary_str += "Test Result Summary\\n"
    summary_str += "===================\\n"

    summary_str += f"Total: {num_tests}\\n"
    summary_str += f"Passing: {num_passing}\\n"
    summary_str += f"Failing: {num_failing}\\n"
    summary_str += f"Timeout: {num_timeout}\\n"
    summary_str += f"Passing Percentage: {passing_percentage:.2f}%\\n"

    # Print time elapsed in hours, minutes, seconds
    total_time = sum([test_status[test_path]["time_elapsed"] for test_path in test_files])

    summary_str += f"Total Time Elapsed: {total_time // 3600}h"
    summary_str += f"{total_time // 60 % 60}m"
    summary_str += f"{total_time % 60:.2f}s"

    summary_str += "\\n\\n=======================\\n"
    summary_str += "Per Test Result Summary\\n"
    summary_str += "=======================\\n"

    # Construct table of results per test
    per_test_result_table = PrettyTable(field_names=["Test Path", "Result", "Time (s)", "# Tests"])
    per_test_result_table.align["Test Path"] = "l"
    per_test_result_table.align["Time (s)"] = "r"
    for test_path in test_files:
        num_tests_passed = (
            test_status[test_path]["tests"]
            - test_status[test_path]["failures"]
            - test_status[test_path]["errors"]
            - test_status[test_path]["skipped"]
        )
        per_test_result_table.add_row(
            [
                test_path,
                test_status[test_path]["result"],
                f"{test_status[test_path]['time_elapsed']:0.2f}",
                f"{num_tests_passed}/{test_status[test_path]['tests']}",
            ]
        )

    summary_str += per_test_result_table.get_string()

    # Print summary to console and log file
    print(summary_str)

    # Exit pytest after custom execution to prevent normal pytest from overwriting our report
    pytest.exit("Custom test execution completed", returncode=0 if num_failing == 0 else 1)
`,
    issues: [
      {
        lines: [],
        title: 'fcntl non-blocking mode falls through silently on Windows',
        severity: 'medium',
        description: 'The `try: import fcntl` block sets non-blocking mode on Unix and silently skips it on Windows. But no simpler approach is implemented — on Windows, the select.select() call will still block.',
        fix: 'On Windows, use `subprocess.PIPE` with `communicate(timeout=...)` instead of manual select+read. Add `if sys.platform == \'win32\': ...` branching.',
      },
      {
        lines: [],
        title: 'pytest.exit() message is misleading on failure',
        severity: 'medium',
        description: '`pytest.exit(\'Custom test execution completed\', returncode=0 if num_failing == 0 else 1)` — the message says "completed" even on failure. Some CI systems parse the exit message rather than just the code.',
        fix: 'Use a descriptive message: `pytest.exit(f\'{num_failing} test(s) failed\', returncode=1)` on failure.',
      },
    ],
    qa: [
      {
        q: 'Why does this conftest run each test file as a separate subprocess instead of using pytest-xdist?',
        a: 'Isaac Lab tests launch an Omniverse/IsaacSim application instance. IsaacSim is not reentrant — running two test files in the same Python process causes GPU context conflicts, CUDA illegal memory access, and Fabric stage corruption. Each test file must start its own IsaacSim application instance in a fresh process. pytest-xdist workers share the same process, which would cause the same conflicts.',
      },
      {
        q: 'What is the purpose of `--ignore=tools/conftest.py` in the pytest command inside the subprocess?',
        a: 'When the subprocess runs `pytest --ignore=tools/conftest.py <test_file>`, it must ignore this conftest.py itself. Without `--ignore`, pytest would load this conftest for the child process too, triggering another `pytest_sessionstart` that tries to discover and run tests — causing infinite subprocess spawning. The `--ignore` flag breaks the recursion.',
      },
      {
        q: 'How does the non-blocking I/O pattern with select.select() prevent the reader from blocking?',
        a: '`select.select([stdout_fd, stderr_fd], [], [], 0.1)` waits at most 0.1 seconds for any fd to become readable. If neither fd has data, select returns empty lists and the loop continues — checking timeout and calling select again. `fcntl.F_SETFL O_NONBLOCK` makes `process.stdout.read(1024)` return immediately with whatever bytes are available (possibly 0) rather than blocking until 1024 bytes arrive. Together they enable real-time streaming without deadlock.',
      },
    ],
  },
  {
    id: 'tools-install-deps-py',
    filename: 'tools/install_deps.py',
    title: 'Extension Dependency Installer',
    cat: 'DevOps',
    diff: 'medium',
    lang: 'python',
    jdSkills: ['argparse', 'TOML', 'apt', 'rosdep', 'subprocess', 'Isaac Lab Extensions'],
    summary: 'Utility that reads `extension.toml` files across extension directories and installs declared apt and/or rosdep packages.',
    explain: [
      'Walks direct children of extensions_dir, reads each config/extension.toml',
      'Installs packages declared under [isaac_lab_settings].apt_deps via `apt-get install`',
      'Installs ROS deps declared under [isaac_lab_settings].ros_ws via `rosdep install --from-paths`',
      'The `run_and_print()` helper streams subprocess output in real time using Popen + read1()',
      'Invoked by Dockerfiles as `./isaaclab.sh -p tools/install_deps.py apt ${ISAACLAB_PATH}/source`'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

"""
This script is a utility to install dependencies mentioned in an extension.toml file of an extension.

The script takes in two arguments:

1. type: The type of dependencies to install. It can be one of the following: ['all', 'apt', 'rosdep'].
2. extensions_dir: The path to the directory beneath which we search for extensions.

The script will search for all extensions in the extensions_dir and then look for an extension.toml file in each
extension's config directory. If the extension.toml file exists, the script will look for the following keys in the
[isaac_lab_settings] section:

* **apt_deps**: A list of apt packages to install.
* **ros_ws**: The path to the ROS workspace in the extension. If the path is not absolute, the script assumes that
  the path is relative to the extension root and resolves it accordingly.

If the type is 'all', the script will install both apt and rosdep packages. If the type is 'apt', the script will only
install apt packages. If the type is 'rosdep', the script will only install rosdep packages.

For more information, please check the \`documentation\`_.

.. _documentation: https://isaac-sim.github.io/IsaacLab/source/setup/developer.html#extension-dependency-management
"""

import argparse
import os
import shutil
from subprocess import PIPE, STDOUT, Popen

import toml

# add argparse arguments
parser = argparse.ArgumentParser(description="A utility to install dependencies based on extension.toml files.")
parser.add_argument("type", type=str, choices=["all", "apt", "rosdep"], help="The type of packages to install.")
parser.add_argument("extensions_dir", type=str, help="The path to the directory containing extensions.")
parser.add_argument("--ros_distro", type=str, default="humble", help="The ROS distribution to use for rosdep.")


def install_apt_packages(paths: list[str]):
    """Installs apt packages listed in the extension.toml file for Isaac Lab extensions.

    For each path in the input list of paths, the function looks in \`\`{path}/config/extension.toml\`\` for
    the \`\`[isaac_lab_settings][apt_deps]\`\` key. It then attempts to install the packages listed in the
    value of the key. The function exits on failure to stop the build process from continuing despite missing
    dependencies.

    Args:
        paths: A list of paths to the extension's root.

    Raises:
        SystemError: If 'apt' is not a known command. This is a system error.
    """
    for path in paths:
        if shutil.which("apt"):
            # Check if the extension.toml file exists
            if not os.path.exists(f"{path}/config/extension.toml"):
                print(
                    "[WARN] During the installation of 'apt' dependencies, unable to find a"
                    f" valid file at: {path}/config/extension.toml."
                )
                continue
            # Load the extension.toml file and check for apt_deps
            with open(f"{path}/config/extension.toml") as fd:
                ext_toml = toml.load(fd)
                if "isaac_lab_settings" in ext_toml and "apt_deps" in ext_toml["isaac_lab_settings"]:
                    deps = ext_toml["isaac_lab_settings"]["apt_deps"]
                    print(f"[INFO] Installing the following apt packages: {deps}")
                    run_and_print(["apt-get", "update"])
                    run_and_print(["apt-get", "install", "-y"] + deps)
                else:
                    print(f"[INFO] No apt packages specified for the extension at: {path}")
        else:
            raise SystemError("Unable to find 'apt' command. Please ensure that 'apt' is installed on your system.")


def install_rosdep_packages(paths: list[str], ros_distro: str = "humble"):
    """Installs ROS dependencies listed in the extension.toml file for Isaac Lab extensions.

    For each path in the input list of paths, the function looks in \`\`{path}/config/extension.toml\`\` for
    the \`\`[isaac_lab_settings][ros_ws]\`\` key. It then attempts to install the ROS dependencies under the workspace
    listed in the value of the key. The function exits on failure to stop the build process from continuing despite
    missing dependencies.

    If the path to the ROS workspace is not absolute, the function assumes that the path is relative to the extension
    root and resolves it accordingly. The function also checks if the ROS workspace exists before proceeding with
    the installation of ROS dependencies. If the ROS workspace does not exist, the function raises an error.

    Args:
        path: A list of paths to the extension roots.
        ros_distro: The ROS distribution to use for rosdep. Default is 'humble'.

    Raises:
        FileNotFoundError: If a valid ROS workspace is not found while installing ROS dependencies.
        SystemError: If 'rosdep' is not a known command. This is raised if 'rosdep' is not installed on the system.
    """
    for path in paths:
        if shutil.which("rosdep"):
            # Check if the extension.toml file exists
            if not os.path.exists(f"{path}/config/extension.toml"):
                print(
                    "[WARN] During the installation of 'rosdep' dependencies, unable to find a"
                    f" valid file at: {path}/config/extension.toml."
                )
                continue
            # Load the extension.toml file and check for ros_ws
            with open(f"{path}/config/extension.toml") as fd:
                ext_toml = toml.load(fd)
                if "isaac_lab_settings" in ext_toml and "ros_ws" in ext_toml["isaac_lab_settings"]:
                    # resolve the path to the ROS workspace
                    ws_path = ext_toml["isaac_lab_settings"]["ros_ws"]
                    if not os.path.isabs(ws_path):
                        ws_path = os.path.join(path, ws_path)
                    # check if the workspace exists
                    if not os.path.exists(f"{ws_path}/src"):
                        raise FileNotFoundError(
                            "During the installation of 'rosdep' dependencies, unable to find a"
                            f" valid ROS workspace at: {ws_path}."
                        )
                    # install rosdep if not already installed
                    if not os.path.exists("/etc/ros/rosdep/sources.list.d/20-default.list"):
                        run_and_print(["rosdep", "init"])
                        run_and_print(["rosdep", "update", f"--rosdistro={ros_distro}"])
                    # install rosdep packages
                    run_and_print(
                        [
                            "rosdep",
                            "install",
                            "--from-paths",
                            f"{ws_path}/src",
                            "--ignore-src",
                            "-y",
                            f"--rosdistro={ros_distro}",
                        ]
                    )
                else:
                    print(f"[INFO] No rosdep packages specified for the extension at: {path}")
        else:
            raise SystemError(
                "Unable to find 'rosdep' command. Please ensure that 'rosdep' is installed on your system."
                "You can install it by running:\\n\\t sudo apt-get install python3-rosdep"
            )


def run_and_print(args: list[str]):
    """Runs a subprocess and prints the output to stdout.

    This function wraps Popen and prints the output to stdout in real-time.

    Args:
        args: A list of arguments to pass to Popen.
    """
    print(f'Running "{args}"')
    with Popen(args, stdout=PIPE, stderr=STDOUT, env=os.environ) as p:
        while p.poll() is None:
            text = p.stdout.read1().decode("utf-8")
            print(text, end="", flush=True)
        return_code = p.poll()
        if return_code != 0:
            raise RuntimeError(f'Subprocess with args: "{args}" failed. The returned error code was: {return_code}')


def main():
    # Parse the command line arguments
    args = parser.parse_args()
    # Get immediate children of args.extensions_dir
    extension_paths = [os.path.join(args.extensions_dir, x) for x in next(os.walk(args.extensions_dir))[1]]

    # Install dependencies based on the type
    if args.type == "all":
        install_apt_packages(extension_paths)
        install_rosdep_packages(extension_paths, args.ros_distro)
    elif args.type == "apt":
        install_apt_packages(extension_paths)
    elif args.type == "rosdep":
        install_rosdep_packages(extension_paths, args.ros_distro)
    else:
        raise ValueError(f"'Invalid dependency type: '{args.type}'. Available options: ['all', 'apt', 'rosdep'].")


if __name__ == "__main__":
    main()
`,
    issues: [
      {
        lines: [],
        title: 'Only direct children of extensions_dir are processed — misses nested extensions',
        severity: 'medium',
        description: '`next(os.walk(args.extensions_dir))[1]` returns only immediate subdirectories. If extensions are nested (e.g. `source/isaaclab_tasks/isaaclab_tasks/envs/`), their extension.toml files are skipped.',
        fix: 'Use `os.walk(args.extensions_dir)` with a filter for directories containing config/extension.toml.',
      },
      {
        lines: [],
        title: 'run_and_print raises RuntimeError on non-zero exit — stops processing remaining extensions',
        severity: 'medium',
        description: 'If installing apt packages for extension A fails, the RuntimeError propagates up and extensions B, C, D never get their packages installed.',
        fix: 'Collect failures and report them at the end: append to a failures list, continue the loop, then raise at the end if failures is non-empty.',
      },
    ],
    qa: [
      {
        q: 'Why does run_and_print use read1() instead of readline() or read()?',
        a: '`readline()` blocks until a newline appears — programs that print progress without newlines (like apt download bars) would appear frozen. `read()` blocks until EOF — it would buffer everything and print nothing until the subprocess exits. `read1()` (a BufferedReader method) reads whatever bytes are currently available in the kernel pipe buffer and returns immediately, giving the closest approximation to real-time streaming.',
      },
      {
        q: 'What is rosdep and why does Isaac Lab need it for ROS extensions?',
        a: '`rosdep` is the ROS dependency manager. ROS packages declare dependencies in `package.xml` files in their workspace. `rosdep install --from-paths src` reads all package.xml files and installs their declared system dependencies. Isaac Lab extensions that provide ROS bridges need ROS message packages (sensor_msgs, geometry_msgs) that are installed via rosdep rather than pip.',
      },
    ],
  },
  {
    id: 'tools-run-all-tests-py',
    filename: 'tools/run_all_tests.py',
    title: 'Test Suite Runner',
    cat: 'Testing',
    diff: 'hard',
    lang: 'python',
    jdSkills: ['subprocess', 'logging', 'argparse', 'PrettyTable', 'Test Automation', 'Timeout Handling'],
    summary: 'Discovery and execution runner for all `test_*.py` files under the source tree; runs each test as a subprocess with per-test timeouts, logs results, and prints a summary table.',
    explain: [
      'Discovers tests using Path.rglob("*test_*.py"), skips TESTS_TO_SKIP, optionally filters by extension',
      'First calls warm_start_app() to pre-initialize IsaacSim application and populate the cache',
      'Runs each test with subprocess.run(..., capture_output=True, timeout=...)',
      'Uses unified logging to both console and a timestamped log file; --quiet flag suppresses console output',
      'Parses stdout/stderr for "Ran N tests in Xs OK" pattern to determine pass/fail'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

"""A runner script for all the tests within source directory.

.. code-block:: bash

    ./isaaclab.sh -p tools/run_all_tests.py

    # for dry run
    ./isaaclab.sh -p tools/run_all_tests.py --discover_only

    # for quiet run
    ./isaaclab.sh -p tools/run_all_tests.py --quiet

    # for increasing timeout (default is 600 seconds)
    ./isaaclab.sh -p tools/run_all_tests.py --timeout 1000

"""

import argparse
import logging
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from prettytable import PrettyTable

# Local imports
from test_settings import DEFAULT_TIMEOUT, ISAACLAB_PATH, PER_TEST_TIMEOUTS, TESTS_TO_SKIP


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Run all tests under current directory.")
    # add arguments
    parser.add_argument(
        "--skip_tests",
        default="",
        help="Space separated list of tests to skip in addition to those in tests_to_skip.py.",
        type=str,
        nargs="*",
    )

    # configure default test directory (source directory)
    default_test_dir = os.path.join(ISAACLAB_PATH, "source")

    parser.add_argument(
        "--test_dir", type=str, default=default_test_dir, help="Path to the directory containing the tests."
    )

    # configure default logging path based on time stamp
    log_file_name = datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".log"
    default_log_path = os.path.join(ISAACLAB_PATH, "logs", "test_results", log_file_name)

    parser.add_argument(
        "--log_path", type=str, default=default_log_path, help="Path to the log file to store the results in."
    )
    parser.add_argument("--discover_only", action="store_true", help="Only discover and print tests, don't run them.")
    parser.add_argument("--quiet", action="store_true", help="Don't print to console, only log to file.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Timeout for each test in seconds.")
    parser.add_argument("--extension", type=str, default=None, help="Run tests only for the given extension.")
    # parse arguments
    args = parser.parse_args()
    return args


def test_all(
    test_dir: str,
    tests_to_skip: list[str],
    log_path: str,
    timeout: float = DEFAULT_TIMEOUT,
    per_test_timeouts: dict[str, float] = {},
    discover_only: bool = False,
    quiet: bool = False,
    extension: str | None = None,
) -> bool:
    """Run all tests under the given directory.

    Args:
        test_dir: Path to the directory containing the tests.
        tests_to_skip: List of tests to skip.
        log_path: Path to the log file to store the results in.
        timeout: Timeout for each test in seconds. Defaults to DEFAULT_TIMEOUT.
        per_test_timeouts: A dictionary of tests and their timeouts in seconds. Any tests not listed here will use the
            timeout specified by \`timeout\`. Defaults to an empty dictionary.
        discover_only: If True, only discover and print the tests without running them. Defaults to False.
        quiet: If False, print the output of the tests to the terminal console (in addition to the log file).
            Defaults to False.
        extension: Run tests only for the given extension. Defaults to None, which means all extensions'
            tests will be run.
    Returns:
        True if all un-skipped tests pass or \`discover_only\` is True. Otherwise, False.

    Raises:
        ValueError: If any test to skip is not found under the given \`test_dir\`.

    """
    # Create the log directory if it doesn't exist
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    # Add file handler to log to file
    logging_handlers = [logging.FileHandler(log_path)]
    # We also want to print to console
    if not quiet:
        logging_handlers.append(logging.StreamHandler())
    # Set up logger
    logging.basicConfig(level=logging.INFO, format="%(message)s", handlers=logging_handlers)

    all_test_paths, test_paths, skipped_test_paths, test_timeouts = extract_tests_and_timeouts(
        test_dir, extension, tests_to_skip, timeout, per_test_timeouts
    )

    # Print tests to be run
    logging.info("\\n" + "=" * 60 + "\\n")
    logging.info(f"The following {len(all_test_paths)} tests were found:")
    for i, test_path in enumerate(all_test_paths):
        logging.info(f"{i + 1:02d}: {test_path}, timeout: {test_timeouts[test_path]}")
    logging.info("\\n" + "=" * 60 + "\\n")

    logging.info(f"The following {len(skipped_test_paths)} tests are marked to be skipped:")
    for i, test_path in enumerate(skipped_test_paths):
        logging.info(f"{i + 1:02d}: {test_path}")
    logging.info("\\n" + "=" * 60 + "\\n")

    # Exit if only discovering tests
    if discover_only:
        return True

    results = {}

    # Run each script and store results
    for test_path in test_paths:
        results[test_path] = {}
        before = time.time()
        logging.info("\\n" + "-" * 60 + "\\n")
        logging.info(f"[INFO] Running '{test_path}'\\n")
        try:
            completed_process = subprocess.run(
                [sys.executable, test_path], check=True, capture_output=True, timeout=test_timeouts[test_path]
            )
        except subprocess.TimeoutExpired as e:
            logging.error(f"Timeout occurred: {e}")
            result = "TIMEDOUT"
            stdout = e.stdout
            stderr = e.stderr
        except subprocess.CalledProcessError as e:
            # When check=True is passed to subprocess.run() above, CalledProcessError is raised if the process returns a
            # non-zero exit code. The caveat is returncode is not correctly updated in this case, so we simply
            # catch the exception and set this test as FAILED
            result = "FAILED"
            stdout = e.stdout
            stderr = e.stderr
        except Exception as e:
            logging.error(f"Unexpected exception {e}. Please report this issue on the repository.")
            result = "FAILED"
            stdout = None
            stderr = None
        else:
            result = "COMPLETED"
            stdout = completed_process.stdout
            stderr = completed_process.stderr

        after = time.time()
        time_elapsed = after - before

        # Decode stdout and stderr
        stdout = stdout.decode("utf-8") if stdout is not None else ""
        stderr = stderr.decode("utf-8") if stderr is not None else ""

        if result == "COMPLETED":
            # Check for success message in the output
            success_pattern = r"Ran \\d+ tests? in [\\d.]+s\\s+OK"
            if re.search(success_pattern, stdout) or re.search(success_pattern, stderr):
                result = "PASSED"
            else:
                result = "FAILED"

        # Write to log file
        logging.info(stdout)
        logging.info(stderr)
        logging.info(f"[INFO] Time elapsed: {time_elapsed:.2f} s")
        logging.info(f"[INFO] Result '{test_path}': {result}")
        # Collect results
        results[test_path]["time_elapsed"] = time_elapsed
        results[test_path]["result"] = result

    # Calculate the number and percentage of passing tests
    num_tests = len(all_test_paths)
    num_passing = len([test_path for test_path in test_paths if results[test_path]["result"] == "PASSED"])
    num_failing = len([test_path for test_path in test_paths if results[test_path]["result"] == "FAILED"])
    num_timing_out = len([test_path for test_path in test_paths if results[test_path]["result"] == "TIMEDOUT"])
    num_skipped = len(skipped_test_paths)

    if num_tests == 0:
        passing_percentage = 100
    else:
        passing_percentage = (num_passing + num_skipped) / num_tests * 100

    # Print summaries of test results
    summary_str = "\\n\\n"
    summary_str += "===================\\n"
    summary_str += "Test Result Summary\\n"
    summary_str += "===================\\n"

    summary_str += f"Total: {num_tests}\\n"
    summary_str += f"Passing: {num_passing}\\n"
    summary_str += f"Failing: {num_failing}\\n"
    summary_str += f"Skipped: {num_skipped}\\n"
    summary_str += f"Timing Out: {num_timing_out}\\n"

    summary_str += f"Passing Percentage: {passing_percentage:.2f}%\\n"

    # Print time elapsed in hours, minutes, seconds
    total_time = sum([results[test_path]["time_elapsed"] for test_path in test_paths])

    summary_str += f"Total Time Elapsed: {total_time // 3600}h"
    summary_str += f"{total_time // 60 % 60}m"
    summary_str += f"{total_time % 60:.2f}s"

    summary_str += "\\n\\n=======================\\n"
    summary_str += "Per Test Result Summary\\n"
    summary_str += "=======================\\n"

    # Construct table of results per test
    per_test_result_table = PrettyTable(field_names=["Test Path", "Result", "Time (s)"])
    per_test_result_table.align["Test Path"] = "l"
    per_test_result_table.align["Time (s)"] = "r"
    for test_path in test_paths:
        per_test_result_table.add_row(
            [test_path, results[test_path]["result"], f"{results[test_path]['time_elapsed']:0.2f}"]
        )

    for test_path in skipped_test_paths:
        per_test_result_table.add_row([test_path, "SKIPPED", "N/A"])

    summary_str += per_test_result_table.get_string()

    # Print summary to console and log file
    logging.info(summary_str)

    # Only count failing and timing out tests towards failure
    return num_failing + num_timing_out == 0


def extract_tests_and_timeouts(
    test_dir: str,
    extension: str | None = None,
    tests_to_skip: list[str] = [],
    timeout: float = DEFAULT_TIMEOUT,
    per_test_timeouts: dict[str, float] = {},
) -> tuple[list[str], list[str], list[str], dict[str, float]]:
    """Extract all tests under the given directory or extension and their respective timeouts.

    Args:
        test_dir: Path to the directory containing the tests.
        extension: Run tests only for the given extension. Defaults to None, which means all extensions'
            tests will be run.
        tests_to_skip: List of tests to skip.
        timeout: Timeout for each test in seconds. Defaults to DEFAULT_TIMEOUT.
        per_test_timeouts: A dictionary of tests and their timeouts in seconds. Any tests not listed here will use the
            timeout specified by \`timeout\`. Defaults to an empty dictionary.

    Returns:
        A tuple containing the paths of all tests, tests to run, tests to skip, and their respective timeouts.

    Raises:
        ValueError: If any test to skip is not found under the given \`test_dir\`.
    """

    # Discover all tests under current directory
    all_test_paths = [str(path) for path in Path(test_dir).resolve().rglob("*test_*.py")]
    skipped_test_paths = []
    test_paths = []
    # Check that all tests to skip are actually in the tests
    for test_to_skip in tests_to_skip:
        for test_path in all_test_paths:
            if test_to_skip in test_path:
                break
        else:
            raise ValueError(f"Test to skip '{test_to_skip}' not found in tests.")

    # Filter tests by extension
    if extension is not None:
        all_tests_in_selected_extension = []

        for test_path in all_test_paths:
            # Extract extension name from test path
            extension_name = test_path[test_path.find("extensions") :].split("/")[1]

            # Skip tests that are not in the selected extension
            if extension_name != extension:
                continue

            all_tests_in_selected_extension.append(test_path)

        all_test_paths = all_tests_in_selected_extension

    # Remove tests to skip from the list of tests to run
    if len(tests_to_skip) != 0:
        for test_path in all_test_paths:
            if any([test_to_skip in test_path for test_to_skip in tests_to_skip]):
                skipped_test_paths.append(test_path)
            else:
                test_paths.append(test_path)
    else:
        test_paths = all_test_paths

    # Sort test paths so they're always in the same order
    all_test_paths.sort()
    test_paths.sort()
    skipped_test_paths.sort()

    # Initialize all tests to have the same timeout
    test_timeouts = {test_path: timeout for test_path in all_test_paths}

    # Overwrite timeouts for specific tests
    for test_path_with_timeout, test_timeout in per_test_timeouts.items():
        for test_path in all_test_paths:
            if test_path_with_timeout in test_path:
                test_timeouts[test_path] = test_timeout

    return all_test_paths, test_paths, skipped_test_paths, test_timeouts


def warm_start_app():
    """Warm start the app to compile shaders before running the tests."""

    print("[INFO] Warm starting the simulation app before running tests.")
    before = time.time()
    # headless experience
    warm_start_output = subprocess.run(
        [
            sys.executable,
            "-c",
            "from isaaclab.app import AppLauncher; app_launcher = AppLauncher(headless=True); app_launcher.app.close()",
        ],
        capture_output=True,
    )
    if len(warm_start_output.stderr) > 0:
        if "omni::fabric::IStageReaderWriter" not in str(warm_start_output.stderr) and "scaling_governor" not in str(
            warm_start_output.stderr
        ):
            logging.error(f"Error warm starting the app: {str(warm_start_output.stderr)}")
            exit(1)

    # headless experience with rendering
    warm_start_rendering_output = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from isaaclab.app import AppLauncher; app_launcher = AppLauncher(headless=True,"
                " enable_cameras=True); app_launcher.app.close()"
            ),
        ],
        capture_output=True,
    )
    if len(warm_start_rendering_output.stderr) > 0:
        if "omni::fabric::IStageReaderWriter" not in str(
            warm_start_rendering_output.stderr
        ) and "scaling_governor" not in str(warm_start_output.stderr):
            logging.error(f"Error warm starting the app with rendering: {str(warm_start_rendering_output.stderr)}")
            exit(1)

    after = time.time()
    time_elapsed = after - before
    print(f"[INFO] Warm start completed successfully in {time_elapsed:.2f} s")


if __name__ == "__main__":
    # parse command line arguments
    args = parse_args()

    # warm start the app
    warm_start_app()

    # add tests to skip to the list of tests to skip
    tests_to_skip = TESTS_TO_SKIP
    tests_to_skip += args.skip_tests

    # run all tests
    test_success = test_all(
        test_dir=args.test_dir,
        tests_to_skip=tests_to_skip,
        log_path=args.log_path,
        timeout=args.timeout,
        per_test_timeouts=PER_TEST_TIMEOUTS,
        discover_only=args.discover_only,
        quiet=args.quiet,
        extension=args.extension,
    )
    # update exit status based on all tests passing or not
    if not test_success:
        exit(1)
`,
    issues: [
      {
        lines: [],
        title: 'Pass/fail detection uses unittest output regex — does not work with pytest',
        severity: 'medium',
        description: '`re.search(r\'Ran \\d+ tests? in [\\d.]+s\\s+OK\', ...)` parses the traditional unittest summary line. pytest with `--tb=short` does not output this pattern — it outputs `X passed in Xs`. This script would mark all pytest runs as FAILED.',
        fix: 'Add a pytest pattern: `re.search(r\'\\d+ passed\', ...) and not re.search(r\'\\d+ failed|error\', ...)`. Or rely on subprocess return code: `returncode == 0` means passed.',
      },
    ],
    qa: [
      {
        q: 'What does warm_start_app() do and why is it needed before running tests?',
        a: 'IsaacSim loads hundreds of Omniverse extensions and initializes the USD stage on first launch. This cold start takes 30-120 seconds and downloads/extracts extension bundles. Subsequent launches reuse the extracted cache and take ~10 seconds. `warm_start_app()` runs two minimal AppLauncher startups (headless, then headless+cameras) to populate this cache before the actual test suite starts.',
      },
      {
        q: 'Why log to both a file and console simultaneously instead of just tee-ing the output?',
        a: 'Using Python logging with multiple handlers (FileHandler + StreamHandler) gives structured output that can be selectively suppressed. The `--quiet` flag removes the StreamHandler — tests can run silently in CI while still writing a full log to disk for post-hoc analysis. `tee` would capture all subprocess output including formatting escape codes, which corrupt the log file.',
      },
    ],
  },
  {
    id: 'tools-run-train-envs-py',
    filename: 'tools/run_train_envs.py',
    title: 'RL Training Environment Runner',
    cat: 'Testing',
    diff: 'medium',
    lang: 'python',
    jdSkills: ['subprocess', 'argparse', 'RL Libraries', 'Isaac Lab', 'RSL-RL', 'SKRL', 'SB3'],
    summary: 'Runs short training loops across a predefined set of RL environments for multiple RL library backends to verify training integration.',
    explain: [
      'Iterates over TEST_RL_ENVS (Ant, Cartpole, Franka Lift, etc.) and runs training for each',
      'Supports four RL libraries: RSL-RL, SKRL, RL-Games, SB3 via `--lib-name` argument',
      'For RSL-RL, adds `--run_name {git_commit_hash}` to tag the training run in TensorBoard',
      'Uses `check=False` to continue through failures and print all results'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

"""
This scripts run training with different RL libraries over a subset of the environments.

It calls the script \`\`scripts/reinforcement_learning/\${args.lib_name}/train.py\`\` with the appropriate arguments.
Each training run has the corresponding "commit tag" appended to the run name, which allows comparing different
training logs of the same environments.

Example usage:

.. code-block:: bash
    # for rsl-rl
    python run_train_envs.py --lib-name rsl_rl

"""

import argparse
import subprocess

from test_settings import ISAACLAB_PATH, TEST_RL_ENVS


def parse_args() -> argparse.Namespace:
    """Parse the command line arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--lib-name",
        type=str,
        default="rsl_rl",
        choices=["rsl_rl", "skrl", "rl_games", "sb3"],
        help="The name of the library to use for training.",
    )
    return parser.parse_args()


def main(args: argparse.Namespace):
    """The main function."""
    # get the git commit hash
    git_commit_hash = subprocess.check_output(["git", "rev-parse", "HEAD"]).decode("utf-8").strip()

    # add run name based on library
    if args.lib_name == "rsl_rl":
        extra_args = ["--run_name", git_commit_hash]
    else:
        # TODO: Modify this for other libraries as well to have commit tag in their saved run logs
        extra_args = []

    # train on each environment
    for env_name in TEST_RL_ENVS:
        # print a colored output to catch the attention of the user
        # this should be a multi-line print statement
        print("\\033[91m==============================================\\033[0m")
        print("\\033[91m==============================================\\033[0m")
        print(f"\\033[91mTraining on {env_name} with {args.lib_name}...\\033[0m")
        print("\\033[91m==============================================\\033[0m")
        print("\\033[91m==============================================\\033[0m")

        # run the training script
        subprocess.run(
            [
                f"{ISAACLAB_PATH}/isaaclab.sh",
                "-p",
                f"{ISAACLAB_PATH}/scripts/reinforcement_learning/{args.lib_name}/train.py",
                "--task",
                env_name,
                "--headless",
            ]
            + extra_args,
            check=False,  # do not raise an error if the script fails
        )


if __name__ == "__main__":
    args_cli = parse_args()
    main(args_cli)
`,
    issues: [
      {
        lines: [],
        title: 'No timeout per training run — a hung GPU job blocks all subsequent environments',
        severity: 'high',
        description: '`subprocess.run(..., check=False)` has no `timeout` argument. If one training run deadlocks (CUDA hang, distributed init failure), it blocks the entire script indefinitely.',
        fix: 'Add `timeout=600` (10 min) to each `subprocess.run` call and catch `subprocess.TimeoutExpired` to log and continue.',
      },
      {
        lines: [],
        title: 'No iteration count limit — training runs until convergence',
        severity: 'medium',
        description: 'The training scripts run until their default episode/iteration count, which for some environments (Franka Lift, Anymal) can take hours. This makes the tool impractical for quick CI smoke tests.',
        fix: 'Pass `--max_iterations 10` to limit each run to a short smoke test.',
      },
    ],
    qa: [
      {
        q: 'Why is the git commit hash attached to the RSL-RL run name?',
        a: 'RSL-RL uses the run name as the TensorBoard log directory prefix: `logs/rsl_rl/{run_name}/{timestamp}`. By using the git commit SHA, training runs from different commits are naturally separated in TensorBoard. You can visually compare the reward curves of abc1234 vs def5678 in a single TensorBoard session — especially useful for regression testing when a policy change introduces a training instability.',
      },
      {
        q: 'Why does this script use check=False rather than check=True and catching CalledProcessError?',
        a: '`check=False` means a non-zero exit code does not raise an exception — the script prints the colored failure banner and moves to the next environment. For a testing utility that should complete all environments regardless of individual failures, `check=False` is the correct choice. The visual colored banners communicate failures without interrupting the loop.',
      },
    ],
  },
  {
    id: 'tools-test-settings-py',
    filename: 'tools/test_settings.py',
    title: 'Test Configuration Settings',
    cat: 'Testing',
    diff: 'easy',
    lang: 'python',
    jdSkills: ['pytest', 'Test Configuration', 'Python Constants', 'CI/CD'],
    summary: 'Central test configuration: path to repo root, default and per-test timeouts, skip list, and RL environments for training smoke tests.',
    explain: [
      'ISAACLAB_PATH is the repo root derived from `__file__` — always correct regardless of cwd',
      'DEFAULT_TIMEOUT is 300 seconds (5 min) per test',
      'PER_TEST_TIMEOUTS overrides for tests that legitimately take longer: test_environments_training.py gets 6000s (100 min)',
      'TESTS_TO_SKIP lists tests that require interactive display, specific hardware, or are known flaky',
      'TEST_RL_ENVS is the subset of RL environments verified for training regression testing'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

"""
This file contains the settings for the tests.
"""

import os

ISAACLAB_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""Path to the root directory of the Isaac Lab repository."""

DEFAULT_TIMEOUT = 300
"""The default timeout for each test in seconds."""

PER_TEST_TIMEOUTS = {
    "test_articulation.py": 500,
    "test_stage_in_memory.py": 500,
    "test_environments.py": 2500,  # This test runs through all the environments for 100 steps each
    "test_environments_with_stage_in_memory.py": (
        2500
    ),  # Like the above, with stage in memory and with and without fabric cloning
    "test_environment_determinism.py": 1000,  # This test runs through many the environments for 100 steps each
    "test_factory_environments.py": 1000,  # This test runs through Factory environments for 100 steps each
    "test_multi_agent_environments.py": 800,  # This test runs through multi-agent environments for 100 steps each
    "test_generate_dataset.py": 500,  # This test runs annotation for 10 demos and generation until one succeeds
    "test_pink_ik.py": 1000,  # This test runs through all the pink IK environments through various motions
    "test_environments_training.py": (
        6000
    ),  # This test runs through training for several environments and compares thresholds
    "test_simulation_render_config.py": 500,
    "test_operational_space.py": 500,
    "test_non_headless_launch.py": 1000,  # This test launches the app in non-headless mode and starts simulation
    "test_rl_games_wrapper.py": 500,
    "test_skrl_wrapper.py": 500,
    "test_rsl_rl_wrapper.py": 500,
    "test_sb3_wrapper.py": 500,
}
"""A dictionary of tests and their timeouts in seconds.

Note: Any tests not listed here will use the default timeout.
"""

TESTS_TO_SKIP = [
    # lab
    "test_argparser_launch.py",  # app.close issue
    "test_build_simulation_context_nonheadless.py",  # headless
    "test_env_var_launch.py",  # app.close issue
    "test_kwarg_launch.py",  # app.close issue
    "test_differential_ik.py",  # Failing
    # lab_tasks
    "test_record_video.py",  # Failing
    "test_tiled_camera_env.py",  # Need to improve the logic
]
"""A list of tests to skip by run_tests.py"""

TEST_RL_ENVS = [
    # classic control
    "Isaac-Ant-v0",
    "Isaac-Cartpole-v0",
    # manipulation
    "Isaac-Lift-Cube-Franka-v0",
    "Isaac-Open-Drawer-Franka-v0",
    # dexterous manipulation
    "Isaac-Repose-Cube-Allegro-v0",
    # locomotion
    "Isaac-Velocity-Flat-Unitree-Go2-v0",
    "Isaac-Velocity-Rough-Anymal-D-v0",
    "Isaac-Velocity-Rough-G1-v0",
]
"""A list of RL environments to test training on by run_train_envs.py"""
`,
    issues: [
      {
        lines: [],
        title: 'TESTS_TO_SKIP entries have no inline comments explaining why they are skipped',
        severity: 'medium',
        description: 'Several tests are skipped without inline comments. Future contributors may not know if these are skipped because they are flaky, require specific hardware, or are known broken.',
        fix: 'Add inline comments: `\'test_differential_ik.py\',  # requires headless rendering camera, skipped in non-GPU CI`',
      },
    ],
    qa: [
      {
        q: 'Why does test_environments_training.py need a 6000-second timeout?',
        a: 'Training environment tests run a full RL training episode to verify policy convergence or at least stable learning signal. The test covers multiple environments including manipulation tasks (Franka Lift) and locomotion tasks (Anymal). Each environment may need hundreds of policy rollouts. At 6 FPS simulation speed in headless mode, 1000 policy iterations can take 10-20 minutes. The 6000s (100 min) timeout accommodates the full test set including IsaacSim startup time.',
      },
      {
        q: 'How should you add a new environment to TEST_RL_ENVS?',
        a: 'First verify the environment is registered in Isaac Lab (check `source/isaaclab_tasks/isaaclab_tasks/__init__.py` for the task ID). Second, verify a training script exists for your target RL library under `scripts/reinforcement_learning/{lib}/`. Third, run `run_train_envs.py --lib-name rsl_rl` locally with the new environment name. Finally add the task ID string (e.g. `\'Isaac-NewEnv-v0\'`) to TEST_RL_ENVS — the format must exactly match the `--task` argument.',
      },
    ],
  },
  {
    id: 'environment-yml',
    filename: 'environment.yml',
    title: 'Conda Environment Definition',
    cat: 'Repository Config',
    diff: 'easy',
    lang: 'yaml',
    jdSkills: ['Conda', 'Python Environment Management', 'Dependency Specification'],
    summary: 'Minimal conda environment file specifying Python 3.11 and importlib_metadata from conda-forge and defaults channels.',
    explain: [
      'Deliberately minimal — Isaac Sim ships its own Python interpreter and scientific packages',
      'The conda environment is used only for running Isaac Lab management scripts and tooling, not Isaac Sim itself',
      'importlib_metadata provides compatibility shims for package metadata on Python 3.11',
      'Most dependencies are installed via `./isaaclab.sh -i` which uses the Isaac Sim bundled pip'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

channels:
  - conda-forge
  - defaults
dependencies:
  - python=3.11
  - importlib_metadata
`,
    issues: [
      {
        lines: [],
        title: 'No conda environment name specified',
        severity: 'medium',
        description: 'The environment.yml has no `name:` field. Running `conda env create -f environment.yml` will prompt for a name or fail. Without a name, `conda env update -f environment.yml` cannot target the correct environment.',
        fix: 'Add `name: isaaclab` at the top of the file.',
      },
    ],
    qa: [
      {
        q: 'Why is this conda environment so minimal compared to the actual Isaac Lab dependencies?',
        a: 'Isaac Sim bundles its own Python 3.10/3.11 interpreter at `_isaac_sim/python.sh` along with all scientific computing packages (PyTorch, NumPy, USD Python bindings). Isaac Lab extensions use this bundled interpreter, not the system or conda Python. The conda environment exists primarily for running management scripts on the host machine. Installing Isaac Sim packages into the conda env would duplicate hundreds of MB and potentially conflict with the bundled versions.',
      },
    ],
  },
  {
    id: 'pyproject-toml',
    filename: 'pyproject.toml',
    title: 'Python Project Configuration',
    cat: 'Repository Config',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['ruff', 'pyright', 'codespell', 'pytest', 'Python Tooling', 'pyproject.toml'],
    summary: 'Project-wide configuration for ruff (linting + formatting), pyright (type checking), codespell (spell checking), and pytest markers.',
    explain: [
      'ruff: line-length 120, Python 3.10 target, E/W/F/I/UP/C90/SIM/RET rules with specific ignores',
      'pyright: basic mode for source/ and scripts/, `reportMissingImports = none` for Isaac Sim extension imports',
      'codespell: skips binary/generated files, custom ignore-words list for domain terms (haa, slq, collapsable)',
      'pytest: defines custom `isaacsim_ci` marker for Isaac Sim hardware tests',
      'Custom ruff isort section order puts omniverse-extensions as a separate group after third-party'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

[tool.ruff]
line-length = 120
target-version = "py310"

# Exclude directories
extend-exclude = [
    "logs",
    "_isaac_sim",
    ".vscode",
    "_*",
    ".git",
]

[tool.ruff.lint]
# Enable flake8 rules and other useful ones
select = [
    "E",      # pycodestyle errors
    "W",      # pycodestyle warnings
    "F",      # pyflakes
    "I",      # isort
    "UP",     # pyupgrade
    "C90",    # mccabe complexity
    # "D",      # pydocstyle
    "SIM",    # flake8-simplify
    "RET",    # flake8-return
]

# Ignore specific rules (matching your flake8 config)
ignore = [
    "E402",   # Module level import not at top of file
    "D401",   # First line should be in imperative mood
    "RET504", # Unnecessary variable assignment before return statement
    "RET505", # Unnecessary elif after return statement
    "SIM102", # Use a single if-statement instead of nested if-statements
    "SIM103", # Return the negated condition directly
    "SIM108", # Use ternary operator instead of if-else statement
    "SIM117", # Merge with statements for context managers
    "SIM118", # Use {key} in {dict} instead of {key} in {dict}.keys()
    "UP006",  # Use 'dict' instead of 'Dict' type annotation
    "UP018",  # Unnecessary \`float\` call (rewrite as a literal)
]

[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]  # Allow unused imports in __init__.py files

[tool.ruff.lint.mccabe]
max-complexity = 30

[tool.ruff.lint.pydocstyle]
convention = "google"

[tool.ruff.lint.isort]

# Custom import sections with separate sections for each Isaac Lab extension
section-order = [
    "future",
    "standard-library",
    "third-party",
    # Group omniverse extensions separately since they are run-time dependencies
    # which are pulled in by Isaac Lab extensions
    "omniverse-extensions",
    # Group Isaac Lab extensions together since they are all part of the Isaac Lab project
    "isaaclab",
    "isaaclab-contrib",
    "isaaclab-rl",
    "isaaclab-mimic",
    "isaaclab-tasks",
    "isaaclab-assets",
    # First-party is reserved for project templates
    "first-party",
    "local-folder",
]

[tool.ruff.lint.isort.sections]
# Define what belongs in each custom section

"omniverse-extensions" = [
    "isaacsim",
    "omni",
    "pxr",
    "carb",
    "usdrt",
    "Semantics",
    "curobo",
]

"isaaclab" = ["isaaclab"]
"isaaclab-assets" = ["isaaclab_assets"]
"isaaclab-contrib" = ["isaaclab_contrib"]
"isaaclab-rl" = ["isaaclab_rl"]
"isaaclab-mimic" = ["isaaclab_mimic"]
"isaaclab-tasks" = ["isaaclab_tasks"]

[tool.ruff.format]

docstring-code-format = true

[tool.pyright]

include = ["source", "scripts"]
exclude = [
    "**/__pycache__",
    "**/_isaac_sim",
    "**/docs",
    "**/logs",
    ".git",
    ".vscode",
]

typeCheckingMode = "basic"
pythonVersion = "3.11"
pythonPlatform = "Linux"
enableTypeIgnoreComments = true

# This is required as the CI pre-commit does not download the module (i.e. numpy, torch, prettytable)
# Therefore, we have to ignore missing imports
reportMissingImports = "none"
# This is required to ignore for type checks of modules with stubs missing.
reportMissingModuleSource = "none" # -> most common: prettytable in mdp managers

reportGeneralTypeIssues = "none"       # -> raises 218 errors (usage of literal MISSING in dataclasses)
reportOptionalMemberAccess = "warning" # -> raises 8 errors
reportPrivateUsage = "warning"


[tool.codespell]
skip = '*.usd,*.usda,*.usdz,*.svg,*.png,_isaac_sim*,*.bib,*.css,*/_build'
quiet-level = 0
# the world list should always have words in lower case
ignore-words-list = "haa,slq,collapsable,buss,reacher,thirdparty"


[tool.pytest.ini_options]

markers = [
    "isaacsim_ci: mark test to run in isaacsim ci",
]
`,
    issues: [
      {
        lines: [],
        title: '`UP006` ignored — prevents auto-fix of old-style Union[X, Y] type annotations',
        severity: 'medium',
        description: '`UP006` disables the pyupgrade rule requiring modern union type syntax. With `target-version = py310`, `X | Y` syntax is valid. Ignoring UP006 means old-style `Union[X, Y]` is not auto-fixed.',
        fix: 'Remove `UP006` from the ignore list if all Python 3.10+ syntax is acceptable in the codebase.',
      },
    ],
    qa: [
      {
        q: 'Why is reportMissingImports = none set in the pyright config?',
        a: 'Isaac Sim provides Python extensions (isaacsim, omni, pxr, carb, usdrt) installed into the IsaacSim-bundled Python interpreter, not the system Python used by pyright. Pyright sees `import omni.isaac.core` and cannot find omni on sys.path — it would flag every Isaac Sim import as a missing module error. Setting `reportMissingImports = none` silences these false positives while still type-checking Isaac Lab code.',
      },
      {
        q: 'What is the purpose of the custom isort section order with omniverse-extensions and isaaclab groups?',
        a: 'Standard isort has three sections: stdlib, third-party, first-party. Isaac Lab imports have four layers: stdlib → third-party (numpy/torch) → omniverse (omni/pxr/carb) → isaaclab core → isaaclab contrib/rl/tasks/assets → local. The custom sections enforce this import order, making it immediately clear at the top of any file which layer of the stack each import comes from.',
      },
    ],
  },
  {
    id: 'pre-commit-config-yaml',
    filename: '.pre-commit-config.yaml',
    title: 'Pre-commit Hook Configuration',
    cat: 'Repository Config',
    diff: 'medium',
    lang: 'yaml',
    jdSkills: ['pre-commit', 'ruff', 'codespell', 'License Headers', 'Code Quality', 'Git Hooks'],
    summary: 'Six hook groups: ruff (lint+format), standard file checks, codespell, license header insertion (BSD-3 for main code, separate header for mimic), and pygrep RST checks.',
    explain: [
      'ruff-pre-commit with `--fix` for auto-fixing lint issues and ruff-format for formatting',
      'pre-commit-hooks for file hygiene: trailing whitespace, symlink checks, large file guard (2000 KB), YAML/TOML/merge-conflict checks',
      'codespell with tomli for config parsing, excludes CONTRIBUTORS.md and a specific RST file',
      'Two Lucas-C/pre-commit-hooks stanzas for license insertion: main BSD-3 header and separate MIMIC header',
      'pygrep-hooks for RST syntax validation: rst-backticks, rst-directive-colons, rst-inline-touching-normal'
    ],
    code: `# Copyright (c) 2022-2026, The Isaac Lab Project Developers (https://github.com/isaac-sim/IsaacLab/blob/main/CONTRIBUTORS.md).
# All rights reserved.
#
# SPDX-License-Identifier: BSD-3-Clause

repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.14.10
    hooks:
      # Run the linter
      - id: ruff
        args: ["--fix"]
      # Run the formatter
      - id: ruff-format
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: trailing-whitespace
      - id: check-symlinks
      - id: destroyed-symlinks
      - id: check-added-large-files
        args: ["--maxkb=2000"]  # restrict files more than 2 MB. Should use git-lfs instead.
      - id: check-yaml
      - id: check-merge-conflict
      - id: check-case-conflict
      - id: check-executables-have-shebangs
      - id: check-toml
      - id: end-of-file-fixer
      - id: check-shebang-scripts-are-executable
      - id: detect-private-key
      - id: debug-statements
  - repo: https://github.com/codespell-project/codespell
    rev: v2.4.1
    hooks:
      - id: codespell
        additional_dependencies:
        - tomli
        exclude: "CONTRIBUTORS.md|docs/source/setup/walkthrough/concepts_env_design.rst"
  # FIXME: Figure out why this is getting stuck under VPN.
  # - repo: https://github.com/RobertCraigie/pyright-python
  #   rev: v1.1.315
  #   hooks:
  #   - id: pyright
  - repo: https://github.com/Lucas-C/pre-commit-hooks
    rev: v1.5.5
    hooks:
      - id: insert-license
        files: \\.(py|ya?ml)$
        args:
          # - --remove-header    # Remove existing license headers. Useful when updating license.
          - --license-filepath
          - .github/LICENSE_HEADER.txt
          - --use-current-year
        exclude: "source/isaaclab_mimic/|scripts/imitation_learning/isaaclab_mimic/"
  # Apache 2.0 license for mimic files
  - repo: https://github.com/Lucas-C/pre-commit-hooks
    rev: v1.5.5
    hooks:
      - id: insert-license
        files: ^(source/isaaclab_mimic|scripts/imitation_learning/isaaclab_mimic)/.*\\.py$
        args:
          # - --remove-header    # Remove existing license headers. Useful when updating license.
          - --license-filepath
          - .github/LICENSE_HEADER_MIMIC.txt
          - --use-current-year
  - repo: https://github.com/pre-commit/pygrep-hooks
    rev: v1.10.0
    hooks:
      - id: rst-backticks
      - id: rst-directive-colons
      - id: rst-inline-touching-normal
`,
    issues: [
      {
        lines: [],
        title: 'Two separate Lucas-C stanzas with same rev — doubles virtual environment installation',
        severity: 'medium',
        description: 'The license insertion hook is defined twice with identical repo and rev but different args. pre-commit creates two separate virtual environments for these, doubling installation time.',
        fix: 'Create a wrapper script that decides which license header to apply based on the file path, reducing to one stanza.',
      },
      {
        lines: [],
        title: 'check-executables-have-shebangs may fail on CRLF scripts',
        severity: 'medium',
        description: 'If a shell script has Windows line endings (CRLF), the shebang is `#!/bin/bash\\r` and the kernel rejects it as a bad interpreter. The hook would pass but the script would fail at runtime.',
        fix: 'Add `mixed-line-ending` hook with `args: [\'--fix=lf\']` to enforce Unix line endings.',
      },
    ],
    qa: [
      {
        q: 'What does --use-current-year do in the license insertion hook?',
        a: 'The `insert-license` hook reads the license header template and with `--use-current-year`, if the file already has a license header, the hook updates the year range to extend to the current year (e.g. 2022-2024 → 2022-2026). Without this flag, the hook would only insert the header if missing but never update existing ones. This keeps copyright notices current without manual editing.',
      },
      {
        q: 'Why does ruff run before the file hygiene hooks (trailing whitespace, end-of-file-fixer)?',
        a: 'pre-commit runs hooks in the order they are defined. ruff-format adds a trailing newline and strips trailing whitespace as part of formatting. If `trailing-whitespace` ran before ruff-format, ruff-format might re-introduce trailing whitespace in edge cases. Running ruff first means the file hygiene hooks see the fully formatted output and make only minimal additional changes.',
      },
      {
        q: 'What RST syntax errors do the pygrep-hooks catch?',
        a: '`rst-backticks` catches single-backtick references that should be double-backtick — a common RST mistake that renders as plain text instead of inline code. `rst-directive-colons` checks that RST directives have the required double colon. `rst-inline-touching-normal` catches inline markup that touches normal text without a space separator. These are false-positive-free and catch real render bugs in Sphinx docs.',
      },
    ],
  },
]

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokType = 'comment'|'keyword'|'string'|'variable'|'number'|'builtin'|'decorator'|'expression'|'plain'
interface Tok { type: TokType; text: string }

type Rule = [RegExp, TokType]

// Ordered by priority: first match wins at each position
const BASH_RULES: Rule[] = [
  [/#.*/, 'comment'],
  [/\$\{[^}]*\}|\$[A-Za-z_]\w*/, 'variable'],
  [/"(?:[^"\\]|\\.)*"/, 'string'],
  [/'[^']*'/, 'string'],
  [/\b(?:if|then|else|elif|fi|for|do|done|while|until|case|esac|in|function|return|local|export|set|readonly|source|unset|shift|break|continue|exit|echo|printf|read|true|false|test|declare|trap|exec)\b/, 'keyword'],
  [/\b\d+\b/, 'number'],
]

const PY_RULES: Rule[] = [
  [/"""[\s\S]*?"""/, 'string'],
  [/'''[\s\S]*?'''/, 'string'],
  [/#.*/, 'comment'],
  [/f"(?:[^"\\]|\\.)*"/, 'string'],
  [/f'(?:[^'\\]|\\.)*'/, 'string'],
  [/"(?:[^"\\]|\\.)*"/, 'string'],
  [/'(?:[^'\\]|\\.)*'/, 'string'],
  [/@\w+/, 'decorator'],
  [/\b(?:def|class|import|from|return|if|elif|else|for|while|in|not|and|or|True|False|None|with|as|try|except|finally|raise|yield|lambda|global|nonlocal|del|pass|break|continue|async|await|is)\b/, 'keyword'],
  [/\b(?:print|len|range|type|str|int|float|list|dict|set|tuple|open|super|isinstance|issubclass|hasattr|getattr|setattr|enumerate|zip|map|filter|sorted|any|all|sum|min|max|abs|round|format|vars|dir|repr|id|next|iter)\b/, 'builtin'],
  [/\b\d+(?:\.\d+)?\b/, 'number'],
]

const YAML_RULES: Rule[] = [
  [/#.*/, 'comment'],
  [/\$\{\{[^}]*\}\}/, 'expression'],
  [/"(?:[^"\\]|\\.)*"/, 'string'],
  [/'[^']*'/, 'string'],
  [/\b(?:true|false|null|on|off|yes|no)\b/, 'keyword'],
  [/\b\d+\b/, 'number'],
]

const DOCKERFILE_RULES: Rule[] = [
  [/#.*/, 'comment'],
  [/\$\{[^}]*\}|\$[A-Za-z_]\w*/, 'variable'],
  [/"(?:[^"\\]|\\.)*"/, 'string'],
  [/'[^']*'/, 'string'],
  [/--mount(?:=[^\s]+)?/, 'builtin'],
  [/\b(?:FROM|RUN|COPY|ADD|WORKDIR|ENV|ARG|LABEL|EXPOSE|CMD|ENTRYPOINT|USER|VOLUME|HEALTHCHECK|STOPSIGNAL|SHELL|ONBUILD|AS)\b/, 'keyword'],
  [/\b\d+\b/, 'number'],
]

// For YAML, key detection is handled separately below
function tokensForLine(line: string, lang: Lang, yamlKey?: boolean): Tok[] {
  const rules = lang === 'bash' ? BASH_RULES : lang === 'python' ? PY_RULES : lang === 'dockerfile' ? DOCKERFILE_RULES : YAML_RULES
  const toks: Tok[] = []
  let pos = 0

  // YAML: detect `  key:` pattern at line start
  if (lang === 'yaml' && yamlKey) {
    const km = /^(\s*)([a-zA-Z_][\w-]*)(:)/.exec(line)
    if (km) {
      if (km[1]) toks.push({ type: 'plain', text: km[1] })
      toks.push({ type: 'keyword', text: km[2] })
      toks.push({ type: 'plain', text: km[3] })
      pos = km[0].length
    }
  }

  while (pos < line.length) {
    let best: { start: number; end: number; type: TokType } | null = null
    for (const [re, type] of rules) {
      const cloned = new RegExp(re.source, re.flags.includes('s') ? 's' : '')
      const m = cloned.exec(line.slice(pos))
      if (!m) continue
      const start = pos + m.index
      const end = start + m[0].length
      if (!best || start < best.start || (start === best.start && end > best.end)) {
        best = { start, end, type }
      }
    }
    if (!best) { toks.push({ type: 'plain', text: line.slice(pos) }); break }
    if (best.start > pos) toks.push({ type: 'plain', text: line.slice(pos, best.start) })
    toks.push({ type: best.type, text: line.slice(best.start, best.end) })
    pos = best.end
  }
  return toks
}

function tokenizeCode(code: string, lang: Lang): Tok[][] {
  // For Python: tokenize the full string to handle multiline docstrings
  if (lang === 'python') {
    const rules = PY_RULES
    const flat: Tok[] = []
    let pos = 0
    while (pos < code.length) {
      let best: { start: number; end: number; type: TokType } | null = null
      for (const [re, type] of rules) {
        const cloned = new RegExp(re.source, re.source.includes('[\\s\\S]') ? 's' : '')
        const m = cloned.exec(code.slice(pos))
        if (!m) continue
        const start = pos + m.index
        const end = start + m[0].length
        if (!best || start < best.start || (start === best.start && end > best.end)) {
          best = { start, end, type }
        }
      }
      if (!best) { flat.push({ type: 'plain', text: code.slice(pos) }); break }
      if (best.start > pos) flat.push({ type: 'plain', text: code.slice(pos, best.start) })
      flat.push({ type: best.type, text: code.slice(best.start, best.end) })
      pos = best.end
    }
    // Split flat tokens into lines
    const lines: Tok[][] = [[]]
    for (const tok of flat) {
      const parts = tok.text.split('\n')
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([])
        if (parts[i]) lines[lines.length - 1].push({ type: tok.type, text: parts[i] })
      }
    }
    return lines
  }

  // Bash / YAML: line by line
  return code.split('\n').map(line => {
    const isYamlKey = lang === 'yaml' && /^\s*[a-zA-Z_][\w-]*:/.test(line)
    return tokensForLine(line, lang, isYamlKey)
  })
}

const TOK_CLS: Record<TokType, string> = {
  comment:    'text-gray-500 italic',
  keyword:    'text-blue-400',
  string:     'text-amber-300',
  variable:   'text-cyan-300',
  number:     'text-orange-300',
  builtin:    'text-violet-400',
  decorator:  'text-violet-400',
  expression: 'text-amber-400',
  plain:      'text-gray-200',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFF_STYLE: Record<Diff, string> = {
  easy:   'text-accent-green bg-accent-green/10 border-accent-green/20',
  medium: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20',
  hard:   'text-accent-red bg-accent-red/10 border-accent-red/20',
}

const SEV_ICON: Record<Sev, React.ReactNode> = {
  critical: <AlertOctagon size={11} className="text-accent-red flex-shrink-0" />,
  high:     <AlertTriangle size={11} className="text-orange-300 flex-shrink-0" />,
  medium:   <Info size={11} className="text-accent-yellow flex-shrink-0" />,
}

const SEV_BADGE: Record<Sev, string> = {
  critical: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  high:     'bg-orange-400/10 text-orange-300 border-orange-400/20',
  medium:   'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
}

const LANG_LABEL: Record<Lang, string> = { bash: 'bash', python: 'python', yaml: 'yaml', dockerfile: 'dockerfile' }

const SCRIPT_TYPE_TABS = [
  { id: 'all'        as const, label: 'All'       },
  { id: 'bash'       as const, label: 'Bash'      },
  { id: 'python'     as const, label: 'Python'    },
  { id: 'dockerfile' as const, label: 'Dockerfile'},
  { id: 'compose'    as const, label: 'Compose'   },
  { id: 'actions'    as const, label: 'Actions'   },
]
type ScriptType = typeof SCRIPT_TYPE_TABS[number]['id']

function getScriptType(s: Script): Exclude<ScriptType, 'all'> {
  if (s.lang === 'bash') return 'bash'
  if (s.lang === 'python') return 'python'
  if (s.lang === 'dockerfile') return 'dockerfile'
  if (s.lang === 'yaml' && s.filename.toLowerCase().includes('compose')) return 'compose'
  return 'actions'
}

// ─── Copy hook ───────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])
  return { copied, copy }
}

// ─── Code viewer ─────────────────────────────────────────────────────────────

function CodeViewer({ script, showBugs }: { script: Script; showBugs: boolean }) {
  const bugLines = useMemo(() => {
    const s = new Set<number>()
    if (showBugs) script.issues.forEach(iss => iss.lines.forEach(l => s.add(l)))
    return s
  }, [script, showBugs])

  const lineTokens = useMemo(() => tokenizeCode(script.code, script.lang), [script])
  const { copied, copy } = useCopy()

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-[#080c10] flex-shrink-0">
        <span className="text-[10px] font-mono text-gray-400">{script.filename}</span>
        <button
          onClick={() => copy(script.code)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors',
            copied
              ? 'border-nvidia/30 bg-nvidia/10 text-nvidia'
              : 'border-border/60 text-gray-400 hover:text-gray-300 hover:border-neutral-600',
          )}
        >
          {copied ? <CheckCircle2 size={9} /> : <Copy size={9} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="overflow-auto flex-1">
      <table className="w-full border-collapse text-[11.5px] font-mono leading-[1.6]">
        <tbody>
          {lineTokens.map((toks, i) => {
            const lineNum = i + 1
            const isBug = bugLines.has(lineNum)
            return (
              <tr
                key={i}
                className={cn(
                  'group',
                  isBug
                    ? 'bg-accent-red/[.08] ring-1 ring-inset ring-accent-red/20'
                    : 'hover:bg-white/[.04]',
                )}
              >
                <td className="select-none text-right pr-4 pl-3 py-[1px] text-gray-400 w-10 border-r border-border/40 align-top bg-[#080c10]">
                  {lineNum}
                </td>
                <td className={cn('pl-4 pr-6 py-[1px] whitespace-pre', isBug && 'relative')}>
                  {toks.map((tok, j) => (
                    <span key={j} className={TOK_CLS[tok.type]}>{tok.text}</span>
                  ))}
                  {isBug && (
                    <span className="ml-3 text-[9px] font-sans font-semibold text-accent-red/70 uppercase tracking-wide">
                      ← bug
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

// ─── Issues tab ───────────────────────────────────────────────────────────────

function FixBlock({ text }: { text: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className="relative group/fix">
      <div className="bg-surface-3 rounded-lg px-3 py-2.5 text-[11px] font-mono text-accent-green whitespace-pre-wrap leading-relaxed border border-border/60 pr-16">
        {text}
      </div>
      <button
        onClick={() => copy(text)}
        className={cn(
          'absolute top-2 right-2 flex items-center gap-1 px-1.5 py-1 rounded text-[9.5px] border transition-colors',
          'opacity-0 group-hover/fix:opacity-100',
          copied
            ? 'border-nvidia/30 bg-nvidia/10 text-nvidia opacity-100'
            : 'border-border/60 bg-surface-2 text-gray-500 hover:text-gray-200',
        )}
      >
        {copied ? <CheckCircle2 size={8} /> : <Copy size={8} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function IssuesTab({ script }: { script: Script }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setRevealed(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] text-gray-500">
        Identify the issue before revealing — then check your reasoning.
      </p>
      {script.issues.map((iss, i) => {
        const open = revealed.has(i)
        return (
          <div
            key={i}
            className={cn(
              'rounded-xl border overflow-hidden transition-colors',
              open
                ? iss.severity === 'critical'
                  ? 'border-accent-red/30 bg-accent-red/[.04]'
                  : iss.severity === 'high'
                  ? 'border-orange-400/30 bg-orange-400/[.04]'
                  : 'border-accent-yellow/30 bg-accent-yellow/[.04]'
                : 'border-border bg-surface-2',
            )}
          >
            <button
              onClick={() => toggle(i)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
            >
              {SEV_ICON[iss.severity]}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-white font-mono">{iss.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase', SEV_BADGE[iss.severity])}>
                    {iss.severity}
                  </span>
                  {iss.lines.length > 0 && (
                    <span className="text-[9px] text-gray-500 font-mono">
                      line{iss.lines.length > 1 ? 's' : ''} {iss.lines.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 flex-shrink-0">
                {open ? <><EyeOff size={10} /> Hide</> : <><Eye size={10} /> Reveal</>}
              </div>
            </button>

            {open && (
              <div className="px-3.5 pb-3.5 pt-0 space-y-2.5">
                <div className="border-t border-border/40 pt-2.5">
                  <p className="text-[11px] text-gray-300 leading-relaxed">{iss.description}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fix</p>
                  <FixBlock text={iss.fix} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── QA tab ───────────────────────────────────────────────────────────────────

function QATab({ script }: { script: Script }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="space-y-2 p-4">
      {script.qa.map((item, i) => (
        <div key={i} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2 transition-colors"
          >
            <MessageSquare size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-[11.5px] text-gray-100 font-medium leading-snug">{item.q}</span>
            {open === i
              ? <ChevronUp size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
              : <ChevronDown size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
            }
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

// ─── Explain tab ──────────────────────────────────────────────────────────────

function ExplainTab({ script }: { script: Script }) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">What this script does</p>
        <p className="text-[12px] text-gray-300 leading-relaxed">{script.summary}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Step by step</p>
        <ol className="space-y-2">
          {script.explain.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-[10px] font-mono text-gray-400 w-4 flex-shrink-0 pt-0.5">{i + 1}</span>
              <p className="text-[11.5px] text-gray-300 leading-relaxed font-mono">{step}</p>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">JD skills covered</p>
        <div className="flex flex-wrap gap-1.5">
          {script.jdSkills.map(s => (
            <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-surface-2 text-gray-400">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'code' | 'explain' | 'issues' | 'qa'

export default function InterviewPrep() {
  const [selectedId, setSelectedId] = useState(SCRIPTS[0].id)
  const [tab, setTab] = useState<Tab>('code')
  const [search, setSearch] = useState('')
  const [showBugs, setShowBugs] = useState(false)
  const [typeTab, setTypeTab] = useState<ScriptType>('all')

  const script = SCRIPTS.find(s => s.id === selectedId) ?? SCRIPTS[0]

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const byType = typeTab === 'all' ? SCRIPTS : SCRIPTS.filter(s => getScriptType(s) === typeTab)
    if (!q) return byType
    return byType.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.cat.toLowerCase().includes(q) ||
      s.lang.includes(q) ||
      s.jdSkills.some(sk => sk.toLowerCase().includes(q)),
    )
  }, [search, typeTab])

  const switchTypeTab = (id: ScriptType) => {
    setTypeTab(id)
    const first = id === 'all' ? SCRIPTS[0] : SCRIPTS.find(s => getScriptType(s) === id)
    if (first) { setSelectedId(first.id); setTab('code'); setShowBugs(false) }
  }

  const selectScript = (id: string) => {
    setSelectedId(id)
    setTab('code')
    setShowBugs(false)
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'code',    label: 'Code',    icon: <Code2 size={11} /> },
    { id: 'explain', label: 'Explain', icon: <BookOpen size={11} /> },
    { id: 'issues',  label: 'Issues',  icon: <Bug size={11} />, count: script.issues.length },
    { id: 'qa',      label: 'Q & A',   icon: <MessageSquare size={11} />, count: script.qa.length },
  ]

  return (
    <div className="flex h-full min-h-0 bg-surface">

      {/* ── Left: Script browser ─────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-border">
          <p className="text-[12px] font-bold text-white mb-1">Scripts</p>
          <p className="text-[10px] text-gray-500 leading-snug">Spot bugs · explain the code · prep Q&A</p>
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
            const count = t.id === 'all' ? SCRIPTS.length : SCRIPTS.filter(s => getScriptType(s) === t.id).length
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
          {filtered.length === 0 && (
            <p className="text-center text-[11px] text-gray-400 py-6">No scripts match</p>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => selectScript(s.id)}
              className={cn(
                'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                s.id === selectedId && 'bg-nvidia/[.07] border-r-2 border-nvidia',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className={cn('text-[11.5px] font-semibold truncate', s.id === selectedId ? 'text-white' : 'text-gray-300')}>
                  {s.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] text-gray-500 font-mono">{s.cat}</span>
                  <span className="text-gray-400">·</span>
                  <span className={cn('text-[9px] font-semibold capitalize', DIFF_STYLE[s.diff]?.split(' ')[0])}>
                    {s.diff}
                  </span>
                </div>
              </div>
              <span className="text-[9px] font-mono text-gray-400 mt-0.5 flex-shrink-0 bg-surface-3 px-1.5 py-0.5 rounded border border-border/60">
                {LANG_LABEL[s.lang]}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-border">
          <p className="text-[9px] text-gray-400 leading-snug">
            Based on NVIDIA JR2014821 · Senior DevOps Engineer, Robotics
          </p>
        </div>
      </div>

      {/* ── Right: Content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Script header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-white font-mono">{script.filename}</span>
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize', DIFF_STYLE[script.diff])}>
                {script.diff}
              </span>
              <span className="text-[9px] font-mono text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">
                {script.lang}
              </span>
              <span className="text-[9px] text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">
                {script.cat}
              </span>
            </div>
            <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug line-clamp-1">{script.summary}</p>
          </div>

          {/* Hint toggle (only on Code tab) */}
          {tab === 'code' && (
            <button
              onClick={() => setShowBugs(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors flex-shrink-0',
                showBugs
                  ? 'bg-accent-red/10 border-accent-red/30 text-accent-red'
                  : 'bg-surface-2 border-border text-gray-400 hover:border-neutral-500',
              )}
            >
              {showBugs ? <EyeOff size={11} /> : <Eye size={11} />}
              {showBugs ? 'Hide hints' : 'Show hints'}
            </button>
          )}
        </div>

        {/* Tabs */}
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
                  ? [
                      'bg-surface-3 text-white border-border/80',
                      'shadow-[0_2px_8px_rgba(0,0,0,0.35),0_0_0_1px_rgba(118,185,0,0.14),0_0_12px_rgba(118,185,0,0.08)]',
                    ]
                  : 'text-neutral-500 border-transparent hover:text-neutral-200 hover:bg-surface-3/30',
              )}
            >
              <span className={cn('flex-shrink-0', t.id === tab && 'text-nvidia')}>{t.icon}</span>
              {t.label}
              {t.count != null && (
                <span className={cn(
                  'text-[9px] font-semibold px-1.5 py-px rounded-full leading-none',
                  t.id === tab ? 'bg-nvidia/20 text-nvidia' : 'bg-surface-3/80 text-neutral-500',
                )}>
                  {t.count}
                </span>
              )}
              {t.id === tab && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-nvidia/60" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'code'    && <CodeViewer script={script} showBugs={showBugs} />}
          {tab === 'explain' && <ExplainTab script={script} />}
          {tab === 'issues'  && <IssuesTab script={script} />}
          {tab === 'qa'      && <QATab script={script} />}
        </div>
      </div>
    </div>
  )
}
