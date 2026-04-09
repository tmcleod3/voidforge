import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { installExtension, uninstallExtension, listExtensions } from '../lib/extensions.js';
import { createMarker, writeMarker, readMarker } from '../lib/marker.js';

describe('extensions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-ext-'));
    // Write a marker so the project is valid
    await writeMarker(tempDir, createMarker('21.0.0'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('listExtensions', () => {
    it('returns available extensions', () => {
      const exts = listExtensions();
      expect(exts.length).toBeGreaterThanOrEqual(2);
      const names = exts.map(e => e.name);
      expect(names).toContain('danger-room');
      expect(names).toContain('cultivation');
    });
  });

  describe('danger-room', () => {
    it('installs config file', async () => {
      const result = await installExtension(tempDir, 'danger-room');
      expect(result.filesCreated).toBe(1);
      expect(existsSync(join(tempDir, 'danger-room.config.json'))).toBe(true);
    });

    it('registers in marker', async () => {
      await installExtension(tempDir, 'danger-room');
      const marker = await readMarker(tempDir);
      expect(marker!.extensions).toContain('danger-room');
    });

    it('uninstalls cleanly', async () => {
      await installExtension(tempDir, 'danger-room');
      await uninstallExtension(tempDir, 'danger-room');
      expect(existsSync(join(tempDir, 'danger-room.config.json'))).toBe(false);
      const marker = await readMarker(tempDir);
      expect(marker!.extensions).not.toContain('danger-room');
    });

    it('rejects duplicate install', async () => {
      await installExtension(tempDir, 'danger-room');
      await expect(installExtension(tempDir, 'danger-room'))
        .rejects.toThrow('already installed');
    });
  });

  describe('cultivation', () => {
    it('installs directory structure with 14 files', async () => {
      const result = await installExtension(tempDir, 'cultivation');
      // 1 config + 12 jobs + 1 .gitignore = 14
      expect(result.filesCreated).toBe(14);
    });

    it('creates heartbeat config', async () => {
      await installExtension(tempDir, 'cultivation');
      expect(existsSync(join(tempDir, 'cultivation', 'heartbeat.config.json'))).toBe(true);
    });

    it('creates 12 job files', async () => {
      await installExtension(tempDir, 'cultivation');
      const jobsDir = join(tempDir, 'cultivation', 'jobs');
      expect(existsSync(join(jobsDir, 'token-refresh.ts'))).toBe(true);
      expect(existsSync(join(jobsDir, 'spend-check.ts'))).toBe(true);
      expect(existsSync(join(jobsDir, 'reconciliation.ts'))).toBe(true);
      expect(existsSync(join(jobsDir, 'ab-evaluation.ts'))).toBe(true);
      expect(existsSync(join(jobsDir, 'audience-refresh.ts'))).toBe(true);
    });

    it('creates treasury directory', async () => {
      await installExtension(tempDir, 'cultivation');
      expect(existsSync(join(tempDir, 'cultivation', 'treasury', 'campaigns'))).toBe(true);
    });

    it('creates .gitignore for runtime state', async () => {
      await installExtension(tempDir, 'cultivation');
      expect(existsSync(join(tempDir, 'cultivation', '.gitignore'))).toBe(true);
    });

    it('creates .gitignore with PID/socket entries', async () => {
      await installExtension(tempDir, 'cultivation');
      const { readFile } = await import('node:fs/promises');
      const gitignore = await readFile(join(tempDir, 'cultivation', '.gitignore'), 'utf-8');
      expect(gitignore).toContain('heartbeat.pid');
      expect(gitignore).toContain('heartbeat.sock');
    });

    it('registers in marker', async () => {
      await installExtension(tempDir, 'cultivation');
      const marker = await readMarker(tempDir);
      expect(marker!.extensions).toContain('cultivation');
    });

    it('uninstalls cleanly', async () => {
      await installExtension(tempDir, 'cultivation');
      await uninstallExtension(tempDir, 'cultivation');
      expect(existsSync(join(tempDir, 'cultivation'))).toBe(false);
      const marker = await readMarker(tempDir);
      expect(marker!.extensions).not.toContain('cultivation');
    });
  });

  describe('errors', () => {
    it('rejects unknown extension', async () => {
      await expect(installExtension(tempDir, 'unknown'))
        .rejects.toThrow('Unknown extension');
    });

    it('rejects install without marker', async () => {
      const noMarkerDir = await mkdtemp(join(tmpdir(), 'voidforge-nomarker-'));
      try {
        await expect(installExtension(noMarkerDir, 'danger-room'))
          .rejects.toThrow('Not a VoidForge project');
      } finally {
        await rm(noMarkerDir, { recursive: true, force: true });
      }
    });

    it('rejects uninstall of not-installed extension', async () => {
      await expect(uninstallExtension(tempDir, 'danger-room'))
        .rejects.toThrow('not installed');
    });
  });
});
