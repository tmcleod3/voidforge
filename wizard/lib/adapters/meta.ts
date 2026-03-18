/**
 * Meta Marketing API Adapter (Facebook/Instagram)
 *
 * Auth: OAuth 2.0 — Facebook Login → long-lived user token → page token
 * Token refresh: Every 60 days (long-lived token)
 * Rate limits: 200 calls/hr/ad account (sliding window)
 * Webhooks: Yes (deferred to remote mode per ADR-5)
 * Ad structure: Campaign → Ad Set (targeting/budget) → Ad (creative)
 * Minimum budget: $1/day per ad set
 * API version: v19.0+
 *
 * PRD Reference: §9.5 (Meta Marketing API)
 */

import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents,
} from './types.js';
import { toCents, getLimiter } from './types.js';

const BASE_URL = 'https://graph.facebook.com/v19.0';

export class MetaSetup implements AdPlatformSetup {
  constructor(private adAccountId: string) {}

  async authenticate(): Promise<OAuthTokens> {
    // Interactive OAuth: open browser to Facebook Login
    // Exchange short-lived token for long-lived (60 days)
    throw new Error('Interactive OAuth — opens browser for Facebook Login');
  }

  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    // GET /act_{adAccountId}?fields=name,currency,account_status
    throw new Error('Implement with node:https — no SDK');
  }

  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const status = await this.verifyConnection(tokens);
    return status.currency ?? 'USD';
  }
}

export class MetaAdapter implements AdPlatformAdapter {
  private readonly limiter = getLimiter('meta');

  constructor(private adAccountId: string, private tokens: OAuthTokens) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // Exchange at 80% of 60-day TTL via /oauth/access_token?grant_type=fb_exchange_token
    throw new Error('Implement with node:https');
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    return this.limiter.executeWithRetry(async () => {
      // POST /act_{adAccountId}/campaigns
      // Create paused, then create ad set + ad
      throw new Error('Implement with node:https');
    });
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // POST /{campaignId} — name, status changes at campaign level
      // Budget changes at ad set level
      throw new Error('Implement with node:https');
    });
  }

  async pauseCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // POST /{campaignId} { status: 'PAUSED' }
      throw new Error('Implement with node:https');
    });
  }

  async resumeCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // POST /{campaignId} { status: 'ACTIVE' }
      throw new Error('Implement with node:https');
    });
  }

  async deleteCampaign(id: string): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // DELETE /{campaignId}
      throw new Error('Implement with node:https');
    });
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // POST /{adSetId} { daily_budget: dailyBudget }
      // Meta budgets are at ad set level, amounts in account currency cents
      throw new Error('Implement with node:https');
    });
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    return this.limiter.executeWithRetry(async () => {
      // Creative updates go through the ad object, not campaign
      throw new Error('Implement with node:https');
    });
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    return this.limiter.executeWithRetry(async () => {
      // GET /act_{adAccountId}/insights?fields=campaign_id,spend,impressions,clicks,conversions&level=campaign
      throw new Error('Implement with node:https');
    });
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    return this.limiter.executeWithRetry(async () => {
      // GET /{campaignId}/insights?fields=impressions,clicks,conversions,spend,ctr,cpc
      throw new Error('Implement with node:https');
    });
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    return this.limiter.executeWithRetry(async () => {
      // GET /{campaignId}/insights?fields={metrics.join(',')}
      throw new Error('Implement with node:https');
    });
  }
}
