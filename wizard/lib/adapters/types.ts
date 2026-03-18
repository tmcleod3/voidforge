/**
 * Ad Platform Adapter Types — shared across all platform implementations.
 * Re-exports from the pattern file for convenience.
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4
 */

export type {
  AdPlatformSetup, AdPlatformAdapter, ReadOnlyAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, ConnectionStatus, PlatformError,
  Cents, Percentage, Ratio, AdPlatform,
} from '../../../docs/patterns/ad-platform-adapter.js';

export { toCents, toDollars, TokenBucketLimiter } from '../../../docs/patterns/ad-platform-adapter.js';
export { OutboundRateLimiter, getLimiter } from '../../../docs/patterns/outbound-rate-limiter.js';
