/**
 * Provisioner registry tests — target lookup, credential scoping, GitHub-linked targets.
 * Tier 2: Registry correctness prevents credential leaks and wrong provisioner selection.
 */

import { describe, it, expect } from 'vitest';
import {
  provisioners,
  provisionKeys,
  GITHUB_LINKED_TARGETS,
  GITHUB_OPTIONAL_TARGETS,
} from '../lib/provisioner-registry.js';

describe('provisioners registry', () => {
  it('should contain all expected deploy targets', () => {
    expect(Object.keys(provisioners)).toEqual(
      expect.arrayContaining(['docker', 'vps', 'vercel', 'railway', 'cloudflare', 'static']),
    );
  });

  it('should have validate, provision, and cleanup for each provisioner', () => {
    for (const [name, provisioner] of Object.entries(provisioners)) {
      expect(typeof provisioner.validate).toBe('function');
      expect(typeof provisioner.provision).toBe('function');
      expect(typeof provisioner.cleanup).toBe('function');
    }
  });

  it('should scope AWS credentials to vps and static only', () => {
    expect(provisionKeys['vps']).toContain('aws-access-key-id');
    expect(provisionKeys['static']).toContain('aws-access-key-id');
    expect(provisionKeys['vercel']).not.toContain('aws-access-key-id');
    expect(provisionKeys['railway']).not.toContain('aws-access-key-id');
  });

  it('should require no credentials for docker', () => {
    expect(provisionKeys['docker']).toEqual([]);
  });

  it('should scope vercel-token to vercel only', () => {
    expect(provisionKeys['vercel']).toContain('vercel-token');
    expect(provisionKeys['vps']).not.toContain('vercel-token');
  });
});

describe('GITHUB_LINKED_TARGETS', () => {
  it('should include vercel, cloudflare, and railway', () => {
    expect(GITHUB_LINKED_TARGETS).toEqual(expect.arrayContaining(['vercel', 'cloudflare', 'railway']));
  });

  it('should not include docker or vps', () => {
    expect(GITHUB_LINKED_TARGETS).not.toContain('docker');
    expect(GITHUB_LINKED_TARGETS).not.toContain('vps');
  });
});

describe('GITHUB_OPTIONAL_TARGETS', () => {
  it('should include vps and static', () => {
    expect(GITHUB_OPTIONAL_TARGETS).toEqual(expect.arrayContaining(['vps', 'static']));
  });
});
