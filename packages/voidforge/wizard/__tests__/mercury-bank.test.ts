/**
 * Mercury bank adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Bank adapter contracts — ensures correct Mercury REST API response handling.
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

const { MercuryBankAdapter } = await import(
  '../lib/financial/stablecoin/mercury.js'
);

// -- Helpers ------------------------------------------------------

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// -- Tests --------------------------------------------------------

describe('MercuryBankAdapter', () => {
  describe('connect()', () => {
    it('should connect and set accountId on success', async () => {
      const adapter = new MercuryBankAdapter('test-api-key');

      setMockResponse(200, {
        accounts: [{
          id: 'acct-001',
          name: 'VoidForge Operating',
          accountNumber: '****4567',
        }],
      });

      const result = await adapter.connect();

      expect(result.connected).toBe(true);
      expect(result.accountId).toBe('acct-001');
      expect(result.accountName).toBe('VoidForge Operating');
      expect(result.currency).toBe('USD');
    });

    it('should return not connected when no accounts found', async () => {
      const adapter = new MercuryBankAdapter('test-api-key');

      setMockResponse(200, { accounts: [] });

      const result = await adapter.connect();

      expect(result.connected).toBe(false);
      expect(result.error).toContain('No accounts found');
    });

    it('should return not connected on API failure', async () => {
      const adapter = new MercuryBankAdapter('bad-key');

      setMockResponse(401, { message: 'Unauthorized' });

      const result = await adapter.connect();

      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('detectCurrency()', () => {
    it('should always return USD (Mercury is USD-only)', async () => {
      const adapter = new MercuryBankAdapter('test-api-key');
      const currency = await adapter.detectCurrency();
      expect(currency).toBe('USD');
    });
  });

  describe('getTransactions()', () => {
    it('should throw if connect() has not been called', async () => {
      const adapter = new MercuryBankAdapter('test-api-key');

      await expect(
        adapter.getTransactions({ start: '2026-03-01', end: '2026-03-31' }),
      ).rejects.toThrow('must call connect()');
    });

    it('should return parsed transactions after connect()', async () => {
      const adapter = new MercuryBankAdapter('test-api-key', 'acct-001');

      setMockResponse(200, {
        total: 2,
        transactions: [
          {
            id: 'txn-001',
            amount: 500.00,
            status: 'received',
            note: 'Client payment',
            counterpartyName: 'Acme Corp',
            createdAt: '2026-03-15T10:00:00Z',
            kind: 'incomingPayment',
          },
          {
            id: 'txn-002',
            amount: -150.00,
            status: 'sent',
            note: 'AWS bill',
            counterpartyName: 'Amazon Web Services',
            createdAt: '2026-03-16T14:00:00Z',
            kind: 'outgoingPayment',
          },
        ],
      });

      const page = await adapter.getTransactions({
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(page.transactions).toHaveLength(2);
      expect(page.transactions[0].externalId).toBe('txn-001');
      expect(page.transactions[0].type).toBe('charge');
      expect(page.transactions[0].amount).toBe(50000); // $500 in cents
      expect(page.transactions[1].externalId).toBe('txn-002');
      expect(page.transactions[1].type).toBe('refund'); // negative = outgoing
      expect(page.transactions[1].amount).toBe(-15000);
    });

    it('should handle pagination with cursor', async () => {
      const adapter = new MercuryBankAdapter('test-api-key', 'acct-001');

      setMockResponse(200, {
        total: 150,
        transactions: Array.from({ length: 100 }, (_, i) => ({
          id: `txn-${i}`,
          amount: 10.00,
          status: 'received',
          createdAt: '2026-03-15T10:00:00Z',
          kind: 'incomingPayment',
        })),
      });

      const page = await adapter.getTransactions({
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe('100');
    });

    it('should throw on API failure', async () => {
      const adapter = new MercuryBankAdapter('test-api-key', 'acct-001');

      setMockResponse(500, { message: 'Internal server error' });

      await expect(
        adapter.getTransactions({ start: '2026-03-01', end: '2026-03-31' }),
      ).rejects.toThrow('Mercury getTransactions failed');
    });
  });

  describe('getBalance()', () => {
    it('should throw if connect() has not been called', async () => {
      const adapter = new MercuryBankAdapter('test-api-key');

      await expect(adapter.getBalance()).rejects.toThrow('must call connect()');
    });

    it('should return available and pending balances', async () => {
      const adapter = new MercuryBankAdapter('test-api-key', 'acct-001');

      setMockResponse(200, {
        currentBalance: 10000.00,
        availableBalance: 9500.00,
      });

      const balance = await adapter.getBalance();

      expect(balance.available).toBe(950000); // $9500 in cents
      expect(balance.pending).toBe(50000);    // $500 pending
      expect(balance.currency).toBe('USD');
    });

    it('should throw on API failure', async () => {
      const adapter = new MercuryBankAdapter('test-api-key', 'acct-001');

      setMockResponse(500, { message: 'Service unavailable' });

      await expect(adapter.getBalance()).rejects.toThrow('Mercury getBalance failed');
    });
  });
});
