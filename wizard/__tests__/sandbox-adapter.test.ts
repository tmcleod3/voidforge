/**
 * Sandbox adapter tests — ad platform + bank adapters return valid shapes.
 * Tier 2: Adapter contracts — sandbox drives the full Cultivation demo pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SandboxSetup, SandboxAdapter } from '../lib/adapters/sandbox.js';
import { SandboxBankAdapter } from '../lib/adapters/sandbox-bank.js';

// ── SandboxSetup ──────────────────────────────────────

describe('SandboxSetup', () => {
  const setup = new SandboxSetup('Test Sandbox');

  it('should authenticate and return valid OAuthTokens', async () => {
    const tokens = await setup.authenticate();
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.accessToken.length).toBeGreaterThan(0);
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.refreshToken.length).toBeGreaterThan(0);
    expect(tokens.expiresAt).toBeDefined();
    // Token should expire in the future
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should verify connection and return valid status', async () => {
    const tokens = await setup.authenticate();
    const status = await setup.verifyConnection(tokens);
    expect(status.connected).toBe(true);
    expect(status.accountName).toContain('Test Sandbox');
    expect(status.accountId).toBeDefined();
    expect(status.currency).toBe('USD');
  });

  it('should detect currency as USD', async () => {
    const tokens = await setup.authenticate();
    const currency = await setup.detectCurrency(tokens);
    expect(currency).toBe('USD');
  });
});

// ── SandboxAdapter ────────────────────────────────────

describe('SandboxAdapter', () => {
  let adapter: SandboxAdapter;
  let campaignId: string;

  beforeAll(async () => {
    adapter = new SandboxAdapter('sandbox-test');
  });

  it('should refresh tokens and return valid shape', async () => {
    const original = { accessToken: 'old', refreshToken: 'old-ref', expiresAt: '2020-01-01', scope: 'ads_read' };
    const refreshed = await adapter.refreshToken(original);
    expect(refreshed.accessToken).not.toBe('old');
    expect(refreshed.refreshToken).toBe('old-ref'); // refresh token preserved
    expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should create a campaign and return valid CampaignResult', async () => {
    const result = await adapter.createCampaign({
      name: 'Test Campaign',
      platform: 'meta' as never, // type coercion for test
      objective: 'conversions' as never,
      dailyBudgetCents: 5000,
      targeting: { audiences: [], locations: ['US'] },
    } as never);

    expect(result.campaignId).toBeDefined();
    expect(result.campaignId).toContain('sandbox_camp_');
    expect(result.status).toBe('paused');
    expect(result.platformResponse).toEqual({ sandbox: true });

    campaignId = result.campaignId;
  });

  it('should return valid SpendReport shape', async () => {
    // Create and activate a campaign first
    const result = await adapter.createCampaign({
      name: 'Spend Test',
      dailyBudgetCents: 2000,
    } as never);
    await adapter.resumeCampaign(result.campaignId);

    const spend = await adapter.getSpend({
      start: '2026-03-01',
      end: '2026-03-20',
    });

    expect(spend.platform).toBe('sandbox');
    expect(spend.dateRange).toBeDefined();
    expect(spend.dateRange.start).toBe('2026-03-01');
    expect(spend.dateRange.end).toBe('2026-03-20');
    expect(typeof spend.totalSpendCents).toBe('number');
    expect(Array.isArray(spend.campaigns)).toBe(true);

    // At least one campaign should have spend (the active one)
    if (spend.campaigns.length > 0) {
      const camp = spend.campaigns[0];
      expect(camp.campaignId).toBeDefined();
      expect(camp.campaignName).toBeDefined();
      expect(typeof camp.spendCents).toBe('number');
      expect(typeof camp.impressions).toBe('number');
      expect(typeof camp.clicks).toBe('number');
      expect(typeof camp.conversions).toBe('number');
    }
  });

  it('should return valid PerformanceMetrics shape', async () => {
    const perf = await adapter.getPerformance(campaignId || 'any-id');

    expect(typeof perf.impressions).toBe('number');
    expect(typeof perf.clicks).toBe('number');
    expect(typeof perf.conversions).toBe('number');
    expect(typeof perf.spendCents).toBe('number');
    expect(typeof perf.ctr).toBe('number');
    expect(typeof perf.cpc).toBe('number');
    expect(typeof perf.cpa).toBe('number');
    expect(typeof perf.roas).toBe('number');

    // CTR should be a ratio between 0 and 1
    expect(perf.ctr).toBeGreaterThanOrEqual(0);
    expect(perf.ctr).toBeLessThanOrEqual(1);
  });

  it('should pause and resume campaigns', async () => {
    const result = await adapter.createCampaign({ name: 'Lifecycle Test', dailyBudgetCents: 1000 } as never);
    // Start paused (default from createCampaign)
    await adapter.resumeCampaign(result.campaignId);
    // Should not throw
    await adapter.pauseCampaign(result.campaignId);
    // Should not throw
  });

  it('should delete campaigns without error', async () => {
    const result = await adapter.createCampaign({ name: 'Delete Test', dailyBudgetCents: 1000 } as never);
    await expect(adapter.deleteCampaign(result.campaignId)).resolves.not.toThrow();
  });

  it('should update budget without error', async () => {
    const result = await adapter.createCampaign({ name: 'Budget Test', dailyBudgetCents: 1000 } as never);
    await expect(adapter.updateBudget(result.campaignId, 3000 as never)).resolves.not.toThrow();
  });

  it('should return valid InsightData shape', async () => {
    const result = await adapter.createCampaign({ name: 'Insight Test', dailyBudgetCents: 1000 } as never);
    const insights = await adapter.getInsights(result.campaignId, ['impressions', 'clicks', 'ctr']);

    expect(insights.campaignId).toBe(result.campaignId);
    expect(insights.metrics).toBeDefined();
    expect(insights.dateRange).toBeDefined();
    expect(insights.dateRange.start).toBeDefined();
    expect(insights.dateRange.end).toBeDefined();
  });
});

// ── SandboxBankAdapter ────────────────────────────────

describe('SandboxBankAdapter', () => {
  const bank = new SandboxBankAdapter('Test Bank', 100000);

  it('should connect and return valid ConnectionResult', async () => {
    const result = await bank.connect({ accountName: 'My Test Account' });
    expect(result.connected).toBe(true);
    expect(result.accountName).toBe('My Test Account');
    expect(result.accountId).toBeDefined();
    expect(result.accountId!.startsWith('sandbox_bank_')).toBe(true);
    expect(result.currency).toBe('USD');
  });

  it('should connect with default name when no accountName given', async () => {
    const bank2 = new SandboxBankAdapter('Fallback Bank');
    const result = await bank2.connect({});
    expect(result.connected).toBe(true);
    expect(result.accountName).toBe('Fallback Bank');
  });

  it('should return transactions with valid shape', async () => {
    const page = await bank.getTransactions({
      start: '2026-03-01',
      end: '2026-03-07',
    });

    expect(Array.isArray(page.transactions)).toBe(true);
    expect(page.transactions.length).toBeGreaterThan(0);
    expect(typeof page.hasMore).toBe('boolean');

    const txn = page.transactions[0];
    expect(txn.id).toBeDefined();
    expect(txn.date).toBeDefined();
    expect(typeof txn.amountCents).toBe('number');
    expect(['credit', 'debit']).toContain(txn.type);
    expect(txn.description).toBeDefined();
    expect(txn.category).toBeDefined();
  });

  it('should generate both credits and debits', async () => {
    // Use a wide date range to get enough transactions for statistical likelihood
    const page = await bank.getTransactions({
      start: '2026-03-01',
      end: '2026-03-31',
    });

    const hasCredit = page.transactions.some(t => t.type === 'credit');
    const hasDebit = page.transactions.some(t => t.type === 'debit');
    // With 30 days * 2-5 txns/day and 60/40 split, both types should appear
    expect(hasCredit).toBe(true);
    expect(hasDebit).toBe(true);
  });

  it('should return valid balance shape', async () => {
    const balance = await bank.getBalance();
    expect(typeof balance.availableCents).toBe('number');
    expect(typeof balance.pendingCents).toBe('number');
    expect(balance.currency).toBe('USD');
    expect(balance.asOf).toBeDefined();
    // Balance should be parseable as ISO date
    expect(new Date(balance.asOf).getTime()).toBeGreaterThan(0);
  });

  it('should detect currency as USD', async () => {
    const currency = await bank.detectCurrency();
    expect(currency).toBe('USD');
  });
});
