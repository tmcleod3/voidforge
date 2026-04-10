/**
 * Financial registry tests — provider/adapter registry correctness.
 * Tier 1: Static data validation — ensures registries are consistent and complete.
 */

import { describe, it, expect } from 'vitest';
import {
  STABLECOIN_PROVIDERS,
  BANK_ADAPTERS,
  BILLING_ADAPTERS,
} from '../lib/financial/registry.js';

// -- Stablecoin Provider Registry ---------------------------------

describe('STABLECOIN_PROVIDERS', () => {
  it('should have sandbox as implemented', () => {
    expect(STABLECOIN_PROVIDERS.sandbox).toBeDefined();
    expect(STABLECOIN_PROVIDERS.sandbox.implemented).toBe(true);
    expect(STABLECOIN_PROVIDERS.sandbox.name).toBe('Sandbox (Demo)');
  });

  it('should have circle as implemented', () => {
    expect(STABLECOIN_PROVIDERS.circle).toBeDefined();
    expect(STABLECOIN_PROVIDERS.circle.implemented).toBe(true);
    expect(STABLECOIN_PROVIDERS.circle.name).toBe('Circle');
  });

  it('should have bridge as not implemented', () => {
    expect(STABLECOIN_PROVIDERS.bridge).toBeDefined();
    expect(STABLECOIN_PROVIDERS.bridge.implemented).toBe(false);
  });

  it('should have at least 2 implemented providers', () => {
    const implemented = Object.values(STABLECOIN_PROVIDERS).filter(p => p.implemented);
    expect(implemented.length).toBeGreaterThanOrEqual(2);
  });
});

// -- Bank Adapter Registry ----------------------------------------

describe('BANK_ADAPTERS', () => {
  it('should have mercury as implemented', () => {
    expect(BANK_ADAPTERS.mercury).toBeDefined();
    expect(BANK_ADAPTERS.mercury.implemented).toBe(true);
    expect(BANK_ADAPTERS.mercury.name).toBe('Mercury');
  });

  it('should have all entries with name and implemented fields', () => {
    for (const [key, entry] of Object.entries(BANK_ADAPTERS)) {
      expect(entry.name).toBeDefined();
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.implemented).toBe('boolean');
      expect(key).toBeTruthy();
    }
  });
});

// -- Billing Adapter Registry -------------------------------------

describe('BILLING_ADAPTERS', () => {
  it('should have all three platforms implemented', () => {
    expect(BILLING_ADAPTERS.google.implemented).toBe(true);
    expect(BILLING_ADAPTERS.meta.implemented).toBe(true);
    expect(BILLING_ADAPTERS.tiktok.implemented).toBe(true);
  });

  it('should have correct display names', () => {
    expect(BILLING_ADAPTERS.google.name).toBe('Google Ads Billing');
    expect(BILLING_ADAPTERS.meta.name).toBe('Meta Ads Billing');
    expect(BILLING_ADAPTERS.tiktok.name).toBe('TikTok Ads Billing');
  });

  it('should have matching keys for all platforms', () => {
    const keys = Object.keys(BILLING_ADAPTERS);
    expect(keys).toContain('google');
    expect(keys).toContain('meta');
    expect(keys).toContain('tiktok');
  });
});

// -- Re-exports Consistency ---------------------------------------

describe('Registry re-exports', () => {
  it('should re-export CircleSetup and CircleAdapter', async () => {
    const registry = await import('../lib/financial/registry.js');
    expect(registry.CircleSetup).toBeDefined();
    expect(registry.CircleAdapter).toBeDefined();
  });

  it('should re-export MercuryBankAdapter', async () => {
    const registry = await import('../lib/financial/registry.js');
    expect(registry.MercuryBankAdapter).toBeDefined();
  });

  it('should re-export all billing adapters', async () => {
    const registry = await import('../lib/financial/registry.js');
    expect(registry.GoogleBillingSetup).toBeDefined();
    expect(registry.GoogleBillingAdapter).toBeDefined();
    expect(registry.MetaBillingSetup).toBeDefined();
    expect(registry.MetaBillingAdapter).toBeDefined();
    expect(registry.TikTokBillingSetup).toBeDefined();
    expect(registry.TikTokBillingAdapter).toBeDefined();
  });
});
