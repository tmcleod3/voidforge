/**
 * Self-deploy provisioner tests — script generation, input validation, shell escaping.
 * Tier 1: Shell injection prevention is security-critical.
 */

import { describe, it, expect } from 'vitest';
import {
  generateProvisionScript,
  generateCaddyTemplate,
  type SelfDeployConfig,
} from '../lib/provisioners/self-deploy.js';

const validConfig: SelfDeployConfig = {
  sshHost: '1.2.3.4',
  sshUser: 'ec2-user',
  sshKeyPath: '.ssh/deploy-key.pem',
  domain: 'forge.example.com',
  nodeVersion: '22',
  voidforgeRepo: 'https://github.com/tmcleod3/voidforge.git',
  voidforgeBranch: 'main',
};

describe('generateProvisionScript', () => {
  it('should generate a bash script with the domain', () => {
    const script = generateProvisionScript(validConfig);
    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('forge.example.com');
  });

  it('should include all 7 setup steps', () => {
    const script = generateProvisionScript(validConfig);
    expect(script).toContain('[1/7]');
    expect(script).toContain('[7/7]');
  });

  it('should include PM2 and Caddy installation', () => {
    const script = generateProvisionScript(validConfig);
    expect(script).toContain('pm2');
    expect(script).toContain('caddy');
  });

  it('should reject domains with shell metacharacters', () => {
    expect(() =>
      generateProvisionScript({ ...validConfig, domain: 'evil.com; rm -rf /' }),
    ).toThrow('Invalid domain');
  });

  it('should reject invalid domain format', () => {
    expect(() =>
      generateProvisionScript({ ...validConfig, domain: 'not-a-domain' }),
    ).toThrow('Invalid domain');
  });

  it('should shell-escape repo URL and branch', () => {
    const script = generateProvisionScript(validConfig);
    // Repo and branch should be single-quoted in the script
    expect(script).toContain("'https://github.com/tmcleod3/voidforge.git'");
    expect(script).toContain("'main'");
  });
});

describe('generateCaddyTemplate', () => {
  it('should produce a Caddy config for the given domain', () => {
    const config = generateCaddyTemplate('app.example.com');
    expect(config).toContain('app.example.com');
    expect(config).toContain('reverse_proxy localhost:3141');
  });

  it('should include HSTS header', () => {
    const config = generateCaddyTemplate('app.example.com');
    expect(config).toContain('Strict-Transport-Security');
  });

  it('should include WebSocket upgrade config', () => {
    const config = generateCaddyTemplate('app.example.com');
    expect(config).toContain('/ws/terminal');
    expect(config).toContain('Upgrade websocket');
  });
});
