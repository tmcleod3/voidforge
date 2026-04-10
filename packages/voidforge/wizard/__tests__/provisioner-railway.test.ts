/**
 * Railway provisioner tests — validation and credential checks.
 * Tier 2: Validation prevents wasted API calls.
 */

import { describe, it, expect } from 'vitest';
import type { ProvisionContext } from '../lib/provisioners/types.js';
import { railwayProvisioner } from '../lib/provisioners/railway.js';

function makeCtx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    runId: '00000000-0000-0000-0000-000000000001',
    projectDir: '/tmp/test-project',
    projectName: 'test-project',
    deployTarget: 'railway',
    framework: 'express',
    database: 'none',
    cache: 'none',
    instanceType: '',
    hostname: '',
    credentials: {
      'railway-token': 'rw_test_token_123',
    },
    ...overrides,
  };
}

describe('railwayProvisioner.validate', () => {
  it('should return no errors for valid context', async () => {
    const errors = await railwayProvisioner.validate(makeCtx());
    expect(errors).toEqual([]);
  });

  it('should require project directory', async () => {
    const errors = await railwayProvisioner.validate(makeCtx({ projectDir: '' }));
    expect(errors).toContain('Project directory is required');
  });

  it('should require railway token', async () => {
    const errors = await railwayProvisioner.validate(makeCtx({ credentials: {} }));
    expect(errors).toContain('Railway API token is required');
  });

  it('should return multiple errors when all required fields are missing', async () => {
    const errors = await railwayProvisioner.validate(makeCtx({ projectDir: '', credentials: {} }));
    expect(errors).toHaveLength(2);
  });
});
