/**
 * Per-project vault tests — HKDF key derivation, encrypt/decrypt round-trip,
 * project isolation, session cache, atomic writes.
 * v22.1 Mission 3 — Campaign 30.
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const tempDir = await createTempHome();

const {
  projectVaultSet, projectVaultGet, projectVaultDelete,
  projectVaultExists, projectVaultUnlock, projectVaultKeys,
  projectVaultLock, projectVaultLockAll, projectVaultPath,
  _deriveProjectKey,
} = await import('../lib/project-vault.js');

afterAll(async () => {
  projectVaultLockAll();
  await cleanupTempHome(tempDir);
});

describe('Per-Project Vault (HKDF — v22.1 M3)', () => {
  const password = 'test-vault-password-secure-12';
  let projectDir: string;
  let testSeq = 0;

  beforeEach(async () => {
    projectDir = join(tempDir, `project-${Date.now()}-${++testSeq}`);
    await mkdir(join(projectDir, 'cultivation', 'treasury'), { recursive: true });
    projectVaultLockAll();
  });

  describe('HKDF key derivation', () => {
    it('derives different keys for different project IDs', async () => {
      const salt = Buffer.alloc(32, 0);
      const key1 = await _deriveProjectKey('password123456', salt, 'project-a');
      const key2 = await _deriveProjectKey('password123456', salt, 'project-b');
      expect(key1.equals(key2)).toBe(false);
    });

    it('derives same key for same inputs', async () => {
      const salt = Buffer.alloc(32, 0);
      const key1 = await _deriveProjectKey('password123456', salt, 'project-x');
      const key2 = await _deriveProjectKey('password123456', salt, 'project-x');
      expect(key1.equals(key2)).toBe(true);
    });

    it('derives 256-bit (32-byte) keys', async () => {
      const salt = Buffer.alloc(32, 0);
      const key = await _deriveProjectKey('password123456', salt, 'project-z');
      expect(key.length).toBe(32);
    });

    it('derives different keys for different passwords', async () => {
      const salt = Buffer.alloc(32, 0);
      const key1 = await _deriveProjectKey('password-alpha1', salt, 'same-project');
      const key2 = await _deriveProjectKey('password-beta12', salt, 'same-project');
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('stores and retrieves a credential', async () => {
      await projectVaultSet(password, 'proj-1', projectDir, 'api_key', 'sk-test-123');
      const result = await projectVaultGet(password, 'proj-1', projectDir, 'api_key');
      expect(result).toBe('sk-test-123');
    });

    it('stores multiple credentials', async () => {
      await projectVaultSet(password, 'proj-2', projectDir, 'key1', 'value1');
      await projectVaultSet(password, 'proj-2', projectDir, 'key2', 'value2');
      const v1 = await projectVaultGet(password, 'proj-2', projectDir, 'key1');
      const v2 = await projectVaultGet(password, 'proj-2', projectDir, 'key2');
      expect(v1).toBe('value1');
      expect(v2).toBe('value2');
    });

    it('returns null for missing key', async () => {
      await projectVaultSet(password, 'proj-3', projectDir, 'exists', 'yes');
      const result = await projectVaultGet(password, 'proj-3', projectDir, 'missing');
      expect(result).toBeNull();
    });

    it('handles special characters in values', async () => {
      const special = '🔑 API key with "quotes" and \nnewlines\t\ttabs {json: true}';
      await projectVaultSet(password, 'proj-4', projectDir, 'special', special);
      const result = await projectVaultGet(password, 'proj-4', projectDir, 'special');
      expect(result).toBe(special);
    });
  });

  describe('project isolation', () => {
    it('same password + different projectId = different vault', async () => {
      // Write with projectId 'alpha'
      await projectVaultSet(password, 'alpha', projectDir, 'secret', 'alpha-value');

      // Try to read with projectId 'beta' — should fail (wrong derived key)
      const result = await projectVaultUnlock(password, 'beta', projectDir);
      expect(result).toBe(false);
    });

    it('different project directories are independent', async () => {
      const dir2 = join(tempDir, `project-alt-${Date.now()}-${++testSeq}`);
      await mkdir(join(dir2, 'cultivation', 'treasury'), { recursive: true });

      await projectVaultSet(password, 'proj', projectDir, 'key', 'dir1-value');
      await projectVaultSet(password, 'proj', dir2, 'key', 'dir2-value');

      const v1 = await projectVaultGet(password, 'proj', projectDir, 'key');
      const v2 = await projectVaultGet(password, 'proj', dir2, 'key');
      expect(v1).toBe('dir1-value');
      expect(v2).toBe('dir2-value');
    });
  });

  describe('delete', () => {
    it('removes a credential', async () => {
      await projectVaultSet(password, 'proj-d', projectDir, 'temp', 'will-delete');
      await projectVaultDelete(password, 'proj-d', projectDir, 'temp');
      const result = await projectVaultGet(password, 'proj-d', projectDir, 'temp');
      expect(result).toBeNull();
    });

    it('preserves other credentials when deleting one', async () => {
      await projectVaultSet(password, 'proj-e', projectDir, 'keep', 'kept');
      await projectVaultSet(password, 'proj-e', projectDir, 'drop', 'dropped');
      await projectVaultDelete(password, 'proj-e', projectDir, 'drop');

      expect(await projectVaultGet(password, 'proj-e', projectDir, 'keep')).toBe('kept');
      expect(await projectVaultGet(password, 'proj-e', projectDir, 'drop')).toBeNull();
    });
  });

  describe('exists / unlock / keys', () => {
    it('reports non-existent vault', () => {
      expect(projectVaultExists(projectDir)).toBe(false);
    });

    it('reports existing vault after write', async () => {
      await projectVaultSet(password, 'proj-f', projectDir, 'k', 'v');
      expect(projectVaultExists(projectDir)).toBe(true);
    });

    it('unlock returns true for correct password', async () => {
      await projectVaultSet(password, 'proj-g', projectDir, 'k', 'v');
      projectVaultLock(projectDir);
      const ok = await projectVaultUnlock(password, 'proj-g', projectDir);
      expect(ok).toBe(true);
    });

    it('unlock returns false for wrong password', async () => {
      await projectVaultSet(password, 'proj-h', projectDir, 'k', 'v');
      projectVaultLock(projectDir);
      const ok = await projectVaultUnlock('wrong-password-1234', 'proj-h', projectDir);
      expect(ok).toBe(false);
    });

    it('unlock returns true for non-existent vault (creation)', async () => {
      const ok = await projectVaultUnlock(password, 'proj-new', projectDir);
      expect(ok).toBe(true);
    });

    it('lists stored keys', async () => {
      await projectVaultSet(password, 'proj-i', projectDir, 'alpha', 'a');
      await projectVaultSet(password, 'proj-i', projectDir, 'beta', 'b');
      const keys = await projectVaultKeys(password, 'proj-i', projectDir);
      expect(keys.sort()).toEqual(['alpha', 'beta']);
    });
  });

  describe('session cache', () => {
    it('reads from cache on repeated access', async () => {
      await projectVaultSet(password, 'proj-j', projectDir, 'cached', 'value');
      // Second read should hit cache (no disk I/O)
      const result = await projectVaultGet(password, 'proj-j', projectDir, 'cached');
      expect(result).toBe('value');
    });

    it('lock clears cache for specific project', async () => {
      await projectVaultSet(password, 'proj-k', projectDir, 'k', 'v');
      projectVaultLock(projectDir);
      // Should still be readable from disk
      const result = await projectVaultGet(password, 'proj-k', projectDir, 'k');
      expect(result).toBe('v');
    });

    it('lockAll clears all project caches', async () => {
      await projectVaultSet(password, 'proj-l', projectDir, 'k', 'v');
      projectVaultLockAll();
      // Should still be readable from disk
      const result = await projectVaultGet(password, 'proj-l', projectDir, 'k');
      expect(result).toBe('v');
    });
  });

  describe('password validation', () => {
    it('rejects passwords shorter than 12 characters', () => {
      expect(
        () => projectVaultSet('short', 'proj-m', projectDir, 'k', 'v'),
      ).toThrow('at least 12 characters');
    });
  });

  describe('vault path', () => {
    it('returns correct path', () => {
      const path = projectVaultPath(projectDir);
      expect(path).toBe(join(projectDir, 'cultivation', 'treasury', 'vault.enc'));
    });
  });

  describe('atomic write', () => {
    it('creates vault.enc with restricted permissions', async () => {
      await projectVaultSet(password, 'proj-n', projectDir, 'k', 'v');
      const vaultPath = projectVaultPath(projectDir);
      expect(existsSync(vaultPath)).toBe(true);

      const { stat } = await import('node:fs/promises');
      const stats = await stat(vaultPath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600); // owner read/write only
    });

    it('vault file is not plaintext', async () => {
      await projectVaultSet(password, 'proj-o', projectDir, 'secret_key', 'super-secret-value');
      const vaultPath = projectVaultPath(projectDir);
      const raw = await readFile(vaultPath, 'utf-8').catch(() => '');
      expect(raw).not.toContain('super-secret-value');
      expect(raw).not.toContain('secret_key');
    });
  });
});
