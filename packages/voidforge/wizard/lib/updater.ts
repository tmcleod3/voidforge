/**
 * Update mechanisms — methodology update (replaces /void git-fetch),
 * self-update, and extension update.
 */

import { readFile, readdir, cp, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { readMarker, writeMarker, DEFAULT_CLAUDE_MD_STRATEGY } from './marker.js';
import { planClaudeMdUpdate, UPSTREAM_SUFFIX } from './claude-md-strategy.js';
import type { ClaudeMdAction } from './claude-md-strategy.js';

// ── Types ────────────────────────────────────────────────

export interface UpdatePlan {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: number;
  /** Non-destructive CLAUDE.md handling (issue #368). */
  claudeMd?: {
    action: ClaudeMdAction;
    droppedSections: string[];
    warnings: string[];
    /** Side file written instead of CLAUDE.md, relative to project root. */
    sideFile?: string;
  };
}

export interface UpdateResult {
  applied: boolean;
  plan: UpdatePlan;
  newVersion: string;
}

// ── Update Mode Resolution ───────────────────────────────

export type UpdateMode = 'help' | 'self' | 'extensions' | 'methodology';

/**
 * Decide which `update` mode the given argv selects. Pure — no I/O, no exit.
 *
 * Help MUST win over every action flag (issue #368): `update --help` printed
 * usage but the OLD router fell through and EXECUTED the (destructive) update.
 * Centralizing the precedence here makes that ordering testable and keeps the
 * CLI from re-introducing the bug.
 */
export function resolveUpdateMode(args: string[]): UpdateMode {
  if (args.includes('--help') || args.includes('-h')) return 'help';
  if (args.includes('--self')) return 'self';
  if (args.includes('--extensions')) return 'extensions';
  return 'methodology';
}

// ── Methodology Source Resolution ────────────────────────

async function resolveMethodologySource(): Promise<string> {
  const dir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'CLAUDE.md')) && existsSync(join(current, '.claude', 'commands'))) {
      return current;
    }
    const { resolve } = await import('node:path');
    current = resolve(current, '..');
  }

  try {
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const pkgPath = require_.resolve('voidforge-build-methodology/package.json');
    const { resolve } = await import('node:path');
    return resolve(pkgPath, '..');
  } catch {
    // Not installed
  }

  throw new Error('Cannot find methodology source for update.');
}

// ── Diff ─────────────────────────────────────────────────

async function collectFiles(dir: string, base: string = ''): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Compute the non-destructive CLAUDE.md plan for a project (issue #368).
 * Reads the marker's `claudeMd` strategy (default 'preserve') and delegates the
 * decision to the pure planner. Returns null only when there is no upstream
 * CLAUDE.md to apply.
 */
async function planClaudeMd(sourceRoot: string, projectDir: string) {
  const srcPath = join(sourceRoot, 'CLAUDE.md');
  if (!existsSync(srcPath)) return null;
  const upstream = await readFile(srcPath, 'utf-8');

  const destPath = join(projectDir, 'CLAUDE.md');
  const current = existsSync(destPath) ? await readFile(destPath, 'utf-8') : null;

  const marker = await readMarker(projectDir);
  const strategy = marker?.claudeMd ?? DEFAULT_CLAUDE_MD_STRATEGY;

  return planClaudeMdUpdate(current, upstream, strategy);
}

/**
 * Diff methodology source against project files.
 * Returns a plan showing what would change.
 */
export async function diffMethodology(projectDir: string): Promise<UpdatePlan> {
  const sourceRoot = await resolveMethodologySource();
  const plan: UpdatePlan = { added: [], modified: [], removed: [], unchanged: 0 };

  // Directories to compare
  const dirs = [
    { src: '.claude/commands', dest: '.claude/commands' },
    { src: '.claude/agents', dest: '.claude/agents' },
    // Dynamic Workflow scripts (ADR-067) and the Silver Surfer gate (ADR-051/060/064):
    // both ship to new projects via init but were absent from the updater's diff list, so
    // `npx voidforge-build update` never propagated them — existing projects were stranded
    // on whatever gate/workflow scripts they were created with (e.g. a gate before this
    // release's reap fix). Invocation is via `bash <script>` so exec bits are not required.
    { src: '.claude/workflows', dest: '.claude/workflows' },
    { src: 'docs/methods', dest: 'docs/methods' },
    { src: 'docs/patterns', dest: 'docs/patterns' },
    { src: 'scripts/thumper', dest: 'scripts/thumper' },
    { src: 'scripts/surfer-gate', dest: 'scripts/surfer-gate' },
    // Context-meter status line + awareness hook (/contextmeter). Scripts propagate on
    // update; activation (statusLine + UserPromptSubmit hook in settings.json) stays opt-in.
    { src: 'scripts/statusline', dest: 'scripts/statusline' },
  ];

  // CLAUDE.md is handled via the non-destructive strategy mechanism (issue #368)
  // — never the old "preserve first 10 lines, overwrite the rest" clobber.
  const claudeMdPlan = await planClaudeMd(sourceRoot, projectDir);
  if (claudeMdPlan) {
    plan.claudeMd = {
      action: claudeMdPlan.action,
      droppedSections: claudeMdPlan.droppedSections,
      warnings: claudeMdPlan.warnings,
      sideFile: claudeMdPlan.sideFileContent !== null ? `CLAUDE.md${UPSTREAM_SUFFIX}` : undefined,
    };
    if (claudeMdPlan.action === 'unchanged' || claudeMdPlan.action === 'skip') {
      plan.unchanged++;
    } else if (claudeMdPlan.action === 'side-file') {
      // The side file is the only thing that changes; CLAUDE.md itself is untouched.
      plan.modified.push(`CLAUDE.md${UPSTREAM_SUFFIX}`);
    } else {
      plan.modified.push('CLAUDE.md');
    }
  }

  // Other single files compare/copy verbatim (no special preservation needed).
  const singleFiles = ['HOLOCRON.md', 'VERSION.md'];

  // Check single files
  for (const file of singleFiles) {
    const srcPath = join(sourceRoot, file);
    const destPath = join(projectDir, file);
    if (!existsSync(srcPath)) continue;

    if (!existsSync(destPath)) {
      plan.added.push(file);
    } else {
      const srcContent = await readFile(srcPath, 'utf-8');
      const destContent = await readFile(destPath, 'utf-8');
      if (srcContent !== destContent) plan.modified.push(file);
      else plan.unchanged++;
    }
  }

  // Check directories
  for (const { src, dest } of dirs) {
    const srcDir = join(sourceRoot, src);
    const destDir = join(projectDir, dest);
    const srcFiles = await collectFiles(srcDir);
    const destFiles = await collectFiles(destDir);

    const srcSet = new Set(srcFiles);
    const destSet = new Set(destFiles);

    for (const file of srcFiles) {
      const fullDest = join(destDir, file);
      if (!destSet.has(file)) {
        plan.added.push(`${dest}/${file}`);
      } else {
        const srcContent = await readFile(join(srcDir, file), 'utf-8');
        const destContent = await readFile(fullDest, 'utf-8');
        if (srcContent !== destContent) {
          plan.modified.push(`${dest}/${file}`);
        } else {
          plan.unchanged++;
        }
      }
    }

    // Files in project but not in source (removed upstream)
    for (const file of destFiles) {
      if (!srcSet.has(file)) {
        plan.removed.push(`${dest}/${file}`);
      }
    }
  }

  return plan;
}

// ── Apply Update ─────────────────────────────────────────

/**
 * Apply the update plan — copy new/modified files from source to project.
 * Does NOT delete removed files (user may have customizations).
 */
export async function applyUpdate(projectDir: string): Promise<UpdateResult> {
  const sourceRoot = await resolveMethodologySource();
  const plan = await diffMethodology(projectDir);

  // Read source VERSION.md for new version
  let newVersion = 'unknown';
  const versionPath = join(sourceRoot, 'VERSION.md');
  if (existsSync(versionPath)) {
    const content = await readFile(versionPath, 'utf-8');
    const match = content.match(/(\d+\.\d+\.\d+)/);
    if (match) newVersion = match[1];
  }

  if (plan.added.length === 0 && plan.modified.length === 0) {
    return { applied: false, plan, newVersion };
  }

  // CLAUDE.md: apply the non-destructive strategy decision (issue #368).
  // Never overwrite a customized CLAUDE.md in place. `preserve` writes a side
  // file; `merge` replaces only the fenced block; `skip` does nothing.
  const claudeMdPlan = await planClaudeMd(sourceRoot, projectDir);
  const claudeMdDestPath = join(projectDir, 'CLAUDE.md');
  if (claudeMdPlan) {
    if (claudeMdPlan.claudeMdContent !== null) {
      await writeFile(claudeMdDestPath, claudeMdPlan.claudeMdContent, 'utf-8');
    }
    if (claudeMdPlan.sideFileContent !== null) {
      await writeFile(`${claudeMdDestPath}${UPSTREAM_SUFFIX}`, claudeMdPlan.sideFileContent, 'utf-8');
    }
  }

  // The CLAUDE.md plan entries are handled above — exclude them from the
  // generic verbatim copy loop so we don't double-write or clobber.
  const claudeMdEntries = new Set(['CLAUDE.md', `CLAUDE.md${UPSTREAM_SUFFIX}`]);

  // Copy added + modified files
  const { mkdir } = await import('node:fs/promises');
  for (const file of [...plan.added, ...plan.modified]) {
    if (claudeMdEntries.has(file)) continue;

    const srcPath = join(sourceRoot, file);
    const destPath = join(projectDir, file);
    const destDir = join(destPath, '..');
    await mkdir(destDir, { recursive: true });
    await cp(srcPath, destPath);
  }

  // Update marker version
  const marker = await readMarker(projectDir);
  if (marker) {
    marker.version = newVersion;
    await writeMarker(projectDir, marker);
  }

  return { applied: true, plan, newVersion };
}

// ── Self-Update ──────────────────────────────────────────

export function selfUpdate(): { success: boolean; message: string } {
  try {
    // Strip npm_config_* env vars — they outrank the CLI --registry flag
    // and could redirect install to an attacker-controlled registry (SEC-R2-001).
    // Also drop undefined values — execSync stringifies them to "undefined"
    // which breaks downstream tools (R4-CURSED-002).
    const safeEnv: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && !/^npm_config_/i.test(k)) safeEnv[k] = v;
    }
    execSync('npm install -g voidforge-build@latest --registry=https://registry.npmjs.org/', {
      stdio: 'pipe',
      env: safeEnv,
    });
    return { success: true, message: 'VoidForge updated successfully.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Self-update failed: ${msg}` };
  }
}
