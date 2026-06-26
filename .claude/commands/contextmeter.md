# /contextmeter — Context Budget Meter (Ducem Barr)

> *Ducem Barr counts every token. This one tells you — and the model — how many are left.*

Installs VoidForge's context-usage **status line** (a colored meter, green → yellow → red as the window fills) and a **`UserPromptSubmit` awareness hook** that injects remaining-context awareness into Claude itself as you approach the limit. The status line is for you; the hook is for the model, so it can checkpoint with `/vault` or `/seal` before compaction instead of being surprised by it.

**Default-on.** `npx voidforge-build init` already wires both into a new project's `.claude/settings.json` with defaults **warn 80% / crit 92%** (the meter turns yellow at 80%, red at 92%). Run this command only to **re-install**, **retune** the thresholds (`--warn-pct` / `--crit-pct`), check `--status`, or `--uninstall`.

**Why not `/statusline`?** Claude Code ships native `/statusline` and `/context` commands that *always shadow* a same-named project command — a `.claude/commands/statusline.md` would never fire. So this is `/contextmeter`. (Tracked in `docs/NATIVE_CAPABILITIES.md`, ADR-066.)

## Context Setup
1. Read `scripts/statusline/README.md` for what the two scripts do and the env knobs.
2. The scripts ship with the methodology at `scripts/statusline/`. If that directory is missing, the project predates this feature — pull it from `tmcleod3/voidforge:scripts/statusline/` or re-run `npx voidforge-build update`.

## Step 0 — Preflight
0. Read `.claude/settings.json` — if the context-awareness hook is already wired (the default after `init`), this run is a re-install/retune, not a first install. Proceed idempotently (Step 2 replaces the existing entry, never duplicates it).
1. Confirm `scripts/statusline/voidforge-statusline.sh` and `context-awareness-hook.sh` exist. If not, stop and tell the user how to get them (above).
2. Check `jq` is installed (`command -v jq`). If absent, warn: the meter prints an "install jq" notice and the hook no-ops until `jq` is present (`brew install jq` / `apt install jq`). Continue — installation still proceeds.
3. Read `.claude/settings.json` if it exists (else it will be created).
4. **Cross-hierarchy statusLine shadow check (field report #390).** `statusLine` is a **single-winner slot** — Claude Code renders exactly one across the whole settings hierarchy, so a higher-or-equal-precedence definition shadows the project meter even when the project wiring is perfect. Also read `~/.claude/settings.json` and `.claude/settings.local.json`. If either defines a `statusLine` whose command is NOT `voidforge-statusline.sh` (a common case: the native `/statusline` command writes a hand-rolled bar to `~/.claude/settings.json`), flag it: "A `statusLine` in `<file>` will shadow the project meter — Claude Code renders only one." Offer to (a) remove the competing one (back it up first), (b) merge VoidForge's context logic into it, or (c) proceed knowing the meter won't render. Do NOT report a green install while a shadow is live (that is exactly the silent failure #390 documents).

## Step 1 — Make scripts executable
`chmod +x scripts/statusline/*.sh` (invocation is via `bash <script>`, so this is hygiene, not strictly required).

## Step 2 — Merge settings (non-destructively)
Merge `scripts/statusline/settings-snippet.json` into `.claude/settings.json`:
1. **`statusLine`** — if *any* settings file in the hierarchy (`~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`) already defines a `statusLine`, do NOT clobber it silently — `statusLine` is a single-winner slot, so a competing one anywhere in the hierarchy will occupy the render slot (field report #390). Show the existing one and where it lives, and ask whether to replace it (or back it up to `settings.json.bak`). On a fresh/absent statusLine across the whole hierarchy, set it from the snippet.
2. **`hooks.UserPromptSubmit`** — APPEND the awareness-hook entry to the existing array; never overwrite other hooks. (The Silver Surfer gate's hook is on `PreToolUse`, so there is no conflict.) If an identical context-awareness-hook entry is already present, skip — don't duplicate.
3. If `--warn-pct N` / `--crit-pct N` / `--window N` were passed, bake them into BOTH command strings (the `statusLine` and the hook) so the meter's yellow/red bands and the hook's warn/critical bands stay in lockstep, and persist without a shell export:
   - statusLine: `"command": "VOIDFORGE_CONTEXT_WARN_PCT=80 VOIDFORGE_CONTEXT_CRIT_PCT=92 bash scripts/statusline/voidforge-statusline.sh"`
   - hook: `"command": "VOIDFORGE_CONTEXT_WARN_PCT=80 VOIDFORGE_CONTEXT_CRIT_PCT=92 bash scripts/statusline/context-awareness-hook.sh"`
   With no flags, leave both as plain commands — the scripts already default to warn 80 / crit 92.
4. Write `.claude/settings.json` back as valid JSON (preserve all unrelated keys).

## Step 3 — Verify
Render a sample so the user sees the meter immediately:
```
printf '%s' '{"model":{"display_name":"Opus 4.8"},"context_window":{"used_percentage":72,"context_window_size":200000}}' | bash scripts/statusline/voidforge-statusline.sh
```
Show the output. Note that Claude Code applies a new `statusLine`/hook config on the next render / next prompt (a session restart guarantees it).

## Step 4 — Confirm
Report: what was installed, the active thresholds (warn/crit), the jq status, and the tuning env vars. Tell the user the hook stays silent until context crosses the warn threshold.

## Arguments
| Flag | Effect |
|------|--------|
| (none) | Install the status line + awareness hook with defaults (warn 80%, crit 92%). |
| `--warn-pct N` / `--crit-pct N` | Set the hook's warning / critical thresholds (baked into settings.json). |
| `--window N` | Set the fallback context-window denominator (default 200000; auto-detects 1M otherwise). |
| `--status` | Report whether the meter + hook are wired — scanning the **full hierarchy** (`~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`). If a non-VoidForge `statusLine` occupies the single render slot at higher/equal precedence, report "**installed but shadowed by `<file>`**" rather than a bare "wired" (field report #390: a project-only `--status` is a false-positive when a global statusLine shadows the meter). Also report the active thresholds. Don't modify anything. |
| `--uninstall` | Remove the `statusLine` block (if it's ours) and the awareness-hook entry from `.claude/settings.json`. Leave the scripts on disk and all other settings intact. **Also record a persistent opt-out** so `update` won't re-activate the meter: add `"contextmeter"` to the `.voidforge` marker's `autowireOptOut` array (create the array if absent). This makes the uninstall survive future `npx voidforge-build update` runs (#387 RC-2); re-running `/contextmeter` (install) removes the opt-out again. |
| `--dry-run` | Show the settings.json changes that WOULD be made, without writing. |

## Handoffs
- The hook recommends `/vault` and `/seal` at the critical threshold — those are the checkpoint commands it points the model toward.
- Tuning lives in `scripts/statusline/README.md`; the scripts themselves are plain bash + `jq`.
