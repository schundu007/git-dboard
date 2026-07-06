// src/checks/classifier.ts
// Inspects the changed files in a PR and returns:
//   1. The PR classification (python-source, docs-only, docker-only, …)
//   2. The set of required checks for that classification
//   3. Any label-driven overrides
//
// This is the only place in the codebase that decides which checks are
// required for a given PR.  Centralising it here makes it easy to extend.

import type { Octokit } from '@octokit/rest';
import {
  CHECK_NAMES,
  CheckName,
  LABELS,
  PRClassification,
  REQUIRED_BY_DEFAULT,
} from '../types.js';
import { logger } from '../utils/logger.js';

// ─── File pattern matchers ────────────────────────────────────────────────────

const PATTERNS: Record<PRClassification, RegExp[]> = {
  'python-source': [
    /^source\//,
    /^scripts\//,
    /\.py$/,
  ],
  'docs-only': [
    /^docs\//,
    /\.rst$/,
    /\.md$/,
    /^README/,
    /^CONTRIBUTING/,
  ],
  'docker-only': [
    /^docker\//,
    /Dockerfile/,
    /docker-compose/,
    /\.dockerignore/,
    /container\.py$/,
  ],
  'ci-config': [
    /^\.github\//,
    /^pyproject\.toml$/,
    /^environment\.yml$/,
    /^\.pre-commit-config\.yaml$/,
  ],
  mixed: [],  // catch-all — never matched via patterns
};

function classifyFiles(filenames: string[]): PRClassification {
  const categories = new Set<PRClassification>();

  for (const file of filenames) {
    let matched = false;
    for (const [category, patterns] of Object.entries(PATTERNS) as [PRClassification, RegExp[]][]) {
      if (category === 'mixed') continue;
      if (patterns.some(p => p.test(file))) {
        categories.add(category);
        matched = true;
        break;
      }
    }
    if (!matched) categories.add('mixed');
  }

  // If all files fall into a single clean category, use it.
  // Any cross-category combination → 'mixed'.
  if (categories.size === 1) return [...categories][0] as PRClassification;
  return 'mixed';
}

// ─── Check requirement matrix ─────────────────────────────────────────────────
// Returns which checks are required given classification + labels.
// Optional checks (like gpu-tests) are tracked separately.

export interface CheckRequirements {
  required: CheckName[];
  optional: CheckName[];
  skipped:  CheckName[];
  skipReason: Partial<Record<CheckName, string>>;
}

export function deriveRequirements(
  classification: PRClassification,
  labels: string[],
): CheckRequirements {
  const skipReason: Partial<Record<CheckName, string>> = {};

  // Label-based overrides (evaluated before classification)
  if (labels.includes(LABELS.SKIP_CI)) {
    return {
      required:  [CHECK_NAMES.LINT],
      optional:  [],
      skipped:   [CHECK_NAMES.TESTS, CHECK_NAMES.DOCS, CHECK_NAMES.LICENSE],
      skipReason: {
        [CHECK_NAMES.TESTS]:   'skip-ci label',
        [CHECK_NAMES.DOCS]:    'skip-ci label',
        [CHECK_NAMES.LICENSE]: 'skip-ci label',
      },
    };
  }

  if (labels.includes(LABELS.DOCS_ONLY)) {
    return {
      required:  [CHECK_NAMES.LINT, CHECK_NAMES.DOCS],
      optional:  [],
      skipped:   [CHECK_NAMES.TESTS, CHECK_NAMES.LICENSE],
      skipReason: {
        [CHECK_NAMES.TESTS]:   'docs-only label',
        [CHECK_NAMES.LICENSE]: 'docs-only label',
      },
    };
  }

  // Classification-based requirements
  let required: CheckName[] = [...REQUIRED_BY_DEFAULT];
  const skipped: CheckName[] = [];

  switch (classification) {
    case 'docs-only':
      // Docs-only PRs skip CPU tests — no Python code changed
      required = [CHECK_NAMES.LINT, CHECK_NAMES.DOCS, CHECK_NAMES.LICENSE];
      skipped.push(CHECK_NAMES.TESTS);
      skipReason[CHECK_NAMES.TESTS] = 'docs-only PR (no Python source changed)';
      break;

    case 'ci-config':
      // CI config changes: run all checks, but tests can be flaky → still required
      required = [...REQUIRED_BY_DEFAULT];
      break;

    case 'docker-only':
      // Docker changes: lint and license only; tests need the GPU/sim base image
      required = [CHECK_NAMES.LINT, CHECK_NAMES.LICENSE];
      skipped.push(CHECK_NAMES.TESTS, CHECK_NAMES.DOCS);
      skipReason[CHECK_NAMES.TESTS] = 'docker-only PR';
      skipReason[CHECK_NAMES.DOCS]  = 'docker-only PR';
      break;

    default:
      // python-source, mixed → full required set
      required = [...REQUIRED_BY_DEFAULT];
  }

  // Label: skip-tests overrides classification for tests
  if (labels.includes(LABELS.SKIP_TESTS) && required.includes(CHECK_NAMES.TESTS)) {
    required = required.filter(c => c !== CHECK_NAMES.TESTS);
    skipped.push(CHECK_NAMES.TESTS);
    skipReason[CHECK_NAMES.TESTS] = 'skip-tests label';
  }

  // Optional: GPU tests when explicitly requested
  const optional: CheckName[] = labels.includes(LABELS.GPU_TESTS)
    ? ['PR gpu / run' as CheckName]
    : [];

  return { required, optional, skipped, skipReason };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function classifyPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  labels: string[],
): Promise<{ classification: PRClassification; requirements: CheckRequirements }> {
  // Fetch changed files (paginated — PRs can have many files)
  const files: string[] = [];
  for await (const response of octokit.paginate.iterator(
    octokit.rest.pulls.listFiles,
    { owner, repo, pull_number: prNumber, per_page: 100 },
  )) {
    files.push(...response.data.map((f: { filename: string }) => f.filename));
  }

  const classification = classifyFiles(files);
  const requirements   = deriveRequirements(classification, labels);

  logger.info(
    { owner, repo, prNumber, fileCount: files.length, classification,
      required: requirements.required, skipped: requirements.skipped },
    'PR classified',
  );

  return { classification, requirements };
}
