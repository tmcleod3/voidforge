/**
 * Treasury Migrator — Migrate global treasury data to per-project paths.
 *
 * v22.0 moved financial paths per-project ({project}/cultivation/treasury/)
 * but left no migration tooling. Existing users with global treasury data
 * at ~/.voidforge/treasury/ see empty dashboards after upgrading.
 *
 * Strategy: Clean break. Global data is archived, not copied. Per-project
 * logs start with genesis hash ('0'). Copying would create false provenance
 * (Riker/Spock dissent, ADR-041 decision).
 *
 * v22.1 Mission 1 — Campaign 30
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, mkdir, rename, writeFile, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getProject, type Project } from './project-registry.js';
import { createProjectContext, type ProjectContext } from './project-scope.js';
import { verifyChain, type HashChainedEntry } from './patterns/financial-transaction.js';

// ── Types ────────────────────────────────────────────────

export interface MigrationPreFlight {
  projectId: string;
  project: Project | null;
  context: ProjectContext | null;
  globalTreasuryDir: string;
  globalTreasuryExists: boolean;
  globalFileCount: number;
  cultivationInstalled: boolean;
  daemonRunning: boolean;
  errors: string[];
  warnings: string[];
}

export interface MigrationManifest {
  version: '22.1';
  migratedAt: string;
  projectId: string;
  projectName: string;
  projectDir: string;
  sourceDir: string;
  archiveDir: string;
  sourceFileCount: number;
  spendLogEntries: number;
  revenueLogEntries: number;
  spendLogHashValid: boolean;
  revenueLogHashValid: boolean;
}

export interface MigrationResult {
  success: boolean;
  manifest: MigrationManifest;
  archiveDir: string;
  treasuryDir: string;
}

// ── Constants ────────────────────────────────────────────

const GLOBAL_TREASURY_DIR = join(homedir(), '.voidforge', 'treasury');
const GLOBAL_ARCHIVE_DIR = join(homedir(), '.voidforge', 'treasury-pre-v22');
const MIGRATION_MARKER = '.migrated';

// Files that stay global (vault + TOTP are user-scoped, not project-scoped)
const GLOBAL_ONLY_FILES = new Set(['vault.enc', 'totp.enc']);

// ── Pre-flight ───────────────────────────────────────────

export async function preFlightCheck(projectId: string): Promise<MigrationPreFlight> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Look up project
  const project = await getProject(projectId);
  let context: ProjectContext | null = null;

  if (!project) {
    errors.push(`Project "${projectId}" not found in registry. Register it first with the wizard.`);
  } else {
    context = createProjectContext(project);

    // Check project directory exists
    if (!existsSync(project.directory)) {
      errors.push(`Project directory does not exist: ${project.directory}`);
    }
  }

  // Check global treasury
  const globalTreasuryExists = existsSync(GLOBAL_TREASURY_DIR);
  let globalFileCount = 0;
  if (globalTreasuryExists) {
    try {
      const files = await readdir(GLOBAL_TREASURY_DIR, { recursive: true });
      globalFileCount = files.length;
    } catch { /* directory may be unreadable */ }
  }

  if (!globalTreasuryExists) {
    warnings.push('No global treasury directory found. Nothing to archive.');
  }

  // Check daemon is not running
  let daemonRunning = false;
  const pidFile = join(homedir(), '.voidforge', 'run', 'heartbeat.pid');
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(await readFile(pidFile, 'utf-8'), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // Check if process exists
          daemonRunning = true;
          errors.push(`Heartbeat daemon is running (PID ${pid}). Stop it before migrating.`);
        } catch {
          // PID file is stale — daemon not running
        }
      }
    } catch { /* can't read PID file */ }
  }

  // Also check per-project daemon
  if (context) {
    if (existsSync(context.pidFile)) {
      try {
        const pid = parseInt(await readFile(context.pidFile, 'utf-8'), 10);
        if (!isNaN(pid)) {
          try {
            process.kill(pid, 0);
            daemonRunning = true;
            errors.push(`Per-project daemon is running (PID ${pid}). Stop it before migrating.`);
          } catch { /* stale */ }
        }
      } catch { /* can't read */ }
    }
  }

  // Check cultivation directory
  let cultivationInstalled = false;
  if (context) {
    cultivationInstalled = existsSync(context.cultivationDir);
    if (!cultivationInstalled) {
      warnings.push('Cultivation not yet installed. Treasury directory will be created.');
    }
  }

  // Check for existing migration
  if (context && existsSync(join(context.treasuryDir, MIGRATION_MARKER))) {
    errors.push('This project has already been migrated. Remove .migrated to force re-migration.');
  }

  return {
    projectId,
    project,
    context,
    globalTreasuryDir: GLOBAL_TREASURY_DIR,
    globalTreasuryExists,
    globalFileCount,
    cultivationInstalled,
    daemonRunning,
    errors,
    warnings,
  };
}

// ── Migration ────────────────────────────────────────────

/**
 * Execute treasury migration for a project.
 *
 * Steps:
 * 1. Archive global treasury to ~/.voidforge/treasury-pre-v22/
 * 2. Create per-project cultivation/treasury/ with genesis files
 * 3. Write migration manifest
 * 4. Set 0700 permissions on treasury directory
 * 5. Validate hash chains in archived logs
 */
export async function migrateTreasury(context: ProjectContext): Promise<MigrationResult> {
  const now = new Date().toISOString();

  // Step 1: Archive global treasury (if it exists and hasn't been archived)
  let sourceFileCount = 0;
  if (existsSync(GLOBAL_TREASURY_DIR) && !existsSync(GLOBAL_ARCHIVE_DIR)) {
    await rename(GLOBAL_TREASURY_DIR, GLOBAL_ARCHIVE_DIR);
    try {
      const files = await readdir(GLOBAL_ARCHIVE_DIR, { recursive: true });
      sourceFileCount = files.length;
    } catch { /* count is best-effort */ }
  } else if (existsSync(GLOBAL_ARCHIVE_DIR)) {
    // Already archived from a previous migration — count existing archive
    try {
      const files = await readdir(GLOBAL_ARCHIVE_DIR, { recursive: true });
      sourceFileCount = files.length;
    } catch { /* count is best-effort */ }
  }

  // Step 2: Create per-project treasury directory structure
  const treasuryDir = context.treasuryDir;
  await mkdir(treasuryDir, { recursive: true });
  await mkdir(join(treasuryDir, 'campaigns'), { recursive: true });
  await mkdir(join(treasuryDir, 'reconciliation'), { recursive: true });
  await mkdir(join(treasuryDir, 'reports'), { recursive: true });

  // Genesis files — clean break, no copy (ADR-041 decision)
  // Per-project logs start with hash '0' — the genesis hash
  const genesisFiles = ['spend-log.jsonl', 'revenue-log.jsonl', 'pending-ops.jsonl'];
  for (const file of genesisFiles) {
    const filePath = join(treasuryDir, file);
    if (!existsSync(filePath)) {
      await writeFile(filePath, '', 'utf-8');
    }
  }

  // Create empty budgets.json if it doesn't exist
  const budgetsPath = join(treasuryDir, 'budgets.json');
  if (!existsSync(budgetsPath)) {
    await writeFile(budgetsPath, JSON.stringify({ totalBudgetCents: 0, allocations: [] }), 'utf-8');
  }

  // Step 3: Validate hash chains in archived logs (informational)
  const spendLogStats = await validateArchivedLog(join(GLOBAL_ARCHIVE_DIR, 'spend-log.jsonl'));
  const revenueLogStats = await validateArchivedLog(join(GLOBAL_ARCHIVE_DIR, 'revenue-log.jsonl'));

  // Step 4: Set 0700 permissions on treasury directory
  await chmod(treasuryDir, 0o700);

  // Step 5: Write migration manifest
  const manifest: MigrationManifest = {
    version: '22.1',
    migratedAt: now,
    projectId: context.id,
    projectName: context.name,
    projectDir: context.directory,
    sourceDir: GLOBAL_ARCHIVE_DIR,
    archiveDir: GLOBAL_ARCHIVE_DIR,
    sourceFileCount,
    spendLogEntries: spendLogStats.entryCount,
    revenueLogEntries: revenueLogStats.entryCount,
    spendLogHashValid: spendLogStats.valid,
    revenueLogHashValid: revenueLogStats.valid,
  };

  await writeFile(
    join(treasuryDir, MIGRATION_MARKER),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return {
    success: true,
    manifest,
    archiveDir: GLOBAL_ARCHIVE_DIR,
    treasuryDir,
  };
}

// ── Hash Chain Validation ────────────────────────────────

interface LogValidation {
  entryCount: number;
  valid: boolean;
  brokenAt?: number;
}

async function validateArchivedLog(logPath: string): Promise<LogValidation> {
  if (!existsSync(logPath)) {
    return { entryCount: 0, valid: true };
  }

  try {
    const raw = await readFile(logPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries: HashChainedEntry<unknown>[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as HashChainedEntry<unknown>);
      } catch {
        // Non-JSON line — chain is broken
        return { entryCount: lines.length, valid: false, brokenAt: entries.length };
      }
    }

    if (entries.length === 0) {
      return { entryCount: 0, valid: true };
    }

    const result = verifyChain(entries);
    return {
      entryCount: entries.length,
      valid: result.valid,
      brokenAt: result.brokenAt,
    };
  } catch {
    return { entryCount: 0, valid: false };
  }
}
