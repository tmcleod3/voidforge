/**
 * AWS VPS provisioner tests — validation and credential checks.
 * Tier 1: Validation prevents wasted AWS API calls and leaked errors.
 */

import { describe, it, expect } from 'vitest';
import type { ProvisionContext } from '../lib/provisioners/types.js';
import { awsVpsProvisioner } from '../lib/provisioners/aws-vps.js';

function makeCtx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    runId: '00000000-0000-0000-0000-000000000001',
    projectDir: '/tmp/test-project',
    projectName: 'test-project',
    deployTarget: 'vps',
    framework: 'express',
    database: 'none',
    cache: 'none',
    instanceType: '',
    hostname: '',
    credentials: {
      'aws-access-key-id': 'AKIAEXAMPLE',
      'aws-secret-access-key': 'secret123',
      'aws-region': 'us-east-1',
    },
    ...overrides,
  };
}

describe('awsVpsProvisioner.validate', () => {
  it('should return no errors for valid context', async () => {
    const errors = await awsVpsProvisioner.validate(makeCtx());
    expect(errors).toEqual([]);
  });

  it('should require project directory', async () => {
    const errors = await awsVpsProvisioner.validate(makeCtx({ projectDir: '' }));
    expect(errors).toContain('Project directory is required');
  });

  it('should require project name', async () => {
    const errors = await awsVpsProvisioner.validate(makeCtx({ projectName: '' }));
    expect(errors).toContain('Project name is required');
  });

  it('should require AWS access key ID', async () => {
    const errors = await awsVpsProvisioner.validate(makeCtx({
      credentials: { 'aws-secret-access-key': 'secret123' },
    }));
    expect(errors).toContain('AWS Access Key ID is required');
  });

  it('should require AWS secret access key', async () => {
    const errors = await awsVpsProvisioner.validate(makeCtx({
      credentials: { 'aws-access-key-id': 'AKIAEXAMPLE' },
    }));
    expect(errors).toContain('AWS Secret Access Key is required');
  });

  it('should reject invalid instance type', async () => {
    const errors = await awsVpsProvisioner.validate(makeCtx({ instanceType: 'm5.xlarge' }));
    expect(errors.some((e) => e.includes('Invalid instance type'))).toBe(true);
  });

  it('should accept valid instance types', async () => {
    for (const type of ['t3.micro', 't3.small', 't3.medium', 't3.large']) {
      const errors = await awsVpsProvisioner.validate(makeCtx({ instanceType: type }));
      expect(errors).toEqual([]);
    }
  });
});
