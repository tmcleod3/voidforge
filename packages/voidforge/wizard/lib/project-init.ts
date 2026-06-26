/**
 * Project creation — headless and browser init flows.
 *
 * Creates a new VoidForge project by copying methodology files,
 * injecting project identity, writing the marker, and registering.
 */

import { mkdir, readFile, writeFile, readdir, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import {
  createMarker, writeMarker,
  type VoidForgeMarker,
} from './marker.js';
import { addProject } from './project-registry.js';

// ── Types ────────────────────────────────────────────────

export interface ProjectConfig {
  name: string;
  directory: string;
  oneliner?: string;
  domain?: string;
  repoUrl?: string;
  tier?: VoidForgeMarker['tier'];
  extensions?: string[];
  core?: boolean;      // --core flag: minimal methodology
  skipGit?: boolean;   // skip git init
}

export interface ProjectResult {
  projectDir: string;
  markerId: string;
  filesCreated: number;
}

// ── Methodology Source ───────────────────────────────────

/**
 * Resolves the methodology source directory.
 * In development: monorepo root (where CLAUDE.md lives).
 * In production: the installed voidforge-build-methodology package.
 */
async function resolveMethodologyRoot(): Promise<string> {
  // Development: walk up from this file to find CLAUDE.md at monorepo root
  const dir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'CLAUDE.md')) && existsSync(join(current, '.claude', 'commands'))) {
      return current;
    }
    current = resolve(current, '..');
  }

  // Production: try to resolve from voidforge-build-methodology
  try {
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const methodologyPkg = require_.resolve('voidforge-build-methodology/package.json');
    return resolve(methodologyPkg, '..');
  } catch {
    // Package not installed — expected in development
  }

  throw new Error(
    'Cannot find methodology source. Checked: CLAUDE.md walkup (development), ' +
    'voidforge-build-methodology package (production). Ensure VoidForge is installed correctly.',
  );
}

// ── Copy Methodology ─────────────────────────────────────

async function copyDir(src: string, dest: string): Promise<number> {
  if (!existsSync(src)) return 0;
  await mkdir(dest, { recursive: true });
  let count = 0;
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
      count++;
    }
  }
  return count;
}

async function copyMethodology(
  methodologyRoot: string,
  projectDir: string,
  core: boolean,
): Promise<number> {
  let count = 0;

  // Always copy: CLAUDE.md, VERSION.md
  for (const file of ['CLAUDE.md', 'VERSION.md']) {
    const src = join(methodologyRoot, file);
    if (existsSync(src)) {
      await cp(src, join(projectDir, file));
      count++;
    }
  }

  // Full tier: also copy HOLOCRON.md, CHANGELOG.md
  if (!core) {
    for (const file of ['HOLOCRON.md', 'CHANGELOG.md']) {
      const src = join(methodologyRoot, file);
      if (existsSync(src)) {
        await cp(src, join(projectDir, file));
        count++;
      }
    }
  }

  // Commands
  const commandsSrc = join(methodologyRoot, '.claude', 'commands');
  if (existsSync(commandsSrc)) {
    count += await copyDir(commandsSrc, join(projectDir, '.claude', 'commands'));
  }

  // Agent definitions (ADR-044)
  const agentsSrc = join(methodologyRoot, '.claude', 'agents');
  if (existsSync(agentsSrc)) {
    count += await copyDir(agentsSrc, join(projectDir, '.claude', 'agents'));
  }

  // Dynamic Workflow scripts (ADR-067 — gauntlet/assemble review skeletons).
  // gauntlet.md / assemble.md reference `.claude/workflows/*.workflow.js`; without this
  // a fresh `npx voidforge-build init` ships the command docs but NOT the scripts they
  // invoke. prepack.sh + copy-assets.sh ship them to the npm package and dist/, but this
  // CLI init copy path (methodologyRoot = the installed package) was missed in v23.18.0.
  const workflowsSrc = join(methodologyRoot, '.claude', 'workflows');
  if (existsSync(workflowsSrc)) {
    count += await copyDir(workflowsSrc, join(projectDir, '.claude', 'workflows'));
  }

  // Methods
  const methodsSrc = join(methodologyRoot, 'docs', 'methods');
  if (existsSync(methodsSrc)) {
    count += await copyDir(methodsSrc, join(projectDir, 'docs', 'methods'));
  }

  // Patterns (full tier only)
  if (!core) {
    const patternsSrc = join(methodologyRoot, 'docs', 'patterns');
    if (existsSync(patternsSrc)) {
      count += await copyDir(patternsSrc, join(projectDir, 'docs', 'patterns'));
    }
  }

  // Naming registry
  const registrySrc = join(methodologyRoot, 'docs', 'NAMING_REGISTRY.md');
  if (existsSync(registrySrc)) {
    await mkdir(join(projectDir, 'docs'), { recursive: true });
    await cp(registrySrc, join(projectDir, 'docs', 'NAMING_REGISTRY.md'));
    count++;
  }

  // Agent classification — single source of truth for agent counts (v23.7.0). Command
  // docs derive their counts from it; prepack ships it to the npm package, but this init
  // path omitted it, so init'd projects couldn't resolve the count SSOT.
  const classificationSrc = join(methodologyRoot, 'docs', 'AGENT_CLASSIFICATION.md');
  if (existsSync(classificationSrc)) {
    await mkdir(join(projectDir, 'docs'), { recursive: true });
    await cp(classificationSrc, join(projectDir, 'docs', 'AGENT_CLASSIFICATION.md'));
    count++;
  }

  // Thumper scripts
  const thumperSrc = join(methodologyRoot, 'scripts', 'thumper');
  if (existsSync(thumperSrc)) {
    count += await copyDir(thumperSrc, join(projectDir, 'scripts', 'thumper'));
  }

  // Surfer-gate scripts (ADR-051 enforcement — closes #317).
  // Ship the gate to every new project so the hook can mechanically enforce
  // CLAUDE.md's Silver Surfer procedure. Without this the prose-backstop is
  // the only thing holding the line in consumer installs.
  const surferGateSrc = join(methodologyRoot, 'scripts', 'surfer-gate');
  if (existsSync(surferGateSrc)) {
    count += await copyDir(surferGateSrc, join(projectDir, 'scripts', 'surfer-gate'));
    await chmodShellScripts(join(projectDir, 'scripts', 'surfer-gate'));
    await mergeSettingsHook(projectDir);
  }

  // Context-meter status line (/contextmeter) — default-on. Ship the scripts AND wire
  // the statusLine + UserPromptSubmit awareness hook into settings.json, the same way the
  // surfer-gate hook is wired. Defaults: warn 80% / crit 92% (baked into the scripts).
  // Opt out per project with `/contextmeter --uninstall`.
  const statuslineSrc = join(methodologyRoot, 'scripts', 'statusline');
  if (existsSync(statuslineSrc)) {
    count += await copyDir(statuslineSrc, join(projectDir, 'scripts', 'statusline'));
    await chmodShellScripts(join(projectDir, 'scripts', 'statusline'));
    await mergeStatuslineSettings(projectDir);
  }

  return count;
}

async function chmodShellScripts(dir: string): Promise<void> {
  if (!existsSync(dir)) return;
  const { chmod } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      await chmod(join(dir, entry.name), 0o755);
    }
  }
}

/**
 * Wire the Silver Surfer gate's PreToolUse hook into settings.json.
 * Idempotent + non-clobbering: appends the gate hook only when no equivalent is
 * already present, never touching other hooks. Shared by `init` and `update`
 * (#387 RC-2: `update` auto-wires the gate too). Returns `true` when it makes —
 * or, under `{ dryRun: true }`, WOULD make — a change. `snippetDir` lets the
 * dry-run read the snippet from the methodology SOURCE before the scripts have
 * been copied into the project.
 */
export async function mergeSettingsHook(
  projectDir: string,
  opts: { dryRun?: boolean; snippetDir?: string } = {},
): Promise<boolean> {
  const snippetDir = opts.snippetDir ?? join(projectDir, 'scripts', 'surfer-gate');
  const snippetPath = join(snippetDir, 'settings-snippet.json');
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  if (!existsSync(snippetPath)) return false;

  let snippet: Record<string, unknown>;
  try {
    snippet = JSON.parse(await readFile(snippetPath, 'utf-8'));
  } catch {
    return false;
  }
  const productionHook = snippet?.production_hook as { PreToolUse?: Array<Record<string, unknown>> } | undefined;
  if (!productionHook?.PreToolUse) return false;

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
    } catch {
      // Existing settings.json is unreadable — leave it alone.
      return false;
    }
  }

  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const existingPreTool = (existingHooks.PreToolUse ?? []) as Array<Record<string, unknown>>;
  const alreadyHasGate = existingPreTool.some((entry) => {
    const hooks = (entry?.hooks ?? []) as Array<Record<string, unknown>>;
    return hooks.some((h) => typeof h?.command === 'string' && h.command.includes('surfer-gate/check.sh'));
  });

  if (alreadyHasGate) return false;

  if (!opts.dryRun) {
    settings.hooks = {
      ...existingHooks,
      PreToolUse: [...existingPreTool, ...productionHook.PreToolUse],
    };
    await mkdir(join(projectDir, '.claude'), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  }
  return true;
}

/**
 * Wire the /contextmeter status line + awareness hook into settings.json (default-on).
 * Mirrors mergeSettingsHook: set `statusLine` only when the project doesn't already have
 * one (never clobber a user's), and append the UserPromptSubmit awareness hook unless an
 * equivalent is already present (idempotent). Defaults (warn 80 / crit 92) live in the
 * scripts, so the wired commands carry no env prefix.
 *
 * Shared by `init` (copyMethodology) and `update` (applyUpdate) so `update` auto-activates
 * the meter the same way `init` does (#384 follow-up). Returns `true` when it makes — or,
 * under `{ dryRun: true }`, WOULD make — a change, so the updater can report the pending
 * settings edit and decide `applied`. `snippetDir` lets the dry-run read the snippet from
 * the methodology SOURCE before the scripts have been copied into the project.
 */
export async function mergeStatuslineSettings(
  projectDir: string,
  opts: { dryRun?: boolean; snippetDir?: string } = {},
): Promise<boolean> {
  const snippetDir = opts.snippetDir ?? join(projectDir, 'scripts', 'statusline');
  const snippetPath = join(snippetDir, 'settings-snippet.json');
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  if (!existsSync(snippetPath)) return false;

  let snippet: Record<string, unknown>;
  try {
    snippet = JSON.parse(await readFile(snippetPath, 'utf-8'));
  } catch {
    return false;
  }
  const snippetStatusLine = snippet?.statusLine;
  const snippetUserPrompt = ((snippet?.hooks as Record<string, unknown> | undefined)?.UserPromptSubmit ?? []) as Array<Record<string, unknown>>;
  if (!snippetStatusLine && snippetUserPrompt.length === 0) return false;

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
    } catch {
      // Existing settings.json is unreadable — leave it alone.
      return false;
    }
  }

  let changed = false;

  // statusLine: never clobber a project's existing one.
  if (snippetStatusLine && !settings.statusLine) {
    if (!opts.dryRun) settings.statusLine = snippetStatusLine;
    changed = true;
  }

  // UserPromptSubmit: append the awareness hook unless an equivalent is already present.
  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const existingUserPrompt = (existingHooks.UserPromptSubmit ?? []) as Array<Record<string, unknown>>;
  const alreadyHasMeter = existingUserPrompt.some((entry) => {
    const hooks = (entry?.hooks ?? []) as Array<Record<string, unknown>>;
    return hooks.some((h) => typeof h?.command === 'string' && h.command.includes('context-awareness-hook'));
  });
  if (!alreadyHasMeter && snippetUserPrompt.length > 0) {
    if (!opts.dryRun) {
      settings.hooks = {
        ...existingHooks,
        UserPromptSubmit: [...existingUserPrompt, ...snippetUserPrompt],
      };
    }
    changed = true;
  }

  if (changed && !opts.dryRun) {
    await mkdir(join(projectDir, '.claude'), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  }
  return changed;
}

// ── Identity Injection ───────────────────────────────────

async function injectIdentity(
  projectDir: string,
  config: ProjectConfig,
): Promise<void> {
  const claudePath = join(projectDir, 'CLAUDE.md');
  if (!existsSync(claudePath)) return;

  let content = await readFile(claudePath, 'utf-8');

  // Two paths per ADR-058:
  //   (a) Legacy monorepo template: contains `[PROJECT_NAME]` placeholder → replace.
  //   (b) Published methodology package: `<!-- REMOVE-FOR-NPM-PUBLISH -->` strips
  //       the Project section in prepack.sh, so the downstream CLAUDE.md has no
  //       Project section at all. Insert one after the first `# CLAUDE.md` heading.

  if (content.includes('[PROJECT_NAME]')) {
    content = content.replace('[PROJECT_NAME]', config.name);
    content = content.replace('[ONE_LINE_DESCRIPTION]', config.oneliner ?? '');
    content = content.replace('[DOMAIN]', config.domain ?? '');
    content = content.replace('[REPO_URL]', config.repoUrl ?? '');
  } else if (!content.includes('## Project')) {
    // Published-package case: Project section was stripped. Insert a fresh one.
    const projectBlock = [
      '',
      '## Project',
      '',
      `- **Name:** ${config.name}`,
      `- **One-liner:** ${config.oneliner ?? ''}`,
      `- **Domain:** ${config.domain ?? ''}`,
      `- **Repo:** ${config.repoUrl ?? ''}`,
      '',
    ].join('\n');
    // Insert after the first "# CLAUDE.md" heading, or prepend if no heading.
    const headingMatch = content.match(/^# CLAUDE\.md\s*\n/m);
    if (headingMatch && headingMatch.index !== undefined) {
      const insertAt = headingMatch.index + headingMatch[0].length;
      content = content.slice(0, insertAt) + projectBlock + content.slice(insertAt);
    } else {
      content = `# CLAUDE.md\n${projectBlock}${content}`;
    }
  }
  // If the Project section already exists and has no placeholders, leave it alone.

  await writeFile(claudePath, content, 'utf-8');
}

// ── Git Init ─────────────────────────────────────────────

function gitInit(projectDir: string): boolean {
  try {
    execSync('git init', { cwd: projectDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: projectDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit — created with VoidForge"', {
      cwd: projectDir,
      stdio: 'pipe',
      env: { ...process.env },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Main Entry ───────────────────────────────────────────

export async function createProject(config: ProjectConfig): Promise<ProjectResult> {
  const projectDir = resolve(config.directory);

  // 1. Create directory
  await mkdir(projectDir, { recursive: true });

  // 2. Copy methodology
  const methodologyRoot = await resolveMethodologyRoot();
  const filesCreated = await copyMethodology(
    methodologyRoot,
    projectDir,
    config.core ?? false,
  );

  // 3. Inject project identity
  await injectIdentity(projectDir, config);

  // 4. Write .voidforge marker
  const marker = createMarker(
    '21.0.0',
    config.core ? 'methodology' : 'full',
    config.extensions ?? [],
  );
  await writeMarker(projectDir, marker);

  // 5. Register in project registry
  try {
    await addProject({
      name: config.name,
      directory: projectDir,
      deployTarget: '',
      deployUrl: '',
      sshHost: '',
      framework: 'unknown',
      database: 'none',
      createdAt: marker.created,
      lastBuildPhase: 0,
      lastDeployAt: '',
      healthCheckUrl: '',
      monthlyCost: 0,
      owner: '',
      access: [],
      linkedProjects: [],
    });
  } catch {
    // Registry write is best-effort — don't fail project creation
  }

  // 6. Validate critical files were copied
  if (!existsSync(join(projectDir, 'CLAUDE.md'))) {
    throw new Error('Failed to copy CLAUDE.md — methodology source may be corrupted.');
  }

  // 7. Git init + initial commit
  if (!config.skipGit) {
    const gitOk = gitInit(projectDir);
    if (!gitOk) {
      console.warn('Warning: git init failed. Project created but not version-controlled.');
    }
  }

  return {
    projectDir,
    markerId: marker.id,
    filesCreated: filesCreated + 1, // +1 for .voidforge marker
  };
}
