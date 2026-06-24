# Context Meter — status line + awareness hook

Two small scripts that surface how full the context window is — one for the human, one for the model.

| Script | Wired to | Audience | What it does |
|--------|----------|----------|--------------|
| `voidforge-statusline.sh` | `statusLine` (settings.json) | you | Renders one line: model + a colored meter (`⟦████████░░⟧ 78%`) + tokens remaining. Green → yellow → red as the window fills. |
| `context-awareness-hook.sh` | `UserPromptSubmit` hook | Claude | Once usage crosses a threshold, injects "you have ~X% left, checkpoint soon" into the model's own context each turn. Silent below the threshold. |

The model can't see its own remaining context. The status line tells *you*; the hook tells *Claude* — so it can wrap up open loops and suggest `/vault` or `/seal` before compaction instead of being surprised by it.

## Install

**Default-on.** `npx voidforge-build init` already wires both scripts into a new project's `.claude/settings.json` (warn 80% / crit 92%). Nothing to do for a fresh project.

To re-install, retune, or activate on a project that predates this feature, run **`/contextmeter`** — it chmods these scripts and merges the right block into `.claude/settings.json`. Or wire it by hand: merge `settings-snippet.json` into `.claude/settings.json`. Remove with `/contextmeter --uninstall`.

## How it reads context

- **Status line:** prefers the native `context_window` object Claude Code pipes on stdin (`used_percentage`, `context_window_size`). Falls back to deriving usage from the most recent assistant `message.usage` in `transcript_path` on older Claude Code that doesn't send the field.
- **Hook:** the hook stdin has no `context_window` object, so it always derives from `transcript_path` (`input_tokens + cache_read_input_tokens + cache_creation_input_tokens`).
- 1M-token sessions are detected automatically (usage above 200k ⇒ 1,000,000 denominator), or set `VOIDFORGE_CONTEXT_WINDOW`.

## Tuning (env)

| Var | Default | Effect |
|-----|---------|--------|
| `VOIDFORGE_CONTEXT_WINDOW` | `200000` | Denominator when the size field is absent. |
| `VOIDFORGE_CONTEXT_WARN_PCT` | `80` | Hook starts speaking — and the meter turns yellow — at this % used. |
| `VOIDFORGE_CONTEXT_CRIT_PCT` | `92` | Hook escalates to "checkpoint NOW" — and the meter turns red — at this %. |

Both scripts read the same two thresholds, so the meter's yellow/red bands stay in lockstep with the hook's warn/critical bands. `/contextmeter --warn-pct N` / `--crit-pct N` bake these into the command strings in settings.json so they persist without a shell export.

## Requirements & caveats

- **`jq`** is required. Without it the status line prints a one-line "install jq" notice and the hook no-ops — neither ever breaks your session.
- Only the **first line** of status-line stdout is shown by Claude Code, so the meter is deliberately single-line.
- **Name:** this ships as `/contextmeter`, not `/statusline` — Claude Code's native `/statusline` and `/context` commands always shadow a same-named project command (see `docs/NATIVE_CAPABILITIES.md`).
