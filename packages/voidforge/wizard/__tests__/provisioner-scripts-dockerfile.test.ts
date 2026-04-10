/**
 * Dockerfile template generator tests — per-framework Dockerfiles and .dockerignore.
 * Tier 2: Wrong Dockerfiles break builds.
 */

import { describe, it, expect } from 'vitest';
import { generateDockerfile, generateDockerignore } from '../lib/provisioners/scripts/dockerfile.js';

describe('generateDockerfile', () => {
  it('should generate a multi-stage Next.js Dockerfile', () => {
    const df = generateDockerfile('next.js');
    expect(df).toContain('FROM node:20-alpine AS deps');
    expect(df).toContain('FROM node:20-alpine AS builder');
    expect(df).toContain('FROM node:20-alpine AS runner');
    expect(df).toContain('USER nextjs');
    expect(df).toContain('EXPOSE 3000');
  });

  it('should generate an Express Dockerfile', () => {
    const df = generateDockerfile('express');
    expect(df).toContain('FROM node:20-alpine AS builder');
    expect(df).toContain('CMD ["node", "dist/index.js"]');
    expect(df).toContain('USER appuser');
  });

  it('should generate a Django Dockerfile', () => {
    const df = generateDockerfile('django');
    expect(df).toContain('FROM python:3.12-slim');
    expect(df).toContain('gunicorn');
    expect(df).toContain('EXPOSE 8000');
  });

  it('should generate a Rails Dockerfile', () => {
    const df = generateDockerfile('rails');
    expect(df).toContain('FROM ruby:3.3-slim');
    expect(df).toContain('bundle');
    expect(df).toContain('EXPOSE 3000');
  });

  it('should fall back to generic Node Dockerfile for unknown framework', () => {
    const df = generateDockerfile('svelte');
    expect(df).toContain('FROM node:20-alpine');
    expect(df).toContain('CMD ["node", "dist/index.js"]');
  });

  it('should include HEALTHCHECK in all frameworks', () => {
    for (const fw of ['next.js', 'express', 'django', 'rails', 'unknown']) {
      const df = generateDockerfile(fw);
      expect(df).toContain('HEALTHCHECK');
    }
  });
});

describe('generateDockerignore', () => {
  it('should exclude node_modules, .git, and .env', () => {
    const ignore = generateDockerignore();
    expect(ignore).toContain('node_modules');
    expect(ignore).toContain('.git');
    expect(ignore).toContain('.env');
  });

  it('should exclude coverage and logs', () => {
    const ignore = generateDockerignore();
    expect(ignore).toContain('coverage/');
    expect(ignore).toContain('logs/');
  });
});
