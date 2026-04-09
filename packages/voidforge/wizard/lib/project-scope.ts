/**
 * Project Scope — ProjectContext type and resolveProject() middleware.
 *
 * Provides the core abstraction for v22.0 project-scoped operations:
 * - ProjectContext: immutable object with all derived paths for a project
 * - resolveProject(): middleware that extracts project ID, validates access, returns context
 *
 * ADR-040 (project-scoped dashboards), ADR-041 (Muster amendments)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { getProject, checkProjectAccess, type Project } from './project-registry.js';
import { isRemoteMode, isLanMode, validateSession, parseSessionCookie, getClientIp } from './tower-auth.js';
import { sendJson } from './http-helpers.js';
import { getRouteParams } from '../router.js';

// ── ProjectContext ──────────────────────────────────────

export interface ProjectContext {
  /** Project ID from projects.json registry */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Absolute path to project root (contains CLAUDE.md) */
  readonly directory: string;
  /** The full Project record from registry */
  readonly project: Project;

  // ── Derived paths (computed once, read-only) ──

  /** {directory}/logs/ */
  readonly logsDir: string;
  /** {directory}/cultivation/ */
  readonly cultivationDir: string;
  /** {directory}/cultivation/treasury/ */
  readonly treasuryDir: string;
  /** {directory}/cultivation/treasury/spend-log.jsonl */
  readonly spendLog: string;
  /** {directory}/cultivation/treasury/revenue-log.jsonl */
  readonly revenueLog: string;
  /** {directory}/cultivation/treasury/pending-ops.jsonl */
  readonly pendingOps: string;
  /** {directory}/cultivation/treasury/budgets.json */
  readonly budgetsFile: string;
  /** {directory}/cultivation/treasury/campaigns/ */
  readonly campaignsDir: string;
  /** {directory}/cultivation/heartbeat.pid */
  readonly pidFile: string;
  /** {directory}/cultivation/heartbeat.sock */
  readonly socketPath: string;
  /** {directory}/cultivation/heartbeat.json */
  readonly stateFile: string;
  /** {directory}/cultivation/heartbeat.log */
  readonly logFile: string;
  /** {directory}/cultivation/heartbeat.token */
  readonly tokenFile: string;
}

/** Construct a ProjectContext from a registry Project. */
export function createProjectContext(project: Project): ProjectContext {
  const dir = project.directory;
  const cultivationDir = join(dir, 'cultivation');
  const treasuryDir = join(cultivationDir, 'treasury');

  return {
    id: project.id,
    name: project.name,
    directory: dir,
    project,
    logsDir: join(dir, 'logs'),
    cultivationDir,
    treasuryDir,
    spendLog: join(treasuryDir, 'spend-log.jsonl'),
    revenueLog: join(treasuryDir, 'revenue-log.jsonl'),
    pendingOps: join(treasuryDir, 'pending-ops.jsonl'),
    budgetsFile: join(treasuryDir, 'budgets.json'),
    campaignsDir: join(treasuryDir, 'campaigns'),
    pidFile: join(cultivationDir, 'heartbeat.pid'),
    socketPath: join(cultivationDir, 'heartbeat.sock'),
    stateFile: join(cultivationDir, 'heartbeat.json'),
    logFile: join(cultivationDir, 'heartbeat.log'),
    tokenFile: join(cultivationDir, 'heartbeat.token'),
  };
}

// ── resolveProject() Middleware ─────────────────────────

export interface ResolvedProject {
  context: ProjectContext;
  role: 'admin' | 'deployer' | 'viewer';
}

/**
 * Extract project ID from route params or query string, validate access, return ProjectContext.
 *
 * Checks (in order):
 * 1. Route param :id (from parameterized routes like /api/projects/:id/...)
 * 2. Query param ?project=<id>
 *
 * Returns null if the response was already sent (error path).
 * In local mode, all projects are accessible as admin.
 */
export async function resolveProject(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<ResolvedProject | null> {
  // Extract project ID from route params or query string
  const params = getRouteParams(req);
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const projectId = params.id || url.searchParams.get('project');

  if (!projectId) {
    sendJson(res, 400, { success: false, error: 'project parameter is required' });
    return null;
  }

  // Look up project in registry
  const project = await getProject(projectId);
  if (!project) {
    sendJson(res, 404, { success: false, error: 'Not found' });
    return null;
  }

  // In local mode, no auth — full access
  if (!isRemoteMode() && !isLanMode()) {
    return {
      context: createProjectContext(project),
      role: 'admin',
    };
  }

  // Remote/LAN mode: validate session and project access
  const token = parseSessionCookie(req.headers.cookie);
  const ip = getClientIp(req);
  const session = token ? validateSession(token, ip) : null;

  if (!session) {
    sendJson(res, 401, { success: false, error: 'Authentication required' });
    return null;
  }

  const role = await checkProjectAccess(projectId, session.username, session.role);
  if (!role) {
    // 404 not 403 — no information leakage (per CLAUDE.md)
    sendJson(res, 404, { success: false, error: 'Not found' });
    return null;
  }

  return {
    context: createProjectContext(project),
    role,
  };
}
