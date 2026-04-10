/**
 * Provision VPS script generator tests — server setup script per framework.
 * Tier 1: Security hardening and correct setup are critical.
 */

import { describe, it, expect } from 'vitest';
import { generateProvisionScript } from '../lib/provisioners/scripts/provision-vps.js';

describe('generateProvisionScript', () => {
  it('should install Node.js for express framework', () => {
    const script = generateProvisionScript({ framework: 'express', database: 'none', cache: 'none' });
    expect(script).toContain('Install Node.js');
    expect(script).toContain('nodesource');
  });

  it('should install Python for django framework', () => {
    const script = generateProvisionScript({ framework: 'django', database: 'none', cache: 'none' });
    expect(script).toContain('Install Python 3.12');
    expect(script).toContain('gunicorn');
  });

  it('should install Ruby for rails framework', () => {
    const script = generateProvisionScript({ framework: 'rails', database: 'none', cache: 'none' });
    expect(script).toContain('Install Ruby');
    expect(script).toContain('bundler');
  });

  it('should include security hardening (fail2ban, SSH, firewall)', () => {
    const script = generateProvisionScript({ framework: 'express', database: 'none', cache: 'none' });
    expect(script).toContain('fail2ban');
    expect(script).toContain('PermitRootLogin no');
    expect(script).toContain('PasswordAuthentication no');
    expect(script).toContain('firewall-cmd');
  });

  it('should skip swap for t3.large instances', () => {
    const script = generateProvisionScript({
      framework: 'express', database: 'none', cache: 'none', instanceType: 't3.large',
    });
    expect(script).toContain('Swap skipped');
  });

  it('should set up 2GB swap for t3.micro', () => {
    const script = generateProvisionScript({
      framework: 'express', database: 'none', cache: 'none', instanceType: 't3.micro',
    });
    expect(script).toContain('2G');
  });

  it('should set up 1GB swap for t3.medium', () => {
    const script = generateProvisionScript({
      framework: 'express', database: 'none', cache: 'none', instanceType: 't3.medium',
    });
    expect(script).toContain('1G');
  });

  it('should filter PostgreSQL extensions to allowlist only', () => {
    const script = generateProvisionScript({
      framework: 'express',
      database: 'postgres',
      cache: 'none',
      extensions: ['postgis', 'evil_extension', 'pg_trgm'],
    });
    expect(script).toContain('postgis');
    expect(script).toContain('pg_trgm');
    expect(script).not.toContain('evil_extension');
  });

  it('should include log rotation config', () => {
    const script = generateProvisionScript({ framework: 'express', database: 'none', cache: 'none' });
    expect(script).toContain('logrotate');
    expect(script).toContain('daily');
    expect(script).toContain('rotate 14');
  });
});
