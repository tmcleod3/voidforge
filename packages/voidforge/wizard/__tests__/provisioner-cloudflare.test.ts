/**
 * Cloudflare provisioner tests — validation and credential checks.
 * Tier 2: Validation prevents wasted API calls.
 */

import { describe, it, expect } from 'vitest';
import type { ProvisionContext } from '../lib/provisioners/types.js';
import { cloudflareProvisioner } from '../lib/provisioners/cloudflare.js';

function makeCtx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    runId: '00000000-0000-0000-0000-000000000001',
    projectDir: '/tmp/test-project',
    projectName: 'test-project',
    deployTarget: 'cloudflare',
    framework: 'next.js',
    database: 'none',
    cache: 'none',
    instanceType: '',
    hostname: '',
    credentials: {
      'cloudflare-api-token': 'cf_token_test',
    },
    ...overrides,
  };
}

describe('cloudflareProvisioner.validate', () => {
  it('should return no errors for valid context', async () => {
    const errors = await cloudflareProvisioner.validate(makeCtx());
    expect(errors).toEqual([]);
  });

  it('should require project directory', async () => {
    const errors = await cloudflareProvisioner.validate(makeCtx({ projectDir: '' }));
    expect(errors).toContain('Project directory is required');
  });

  it('should require cloudflare API token', async () => {
    const errors = await cloudflareProvisioner.validate(makeCtx({ credentials: {} }));
    expect(errors).toContain('Cloudflare API token is required');
  });

  it('should return multiple errors when all required fields are missing', async () => {
    const errors = await cloudflareProvisioner.validate(makeCtx({ projectDir: '', credentials: {} }));
    expect(errors).toHaveLength(2);
  });
});
