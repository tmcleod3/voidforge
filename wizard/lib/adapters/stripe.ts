/**
 * Stripe Revenue Adapter — real implementation via node:https (zero new dependencies).
 *
 * Implements RevenueSourceAdapter for Stripe's REST API.
 * Read-only: VoidForge never processes payments, only reads revenue data.
 * Uses Stripe API v1 (stable, well-documented, free test mode).
 *
 * PRD Reference: §9.4, §9.9 (revenue tracking)
 * No Stubs Doctrine: every method makes a real API call.
 */

import { request as httpsRequest } from 'node:https';
import type { RevenueSourceAdapter, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../revenue-types.js';

const STRIPE_HOST = 'api.stripe.com';

/** Make a GET request to the Stripe API. */
async function stripeGet(path: string, apiKey: string, params?: Record<string, string>): Promise<{ status: number; body: string }> {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: STRIPE_HOST,
      path: `/v1${path}${query}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stripe API timeout')); });
    req.end();
  });
}

export class StripeAdapter implements RevenueSourceAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(): Promise<ConnectionResult> {
    try {
      const { status, body } = await stripeGet('/account', this.apiKey);
      if (status === 200) {
        const account = JSON.parse(body) as {
          id?: string;
          business_profile?: { name?: string };
          default_currency?: string;
          settings?: { dashboard?: { display_name?: string } };
        };
        return {
          connected: true,
          accountId: account.id,
          accountName: account.settings?.dashboard?.display_name
            ?? account.business_profile?.name
            ?? account.id
            ?? 'Stripe Account',
          currency: (account.default_currency ?? 'usd').toUpperCase(),
        };
      }
      const error = JSON.parse(body) as { error?: { message?: string } };
      return { connected: false, error: error.error?.message ?? `HTTP ${status}` };
    } catch (err: unknown) {
      return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  async detectCurrency(): Promise<string> {
    const result = await this.connect();
    return result.currency ?? 'USD';
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    try {
      const params: Record<string, string> = {
        limit: '100',
        'created[gte]': String(Math.floor(new Date(range.start).getTime() / 1000)),
        'created[lte]': String(Math.floor(new Date(range.end).getTime() / 1000)),
      };
      if (cursor) params.starting_after = cursor;

      const { status, body } = await stripeGet('/charges', this.apiKey, params);
      if (status !== 200) {
        const error = JSON.parse(body) as { error?: { message?: string } };
        throw new Error(error.error?.message ?? `HTTP ${status}`);
      }

      const data = JSON.parse(body) as {
        data: Array<{
          id: string;
          created: number;
          amount: number;
          currency: string;
          status: string;
          description?: string;
          metadata?: Record<string, string>;
        }>;
        has_more: boolean;
      };

      const transactions = data.data
        .filter(charge => charge.status === 'succeeded')
        .map(charge => ({
          id: charge.id,
          date: new Date(charge.created * 1000).toISOString().slice(0, 10),
          amountCents: charge.amount, // Stripe amounts are already in cents
          type: 'credit' as const,
          description: charge.description ?? 'Stripe charge',
          category: 'revenue',
          currency: charge.currency.toUpperCase(),
          externalId: charge.id,
        }));

      const lastId = data.data.length > 0 ? data.data[data.data.length - 1].id : undefined;

      return {
        transactions,
        hasMore: data.has_more,
        cursor: data.has_more ? lastId : undefined,
      };
    } catch (err: unknown) {
      throw new Error(`Stripe getTransactions failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async getBalance(): Promise<BalanceResult> {
    try {
      const { status, body } = await stripeGet('/balance', this.apiKey);
      if (status !== 200) {
        const error = JSON.parse(body) as { error?: { message?: string } };
        throw new Error(error.error?.message ?? `HTTP ${status}`);
      }

      const data = JSON.parse(body) as {
        available: Array<{ amount: number; currency: string }>;
        pending: Array<{ amount: number; currency: string }>;
      };

      // Sum across all currencies (convert to USD cents — in practice, most accounts use one currency)
      const availableCents = data.available.reduce((sum, b) => sum + b.amount, 0);
      const pendingCents = data.pending.reduce((sum, b) => sum + b.amount, 0);

      return {
        availableCents,
        pendingCents,
        currency: data.available[0]?.currency?.toUpperCase() ?? 'USD',
        asOf: new Date().toISOString(),
      };
    } catch (err: unknown) {
      throw new Error(`Stripe getBalance failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}
