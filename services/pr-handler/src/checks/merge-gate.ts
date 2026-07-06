// src/checks/merge-gate.ts
// Evaluates whether a PR is ready to merge.
//
// Called after EVERY check_run.completed event.  It:
//   1. Fetches the current state of all check runs for the PR's headSha
//   2. Applies the required/skipped set from the classifier
//   3. Resolves the gate conclusion (success / failure / still waiting)
//   4. Updates the pr/gate check run
//   5. Triggers auto-merge if the label is set
//
// This module has NO side effects other than GitHub API calls.

import type { Octokit } from '../utils/github.js';
import {
  CheckName,
  LABELS,
  PRContext,
} from '../types.js';
import {
  CheckSnapshot,
  concludeGateCheckRun,
  formatDuration,
  listCheckRunsForSHA,
} from './orchestrator.js';
import { CheckRequirements } from './classifier.js';
import { postGateComment } from './reporter.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// ─── Main evaluation entry point ─────────────────────────────────────────────

export async function evaluateGate(
  octokit:      Octokit,
  ctx:          PRContext,
  requirements: CheckRequirements,
): Promise<void> {
  const { owner, repo, headSha, prNumber, labels } = ctx;

  // WIP label → gate stays pending, no evaluation
  if (labels.includes(LABELS.WIP)) {
    await concludeGateCheckRun(octokit, owner, repo, headSha, 'neutral', {
      title:   'PR is marked WIP',
      summary: 'Remove the `wip` label to enable merge gate evaluation.',
    });
    logger.info({ owner, repo, prNumber }, 'Gate skipped: WIP label');
    return;
  }

  const snapshots = await listCheckRunsForSHA(octokit, owner, repo, headSha);
  const decision  = computeGateDecision(snapshots, requirements);

  logger.info(
    { owner, repo, prNumber, decision: decision.state,
      required: requirements.required, passing: decision.passing, failing: decision.failing },
    'Gate evaluated',
  );

  // Still waiting for one or more required checks to complete → stay in_progress
  if (decision.state === 'pending') {
    logger.debug({ owner, repo, prNumber }, 'Gate pending — waiting for checks');
    return;
  }

  // Build the Check Run output and conclude
  const { output, conclusion } = buildGateOutput(decision, requirements, snapshots);
  await concludeGateCheckRun(octokit, owner, repo, headSha, conclusion, output);

  // Post or update the summary comment on the PR
  await postGateComment(octokit, owner, repo, prNumber, conclusion, snapshots, requirements);

  // Auto-merge when all gates pass and the label is present
  if (conclusion === 'success' && labels.includes(LABELS.AUTO_MERGE)) {
    await attemptAutoMerge(octokit, owner, repo, prNumber);
  }
}

// ─── Gate decision types ──────────────────────────────────────────────────────

interface GateDecision {
  state:   'pending' | 'pass' | 'fail';
  passing: string[];
  failing: string[];
  pending: string[];
}

// ─── Decision computation ─────────────────────────────────────────────────────

function computeGateDecision(
  snapshots:    CheckSnapshot[],
  requirements: CheckRequirements,
): GateDecision {
  const { required, skipped } = requirements;
  const passing: string[] = [];
  const failing: string[] = [];
  const pending: string[] = [];

  const lookup = new Map(snapshots.map(s => [s.name, s]));

  for (const checkName of required) {
    // Skipped checks are treated as passing
    if (skipped.includes(checkName as CheckName)) {
      passing.push(checkName);
      continue;
    }

    const snap = lookup.get(checkName);

    if (!snap || snap.status !== 'completed') {
      pending.push(checkName);
      continue;
    }

    // 'success' and 'skipped' (by GitHub) both count as passing
    if (snap.conclusion === 'success' || snap.conclusion === 'skipped') {
      passing.push(checkName);
    } else {
      failing.push(checkName);
    }
  }

  let state: GateDecision['state'] = 'pending';
  if (pending.length === 0) {
    state = failing.length === 0 ? 'pass' : 'fail';
  }

  return { state, passing, failing, pending };
}

// ─── Check Run output builder ─────────────────────────────────────────────────

function buildGateOutput(
  decision:     GateDecision,
  requirements: CheckRequirements,
  snapshots:    CheckSnapshot[],
): { output: { title: string; summary: string; text: string }; conclusion: 'success' | 'failure' } {
  const pass     = decision.state === 'pass';
  const icon     = pass ? '✅' : '❌';
  const title    = pass ? 'All required checks passed' : `${decision.failing.length} check(s) failed`;
  const failList = decision.failing.join(', ');
  const summary  = pass
    ? 'All required checks have passed. This PR is ready to merge.'
    : `The following checks must pass before merging: **${failList}**`;

  // Markdown table of all check results
  const lookup = new Map(snapshots.map(s => [s.name, s]));
  const rows   = requirements.required.map(name => {
    if (requirements.skipped.includes(name as CheckName)) {
      const reason = requirements.skipReason[name as CheckName] ?? 'skipped';
      return `| \`${name}\` | ⏭ Skipped | ${reason} | — |`;
    }
    const snap = lookup.get(name);
    if (!snap || snap.status !== 'completed') {
      return `| \`${name}\` | ⏳ Running | — | — |`;
    }
    const statusIcon = (snap.conclusion === 'success' || snap.conclusion === 'skipped')
      ? '✅' : '❌';
    const dur = formatDuration(snap.started_at, snap.completed_at);
    return `| \`${name}\` | ${statusIcon} ${snap.conclusion ?? ''} | [log](${snap.html_url}) | ${dur} |`;
  });

  const text = [
    `## ${icon} PR gate`,
    '',
    '| Check | Result | Log | Duration |',
    '|:------|:------:|:----|:--------:|',
    ...rows,
    '',
    pass
      ? '> All checks passed — merge is unblocked.'
      : `> **${failList}** must pass before merge is allowed.`,
  ].join('\n');

  return { output: { title, summary, text }, conclusion: pass ? 'success' : 'failure' };
}

// ─── Auto-merge ───────────────────────────────────────────────────────────────

async function attemptAutoMerge(
  octokit:  Octokit,
  owner:    string,
  repo:     string,
  prNumber: number,
): Promise<void> {
  try {
    // Verify the PR is still open and mergeable before calling merge
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

    if (pr.state !== 'open') {
      logger.info({ owner, repo, prNumber }, 'Auto-merge skipped: PR not open');
      return;
    }
    if (pr.mergeable === false) {
      logger.warn({ owner, repo, prNumber }, 'Auto-merge skipped: PR has conflicts');
      return;
    }
    if (pr.draft) {
      logger.info({ owner, repo, prNumber }, 'Auto-merge skipped: PR is a draft');
      return;
    }

    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number:   prNumber,
      merge_method:  config.MERGE_METHOD,
      commit_title:  `${pr.title} (#${prNumber})`,
      commit_message: 'Auto-merged by GitPulse PR handler (auto-merge label)',
    });

    logger.info({ owner, repo, prNumber, method: config.MERGE_METHOD }, 'Auto-merged PR');
  } catch (err: unknown) {
    // Non-fatal — log and continue (e.g. branch protection may require more reviews)
    logger.warn({ owner, repo, prNumber, err }, 'Auto-merge failed (non-fatal)');
  }
}
