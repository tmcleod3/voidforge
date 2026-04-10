/**
 * Static S3 provisioner tests — validation and credential checks.
 * Tier 2: Validation prevents wasted AWS API calls.
 */

import { describe, it, expect } from 'vitest';
import type { ProvisionContext } from '../lib/provisioners/types.js';
import { staticS3Provisioner } from '../lib/provisioners/static-s3.js';

function makeCtx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    runId: '00000000-0000-0000-0000-000000000001',
    projectDir: '/tmp/test-project',
    projectName: 'test-project',
    deployTarget: 'static',
    framework: 'next.js',
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

describe('staticS3Provisioner.validate', () => {
  it('should return no errors for valid context', async () => {
    const errors = await staticS3Provisioner.validate(makeCtx());
    expect(errors).toEqual([]);
  });

  it('should require project directory', async () => {
    const errors = await staticS3Provisioner.validate(makeCtx({ projectDir: '' }));
    expect(errors).toContain('Project directory is required');
  });

  it('should require AWS access key ID', async () => {
    const errors = await staticS3Provisioner.validate(makeCtx({
      credentials: { 'aws-secret-access-key': 'secret123' },
    }));
    expect(errors).toContain('AWS Access Key ID is required');
  });

  it('should require AWS secret access key', async () => {
    const errors = await staticS3Provisioner.validate(makeCtx({
      credentials: { 'aws-access-key-id': 'AKIAEXAMPLE' },
    }));
    expect(errors).toContain('AWS Secret Access Key is required');
  });

  it('should return multiple errors when all required fields are missing', async () => {
    const errors = await staticS3Provisioner.validate(makeCtx({ projectDir: '', credentials: {} }));
    expect(errors).toHaveLength(3);
  });
});
