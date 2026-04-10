/**
 * Circle stablecoin adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Stablecoin adapter contracts — ensures correct Circle API request/response handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// -- HTTPS mock ---------------------------------------------------

type RequestCallback = (res: IncomingMessage) => void;

let mockResponseStatus = 200;
let mockResponseBody = '{}';
let lastRequestOptions: Record<string, unknown> | null = null;

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
  request: (options: unknown, callback: RequestCallback): ClientRequest => {
    lastRequestOptions = options as Record<string, unknown>;
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

const { CircleSetup, CircleAdapter } = await import(
  '../lib/financial/stablecoin/circle.js'
);

// -- Helpers ------------------------------------------------------

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// -- CircleSetup Tests --------------------------------------------

describe('CircleSetup', () => {
  let setup: InstanceType<typeof CircleSetup>;

  beforeEach(() => {
    setup = new CircleSetup('test-api-key');
    lastRequestOptions = null;
  });

  describe('authenticate()', () => {
    it('should return valid result with wallet ID on success', async () => {
      setMockResponse(200, {
        data: {
          payments: { masterWalletId: 'wallet-123' },
        },
      });

      const result = await setup.authenticate({
        provider: 'circle',
        apiKey: 'test-key',
        environment: 'sandbox',
      });

      expect(result.valid).toBe(true);
      expect(result.accountId).toBe('wallet-123');
      expect(result.permissions).toContain('read_balances');
      expect(result.permissions).toContain('initiate_payouts');
    });

    it('should return invalid on API error', async () => {
      setMockResponse(401, { error: { message: 'Invalid API key' } });

      const result = await setup.authenticate({
        provider: 'circle',
        apiKey: 'bad-key',
        environment: 'sandbox',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('verifySupportedAssets()', () => {
    it('should return USDC assets on multiple networks', async () => {
      const assets = await setup.verifySupportedAssets({
        provider: 'circle',
        apiKey: 'test-key',
        environment: 'sandbox',
      });

      expect(assets.length).toBeGreaterThanOrEqual(4);
      const networks = assets.map(a => a.network);
      expect(networks).toContain('ETH');
      expect(networks).toContain('SOL');
      expect(networks).toContain('MATIC');
      expect(networks).toContain('AVAX');
      // All should be USDC
      expect(assets.every(a => a.asset === 'USDC')).toBe(true);
    });
  });

  describe('verifyLinkedBank()', () => {
    it('should return linked bank details on success', async () => {
      setMockResponse(200, {
        data: [{
          id: 'bank-001',
          billingDetails: { name: 'Chase Business' },
          trackingRef: 'CIR1234567890',
        }],
      });

      const result = await setup.verifyLinkedBank({
        provider: 'circle',
        apiKey: 'test-key',
        environment: 'sandbox',
      });

      expect(result.linked).toBe(true);
      expect(result.bankId).toBe('bank-001');
      expect(result.bankName).toBe('Chase Business');
      expect(result.accountLast4).toBe('7890');
    });

    it('should return unlinked when no banks found', async () => {
      setMockResponse(200, { data: [] });

      const result = await setup.verifyLinkedBank({
        provider: 'circle',
        apiKey: 'test-key',
        environment: 'sandbox',
      });

      expect(result.linked).toBe(false);
      expect(result.error).toContain('No linked wire bank accounts');
    });
  });

  describe('getInitialBalances()', () => {
    it('should return USDC balances from business account', async () => {
      setMockResponse(200, {
        data: {
          available: [
            { amount: '1500.00', currency: 'USD' },
            { amount: '200.00', currency: 'EUR' },
          ],
        },
      });

      const balances = await setup.getInitialBalances({
        provider: 'circle',
        apiKey: 'test-key',
        environment: 'sandbox',
      });

      // Should only include USD
      expect(balances).toHaveLength(1);
      expect(balances[0].provider).toBe('circle');
      expect(balances[0].asset).toBe('USDC');
      expect(balances[0].balanceCents).toBe(150000);
    });

    it('should return empty array on API failure', async () => {
      setMockResponse(500, { error: { message: 'Server error' } });

      const balances = await setup.getInitialBalances({
        provider: 'circle',
        apiKey: 'test-key',
        environment: 'sandbox',
      });

      expect(balances).toEqual([]);
    });
  });
});

// -- CircleAdapter Tests ------------------------------------------

describe('CircleAdapter', () => {
  let adapter: InstanceType<typeof CircleAdapter>;

  beforeEach(() => {
    adapter = new CircleAdapter({
      apiKey: 'test-api-key',
      bankId: 'bank-001',
    });
    lastRequestOptions = null;
  });

  describe('getBalances()', () => {
    it('should return combined balances with stablecoin totals', async () => {
      setMockResponse(200, {
        data: {
          available: [
            { amount: '5000.00', currency: 'USD' },
          ],
        },
      });

      const balances = await adapter.getBalances();

      expect(balances.stablecoin).toHaveLength(1);
      expect(balances.stablecoin[0].balanceCents).toBe(500000);
      expect(balances.totalStablecoinCents).toBe(500000);
      expect(balances.totalFiatAvailableCents).toBe(0);
    });

    it('should throw on API failure', async () => {
      setMockResponse(500, { error: { message: 'Service unavailable' } });

      await expect(adapter.getBalances()).rejects.toThrow('Circle getBalances failed');
    });
  });

  describe('quoteRedemption()', () => {
    it('should return a quote with $25 flat fee', async () => {
      const amountCents = 100000; // $1000
      const quote = await adapter.quoteRedemption(amountCents as never);

      expect(quote.provider).toBe('circle');
      expect(quote.sourceAsset).toBe('USDC');
      expect(quote.requestedCents).toBe(100000);
      expect(quote.estimatedFeeCents).toBe(2500); // $25 fee
      expect(quote.estimatedNetCents).toBe(97500); // $975
      expect(quote.estimatedSettlementMinutes).toBe(24 * 60); // 1 business day
      expect(quote.expiresAt).toBeDefined();
    });
  });

  describe('initiateOfframp()', () => {
    it('should create a payout and return a hash-chained TransferRecord', async () => {
      setMockResponse(200, {
        data: {
          id: 'payout-001',
          status: 'pending',
        },
      });

      const plan = {
        id: 'plan-001',
        requiredCents: 50000,
        destinationBankId: 'bank-001',
        idempotencyKey: 'idem-key-001',
      };

      const record = await adapter.initiateOfframp(plan as never, 'prev-hash');

      expect(record.providerTransferId).toBe('payout-001');
      expect(record.provider).toBe('circle');
      expect(record.direction).toBe('crypto_to_fiat');
      expect(record.amountCents).toBe(50000);
      expect(record.feesCents).toBe(2500); // $25 fee
      expect(record.netAmountCents).toBe(47500);
      expect(record.status).toBe('pending');
      expect(record.hash).toBeDefined();
      expect(record.previousHash).toBe('prev-hash');
    });

    it('should throw on API failure', async () => {
      setMockResponse(500, { error: { message: 'Payout failed' } });

      const plan = {
        id: 'plan-001',
        requiredCents: 50000,
        destinationBankId: 'bank-001',
        idempotencyKey: 'idem-key-001',
      };

      await expect(
        adapter.initiateOfframp(plan as never, 'prev-hash'),
      ).rejects.toThrow('Circle initiateOfframp failed');
    });
  });

  describe('getTransferStatus()', () => {
    it('should map Circle status to internal status', async () => {
      setMockResponse(200, {
        data: {
          id: 'payout-001',
          status: 'complete',
          amount: { amount: '500.00', currency: 'USD' },
          fees: { amount: '25.00', currency: 'USD' },
          createDate: '2026-03-01T00:00:00Z',
          updateDate: '2026-03-02T00:00:00Z',
        },
      });

      const detail = await adapter.getTransferStatus('payout-001');

      expect(detail.status).toBe('completed');
      expect(detail.amountCents).toBe(50000);
      expect(detail.feesCents).toBe(2500);
      expect(detail.completedAt).toBe('2026-03-02T00:00:00Z');
    });

    it('should map pending Circle status correctly', async () => {
      setMockResponse(200, {
        data: {
          id: 'payout-002',
          status: 'pending',
          amount: { amount: '1000.00', currency: 'USD' },
          createDate: '2026-03-01T00:00:00Z',
        },
      });

      const detail = await adapter.getTransferStatus('payout-002');

      expect(detail.status).toBe('pending');
      expect(detail.completedAt).toBeUndefined();
      expect(detail.estimatedCompletionAt).toBeDefined();
    });
  });

  describe('cancelTransfer()', () => {
    it('should always return cancelled=false (Circle does not support cancellation)', async () => {
      const result = await adapter.cancelTransfer('payout-001');

      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('does not support');
    });
  });

  describe('listCompletedTransfers()', () => {
    it('should return hash-chained transfer records within date range', async () => {
      setMockResponse(200, {
        data: [
          {
            id: 'payout-001',
            status: 'complete',
            amount: { amount: '500.00', currency: 'USD' },
            fees: { amount: '25.00', currency: 'USD' },
            createDate: '2026-03-15T00:00:00Z',
            updateDate: '2026-03-16T00:00:00Z',
          },
        ],
      });

      const transfers = await adapter.listCompletedTransfers({
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(transfers).toHaveLength(1);
      expect(transfers[0].status).toBe('completed');
      expect(transfers[0].amountCents).toBe(50000);
      expect(transfers[0].hash).toBeDefined();
    });

    it('should filter out transfers outside the date range', async () => {
      setMockResponse(200, {
        data: [
          {
            id: 'payout-old',
            status: 'complete',
            amount: { amount: '100.00', currency: 'USD' },
            createDate: '2025-01-01T00:00:00Z',
            updateDate: '2025-01-02T00:00:00Z',
          },
        ],
      });

      const transfers = await adapter.listCompletedTransfers({
        start: '2026-03-01',
        end: '2026-03-31',
      });

      expect(transfers).toHaveLength(0);
    });
  });
});
