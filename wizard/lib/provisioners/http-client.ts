/**
 * Shared HTTPS client for provisioner API calls.
 * Uses raw node:https — no dependencies.
 */

import { request as httpsRequest } from 'node:https';

interface HttpResponse {
  status: number;
  body: string;
}

export function httpsGet(hostname: string, path: string, headers: Record<string, string>): Promise<HttpResponse> {
  return httpsCall('GET', hostname, path, headers);
}

export function httpsPost(hostname: string, path: string, headers: Record<string, string>, body?: string): Promise<HttpResponse> {
  return httpsCall('POST', hostname, path, headers, body);
}

export function httpsPut(hostname: string, path: string, headers: Record<string, string>, body?: string): Promise<HttpResponse> {
  return httpsCall('PUT', hostname, path, headers, body);
}

export function httpsDelete(hostname: string, path: string, headers: Record<string, string>): Promise<HttpResponse> {
  return httpsCall('DELETE', hostname, path, headers);
}

/** Slugify a name for use as a cloud resource identifier. Strips non-alphanumeric, trims hyphens. */
export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug || 'voidforge-project';
}

/** Safely parse JSON — returns null on invalid input instead of throwing. */
export function safeJsonParse(body: string): unknown {
  try { return JSON.parse(body); } catch { return null; }
}

function httpsCall(method: string, hostname: string, path: string, headers: Record<string, string>, body?: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const opts: Record<string, unknown> = { hostname, path, method, headers, timeout: 30000 };
    if (body) {
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }
    const req = httpsRequest(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}
