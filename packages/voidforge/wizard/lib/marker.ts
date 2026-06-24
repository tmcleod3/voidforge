/**
 * .voidforge marker file — project identity and CLI detection.
 *
 * Every VoidForge project has a `.voidforge` JSON file at root.
 * The CLI walks up from cwd to find it, determining the project root.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

// ── Types ────────────────────────────────────────────────

/**
 * How `update` is allowed to touch the project's CLAUDE.md (issue #368):
 *   - 'preserve' (default, safest): never overwrite in place. If upstream
 *      differs, write it to `CLAUDE.md.upstream` and warn — the operator merges
 *      deliberately. CLAUDE.md is the file Claude Code loads every session and
 *      carries project-specific operational knowledge; clobbering it is the same
 *      bug class as #331 (silent destruction of user content).
 *   - 'merge': update only the content between the sentinel fences
 *      `<!-- VOIDFORGE:BEGIN methodology -->` / `<!-- VOIDFORGE:END methodology -->`,
 *      leaving every project section outside the fences verbatim. Falls back to
 *      'preserve' (side-file) when fences are absent — there is no lossless
 *      in-place merge without them.
 *   - 'skip': the updater never reads or writes CLAUDE.md at all.
 */
export type ClaudeMdStrategy = 'preserve' | 'merge' | 'skip';

export interface VoidForgeMarker {
  id: string;
  version: string;
  created: string;
  tier: 'full' | 'methodology';
  extensions: string[];
  /**
   * Optional CLAUDE.md update policy (issue #368). Absent on legacy markers;
   * callers MUST default to 'preserve' when undefined so the safe-by-default
   * behavior applies to projects created before this field existed.
   */
  claudeMd?: ClaudeMdStrategy;
}

/** Safe default when a marker omits `claudeMd`. Never silently clobber. */
export const DEFAULT_CLAUDE_MD_STRATEGY: ClaudeMdStrategy = 'preserve';

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
  claudeMd: ClaudeMdStrategy = DEFAULT_CLAUDE_MD_STRATEGY,
): VoidForgeMarker {
  return {
    id: randomUUID(),
    version,
    created: new Date().toISOString(),
    tier,
    extensions,
    claudeMd,
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

// ── Legacy Methodology-Consumer Detection (issue #369) ───

export interface LegacyConsumer {
  dir: string;
  /** Tier inferred from the project shape: 'full' if a wizard/ dir is present. */
  inferredTier: VoidForgeMarker['tier'];
}

/**
 * Detect a legacy methodology consumer that predates the `.voidforge` marker.
 *
 * Such projects originally consumed methodology via git (before the marker
 * convention) and so `update` hard-errors them toward `init` — which is the
 * wrong remedy on an existing project (issue #369). The signature of a real
 * consumer is the methodology footprint: `VERSION.md` + `.claude/commands/` +
 * `docs/methods/` all present. When that holds and NO marker exists, the CLI
 * should OFFER to create the marker rather than send the user to `init`.
 *
 * Tier is inferred from `wizard/` presence (full-tier projects embed/embedded
 * the wizard), mirroring the workaround in the field report.
 *
 * Returns null when the dir already has a marker (not legacy) or does not look
 * like a methodology consumer (genuinely not a VoidForge project).
 */
export function detectLegacyConsumer(dir: string = process.cwd()): LegacyConsumer | null {
  const root = resolve(dir);

  // If a valid marker is already present anywhere up the tree, it is not legacy.
  if (findProjectRoot(root) !== null) return null;

  const hasVersion = existsSync(join(root, 'VERSION.md'));
  const hasCommands = isDir(join(root, '.claude', 'commands'));
  const hasMethods = isDir(join(root, 'docs', 'methods'));

  if (!(hasVersion && hasCommands && hasMethods)) return null;

  const inferredTier: VoidForgeMarker['tier'] = isDir(join(root, 'wizard'))
    ? 'full'
    : 'methodology';

  return { dir: root, inferredTier };
}

/** Read the methodology version from a project's VERSION.md, or 'unknown'. */
export function readVersionFile(dir: string): string {
  const versionPath = join(resolve(dir), 'VERSION.md');
  if (!existsSync(versionPath)) return 'unknown';
  try {
    const raw = readFileSync(versionPath, 'utf-8');
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

function isDir(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ── Global Config ────────────────────────────────────────

export function getGlobalDir(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir();
  return join(home, '.voidforge');
}

export function getVaultPath(): string {
  return join(getGlobalDir(), 'vault.enc');
}
