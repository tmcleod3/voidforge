import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import {
  readMarker,
  writeMarker,
  createMarker,
  findProjectRoot,
  MARKER_FILE,
} from '../lib/marker.js';
import type { VoidForgeMarker } from '../lib/marker.js';

describe('marker', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'voidforge-marker-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('createMarker', () => {
    it('creates a marker with UUID, version, and timestamp', () => {
      const marker = createMarker('21.0.0');
      expect(marker.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(marker.version).toBe('21.0.0');
      expect(marker.tier).toBe('full');
      expect(marker.extensions).toEqual([]);
      expect(new Date(marker.created).getTime()).toBeGreaterThan(0);
    });

    it('accepts tier and extensions', () => {
      const marker = createMarker('21.0.0', 'methodology', ['cultivation']);
      expect(marker.tier).toBe('methodology');
      expect(marker.extensions).toEqual(['cultivation']);
    });
  });

  describe('writeMarker / readMarker', () => {
    it('writes and reads a marker file', async () => {
      const marker = createMarker('21.0.0', 'full', ['danger-room']);
      await writeMarker(tempDir, marker);

      const read = await readMarker(tempDir);
      expect(read).not.toBeNull();
      expect(read!.id).toBe(marker.id);
      expect(read!.version).toBe('21.0.0');
      expect(read!.tier).toBe('full');
      expect(read!.extensions).toEqual(['danger-room']);
    });

    it('returns null for missing marker', async () => {
      const result = await readMarker(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      await writeFile(join(tempDir, MARKER_FILE), 'not json', 'utf-8');
      const result = await readMarker(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for JSON missing required fields', async () => {
      await writeFile(join(tempDir, MARKER_FILE), '{"foo": "bar"}', 'utf-8');
      const result = await readMarker(tempDir);
      expect(result).toBeNull();
    });

    it('writes pretty-printed JSON with trailing newline', async () => {
      const marker = createMarker('21.0.0');
      await writeMarker(tempDir, marker);
      const raw = await readFile(join(tempDir, MARKER_FILE), 'utf-8');
      expect(raw).toContain('\n  ');
      expect(raw.endsWith('\n')).toBe(true);
    });
  });

  describe('findProjectRoot', () => {
    it('finds marker in the given directory', async () => {
      await writeMarker(tempDir, createMarker('21.0.0'));
      const root = findProjectRoot(tempDir);
      expect(root).toBe(tempDir);
    });

    it('finds marker in parent directory', async () => {
      const { mkdirSync } = await import('node:fs');
      const subDir = join(tempDir, 'src', 'lib');
      mkdirSync(subDir, { recursive: true });
      await writeMarker(tempDir, createMarker('21.0.0'));
      const root = findProjectRoot(subDir);
      expect(root).toBe(tempDir);
    });

    it('returns null when no marker exists', () => {
      const root = findProjectRoot(tempDir);
      expect(root).toBeNull();
    });

    // ── Regression: issue #331 — $HOME write disaster ─────
    // findProjectRoot must NOT match a `.voidforge` directory (ADR-060 state dir)
    // and must NOT silently fall through to `/` or `$HOME` when no marker exists.

    it('walks up several levels and finds a .voidforge FILE marker', async () => {
      const deep = join(tempDir, 'a', 'b', 'c', 'd', 'e');
      mkdirSync(deep, { recursive: true });
      await writeMarker(tempDir, createMarker('23.11.3'));
      const root = findProjectRoot(deep);
      expect(root).toBe(tempDir);
    });

    it('rejects a .voidforge DIRECTORY (ADR-060 state dir must not match)', async () => {
      // Simulate ~/.voidforge/ being a directory (the gate state dir, not a project marker)
      const fakeHome = await mkdtemp(join(tmpdir(), 'voidforge-fakehome-'));
      try {
        await mkdir(join(fakeHome, MARKER_FILE), { recursive: true });
        // Also write a sub-file so the directory is non-empty (gate writes state here)
        await writeFile(join(fakeHome, MARKER_FILE, 'gate.log'), 'state', 'utf-8');

        const subDir = join(fakeHome, 'some', 'project');
        mkdirSync(subDir, { recursive: true });

        const root = findProjectRoot(subDir);
        // CURRENT BUG (#331): existsSync(.voidforge) returns true for directories too,
        // so findProjectRoot returns $HOME and `update` writes 45 files into it.
        // After fix: must reject the directory and return null.
        expect(root).toBeNull();
      } finally {
        await rm(fakeHome, { recursive: true, force: true });
      }
    });

    it('does NOT return $HOME or / when no marker exists anywhere above', async () => {
      // Walking up from a deep temp dir with no marker anywhere must return null,
      // never bottom out at `/` (filesystem root) or `$HOME`.
      const deep = join(tempDir, 'x', 'y', 'z');
      mkdirSync(deep, { recursive: true });
      const root = findProjectRoot(deep);
      expect(root).toBeNull();
      expect(root).not.toBe('/');
      expect(root).not.toBe(homedir());
      expect(root).not.toBe(tempDir);
    });

    it('stops at $HOME boundary — no false positive in a homedir subdir without marker', async () => {
      // If a user runs `voidforge update` from ~/Documents/random-folder and no
      // marker exists at ~ or above, the function must return null — not `/`
      // and not `$HOME` (which would cause the #331 disaster).
      const root = findProjectRoot(tempDir);
      expect(root).toBeNull();
    });
  });
});
