// src/types.ts
// Shared TypeScript types for the IsaacLab PR handler service.
// All other modules import from here — no circular deps.

// ─── Check run names ─────────────────────────────────────────────────────────
// These MUST match the workflow name + job name pattern that GitHub Actions
// uses: "{workflow.name} / {job.name}".  Keep in sync with the YAML files.
export const CHECK_NAMES = {
  LINT:    'PR lint / run',
  TESTS:   'PR tests cpu / run',
  DOCS:    'PR docs / run',
  LICENSE: 'PR license / run',
  GATE:    'pr/gate',           // created and owned exclusively by this App
} as const;

export type CheckName = typeof CHECK_NAMES[keyof typeof CHECK_NAMES];
export const REQUIRED_BY_DEFAULT: CheckName[] = [
  CHECK_NAMES.LINT,
  CHECK_NAMES.TESTS,
  CHECK_NAMES.DOCS,
  CHECK_NAMES.LICENSE,
];

// ─── PR labels that modify check requirements ─────────────────────────────────
export const LABELS = {
  SKIP_CI:     'skip-ci',     // skip all checks except lint
  SKIP_TESTS:  'skip-tests',  // skip CPU tests only
  DOCS_ONLY:   'docs-only',   // skip tests + license; run only lint + docs
  WIP:         'wip',         // block merge regardless of check outcomes
  AUTO_MERGE:  'auto-merge',  // squash-merge automatically when gate passes
  GPU_TESTS:   'gpu-tests',   // add GPU smoke test as required check
} as const;

// ─── PR classification ────────────────────────────────────────────────────────
// Derived by inspecting changed file paths.
export type PRClassification =
  | 'python-source'  // .py files under source/ or scripts/
  | 'docs-only'      // .rst / .md / docs/ changes only
  | 'docker-only'    // docker/ changes only
  | 'ci-config'      // .github/ or pyproject.toml changes only
  | 'mixed';         // anything else / multiple categories

// ─── Per-check result snapshot ────────────────────────────────────────────────
export interface CheckRunResult {
  name:        string;
  status:      'queued' | 'in_progress' | 'completed';
  conclusion:  string | null;    // null when status !== 'completed'
  url:         string;
  started_at:  string | null;
  completed_at: string | null;
}

// ─── Gate evaluation result ───────────────────────────────────────────────────
export interface GateResult {
  pass:        boolean;
  reason:      string;
  required:    CheckName[];
  skipped:     CheckName[];
  results:     CheckRunResult[];
}

// ─── PR context assembled once per event, threaded through handlers ───────────
export interface PRContext {
  owner:          string;
  repo:           string;
  prNumber:       number;
  headSha:        string;
  baseBranch:     string;
  title:          string;
  labels:         string[];
  isDraft:        boolean;
  classification: PRClassification;
  authorLogin:    string;
}

// ─── GitHub Check Run payload helpers ─────────────────────────────────────────
export interface CheckRunOutput {
  title:   string;
  summary: string;
  text?:   string;
}
