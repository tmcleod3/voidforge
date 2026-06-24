#!/usr/bin/env bash
# egress-sandbox.sh — Pattern: run a network-egress-confined workload WITHOUT
# making its artifacts root-owned (field report #382 RC-2).
#
# PROBLEM. A common "egress sandbox" wraps a workload in `sudo systemd-run` with
# IPAddressAllow/IPAddressDeny to confine outbound network. Done naively it runs
# the workload as ROOT (sudo's default), so every file the workload writes —
# caches, state, lock files, output — is root-owned. A sibling/same-purpose tool
# run later as the normal user then can't read or overwrite that state and
# breaks. The egress confinement never REQUIRED root: IPAddress* filtering is a
# cgroup property (systemd's BPF egress filter) and is uid-independent. Drop the
# workload back to the invoking user and confinement is fully preserved while
# artifacts stay user-owned.
#
# ── WRONG: runs as root, litters root-owned artifacts ────────────────────────
#   sudo systemd-run --pipe --wait \
#     -p IPAddressDeny=any -p IPAddressAllow=10.0.0.0/8 \
#     my-workload --out ./state            # ./state is now root-owned
#
# ── RIGHT: same egress confinement, artifacts owned by the invoking user ──────
INVOKING_UID="$(id -u)"
INVOKING_GID="$(id -g)"

sudo systemd-run --pipe --wait \
  --uid="$INVOKING_UID" --gid="$INVOKING_GID" \
  -p IPAddressDeny=any \
  -p IPAddressAllow=localhost \
  -p IPAddressAllow=10.0.0.0/8 \
  my-workload --out ./state                # ./state owned by the invoking user
#
# WHY IT'S SAFE. IPAddressAllow/IPAddressDeny are enforced by the transient
# unit's cgroup, which applies regardless of the process uid. --uid/--gid only
# change the credential the workload runs under — they do not relax the network
# policy. You get confinement AND user-owned artifacts.
#
# VERIFY BOTH HALVES (don't assume — one assertion per property):
#   1. Confinement: from inside the workload, a connection to a DENIED address
#      must fail —   curl --max-time 3 https://example.org   times out/refused.
#   2. Ownership:    stat -c '%U' ./state   returns the invoking user, not root.
#
# NOTE. IPAddress* allow/deny lists need systemd ≥ 235 with cgroup v2 + BPF; on
# hosts without it, fall back to a network namespace (`ip netns`) or a per-unit
# firewall, but keep the same --uid/--gid drop so artifacts stay user-owned.
