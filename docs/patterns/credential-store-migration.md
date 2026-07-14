# credential-store-migration — the pre-irreversible-deletion consumer gate

**When to use.** Any migration that will **delete or rotate a credential store** other consumers read: `.env` → a secrets manager (1Password `op`, Vault, AWS Secrets Manager), rotating a shared secret, decommissioning a key file. The dangerous step is the **deletion** (M-last), and its blast radius is every consumer that resolves the secret at runtime — many of which live **outside the repo** and are invisible to a repo-scoped grep.

**The failure this prevents.** A pre-deletion "consumer gate" that greps only the repo (`scripts/`, app source) migrates the readers it finds and declares done — then deleting `.env` silently 401s a fleet of cron jobs, systemd units, or inline shells that each resolved the secret with their own `grep "^SECRET=" .../.env`. A `bash -c` swallows the failure into a log nobody watches; the outage surfaces hours later. (Field report #394: 9 API cron jobs each inline-read `CRON_SECRET` from `.env`; deleting it 401'd all 9 — caught by the Victory Gauntlet, not the deletion gate that should have caught it.)

## The gate — enumerate consumers across ALL execution surfaces, then migrate, then delete

Deleting a credential store is a two-phase, verified operation. **Never delete until phase 1's list is empty of unmigrated consumers.**

```bash
SECRET_NAME="CRON_SECRET"          # the key being migrated
STORE_PATH="/home/ubuntu/app/.env" # the store being deleted

# ── Phase 1: enumerate EVERY consumer, not just the repo ──────────────────────
# 1. The repo (the surface a naive gate stops at)
grep -rn --include='*.sh' --include='*.ts' --include='*.py' --include='*.mts' \
     -e "$SECRET_NAME" -e "$(basename "$STORE_PATH")" . 2>/dev/null

# 2. crontab — the surface #394 missed. Inline `grep ^KEY= .../.env` hides here.
crontab -l 2>/dev/null | grep -nE "$SECRET_NAME|$(basename "$STORE_PATH")"
# 2b. System crontabs — SEARCH contents, not just list dirs
sudo grep -rlnE "$SECRET_NAME|$(basename "$STORE_PATH")" \
     /etc/cron.* /var/spool/cron /var/spool/cron/crontabs 2>/dev/null

# 3. systemd units — EnvironmentFile=, ExecStart inline reads, ReadWritePaths=
grep -rlnE "$SECRET_NAME|$(basename "$STORE_PATH")" \
     /etc/systemd/system/ ~/.config/systemd/user/ 2>/dev/null

# 4. Process managers + shells — PM2 ecosystem files, .bashrc/.profile, supervisor
grep -rnE "$SECRET_NAME" ~/.bashrc ~/.profile ~/.zshrc ecosystem.config.* \
     /etc/supervisor/ 2>/dev/null

# 5. Any OTHER inline reader of the store path itself (the general case of #2/#3)
grep -rnE "$(basename "$STORE_PATH")" /etc /home 2>/dev/null | grep -vF "$STORE_PATH"

# ── Phase 2: migrate every consumer found above to the new store ──────────────
#   Each consumer now resolves the secret from the new source (op read, vault get,
#   aws secretsmanager get-secret-value). Re-run Phase 1 — the list must be empty.

# ── Phase 3: delete, then PROVE the consumers still work ──────────────────────
rm "$STORE_PATH"
#   Re-trigger each migrated consumer and assert success — do NOT trust that
#   "the code was changed." A cron that 401s writes to a log, not your terminal.
#   e.g. curl the endpoint the cron hits and assert 200; run the unit and check
#   `systemctl status` / `journalctl -u <unit> -n5`; watch for the swallowed error.
```

## Rules

1. **A deletion gate that scans only the repo is incomplete.** Off-repo execution surfaces — crontab, systemd, PM2 ecosystem files, login shells, supervisor — each hold consumers no `git grep` will ever see. Enumerate all of them before the delete.
2. **The delete is irreversible; the verification is not optional.** After deleting, re-trigger each migrated consumer and assert it succeeds against the *new* store. A `bash -c` wrapper turns a 401 into a silent log line — prove liveness, don't assume it.
3. **This is the deletion-side complement to the security sweep.** `SECURITY_AUDITOR.md` "Adjacent plaintext credential-store sweep" finds stores that shouldn't exist; this gate safely *removes* one. Run both on a credential campaign.
4. **Keep docs of record live during the migration.** Update the ADR Status + ROADMAP per-phase (CAMPAIGN.md rule 5.3) — an ADR reading "NOT IMPLEMENTED" while the system runs on the new store misleads the next operator.

**Related:** `docs/methods/SECURITY_AUDITOR.md` (adjacent-store sweep), `docs/patterns/exclusion-set-invariant.md` (one canonical secret set), `docs/methods/DEVOPS_ENGINEER.md` (`pkill -f` self-match, systemd `ReadWritePaths=`).
