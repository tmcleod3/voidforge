/**
 * Treasury migrator tests — pre-flight checks, archive, genesis files, manifest, permissions.
 * v22.1 Mission 1 — Campaign 30.
 */

import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Mock project-registry to return controlled test data
const mockProjects = new Map<string, { id: string; name: string; directory: string }>();

vi.mock('../lib/project-registry.js', () => ({
  getProject: async (id: string) => mockProjects.get(id) ?? null,
  readRegistry: async () => [...mockProjects.values()],
}));

// Mock tower-auth (not needed for migration)
vi.mock('../lib/tower-auth.js', () => ({
  isRemoteMode: () => false,
  isLanMode: () => false,
  validateSession: () => null,
  parseSessionCookie: () => null,
  getClientIp: () => '127.0.0.1',
}));

// Mock http-helpers (not needed for migration)
vi.mock('../lib/http-helpers.js', () => ({
  sendJson: () => {},
  readFileOrNull: async () => null,
}));

// Mock router (not needed for migration)
vi.mock('../../router.js', () => ({
  getRouteParams: () => ({}),
}));

const { preFlightCheck, migrateTreasury } = await import('../lib/treasury-migrator.js');
const { createProjectContext } = await import('../lib/project-scope.js');

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

describe('Treasury Migrator', () => {
  let projectDir: string;

  beforeEach(async () => {
    mockProjects.clear();
    // Create a fresh project directory for each test
    projectDir = join(tempDir, `project-${Date.now()}`);
    await mkdir(projectDir, { recursive: true });
  });

  describe('preFlightCheck', () => {
    it('rejects unknown project ID', async () => {
      const result = await preFlightCheck('nonexistent');
      expect(result.errors).toContain(
        'Project "nonexistent" not found in registry. Register it first with the wizard.',
      );
    });

    it('passes for valid project with no global treasury', async () => {
      mockProjects.set('proj-1', { id: 'proj-1', name: 'Test', directory: projectDir } as never);
      const result = await preFlightCheck('proj-1');
      expect(result.errors).toHaveLength(0);
      expect(result.project?.name).toBe('Test');
      expect(result.context).not.toBeNull();
    });

    it('detects existing global treasury', async () => {
      const globalDir = join(tempDir, '.voidforge', 'treasury');
      await mkdir(globalDir, { recursive: true });
      await writeFile(join(globalDir, 'spend-log.jsonl'), '', 'utf-8');

      mockProjects.set('proj-2', { id: 'proj-2', name: 'Test2', directory: projectDir } as never);
      const result = await preFlightCheck('proj-2');
      expect(result.globalTreasuryExists).toBe(true);
      expect(result.globalFileCount).toBeGreaterThan(0);
    });

    it('detects already-migrated project', async () => {
      mockProjects.set('proj-3', { id: 'proj-3', name: 'Test3', directory: projectDir } as never);
      const treasuryDir = join(projectDir, 'cultivation', 'treasury');
      await mkdir(treasuryDir, { recursive: true });
      await writeFile(join(treasuryDir, '.migrated'), '{}', 'utf-8');

      const result = await preFlightCheck('proj-3');
      expect(result.errors.some(e => e.includes('already been migrated'))).toBe(true);
    });
  });

  describe('migrateTreasury', () => {
    it('creates per-project treasury structure with genesis files', async () => {
      mockProjects.set('proj-4', { id: 'proj-4', name: 'Genesis', directory: projectDir } as never);
      const project = mockProjects.get('proj-4')!;
      const context = createProjectContext(project as never);

      const result = await migrateTreasury(context);

      expect(result.success).toBe(true);
      expect(existsSync(context.treasuryDir)).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'spend-log.jsonl'))).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'revenue-log.jsonl'))).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'pending-ops.jsonl'))).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'budgets.json'))).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'campaigns'))).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'reconciliation'))).toBe(true);
      expect(existsSync(join(context.treasuryDir, 'reports'))).toBe(true);
    });

    it('writes migration manifest', async () => {
      mockProjects.set('proj-5', { id: 'proj-5', name: 'Manifest', directory: projectDir } as never);
      const project = mockProjects.get('proj-5')!;
      const context = createProjectContext(project as never);

      await migrateTreasury(context);

      const manifestPath = join(context.treasuryDir, '.migrated');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
      expect(manifest.version).toBe('22.1');
      expect(manifest.projectId).toBe('proj-5');
      expect(manifest.projectName).toBe('Manifest');
      expect(manifest.migratedAt).toBeTruthy();
    });

    it('sets 0700 permissions on treasury directory', async () => {
      mockProjects.set('proj-6', { id: 'proj-6', name: 'Perms', directory: projectDir } as never);
      const project = mockProjects.get('proj-6')!;
      const context = createProjectContext(project as never);

      await migrateTreasury(context);

      const stats = await stat(context.treasuryDir);
      // Check owner permissions (0700 = rwx------)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });

    it('archives global treasury to treasury-pre-v22', async () => {
      // Create global treasury with data
      const globalDir = join(tempDir, '.voidforge', 'treasury');
      await mkdir(globalDir, { recursive: true });
      await writeFile(join(globalDir, 'spend-log.jsonl'), '{"test": true}\n', 'utf-8');

      mockProjects.set('proj-7', { id: 'proj-7', name: 'Archive', directory: projectDir } as never);
      const project = mockProjects.get('proj-7')!;
      const context = createProjectContext(project as never);

      const result = await migrateTreasury(context);

      // Global should be renamed to archive
      const archiveDir = join(tempDir, '.voidforge', 'treasury-pre-v22');
      expect(existsSync(archiveDir)).toBe(true);
      expect(result.archiveDir).toBe(archiveDir);

      // Archived file should exist
      expect(existsSync(join(archiveDir, 'spend-log.jsonl'))).toBe(true);
    });

    it('validates hash chains in archived logs', async () => {
      // Create global treasury with valid hash-chained entries
      const globalDir = join(tempDir, '.voidforge', 'treasury');
      // Remove archive if it exists from previous test
      const archiveDir = join(tempDir, '.voidforge', 'treasury-pre-v22');
      if (existsSync(archiveDir)) {
        const { rm } = await import('node:fs/promises');
        await rm(archiveDir, { recursive: true, force: true });
      }
      await mkdir(globalDir, { recursive: true });

      // Write a simple hash-chained entry
      const { createHash } = await import('node:crypto');
      const prevHash = '0';
      const data = { type: 'spend', amountCents: 500 };
      const hash = createHash('sha256')
        .update(JSON.stringify(data) + prevHash)
        .digest('hex');
      const entry = { data, prevHash, hash };
      await writeFile(join(globalDir, 'spend-log.jsonl'), JSON.stringify(entry) + '\n', 'utf-8');
      await writeFile(join(globalDir, 'revenue-log.jsonl'), '', 'utf-8');

      mockProjects.set('proj-8', { id: 'proj-8', name: 'Chain', directory: projectDir } as never);
      const project = mockProjects.get('proj-8')!;
      const context = createProjectContext(project as never);

      const result = await migrateTreasury(context);

      expect(result.manifest.spendLogEntries).toBe(1);
      expect(result.manifest.spendLogHashValid).toBe(true);
      expect(result.manifest.revenueLogEntries).toBe(0);
      expect(result.manifest.revenueLogHashValid).toBe(true);
    });

    it('does not overwrite existing genesis files', async () => {
      mockProjects.set('proj-9', { id: 'proj-9', name: 'NoOverwrite', directory: projectDir } as never);
      const project = mockProjects.get('proj-9')!;
      const context = createProjectContext(project as never);

      // Pre-create a spend log with data
      await mkdir(context.treasuryDir, { recursive: true });
      await writeFile(join(context.treasuryDir, 'spend-log.jsonl'), 'existing-data\n', 'utf-8');

      await migrateTreasury(context);

      const content = await readFile(join(context.treasuryDir, 'spend-log.jsonl'), 'utf-8');
      expect(content).toBe('existing-data\n');
    });
  });
});
