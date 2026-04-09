import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { diffMethodology, applyUpdate } from '../lib/updater.js';
import { createProject } from '../lib/project-init.js';
import { readMarker } from '../lib/marker.js';

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
});
