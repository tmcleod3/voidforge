/**
 * Pattern: Semantic Design Tokens (primitive -> semantic -> CSS custom properties)
 *
 * Key principles:
 * - NO raw color or type values in components. Components reference SEMANTIC
 *   tokens only (e.g., `surface.raised`, `text.muted`, `font.size.body`) —
 *   never primitives (e.g., `#4f46e5`, `gray-200`, `16px`).
 * - Two layers: PRIMITIVES (the raw palette/scale — every hex, every step of
 *   the type scale) and SEMANTIC roles (what a thing MEANS — `accent`,
 *   `danger`, `border.subtle`). Semantic roles map TO primitives.
 * - Tokens are emitted as CSS custom properties (`--vf-color-accent`) so a
 *   theme override is a `:root[data-theme=...]` block — not a recompile.
 * - A palette or type pivot becomes a TOKEN edit (re-point semantic roles at
 *   different primitives), not a component-by-component rewrite.
 *
 * The trap (field report #351, #3): a rebrand asked for a new accent color and
 * a tighter type scale. Components had hardcoded `#4f46e5` and `text-[15px]`
 * inline in 60+ files. The "one color change" turned into a 60-file grep-and-
 * replace that missed five spots (shipped a two-tone accent for a week) and
 * couldn't support a dark theme at all because the values had no indirection.
 * Scoping all color/type to semantic tokens makes the pivot a single edit.
 *
 * Agents: Galadriel (design system), Legolas (code), Samwise (a11y contrast)
 *
 * Framework adaptations:
 *   React/Next.js: This file — emit CSS vars into a <style> at the root, read
 *     them via Tailwind theme extension or plain `var(--vf-...)`.
 *   Tailwind: map semantic tokens into `theme.extend.colors` /
 *     `theme.extend.fontSize` as `var(--vf-...)` so `bg-accent` resolves to the
 *     token (see the Tailwind block at the bottom).
 *   Vue/Svelte: same CSS-var output; bind `data-theme` on a root element.
 *   Django/Rails templates: emit the `:root` block from `tokensToCss()` into a
 *     server-rendered <style> tag in the base layout; components use `var(...)`.
 *
 * Pairs with /docs/patterns/component.tsx (components consume tokens, never
 * raw values) and /docs/patterns/combobox.tsx (a11y-critical surfaces).
 */

// ── Layer 1: Primitives (the raw palette + scales) ───────────────────────────
// These are the ONLY place raw values live. Name them by what they ARE
// (a swatch index, a scale step), never by what they're FOR. A primitive
// never appears directly in a component.

export const primitives = {
  color: {
    // Neutral ramp
    white: '#ffffff',
    black: '#0a0a0a',
    gray50: '#f9fafb',
    gray100: '#f3f4f6',
    gray200: '#e5e7eb',
    gray500: '#6b7280',
    gray700: '#374151',
    gray900: '#111827',
    // Brand ramp
    indigo500: '#6366f1',
    indigo600: '#4f46e5',
    indigo700: '#4338ca',
    // Status ramps
    red500: '#ef4444',
    red600: '#dc2626',
    green500: '#22c55e',
    amber500: '#f59e0b',
  },
  // Type scale — a modular scale, not arbitrary pixels.
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.5rem',
    '2xl': '2rem',
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.2',
    normal: '1.5',
    relaxed: '1.7',
  },
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
} as const;

type PrimitiveColor = keyof typeof primitives.color;
type PrimitiveFontSize = keyof typeof primitives.fontSize;
type PrimitiveFontWeight = keyof typeof primitives.fontWeight;
type PrimitiveLineHeight = keyof typeof primitives.lineHeight;
type PrimitiveFontFamily = keyof typeof primitives.fontFamily;

// ── Layer 2: Semantic tokens (what a thing MEANS) ────────────────────────────
// A semantic token is a NAME FOR A ROLE that points at a primitive. Components
// reference these. Re-point them to pivot the whole product. The shape is the
// contract — a theme override must provide every role, so the type system
// guarantees no role is left un-themed.

export type SemanticTokens = {
  color: {
    'bg.canvas': PrimitiveColor; // page background
    'bg.raised': PrimitiveColor; // cards, popovers
    'text.default': PrimitiveColor;
    'text.muted': PrimitiveColor;
    'text.on-accent': PrimitiveColor; // text placed on top of `accent`
    'border.subtle': PrimitiveColor;
    accent: PrimitiveColor; // primary action / brand
    'accent.hover': PrimitiveColor;
    danger: PrimitiveColor;
    success: PrimitiveColor;
    warning: PrimitiveColor;
  };
  type: {
    'size.caption': PrimitiveFontSize;
    'size.body': PrimitiveFontSize;
    'size.heading': PrimitiveFontSize;
    'size.display': PrimitiveFontSize;
    'weight.body': PrimitiveFontWeight;
    'weight.emphasis': PrimitiveFontWeight;
    'leading.body': PrimitiveLineHeight;
    'leading.heading': PrimitiveLineHeight;
    'family.ui': PrimitiveFontFamily;
    'family.code': PrimitiveFontFamily;
  };
};

// ── Worked example, step 1: define the default (light) theme ─────────────────
// Every semantic role points at a primitive. This is the whole brand surface —
// change these mappings and the product re-skins. Note: no hex here, only
// references into `primitives`.

export const lightTheme: SemanticTokens = {
  color: {
    'bg.canvas': 'white',
    'bg.raised': 'gray50',
    'text.default': 'gray900',
    'text.muted': 'gray500',
    'text.on-accent': 'white',
    'border.subtle': 'gray200',
    accent: 'indigo600',
    'accent.hover': 'indigo700',
    danger: 'red600',
    success: 'green500',
    warning: 'amber500',
  },
  type: {
    'size.caption': 'sm',
    'size.body': 'base',
    'size.heading': 'xl',
    'size.display': '2xl',
    'weight.body': 'regular',
    'weight.emphasis': 'semibold',
    'leading.body': 'normal',
    'leading.heading': 'tight',
    'family.ui': 'sans',
    'family.code': 'mono',
  },
};

// ── Worked example, step 2: a theme override (dark) ──────────────────────────
// Because color roles are indirection, a dark theme is just a different
// primitive mapping. The type scale is unchanged here — override only what
// differs. A full rebrand would supply a new `primitives.color` ramp AND a new
// mapping; both still live in tokens, never in components.

export const darkTheme: SemanticTokens = {
  color: {
    'bg.canvas': 'black',
    'bg.raised': 'gray900',
    'text.default': 'gray50',
    'text.muted': 'gray500',
    'text.on-accent': 'white',
    'border.subtle': 'gray700',
    accent: 'indigo500', // lighter accent reads better on dark canvas
    'accent.hover': 'indigo600',
    danger: 'red500',
    success: 'green500',
    warning: 'amber500',
  },
  type: lightTheme.type, // type scale is theme-invariant in this example
};

// ── Emit: semantic tokens -> CSS custom properties ───────────────────────────
// `--vf-color-<role>` and `--vf-type-<role>`, with `.` and braces flattened to
// `-`. The variable VALUE is the resolved primitive, so consumers never touch
// primitives directly. Emit one block per theme keyed by `data-theme`.

const CSS_VAR_PREFIX = '--vf';

function cssVarName(group: 'color' | 'type', role: string): string {
  // 'accent.hover' -> '--vf-color-accent-hover'
  const safeRole = role.replace(/[.\s]+/g, '-');
  return `${CSS_VAR_PREFIX}-${group}-${safeRole}`;
}

function resolveColor(role: PrimitiveColor): string {
  return primitives.color[role];
}

function resolveType(
  tokenKey: keyof SemanticTokens['type'],
  ref: string,
): string {
  if (tokenKey.startsWith('size.')) return primitives.fontSize[ref as PrimitiveFontSize];
  if (tokenKey.startsWith('weight.')) return primitives.fontWeight[ref as PrimitiveFontWeight];
  if (tokenKey.startsWith('leading.')) return primitives.lineHeight[ref as PrimitiveLineHeight];
  if (tokenKey.startsWith('family.')) return primitives.fontFamily[ref as PrimitiveFontFamily];
  throw new Error(`Unknown type token group: ${tokenKey}`);
}

/** Build the `--vf-*` declarations for one theme as `key: value` lines. */
export function themeToDeclarations(tokens: SemanticTokens): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, ref] of Object.entries(tokens.color)) {
    out[cssVarName('color', role)] = resolveColor(ref as PrimitiveColor);
  }
  for (const [role, ref] of Object.entries(tokens.type)) {
    out[cssVarName('type', role)] = resolveType(
      role as keyof SemanticTokens['type'],
      ref as string,
    );
  }
  return out;
}

/**
 * Render every theme into a single CSS string: `:root` carries the default
 * theme, `[data-theme="<name>"]` carries each override. Drop this into a
 * <style> tag (React: dangerouslySetInnerHTML; templates: server-render).
 */
export function tokensToCss(themes: {
  default: SemanticTokens;
  overrides?: Record<string, SemanticTokens>;
}): string {
  const block = (selector: string, decls: Record<string, string>): string => {
    const body = Object.entries(decls)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    return `${selector} {\n${body}\n}`;
  };

  const parts = [block(':root', themeToDeclarations(themes.default))];
  for (const [name, theme] of Object.entries(themes.overrides ?? {})) {
    parts.push(block(`[data-theme="${name}"]`, themeToDeclarations(theme)));
  }
  return parts.join('\n\n');
}

// ── Worked example, step 3: consume tokens in a component ─────────────────────
// The component references SEMANTIC tokens via `var(--vf-...)` — never a hex,
// never a pixel literal. Swapping `data-theme` on any ancestor re-themes it
// with zero component changes. This is the payoff: the pivot lives in tokens.

import type { CSSProperties, PropsWithChildren } from 'react';

const tokenColor = (role: keyof SemanticTokens['color']): string =>
  `var(${cssVarName('color', role)})`;
const tokenType = (role: keyof SemanticTokens['type']): string =>
  `var(${cssVarName('type', role)})`;

export function CalloutCard({ children }: PropsWithChildren): JSX.Element {
  const style: CSSProperties = {
    background: tokenColor('bg.raised'),
    color: tokenColor('text.default'),
    border: `1px solid ${tokenColor('border.subtle')}`,
    borderRadius: 8,
    padding: '1rem 1.25rem',
    fontFamily: tokenType('family.ui'),
    fontSize: tokenType('size.body'),
    lineHeight: tokenType('leading.body'),
  };
  const ctaStyle: CSSProperties = {
    background: tokenColor('accent'),
    color: tokenColor('text.on-accent'),
    fontWeight: tokenType('weight.emphasis'),
    border: 'none',
    borderRadius: 6,
    padding: '0.5rem 0.875rem',
    marginTop: '0.75rem',
    cursor: 'pointer',
  };
  return (
    <section style={style}>
      {children}
      {/* No #hex, no 15px — only token references. A rebrand never touches this file. */}
      <button type="button" style={ctaStyle}>
        Continue
      </button>
    </section>
  );
}

// To mount the themes once at the app root (Next.js: in a Server Component
// layout, or a root <style> in app/layout.tsx):
//
//   const css = tokensToCss({ default: lightTheme, overrides: { dark: darkTheme } });
//   // <style dangerouslySetInnerHTML={{ __html: css }} />
//   // then: <html data-theme={prefersDark ? 'dark' : undefined}> ... </html>
//
// produces, e.g.:
//   :root { --vf-color-accent: #4f46e5; --vf-type-size-body: 1rem; ... }
//   [data-theme="dark"] { --vf-color-accent: #6366f1; ... }

// ── Tailwind adaptation ──────────────────────────────────────────────────────
// Map semantic tokens into the Tailwind theme as `var(--vf-...)`, so utility
// classes (`bg-accent`, `text-muted`, `text-body`) resolve to tokens and a
// theme swap still flows through `data-theme`. Components keep using semantic
// utilities — never `bg-[#4f46e5]`.
//
//   // tailwind.config.ts
//   export default {
//     theme: {
//       extend: {
//         colors: {
//           canvas: 'var(--vf-color-bg-canvas)',
//           raised: 'var(--vf-color-bg-raised)',
//           accent: { DEFAULT: 'var(--vf-color-accent)', hover: 'var(--vf-color-accent-hover)' },
//           muted: 'var(--vf-color-text-muted)',
//         },
//         fontSize: {
//           caption: 'var(--vf-type-size-caption)',
//           body: 'var(--vf-type-size-body)',
//           heading: 'var(--vf-type-size-heading)',
//         },
//       },
//     },
//   };
//
// Lint guardrail (field report #351): forbid raw hex/px in component source so
// the indirection can't be bypassed. Stylelint: `color-no-hex` + a custom
// `declaration-property-value-disallowed-list` for `font-size: /\d+px/`; for
// className strings, an ESLint `no-restricted-syntax` rule banning Tailwind
// arbitrary-value brackets in color/size utilities (e.g. `bg-[#...]`,
// `text-[15px]`). The token layer only pays off if primitives can't leak past it.
