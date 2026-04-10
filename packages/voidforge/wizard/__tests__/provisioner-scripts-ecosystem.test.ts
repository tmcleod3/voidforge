/**
 * Ecosystem config generator tests — PM2 configuration per framework.
 * Tier 2: Wrong PM2 config causes deployment failures.
 */

import { describe, it, expect } from 'vitest';
import { generateEcosystemConfig } from '../lib/provisioners/scripts/ecosystem-config.js';

describe('generateEcosystemConfig', () => {
  it('should use next start for Next.js framework', () => {
    const config = generateEcosystemConfig({ projectName: 'my-app', framework: 'next.js' });
    expect(config).toContain("script: 'node_modules/.bin/next'");
    expect(config).toContain("args: 'start'");
  });

  it('should use dist/index.js for express framework', () => {
    const config = generateEcosystemConfig({ projectName: 'my-app', framework: 'express' });
    expect(config).toContain("script: 'dist/index.js'");
    expect(config).not.toContain("args:");
  });

  it('should set 2 instances for Next.js', () => {
    const config = generateEcosystemConfig({ projectName: 'my-app', framework: 'next.js' });
    expect(config).toContain("instances: '2'");
  });

  it('should set max instances for express', () => {
    const config = generateEcosystemConfig({ projectName: 'my-app', framework: 'express' });
    expect(config).toContain("instances: 'max'");
  });

  it('should include the project name', () => {
    const config = generateEcosystemConfig({ projectName: 'cool-project', framework: 'express' });
    expect(config).toContain('"cool-project"');
  });

  it('should use cluster exec_mode', () => {
    const config = generateEcosystemConfig({ projectName: 'my-app', framework: 'express' });
    expect(config).toContain("exec_mode: 'cluster'");
  });
});
