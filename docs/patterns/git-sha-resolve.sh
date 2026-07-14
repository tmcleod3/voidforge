#!/usr/bin/env bash
# git-sha-resolve — resolve the running build's git SHA from the filesystem ROBUSTLY.
#
# The trap (field report #397): code that reads `.git/refs/heads/<branch>` directly to
# get the SHA works until the next `git gc`. Git stores a ref in ONE of two places —
# a loose file under `.git/refs/`, OR packed into `.git/packed-refs` — and gc (manual,
# `--aggressive`, history rewrites, or git's own auto-gc) migrates loose refs into the
# packed file and DELETES the loose one. A loose-only reader then falls through and can
# emit the raw symbolic string `ref: refs/heads/<branch>` instead of a 40-char SHA,
# silently corrupting a /healthz `git_sha` used for deploy verification + forensics.
#
# Rule: resolve via `git rev-parse` (git handles both storage forms), OR fall back
# loose → packed-refs explicitly. NEVER assume the loose ref file exists.

# ── Preferred: let git do it (handles loose, packed, detached HEAD, worktrees) ──
git_sha() { git -C "${1:-.}" rev-parse HEAD 2>/dev/null; }

# ── Fallback: no git binary on the box (minimal container). Read refs by hand. ──
#    Resolves HEAD → branch, then loose file → packed-refs → fail (never returns "ref:").
git_sha_no_binary() {
  local repo="${1:-.}" gitdir="${1:-.}/.git" head ref line sha
  [ -f "$gitdir/HEAD" ] || { echo "unknown"; return 1; }
  head="$(cat "$gitdir/HEAD")"
  case "$head" in
    ref:*)
      ref="${head#ref: }"; ref="${ref#"${ref%%[![:space:]]*}"}"   # strip 'ref: ' + ws
      # 1. loose ref file
      if [ -f "$gitdir/$ref" ]; then
        sha="$(cat "$gitdir/$ref")"
      # 2. packed-refs (loose file was gc'd away). Fixed-string match the ref so a
      #    branch name with ERE metacharacters (. + [) can't misfire — grep the
      #    40-hex-prefix lines first, then match the ref as a LITERAL whole field
      #    (awk `$2 == ref`, not a substring/regex) so `main` never matches `mainline`.
      elif [ -f "$gitdir/packed-refs" ]; then
        sha="$(grep -E '^[[:xdigit:]]{40} ' "$gitdir/packed-refs" | awk -v r="$ref" '$2 == r { print $1 }')"
      fi
      ;;
    *) sha="$head" ;;                                             # detached HEAD = raw SHA
  esac
  # Only emit a real 40-char SHA — never fall through to the symbolic 'ref:' string.
  if printf '%s' "$sha" | grep -qE '^[[:xdigit:]]{40}$'; then
    printf '%s\n' "$sha"
  else
    echo "unknown"; return 1
  fi
}

# Resolve: prefer the git binary, degrade to the hand-parser.
resolve_sha() { git_sha "$1" || git_sha_no_binary "$1" || echo "unknown"; }

# ── Python equivalent (health endpoints are often Python/Node) ─────────────────
# def git_sha_at_startup(repo="."):
#     # Prefer the binary — it resolves loose AND packed refs and detached HEAD.
#     try:
#         return subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"],
#                                        text=True).strip()
#     except Exception:
#         pass
#     gitdir = pathlib.Path(repo) / ".git"
#     head = (gitdir / "HEAD").read_text().strip()
#     if not head.startswith("ref:"):
#         return head                                     # detached HEAD
#     ref = head[4:].strip()
#     loose = gitdir / ref
#     if loose.exists():
#         return loose.read_text().strip()
#     packed = gitdir / "packed-refs"                     # loose ref was gc'd away
#     if packed.exists():
#         for line in packed.read_text().splitlines():
#             if line.endswith(" " + ref) and not line.startswith(("#", "^")):
#                 return line.split(" ", 1)[0]
#     return "unknown"                                    # never return the 'ref:' string

[ "${BASH_SOURCE[0]}" = "$0" ] && resolve_sha "${1:-.}"
