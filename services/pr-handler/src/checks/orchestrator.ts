// src/checks/orchestrator.ts
// Owns the lifecycle of the 'pr/gate' check run.
//
// The App creates ONE synthetic check run named 'pr/gate'.  Branch protection
// requires ONLY this check — not each individual GHA workflow.  This means:
//   • Adding a new required check doesn't require updating branch protection
//   • The gate logic (which checks are required) lives in code, not GitHub UI
//   • Contributors see a single clear pass/fail signal on their PR
//
// Individual GHA workflows (lint, tests-cpu, docs, license) post their own
// check runs automatically via their GITHUB_TOKEN.  This orchestrator reads
// those check runs and sets pr/gate accordingly.

import type { Octokit } from '../utils/github.js';
import { CHECK_NAMES, CheckName, CheckRunOutput } from '../types.js';
import { logger } from '../utils/logger.js';

// ─── Create the gate check run (pending) ─────────────────────────────────────

export async function createGateCheckRun(
  octokit: Octokit,
  owner:   string,
  repo:    string,
  headSha: string,
): Promise<number> {
  const { data } = await octokit.rest.checks.create({
    owner,
    repo,
    name:       CHECK_NAMES.GATE,
    head_sha:   headSha,
    status:     'in_progress',
    started_at: new Date().toISOString(),
    output: {
      title:   'Evaluating PR checks',
      summary: 'Waiting for lint, tests, docs, and license checks to complete.',
    },
  });

  logger.info({ owner, repo, headSha, checkRunId: data.id }, 'Created pr/gate check run');
  return data.id;
}

// ─── Update gate to a terminal state ─────────────────────────────────────────

export type GateConclusion = 'success' | 'failure' | 'neutral' | 'action_required';

export async function concludeGateCheckRun(
  octokit:     Octokit,
  owner:       string,
  repo:        string,
  headSha:     string,
  conclusion:  GateConclusion,
  output:      CheckRunOutput,
): Promise<void> {
  // Locate the existing gate check run for this SHA
  const existing = await findGateCheckRun(octokit, owner, repo, headSha);

  if (existing) {
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: existing.id,
      status:       'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      output,
    });
    logger.info({ owner, repo, headSha, conclusion, checkRunId: existing.id }, 'Updated pr/gate');
  } else {
    // Gate check run was never created (e.g. App restarted mid-PR) — create + complete
    await octokit.rest.checks.create({
      owner,
      repo,
      name:         CHECK_NAMES.GATE,
      head_sha:     headSha,
      status:       'completed',
      conclusion,
      started_at:   new Date().toISOString(),
      completed_at: new Date().toISOString(),
      output,
    });
    logger.info({ owner, repo, headSha, conclusion }, 'Created + completed pr/gate (recovery)');
  }
}

// ─── Find the existing gate check run ────────────────────────────────────────

async function findGateCheckRun(
  octokit: Octokit,
  owner:   string,
  repo:    string,
  headSha: string,
) {
  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo,
    ref:        headSha,
    check_name: CHECK_NAMES.GATE,
    per_page:   10,
  });
  // Return the most recently created gate run if multiple exist (re-runs)
  return data.check_runs.sort((a, b) =>
    new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime()
  )[0] ?? null;
}

// ─── Fetch all check runs for a SHA ──────────────────────────────────────────
// Returns all check runs excluding our own gate, normalised for the evaluator.

export interface CheckSnapshot {
  name:         string;
  status:       string;
  conclusion:   string | null;
  html_url:     string;
  started_at:   string | null;
  completed_at: string | null;
}

export async function listCheckRunsForSHA(
  octokit: Octokit,
  owner:   string,
  repo:    string,
  headSha: string,
): Promise<CheckSnapshot[]> {
  const all: CheckSnapshot[] = [];

  for await (const response of octokit.paginate.iterator(
    octokit.rest.checks.listForRef,
    { owner, repo, ref: headSha, per_page: 100 },
  )) {
    for (const run of response.data) {
      if (run.name === CHECK_NAMES.GATE) continue;  // exclude our own gate
      all.push({
        name:         run.name,
        status:       run.status,
        conclusion:   run.conclusion,
        html_url:     run.html_url ?? '',
        started_at:   run.started_at,
        completed_at: run.completed_at,
      });
    }
  }

  return all;
}

// ─── Re-run a single stale check ─────────────────────────────────────────────
// Called when a maintainer re-requests a specific check run from the GH UI.

export async function rerequestCheckRun(
  octokit:    Octokit,
  owner:      string,
  repo:       string,
  checkRunId: number,
): Promise<void> {
  await octokit.rest.checks.rerequestRun({ owner, repo, check_run_id: checkRunId });
  logger.info({ owner, repo, checkRunId }, 'Rerequested check run');
}

// ─── Duration formatter ───────────────────────────────────────────────────────

export function formatDuration(started: string | null, completed: string | null): string {
  if (!started || !completed) return '—';
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  const s  = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
