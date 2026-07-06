#!/usr/bin/env python3
"""
docker/scripts/resolve-matrix.py

Purpose  : Resolve the nightly build matrix from workflow_dispatch inputs or defaults.
           Writes a GitHub Actions strategy matrix JSON to $GITHUB_OUTPUT.

Inputs (environment variables):
  INPUT_SIM_VERSIONS   Comma-separated runtime versions, or "all" (default: all)
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
ALL_IMAGE_EXTS:   list[str] = ["base", "ros2", "cloudxr", "slim"]

# Cells excluded from the matrix with a ::notice:: annotation in Actions.
UNSUPPORTED: dict[tuple[str, str], str] = {
    ("5.0.0", "slim"): "slim container not published for runtime 5.0 yet",
    ("5.1.0", "slim"): "slim container not published for runtime 5.1 yet",
}

# GPU runner labels per extension — must match labels registered on self-hosted runners.
# Override with RUNNER_LABELS_JSON env var: '{"base": ["self-hosted", "gpu", "my-label"]}'
DEFAULT_RUNNER_LABELS: dict[str, list[str]] = {
    "base":     ["self-hosted", "gpu", "gpu-driver", "gpu-a100-80gb"],
    "ros2":     ["self-hosted", "gpu", "gpu-driver", "gpu-a100-80gb"],
    "cloudxr":  ["self-hosted", "gpu", "gpu-driver", "gpu-a100-80gb"],
    "slim":     ["self-hosted", "gpu", "gpu-driver", "gpu-a100-40gb"],
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

        major_minor = ".".join(sim.split(".")[:2])   # "4.5.0" → "4.5"
        labels      = runner_labels.get(ext, runner_labels["base"])

        includes.append({
            "runtime_version": sim,
            "sim_major_minor":   major_minor,
            "image_ext":         ext,
            "runner_labels":     labels,
            "cell_slug":         f"{ext}-sim{major_minor}",
        })

if not includes:
    print(
        "::error::Matrix is empty — all requested combinations are unsupported.",
        file=sys.stderr,
    )
    sys.exit(1)

matrix = {"include": includes}


# ── Write GITHUB_OUTPUT ───────────────────────────────────────────────────────

output_file = os.environ.get("GITHUB_OUTPUT", "")
if output_file:
    with open(output_file, "a") as f:
        f.write(f"matrix={json.dumps(matrix)}\n")
        f.write(f"cell_count={len(includes)}\n")
        f.write(f"skip_count={len(skipped)}\n")


# ── Human-readable summary ────────────────────────────────────────────────────

print(f"\nBuild matrix  ({len(includes)} cells, {len(skipped)} skipped)")
print(f"  Runtime versions   : {sim_versions}")
print(f"  Image extensions   : {image_exts}")
print(f"\n  {'Extension':<12} {'Runtime':<10} Runner labels")
print(f"  {'-'*12} {'-'*10} {'-'*42}")
for cell in includes:
    labels_str = ", ".join(cell["runner_labels"])
    print(f"  {cell['image_ext']:<12} {cell['runtime_version']:<10} {labels_str}")
if skipped:
    print(f"\n  Skipped cells:")
    for s in skipped:
        print(f"  ✗  ({s['sim']}, {s['ext']})  —  {s['reason']}")
