/**
 * Update mechanisms — methodology update (replaces /void git-fetch),
 * self-update, and extension update.
 */

import { readFile, readdir, cp, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { readMarker, writeMarker, DEFAULT_CLAUDE_MD_STRATEGY, isAutowireOptedOut } from './marker.js';
import { planClaudeMdUpdate, UPSTREAM_SUFFIX } from './claude-md-strategy.js';
import type { ClaudeMdAction } from './claude-md-strategy.js';
import { mergeStatuslineSettings, mergeSettingsHook } from './project-init.js';

// ── Types ────────────────────────────────────────────────

export interface UpdatePlan {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: number;
  /** Non-fatal advisories surfaced to the operator (e.g. a global statusLine that
   *  will shadow the auto-wired /contextmeter meter — #390). */
  warnings: string[];
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
/**
 * #390: `statusLine` is a single-winner slot across the settings hierarchy. A
 * statusLine in `~/.claude/settings.json` (commonly set by native `/statusline`)
 * or `.claude/settings.local.json` that isn't the VoidForge meter will shadow the
 * project meter even when the project wiring is correct. Detect it so `update`
 * WARNS instead of silently wiring a meter that can never render. Returns the
 * shadowing file path, or null.
 */
async function detectShadowingStatusLine(projectDir: string): Promise<string | null> {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  const candidates = [
    join(home, '.claude', 'settings.json'),
    join(projectDir, '.claude', 'settings.local.json'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const s = JSON.parse(await readFile(file, 'utf-8')) as { statusLine?: { command?: unknown } };
      const cmd = s?.statusLine?.command;
      if (typeof cmd === 'string' && !cmd.includes('voidforge-statusline.sh')) return file;
    } catch {
      // unreadable — ignore
    }
  }
  return null;
}

/** #392: ensure a pattern is present in the project's .gitignore (append if absent). */
async function ensureGitignored(projectDir: string, pattern: string): Promise<void> {
  const gi = join(projectDir, '.gitignore');
  let body = '';
  if (existsSync(gi)) {
    try {
      body = await readFile(gi, 'utf-8');
    } catch {
      return;
    }
    if (body.split('\n').some((l) => l.trim() === pattern)) return; // already covered
  }
  const prefix = body.length > 0 && !body.endsWith('\n') ? '\n' : '';
  try {
    await writeFile(gi, `${body}${prefix}${pattern}\n`, 'utf-8');
  } catch {
    // best-effort
  }
}

export type EscalationResult = 'escalated' | 'blocked' | 'noop';

/**
 * #392: escalate the /contextmeter `statusLine` to Local scope (`.claude/settings.local.json`)
 * so it outranks a Project/User competitor — the non-destructive shadow resolution, now on the
 * `update` path too. Only the statusLine escalates (hooks merge across scopes, so the awareness
 * hook stays in Project). The user's global `~/.claude/settings.json` is never touched.
 *   'escalated' — wrote the meter's statusLine to Local (Local had no competing statusLine)
 *   'blocked'   — Local already has a NON-meter statusLine; a non-interactive update must not
 *                 clobber a user file, so it warns and defers to interactive `/contextmeter`
 *   'noop'      — nothing to do (no snippet / Local already carries our meter)
 */
async function escalateStatuslineToLocal(
  projectDir: string,
  snippetDir: string,
  opts: { dryRun?: boolean } = {},
): Promise<EscalationResult> {
  const snippetPath = join(snippetDir, 'settings-snippet.json');
  if (!existsSync(snippetPath)) return 'noop';
  let snippetStatusLine: unknown;
  try {
    snippetStatusLine = (JSON.parse(await readFile(snippetPath, 'utf-8')) as { statusLine?: unknown }).statusLine;
  } catch {
    return 'noop';
  }
  if (!snippetStatusLine) return 'noop';

  const localPath = join(projectDir, '.claude', 'settings.local.json');
  let local: Record<string, unknown> = {};
  if (existsSync(localPath)) {
    try {
      local = JSON.parse(await readFile(localPath, 'utf-8'));
    } catch {
      return 'noop';
    }
  }
  const existing = (local.statusLine ?? null) as { command?: unknown } | null;
  if (existing) {
    const cmd = existing.command;
    if (typeof cmd === 'string' && cmd.includes('voidforge-statusline.sh')) return 'noop'; // already ours
    return 'blocked'; // non-meter Local statusLine — never clobber on a non-interactive update
  }

  if (!opts.dryRun) {
    local.statusLine = snippetStatusLine;
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(projectDir, '.claude'), { recursive: true });
    await writeFile(localPath, JSON.stringify(local, null, 2) + '\n', 'utf-8');
    await ensureGitignored(projectDir, '.claude/settings.local.json');
  }
  return 'escalated';
}

/**
 * Paths the updater SYNTHESIZES or WIRES in code rather than copying verbatim from the
 * methodology source (#393 RC-2, durable SSOT). CLAUDE.md is applied via the
 * non-destructive strategy; `.claude/settings.json`/`.local.json` are merged/escalated
 * in code — the methodology source carries no project settings file, so handing any of
 * these to the generic `cp(source → dest)` copies a non-existent path and THROWS,
 * aborting the whole update. This single set is consulted by BOTH `diffMethodology` (so a
 * wired file is never planned for the copy loop) and `applyUpdate` (the copy-skip), keeping
 * the diff-reporter and the copy-skip in lockstep — a future wired file added here can't
 * reintroduce the v23.25.0 crash.
 */
export const WIRED_NOT_COPIED = new Set<string>([
  'CLAUDE.md',
  `CLAUDE.md${UPSTREAM_SUFFIX}`,
  '.claude/settings.json',
  '.claude/settings.local.json',
]);

export async function diffMethodology(projectDir: string): Promise<UpdatePlan> {
  const sourceRoot = await resolveMethodologySource();
  const plan: UpdatePlan = { added: [], modified: [], removed: [], unchanged: 0, warnings: [] };

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
    // Context-meter status line + awareness hook (/contextmeter). Scripts propagate here;
    // activation (statusLine + UserPromptSubmit hook in settings.json) is wired below the
    // same way `init` does it, so `update` auto-activates the meter too (#384 follow-up).
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
    if (WIRED_NOT_COPIED.has(file)) continue; // wired in code, not copied (#393 RC-2)
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
      if (WIRED_NOT_COPIED.has(`${dest}/${file}`)) continue; // wired in code, not copied (#393 RC-2)
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

  // Settings auto-activation on update (#384 follow-up + #387 RC-2). `update` wires both
  // the /contextmeter statusLine/hook AND the Silver Surfer gate's PreToolUse hook into
  // .claude/settings.json the same default-on way `init` does — UNLESS the project recorded
  // a persistent opt-out for that key in its .voidforge marker. Snippets are read from the
  // SOURCE (the project may not have the scripts yet on this update); both merges are
  // idempotent + non-clobbering, so they report "pending" only when a real change is due.
  const marker = await readMarker(projectDir);
  let settingsPending = false;
  if (!isAutowireOptedOut(marker, 'contextmeter')) {
    settingsPending ||= await mergeStatuslineSettings(projectDir, {
      dryRun: true,
      snippetDir: join(sourceRoot, 'scripts', 'statusline'),
    });
  }
  if (!isAutowireOptedOut(marker, 'surfer-gate')) {
    settingsPending ||= await mergeSettingsHook(projectDir, {
      dryRun: true,
      snippetDir: join(sourceRoot, 'scripts', 'surfer-gate'),
    });
  }
  if (settingsPending) {
    const settingsEntry = '.claude/settings.json';
    if (!plan.modified.includes(settingsEntry) && !plan.added.includes(settingsEntry)) {
      plan.modified.push(settingsEntry);
    }
  }

  // #390/#392: if a higher/equal-precedence statusLine would shadow the project meter,
  // `update` resolves it by escalating the meter to Local scope (non-destructive) rather
  // than wiring a meter that can't render and claiming success. Report what it will do.
  if (!isAutowireOptedOut(marker, 'contextmeter')) {
    const shadow = await detectShadowingStatusLine(projectDir);
    if (shadow) {
      const esc = await escalateStatuslineToLocal(projectDir, join(sourceRoot, 'scripts', 'statusline'), { dryRun: true });
      if (esc === 'escalated') {
        const entry = '.claude/settings.local.json';
        if (!plan.modified.includes(entry) && !plan.added.includes(entry)) plan.modified.push(entry);
        plan.warnings.push(
          `A statusLine in ${shadow} would shadow the /contextmeter meter — escalating the meter to ` +
          `.claude/settings.local.json (Local scope, gitignored) so it wins, without touching your global settings.`,
        );
      } else if (esc === 'blocked') {
        plan.warnings.push(
          `A statusLine in .claude/settings.local.json shadows the /contextmeter meter and can't be escalated ` +
          `over non-destructively. Run /contextmeter to resolve it with consent.`,
        );
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

  // Skip from the generic verbatim copy loop the paths the updater wires in code rather
  // than copying from source — CLAUDE.md (non-destructive strategy, above) and
  // .claude/settings.json/.local.json (merged/escalated below). WIRED_NOT_COPIED is the
  // SSOT shared with diffMethodology so the copy-skip and the diff planner never drift
  // (#393 RC-2); a wired file handed to `cp` would copy a non-existent source and throw.

  // Copy added + modified files
  const { mkdir } = await import('node:fs/promises');
  for (const file of [...plan.added, ...plan.modified]) {
    if (WIRED_NOT_COPIED.has(file)) continue;

    const srcPath = join(sourceRoot, file);
    const destPath = join(projectDir, file);
    const destDir = join(destPath, '..');
    await mkdir(destDir, { recursive: true });
    await cp(srcPath, destPath);
  }

  // Settings auto-activation on update (init/update parity invariant — #387 RC-2).
  // Every init-time `.claude/settings.json` wiring has an update-time counterpart here,
  // so `update` never ships inert scripts. Both merges are idempotent + non-clobbering
  // (never overwrite a user's own statusLine, never duplicate a hook), and each is gated
  // on the project's persistent opt-out marker so a deliberate decline survives updates:
  //   - /contextmeter statusLine + awareness hook (opt out: 'contextmeter')
  //   - Silver Surfer gate PreToolUse hook (opt out: 'surfer-gate')
  const marker = await readMarker(projectDir);
  if (!isAutowireOptedOut(marker, 'contextmeter')) {
    await mergeStatuslineSettings(projectDir);
    // #392: if a competitor would shadow the Project meter, escalate to Local scope
    // (non-destructive — never touches the user's global ~/.claude/settings.json, and
    // refuses to clobber a non-meter Local statusLine).
    if (await detectShadowingStatusLine(projectDir)) {
      await escalateStatuslineToLocal(projectDir, join(sourceRoot, 'scripts', 'statusline'));
    }
  }
  if (!isAutowireOptedOut(marker, 'surfer-gate')) {
    await mergeSettingsHook(projectDir);
  }

  // Update marker version
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
