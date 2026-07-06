// src/config.ts
// Typed, validated configuration parsed once at startup.
// If any required env var is missing the process exits immediately with
// a descriptive error — fast fail prevents silent misconfig in production.

import { z } from 'zod';

const schema = z.object({
  // GitHub App credentials
  GITHUB_APP_ID:         z.string().min(1, 'GITHUB_APP_ID is required'),
  GITHUB_PRIVATE_KEY:    z.string().min(1, 'GITHUB_PRIVATE_KEY is required'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, 'GITHUB_WEBHOOK_SECRET is required'),

  // Installation ID is optional: when absent the App fetches it per-org at
  // runtime via the installations API (works for single-org repos).
  GITHUB_INSTALLATION_ID: z.string().optional(),

  // Target repository — provided via env (REPO_OWNER / REPO_NAME); empty by default
  REPO_OWNER: z.string().default(''),
  REPO_NAME:  z.string().default(''),

  // HTTP server
  PORT:      z.string().default('3000'),
  HOST:      z.string().default('0.0.0.0'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Auto-merge behaviour
  // MERGE_METHOD controls the merge strategy when the auto-merge label is set.
  MERGE_METHOD: z.enum(['merge', 'squash', 'rebase']).default('squash'),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

function loadConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const msgs = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`);
    console.error('Configuration error — missing or invalid environment variables:');
    console.error(msgs.join('\n'));
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
