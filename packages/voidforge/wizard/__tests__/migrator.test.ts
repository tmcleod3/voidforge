import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { detectV20Project, migrateProject, rollbackMigration } from '../lib/migrator.js';
import { readMarker } from '../lib/marker.js';

describe('migrator', () => {
  let tempDir: string;
  let projectDir: string;

  async function createV20Project(): Promise<void> {
    await mkdir(join(projectDir, 'wizard'), { recursive: true });
    await writeFile(join(projectDir, 'wizard', 'server.ts'), 'export const startServer = () => {};', 'utf-8');
    await writeFile(join(projectDir, 'wizard', 'router.ts'), 'export const addRoute = () => {};', 'utf-8');
    await mkdir(join(projectDir, 'wizard', 'lib'), { recursive: true });
    await writeFile(join(projectDir, 'wizard', 'lib', 'vault.ts'), '// vault', 'utf-8');
    await writeFile(join(projectDir, 'CLAUDE.md'), '# Project\n', 'utf-8');
    await writeFile(join(projectDir, 'package.json'), JSON.stringify({
      name: 'my-project',
      dependencies: {
        '@aws-sdk/client-ec2': '^3.700.0',
        'ws': '^8.19.0',
        'express': '^4.18.0',
      },
    }, null, 2), 'utf-8');
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-migrate-'));
    projectDir = join(tempDir, 'v20-project');
    await mkdir(projectDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    // Clean up migration backups
    const backupBase = join(homedir(), '.voidforge', 'migration-backup');
    if (existsSync(backupBase)) {
      const { readdir } = await import('node:fs/promises');
      const dirs = await readdir(backupBase);
      for (const d of dirs) {
        if (d.startsWith('v20-project-')) {
          await rm(join(backupBase, d), { recursive: true, force: true });
        }
      }
    }
  });

  describe('detectV20Project', () => {
    it('detects v20.x project with wizard/', async () => {
      await createV20Project();
      const plan = await detectV20Project(projectDir);
      expect(plan.hasWizardDir).toBe(true);
      expect(plan.wizardFileCount).toBe(3); // server.ts, router.ts, lib/vault.ts
      expect(plan.hasPackageJson).toBe(true);
      expect(plan.voidforgeDeps).toContain('@aws-sdk/client-ec2');
      expect(plan.voidforgeDeps).toContain('ws');
      expect(plan.voidforgeDeps).not.toContain('express');
      expect(plan.hasMethodology).toBe(true);
      expect(plan.hasMarker).toBe(false);
    });

    it('returns false for non-v20.x project', async () => {
      await writeFile(join(projectDir, 'CLAUDE.md'), '# Project\n', 'utf-8');
      const plan = await detectV20Project(projectDir);
      expect(plan.hasWizardDir).toBe(false);
      expect(plan.wizardFileCount).toBe(0);
    });
  });

  describe('migrateProject', () => {
    it('dry-run shows plan without changes', async () => {
      await createV20Project();
      const result = await migrateProject(projectDir, true);
      expect(result.success).toBe(true);
      expect(result.wizardFilesRemoved).toBe(3);
      expect(result.depsRemoved).toContain('@aws-sdk/client-ec2');
      // Verify no changes were made
      expect(existsSync(join(projectDir, 'wizard'))).toBe(true);
      expect(existsSync(join(projectDir, '.voidforge'))).toBe(false);
    });

    it('migrates project: removes wizard, adds marker', async () => {
      await createV20Project();
      const result = await migrateProject(projectDir);
      expect(result.success).toBe(true);
      expect(result.markerCreated).toBe(true);

      // wizard/ removed
      expect(existsSync(join(projectDir, 'wizard'))).toBe(false);

      // marker created
      const marker = await readMarker(projectDir);
      expect(marker).not.toBeNull();
      expect(marker!.version).toBe('21.0.0');

      // Methodology preserved
      expect(existsSync(join(projectDir, 'CLAUDE.md'))).toBe(true);
    });

    it('removes VoidForge deps from package.json', async () => {
      await createV20Project();
      await migrateProject(projectDir);

      const pkg = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.dependencies['@aws-sdk/client-ec2']).toBeUndefined();
      expect(pkg.dependencies['ws']).toBeUndefined();
      expect(pkg.dependencies['express']).toBe('^4.18.0'); // Non-VF dep preserved
    });

    it('creates backup in ~/.voidforge/migration-backup/', async () => {
      await createV20Project();
      const result = await migrateProject(projectDir);
      expect(result.backupDir).toContain('migration-backup');
      expect(existsSync(join(result.backupDir, 'wizard', 'server.ts'))).toBe(true);
      expect(existsSync(join(result.backupDir, 'package.json'))).toBe(true);
    });

    it('rejects already-migrated project', async () => {
      await createV20Project();
      await writeFile(join(projectDir, '.voidforge'), '{}', 'utf-8');
      await expect(migrateProject(projectDir)).rejects.toThrow('already migrated');
    });

    it('rejects non-v20.x project', async () => {
      await expect(migrateProject(projectDir)).rejects.toThrow('not a v20.x project');
    });
  });

  describe('rollbackMigration', () => {
    it('restores wizard/ from backup', async () => {
      await createV20Project();
      const result = await migrateProject(projectDir);

      // Verify migration happened
      expect(existsSync(join(projectDir, 'wizard'))).toBe(false);

      // Rollback
      await rollbackMigration(projectDir, result.backupDir);

      // wizard/ restored
      expect(existsSync(join(projectDir, 'wizard', 'server.ts'))).toBe(true);

      // marker removed
      expect(existsSync(join(projectDir, '.voidforge'))).toBe(false);

      // package.json restored
      const pkg = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.dependencies['@aws-sdk/client-ec2']).toBeDefined();
    });
  });
});
