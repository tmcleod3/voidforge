/**
 * Twitter/X Ads API Adapter
 *
 * Auth: OAuth 1.0a (legacy — NOT OAuth 2.0)
 * Token refresh: Tokens don't expire (but can be revoked)
 * Rate limits: 450 requests/15-minute window
 * Webhooks: No
 * Ad structure: Campaign → Line Item → Creative
 * Minimum budget: $1/day
 * NOTE: Volatile API — stability and access may change. Breeze monitors status.
 *
 * PRD Reference: §9.5 (Twitter/X Ads API)
 */

import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents,
} from './types.js';
import { getLimiter } from './types.js';

export class TwitterSetup implements AdPlatformSetup {
  async authenticate(): Promise<OAuthTokens> {
    // OAuth 1.0a — 3-legged flow (request_token, authorize, access_token)
    throw new Error('Interactive OAuth 1.0a — opens browser for Twitter authorization');
  }
  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    throw new Error('Implement: GET /accounts');
  }
  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const s = await this.verifyConnection(tokens); return s.currency ?? 'USD';
  }
}

export class TwitterAdapter implements AdPlatformAdapter {
  private readonly limiter = getLimiter('twitter');
  constructor(private accountId: string, private tokens: OAuthTokens) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // OAuth 1.0a tokens don't expire — return as-is
    return token;
  }
  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: POST /campaigns'); });
  }
  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async pauseCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: PUT entity_status=PAUSED'); });
  }
  async resumeCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async deleteCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: GET /stats/accounts/:id'); });
  }
  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
}
