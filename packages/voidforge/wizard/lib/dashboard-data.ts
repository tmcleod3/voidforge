/**
 * Dashboard data parsers — shared between Danger Room and War Room.
 * Reads campaign-state.md, assemble-state.md, log files, deploy logs, VERSION.md.
 *
 * v22.0 (ADR-041 M1): All project-scoped functions accept logsDir/projectDir
 * from ProjectContext. Global data (context stats) stays at ~/.voidforge/.
 *
 * Parser fixes from field reports #127, #128:
 * - parseCampaignState: rewritten for actual 5-column format, handles bold status
 * - parseBuildState: explicit trim to remove capture artifacts
 * - parseFindings: reads Known Issues from build-state.md first, falls back to regex
 */

import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileOrNull } from './http-helpers.js';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── Types ────────────────────────────────────────

export interface Mission {
  name: string;
  status: string;
  number: number;
  blockedBy?: string;
  debrief?: string;
}

export interface CampaignData {
  missions: Mission[];
  status: string;
  sections: Array<{ name: string; status: string }>;
}

export interface PhaseData {
  phases: Array<{ name: string; status: string }>;
}

export interface FindingCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DeployData {
  url: string;
  commit?: string;
  healthy: boolean;
  target: string;
  timestamp: string;
}

// ── Parsers ──────────────────────────────────────

/**
 * Parse campaign-state.md into structured campaign data.
 *
 * Handles the actual format written by /campaign:
 *   | # | Mission | Scope | Status | Debrief |
 *   | 1 | Name    | ...   | NOT STARTED | — |
 *
 * Status values may be wrapped in bold: **DONE**, **COMPLETE**
 * Normalizes to: COMPLETE, ACTIVE, BLOCKED, PENDING, STRUCTURAL
 */
export async function parseCampaignState(logsDir: string): Promise<CampaignData | null> {
  const content = await readFileOrNull(join(logsDir, 'campaign-state.md'));
  if (!content) return null;

  const missions: Mission[] = [];
  const re = /\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\*{0,2}(COMPLETE|DONE|IN PROGRESS|NOT STARTED|BLOCKED|STRUCTURAL|ACTIVE|ABANDONED)\*{0,2}\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rawStatus = m[4].trim();
    const status = rawStatus === 'IN PROGRESS' ? 'ACTIVE'
      : rawStatus === 'NOT STARTED' ? 'PENDING'
      : rawStatus === 'DONE' ? 'COMPLETE'
      : rawStatus;
    missions.push({
      name: m[2].trim(),
      status,
      number: parseInt(m[1]),
      debrief: m[5].trim() === '—' ? undefined : m[5].trim(),
    });
  }

  if (missions.length === 0) {
    if (content.length > 100) {
      console.warn('parseCampaignState: no missions found in non-empty file (%d chars)', content.length);
    }
    return null;
  }

  const statusMatch = content.match(/CAMPAIGN STATUS:\s*(.+?)(?:\n|$)/);
  const status = statusMatch ? statusMatch[1] : 'ACTIVE';
  const sections = missions.map(mi => ({ name: mi.name, status: mi.status }));

  return { missions, status, sections };
}

/**
 * Parse assemble-state.md into phase pipeline data.
 * Explicit trim on captures to remove leading artifacts.
 */
export async function parseBuildState(logsDir: string): Promise<PhaseData | null> {
  const content = await readFileOrNull(join(logsDir, 'assemble-state.md'));
  if (!content) return null;

  const phases: Array<{ name: string; status: string }> = [];
  const re = /\|\s*(?:\d+\.\s*)?(.+?)\s*\|\s*(COMPLETE|IN PROGRESS|NOT STARTED|PENDING|SKIPPED)\s*\|/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim().replace(/^\|\s*/, '');
    if (name === 'Phase' || name === 'Status' || name.startsWith('-') || name === '') continue;
    const raw = m[2].trim();
    const normalized = raw === 'IN PROGRESS' ? 'active' : raw === 'NOT STARTED' ? 'pending' : raw.toLowerCase();
    phases.push({ name, status: normalized });
  }

  return phases.length > 0 ? { phases } : null;
}

function countSeverity(content: string, severity: string): number {
  const tableHits = (content.match(new RegExp(`\\|\\s*${severity}\\s*\\|`, 'gi')) || []).length;
  const boldHits = (content.match(new RegExp(`\\*\\*${severity}\\*\\*`, 'gi')) || []).length;
  return tableHits + boldHits;
}

/**
 * Parse findings — prefer Known Issues from build-state.md (curated, reflects open issues only).
 * Falls back to regex counting across log files (historical totals, may overcount).
 */
export async function parseFindings(logsDir: string): Promise<FindingCounts> {
  const counts: FindingCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  const buildState = await readFileOrNull(join(logsDir, 'build-state.md'));
  if (buildState) {
    const knownIssuesMatch = buildState.match(/## Known Issues[\s\S]*?(?=\n## |\n---|$)/);
    if (knownIssuesMatch) {
      const section = knownIssuesMatch[0];
      counts.critical = countSeverity(section, 'CRITICAL');
      counts.high = countSeverity(section, 'HIGH');
      counts.medium = countSeverity(section, 'MEDIUM');
      counts.low = countSeverity(section, 'LOW');
      return counts;
    }
  }

  try {
    const files = await readdir(logsDir);
    const logFiles = files.filter(f => f.startsWith('phase-') || f === 'gauntlet-state.md');
    for (const file of logFiles) {
      const content = await readFileOrNull(join(logsDir, file));
      if (!content) continue;
      counts.critical += countSeverity(content, 'CRITICAL');
      counts.high += countSeverity(content, 'HIGH');
      counts.medium += countSeverity(content, 'MEDIUM');
      counts.low += countSeverity(content, 'LOW');
    }
  } catch { /* no logs directory */ }
  return counts;
}

/** Read deploy log from project logs or .voidforge directory. Also reads deploy-state.md (v15.0). */
export async function readDeployLog(logsDir: string): Promise<DeployData | null> {
  const jsonPaths = [
    join(logsDir, 'deploy-log.json'),
    join(VOIDFORGE_DIR, 'deploys', 'latest.json'),
  ];
  for (const p of jsonPaths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      return {
        url: String(data.url || ''),
        healthy: Boolean(data.healthy),
        target: String(data.target || ''),
        timestamp: String(data.timestamp || ''),
      };
    } catch { continue; }
  }

  const deployState = await readFileOrNull(join(logsDir, 'deploy-state.md'));
  if (deployState) {
    const urlMatch = deployState.match(/(?:URL|Target):\s*(.+?)(?:\n|$)/i);
    const statusMatch = deployState.match(/Status:\s*(.+?)(?:\n|$)/i);
    const timestampMatch = deployState.match(/(?:Last deployed|Timestamp):\s*(.+?)(?:\n|$)/i);
    const commitMatch = deployState.match(/Commit:\s*(.+?)(?:\n|$)/i);
    if (urlMatch || statusMatch) {
      return {
        url: urlMatch ? urlMatch[1].trim() : '',
        healthy: statusMatch ? statusMatch[1].trim().toLowerCase() === 'healthy' : false,
        target: '',
        timestamp: timestampMatch ? timestampMatch[1].trim() : '',
        commit: commitMatch ? commitMatch[1].trim() : undefined,
      };
    }
  }

  return null;
}

/** Detect deployment drift — compare deployed commit against current HEAD. */
export async function detectDeployDrift(logsDir: string, projectDir: string): Promise<{
  deployed_commit: string | null;
  head_commit: string | null;
  drifted: boolean;
} | null> {
  const deployState = await readFileOrNull(join(logsDir, 'deploy-state.md'));
  let deployedCommit: string | null = null;
  if (deployState) {
    const match = deployState.match(/Commit:\s*(\w+)/);
    if (match) deployedCommit = match[1];
  }
  if (!deployedCommit) return null;

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const result = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectDir, timeout: 5000 });
    const headCommit = result.stdout.trim();
    return {
      deployed_commit: deployedCommit,
      head_commit: headCommit,
      drifted: deployedCommit !== headCommit,
    };
  } catch {
    return { deployed_commit: deployedCommit, head_commit: null, drifted: true };
  }
}

/** Read current version from VERSION.md. */
export async function readVersion(projectDir: string): Promise<{ version: string; branch: string }> {
  const content = await readFileOrNull(join(projectDir, 'VERSION.md'));
  if (!content) return { version: 'unknown', branch: 'unknown' };
  const match = content.match(/\*\*Current:\*\*\s*([\d.]+)/);
  return { version: match ? match[1] : 'unknown', branch: 'main' };
}

// ── Context Stats (Status Line Bridge) — GLOBAL ──

export interface ContextStats {
  percent: number | null;
  tokens: number | null;
  output_tokens: number | null;
  window_size: number | null;
  model: string | null;
  cost: number | null;
  session_id: string | null;
  updated_at: number | null;
}

const STALENESS_THRESHOLD_MS = 60000; // 60 seconds

/**
 * Read context stats from the Status Line bridge (GLOBAL — not project-scoped).
 * Reads per-session files (~/.voidforge/context-stats-*.json) and returns the most recent.
 */
export async function readContextStats(): Promise<ContextStats | null> {
  try {
    const files = await readdir(VOIDFORGE_DIR);
    const statsFiles = files.filter(f => f.startsWith('context-stats-') && f.endsWith('.json'));
    if (statsFiles.length === 0) return null;

    let mostRecent: ContextStats | null = null;
    let latestTime = 0;
    const now = Date.now() / 1000;
    const CLEANUP_AGE_S = 300;

    for (const file of statsFiles) {
      const filePath = join(VOIDFORGE_DIR, file);
      const content = await readFileOrNull(filePath);
      if (!content) continue;
      try {
        const data = JSON.parse(content) as ContextStats;
        if (!data.updated_at) continue;
        if (now - data.updated_at > CLEANUP_AGE_S) {
          try { await unlink(filePath); } catch { /* ignore */ }
          continue;
        }
        if (now - data.updated_at > STALENESS_THRESHOLD_MS / 1000) continue;
        if (data.updated_at > latestTime) {
          latestTime = data.updated_at;
          mostRecent = data;
        }
      } catch { continue; }
    }

    return mostRecent;
  } catch {
    return null;
  }
}

// ── Tests Panel ──────────────────────────

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
  duration_ms?: number;
  last_run?: string;
  failures?: Array<{ name: string; message: string }>;
}

/** Read test results from test-results.json (written by test runner or hook). */
export async function readTestResults(projectDir: string, logsDir: string): Promise<TestResults | null> {
  const paths = [
    join(projectDir, 'test-results.json'),
    join(logsDir, 'test-results.json'),
  ];
  for (const p of paths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try {
      const data = JSON.parse(content) as TestResults;
      if (typeof data.total === 'number') return data;
    } catch { continue; }
  }
  return null;
}

// ── Project-Specific Panels (config-driven) ──

export interface DangerRoomConfig {
  health_endpoint?: string;
  pm2_process?: string;
  panels?: string[];
}

/** Read danger-room.config.json for project-specific panel settings. */
export async function readDashboardConfig(projectDir: string): Promise<DangerRoomConfig> {
  const paths = [
    join(projectDir, 'wizard', 'danger-room.config.json'),
    join(projectDir, 'danger-room.config.json'),
  ];
  for (const p of paths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try { return JSON.parse(content) as DangerRoomConfig; } catch { continue; }
  }
  return {};
}

/** Read git status for the Git Status panel. */
export async function readGitStatus(projectDir: string): Promise<{
  branch: string;
  uncommitted: number;
  ahead: number;
  behind: number;
  lastCommit: string;
} | null> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    const [branchResult, statusResult, logResult] = await Promise.all([
      exec('git', ['branch', '--show-current'], { cwd: projectDir, timeout: 5000 }).catch(() => ({ stdout: 'unknown' })),
      exec('git', ['status', '--porcelain'], { cwd: projectDir, timeout: 5000 }).catch(() => ({ stdout: '' })),
      exec('git', ['log', '--oneline', '-1'], { cwd: projectDir, timeout: 5000 }).catch(() => ({ stdout: '—' })),
    ]);

    const branch = branchResult.stdout.trim() || 'unknown';
    const uncommitted = statusResult.stdout.trim().split('\n').filter(Boolean).length;
    const lastCommit = logResult.stdout.trim();

    let ahead = 0;
    let behind = 0;
    try {
      const abResult = await exec('git', ['rev-list', '--count', '--left-right', `origin/${branch}...HEAD`], { cwd: projectDir, timeout: 5000 });
      const parts = abResult.stdout.trim().split('\t');
      if (parts.length === 2) {
        behind = parseInt(parts[0]) || 0;
        ahead = parseInt(parts[1]) || 0;
      }
    } catch { /* no upstream — normal for some branches */ }

    return { branch, uncommitted, ahead, behind, lastCommit };
  } catch {
    return null;
  }
}
