/**
 * LinkedIn Marketing API Adapter
 *
 * Auth: OAuth 2.0 — LinkedIn Marketing Developer Platform
 * Token refresh: Every 60 days
 * Rate limits: 100 calls/day (very restrictive — batch operations)
 * Webhooks: No
 * Ad structure: Campaign Group → Campaign → Creative
 * Minimum budget: $10/day per campaign
 *
 * PRD Reference: §9.5 (LinkedIn Marketing API)
 * NOTE: Most restrictive rate limits of all platforms. Every call counts.
 */

import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents,
} from './types.js';
import { getLimiter } from './types.js';

export class LinkedInSetup implements AdPlatformSetup {
  async authenticate(): Promise<OAuthTokens> {
    throw new Error('Interactive OAuth — LinkedIn Marketing Developer Platform');
  }
  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    throw new Error('Implement: GET /adAccountsV2');
  }
  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const s = await this.verifyConnection(tokens); return s.currency ?? 'USD';
  }
}

export class LinkedInAdapter implements AdPlatformAdapter {
  private readonly limiter = getLimiter('linkedin');
  constructor(private accountId: string, private tokens: OAuthTokens) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // POST https://www.linkedin.com/oauth/v2/accessToken — 60-day refresh
    throw new Error('Implement');
  }
  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: POST /adCampaignsV2'); });
  }
  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async pauseCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: PATCH status=PAUSED'); });
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
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement: GET /adAnalyticsV2'); });
  }
  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    return this.limiter.executeWithRetry(async () => { throw new Error('Implement'); });
  }
}
