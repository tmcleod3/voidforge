# THE HEARTBEAT — Daemon Architecture & Operations
## Lead Agent: **Dockson** (The Bookkeeper) · Operations: Heartbeat Daemon

> *"The daemon watches while you sleep."*

## Identity

The heartbeat is a lightweight Node.js daemon that runs in the background, separate from the wizard server. It is the **single writer** for all financial state (ADR-1). The CLI and Danger Room are clients; the daemon is the authority.

## Architecture

```
┌─────────────────────────────────────────┐
│         Heartbeat Daemon Process         │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ Unix Domain Socket API              │ │
│  │ ~/.voidforge/run/heartbeat.sock     │ │
│  │ Auth: session token (heartbeat.token)│ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ Scheduled Jobs:                     │ │
│  │   Health ping (60s)                 │ │
│  │   Token refresh (per-platform TTL)  │ │
│  │   Spend check (hourly)              │ │
│  │   Campaign status (15 min)          │ │
│  │   Anomaly detection (hourly)        │ │
│  │   Reconciliation (midnight + 06:00) │ │
│  │   A/B test evaluation (daily)       │ │
│  │   Budget rebalancing (weekly)       │ │
│  │   Growth report (weekly)            │ │
│  │   Campaign kill check (daily)       │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  State: heartbeat.json (60s writes)      │
│  Logs:  heartbeat.log (daily rotation)   │
│  PID:   heartbeat.pid                    │
│  Token: heartbeat.token (24h rotation)   │
└─────────────────────────────────────────┘
```

## Startup Sequence (§9.18)

1. Check PID file → if stale, unlink
2. Check socket file → if stale (ECONNREFUSED), unlink
3. Read heartbeat.json → if dirty shutdown, write `recovering` status
4. Prompt for vault password → derive key, hold in memory
5. Scan pending-ops.jsonl → reconcile stuck operations
6. Verify token health for all platforms
7. Check for missed reconciliation days → queue backfill
8. Write PID file, create socket, start scheduler
9. Transition to `healthy` or `degraded`
10. Write heartbeat.json

## Signal Handling

- **SIGTERM:** Set shutdown flag → complete in-flight requests (10s) → write final heartbeat.json → flush logs → remove PID file → exit 0
- **SIGINT:** Same as SIGTERM
- **SIGHUP:** Reload configuration without restart

## Sleep/Wake Recovery (§9.18)

| Duration | Token Refresh | Spend Check | Reconciliation |
|----------|--------------|-------------|----------------|
| <2h | Stagger 5 min | Current check | Skip |
| 2-24h | Sequential, 10s gaps | Full missed period | Most recent day |
| >24h | Sequential, 30s gaps | Current day only | Backfill queue |

## Socket API (§9.20.11)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /status | Token | Heartbeat status |
| GET | /campaigns | Token | All campaigns |
| GET | /treasury | Token | Financial summary |
| POST | /campaigns/launch | Token + vault | Launch campaigns |
| POST | /campaigns/:id/pause | Token | Pause campaign |
| POST | /campaigns/:id/resume | Token + vault | Resume campaign |
| POST | /budget | Token + vault | Modify budget |
| POST | /freeze | Token | Emergency freeze |
| POST | /unfreeze | Token + vault + TOTP | Unfreeze |
| POST | /reconcile | Token | Manual reconciliation |
| POST | /unlock | Vault password | Re-enter vault after timeout |

## Vault Session (§9.18)

- Vault key held in process memory after password entry
- `--vault-timeout N` (default: 12h, vacation mode: 168h)
- On timeout: daemon enters `degraded` — can write heartbeat.json but cannot refresh tokens
- On SIGTERM: zero key memory before exit
- Core dumps disabled: `setrlimit RLIMIT_CORE 0`

## Service Management

**macOS:** `~/Library/LaunchAgents/com.voidforge.heartbeat.plist`
- KeepAlive: true, RunAtLoad: true, ProcessType: Background

**Linux:** `~/.config/systemd/user/voidforge-heartbeat.service`
- Restart: always, RestartSec: 10

## Resource Footprint

- Memory: <50MB
- CPU: near-zero (sleeping between jobs)
- Network: ~100 API calls/hour at peak
- Disk: heartbeat.json (<1KB), heartbeat.log (<10MB, rotated daily)

## Daemon States

`starting` → `healthy` / `degraded` / `recovering` / `recovery_failed` → `shutting_down` → `stopped`

`degraded`: N of M platforms unreachable, or vault key expired.
`recovering`: dirty shutdown detected, reconciling pending ops.
`recovery_failed`: 3 consecutive recovery attempts failed.
