/**
 * Deploy VPS script generator tests — deploy.sh output per framework.
 * Tier 2: Wrong deploy scripts break production deployments.
 */

import { describe, it, expect } from 'vitest';
import { generateDeployScript } from '../lib/provisioners/scripts/deploy-vps.js';

describe('generateDeployScript', () => {
  it('should use npm ci for node frameworks', () => {
    const script = generateDeployScript({ framework: 'express' });
    expect(script).toContain('npm ci --production');
  });

  it('should use pip install for django', () => {
    const script = generateDeployScript({ framework: 'django' });
    expect(script).toContain('pip3.12 install -r requirements.txt');
  });

  it('should use bundle install for rails', () => {
    const script = generateDeployScript({ framework: 'rails' });
    expect(script).toContain('bundle install --deployment');
  });

  it('should use pm2 restart for node frameworks', () => {
    const script = generateDeployScript({ framework: 'next.js' });
    expect(script).toContain('pm2 startOrRestart');
  });

  it('should include health check with retries', () => {
    const script = generateDeployScript({ framework: 'express' });
    expect(script).toContain('HEALTH_RETRIES=5');
    expect(script).toContain('curl -sf');
  });

  it('should include rollback on health check failure', () => {
    const script = generateDeployScript({ framework: 'express' });
    expect(script).toContain('HEALTH CHECK FAILED');
    expect(script).toContain('ln -sfn $PREVIOUS');
  });

  it('should clean up old releases (keep last 5)', () => {
    const script = generateDeployScript({ framework: 'express' });
    expect(script).toContain('head -n -5');
  });
});
