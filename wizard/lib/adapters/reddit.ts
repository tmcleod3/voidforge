/**
 * Reddit Ads API Adapter
 *
 * Auth: OAuth 2.0
 * Token refresh: Every 1 hour (short-lived)
 * Rate limits: Not publicly documented — conservative defaults (60 req/min)
 * Webhooks: No
 * Ad structure: Campaign → Ad Group → Ad
 * Minimum budget: $5/day
 * NOTE: Youngest API in the set — expect breaking changes. Version-pin.
 *
 * PRD Reference: §9.5 (Reddit Ads API)
 */

import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents,
} from './types.js';
import { getLimiter } from './types.js';

const BASE_URL = 'https://ads-api.reddit.com/api/v2.0';

export class RedditSetup implements AdPlatformSetup {
  async authenticate(): Promise<OAuthTokens> {
    throw new Error('Interactive OAuth 2.0 — opens browser for Reddit authorization');
  }
  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    throw new Error('Implement: GET /accounts');
  }
  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const s = await this.verifyConnection(tokens); return s.currency ?? 'USD';
  }
}

export class RedditAdapter implements AdPlatformAdapter {
  private readonly limiter = getLimiter('reddit');
  constructor(private accountId: string, private tokens: OAuthTokens) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // POST https://www.reddit.com/api/v1/access_token — 1-hour refresh cycle
    throw new Error('Implement');
  }
  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: POST /campaigns'); });
  }
  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async pauseCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: PATCH status=paused'); });
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
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: GET /reports'); });
  }
  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
}
