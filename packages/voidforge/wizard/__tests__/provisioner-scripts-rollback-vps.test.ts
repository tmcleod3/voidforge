/**
 * Rollback VPS script generator tests — rollback.sh output per framework.
 * Tier 2: Wrong rollback scripts leave the app in a broken state.
 */

import { describe, it, expect } from 'vitest';
import { generateRollbackScript } from '../lib/provisioners/scripts/rollback-vps.js';

describe('generateRollbackScript', () => {
  it('should produce a bash script with shebang', () => {
    const script = generateRollbackScript({ framework: 'express' });
    expect(script).toContain('#!/usr/bin/env bash');
    expect(script).toContain('set -euo pipefail');
  });

  it('should use pm2 restart for node frameworks', () => {
    const script = generateRollbackScript({ framework: 'express' });
    expect(script).toContain('pm2 startOrRestart');
  });

  it('should use supervisorctl for django', () => {
    const script = generateRollbackScript({ framework: 'django' });
    expect(script).toContain('supervisorctl restart app');
  });

  it('should use rails db:migrate for rails', () => {
    const script = generateRollbackScript({ framework: 'rails' });
    expect(script).toContain('bundle exec rails db:migrate');
  });

  it('should swap the current symlink', () => {
    const script = generateRollbackScript({ framework: 'express' });
    expect(script).toContain('ln -sfn $PREVIOUS $CURRENT_LINK');
  });

  it('should handle missing previous release', () => {
    const script = generateRollbackScript({ framework: 'express' });
    expect(script).toContain('No previous release to roll back to');
  });
});
