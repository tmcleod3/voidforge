/**
 * Google Ads API Adapter
 *
 * Auth: OAuth 2.0 — Google Ads developer token + OAuth client
 * Token refresh: Standard OAuth refresh token flow
 * Rate limits: 15,000 operations/day (mutate), unlimited reads
 * Webhooks: No — must poll for changes
 * Ad structure: Campaign → Ad Group → Ad + Keywords
 * Minimum budget: $1/day per campaign
 * API version: v16+
 * Transport: gRPC (via REST/JSON mapping)
 *
 * PRD Reference: §9.5 (Google Ads API)
 */

import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents,
} from './types.js';
import { getLimiter } from './types.js';

export class GoogleSetup implements AdPlatformSetup {
  async authenticate(): Promise<OAuthTokens> {
    // OAuth 2.0 with Google Ads developer token
    // Requires: client_id, client_secret, developer_token, login_customer_id
    throw new Error('Interactive OAuth — opens browser for Google authorization');
  }

  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    // GoogleAdsService.Search: SELECT customer.id, customer.currency_code FROM customer
    throw new Error('Implement with node:https — REST JSON mapping to gRPC');
  }

  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const status = await this.verifyConnection(tokens);
    return status.currency ?? 'USD';
  }
}

export class GoogleAdapter implements AdPlatformAdapter {
  private readonly limiter = getLimiter('google');

  constructor(private customerId: string, private tokens: OAuthTokens) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // POST https://oauth2.googleapis.com/token { grant_type: 'refresh_token', ... }
    throw new Error('Implement with node:https');
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    return this.limiter.executeWithRetry(async () => {
      // CampaignService.MutateCampaigns — create campaign + ad group + ad
      // Use requestId for idempotency (maps to config.idempotencyKey)
      throw new Error('Implement with node:https');
    });
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }

  async pauseCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // CampaignService.MutateCampaigns — set status PAUSED
      throw new Error('Implement');
    });
  }

  async resumeCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }

  async deleteCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // CampaignBudgetService.MutateCampaignBudgets — amounts in micros (1/1,000,000)
      throw new Error('Implement');
    });
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    return this.limiter.executeWithRetry(async () => {
      // GoogleAdsService.Search: SELECT campaign.id, metrics.cost_micros, metrics.impressions, ...
      throw new Error('Implement');
    });
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
}
