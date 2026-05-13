// src/webhooks/check-run.ts
// Handles 'check_run.completed' and 'check_run.rerequested' events.
//
// check_run.completed
//   Fires whenever a GHA workflow job completes.  We look up the PR for the
//   check run's headSha, re-derive requirements, and evaluate the gate.
//
// check_run.rerequested
//   A maintainer clicked "Re-run" on the check run in the GitHub UI.
//   We re-run the individual check (GitHub handles the actual workflow
//   re-trigger) and reset the gate to in_progress.

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { getOctokitForRepo } from '../utils/github.js';
import { logger } from '../utils/logger.js';
import { CHECK_NAMES, LABELS } from '../types.js';
import { classifyPR } from '../checks/classifier.js';
import { createGateCheckRun, concludeGateCheckRun } from '../checks/orchestrator.js';
import { evaluateGate } from '../checks/merge-gate.js';
import type { PRContext } from '../types.js';

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleCheckRun(
  event: EmitterWebhookEvent<'check_run'>,
): Promise<void> {
  const { payload } = event;
  const action      = payload.action as 'completed' | 'rerequested' | 'created' | 'requested_action';

  // Ignore our own gate check run (would cause infinite loop)
  if (payload.check_run.name === CHECK_NAMES.GATE) return;

  // Ignore non-PR check runs (e.g. push-triggered workflows)
  const prNumbers = payload.check_run.pull_requests?.map(
    (pr: { number: number }) => pr.number,
  ) ?? [];
  if (prNumbers.length === 0) return;

  const owner  = payload.repository.owner.login;
  const repo   = payload.repository.name;
  const sha    = payload.check_run.head_sha;
  const log    = logger.child({ owner, repo, sha, checkName: payload.check_run.name, action });

  const octokit = await getOctokitForRepo(owner, repo);

  for (const prNumber of prNumbers) {
    try {
      if (action === 'completed') {
        log.info({ prNumber, conclusion: payload.check_run.conclusion }, 'Check completed — evaluating gate');
        await handleCheckCompleted(octokit, owner, repo, prNumber, sha);
      }
      if (action === 'rerequested') {
        log.info({ prNumber }, 'Check rerequested — resetting gate');
        await createGateCheckRun(octokit, owner, repo, sha);
      }
    } catch (err) {
      log.error({ prNumber, err }, 'Error handling check_run event');
    }
  }
}

// ─── Handle a completed check run ────────────────────────────────────────────

async function handleCheckCompleted(
  octokit:  Awaited<ReturnType<typeof getOctokitForRepo>>,
  owner:    string,
  repo:     string,
  prNumber: number,
  headSha:  string,
): Promise<void> {
  // Fetch the current PR state to get labels and metadata
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

  if (pr.state !== 'open') return;  // closed PRs don't need gate evaluation

  const labels = pr.labels.map((l: { name: string }) => l.name);

  const ctx: PRContext = {
    owner,
    repo,
    prNumber,
    headSha,
    baseBranch:  pr.base.ref,
    title:       pr.title,
    labels,
    isDraft:     pr.draft ?? false,
    authorLogin: pr.user.login,
    classification: 'mixed',  // will be overwritten below
  };

  const { classification, requirements } = await classifyPR(
    octokit, owner, repo, prNumber, labels,
  );
  ctx.classification = classification;

  await evaluateGate(octokit, ctx, requirements);
}
