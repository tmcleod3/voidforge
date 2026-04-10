/**
 * Adapter factory tests — mocks financial-vault to verify config-driven adapter instantiation.
 * Tier 2: Factory contracts — ensures correct adapter selection based on vault config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- Mock financial-vault -----------------------------------------

const mockVaultStore = new Map<string, string | null>();

vi.mock('../lib/financial-vault.js', () => ({
  financialVaultGet: vi.fn((_vaultKey: string, key: string): Promise<string | null> => {
    return Promise.resolve(mockVaultStore.get(key) ?? null);
  }),
}));

// -- Mock dynamic imports for real adapters -----------------------
// These are imported dynamically by the factory; mock them to avoid
// real HTTP module loading while verifying the factory chose correctly.

vi.mock('../lib/financial/stablecoin/circle.js', () => ({
  CircleAdapter: class MockCircleAdapter {
    config: unknown;
    constructor(config: unknown) { this.config = config; }
    async getBalances() { return { stablecoin: [], fiat: [], totalStablecoinCents: 0, totalFiatAvailableCents: 0 }; }
  },
}));

vi.mock('../lib/financial/stablecoin/mercury.js', () => ({
  MercuryBankAdapter: class MockMercuryAdapter {
    apiKey: string;
    accountId?: string;
    constructor(apiKey: string, accountId?: string) { this.apiKey = apiKey; this.accountId = accountId; }
    async connect() { return { connected: true, accountId: 'mock-acct' }; }
  },
}));

vi.mock('../lib/financial/billing/google-billing.js', () => ({
  GoogleBillingAdapter: class MockGoogleBillingAdapter {
    config: unknown;
    constructor(config: unknown) { this.config = config; }
    async getCapabilityState() { return 'FULLY_FUNDABLE'; }
  },
}));

vi.mock('../lib/financial/billing/meta-billing.js', () => ({
  MetaBillingAdapter: class MockMetaBillingAdapter {
    config: unknown;
    constructor(config: unknown) { this.config = config; }
    async getCapabilityState() { return 'FULLY_FUNDABLE'; }
  },
}));

vi.mock('../lib/financial/billing/tiktok-billing.js', () => ({
  TikTokBillingAdapter: class MockTikTokBillingAdapter {
    config: unknown;
    constructor(config: unknown) { this.config = config; }
    async getCapabilityState() { return 'MONITORED_ONLY'; }
  },
}));

const {
  getStablecoinAdapter,
  getBankAdapter,
  getBillingAdapter,
  getCampaignAdapter,
} = await import('../lib/financial/adapter-factory.js');

// -- Helpers ------------------------------------------------------

function setVaultConfig(config: Record<string, string | null>): void {
  mockVaultStore.clear();
  for (const [key, value] of Object.entries(config)) {
    if (value !== null) {
      mockVaultStore.set(key, value);
    }
  }
}

const logMessages: string[] = [];
const logger = { log: (msg: string) => logMessages.push(msg) };

// -- Tests --------------------------------------------------------

describe('getStablecoinAdapter()', () => {
  beforeEach(() => {
    mockVaultStore.clear();
    logMessages.length = 0;
  });

  it('should return sandbox adapter when vaultKey is null', async () => {
    const adapter = await getStablecoinAdapter(null, logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('sandbox'))).toBe(true);
  });

  it('should return sandbox adapter when config specifies sandbox', async () => {
    setVaultConfig({
      'funding-config': JSON.stringify({ stablecoinProvider: 'sandbox' }),
    });

    const adapter = await getStablecoinAdapter('test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('sandbox stablecoin'))).toBe(true);
  });

  it('should return Circle adapter when credentials are present', async () => {
    setVaultConfig({
      'funding-config': JSON.stringify({ stablecoinProvider: 'circle', circleBankId: 'bank-001' }),
      'circle-api-key': 'circle-key-123',
    });

    const adapter = await getStablecoinAdapter('test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('Circle'))).toBe(true);
  });

  it('should fall back to sandbox when circle-api-key missing', async () => {
    setVaultConfig({
      'funding-config': JSON.stringify({ stablecoinProvider: 'circle', circleBankId: 'bank-001' }),
    });

    const adapter = await getStablecoinAdapter('test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('falling back to sandbox'))).toBe(true);
  });

  it('should fall back to sandbox when circleBankId missing', async () => {
    setVaultConfig({
      'funding-config': JSON.stringify({ stablecoinProvider: 'circle' }),
      'circle-api-key': 'circle-key-123',
    });

    const adapter = await getStablecoinAdapter('test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('circleBankId missing'))).toBe(true);
  });
});

describe('getBankAdapter()', () => {
  beforeEach(() => {
    mockVaultStore.clear();
    logMessages.length = 0;
  });

  it('should return sandbox bank when vaultKey is null', async () => {
    const adapter = await getBankAdapter(null, logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('sandbox bank'))).toBe(true);
  });

  it('should return Mercury adapter when credentials are present', async () => {
    setVaultConfig({
      'funding-config': JSON.stringify({ bankProvider: 'mercury', mercuryAccountId: 'acct-001' }),
      'mercury-api-key': 'mercury-key-123',
    });

    const adapter = await getBankAdapter('test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('Mercury'))).toBe(true);
  });

  it('should fall back to sandbox when mercury-api-key missing', async () => {
    setVaultConfig({
      'funding-config': JSON.stringify({ bankProvider: 'mercury' }),
    });

    const adapter = await getBankAdapter('test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('falling back to sandbox'))).toBe(true);
  });
});

describe('getBillingAdapter()', () => {
  beforeEach(() => {
    mockVaultStore.clear();
    logMessages.length = 0;
  });

  it('should return null when vaultKey is null', async () => {
    const adapter = await getBillingAdapter('google', null, logger);
    expect(adapter).toBeNull();
  });

  it('should return Google billing adapter with complete credentials', async () => {
    setVaultConfig({
      'google-ads-token': 'gtoken',
      'google-developer-token': 'gdevtoken',
      'google-customer-id': 'gcustid',
    });

    const adapter = await getBillingAdapter('google', 'test-vault-key', logger);
    expect(adapter).not.toBeNull();
    expect(logMessages.some(m => m.includes('Google billing'))).toBe(true);
  });

  it('should return null when Google credentials are incomplete', async () => {
    setVaultConfig({
      'google-ads-token': 'gtoken',
      // missing developer-token and customer-id
    });

    const adapter = await getBillingAdapter('google', 'test-vault-key', logger);
    expect(adapter).toBeNull();
    expect(logMessages.some(m => m.includes('incomplete'))).toBe(true);
  });

  it('should return Meta billing adapter with complete credentials', async () => {
    setVaultConfig({
      'meta-access-token': 'mtoken',
      'meta-ad-account-id': 'mactid',
    });

    const adapter = await getBillingAdapter('meta', 'test-vault-key', logger);
    expect(adapter).not.toBeNull();
    expect(logMessages.some(m => m.includes('Meta billing'))).toBe(true);
  });

  it('should return TikTok billing adapter with complete credentials', async () => {
    setVaultConfig({
      'tiktok-access-token': 'tttoken',
      'tiktok-app-id': 'ttappid',
    });

    const adapter = await getBillingAdapter('tiktok', 'test-vault-key', logger);
    expect(adapter).not.toBeNull();
    expect(logMessages.some(m => m.includes('TikTok billing'))).toBe(true);
  });
});

describe('getCampaignAdapter()', () => {
  beforeEach(() => {
    mockVaultStore.clear();
    logMessages.length = 0;
  });

  it('should return sandbox campaign adapter when vaultKey is null', async () => {
    const adapter = await getCampaignAdapter('meta', null, logger);
    expect(adapter).toBeDefined();
    expect(typeof adapter.createCampaign).toBe('function');
    expect(logMessages.some(m => m.includes('sandbox campaign'))).toBe(true);
  });

  it('should return sandbox for unrecognized platform', async () => {
    const adapter = await getCampaignAdapter('unknown' as never, 'test-vault-key', logger);
    expect(adapter).toBeDefined();
    expect(logMessages.some(m => m.includes('unrecognized'))).toBe(true);
  });
});
