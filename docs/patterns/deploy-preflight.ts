/**
 * Deploy Preflight — Pre-deploy secret and sensitive-path scan
 *
 * Reference implementation for .claude/commands/deploy.md Step 2.5.
 * Scans the deploy artifact directory BEFORE upload. Exits non-zero on any hit.
 *
 * Evidence: field reports #305 (32-day credential leak), #303 (methodology exposure),
 * #343 F7 (stop-build-start loop mislabeled "blue-green" → 502 window every deploy).
 *
 * Key principles:
 * - Scan the deploy payload directory, NOT the repo root.
 * - Never auto-filter — a hit means the operator must investigate.
 * - Never print secret content; only paths + pattern IDs.
 * - Allowlist escape hatch via DEPLOY_PREFLIGHT_ALLOW (comma-separated globs).
 * - Deploy-strategy claims must be backed by a real mechanism: a comment that
 *   says "blue-green"/"zero-downtime" without an atomic swap (rename, container
 *   swap, or LB cutover) is a lie that ships a 502 window (#343 F7).
 * - #361 git-remote credential check: an opt-in scan of .git/config for inline
 *   credentials baked into a remote URL (https://user:token@host/...). .git/ is
 *   OUTSIDE the deploy artifact, so the artifact walk never reaches it; this scan
 *   runs independently against the repo root (process.cwd() or --git-root). It is
 *   best-effort — a checkout with no local .git is fine — and only ever reports
 *   the path + pattern id, never the matched credential.
 *
 * Usage:
 *   npx tsx docs/patterns/deploy-preflight.ts ./dist
 *   DEPLOY_PREFLIGHT_ALLOW='fixtures/*,public/ok.env.example' npx tsx docs/patterns/deploy-preflight.ts ./dist
 *
 * CI step example (before wrangler/vercel/firebase):
 *   - run: npx tsx docs/patterns/deploy-preflight.ts ./dist
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { argv, cwd, env, exit } from 'node:process';

// ---------- forbidden filename patterns ----------
const FORBIDDEN_NAME_PATTERNS: { id: string; test: (name: string, rel: string) => boolean }[] = [
  { id: 'env-file', test: (n) => /^\.env(\..+)?$/.test(n) && !/\.(example|template|sample)$/.test(n) },
  { id: 'pem-file', test: (n) => n.endsWith('.pem') },
  { id: 'key-file', test: (n) => n.endsWith('.key') },
  { id: 'ssh-private-key', test: (n) => /^id_(rsa|ed25519|ecdsa|dsa)(\..+)?$/.test(n) && !n.endsWith('.pub') },
  { id: 'pkcs12', test: (n) => n.endsWith('.p12') || n.endsWith('.pfx') },
  { id: 'methodology-claude', test: (_, rel) => rel.split(sep)[0] === '.claude' },
  { id: 'methodology-docs-methods', test: (_, rel) => rel.startsWith(`docs${sep}methods${sep}`) },
  { id: 'methodology-docs-patterns', test: (_, rel) => rel.startsWith(`docs${sep}patterns${sep}`) },
  { id: 'methodology-holocron', test: (n) => n === 'HOLOCRON.md' },
  { id: 'methodology-changelog', test: (n) => n === 'CHANGELOG.md' },
  { id: 'methodology-version', test: (n) => n === 'VERSION.md' },
  { id: 'build-logs', test: (_, rel) => rel.split(sep)[0] === 'logs' },
];

// ---------- forbidden content patterns (scanned in text-ish files only) ----------
const FORBIDDEN_CONTENT_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'cloudflare-token', re: /\b[0-9a-f]{40}\b/ },
  { id: 'github-pat', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  // #361: inline credentials baked into a remote URL — https://user:token@host/...
  // (also covers x-access-token:/oauth2: user fields). Used by the .git/config scan.
  { id: 'git-remote-inline-credential', re: /https:\/\/[^/@\s]+:[^@\s]+@/ },
];

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.map', '.txt', '.md', '.xml', '.yml', '.yaml', '.env',
  '.css', '.svg',
]);

interface Hit {
  kind: 'name' | 'content' | 'strategy' | 'git-config';
  path: string;
  patternId: string;
}

// ---------- deploy-strategy nomenclature check (field report #343 F7) ----------
// A stop-build-start loop mislabeled "blue-green"/"zero-downtime" still drops the
// old process before the new one is live, producing a 502 window on every deploy.
// The comment lies; the mechanism doesn't. This flags scripts whose comments CLAIM
// blue-green / zero-downtime but where no atomic-swap mechanism is detectable —
// temp-build-then-rename, container/image swap, or load-balancer cutover.

// File shapes that can carry a deploy strategy worth checking.
const DEPLOY_SCRIPT_EXTENSIONS = new Set([
  '.sh', '.bash', '.zsh', '.yml', '.yaml', '.ps1',
]);
const DEPLOY_SCRIPT_BASENAMES = new Set([
  'Dockerfile', 'Procfile', 'Makefile',
]);

// Comments that CLAIM an atomic deploy strategy.
const STRATEGY_CLAIM_RE = /\b(blue[\s/_-]?green|zero[\s/_-]?downtime|hot[\s/_-]?swap|atomic\s+deploy(?:ment)?)\b/i;

// Any one of these signals a real atomic-swap mechanism is present.
const ATOMIC_SWAP_SIGNALS: { id: string; re: RegExp }[] = [
  // temp build dir then rename/symlink-swap into place (release-then-link pattern)
  { id: 'rename-swap', re: /\b(?:mv|rename|ln\s+-s(?:fn|nf|f)?)\b[^\n]*\b(?:current|live|release|active|prod(?:uction)?)\b/i },
  { id: 'symlink-current', re: /\bln\s+-s(?:fn|nf|f)?\b[^\n]*\bcurrent\b/i },
  // container / image swap: new container up, traffic moved, old removed
  { id: 'container-swap', re: /\bdocker\b[^\n]*\b(?:run|up|--scale|service\s+update)\b|\bdocker[\s-]compose\b[^\n]*\bup\b[^\n]*\b(?:--no-recreate|--scale)\b|\bcontainer[\s_-]?swap\b/i },
  { id: 'orchestrator-rollout', re: /\b(?:kubectl\s+rollout|helm\s+upgrade|nomad\s+job\s+run|ecs\b[^\n]*update-service)\b/i },
  // load-balancer / proxy cutover: register new target, then drain/deregister old
  { id: 'lb-cutover', re: /\b(?:register-targets|deregister-targets|modify-listener|switchover|traffic[\s_-]?shift|weighted[\s_-]?routing|upstream)\b/i },
  { id: 'proxy-reload', re: /\b(?:nginx\s+-s\s+reload|caddy\s+reload|envoy\b[^\n]*config|haproxy\b[^\n]*reload)\b/i },
];

// Sequences that betray a stop-build-start loop (kill old, then start new).
// Used only to strengthen the signal — a claim with NO atomic mechanism is
// already a hit; this just confirms the anti-pattern is actively present.
const STOP_START_RE = /\b(?:kill|stop|down|terminate|systemctl\s+stop|pm2\s+stop|docker\s+stop|docker\s+rm)\b[\s\S]{0,400}?\b(?:start|up|run|systemctl\s+start|pm2\s+start|npm\s+(?:run\s+)?start|node\b)/i;

function scanStrategy(fullPath: string, relPath: string): string | null {
  const base = relPath.split(sep).pop() ?? '';
  const ext = extname(fullPath).toLowerCase();
  const looksLikeDeployScript =
    DEPLOY_SCRIPT_EXTENSIONS.has(ext) ||
    DEPLOY_SCRIPT_BASENAMES.has(base) ||
    /deploy|release|rollout|cutover/i.test(base);
  if (!looksLikeDeployScript) return null;

  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    return null;
  }
  if (stats.size > 2_000_000) return null;

  let buf: string;
  try {
    buf = readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }

  if (!STRATEGY_CLAIM_RE.test(buf)) return null; // no claim, nothing to verify
  const hasAtomicSwap = ATOMIC_SWAP_SIGNALS.some((s) => s.re.test(buf));
  if (hasAtomicSwap) return null; // claim is backed by a real mechanism

  // Claim present, no atomic-swap mechanism. Distinguish the worst case:
  // an actual stop-build-start loop wearing a blue-green label.
  return STOP_START_RE.test(buf)
    ? 'strategy-mislabel-stop-start'
    : 'strategy-claim-no-atomic-swap';
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function loadAllowlist(): RegExp[] {
  const raw = env.DEPLOY_PREFLIGHT_ALLOW ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(globToRegex);
}

function isAllowed(relPath: string, allowlist: RegExp[]): boolean {
  return allowlist.some((re) => re.test(relPath));
}

function* walk(root: string, current = root): Generator<string> {
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(current, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      yield* walk(root, full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function scanName(fullPath: string, relPath: string): string | null {
  const base = relPath.split(sep).pop() ?? '';
  for (const p of FORBIDDEN_NAME_PATTERNS) {
    if (p.test(base, relPath)) return p.id;
  }
  return null;
}

function scanContent(fullPath: string): string | null {
  const ext = extname(fullPath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return null;
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    return null;
  }
  // skip files >2MB to keep the scan fast; secrets are typically short
  if (stats.size > 2_000_000) return null;
  let buf: string;
  try {
    buf = readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
  for (const p of FORBIDDEN_CONTENT_PATTERNS) {
    if (p.re.test(buf)) return p.id;
  }
  return null;
}

// ---------- #361 git-remote inline-credential scan ----------
// .git/ is OUTSIDE the deploy artifact, so walk(target) never reaches it. This
// runs independently against the repo root and inspects .git/config for a remote
// URL with embedded credentials (https://user:token@host/...). Best-effort: a
// checkout without a local .git is a clean no-op. NEVER returns or logs the
// matched credential — only that a match occurred (path + pattern id upstream).
const GIT_REMOTE_CREDENTIAL_RE = /https:\/\/[^/@\s]+:[^@\s]+@/;

function scanGitConfig(gitRoot: string): boolean {
  const configPath = join(gitRoot, '.git', 'config');
  let stats;
  try {
    stats = statSync(configPath);
  } catch {
    return false; // no local .git/config — best-effort no-op
  }
  if (!stats.isFile()) return false;
  if (stats.size > 2_000_000) return false;
  let buf: string;
  try {
    buf = readFileSync(configPath, 'utf8');
  } catch {
    return false;
  }
  for (const line of buf.split('\n')) {
    if (GIT_REMOTE_CREDENTIAL_RE.test(line)) return true;
  }
  return false;
}

function main(): void {
  const target = argv[2];
  if (!target) {
    console.error('[deploy-preflight] Usage: deploy-preflight <deploy-dir>');
    exit(2);
  }

  let rootStat;
  try {
    rootStat = statSync(target);
  } catch {
    console.error(`[deploy-preflight] target does not exist: ${target}`);
    exit(2);
  }
  if (!rootStat.isDirectory()) {
    console.error(`[deploy-preflight] target is not a directory: ${target}`);
    exit(2);
  }

  const allowlist = loadAllowlist();
  const hits: Hit[] = [];
  let scanned = 0;

  for (const fullPath of walk(target)) {
    const relPath = relative(target, fullPath);
    if (isAllowed(relPath, allowlist)) continue;
    scanned += 1;

    const nameHit = scanName(fullPath, relPath);
    if (nameHit) {
      hits.push({ kind: 'name', path: relPath, patternId: nameHit });
      continue; // skip content scan on already-forbidden names
    }

    const contentHit = scanContent(fullPath);
    if (contentHit) {
      hits.push({ kind: 'content', path: relPath, patternId: contentHit });
      continue; // a secret hit is already terminal; don't double-report this file
    }

    // Deploy-strategy nomenclature check (field report #343 F7): a script whose
    // comments claim blue-green / zero-downtime but ships no atomic-swap mechanism.
    const strategyHit = scanStrategy(fullPath, relPath);
    if (strategyHit) {
      hits.push({ kind: 'strategy', path: relPath, patternId: strategyHit });
    }
  }

  // #361 git-remote inline-credential check. .git/ lives outside the deploy
  // artifact, so resolve the repo root from a --git-root flag (or process.cwd())
  // rather than from `target`. Best-effort: a checkout with no local .git is a
  // clean no-op so CI runs that deploy from a bare artifact don't break.
  const gitRootFlagIdx = argv.indexOf('--git-root');
  const gitRoot =
    gitRootFlagIdx !== -1 && argv[gitRootFlagIdx + 1] ? argv[gitRootFlagIdx + 1] : cwd();
  if (scanGitConfig(gitRoot)) {
    // NEVER print the matched credential — only the path + pattern id.
    hits.push({ kind: 'git-config', path: '.git/config', patternId: 'git-remote-inline-credential' });
  }

  const summary = {
    action: 'deploy-preflight',
    target,
    scanned,
    hits: hits.length,
    allowlist: allowlist.length,
  };
  console.log(JSON.stringify(summary));

  if (hits.length > 0) {
    console.error(`[deploy-preflight] ${hits.length} forbidden path(s) in deploy payload:`);
    for (const h of hits) {
      console.error(`  - [${h.kind}:${h.patternId}] ${h.path}`);
    }
    console.error('[deploy-preflight] ABORTED. Remove offending files or fix deploy surface configuration.');
    exit(1);
  }

  console.log('[deploy-preflight] clean');
  exit(0);
}

main();
