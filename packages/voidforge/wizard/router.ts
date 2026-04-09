import type { IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
  segments: string[];
  paramNames: string[];
}

/** Parsed route params attached to requests by the router. */
export type RouteParams = Record<string, string>;

const routes: Route[] = [];

/** Symbol key for storing route params on the request object. */
const PARAMS_KEY = Symbol.for('voidforge.routeParams');

function parsePath(path: string): { segments: string[]; paramNames: string[] } {
  const segments = path.split('/').filter(Boolean);
  const paramNames: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith(':')) paramNames.push(seg.slice(1));
  }
  return { segments, paramNames };
}

export function addRoute(method: string, path: string, handler: Handler): void {
  const { segments, paramNames } = parsePath(path);
  routes.push({ method: method.toUpperCase(), path, handler, segments, paramNames });
}

/**
 * Get route params from a request (set by the router during matching).
 * Returns empty object if no params were matched.
 */
export function getRouteParams(req: IncomingMessage): RouteParams {
  return (req as unknown as Record<symbol, RouteParams>)[PARAMS_KEY] ?? {};
}

export function route(req: IncomingMessage, res: ServerResponse): Handler | null {
  const method = req.method?.toUpperCase() ?? 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;
  const reqSegments = pathname.split('/').filter(Boolean);

  for (const r of routes) {
    // Fast path: exact match (no params) — preserves existing behavior
    if (r.paramNames.length === 0) {
      if (r.method === method && r.path === pathname) {
        return r.handler;
      }
      continue;
    }

    // Param match: segment count must match, then compare each segment
    if (r.method !== method || r.segments.length !== reqSegments.length) continue;

    const params: RouteParams = {};
    let matched = true;
    for (let i = 0; i < r.segments.length; i++) {
      if (r.segments[i].startsWith(':')) {
        params[r.segments[i].slice(1)] = decodeURIComponent(reqSegments[i]);
      } else if (r.segments[i] !== reqSegments[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      // Attach params to the request object
      (req as unknown as Record<symbol, RouteParams>)[PARAMS_KEY] = params;
      return r.handler;
    }
  }
  return null;
}
