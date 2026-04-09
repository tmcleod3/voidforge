/**
 * Treasury summary cache tests — O(1) read from treasury-summary.json with O(n) JSONL fallback.
 * v22.1 Mission 2 — Campaign 30.
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const tempDir = await createTempHome();

// Import directly — treasury-reader.ts doesn't use homedir() at module level
import { readTreasurySummary, readHeartbeatSnapshot, TREASURY_SUMMARY_FILE } from '../lib/treasury-reader.js';

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

describe('Treasury Summary Cache (v22.1 M2)', () => {
  let treasuryDir: string;
  let testSeq = 0;

  beforeEach(async () => {
    treasuryDir = join(tempDir, `treasury-${Date.now()}-${++testSeq}`);
    await mkdir(treasuryDir, { recursive: true });
  });

  describe('TREASURY_SUMMARY_FILE constant', () => {
    it('is treasury-summary.json', () => {
      expect(TREASURY_SUMMARY_FILE).toBe('treasury-summary.json');
    });
  });

  describe('readTreasurySummary — O(1) cached path', () => {
    it('reads from treasury-summary.json when present', async () => {
      const cached = {
        revenue: 50000,
        spend: 20000,
        net: 30000,
        roas: 2.5,
        budgetRemaining: 80000,
        stablecoinBalance: null,
        pendingOfframps: 0,
        bankAvailable: null,
        bankReserved: null,
        runwayDays: null,
        fundingState: null,
        nextTreasuryEvent: null,
        unsettledInvoices: 0,
        reconciliationStatus: null,
        timestamp: '2026-04-09T10:00:00Z',
      };
      await writeFile(join(treasuryDir, TREASURY_SUMMARY_FILE), JSON.stringify(cached), 'utf-8');

      const result = await readTreasurySummary(treasuryDir);
      expect(result.revenue).toBe(50000);
      expect(result.spend).toBe(20000);
      expect(result.net).toBe(30000);
      expect(result.roas).toBe(2.5);
      expect(result.budgetRemaining).toBe(80000);
    });

    it('ignores cached file with invalid shape', async () => {
      // Write a cache with missing required fields
      await writeFile(join(treasuryDir, TREASURY_SUMMARY_FILE), '{"invalid": true}', 'utf-8');

      // Should fall through to JSONL scan — which returns zeros for empty dir
      const result = await readTreasurySummary(treasuryDir);
      expect(result.spend).toBe(0);
      expect(result.revenue).toBe(0);
    });

    it('ignores malformed JSON in cached file', async () => {
      await writeFile(join(treasuryDir, TREASURY_SUMMARY_FILE), 'not-json{{{', 'utf-8');

      const result = await readTreasurySummary(treasuryDir);
      expect(result.spend).toBe(0);
      expect(result.revenue).toBe(0);
    });

    it('fills in defaults for optional fields', async () => {
      // Minimal valid cache — only spend + revenue
      await writeFile(join(treasuryDir, TREASURY_SUMMARY_FILE), JSON.stringify({
        spend: 1000,
        revenue: 3000,
      }), 'utf-8');

      const result = await readTreasurySummary(treasuryDir);
      expect(result.spend).toBe(1000);
      expect(result.revenue).toBe(3000);
      expect(result.net).toBe(2000); // computed from spend/revenue
      expect(result.roas).toBe(3.0); // computed from spend/revenue
      expect(result.budgetRemaining).toBe(0);
      expect(result.stablecoinBalance).toBeNull();
      expect(result.pendingOfframps).toBe(0);
    });
  });

  describe('readTreasurySummary — O(n) JSONL fallback', () => {
    it('scans JSONL when no summary cache exists', async () => {
      // Write spend-log.jsonl entries (not hash-chained for simplicity — reader parses amountCents)
      await writeFile(join(treasuryDir, 'spend-log.jsonl'),
        '{"amountCents": 500}\n{"amountCents": 300}\n', 'utf-8');
      await writeFile(join(treasuryDir, 'revenue-log.jsonl'),
        '{"amountCents": 2000}\n', 'utf-8');

      const result = await readTreasurySummary(treasuryDir);
      expect(result.spend).toBe(800);
      expect(result.revenue).toBe(2000);
      expect(result.net).toBe(1200);
    });

    it('returns empty summary for nonexistent directory', async () => {
      const result = await readTreasurySummary(join(tempDir, 'nonexistent'));
      expect(result.spend).toBe(0);
      expect(result.revenue).toBe(0);
    });

    it('clamps negative spend values', async () => {
      await writeFile(join(treasuryDir, 'spend-log.jsonl'),
        '{"amountCents": -100}\n{"amountCents": 500}\n', 'utf-8');

      const result = await readTreasurySummary(treasuryDir);
      expect(result.spend).toBe(500); // -100 clamped to 0
    });
  });

  describe('readTreasurySummary — cache priority over JSONL', () => {
    it('prefers cache even when JSONL has different data', async () => {
      // Cache says $100 spend
      await writeFile(join(treasuryDir, TREASURY_SUMMARY_FILE), JSON.stringify({
        spend: 10000, revenue: 50000, net: 40000, roas: 5.0,
        budgetRemaining: 0, stablecoinBalance: null, pendingOfframps: 0,
        bankAvailable: null, bankReserved: null, runwayDays: null,
        fundingState: null, nextTreasuryEvent: null, unsettledInvoices: 0,
        reconciliationStatus: null,
      }), 'utf-8');

      // JSONL says $200 spend
      await writeFile(join(treasuryDir, 'spend-log.jsonl'),
        '{"amountCents": 20000}\n', 'utf-8');

      const result = await readTreasurySummary(treasuryDir);
      // Should use cache value, not JSONL
      expect(result.spend).toBe(10000);
    });
  });

  describe('readHeartbeatSnapshot', () => {
    it('uses treasury summary cache in snapshot', async () => {
      await writeFile(join(treasuryDir, TREASURY_SUMMARY_FILE), JSON.stringify({
        spend: 5000, revenue: 15000, net: 10000, roas: 3.0,
        budgetRemaining: 95000, stablecoinBalance: null, pendingOfframps: 0,
        bankAvailable: null, bankReserved: null, runwayDays: null,
        fundingState: null, nextTreasuryEvent: null, unsettledInvoices: 0,
        reconciliationStatus: null,
      }), 'utf-8');

      const stateFile = join(treasuryDir, 'heartbeat.json');
      const vaultCheck = join(treasuryDir, 'vault.enc');

      const snapshot = await readHeartbeatSnapshot(treasuryDir, stateFile, vaultCheck);
      expect(snapshot.treasury.spend).toBe(5000);
      expect(snapshot.treasury.revenue).toBe(15000);
      expect(snapshot.treasury.roas).toBe(3.0);
    });
  });
});
