#!/usr/bin/env python3
"""
docker/scripts/aggregate-manifest.py

Purpose  : Collect per-cell JSON artifacts from each build job, merge them into
           a single nightly manifest JSON, and write a Markdown table to
           $GITHUB_STEP_SUMMARY.

Inputs (environment variables):
  BUILD_DATE           YYYYMMDD
  SHORT_SHA            7-char git SHA
  GITHUB_RUN_ID        Set automatically by GitHub Actions
  CELLS_DIR            Directory to glob cell-*.json from (default: cells/)
  MANIFEST_PATH        Output path (default: nightly-manifest-<date>.json)
  GITHUB_OUTPUT        Set automatically by GitHub Actions
  GITHUB_STEP_SUMMARY  Set automatically by GitHub Actions

Cell JSON schema (each *.json file in CELLS_DIR/):
  runtime_version      str
  image_ext            str
  nightly_tag          str
  sha_tag              str
  registry_image       str   full image:tag
  ghcr_image           str   full image:tag
  digest               str   sha256:... or "unavailable"
  size_mb              float
  runner               str
  dry_run              bool
  status               "success" | "failure" | "cancelled" | "unknown"

Outputs (written to $GITHUB_OUTPUT):
  manifest_path, passed, failed, total

Secrets : None
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
REPO          = os.environ.get("REPO", "")

# Display order for the summary table
VERSIONS:    list[str] = ["4.5.0", "5.0.0", "5.1.0"]
EXTS:        list[str] = ["base", "ros2", "cloudxr", "slim"]
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
    print("::warning::No cell manifests found — manifest will be empty.", file=sys.stderr)


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
        key=lambda c: (c.get("runtime_version", ""), c.get("image_ext", "")),
    ),
}

with open(MANIFEST_PATH, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Manifest written → {MANIFEST_PATH}")
print(f"  {passed} passed · {failed} failed · {cancelled} cancelled · {total} total")


# ── Write GITHUB_OUTPUT ───────────────────────────────────────────────────────

gho = os.environ.get("GITHUB_OUTPUT", "")
if gho:
    with open(gho, "a") as f:
        f.write(f"manifest_path={MANIFEST_PATH}\n")
        f.write(f"passed={passed}\n")
        f.write(f"failed={failed}\n")
        f.write(f"total={total}\n")


# ── Build cell lookup for the summary table ───────────────────────────────────

lookup: dict[tuple[str, str], dict] = {
    (c["runtime_version"], c["image_ext"]): c
    for c in cells
}


def cell_badge(cell: dict | None) -> str:
    """Return a Markdown badge for one matrix cell."""
    if cell is None:
        return "—"
    s    = cell.get("status", "unknown")
    size = cell.get("size_mb", "?")
    if s == "success":
        return f"✅ {size} MB"
    if s == "failure":
        return "❌ failed"
    if s == "cancelled":
        return "⚠️ cancelled"
    return f"⚠️ {s}"


# ── Write GITHUB_STEP_SUMMARY ─────────────────────────────────────────────────

summary_lines: list[str] = [
    f"## Nightly · {BUILD_DATE}",
    "",
    f"| Extension | {' | '.join(SIM_LABELS[v] for v in VERSIONS)} |",
    f"|:----------|{'|'.join(':-------:' for _ in VERSIONS)}|",
]

for ext in EXTS:
    row = [cell_badge(lookup.get((v, ext))) for v in VERSIONS]
    summary_lines.append(f"| `{ext}` | {' | '.join(row)} |")

summary_lines += [
    "",
    f"**{passed} passed · {failed} failed · {cancelled} cancelled**  ",
    f"Commit: `{SHORT_SHA}` · Run: "
    f"[#{RUN_ID}](https://github.com/{REPO}/actions/runs/{RUN_ID})",
    "",
]

# Image sizes table (passed cells only)
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
        key=lambda x: (x.get("runtime_version", ""), x.get("image_ext", "")),
    ):
        tag     = c.get("nightly_tag", "—")
        size    = c.get("size_mb",     "—")
        digest  = c.get("digest",      "—")
        short_d = (digest[:19] + "…") if len(str(digest)) > 20 else digest
        summary_lines.append(f"| `{tag}` | {size} | `{short_d}` |")
    summary_lines.append("")

ghs = os.environ.get("GITHUB_STEP_SUMMARY", "")
if ghs:
    with open(ghs, "a") as f:
        f.write("\n".join(summary_lines) + "\n")
else:
    # Local run — print to stdout so output is visible.
    print("\n".join(summary_lines))

# Turn the manifest job red if any cell failed.
if failed > 0:
    print(f"::error::{failed} build cell(s) failed — see table above.", file=sys.stderr)
    sys.exit(1)
