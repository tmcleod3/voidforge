/**
 * Google billing adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Billing adapter contracts — ensures correct parsing of Google Ads billing API responses.
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

const { GoogleBillingSetup, GoogleBillingAdapter } = await import(
  '../lib/financial/billing/google-billing.js'
);

// -- Helpers ------------------------------------------------------

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// -- GoogleBillingSetup Tests -------------------------------------

describe('GoogleBillingSetup', () => {
  let setup: InstanceType<typeof GoogleBillingSetup>;

  beforeEach(() => {
    setup = new GoogleBillingSetup('dev-token-123');
  });

  describe('verifyBillingCapability()', () => {
    it('should return FULLY_FUNDABLE for APPROVED monthly invoicing', async () => {
      setMockResponse(200, [{
        results: [{ billingSetup: { id: 'bs-1', status: 'APPROVED', paymentsProfile: 'pp-1' } }],
      }]);

      const result = await setup.verifyBillingCapability('google', 'cust_123', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('FULLY_FUNDABLE');
    });

    it('should return MONITORED_ONLY for no billing setup (manual transfer)', async () => {
      setMockResponse(200, [{ results: [] }]);

      const result = await setup.verifyBillingCapability('google', 'cust_456', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('MONITORED_ONLY');
    });

    it('should return UNSUPPORTED for PENDING billing setup', async () => {
      setMockResponse(200, [{
        results: [{ billingSetup: { id: 'bs-2', status: 'PENDING' } }],
      }]);

      const result = await setup.verifyBillingCapability('google', 'cust_789', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('UNSUPPORTED');
    });
  });

  describe('detectBillingMode()', () => {
    it('should return monthly_invoicing for APPROVED setup', async () => {
      setMockResponse(200, [{
        results: [{ billingSetup: { id: 'bs-1', status: 'APPROVED' } }],
      }]);

      const mode = await setup.detectBillingMode('google', 'cust_123', {
        accessToken: 'tok_test',
      });

      expect(mode).toBe('monthly_invoicing');
    });

    it('should return unknown for CANCELLED setup', async () => {
      setMockResponse(200, [{
        results: [{ billingSetup: { id: 'bs-3', status: 'CANCELLED' } }],
      }]);

      const mode = await setup.detectBillingMode('google', 'cust_999', {
        accessToken: 'tok_test',
      });

      expect(mode).toBe('unknown');
    });

    it('should throw on API failure', async () => {
      setMockResponse(500, { error: { message: 'Internal error' } });

      await expect(
        setup.detectBillingMode('google', 'cust_err', { accessToken: 'tok_test' }),
      ).rejects.toThrow('Google Ads queryBillingSetup failed');
    });
  });

  describe('readBillingConfiguration()', () => {
    it('should return configuration with correct account IDs', async () => {
      setMockResponse(200, [{
        results: [{
          billingSetup: {
            id: 'bs-42',
            status: 'APPROVED',
            paymentsProfile: 'pp-42',
            invoiceGroup: 'ig-42',
          },
        }],
      }]);

      const config = await setup.readBillingConfiguration('google', 'cust_42', {
        accessToken: 'tok_test',
      });

      expect(config.billingMode).toBe('monthly_invoicing');
      expect(config.accountIds.externalAccountId).toBe('cust_42');
      expect(config.accountIds.billingSetupId).toBe('bs-42');
      expect(config.accountIds.paymentProfileId).toBe('pp-42');
    });
  });
});

// -- GoogleBillingAdapter Tests -----------------------------------

describe('GoogleBillingAdapter', () => {
  let adapter: InstanceType<typeof GoogleBillingAdapter>;

  beforeEach(() => {
    adapter = new GoogleBillingAdapter({
      customerId: '1234567890',
      accessToken: 'google-access-token',
      developerToken: 'google-dev-token',
    });
  });

  describe('getCapabilityState()', () => {
    it('should return UNSUPPORTED when no profile is set', async () => {
      const state = await adapter.getCapabilityState('google');
      expect(state).toBe('UNSUPPORTED');
    });

    it('should return profile capabilityState when profile is set', async () => {
      adapter.setProfile({
        platform: 'google',
        capabilityState: 'FULLY_FUNDABLE',
        billingMode: 'monthly_invoicing',
        externalAccountId: '1234567890',
        currency: 'USD',
        status: 'active',
        lastVerifiedAt: new Date().toISOString(),
      });

      const state = await adapter.getCapabilityState('google');
      expect(state).toBe('FULLY_FUNDABLE');
    });
  });

  describe('readInvoices()', () => {
    it('should parse Google invoices with micros-to-cents conversion', async () => {
      setMockResponse(200, {
        invoices: [{
          id: 'inv-001',
          totalAmountMicros: 50000000000, // $500.00 in micros
          dueDate: { year: 2026, month: 4, day: 15 },
          serviceDateRange: {
            startDate: { year: 2026, month: 3, day: 1 },
          },
          type: 'INVOICE',
          paymentsAccountId: 'pay-001',
        }],
      });

      const invoices = await adapter.readInvoices('google', {
        start: '2026-03-01',
        end: '2026-04-01',
      });

      expect(invoices).toHaveLength(1);
      expect(invoices[0].id).toBe('inv-001');
      expect(invoices[0].platform).toBe('google');
      expect(invoices[0].amountCents).toBe(5000000); // $50000 in cents (50B micros / 1M = $50000)
      expect(invoices[0].dueDate).toBe('2026-04-15');
      expect(invoices[0].issueDate).toBe('2026-03-01');
      expect(invoices[0].status).toBe('pending');
    });

    it('should map CREDIT_MEMO type to paid status', async () => {
      setMockResponse(200, {
        invoices: [{
          id: 'inv-002',
          totalAmountMicros: 10000000,
          dueDate: { year: 2026, month: 5, day: 1 },
          serviceDateRange: {
            startDate: { year: 2026, month: 4, day: 1 },
          },
          type: 'CREDIT_MEMO',
        }],
      });

      const invoices = await adapter.readInvoices('google', {
        start: '2026-04-01',
        end: '2026-05-01',
      });

      expect(invoices[0].status).toBe('paid');
    });

    it('should throw on API failure', async () => {
      setMockResponse(500, { error: { message: 'Server error' } });

      await expect(
        adapter.readInvoices('google', { start: '2026-01-01', end: '2026-01-31' }),
      ).rejects.toThrow('Google Ads readInvoices failed');
    });
  });

  describe('readExpectedDebits()', () => {
    it('should always return empty array (Google uses invoicing, not direct debit)', async () => {
      const debits = await adapter.readExpectedDebits('google', {
        start: '2026-03-01',
        end: '2026-04-01',
      });

      expect(debits).toEqual([]);
    });
  });

  describe('generateSettlementInstructions()', () => {
    it('should return wire payment instructions for an invoice', async () => {
      const instruction = await adapter.generateSettlementInstructions({
        id: 'inv-001',
        platform: 'google',
        externalAccountId: '1234567890',
        amountCents: 50000,
        currency: 'USD',
        issueDate: '2026-03-01',
        dueDate: '2026-04-15',
        status: 'pending',
        paymentReference: 'ref-001',
      });

      expect(instruction.invoiceId).toBe('inv-001');
      expect(instruction.platform).toBe('google');
      expect(instruction.payeeName).toBe('Google Ads');
      expect(instruction.paymentMethod).toBe('wire');
      expect(instruction.amountCents).toBe(50000);
      expect(instruction.bankReference).toBe('ref-001');
    });
  });

  describe('normalizeFundingState()', () => {
    it('should return empty array when no profile is set', async () => {
      const states = await adapter.normalizeFundingState();
      expect(states).toHaveLength(0);
    });

    it('should return funding state with outstanding from pending invoices', async () => {
      adapter.setProfile({
        platform: 'google',
        capabilityState: 'FULLY_FUNDABLE',
        billingMode: 'monthly_invoicing',
        externalAccountId: '1234567890',
        currency: 'USD',
        status: 'active',
        lastVerifiedAt: new Date().toISOString(),
        nextDueDate: '2026-05-15',
      });

      // Mock the invoice read (called internally by normalizeFundingState)
      setMockResponse(200, { invoices: [] });

      const states = await adapter.normalizeFundingState();

      expect(states).toHaveLength(1);
      expect(states[0].platform).toBe('google');
      expect(states[0].capabilityState).toBe('FULLY_FUNDABLE');
      expect(states[0].billingMode).toBe('monthly_invoicing');
      expect(states[0].fundingHealthy).toBe(true);
    });
  });
});
