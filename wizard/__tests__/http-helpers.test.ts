/**
 * HTTP helpers tests — shared response utilities.
 * Tier 3: Regression prevention for the consolidated sendJson.
 */

import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { sendJson, readFileOrNull } from '../lib/http-helpers.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';

function mockResponse(): ServerResponse & { _status: number; _headers: Record<string, string>; _body: string } {
  const res = new Writable({
    write(chunk, _enc, cb) { (res as unknown as { _body: string })._body += chunk.toString(); cb(); },
  }) as unknown as ServerResponse & { _status: number; _headers: Record<string, string>; _body: string };
  res._status = 0;
  res._headers = {};
  res._body = '';
  res.writeHead = function (status: number, headers?: Record<string, string>) {
    res._status = status;
    if (headers) Object.assign(res._headers, headers);
    return res;
  } as unknown as ServerResponse['writeHead'];
  res.end = function (data?: string) {
    if (data) res._body += data;
  } as unknown as ServerResponse['end'];
  return res;
}

describe('sendJson', () => {
  it('should set Content-Type and status', () => {
    const res = mockResponse();
    sendJson(res, 200, { ok: true });
    expect(res._status).toBe(200);
    expect(res._headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(res._body)).toEqual({ ok: true });
  });

  it('should set no-cache headers when noCache=true', () => {
    const res = mockResponse();
    sendJson(res, 200, { secret: true }, true);
    expect(res._headers['Cache-Control']).toBe('no-store');
    expect(res._headers['Pragma']).toBe('no-cache');
  });

  it('should NOT set cache headers when noCache=false', () => {
    const res = mockResponse();
    sendJson(res, 200, { data: true });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('should handle error responses', () => {
    const res = mockResponse();
    sendJson(res, 404, { error: 'Not found' });
    expect(res._status).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: 'Not found' });
  });
});

describe('readFileOrNull', () => {
  let tempDir: string;

  it('should return file contents for existing files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'helpers-test-'));
    const testFile = join(tempDir, 'test.txt');
    await writeFile(testFile, 'hello world');
    const result = await readFileOrNull(testFile);
    expect(result).toBe('hello world');
    await rm(tempDir, { recursive: true });
  });

  it('should return null for non-existent files', async () => {
    const result = await readFileOrNull('/nonexistent/path/to/file.txt');
    expect(result).toBeNull();
  });
});
