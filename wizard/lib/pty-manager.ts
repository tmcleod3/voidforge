/**
 * PTY Manager — spawns and manages real pseudo-terminal processes.
 * Uses node-pty (same lib as VS Code, Gitpod, GitHub Codespaces).
 * Each PTY is a real shell with full capabilities.
 *
 * Haku moves between worlds seamlessly.
 */

import { randomUUID } from 'node:crypto';

// node-pty is a native module — dynamic import to handle missing installs gracefully
let pty: typeof import('node-pty') | null = null;

async function loadPty(): Promise<typeof import('node-pty')> {
  if (pty) return pty;
  try {
    pty = await import('node-pty');
    return pty;
  } catch {
    throw new Error('node-pty is not installed. Run: npm install node-pty');
  }
}

export interface PtySession {
  id: string;
  projectName: string;
  projectDir: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
  cols: number;
  rows: number;
}

interface InternalSession extends PtySession {
  process: import('node-pty').IPty;
  onData: Set<(data: string) => void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, InternalSession>();

const MAX_SESSIONS = 5;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function resetIdleTimer(session: InternalSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    console.log(`  PTY session ${session.id} idle for 30 min — killing`);
    killSession(session.id);
  }, IDLE_TIMEOUT_MS);
}

/**
 * Spawn a new PTY session.
 * @param projectDir — directory to cd into
 * @param projectName — human-readable project name
 * @param label — tab label (e.g., "Claude Code", "Shell", "SSH: prod")
 * @param initialCommand — optional command to auto-run after shell starts
 * @param cols — terminal columns (default 120)
 * @param rows — terminal rows (default 30)
 */
export async function createSession(
  projectDir: string,
  projectName: string,
  label: string,
  initialCommand?: string,
  cols = 120,
  rows = 30,
): Promise<PtySession> {
  if (sessions.size >= MAX_SESSIONS) {
    // Kill oldest idle session to make room
    const oldest = [...sessions.values()].sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0];
    if (oldest) {
      killSession(oldest.id);
    } else {
      throw new Error(`Maximum ${MAX_SESSIONS} concurrent terminal sessions`);
    }
  }

  const nodePty = await loadPty();
  const shell = process.env['SHELL'] || '/bin/zsh';
  const id = randomUUID();

  const ptyProcess = nodePty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: projectDir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      // Ensure Claude Code can detect it's in a PTY
      VOIDFORGE_SESSION: id,
    } as Record<string, string>,
  });

  const session: InternalSession = {
    id,
    projectName,
    projectDir,
    label,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    cols,
    rows,
    process: ptyProcess,
    onData: new Set(),
    idleTimer: null,
  };

  // Forward PTY output to all listeners
  ptyProcess.onData((data: string) => {
    session.lastActivityAt = Date.now();
    resetIdleTimer(session);
    for (const listener of session.onData) {
      try { listener(data); } catch { /* listener error, ignore */ }
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`  PTY session ${id} exited (code ${exitCode})`);
    if (session.idleTimer) clearTimeout(session.idleTimer);
    sessions.delete(id);
  });

  sessions.set(id, session);
  resetIdleTimer(session);

  // Auto-run initial command after a short delay (let shell init complete)
  if (initialCommand) {
    setTimeout(() => {
      if (sessions.has(id)) {
        ptyProcess.write(initialCommand + '\r');
      }
    }, 500);
  }

  return {
    id: session.id,
    projectName: session.projectName,
    projectDir: session.projectDir,
    label: session.label,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    cols: session.cols,
    rows: session.rows,
  };
}

/** Write input (keystrokes) to a PTY session. */
export function writeToSession(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.lastActivityAt = Date.now();
  resetIdleTimer(session);
  session.process.write(data);
}

/** Subscribe to PTY output. Returns an unsubscribe function. */
export function onSessionData(sessionId: string, listener: (data: string) => void): () => void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.onData.add(listener);
  return () => { session.onData.delete(listener); };
}

/** Resize a PTY session. */
export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.cols = cols;
  session.rows = rows;
  session.process.resize(cols, rows);
}

/** Kill a PTY session. */
export function killSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  try { session.process.kill(); } catch { /* already dead */ }
  sessions.delete(sessionId);
}

/** List all active sessions. */
export function listSessions(): PtySession[] {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    projectName: s.projectName,
    projectDir: s.projectDir,
    label: s.label,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    cols: s.cols,
    rows: s.rows,
  }));
}

/** Kill all sessions (graceful shutdown). */
export function killAllSessions(): void {
  for (const id of sessions.keys()) {
    killSession(id);
  }
}

/** Get session count. */
export function sessionCount(): number {
  return sessions.size;
}
