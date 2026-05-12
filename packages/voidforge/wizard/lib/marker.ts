/**
 * .voidforge marker file — project identity and CLI detection.
 *
 * Every VoidForge project has a `.voidforge` JSON file at root.
 * The CLI walks up from cwd to find it, determining the project root.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

// ── Types ────────────────────────────────────────────────

export interface VoidForgeMarker {
  id: string;
  version: string;
  created: string;
  tier: 'full' | 'methodology';
  extensions: string[];
}

// ── Constants ────────────────────────────────────────────

export const MARKER_FILE = '.voidforge';

// ── Read / Write ─────────────────────────────────────────

export async function readMarker(dir: string): Promise<VoidForgeMarker | null> {
  const markerPath = join(dir, MARKER_FILE);
  if (!existsSync(markerPath)) return null;
  try {
    const raw = await readFile(markerPath, 'utf-8');
    const data = JSON.parse(raw) as VoidForgeMarker;
    if (!data.id || !data.version || !Array.isArray(data.extensions)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeMarker(dir: string, marker: VoidForgeMarker): Promise<void> {
  const markerPath = join(dir, MARKER_FILE);
  await writeFile(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
}

export function createMarker(
  version: string,
  tier: VoidForgeMarker['tier'] = 'full',
  extensions: string[] = [],
): VoidForgeMarker {
  return {
    id: randomUUID(),
    version,
    created: new Date().toISOString(),
    tier,
    extensions,
  };
}

// ── Project Detection ────────────────────────────────────

/**
 * Walk up from `startDir` to find the nearest `.voidforge` marker.
 * Returns the directory containing the marker, or null if none found.
 *
 * Safety guards (issue #331):
 *   Option A — marker MUST be a regular file. A `.voidforge` directory
 *     (e.g. someone's stray folder, or an extension's data dir) is ignored.
 *   Option B — the walk stops at the user's home directory. We never treat
 *     `$HOME` or any ancestor as a project root, so `update`/`init` cannot
 *     overwrite files in `~/` when invoked outside a project.
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  const home = resolve(process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir());
  let current = resolve(startDir);
  while (true) {
    // Option B: never accept $HOME (or anything at/above it) as a project root.
    if (current === home) return null;

    const markerPath = join(current, MARKER_FILE);
    if (existsSync(markerPath)) {
      // Option A: marker must be a regular file, not a directory.
      try {
        if (statSync(markerPath).isFile()) {
          return current;
        }
      } catch {
        // stat raced with deletion or permission error — treat as no marker.
      }
    }
    const parent = dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return null;
}

/**
 * Like findProjectRoot but throws with a user-friendly message.
 */
export function requireProjectRoot(startDir: string = process.cwd()): string {
  const root = findProjectRoot(startDir);
  if (!root) {
    console.error('Not a VoidForge project — run `npx voidforge init` to create one.');
    process.exit(1);
  }
  return root;
}

// ── Global Config ────────────────────────────────────────

export function getGlobalDir(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  return join(home, '.voidforge');
}

export function getVaultPath(): string {
  return join(getGlobalDir(), 'vault.enc');
}
