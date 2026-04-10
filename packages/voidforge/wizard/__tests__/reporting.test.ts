/**
 * Financial reporting tests — daily reports, monthly ledgers, and funding simulation.
 * Tier 1: Pure logic — no mocks needed, deterministic computations.
 */

import { describe, it, expect } from 'vitest';
import type { Cents } from '../lib/patterns/funding-plan.js';

// -- Dynamic import (reporting depends on treasury-planner and funding-policy) --

const { generateDailyReport, generateMonthlyLedger, simulateFunding } = await import(
  '../lib/financial/reporting.js'
);

// -- Daily Report Tests -------------------------------------------

describe('generateDailyReport()', () => {
  it('should generate a markdown report with revenue and spend sections', () => {
    const report = generateDailyReport({
      date: '2026-04-01',
      revenueCents: 150000 as Cents,
      spendCents: 80000 as Cents,
      stablecoinBalanceCents: 500000 as Cents,
      pendingTransfersCents: 25000 as Cents,
      bankBalanceCents: 200000 as Cents,
      settledTodayCents: 0 as Cents,
      reconciliation: null,
      activeCircuitBreakers: [],
      runwayDays: 45,
      fundingFrozen: false,
      freezeReason: null,
    });

    expect(report).toContain('Treasury Daily Report');
    expect(report).toContain('2026-04-01');
    expect(report).toContain('$1500.00');
    expect(report).toContain('$800.00');
    expect(report).toContain('+$700.00'); // net = revenue - spend
    expect(report).toContain('45 days');
  });

  it('should show negative net when spend exceeds revenue', () => {
    const report = generateDailyReport({
      date: '2026-04-02',
      revenueCents: 50000 as Cents,
      spendCents: 120000 as Cents,
      stablecoinBalanceCents: 300000 as Cents,
      pendingTransfersCents: 0 as Cents,
      bankBalanceCents: 100000 as Cents,
      settledTodayCents: 0 as Cents,
      reconciliation: null,
      activeCircuitBreakers: [],
      runwayDays: 10,
      fundingFrozen: false,
      freezeReason: null,
    });

    expect(report).toContain('$-700.00');
  });

  it('should include reconciliation data when present', () => {
    const report = generateDailyReport({
      date: '2026-04-03',
      revenueCents: 100000 as Cents,
      spendCents: 60000 as Cents,
      stablecoinBalanceCents: 200000 as Cents,
      pendingTransfersCents: 0 as Cents,
      bankBalanceCents: 150000 as Cents,
      settledTodayCents: 50000 as Cents,
      reconciliation: {
        transferMatches: [{ transferId: 't1', bankTransactionId: 'b1', varianceCents: 0 as Cents, matchResult: 'EXACT' as const }],
        spendMatches: [],
        unmatchedTransfers: [],
        unmatchedBankTransactions: [],
        overallVarianceCents: 0 as Cents,
        mismatchCount: 0,
      },
      activeCircuitBreakers: [],
      runwayDays: 30,
      fundingFrozen: false,
      freezeReason: null,
    });

    expect(report).toContain('Reconciliation');
    expect(report).toContain('Transfers Matched | 1');
    expect(report).toContain('Mismatches | 0');
  });

  it('should include circuit breaker section when funding is frozen', () => {
    const report = generateDailyReport({
      date: '2026-04-04',
      revenueCents: 0 as Cents,
      spendCents: 0 as Cents,
      stablecoinBalanceCents: 0 as Cents,
      pendingTransfersCents: 0 as Cents,
      bankBalanceCents: 0 as Cents,
      settledTodayCents: 0 as Cents,
      reconciliation: null,
      activeCircuitBreakers: ['Google billing overdue'],
      runwayDays: 0,
      fundingFrozen: true,
      freezeReason: 'Reconciliation discrepancy detected',
    });

    expect(report).toContain('FUNDING FROZEN');
    expect(report).toContain('Reconciliation discrepancy');
    expect(report).toContain('Google billing overdue');
  });

  it('should show Unlimited for infinite runway', () => {
    const report = generateDailyReport({
      date: '2026-04-05',
      revenueCents: 100000 as Cents,
      spendCents: 0 as Cents,
      stablecoinBalanceCents: 1000000 as Cents,
      pendingTransfersCents: 0 as Cents,
      bankBalanceCents: 500000 as Cents,
      settledTodayCents: 0 as Cents,
      reconciliation: null,
      activeCircuitBreakers: [],
      runwayDays: Infinity,
      fundingFrozen: false,
      freezeReason: null,
    });

    expect(report).toContain('Unlimited');
  });
});

// -- Monthly Ledger Tests -----------------------------------------

describe('generateMonthlyLedger()', () => {
  it('should aggregate transfer and reconciliation data', () => {
    const transfers = [
      {
        id: 'tf-1', date: '2026-03-05', direction: 'crypto_to_fiat',
        amountCents: 100000 as Cents, feesCents: 2500 as Cents,
        netAmountCents: 97500 as Cents, status: 'completed', reference: 'ref-1',
      },
      {
        id: 'tf-2', date: '2026-03-15', direction: 'crypto_to_fiat',
        amountCents: 50000 as Cents, feesCents: 2500 as Cents,
        netAmountCents: 47500 as Cents, status: 'completed', reference: 'ref-2',
      },
    ];

    const reconciliations = [
      {
        id: 'rc-1', date: '2026-03-10', platform: 'google',
        spendCents: 80000 as Cents, bankSettledCents: 80000 as Cents,
        varianceCents: 0 as Cents, result: 'EXACT',
      },
      {
        id: 'rc-2', date: '2026-03-20', platform: 'meta',
        spendCents: 60000 as Cents, bankSettledCents: 59500 as Cents,
        varianceCents: 500 as Cents, result: 'MISMATCH',
      },
    ];

    const ledger = generateMonthlyLedger('2026-03', transfers, reconciliations);

    expect(ledger.month).toBe('2026-03');
    expect(ledger.transfers).toHaveLength(2);
    expect(ledger.reconciliations).toHaveLength(2);

    // Summary aggregation checks
    expect(ledger.summary.totalTransfersCents).toBe(150000);
    expect(ledger.summary.totalFeesCents).toBe(5000);
    expect(ledger.summary.totalNetTransferredCents).toBe(145000);
    expect(ledger.summary.totalSpendCents).toBe(140000);
    expect(ledger.summary.totalBankSettledCents).toBe(139500);
    expect(ledger.summary.totalVarianceCents).toBe(500);
    expect(ledger.summary.transferCount).toBe(2);
    expect(ledger.summary.reconciliationCount).toBe(2);
    expect(ledger.summary.mismatchCount).toBe(1);
  });

  it('should handle empty data', () => {
    const ledger = generateMonthlyLedger('2026-01', [], []);

    expect(ledger.month).toBe('2026-01');
    expect(ledger.summary.totalTransfersCents).toBe(0);
    expect(ledger.summary.transferCount).toBe(0);
    expect(ledger.summary.mismatchCount).toBe(0);
  });
});

// -- Funding Simulation Tests -------------------------------------

describe('simulateFunding()', () => {
  it('should project bank balance over N days', () => {
    const result = simulateFunding(
      '2026-04-01',                    // startDate
      200000 as Cents,                  // startingBankBalanceCents ($2000)
      {                                 // config
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 50000 as Cents,
        targetRunwayDays: 30,
      },
      [                                 // campaigns
        { campaignId: 'c1', platform: 'google', dailyBudgetCents: 5000 as Cents, status: 'active' },
      ],
      7,                                // days
      500000 as Cents,                  // stablecoinAvailableCents
      50000 as Cents,                   // minimumBufferCents
    );

    expect(result.config.startDate).toBe('2026-04-01');
    expect(result.config.days).toBe(7);
    expect(result.days).toHaveLength(7);
    expect(result.days[0].day).toBe(1);
    expect(result.days[0].date).toBe('2026-04-01');
    expect(typeof result.summary.finalBalanceCents).toBe('number');
    expect(typeof result.summary.minimumBalanceCents).toBe('number');
  });

  it('should detect freeze risk when balance drops below minimum buffer', () => {
    // Start with very low balance and high spend
    const result = simulateFunding(
      '2026-04-01',
      60000 as Cents,                   // $600 starting balance
      {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 50000 as Cents,
        targetRunwayDays: 30,
      },
      [
        { campaignId: 'c1', platform: 'google', dailyBudgetCents: 20000 as Cents, status: 'active' },
      ],
      5,
      0 as Cents,                       // no stablecoin available
      50000 as Cents,                   // minimum buffer
    );

    // With $200/day spend and $600 start and no stablecoin, balance will drop below buffer
    expect(result.summary.freezeRiskDays.length).toBeGreaterThan(0);
  });

  it('should track off-ramp triggers when balance drops below buffer target', () => {
    const result = simulateFunding(
      '2026-04-01',
      80000 as Cents,                   // $800 starting (below $1000 buffer target)
      {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 50000 as Cents,
        targetRunwayDays: 30,
      },
      [
        { campaignId: 'c1', platform: 'google', dailyBudgetCents: 5000 as Cents, status: 'active' },
      ],
      10,
      500000 as Cents,                  // plenty of stablecoin
      30000 as Cents,
    );

    // Should trigger at least one off-ramp since starting below buffer target
    expect(result.summary.offrampCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalOfframpsCents).toBeGreaterThan(0);
    expect(result.summary.firstOfframpDay).toBeDefined();
  });
});
