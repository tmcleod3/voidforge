/**
 * Docker Compose template generator tests — service composition per config.
 * Tier 2: Wrong compose files break docker-compose up.
 */

import { describe, it, expect } from 'vitest';
import { generateDockerCompose } from '../lib/provisioners/scripts/docker-compose.js';

describe('generateDockerCompose', () => {
  it('should generate app service with correct port for express', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'express',
      database: 'none',
      cache: 'none',
    });
    expect(compose).toContain('app:');
    expect(compose).toContain('3000');
  });

  it('should use port 8000 for django', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'django',
      database: 'none',
      cache: 'none',
    });
    expect(compose).toContain('8000');
  });

  it('should add postgres service when database is postgres', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'express',
      database: 'postgres',
      cache: 'none',
    });
    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('db_data:');
    expect(compose).toContain('pg_isready');
  });

  it('should add mysql service when database is mysql', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'express',
      database: 'mysql',
      cache: 'none',
    });
    expect(compose).toContain('mysql:8.0');
    expect(compose).toContain('mysqladmin');
  });

  it('should add redis service when cache is redis', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'express',
      database: 'none',
      cache: 'redis',
    });
    expect(compose).toContain('redis:7-alpine');
    expect(compose).toContain('redis-cli');
  });

  it('should add depends_on for app when db and redis are present', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'express',
      database: 'postgres',
      cache: 'redis',
    });
    expect(compose).toContain('depends_on:');
    expect(compose).toContain('condition: service_healthy');
  });

  it('should include healthcheck for app service', () => {
    const compose = generateDockerCompose({
      projectName: 'test',
      framework: 'express',
      database: 'none',
      cache: 'none',
    });
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('restart: unless-stopped');
  });
});
