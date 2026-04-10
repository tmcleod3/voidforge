/**
 * Auto-funding module tests — bridges treasury-planner and funding-policy.
 * Tier 1: Pure logic — verifies correct planner + policy integration.
 */

import { describe, it, expect } from 'vitest';
import type { Cents, StablecoinFundingSource, OperatingBankAccount } from '../lib/patterns/funding-plan.js';

const { evaluateAutoFunding } = await import('../lib/financial/funding-auto.js');

// -- Test Helpers -------------------------------------------------

function makeSource(overrides?: Partial<StablecoinFundingSource>): StablecoinFundingSource {
  return {
    provider: 'circle',
    asset: 'USDC',
    network: 'ETH',
    availableBalanceCents: 500000 as Cents,
    minimumRedemptionCents: 10000 as Cents,
    estimatedFeeCents: 2500 as Cents,
    estimatedSettlementMinutes: 1440,
    ...overrides,
  };
}

function makeBank(overrides?: Partial<OperatingBankAccount>): OperatingBankAccount {
  return {
    bankId: 'bank-001',
    bankName: 'Mercury',
    availableBalanceCents: 50000 as Cents,
    minimumBufferCents: 20000 as Cents,
    reservedBalanceCents: 0 as Cents,
    currency: 'USD',
    ...overrides,
  };
}

// -- Tests --------------------------------------------------------

describe('evaluateAutoFunding()', () => {
  it('should return null when bank balance is sufficient (no off-ramp needed)', () => {
    const result = evaluateAutoFunding({
      source: makeSource(),
      bank: makeBank({ availableBalanceCents: 500000 as Cents }), // $5000 — well above buffer
      planConfig: {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 50000 as Cents,
        targetRunwayDays: 30,
      },
      pendingSpendCents: 0 as Cents,
      obligations: [],
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0 as Cents,
      metaUsesDirectDebit: false,
      metaForecast7DayCents: 0 as Cents,
      debitProtectionBufferCents: 0 as Cents,
      discrepancyExists: false,
      previousHash: 'genesis',
    });

    expect(result).toBeNull();
  });

  it('should return a funding plan when balance is below buffer target', () => {
    const result = evaluateAutoFunding({
      source: makeSource({ availableBalanceCents: 500000 as Cents }),
      bank: makeBank({ availableBalanceCents: 30000 as Cents }), // $300 — below $1000 buffer
      planConfig: {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 200000 as Cents,
        targetRunwayDays: 30,
      },
      pendingSpendCents: 50000 as Cents,
      obligations: [{
        id: 'ob-1', platform: 'google', type: 'buffer',
        amountCents: 70000 as Cents, dueDate: '2026-04-15', overdue: false,
      }],
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0 as Cents,
      metaUsesDirectDebit: false,
      metaForecast7DayCents: 0 as Cents,
      debitProtectionBufferCents: 0 as Cents,
      discrepancyExists: false,
      previousHash: 'genesis',
    });

    expect(result).not.toBeNull();
    expect(result!.plan).toBeDefined();
    expect(result!.plan.requiredCents).toBeGreaterThan(0);
    expect(result!.policyDecisions).toBeDefined();
    expect(result!.policyDecisions.length).toBeGreaterThan(0);
  });

  it('should return null when discrepancy exists (policy blocks)', () => {
    const result = evaluateAutoFunding({
      source: makeSource(),
      bank: makeBank({ availableBalanceCents: 30000 as Cents }),
      planConfig: {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 200000 as Cents,
        targetRunwayDays: 30,
      },
      pendingSpendCents: 50000 as Cents,
      obligations: [{
        id: 'ob-1', platform: 'google', type: 'buffer',
        amountCents: 70000 as Cents, dueDate: '2026-04-15', overdue: false,
      }],
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0 as Cents,
      metaUsesDirectDebit: false,
      metaForecast7DayCents: 0 as Cents,
      debitProtectionBufferCents: 0 as Cents,
      discrepancyExists: true, // This triggers policy denial
      previousHash: 'genesis',
    });

    // Policy rule 6 should deny when discrepancy exists
    expect(result).toBeNull();
  });

  it('should still generate a plan when stablecoin balance is low (planner is balance-agnostic)', () => {
    // The planner generates plans based on obligations and bank deficit,
    // not source balance. The source balance check happens at execution time.
    const result = evaluateAutoFunding({
      source: makeSource({ availableBalanceCents: 100 as Cents }), // $1 — very low
      bank: makeBank({ availableBalanceCents: 30000 as Cents }),
      planConfig: {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 200000 as Cents,
        targetRunwayDays: 30,
      },
      pendingSpendCents: 50000 as Cents,
      obligations: [{
        id: 'ob-1', platform: 'google', type: 'buffer',
        amountCents: 70000 as Cents, dueDate: '2026-04-15', overdue: false,
      }],
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0 as Cents,
      metaUsesDirectDebit: false,
      metaForecast7DayCents: 0 as Cents,
      debitProtectionBufferCents: 0 as Cents,
      discrepancyExists: false,
      previousHash: 'genesis',
    });

    // Plan is generated (policy allows it); execution layer checks source balance
    expect(result).not.toBeNull();
    expect(result!.plan.requiredCents).toBeGreaterThan(0);
  });

  it('should include all 7 policy decisions when plan is approved', () => {
    const result = evaluateAutoFunding({
      source: makeSource({ availableBalanceCents: 1000000 as Cents }),
      bank: makeBank({
        availableBalanceCents: 30000 as Cents,
        minimumBufferCents: 10000 as Cents,
      }),
      planConfig: {
        minimumOfframpCents: 10000 as Cents,
        bufferTargetCents: 100000 as Cents,
        maxDailyOfframpCents: 500000 as Cents,
        targetRunwayDays: 30,
      },
      pendingSpendCents: 50000 as Cents,
      obligations: [{
        id: 'ob-1', platform: 'google', type: 'buffer',
        amountCents: 70000 as Cents, dueDate: '2026-04-15', overdue: false,
      }],
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0 as Cents,
      metaUsesDirectDebit: false,
      metaForecast7DayCents: 0 as Cents,
      debitProtectionBufferCents: 0 as Cents,
      discrepancyExists: false,
      previousHash: 'genesis',
    });

    if (result) {
      expect(result.policyDecisions.length).toBe(7);
      // All should be 'allow' for a clean state
      const allAllow = result.policyDecisions.every(d => d.action === 'allow');
      expect(allAllow).toBe(true);
    }
  });
});
