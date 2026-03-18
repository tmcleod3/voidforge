/**
 * TikTok Marketing API Adapter
 *
 * Auth: OAuth 2.0 — TikTok for Business
 * Token refresh: Every 24 hours (short-lived)
 * Rate limits: 10 requests/second
 * Webhooks: Yes (deferred to remote mode per ADR-5)
 * Ad structure: Campaign → Ad Group → Ad
 * Minimum budget: $20/day per campaign
 * API version: v1.3+
 *
 * PRD Reference: §9.5 (TikTok Marketing API)
 */

import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents,
} from './types.js';
import { getLimiter } from './types.js';

const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';

export class TikTokSetup implements AdPlatformSetup {
  async authenticate(): Promise<OAuthTokens> {
    throw new Error('Interactive OAuth — TikTok for Business authorization');
  }
  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    throw new Error('Implement: GET /advertiser/info/');
  }
  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const s = await this.verifyConnection(tokens); return s.currency ?? 'USD';
  }
}

export class TikTokAdapter implements AdPlatformAdapter {
  private readonly limiter = getLimiter('tiktok');
  constructor(private advertiserId: string, private tokens: OAuthTokens) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // POST /oauth2/access_token/ — 24-hour refresh cycle
    throw new Error('Implement');
  }
  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: POST /campaign/create/'); });
  }
  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async pauseCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: POST /campaign/status/update/'); });
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
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: GET /report/integrated/get/'); });
  }
  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
}
