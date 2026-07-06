// src/checks/reporter.ts
// Posts a single managed comment on the PR with the current gate status.
// The comment is created on first evaluation and updated in-place on each
// subsequent check_run.completed event — contributors see one comment, not
// a thread of repeated updates.
//
// Comment identification: the App searches for a comment whose body starts
// with the COMMENT_MARKER string.  This is cheaper than storing comment IDs.

import type { Octokit } from '../utils/github.js';
import { CheckSnapshot, formatDuration } from './orchestrator.js';
import { CheckRequirements } from './classifier.js';
import { CheckName } from '../types.js';
import { logger } from '../utils/logger.js';

// Hidden marker at the start of the managed comment body.
// Must be unique and unlikely to appear in normal PR discussion.
const COMMENT_MARKER = '<!-- isaaclab-pr-gate-comment -->\n';

// ─── Public API ───────────────────────────────────────────────────────────────

export async function postGateComment(
  octokit:      Octokit,
  owner:        string,
  repo:         string,
  prNumber:     number,
  conclusion:   'success' | 'failure' | 'neutral',
  snapshots:    CheckSnapshot[],
  requirements: CheckRequirements,
): Promise<void> {
  const body = buildCommentBody(conclusion, snapshots, requirements);

  const existing = await findExistingComment(octokit, owner, repo, prNumber);
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner, repo, comment_id: existing.id, body,
    });
    logger.debug({ owner, repo, prNumber, commentId: existing.id }, 'Updated gate comment');
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
    logger.info({ owner, repo, prNumber }, 'Created gate comment');
  }
}

// ─── Comment body builder ─────────────────────────────────────────────────────

function buildCommentBody(
  conclusion:   'success' | 'failure' | 'neutral',
  snapshots:    CheckSnapshot[],
  requirements: CheckRequirements,
): string {
  const now = new Date().toISOString();

  const headerIcon = {
    success: '✅',
    failure: '❌',
    neutral: '⏸',
  }[conclusion];

  const headerLine = {
    success: '**All required checks passed.** This PR is ready to merge.',
    failure: '**One or more required checks failed.** Fix the issues below and push again.',
    neutral: '**Gate evaluation paused.** Remove the `wip` label when ready.',
  }[conclusion];

  // Build table rows for each required check
  const lookup = new Map(snapshots.map(s => [s.name, s]));
  const rows: string[] = [];

  for (const checkName of requirements.required) {
    const skipReason = requirements.skipReason[checkName as CheckName];
    if (skipReason) {
      rows.push(`| \`${checkName}\` | ⏭ | Skipped | ${skipReason} | — |`);
      continue;
    }

    const snap = lookup.get(checkName);
    if (!snap || snap.status !== 'completed') {
      rows.push(`| \`${checkName}\` | ⏳ | Running | — | — |`);
      continue;
    }

    const isPass    = snap.conclusion === 'success' || snap.conclusion === 'skipped';
    const resultIcon = isPass ? '✅' : '❌';
    const duration   = formatDuration(snap.started_at, snap.completed_at);
    const logLink    = `[log](${snap.html_url})`;

    rows.push(
      `| \`${checkName}\` | ${resultIcon} | ${snap.conclusion ?? ''} | ${logLink} | ${duration} |`,
    );
  }

  // Optional checks (advisory, not gate-blocking)
  const optionalRows: string[] = [];
  for (const checkName of requirements.optional) {
    const snap = lookup.get(checkName);
    if (!snap) {
      optionalRows.push(`| \`${checkName}\` | ⏳ | Running | — | — |`);
    } else if (snap.status === 'completed') {
      const isPass = snap.conclusion === 'success';
      optionalRows.push(
        `| \`${checkName}\` | ${isPass ? '✅' : '⚠️'} | ${snap.conclusion ?? ''} | [log](${snap.html_url}) | ${formatDuration(snap.started_at, snap.completed_at)} |`,
      );
    }
  }

  const lines: string[] = [
    COMMENT_MARKER,
    `## ${headerIcon} PR checks`,
    '',
    headerLine,
    '',
    '### Required checks',
    '',
    '| Check | | Result | Log | Duration |',
    '|:------|:-:|:-------|:----|:--------:|',
    ...rows,
  ];

  if (optionalRows.length > 0) {
    lines.push(
      '',
      '### Optional checks _(advisory — not blocking merge)_',
      '',
      '| Check | | Result | Log | Duration |',
      '|:------|:-:|:-------|:----|:--------:|',
      ...optionalRows,
    );
  }

  lines.push(
    '',
    `<sub>Updated ${now} · [workflow docs](https://github.com/isaac-sim/IsaacLab/blob/main/.github/CONTRIBUTING.md)</sub>`,
  );

  return lines.join('\n');
}

// ─── Find the existing managed comment ───────────────────────────────────────

async function findExistingComment(
  octokit:  Octokit,
  owner:    string,
  repo:     string,
  prNumber: number,
): Promise<{ id: number } | null> {
  // Only search the most recent 50 comments — avoid scanning long PRs
  const { data } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page:     50,
    direction:    'desc',
  });

  const found = data.find(c => c.body?.startsWith(COMMENT_MARKER));
  return found ? { id: found.id } : null;
}
