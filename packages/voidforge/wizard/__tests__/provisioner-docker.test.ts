/**
 * Docker provisioner tests — validate and provision (file generation, no cloud API).
 * Tier 2: Local-only provisioner, tests file generation logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProvisionContext, ProvisionEvent } from '../lib/provisioners/types.js';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => {}),
}));

vi.mock('../lib/provisioners/scripts/dockerfile.js', () => ({
  generateDockerfile: vi.fn(() => 'FROM node:20-alpine\n'),
  generateDockerignore: vi.fn(() => 'node_modules\n'),
}));

vi.mock('../lib/provisioners/scripts/docker-compose.js', () => ({
  generateDockerCompose: vi.fn(() => 'services:\n  app:\n'),
}));

import { dockerProvisioner } from '../lib/provisioners/docker.js';

function makeCtx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    runId: '00000000-0000-0000-0000-000000000001',
    projectDir: '/tmp/test-project',
    projectName: 'test-project',
    deployTarget: 'docker',
    framework: 'express',
    database: 'none',
    cache: 'none',
    instanceType: '',
    hostname: '',
    credentials: {},
    ...overrides,
  };
}

describe('dockerProvisioner.validate', () => {
  it('should return no errors for valid context', async () => {
    const errors = await dockerProvisioner.validate(makeCtx());
    expect(errors).toEqual([]);
  });

  it('should require project directory', async () => {
    const errors = await dockerProvisioner.validate(makeCtx({ projectDir: '' }));
    expect(errors).toContain('Project directory is required');
  });

  it('should require project name', async () => {
    const errors = await dockerProvisioner.validate(makeCtx({ projectName: '' }));
    expect(errors).toContain('Project name is required');
  });

  it('should return multiple errors when both are missing', async () => {
    const errors = await dockerProvisioner.validate(makeCtx({ projectDir: '', projectName: '' }));
    expect(errors).toHaveLength(2);
  });
});

describe('dockerProvisioner.provision', () => {
  let events: ProvisionEvent[];

  beforeEach(() => {
    events = [];
    vi.clearAllMocks();
  });

  it('should generate Dockerfile, docker-compose.yml, and .dockerignore', async () => {
    const result = await dockerProvisioner.provision(makeCtx(), (e) => events.push(e));
    expect(result.success).toBe(true);
    expect(result.files).toContain('Dockerfile');
    expect(result.files).toContain('docker-compose.yml');
    expect(result.files).toContain('.dockerignore');
  });

  it('should create no cloud resources', async () => {
    const result = await dockerProvisioner.provision(makeCtx(), (e) => events.push(e));
    expect(result.resources).toEqual([]);
    expect(result.outputs).toEqual({});
  });

  it('should emit started and done events for each step', async () => {
    await dockerProvisioner.provision(makeCtx(), (e) => events.push(e));
    const steps = ['dockerfile', 'docker-compose', 'dockerignore'];
    for (const step of steps) {
      expect(events.some((e) => e.step === step && e.status === 'started')).toBe(true);
      expect(events.some((e) => e.step === step && e.status === 'done')).toBe(true);
    }
  });
});

describe('dockerProvisioner.cleanup', () => {
  it('should be a no-op (local files only)', async () => {
    // Should not throw
    await dockerProvisioner.cleanup([], {});
  });
});
