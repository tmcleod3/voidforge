/**
 * Extension system — install, uninstall, and list extensions for VoidForge projects.
 *
 * Extensions add optional capabilities to projects without npm dependencies.
 * Templates are copied into the project; runtime imports come from the global wizard.
 */

import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readMarker, writeMarker, requireProjectRoot } from './marker.js';

// ── Extension Registry ───────────────────────────────────

export type ExtensionName = 'danger-room' | 'cultivation';

interface ExtensionDef {
  name: ExtensionName;
  description: string;
  install: (projectDir: string) => Promise<number>;
  uninstall: (projectDir: string) => Promise<void>;
}

const extensions: Map<ExtensionName, ExtensionDef> = new Map();

export function getExtension(name: string): ExtensionDef | undefined {
  return extensions.get(name as ExtensionName);
}

export function listExtensions(): ExtensionDef[] {
  return Array.from(extensions.values());
}

// ── Install / Uninstall ──────────────────────────────────

export async function installExtension(
  projectDir: string,
  name: string,
): Promise<{ filesCreated: number }> {
  const ext = getExtension(name);
  if (!ext) {
    throw new Error(`Unknown extension: ${name}. Available: ${listExtensions().map(e => e.name).join(', ')}`);
  }

  const marker = await readMarker(projectDir);
  if (!marker) {
    throw new Error('Not a VoidForge project — no .voidforge marker found.');
  }

  if (marker.extensions.includes(name)) {
    throw new Error(`Extension "${name}" is already installed.`);
  }

  const filesCreated = await ext.install(projectDir);

  // Register in marker
  marker.extensions.push(name);
  await writeMarker(projectDir, marker);

  return { filesCreated };
}

export async function uninstallExtension(
  projectDir: string,
  name: string,
): Promise<void> {
  const ext = getExtension(name);
  if (!ext) {
    throw new Error(`Unknown extension: ${name}.`);
  }

  const marker = await readMarker(projectDir);
  if (!marker) {
    throw new Error('Not a VoidForge project — no .voidforge marker found.');
  }

  if (!marker.extensions.includes(name)) {
    throw new Error(`Extension "${name}" is not installed.`);
  }

  await ext.uninstall(projectDir);

  // Deregister from marker
  marker.extensions = marker.extensions.filter(e => e !== name);
  await writeMarker(projectDir, marker);
}

// ── Danger Room Extension ────────────────────────────────

const DANGER_ROOM_CONFIG = {
  refreshIntervalMs: 30000,
  panels: {
    heartbeat: { enabled: true },
    campaigns: { enabled: true },
    treasury: { enabled: true },
    deployments: { enabled: true },
  },
  alerts: {
    spendThresholdCents: 100_00,
    errorRateThreshold: 0.05,
  },
};

extensions.set('danger-room', {
  name: 'danger-room',
  description: 'Operations dashboard — heartbeat grid, campaigns, treasury, deployments',
  async install(projectDir: string): Promise<number> {
    const configPath = join(projectDir, 'danger-room.config.json');
    await writeFile(configPath, JSON.stringify(DANGER_ROOM_CONFIG, null, 2) + '\n', 'utf-8');
    return 1;
  },
  async uninstall(projectDir: string): Promise<void> {
    const configPath = join(projectDir, 'danger-room.config.json');
    if (existsSync(configPath)) {
      await rm(configPath);
    }
  },
});

// ── Cultivation Extension ────────────────────────────────

const CULTIVATION_JOBS = [
  'token-refresh',
  'spend-check',
  'campaign-status',
  'reconciliation',
  'ab-evaluation',
  'revenue-ingest',
  'budget-rebalance',
  'anomaly-scan',
  'report-generation',
  'platform-health',
  'creative-rotation',
  'audience-refresh',
] as const;

function jobTemplate(jobName: string): string {
  const camelName = jobName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return `/**
 * ${jobName} — thin wrapper importing from the VoidForge wizard.
 *
 * This file is a project-local entry point for the heartbeat daemon.
 * The actual implementation lives in the globally-installed wizard.
 */

import type { HeartbeatJob } from 'voidforge/wizard/lib/daemon-core.js';

export const job: HeartbeatJob = {
  name: '${jobName}',
  async execute(context) {
    const { ${camelName} } = await import('voidforge/wizard/lib/heartbeat.js');
    return ${camelName}(context);
  },
};
`;
}

const HEARTBEAT_CONFIG = {
  schedules: {
    'token-refresh': { intervalMs: 3600000, enabled: true },
    'spend-check': { intervalMs: 300000, enabled: true },
    'campaign-status': { intervalMs: 600000, enabled: true },
    'reconciliation': { intervalMs: 86400000, enabled: true },
    'ab-evaluation': { intervalMs: 3600000, enabled: true },
    'revenue-ingest': { intervalMs: 3600000, enabled: true },
    'budget-rebalance': { intervalMs: 86400000, enabled: true },
    'anomaly-scan': { intervalMs: 1800000, enabled: true },
    'report-generation': { intervalMs: 86400000, enabled: false },
    'platform-health': { intervalMs: 300000, enabled: true },
    'creative-rotation': { intervalMs: 86400000, enabled: false },
    'audience-refresh': { intervalMs: 86400000, enabled: false },
  },
  circuitBreakers: {
    maxConsecutiveFailures: 3,
    cooldownMs: 300000,
    resetAfterMs: 3600000,
  },
  platforms: [],
};

const CULTIVATION_GITIGNORE = `# Runtime state — never committed
treasury/spend-log.jsonl
treasury/revenue-log.jsonl
treasury/campaigns/
treasury/*.json
heartbeat.pid
heartbeat.sock
`;

extensions.set('cultivation', {
  name: 'cultivation',
  description: 'Growth engine — ad platforms, treasury, heartbeat daemon, A/B testing',
  async install(projectDir: string): Promise<number> {
    const cultDir = join(projectDir, 'cultivation');
    const jobsDir = join(cultDir, 'jobs');
    const treasuryDir = join(cultDir, 'treasury');
    const campaignsDir = join(treasuryDir, 'campaigns');

    await mkdir(jobsDir, { recursive: true });
    await mkdir(campaignsDir, { recursive: true });

    let count = 0;

    // Config
    await writeFile(
      join(cultDir, 'heartbeat.config.json'),
      JSON.stringify(HEARTBEAT_CONFIG, null, 2) + '\n',
      'utf-8',
    );
    count++;

    // Job files
    for (const jobName of CULTIVATION_JOBS) {
      await writeFile(
        join(jobsDir, `${jobName}.ts`),
        jobTemplate(jobName),
        'utf-8',
      );
      count++;
    }

    // .gitignore
    await writeFile(join(cultDir, '.gitignore'), CULTIVATION_GITIGNORE, 'utf-8');
    count++;

    return count;
  },
  async uninstall(projectDir: string): Promise<void> {
    const cultDir = join(projectDir, 'cultivation');
    if (existsSync(cultDir)) {
      await rm(cultDir, { recursive: true, force: true });
    }
    // Clean up PID/socket if running
    const pidFile = join(projectDir, '.voidforge', 'heartbeat.pid');
    if (existsSync(pidFile)) {
      await rm(pidFile);
    }
  },
});
