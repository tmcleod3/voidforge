import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { diffMethodology, applyUpdate, resolveUpdateMode } from '../lib/updater.js';
import { createProject } from '../lib/project-init.js';
import { readMarker } from '../lib/marker.js';

describe('resolveUpdateMode (--help guard, issue #368)', () => {
  it('returns help for --help and -h, beating every action flag', () => {
    expect(resolveUpdateMode(['update', '--help'])).toBe('help');
    expect(resolveUpdateMode(['update', '-h'])).toBe('help');
    // Help MUST win even when an action flag is also present — the old router
    // fell through to executing the destructive update on `update --help`.
    expect(resolveUpdateMode(['update', '--help', '--self'])).toBe('help');
    expect(resolveUpdateMode(['update', '--extensions', '-h'])).toBe('help');
  });

  it('routes action flags when no help flag is present', () => {
    expect(resolveUpdateMode(['update', '--self'])).toBe('self');
    expect(resolveUpdateMode(['update', '--extensions'])).toBe('extensions');
    expect(resolveUpdateMode(['update'])).toBe('methodology');
    expect(resolveUpdateMode(['update', '--no-self-update'])).toBe('methodology');
  });
});

describe('updater', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-update-'));
    projectDir = join(tempDir, 'test-project');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('diffMethodology', () => {
    it('reports no changes for fresh project', async () => {
      await createProject({ name: 'Fresh', directory: projectDir, skipGit: true });
      const plan = await diffMethodology(projectDir);
      expect(plan.added.length).toBe(0);
      expect(plan.modified.length).toBe(0);
      expect(plan.unchanged).toBeGreaterThan(0);
    });

    it('detects modified files', async () => {
      await createProject({ name: 'Modified', directory: projectDir, skipGit: true });

      // Modify a method file
      const buildPath = join(projectDir, 'docs', 'methods', 'BUILD_PROTOCOL.md');
      if (existsSync(buildPath)) {
        await writeFile(buildPath, '# Modified content\n', 'utf-8');
      }

      const plan = await diffMethodology(projectDir);
      if (existsSync(buildPath)) {
        expect(plan.modified).toContain('docs/methods/BUILD_PROTOCOL.md');
      }
    });

    it('tracks .claude/workflows and scripts/surfer-gate (C2)', async () => {
      await createProject({ name: 'Tracks', directory: projectDir, skipGit: true });

      // Both dirs ship via init; before C2 the updater's diff list omitted them, so
      // `update` never propagated workflow/gate fixes to existing projects. Modifying a
      // file in each must now register as a detected change.
      const wfPath = join(projectDir, '.claude', 'workflows', 'gauntlet.workflow.js');
      const gatePath = join(projectDir, 'scripts', 'surfer-gate', 'check.sh');
      expect(existsSync(wfPath)).toBe(true);
      expect(existsSync(gatePath)).toBe(true);
      await writeFile(wfPath, '// drifted\n', 'utf-8');
      await writeFile(gatePath, '# drifted\n', 'utf-8');

      const plan = await diffMethodology(projectDir);
      expect(plan.modified).toContain('.claude/workflows/gauntlet.workflow.js');
      expect(plan.modified).toContain('scripts/surfer-gate/check.sh');
    });

    it('detects removed files', async () => {
      await createProject({ name: 'Extra', directory: projectDir, skipGit: true });

      // Add a file that doesn't exist in source
      const extraPath = join(projectDir, '.claude', 'commands', 'custom-command.md');
      await writeFile(extraPath, '# Custom command\n', 'utf-8');

      const plan = await diffMethodology(projectDir);
      expect(plan.removed).toContain('.claude/commands/custom-command.md');
    });
  });

  describe('applyUpdate', () => {
    it('restores modified files to source version', async () => {
      await createProject({ name: 'Restore', directory: projectDir, skipGit: true });

      // Modify VERSION.md
      const versionPath = join(projectDir, 'VERSION.md');
      const original = await readFile(versionPath, 'utf-8');
      await writeFile(versionPath, 'Modified version\n', 'utf-8');

      const result = await applyUpdate(projectDir);
      expect(result.applied).toBe(true);
      expect(result.plan.modified).toContain('VERSION.md');

      const restored = await readFile(versionPath, 'utf-8');
      expect(restored).toBe(original);
    });

    it('preserves CLAUDE.md project identity on update', async () => {
      await createProject({
        name: 'Identity Test',
        directory: projectDir,
        oneliner: 'My unique app',
        skipGit: true,
      });

      // Verify identity was injected
      const before = await readFile(join(projectDir, 'CLAUDE.md'), 'utf-8');
      expect(before).toContain('Identity Test');

      // Modify a non-identity part of CLAUDE.md (simulate upstream change)
      // For this test, just verify the update preserves the first 10 lines
      const result = await applyUpdate(projectDir);

      const after = await readFile(join(projectDir, 'CLAUDE.md'), 'utf-8');
      const identityLines = after.split('\n').slice(0, 10).join('\n');
      expect(identityLines).toContain('Identity Test');
    });

    it('updates marker version when changes are applied', async () => {
      await createProject({ name: 'Version', directory: projectDir, skipGit: true });

      // Set old version AND modify a file so update actually triggers
      const marker = await readMarker(projectDir);
      marker!.version = '1.0.0';
      const { writeMarker } = await import('../lib/marker.js');
      await writeMarker(projectDir, marker!);

      const versionPath = join(projectDir, 'VERSION.md');
      await writeFile(versionPath, 'old version content\n', 'utf-8');

      await applyUpdate(projectDir);

      const updated = await readMarker(projectDir);
      expect(updated!.version).not.toBe('1.0.0');
    });

    it('reports no update when already current', async () => {
      await createProject({ name: 'Current', directory: projectDir, skipGit: true });
      const result = await applyUpdate(projectDir);
      expect(result.applied).toBe(false);
      expect(result.plan.added.length).toBe(0);
      expect(result.plan.modified.length).toBe(0);
    });
  });

  // ── Non-destructive CLAUDE.md handling (issue #368) ─────
  describe('CLAUDE.md is never silently clobbered', () => {
    it('preserve (default): customized CLAUDE.md untouched, upstream parked in side file', async () => {
      await createProject({ name: 'Customized', directory: projectDir, skipGit: true });
      const claudePath = join(projectDir, 'CLAUDE.md');

      // Simulate a heavily-customized project CLAUDE.md (the #368 scenario).
      const customized =
        '# CLAUDE.md\n\n## Project\n- **Name:** Customized\n\n' +
        '## Critical Files\nsrc/important.ts\n\n' +
        '## Color Theme\nbrand colors\n\n## SACRED IP Rules\ndo not leak\n';
      await writeFile(claudePath, customized, 'utf-8');

      const plan = await diffMethodology(projectDir);
      expect(plan.claudeMd?.action).toBe('side-file');
      expect(plan.claudeMd?.droppedSections).toContain('Critical Files');
      expect(plan.claudeMd?.droppedSections).toContain('SACRED IP Rules');
      expect(plan.modified).toContain('CLAUDE.md.upstream');
      expect(plan.modified).not.toContain('CLAUDE.md');

      await applyUpdate(projectDir);

      // Original is byte-for-byte intact — nothing dropped.
      const after = await readFile(claudePath, 'utf-8');
      expect(after).toBe(customized);
      expect(after).toContain('## Critical Files');
      expect(after).toContain('## SACRED IP Rules');

      // Upstream methodology parked in the side file for deliberate merge.
      const sideFile = join(projectDir, 'CLAUDE.md.upstream');
      expect(existsSync(sideFile)).toBe(true);
    });

    it('skip: CLAUDE.md and side file are both left untouched', async () => {
      await createProject({ name: 'Skipper', directory: projectDir, skipGit: true });

      const marker = await readMarker(projectDir);
      marker!.claudeMd = 'skip';
      const { writeMarker } = await import('../lib/marker.js');
      await writeMarker(projectDir, marker!);

      const claudePath = join(projectDir, 'CLAUDE.md');
      const customized = '# CLAUDE.md\n\n## Project\ncustom\n\n## My Section\nkeep\n';
      await writeFile(claudePath, customized, 'utf-8');

      await applyUpdate(projectDir);

      expect(await readFile(claudePath, 'utf-8')).toBe(customized);
      expect(existsSync(join(projectDir, 'CLAUDE.md.upstream'))).toBe(false);
    });

    it('merge requested but upstream is un-fenced: safe side-file fallback (never clobbers)', async () => {
      // The shipped upstream CLAUDE.md does not (yet) carry VOIDFORGE fences, so
      // a `merge` request cannot perform a lossless in-place merge. It MUST fall
      // back to the non-destructive side-file path rather than overwrite. (The
      // precise fenced-merge mechanics are covered at the unit level in
      // claude-md-strategy.test.ts where a fenced upstream is supplied.)
      await createProject({ name: 'Merger', directory: projectDir, skipGit: true });

      const marker = await readMarker(projectDir);
      marker!.claudeMd = 'merge';
      const { writeMarker } = await import('../lib/marker.js');
      await writeMarker(projectDir, marker!);

      const claudePath = join(projectDir, 'CLAUDE.md');
      const fenced =
        '# CLAUDE.md\n\n## Project\n- **Name:** Merger\n\n' +
        '<!-- VOIDFORGE:BEGIN methodology -->\nSTALE methodology block\n<!-- VOIDFORGE:END methodology -->\n\n' +
        '## My Project Section\nmust survive\n';
      await writeFile(claudePath, fenced, 'utf-8');

      const plan = await diffMethodology(projectDir);
      expect(plan.claudeMd?.action).toBe('side-file');
      expect(plan.claudeMd?.warnings.join(' ')).toMatch(/no .*fences/i);

      await applyUpdate(projectDir);

      // Original untouched — project section and stale fence both preserved
      // (operator merges deliberately from the side file).
      const after = await readFile(claudePath, 'utf-8');
      expect(after).toBe(fenced);
      expect(after).toContain('## My Project Section');
      expect(existsSync(join(projectDir, 'CLAUDE.md.upstream'))).toBe(true);
    });
  });
});
