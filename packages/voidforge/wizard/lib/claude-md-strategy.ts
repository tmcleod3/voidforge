/**
 * CLAUDE.md update strategy — the single mechanism the updater uses to decide
 * how an `update` may touch a project's CLAUDE.md (issue #368).
 *
 * CLAUDE.md is the file Claude Code loads every session; it carries the
 * project's operational knowledge. The old updater preserved only the first ~10
 * lines and overwrote the rest, silently discarding every project-specific
 * section. That is the same bug class as #331 (silent destruction of user
 * content). This module makes the update NON-DESTRUCTIVE by default and gives
 * projects a precise, opt-in lossless merge via sentinel fences.
 *
 * Three strategies (from the `.voidforge` marker's `claudeMd` field):
 *   - 'preserve' (default): never overwrite in place. If upstream differs, the
 *      new methodology is written to a side file (`CLAUDE.md.upstream`) and the
 *      operator is warned. The original CLAUDE.md is left untouched.
 *   - 'merge': replace ONLY the content between the sentinel fences
 *      `<!-- VOIDFORGE:BEGIN methodology -->` / `<!-- VOIDFORGE:END methodology -->`,
 *      leaving everything outside them verbatim. Falls back to 'preserve'
 *      (side-file + warning) when the fences are absent in either document —
 *      there is no lossless in-place merge without an explicit fenced block.
 *   - 'skip': do not read or write CLAUDE.md at all.
 *
 * In every strategy, section-loss detection runs and surfaces a warning so an
 * update can never silently drop project sections.
 */

import type { ClaudeMdStrategy } from './marker.js';

// ── Constants ────────────────────────────────────────────

export const FENCE_BEGIN = '<!-- VOIDFORGE:BEGIN methodology -->';
export const FENCE_END = '<!-- VOIDFORGE:END methodology -->';

/** Side file written when an in-place merge would be destructive. */
export const UPSTREAM_SUFFIX = '.upstream';

// ── Types ────────────────────────────────────────────────

export type ClaudeMdAction =
  | 'unchanged' // current already matches upstream (within scope) — no write
  | 'skip' // strategy === 'skip'
  | 'overwrite' // safe full write (e.g. fenced merge with no project content)
  | 'merge-fenced' // replaced only the fenced methodology block
  | 'side-file'; // wrote CLAUDE.md.upstream, left original untouched

export interface ClaudeMdMergeResult {
  action: ClaudeMdAction;
  /**
   * New content to write to CLAUDE.md itself, or null if CLAUDE.md must NOT be
   * touched (skip / unchanged / side-file paths).
   */
  claudeMdContent: string | null;
  /**
   * Content to write to the side file, or null if no side file is needed.
   * When set, the caller writes it to `<CLAUDE.md path>.upstream`.
   */
  sideFileContent: string | null;
  /** Project headings present locally but absent upstream — would be dropped by a naive overwrite. */
  droppedSections: string[];
  /** Human-readable warnings to surface to the operator. */
  warnings: string[];
}

// ── Heading extraction ───────────────────────────────────

/**
 * Extract top-level-ish markdown headings (#, ##) used as section identities.
 * Code fences are skipped so a `#` inside a ```bash block is not a heading.
 * Normalized (trimmed, leading hashes stripped) for stable comparison.
 */
export function extractSections(content: string): string[] {
  const sections: string[] = [];
  let inFence = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const fenceToggle = /^\s*(```|~~~)/.test(line);
    if (fenceToggle) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,2})\s+(.+?)\s*$/);
    if (m) sections.push(m[2].trim());
  }
  return sections;
}

/**
 * Sections present in `current` but missing from `incoming` — i.e. content that
 * a naive whole-file overwrite would silently destroy.
 */
export function findDroppedSections(current: string, incoming: string): string[] {
  const incomingSet = new Set(extractSections(incoming).map((s) => s.toLowerCase()));
  const seen = new Set<string>();
  const dropped: string[] = [];
  for (const s of extractSections(current)) {
    const key = s.toLowerCase();
    if (!incomingSet.has(key) && !seen.has(key)) {
      seen.add(key);
      dropped.push(s);
    }
  }
  return dropped;
}

// ── Fences ───────────────────────────────────────────────

// ── Identity normalization ───────────────────────────────

/**
 * Normalize away the project-identity region so two CLAUDE.md files that differ
 * ONLY in their `## Project` block (name/one-liner/domain/repo, or the
 * `[PROJECT_NAME]` placeholders) compare equal.
 *
 * This is why a freshly-`init`ed project — whose `## Project` block has the real
 * name injected while the upstream template still carries `[PROJECT_NAME]` —
 * does not register as a spurious "change" on the very next `update`. It is a
 * comparison-only transform; we never write the normalized form.
 */
export function stripIdentity(content: string): string {
  let out = content;
  // Drop the monorepo template comment fences around the Project block.
  out = out.replace(/<!--\s*REMOVE-FOR-NPM-PUBLISH:[\s\S]*?-->\n?/g, '');
  out = out.replace(/<!--\s*END-REMOVE-FOR-NPM-PUBLISH\s*-->\n?/g, '');
  // Drop a leading `## Project` block: from the `## Project` heading up to (but
  // not including) the next `## ` heading.
  out = out.replace(/^##\s+Project[ \t]*\n[\s\S]*?(?=^##\s)/m, '');
  return out.trim();
}

export function hasFences(content: string): boolean {
  const begin = content.indexOf(FENCE_BEGIN);
  const end = content.indexOf(FENCE_END);
  return begin !== -1 && end !== -1 && end > begin;
}

/**
 * Replace the fenced methodology block in `current` with the fenced block from
 * `upstream`. Everything outside the fences in `current` is preserved verbatim.
 * Returns null if either document lacks a well-formed fence pair.
 */
export function mergeFenced(current: string, upstream: string): string | null {
  if (!hasFences(current) || !hasFences(upstream)) return null;

  const upBegin = upstream.indexOf(FENCE_BEGIN);
  const upEnd = upstream.indexOf(FENCE_END) + FENCE_END.length;
  const upstreamBlock = upstream.slice(upBegin, upEnd);

  const curBegin = current.indexOf(FENCE_BEGIN);
  const curEnd = current.indexOf(FENCE_END) + FENCE_END.length;

  return current.slice(0, curBegin) + upstreamBlock + current.slice(curEnd);
}

// ── Core decision ────────────────────────────────────────

/**
 * Decide how to update CLAUDE.md given the current project content, the incoming
 * upstream content, and the configured strategy. Pure function — performs no
 * I/O. The caller performs the writes described by the returned result.
 *
 * @param current  Existing project CLAUDE.md (null/undefined if the file is absent).
 * @param upstream Incoming methodology CLAUDE.md.
 * @param strategy Marker `claudeMd` field (defaults applied by the caller).
 */
export function planClaudeMdUpdate(
  current: string | null | undefined,
  upstream: string,
  strategy: ClaudeMdStrategy,
): ClaudeMdMergeResult {
  // New project (no existing CLAUDE.md): just write upstream. Nothing to lose.
  if (current == null) {
    return {
      action: 'overwrite',
      claudeMdContent: upstream,
      sideFileContent: null,
      droppedSections: [],
      warnings: [],
    };
  }

  // Identical already — never write. Identity-normalized so a fresh project
  // (real name injected vs upstream `[PROJECT_NAME]` placeholder) is not treated
  // as a spurious change on its first update.
  if (current === upstream || stripIdentity(current) === stripIdentity(upstream)) {
    return {
      action: 'unchanged',
      claudeMdContent: null,
      sideFileContent: null,
      droppedSections: [],
      warnings: [],
    };
  }

  if (strategy === 'skip') {
    return {
      action: 'skip',
      claudeMdContent: null,
      sideFileContent: null,
      droppedSections: [],
      warnings: ['CLAUDE.md left untouched (claudeMd: "skip"). Upstream changes were NOT applied.'],
    };
  }

  const dropped = findDroppedSections(current, upstream);

  if (strategy === 'merge') {
    const merged = mergeFenced(current, upstream);
    if (merged !== null) {
      // Fenced merge is lossless for everything outside the fences. Re-check loss
      // against the merged result, not the raw upstream, so project sections
      // preserved by the fence are NOT reported as dropped.
      const residualLoss = findDroppedSections(current, merged);
      const warnings =
        merged === current
          ? ['CLAUDE.md fenced methodology block already current — no change.']
          : ['CLAUDE.md updated within VOIDFORGE methodology fences; project sections preserved.'];
      if (residualLoss.length > 0) {
        warnings.push(
          `WARNING: fenced merge still drops ${residualLoss.length} section(s): ${residualLoss.join(', ')}.`,
        );
      }
      return {
        action: merged === current ? 'unchanged' : 'merge-fenced',
        claudeMdContent: merged === current ? null : merged,
        sideFileContent: null,
        droppedSections: residualLoss,
        warnings,
      };
    }
    // 'merge' requested but no fences — fall through to safe side-file behavior.
  }

  // 'preserve' (default), OR 'merge' without fences: never overwrite in place.
  // Write upstream to the side file and warn; leave the original intact.
  const warnings = [
    `CLAUDE.md was NOT overwritten. Incoming methodology written to CLAUDE.md${UPSTREAM_SUFFIX} — review and merge deliberately.`,
  ];
  if (strategy === 'merge') {
    warnings.unshift(
      `claudeMd: "merge" requested but no ${FENCE_BEGIN} / ${FENCE_END} fences found in CLAUDE.md — falling back to safe side-file.`,
    );
  }
  if (dropped.length > 0) {
    warnings.push(
      `An in-place overwrite would have dropped ${dropped.length} project section(s): ${dropped.join(', ')}.`,
    );
  }
  return {
    action: 'side-file',
    claudeMdContent: null,
    sideFileContent: upstream,
    droppedSections: dropped,
    warnings,
  };
}
