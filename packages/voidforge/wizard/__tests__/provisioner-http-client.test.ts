/**
 * HTTP client utility tests — slugify and safeJsonParse.
 * Tier 2: Pure utility functions used by all provisioners.
 */

import { describe, it, expect } from 'vitest';
import { slugify, safeJsonParse } from '../lib/provisioners/http-client.js';

describe('slugify', () => {
  it('should lowercase and replace spaces with hyphens', () => {
    expect(slugify('My Cool Project')).toBe('my-cool-project');
  });

  it('should strip non-alphanumeric characters except hyphens', () => {
    expect(slugify('project@#$name!')).toBe('project-name');
  });

  it('should collapse multiple hyphens into one', () => {
    expect(slugify('a---b---c')).toBe('a-b-c');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(slugify('--project--')).toBe('project');
  });

  it('should truncate to 40 characters', () => {
    const longName = 'a'.repeat(60);
    expect(slugify(longName).length).toBeLessThanOrEqual(40);
  });

  it('should return fallback for empty string', () => {
    expect(slugify('')).toBe('voidforge-project');
  });

  it('should return fallback for string of only special chars', () => {
    expect(slugify('!@#$%')).toBe('voidforge-project');
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('should return null for invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(safeJsonParse('')).toBeNull();
  });

  it('should parse arrays', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('should parse primitives', () => {
    expect(safeJsonParse('42')).toBe(42);
    expect(safeJsonParse('"hello"')).toBe('hello');
    expect(safeJsonParse('null')).toBeNull();
  });
});
