/**
 * Meta billing adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Billing adapter contracts — ensures correct parsing of Meta Marketing API responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// -- HTTPS mock ---------------------------------------------------

type RequestCallback = (res: IncomingMessage) => void;

let mockResponseStatus = 200;
let mockResponseBody = '{}';

function createFakeResponse(): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = mockResponseStatus;
  process.nextTick(() => {
    res.emit('data', Buffer.from(mockResponseBody));
    res.emit('end');
  });
  return res;
}

vi.mock('node:https', () => ({
  request: (_options: unknown, callback: RequestCallback): ClientRequest => {
    const req = new EventEmitter() as ClientRequest;
    req.end = vi.fn((..._args: unknown[]) => {
      const res = createFakeResponse();
      callback(res);
      return req;
    });
    req.write = vi.fn();
    req.destroy = vi.fn();
    return req;
  },
}));

const { MetaBillingSetup, MetaBillingAdapter } = await import(
  '../lib/financial/billing/meta-billing.js'
);

// -- Helpers ------------------------------------------------------

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// -- MetaBillingSetup Tests ---------------------------------------

describe('MetaBillingSetup', () => {
  let setup: InstanceType<typeof MetaBillingSetup>;

  beforeEach(() => {
    setup = new MetaBillingSetup();
  });

  describe('verifyBillingCapability()', () => {
    it('should return FULLY_FUNDABLE for direct_debit (type 4)', async () => {
      setMockResponse(200, {
        funding_source_details: { type: 4 },
      });

      const result = await setup.verifyBillingCapability('meta', 'act_123', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('FULLY_FUNDABLE');
    });

    it('should return FULLY_FUNDABLE for extended_credit (type 8)', async () => {
      setMockResponse(200, {
        funding_source_details: { type: 8 },
      });

      const result = await setup.verifyBillingCapability('meta', 'act_456', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('FULLY_FUNDABLE');
    });

    it('should return UNSUPPORTED for credit_card (type 1)', async () => {
      setMockResponse(200, {
        funding_source_details: { type: 1 },
      });

      const result = await setup.verifyBillingCapability('meta', 'act_789', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('UNSUPPORTED');
    });

    it('should return UNSUPPORTED for unknown funding type', async () => {
      setMockResponse(200, {
        funding_source_details: { type: 99 },
      });

      const result = await setup.verifyBillingCapability('meta', 'act_unknown', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('UNSUPPORTED');
    });
  });

  describe('detectBillingMode()', () => {
    it('should return direct_debit for type 4', async () => {
      setMockResponse(200, { funding_source_details: { type: 4 } });

      const mode = await setup.detectBillingMode('meta', 'act_123', {
        accessToken: 'tok_test',
      });

      expect(mode).toBe('direct_debit');
    });

    it('should return extended_credit for type 8', async () => {
      setMockResponse(200, { funding_source_details: { type: 8 } });

      const mode = await setup.detectBillingMode('meta', 'act_456', {
        accessToken: 'tok_test',
      });

      expect(mode).toBe('extended_credit');
    });

    it('should return card_only for type 2 (debit_card)', async () => {
      setMockResponse(200, { funding_source_details: { type: 2 } });

      const mode = await setup.detectBillingMode('meta', 'act_dc', {
        accessToken: 'tok_test',
      });

      expect(mode).toBe('card_only');
    });

    it('should throw on API failure', async () => {
      setMockResponse(500, { error: { message: 'Service unavailable' } });

      await expect(
        setup.detectBillingMode('meta', 'act_err', { accessToken: 'tok_test' }),
      ).rejects.toThrow('Meta fetchFundingDetails failed');
    });
  });

  describe('readBillingConfiguration()', () => {
    it('should return configuration with funding source ID', async () => {
      setMockResponse(200, {
        funding_source_details: { type: 4, id: 'fs-123' },
      });

      const config = await setup.readBillingConfiguration('meta', 'act_123', {
        accessToken: 'tok_test',
      });

      expect(config.billingMode).toBe('direct_debit');
      expect(config.accountIds.externalAccountId).toBe('act_123');
      expect(config.accountIds.fundingSourceId).toBe('fs-123');
    });
  });
});

// -- MetaBillingAdapter Tests -------------------------------------

describe('MetaBillingAdapter', () => {
  let adapter: InstanceType<typeof MetaBillingAdapter>;

  beforeEach(() => {
    adapter = new MetaBillingAdapter({
      adAccountId: 'act_test_123',
      accessToken: 'meta-access-token',
    });
  });

  describe('getCapabilityState()', () => {
    it('should return UNSUPPORTED when no profile is set', async () => {
      const state = await adapter.getCapabilityState('meta');
      expect(state).toBe('UNSUPPORTED');
    });

    it('should return profile capabilityState when profile is set', async () => {
      adapter.setProfile({
        platform: 'meta',
        capabilityState: 'FULLY_FUNDABLE',
        billingMode: 'direct_debit',
        externalAccountId: 'act_test_123',
        currency: 'USD',
        status: 'active',
        lastVerifiedAt: new Date().toISOString(),
      });

      const state = await adapter.getCapabilityState('meta');
      expect(state).toBe('FULLY_FUNDABLE');
    });
  });

  describe('readInvoices()', () => {
    it('should always return empty array (Meta has no first-party invoice API)', async () => {
      const invoices = await adapter.readInvoices('meta', {
        start: '2026-03-01',
        end: '2026-04-01',
      });

      expect(invoices).toEqual([]);
    });
  });

  describe('readExpectedDebits()', () => {
    it('should return projected debits from spend velocity', async () => {
      setMockResponse(200, {
        data: [{ spend: '300.00' }],
      });

      const debits = await adapter.readExpectedDebits('meta', {
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(debits).toHaveLength(1);
      expect(debits[0].platform).toBe('meta');
      expect(debits[0].externalAccountId).toBe('act_test_123');
      expect(debits[0].estimatedAmountCents).toBeGreaterThan(0);
      expect(debits[0].status).toBe('expected');
    });

    it('should return empty array for zero spend', async () => {
      setMockResponse(200, { data: [{ spend: '0.00' }] });

      const debits = await adapter.readExpectedDebits('meta', {
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(debits).toHaveLength(0);
    });

    it('should return empty array when no insights data', async () => {
      setMockResponse(200, { data: [] });

      const debits = await adapter.readExpectedDebits('meta', {
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(debits).toHaveLength(0);
    });

    it('should throw on API failure', async () => {
      setMockResponse(500, { error: { message: 'Service error' } });

      await expect(
        adapter.readExpectedDebits('meta', { start: '2026-03-01', end: '2026-03-31' }),
      ).rejects.toThrow('Meta readExpectedDebits failed');
    });
  });

  describe('generateSettlementInstructions()', () => {
    it('should return direct_debit settlement for Meta invoices', async () => {
      const instruction = await adapter.generateSettlementInstructions({
        id: 'inv-meta-001',
        platform: 'meta',
        externalAccountId: 'act_test_123',
        amountCents: 75000,
        currency: 'USD',
        issueDate: '2026-03-01',
        dueDate: '2026-04-01',
        status: 'pending',
      });

      expect(instruction.invoiceId).toBe('inv-meta-001');
      expect(instruction.platform).toBe('meta');
      expect(instruction.payeeName).toBe('Meta Platforms Inc');
      expect(instruction.paymentMethod).toBe('direct_debit');
      expect(instruction.amountCents).toBe(75000);
    });
  });

  describe('confirmSettlement()', () => {
    it('should confirm optimistically (Meta direct debit)', async () => {
      const result = await adapter.confirmSettlement('inv-001', 'bank-txn-001');

      expect(result.confirmed).toBe(true);
    });
  });

  describe('normalizeFundingState()', () => {
    it('should return empty array when no profile is set', async () => {
      const states = await adapter.normalizeFundingState();
      expect(states).toHaveLength(0);
    });

    it('should return healthy state for active profile', async () => {
      adapter.setProfile({
        platform: 'meta',
        capabilityState: 'FULLY_FUNDABLE',
        billingMode: 'direct_debit',
        externalAccountId: 'act_test_123',
        currency: 'USD',
        status: 'active',
        lastVerifiedAt: new Date().toISOString(),
      });

      const states = await adapter.normalizeFundingState();

      expect(states).toHaveLength(1);
      expect(states[0].platform).toBe('meta');
      expect(states[0].fundingHealthy).toBe(true);
      expect(states[0].outstandingCents).toBe(0);
      expect(states[0].warnings).toHaveLength(0);
    });

    it('should include warning for degraded profile', async () => {
      adapter.setProfile({
        platform: 'meta',
        capabilityState: 'FULLY_FUNDABLE',
        billingMode: 'direct_debit',
        externalAccountId: 'act_test_123',
        currency: 'USD',
        status: 'degraded',
        lastVerifiedAt: new Date().toISOString(),
      });

      const states = await adapter.normalizeFundingState();

      expect(states).toHaveLength(1);
      expect(states[0].fundingHealthy).toBe(false);
      expect(states[0].warnings).toHaveLength(1);
      expect(states[0].warnings[0]).toContain('degraded');
    });
  });
});
