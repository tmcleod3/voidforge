import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createProject } from '../lib/project-init.js';
import { readMarker } from '../lib/marker.js';

describe('project-init', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-init-'));
    projectDir = join(tempDir, 'test-project');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a project directory with methodology files', async () => {
    const result = await createProject({
      name: 'Test Project',
      directory: projectDir,
      skipGit: true,
    });

    expect(existsSync(projectDir)).toBe(true);
    expect(result.projectDir).toBe(projectDir);
    expect(result.filesCreated).toBeGreaterThan(10);
    expect(result.markerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('copies CLAUDE.md with injected identity', async () => {
    await createProject({
      name: 'My App',
      directory: projectDir,
      oneliner: 'A cool application',
      domain: 'web',
      repoUrl: 'https://github.com/user/my-app',
      skipGit: true,
    });

    const claude = await readFile(join(projectDir, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('**Name:** My App');
    expect(claude).toContain('**One-liner:** A cool application');
    expect(claude).toContain('**Domain:** web');
    expect(claude).toContain('**Repo:** https://github.com/user/my-app');
    expect(claude).not.toContain('[PROJECT_NAME]');
  });

  it('copies command files', async () => {
    await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    expect(existsSync(join(projectDir, '.claude', 'commands', 'build.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'qa.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'commands', 'review.md'))).toBe(true);
  });

  it('copies method docs', async () => {
    await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    expect(existsSync(join(projectDir, 'docs', 'methods', 'BUILD_PROTOCOL.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'methods', 'CAMPAIGN.md'))).toBe(true);
  });

  it('copies Dynamic Workflow scripts and the agent-classification SSOT (ADR-067 / C1)', async () => {
    await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    // gauntlet.md / assemble.md reference these — a fresh init must ship them, not just
    // the command docs that invoke them (the v23.18.0 distribution gap).
    expect(existsSync(join(projectDir, '.claude', 'workflows', 'gauntlet.workflow.js'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'workflows', 'assemble-review.workflow.js'))).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'AGENT_CLASSIFICATION.md'))).toBe(true);
  });

  it('writes .voidforge marker file', async () => {
    const result = await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    const marker = await readMarker(projectDir);
    expect(marker).not.toBeNull();
    expect(marker!.id).toBe(result.markerId);
    expect(marker!.version).toBe('21.0.0');
    expect(marker!.tier).toBe('full');
    expect(marker!.extensions).toEqual([]);
  });

  it('creates core tier with minimal files', async () => {
    await createProject({
      name: 'Minimal',
      directory: projectDir,
      core: true,
      skipGit: true,
    });

    // Core has CLAUDE.md but not HOLOCRON.md
    expect(existsSync(join(projectDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'HOLOCRON.md'))).toBe(false);

    // Core has methods but not patterns
    expect(existsSync(join(projectDir, 'docs', 'methods'))).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'patterns'))).toBe(false);

    const marker = await readMarker(projectDir);
    expect(marker!.tier).toBe('methodology');
  });

  it('creates project even if global registry is unavailable', async () => {
    // Registry write is best-effort; project creation succeeds regardless
    const result = await createProject({
      name: 'Registered Project',
      directory: projectDir,
      skipGit: true,
    });

    expect(result.markerId).toMatch(/^[0-9a-f-]{36}$/);
    const marker = await readMarker(projectDir);
    expect(marker).not.toBeNull();
    expect(existsSync(join(projectDir, 'CLAUDE.md'))).toBe(true);
  });

  it('handles extensions in marker', async () => {
    await createProject({
      name: 'Extended',
      directory: projectDir,
      extensions: ['cultivation', 'danger-room'],
      skipGit: true,
    });

    const marker = await readMarker(projectDir);
    expect(marker!.extensions).toEqual(['cultivation', 'danger-room']);
  });

  it('wires the /contextmeter status line + awareness hook into settings.json (default-on)', async () => {
    await createProject({
      name: 'Test',
      directory: projectDir,
      skipGit: true,
    });

    // The scripts ship to the project.
    expect(existsSync(join(projectDir, 'scripts', 'statusline', 'voidforge-statusline.sh'))).toBe(true);
    expect(existsSync(join(projectDir, 'scripts', 'statusline', 'context-awareness-hook.sh'))).toBe(true);

    type HookCmd = { command?: string };
    type HookEntry = { hooks?: HookCmd[] };
    type Settings = {
      statusLine?: { command?: string };
      hooks?: { UserPromptSubmit?: HookEntry[]; PreToolUse?: HookEntry[] };
    };
    const settings = JSON.parse(
      await readFile(join(projectDir, '.claude', 'settings.json'), 'utf-8'),
    ) as Settings;

    // statusLine points at our renderer.
    expect(settings.statusLine?.command).toContain('statusline/voidforge-statusline.sh');

    // The awareness hook is appended under UserPromptSubmit.
    const hasMeterHook = (settings.hooks?.UserPromptSubmit ?? []).some((e) =>
      (e.hooks ?? []).some((h) => h.command?.includes('context-awareness-hook')),
    );
    expect(hasMeterHook).toBe(true);

    // The surfer-gate PreToolUse hook is wired by init too — the statusline merge must
    // not clobber it (it runs after mergeSettingsHook and preserves existing hooks).
    const hasGate = (settings.hooks?.PreToolUse ?? []).some((e) =>
      (e.hooks ?? []).some((h) => h.command?.includes('surfer-gate/check.sh')),
    );
    expect(hasGate).toBe(true);
  });

  it('creates into existing empty directory', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(projectDir);

    const result = await createProject({
      name: 'Existing Dir',
      directory: projectDir,
      skipGit: true,
    });

    expect(result.filesCreated).toBeGreaterThan(10);
    expect(existsSync(join(projectDir, 'CLAUDE.md'))).toBe(true);
  });
});
