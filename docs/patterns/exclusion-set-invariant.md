# Pattern: Exclusion-Set Superset Invariant

**When to use:** Any project where MORE THAN ONE mechanism independently enumerates "secret / PII / excluded" files — typically `.gitignore`, an `rsync --exclude` (or `tar --exclude`) deploy list, and a secret-scanner config (gitleaks/trufflehog/detect-secrets). Containment-heavy projects (autonomous agents, deploy pipelines that ship a working tree to a host) are the high-risk case.

**Source:** Field report #377 §5 (live secret exposure traced to three exclusion mechanisms drifting apart).

## The Failure Mode

Each mechanism enumerates "the secret files" by its OWN rules, authored at a different time by a different concern:

- `.gitignore` keeps secrets OUT OF GIT.
- `rsync --exclude` (deploy) keeps secrets OFF THE TARGET HOST.
- the secret-scanner keeps secrets OUT OF COMMITS / CI.

Because the three lists are written and maintained separately, they drift. A file the `.gitignore` covers shipped through `rsync` world-readable, and the scanner's name patterns never matched it — so a secret excluded from git was deployed to the host and went undetected. Three "secured" mechanisms, zero of them caught the leak, because none of them agreed on the set.

The trap: each list looks complete in isolation. The bug is in the DELTA between them, which no single mechanism can see.

## The Pattern — One Canonical Set, the Others are Supersets

Define ONE canonical secret/PII exclusion set. Every other mechanism's exclusion set must be a SUPERSET of it (it may exclude more — never less). Then assert the invariant in CI so it cannot silently drift.

1. **Canonical source.** Pick one list as canonical (usually `.gitignore`'s secret section, or a dedicated `secrets.exclude` manifest). This is the minimum set every mechanism must cover.

2. **Derive, don't duplicate, where possible.** Generate the `rsync --exclude-from=` file and the scanner's path patterns FROM the canonical set at build time. Derivation makes drift structurally impossible; if a mechanism's format can't be derived, fall to the assertion below.

3. **Assert the superset invariant.** A CI/provisioning check that fails closed:

```bash
# exclusion-set-invariant check — every mechanism must cover the canonical set.
# Canonical set = the secret/PII globs that MUST be excluded everywhere.
canonical=$(sort -u docs/security/secrets.exclude)   # one file, one canonical truth

# Each mechanism exposes its excluded globs (normalize to one-glob-per-line).
gitignore=$(git_secret_globs)        # secret section of .gitignore
rsync_excl=$(cat deploy/rsync.exclude)
scanner=$(scanner_path_globs)        # gitleaks/trufflehog allow/deny paths

fail=0
for mech in "gitignore:$gitignore" "rsync:$rsync_excl" "scanner:$scanner"; do
  name="${mech%%:*}"; have="${mech#*:}"
  # Anything in canonical NOT covered by this mechanism = drift = fail.
  missing=$(comm -23 <(printf '%s\n' "$canonical" | sort -u) \
                     <(printf '%s\n' "$have"      | sort -u))
  if [[ -n "$missing" ]]; then
    echo "EXCLUSION DRIFT: '$name' is missing canonical entries:" >&2
    echo "$missing" >&2
    fail=1
  fi
done
exit "$fail"
```

4. **Wire it into the gates.** Run the check in CI AND as a deploy/arming pre-flight (per the field report it was a deploy-time exposure). A new secret pattern added to the canonical set then forces every mechanism to cover it, or the build/deploy fails.

## The Invariant, Stated

> `canonical ⊆ gitignore` AND `canonical ⊆ rsync_exclude` AND `canonical ⊆ scanner` — at all times, enforced by an assertion. Supersets are fine; subsets are drift.

## The Trade-off

Derivation (step 2) is strictly better than assertion (step 3) — it removes the possibility of drift instead of detecting it — but not every tool accepts a generated exclude format, and some teams want each mechanism's list hand-tunable for its own extra concerns (rsync excluding build artifacts; the scanner allow-listing test fixtures). The superset invariant is the floor that permits those per-mechanism extras while forbidding any mechanism from covering LESS than the canonical secret set. Use derivation where the format allows; fall back to the asserted invariant everywhere else. (Field report #377 §5.)
