// src/app.ts
// Express server entry point for the IsaacLab PR handler GitHub App.
//
// Endpoints:
//   POST /webhook  — receives GitHub webhook events (HMAC-verified)
//   GET  /health   — liveness probe for k8s / Render / Railway
//   GET  /ready    — readiness probe

import express from 'express';
import { createNodeMiddleware } from '@octokit/app';
import { githubApp } from './utils/github.js';
import { handlePullRequest } from './webhooks/pull-request.js';
import { handleCheckRun } from './webhooks/check-run.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

// ─── Register webhook handlers ────────────────────────────────────────────────
githubApp.webhooks.on('pull_request.opened',           handlePullRequest);
githubApp.webhooks.on('pull_request.synchronize',      handlePullRequest);
githubApp.webhooks.on('pull_request.reopened',         handlePullRequest);
githubApp.webhooks.on('pull_request.labeled',          handlePullRequest);
githubApp.webhooks.on('pull_request.unlabeled',        handlePullRequest);
githubApp.webhooks.on('pull_request.closed',           handlePullRequest);
githubApp.webhooks.on('pull_request.ready_for_review', handlePullRequest);
githubApp.webhooks.on('check_run.completed',           handleCheckRun);
githubApp.webhooks.on('check_run.rerequested',         handleCheckRun);

githubApp.webhooks.onError(err => {
  logger.error({ err: err.message }, 'Webhook handler error');
});

// ─── Express app ─────────────────────────────────────────────────────────────
const server = express();

// Octokit middleware handles HMAC verification, JSON parsing, and routing
server.use(
  createNodeMiddleware(githubApp, {
    pathPrefix: '/webhook',
  }),
);

// Health and readiness probes
const startTime = Date.now();

server.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round((Date.now() - startTime) / 1000) });
});

server.get('/ready', (_req, res) => {
  // Could add dependency checks here (GitHub API reachability, etc.)
  res.json({ status: 'ready' });
});

// 404 fallthrough
server.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
export function startServer(): void {
  const port = parseInt(config.PORT, 10);
  const host = config.HOST;

  server.listen(port, host, () => {
    logger.info(
      { port, host, nodeEnv: config.NODE_ENV, repoOwner: config.REPO_OWNER },
      'IsaacLab PR handler started',
    );
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received — shutting down');
    process.exit(0);
  });
}

// Entry point when run directly
startServer();
