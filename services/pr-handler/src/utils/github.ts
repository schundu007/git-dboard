// src/utils/github.ts
// Creates a GitHub App-authenticated Octokit instance for a given installation.
// Tokens are rotated automatically by @octokit/app — no manual refresh needed.
//
// Usage:
//   const octokit = await getInstallationOctokit(installationId);
//   await octokit.rest.checks.create({ ... });

import { App } from '@octokit/app';
import { Octokit as OctokitRest } from '@octokit/rest';
import { config } from '../config.js';
import { logger } from './logger.js';

// Re-export so callers can use this type without depending on @octokit/rest directly.
// At runtime, app.getInstallationOctokit() returns an instance that DOES have .rest
// and .paginate — @octokit/app installs those plugins internally.  The declared return
// type from @octokit/core is narrower than the actual object, so we cast to OctokitRest.
export type Octokit = InstanceType<typeof OctokitRest>;

// ─── Singleton App instance ───────────────────────────────────────────────────
// The private key may be base64-encoded in the env var (common in k8s secrets).
function decodePrivateKey(raw: string): string {
  if (raw.startsWith('-----BEGIN')) return raw;
  // Assume base64-encoded PEM — decode and normalise line endings
  return Buffer.from(raw, 'base64').toString('utf8').replace(/\\n/g, '\n');
}

export const githubApp = new App({
  appId:      config.GITHUB_APP_ID,
  privateKey: decodePrivateKey(config.GITHUB_PRIVATE_KEY),
  webhooks: {
    secret: config.GITHUB_WEBHOOK_SECRET,
  },
});

// ─── Installation cache ───────────────────────────────────────────────────────
// Map from installation_id → Octokit instance.
// @octokit/app handles token expiry internally; we only cache the reference.
const installationCache = new Map<number, Octokit>();

export async function getInstallationOctokit(
  installationId: number,
): Promise<Octokit> {
  if (installationCache.has(installationId)) {
    return installationCache.get(installationId)!;
  }

  logger.debug({ installationId }, 'Creating new installation Octokit');
  const octokit = await githubApp.getInstallationOctokit(installationId);
  // Cast: @octokit/app bundles rest + paginate plugins; type reflects @octokit/core only
  const typed = octokit as unknown as Octokit;
  installationCache.set(installationId, typed);
  return typed;
}

// ─── Convenience: resolve installation for a repo ────────────────────────────
// Used when the incoming webhook doesn't include an installation object
// (rare, but can happen with certain App configurations).
export async function getOctokitForRepo(
  owner: string,
  repo: string,
): Promise<Octokit> {
  if (config.GITHUB_INSTALLATION_ID) {
    return getInstallationOctokit(parseInt(config.GITHUB_INSTALLATION_ID, 10));
  }

  // Walk installations to find the one that owns this repo
  for await (const { octokit, installation } of githubApp.eachInstallation.iterator()) {
    if (installation.account?.login?.toLowerCase() === owner.toLowerCase()) {
      logger.debug({ owner, installationId: installation.id }, 'Resolved installation');
      const typed = octokit as unknown as Octokit;
      installationCache.set(installation.id, typed);
      return typed;
    }
  }

  throw new Error(`No GitHub App installation found for owner '${owner}'`);
}
