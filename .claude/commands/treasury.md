# /treasury — Dockson's Financial Operations

> *"Every coin has a story. I know them all."*

Read `/docs/methods/TREASURY.md` for operating rules.
Read `/docs/methods/HEARTBEAT.md` for daemon architecture.

## Agent Deployment Manifest

**Lead:** Dockson (`subagent_type: dockson-treasury`)
**Core team:**
- **Steris** (`subagent_type: steris-budget`) — budget allocation, forecasting, contingency plans
- **Vin** (`subagent_type: vin-analytics`) — revenue analytics, attribution, pattern detection
- **Szeth** (`subagent_type: szeth-compliance`) — financial compliance, tax records, platform ToS
- **Breeze** (`subagent_type: breeze-platform-relations`) — platform relations, API credentials, OAuth management
- **Wax** (`subagent_type: wax-paid-ads`) — spend execution, campaign budget management

## Prerequisites

### System Requirements
If `packages/voidforge/wizard/server.ts` does not exist (methodology-only install):
1. Offer: "Treasury requires the wizard server. Pull it from upstream? [Y/n]"
2. On yes: `git fetch voidforge main 2>/dev/null || git remote add voidforge https://github.com/tmcleod3/voidforge.git && git fetch voidforge main` then `git checkout voidforge/main -- packages/voidforge/` then `npm install`
3. On no: stop with "Run manually: `git checkout voidforge/main -- packages/voidforge/`"

### External Accounts & API Keys
**Required for treasury setup:**
- **Cultivation installed:** Run `/cultivation install` first — treasury operates within cultivation.
- **Financial vault password:** 12+ characters, set during cultivation install.

**Required for revenue tracking:**
- **Stripe** (`sk_live_...` or `sk_test_...`) or **Paddle** (API key + vendor ID) — at least one revenue source for ROAS.

**Required for stablecoin funding (optional):**
- **Circle:** USDC account + API key for automated off-ramp. [Create account](https://www.circle.com/en/).
- **Bank account:** Mercury or Brex connected for fiat settlement.

**Required for ad spend tracking:**
- Ad platform credentials configured via `/grow --setup` (Google Ads, Meta Ads, etc.).

## Context Setup
1. Check if financial vault exists (`~/.voidforge/treasury/vault.enc`)
2. Check if heartbeat daemon is running (`~/.voidforge/heartbeat.json`)
3. If no vault: route to setup flow
4. If vault exists but no args: show `--status`

## First-Run Experience (§9.15.1)

When no treasury vault exists:
1. "Treasury manages your project's finances — revenue tracking, ad spend budgets, and reconciliation."
2. Start guided setup: connect one revenue source first (recommend Stripe).
3. After first source connected: "Financial operations require two-factor authentication. Set up now? [Y/n]"
4. TOTP required before connecting ad platforms or enabling spend.
5. After setup: show treasury status with next steps.

## Setup Flow

`/treasury setup`:
1. "Which revenue sources?" → Stripe / Paddle / Skip for now
2. For each selected source:
   - Stripe: "Paste your restricted API key (read-only). Find it at https://dashboard.stripe.com/apikeys"
   - Paddle: "Paste your API key (read-only). Find it in your Paddle dashboard."
3. For each: encrypt → store in financial vault → connection test → initial data pull
4. Show: current balance, last 30 days revenue
5. Offer TOTP setup if not configured
6. Offer heartbeat daemon start if not running

## Commands

### Viewing
- `/treasury` or `/treasury --status` — financial summary
- `/treasury --report` — monthly report (JSON/CSV/markdown)

### Managing
- `/treasury --budget N` — set total monthly budget ($N)
- `/treasury --reconcile` — trigger manual reconciliation
- `/treasury --launch [file]` — launch campaigns from growth-campaigns.json
- `/treasury --hard-stop N` — set daily hard stop amount
- `/treasury --export [path]` — export all financial data (encrypted)

### Preview
- `/treasury --dry-run` — Show what --launch would do without executing. Preview campaign submissions and spend amounts.

### Emergency
- `/treasury --freeze` — pause ALL automated spending immediately
- `/treasury --unfreeze` — resume (requires vault password + TOTP)
- `/treasury --setup-2fa` — configure or reconfigure TOTP

## Status Display

```
═══════════════════════════════════════════
  TREASURY — [Month Year]
═══════════════════════════════════════════
  Revenue (Stripe):        $X,XXX
  Ad Spend (all platforms): $X,XXX
  Net:                      $X,XXX
  Blended ROAS:                X.Xx
  Budget remaining:          $XXX
  Reconciliation:          ✓ MATCHED
  Heartbeat:               ● Online
═══════════════════════════════════════════
```

### Stablecoin Funding
- `/treasury setup --crypto` — First-time stablecoin funding setup: provider selection (Circle / Bridge / manual), destination bank, treasury mode (maintain-buffer / just-in-time), buffer threshold, freeze thresholds, TOTP verification
- `/treasury --balances` — Show stablecoin source balance, bank available balance, reserved balance, and per-platform runway
- `/treasury --funding-status` — Show end-to-end funding chain: pending off-ramps, unsettled invoices, expected debits, freeze state, and funding sub-state
- `/treasury --offramp --amount N` — Initiate off-ramp of $N from stablecoin provider to destination bank (requires vault + TOTP)
- `/treasury --target-balance N` — Set minimum USD operating balance target at destination bank
- `/treasury --runway` — Forecast days of runway based on projected campaign spend vs available fiat
- `/treasury --invoice-pay [platform] [invoice-id]` — Settle a specific platform invoice (requires vault + TOTP)
- `/treasury --reconcile` — Trigger manual reconciliation across stablecoin transfers, bank settlements, and platform spend
- `/treasury --simulate-funding` — Dry-run: show projected 14-day spend, required float, recommended off-ramp amount, settlement lead time, and freeze triggers

## Arguments
$ARGUMENTS
