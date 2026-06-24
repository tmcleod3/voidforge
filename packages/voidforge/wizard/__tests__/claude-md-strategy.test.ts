/**
 * CLAUDE.md update-strategy tests (issue #368).
 *
 * The planner is the single mechanism that decides how `update` may touch a
 * project's CLAUDE.md. These tests pin the safety-critical invariant: an update
 * NEVER silently clobbers a customized CLAUDE.md.
 */

import { describe, it, expect } from 'vitest';
import {
  planClaudeMdUpdate,
  extractSections,
  findDroppedSections,
  mergeFenced,
  hasFences,
  stripIdentity,
  FENCE_BEGIN,
  FENCE_END,
} from '../lib/claude-md-strategy.js';

const fenced = (body: string) =>
  `# CLAUDE.md\n\n${FENCE_BEGIN}\n${body}\n${FENCE_END}\n`;

describe('extractSections', () => {
  it('extracts # and ## headings, ignoring code fences', () => {
    const md = [
      '# Title',
      '## Project',
      '```bash',
      '# not a heading',
      '```',
      '## Coding Standards',
    ].join('\n');
    expect(extractSections(md)).toEqual(['Title', 'Project', 'Coding Standards']);
  });
});

describe('findDroppedSections', () => {
  it('reports sections present locally but absent upstream', () => {
    const current = '## Project\n## Critical Files\n## Color Theme\n## Coding Standards\n';
    const upstream = '## Project\n## Coding Standards\n';
    expect(findDroppedSections(current, upstream)).toEqual(['Critical Files', 'Color Theme']);
  });

  it('returns empty when upstream is a superset', () => {
    const current = '## A\n## B\n';
    const upstream = '## A\n## B\n## C\n';
    expect(findDroppedSections(current, upstream)).toEqual([]);
  });
});

describe('fences', () => {
  it('detects a well-formed fence pair', () => {
    expect(hasFences(fenced('methodology v1'))).toBe(true);
    expect(hasFences('# CLAUDE.md\nno fences here')).toBe(false);
  });

  it('mergeFenced replaces only the fenced block, preserving outside content', () => {
    const current =
      `# CLAUDE.md\n## Project\nMy app\n\n${FENCE_BEGIN}\nOLD methodology\n${FENCE_END}\n\n## Critical Files\nkeep me\n`;
    const upstream = fenced('NEW methodology');
    const merged = mergeFenced(current, upstream)!;
    expect(merged).toContain('## Project');
    expect(merged).toContain('My app');
    expect(merged).toContain('## Critical Files');
    expect(merged).toContain('keep me');
    expect(merged).toContain('NEW methodology');
    expect(merged).not.toContain('OLD methodology');
  });

  it('mergeFenced returns null when fences are absent', () => {
    expect(mergeFenced('# no fences', fenced('x'))).toBeNull();
  });
});

describe('stripIdentity', () => {
  it('normalizes away the Project block so name differences are not changes', () => {
    const filled =
      '# CLAUDE.md\n## Project\n- **Name:** Kongo\n\n## Personality\nbody\n';
    const placeholder =
      '# CLAUDE.md\n## Project\n- **Name:** [PROJECT_NAME]\n\n## Personality\nbody\n';
    expect(stripIdentity(filled)).toBe(stripIdentity(placeholder));
  });
});

describe('planClaudeMdUpdate', () => {
  const upstream = '# CLAUDE.md\n## Project\n## Personality\nv2 body\n';

  it('new project (no current) → safe full write', () => {
    const r = planClaudeMdUpdate(null, upstream, 'preserve');
    expect(r.action).toBe('overwrite');
    expect(r.claudeMdContent).toBe(upstream);
    expect(r.sideFileContent).toBeNull();
  });

  it('identical content → unchanged, no write', () => {
    const r = planClaudeMdUpdate(upstream, upstream, 'preserve');
    expect(r.action).toBe('unchanged');
    expect(r.claudeMdContent).toBeNull();
  });

  it('differs only by project identity → unchanged (no spurious change)', () => {
    const current = '# CLAUDE.md\n## Project\n- **Name:** MyApp\n## Personality\nv2 body\n';
    const up = '# CLAUDE.md\n## Project\n- **Name:** [PROJECT_NAME]\n## Personality\nv2 body\n';
    const r = planClaudeMdUpdate(current, up, 'preserve');
    expect(r.action).toBe('unchanged');
  });

  // ── The core safety invariant (mirrors #331) ──────────
  it('preserve: a customized CLAUDE.md is NEVER overwritten — side-file instead', () => {
    const current =
      '# CLAUDE.md\n## Project\nMy app\n## Critical Files\nimportant\n## Color Theme\nbrand\n';
    const r = planClaudeMdUpdate(current, upstream, 'preserve');
    expect(r.action).toBe('side-file');
    expect(r.claudeMdContent).toBeNull(); // original untouched
    expect(r.sideFileContent).toBe(upstream); // upstream parked in the side file
    expect(r.droppedSections).toContain('Critical Files');
    expect(r.droppedSections).toContain('Color Theme');
    expect(r.warnings.join(' ')).toMatch(/not.*overwritten/i);
  });

  it('skip: never touches CLAUDE.md and writes no side file', () => {
    const current = '# CLAUDE.md\n## Project\ncustom\n';
    const r = planClaudeMdUpdate(current, upstream, 'skip');
    expect(r.action).toBe('skip');
    expect(r.claudeMdContent).toBeNull();
    expect(r.sideFileContent).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/untouched/i);
  });

  it('merge with fences: updates only the fenced block, preserves project sections', () => {
    const current =
      `# CLAUDE.md\n## Project\nMy app\n${FENCE_BEGIN}\nOLD method\n${FENCE_END}\n## Critical Files\nkeep\n`;
    const up = fenced('NEW method');
    const r = planClaudeMdUpdate(current, up, 'merge');
    expect(r.action).toBe('merge-fenced');
    expect(r.claudeMdContent).toContain('NEW method');
    expect(r.claudeMdContent).toContain('## Critical Files');
    expect(r.claudeMdContent).toContain('keep');
    expect(r.claudeMdContent).not.toContain('OLD method');
    expect(r.sideFileContent).toBeNull();
    expect(r.droppedSections).toEqual([]);
  });

  it('merge WITHOUT fences: falls back to safe side-file (never clobbers)', () => {
    const current = '# CLAUDE.md\n## Project\ncustom\n## Pricing\n$$\n';
    const r = planClaudeMdUpdate(current, upstream, 'merge');
    expect(r.action).toBe('side-file');
    expect(r.claudeMdContent).toBeNull();
    expect(r.sideFileContent).toBe(upstream);
    expect(r.warnings.join(' ')).toMatch(/no .*fences/i);
  });
});
