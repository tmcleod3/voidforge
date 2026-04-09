/**
 * Migration from v20.x — detects old-model projects (embedded wizard/)
 * and converts them to v21.0 (standalone wizard, methodology-only projects).
 */

import { readdir, readFile, rm, cp, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createMarker, writeMarker } from './marker.js';

// ── Types ────────────────────────────────────────────────

export interface MigrationPlan {
  projectDir: string;
  hasWizardDir: boolean;
  wizardFileCount: number;
  hasPackageJson: boolean;
  voidforgeDeps: string[];
  hasMethodology: boolean;
  hasMarker: boolean;
}

export interface MigrationResult {
  success: boolean;
  backupDir: string;
  wizardFilesRemoved: number;
  depsRemoved: string[];
  markerCreated: boolean;
}

// ── Detection ────────────────────────────────────────────

async function countFiles(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Detect if a directory is a v20.x project (has embedded wizard/).
 */
export async function detectV20Project(dir: string): Promise<MigrationPlan> {
  const projectDir = resolve(dir);
  const wizardDir = join(projectDir, 'wizard');
  const hasWizardDir = existsSync(wizardDir) && existsSync(join(wizardDir, 'server.ts'));
  const wizardFileCount = hasWizardDir ? await countFiles(wizardDir) : 0;

  // Check package.json for VoidForge dependencies
  const pkgPath = join(projectDir, 'package.json');
  const hasPackageJson = existsSync(pkgPath);
  let voidforgeDeps: string[] = [];

  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      voidforgeDeps = Object.keys(allDeps).filter(d =>
        d.startsWith('@aws-sdk/') || d === 'node-pty' || d === 'ws',
      );
    } catch {
      // Invalid package.json
    }
  }

  const hasMethodology = existsSync(join(projectDir, 'CLAUDE.md'));
  const hasMarker = existsSync(join(projectDir, '.voidforge'));

  return {
    projectDir,
    hasWizardDir,
    wizardFileCount,
    hasPackageJson,
    voidforgeDeps,
    hasMethodology,
    hasMarker,
  };
}

// ── Backup ───────────────────────────────────────────────

async function createBackup(projectDir: string): Promise<string> {
  const { homedir } = await import('node:os');
  const backupBase = join(homedir(), '.voidforge', 'migration-backup');
  await mkdir(backupBase, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const projectName = projectDir.split('/').pop() ?? 'project';
  const backupDir = join(backupBase, `${projectName}-${timestamp}`);
  await mkdir(backupDir);

  // Backup wizard/ directory
  const wizardDir = join(projectDir, 'wizard');
  if (existsSync(wizardDir)) {
    await cp(wizardDir, join(backupDir, 'wizard'), { recursive: true });
  }

  // Backup package.json
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    await cp(pkgPath, join(backupDir, 'package.json'));
  }

  // Backup package-lock.json
  const lockPath = join(projectDir, 'package-lock.json');
  if (existsSync(lockPath)) {
    await cp(lockPath, join(backupDir, 'package-lock.json'));
  }

  return backupDir;
}

// ── Migration ────────────────────────────────────────────

/**
 * Migrate a v20.x project to v21.0.
 *
 * 1. Create backup at ~/.voidforge/migration-backup/
 * 2. Remove wizard/ directory
 * 3. Remove VoidForge deps from package.json
 * 4. Add .voidforge marker file
 * 5. Keep all methodology files in place
 */
export async function migrateProject(
  projectDir: string,
  dryRun: boolean = false,
): Promise<MigrationResult> {
  const plan = await detectV20Project(projectDir);

  if (!plan.hasWizardDir) {
    throw new Error('No wizard/ directory found — this is not a v20.x project.');
  }

  if (plan.hasMarker) {
    throw new Error('Project already has a .voidforge marker — already migrated?');
  }

  if (dryRun) {
    return {
      success: true,
      backupDir: '(dry run — no backup created)',
      wizardFilesRemoved: plan.wizardFileCount,
      depsRemoved: plan.voidforgeDeps,
      markerCreated: true,
    };
  }

  // 1. Create backup
  const backupDir = await createBackup(projectDir);

  // 2. Remove wizard/ directory
  const wizardDir = join(projectDir, 'wizard');
  await rm(wizardDir, { recursive: true, force: true });

  // 3. Remove VoidForge deps from package.json
  const depsRemoved: string[] = [];
  const pkgPath = join(projectDir, 'package.json');
  if (plan.hasPackageJson && plan.voidforgeDeps.length > 0) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      for (const dep of plan.voidforgeDeps) {
        if (pkg.dependencies?.[dep]) {
          delete pkg.dependencies[dep];
          depsRemoved.push(dep);
        }
        if (pkg.devDependencies?.[dep]) {
          delete pkg.devDependencies[dep];
          depsRemoved.push(dep);
        }
      }

      const { writeFile } = await import('node:fs/promises');
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    } catch {
      // package.json modification failed — non-fatal
    }
  }

  // 4. Write .voidforge marker
  const marker = createMarker('21.0.0', 'full');
  await writeMarker(projectDir, marker);

  // 5. Remove old config files that moved to the wizard package
  const oldConfigs = ['vitest.config.ts', 'playwright.config.ts'];
  for (const config of oldConfigs) {
    const configPath = join(projectDir, config);
    if (existsSync(configPath)) {
      await rm(configPath);
    }
  }

  // 6. Remove wizard-specific scripts from package.json
  const scriptsDir = join(projectDir, 'scripts');
  const wizardScripts = ['voidforge.ts', 'danger-room-feed.sh', 'new-project.sh', 'vault-read.ts'];
  for (const script of wizardScripts) {
    const scriptPath = join(scriptsDir, script);
    if (existsSync(scriptPath)) {
      await rm(scriptPath);
    }
  }

  return {
    success: true,
    backupDir,
    wizardFilesRemoved: plan.wizardFileCount,
    depsRemoved,
    markerCreated: true,
  };
}

// ── Rollback ─────────────────────────────────────────────

export async function rollbackMigration(
  projectDir: string,
  backupDir: string,
): Promise<void> {
  // Restore wizard/
  const wizardBackup = join(backupDir, 'wizard');
  if (existsSync(wizardBackup)) {
    await cp(wizardBackup, join(projectDir, 'wizard'), { recursive: true });
  }

  // Restore package.json
  const pkgBackup = join(backupDir, 'package.json');
  if (existsSync(pkgBackup)) {
    await cp(pkgBackup, join(projectDir, 'package.json'));
  }

  // Restore package-lock.json
  const lockBackup = join(backupDir, 'package-lock.json');
  if (existsSync(lockBackup)) {
    await cp(lockBackup, join(projectDir, 'package-lock.json'));
  }

  // Remove marker (wasn't there before migration)
  const markerPath = join(projectDir, '.voidforge');
  if (existsSync(markerPath)) {
    await rm(markerPath);
  }
}
