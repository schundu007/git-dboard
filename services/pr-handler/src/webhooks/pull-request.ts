// src/webhooks/pull-request.ts
// Handles GitHub 'pull_request' webhook events.
//
// Events handled:
//   opened        — new PR: classify, create gate, (GHA workflows self-trigger)
//   synchronize   — new push: invalidate old gate, re-classify, re-create gate
//   reopened      — same as opened for a previously-closed PR
//   labeled       — label added: re-derive requirements, re-evaluate gate
//   unlabeled     — label removed: re-derive requirements, re-evaluate gate
//   closed        — PR merged or closed: clean up (no-op; just log)
//
// The GHA workflows (lint, tests-cpu, docs, license) are triggered directly
// by GitHub on pull_request events — we do NOT dispatch them here.
// We only manage the pr/gate check run.

import type { EmitterWebhookEvent } from '@octokit/webhooks';
import { getOctokitForRepo } from '../utils/github.js';
import { logger } from '../utils/logger.js';
import { classifyPR } from '../checks/classifier.js';
import { createGateCheckRun, concludeGateCheckRun } from '../checks/orchestrator.js';
import { evaluateGate } from '../checks/merge-gate.js';
import type { PRContext } from '../types.js';
import { LABELS } from '../types.js';

type PREvent = EmitterWebhookEvent<'pull_request'>['payload'];

// ─── Helper: build PRContext from webhook payload ─────────────────────────────

function extractPRContext(payload: PREvent): Omit<PRContext, 'classification'> {
  return {
    owner:       payload.repository.owner.login,
    repo:        payload.repository.name,
    prNumber:    payload.pull_request.number,
    headSha:     payload.pull_request.head.sha,
    baseBranch:  payload.pull_request.base.ref,
    title:       payload.pull_request.title,
    labels:      payload.pull_request.labels.map((l: { name: string }) => l.name),
    isDraft:     payload.pull_request.draft ?? false,
    authorLogin: payload.pull_request.user?.login ?? '',
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handlePullRequest(
  event: EmitterWebhookEvent<'pull_request'>,
): Promise<void> {
  const { payload } = event;
  const action      = payload.action;
  const base        = extractPRContext(payload);
  const { owner, repo, prNumber, headSha, isDraft } = base;

  const log = logger.child({ owner, repo, prNumber, headSha, action });

  // ── Skip draft PRs on opened/synchronize ──────────────────────────────────
  // When a draft PR is converted to ready-for-review, GitHub sends
  // 'pull_request.ready_for_review', which we treat as 'reopened'.
  if (isDraft && (action === 'opened' || action === 'synchronize')) {
    log.info('Ignoring draft PR');
    return;
  }

  // ── Handle closed PRs ─────────────────────────────────────────────────────
  if (action === 'closed') {
    log.info({ merged: (payload as PREvent & { pull_request: { merged: boolean } }).pull_request.merged }, 'PR closed');
    return;
  }

  // ── Classify and create/reset the gate for all open-state actions ─────────
  if (['opened', 'synchronize', 'reopened', 'labeled', 'unlabeled', 'ready_for_review'].includes(action)) {
    const octokit = await getOctokitForRepo(owner, repo);

    // Classify the PR and derive check requirements
    const { classification, requirements } = await classifyPR(
      octokit, owner, repo, prNumber, base.labels,
    );

    const ctx: PRContext = { ...base, classification };

    // Create (or reset to in_progress) the gate check run for this SHA
    await createGateCheckRun(octokit, owner, repo, headSha);

    // On synchronize: the previous check runs are stale (new commit pushed).
    // GitHub creates new check run entries for the GHA workflows automatically.
    // We just need to ensure our gate is in 'in_progress' — done above.

    // On labeled/unlabeled: requirements may have changed.
    // Re-evaluate against whatever checks have already completed.
    if (action === 'labeled' || action === 'unlabeled') {
      await evaluateGate(octokit, ctx, requirements);
    }

    log.info({ classification, required: requirements.required }, 'PR gate initialised');
  }
}
