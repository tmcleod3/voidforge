/**
 * Caddyfile template generator tests — reverse proxy config per framework.
 * Tier 2: Wrong Caddyfile config breaks HTTPS and routing.
 */

import { describe, it, expect } from 'vitest';
import { generateCaddyfile } from '../lib/provisioners/scripts/caddyfile.js';

describe('generateCaddyfile', () => {
  it('should proxy to port 3000 for express framework', () => {
    const caddy = generateCaddyfile({ framework: 'express' });
    expect(caddy).toContain('reverse_proxy localhost:3000');
  });

  it('should proxy to port 8000 for django framework', () => {
    const caddy = generateCaddyfile({ framework: 'django' });
    expect(caddy).toContain('reverse_proxy localhost:8000');
  });

  it('should use :80 as default site address when no hostname', () => {
    const caddy = generateCaddyfile({ framework: 'express' });
    expect(caddy).toContain(':80 {');
  });

  it('should use hostname as site address when provided', () => {
    const caddy = generateCaddyfile({ framework: 'express', hostname: 'app.example.com' });
    expect(caddy).toContain('app.example.com {');
  });

  it('should include security headers', () => {
    const caddy = generateCaddyfile({ framework: 'express' });
    expect(caddy).toContain('Strict-Transport-Security');
    expect(caddy).toContain('X-Content-Type-Options nosniff');
    expect(caddy).toContain('X-Frame-Options DENY');
    expect(caddy).toContain('Content-Security-Policy');
  });

  it('should include gzip compression', () => {
    const caddy = generateCaddyfile({ framework: 'express' });
    expect(caddy).toContain('encode gzip');
  });

  it('should include access logging', () => {
    const caddy = generateCaddyfile({ framework: 'express' });
    expect(caddy).toContain('log {');
    expect(caddy).toContain('format json');
  });
});
