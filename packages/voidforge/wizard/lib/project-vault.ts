/**
 * Per-Project Vault — HKDF-derived encryption for project-scoped secrets.
 *
 * Derives a unique encryption key per project from the global vault password
 * using HKDF (RFC 5869). Each project's vault.enc is encrypted with its own
 * key, so compromising one project's vault doesn't expose another's secrets.
 *
 * Key derivation: HKDF-SHA256(masterKey, projectId, 'voidforge-project-vault') → 256-bit key
 *
 * The global financial vault (~/.voidforge/treasury/vault.enc) stays global
 * for cross-project credentials (API keys shared across projects). Per-project
 * vaults store project-specific secrets (campaign configs, scoped platform tokens).
 *
 * v22.1 Mission 3 — Campaign 30
 * PRD Reference: §9.11 (Financial Security), ADR-040 (project scoping)
 */

import { createCipheriv, createDecipheriv, hkdf, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

// ── Constants ────────────────────────────────────────────

const VAULT_FILENAME = 'vault.enc';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;   // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 32;  // Random salt per encryption (stored in file)
const AUTH_TAG_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 256;

// HKDF parameters
const HKDF_HASH = 'sha256';
const HKDF_INFO = 'voidforge-project-vault';

// ── Types ────────────────────────────────────────────────

interface ProjectVaultData {
  [key: string]: string;
}

// Per-project session caches keyed by vault path
const sessionCaches = new Map<string, { password: string; projectId: string; data: ProjectVaultData }>();

// Write queues per vault path
const writeQueues = new Map<string, Promise<void>>();

// ── HKDF Key Derivation ──────────────────────────────────

/**
 * Derive a per-project encryption key using HKDF (RFC 5869).
 *
 * HKDF extracts a pseudorandom key from the master password + salt,
 * then expands it with the project ID as context info. This ensures
 * each project gets a cryptographically independent key.
 *
 * @param password — The global vault password (IKM)
 * @param salt — Random salt stored alongside the ciphertext
 * @param projectId — Project identifier used as HKDF info context
 */
async function deriveProjectKey(password: string, salt: Buffer, projectId: string): Promise<Buffer> {
  const capped = password.slice(0, MAX_PASSWORD_LENGTH);
  const info = `${HKDF_INFO}:${projectId}`;
  return new Promise<Buffer>((resolve, reject) => {
    hkdf(HKDF_HASH, capped, salt, info, KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

// ── Encrypt / Decrypt ────────────────────────────────────

async function encrypt(plaintext: string, password: string, projectId: string): Promise<Buffer> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveProjectKey(password, salt, projectId);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt (32) + iv (16) + authTag (16) + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

async function decrypt(data: Buffer, password: string, projectId: string): Promise<string> {
  if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Project vault data is corrupted or empty');
  }

  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = await deriveProjectKey(password, salt, projectId);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

// ── Serialization ────────────────────────────────────────

function serialized<T>(vaultPath: string, fn: () => Promise<T>): Promise<T> {
  const queue = writeQueues.get(vaultPath) ?? Promise.resolve();
  const result = queue.then(fn, () => fn());
  writeQueues.set(vaultPath, result.then(() => {}, () => {}));
  return result;
}

// ── Internal Read/Write ──────────────────────────────────

function getVaultPath(projectDir: string): string {
  return join(projectDir, 'cultivation', 'treasury', VAULT_FILENAME);
}

async function readVault(
  password: string,
  projectId: string,
  vaultPath: string,
): Promise<ProjectVaultData> {
  const cache = sessionCaches.get(vaultPath);
  if (cache && cache.projectId === projectId) {
    const a = Buffer.from(cache.password, 'utf-8');
    const b = Buffer.from(password, 'utf-8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ...cache.data };
    }
  }

  if (!existsSync(vaultPath)) {
    return {};
  }

  const raw = await readFile(vaultPath);
  const json = await decrypt(raw, password, projectId);
  const data = JSON.parse(json) as ProjectVaultData;

  sessionCaches.set(vaultPath, { password, projectId, data });
  return { ...data };
}

async function writeVault(
  password: string,
  projectId: string,
  vaultPath: string,
  data: ProjectVaultData,
): Promise<void> {
  const dir = join(vaultPath, '..');
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(data);
  const encrypted = await encrypt(json, password, projectId);

  // Atomic write: temp → datasync/sync → rename (per ADR-1)
  const tmpPath = vaultPath + '.tmp.' + process.pid;
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(encrypted);
    if (platform() === 'darwin') {
      await fh.datasync();
    } else {
      await fh.sync();
    }
  } finally {
    await fh.close();
  }
  await rename(tmpPath, vaultPath);

  sessionCaches.set(vaultPath, { password, projectId, data: { ...data } });
}

// ── Public API ───────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 12;

function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Vault password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/** Store a project-specific credential. */
export function projectVaultSet(
  password: string,
  projectId: string,
  projectDir: string,
  key: string,
  value: string,
): Promise<void> {
  validatePassword(password);
  const vaultPath = getVaultPath(projectDir);
  return serialized(vaultPath, async () => {
    const data = await readVault(password, projectId, vaultPath);
    data[key] = value;
    await writeVault(password, projectId, vaultPath, data);
  });
}

/** Retrieve a project-specific credential. */
export function projectVaultGet(
  password: string,
  projectId: string,
  projectDir: string,
  key: string,
): Promise<string | null> {
  const vaultPath = getVaultPath(projectDir);
  return serialized(vaultPath, async () => {
    const data = await readVault(password, projectId, vaultPath);
    return data[key] ?? null;
  });
}

/** Delete a project-specific credential. */
export function projectVaultDelete(
  password: string,
  projectId: string,
  projectDir: string,
  key: string,
): Promise<void> {
  const vaultPath = getVaultPath(projectDir);
  return serialized(vaultPath, async () => {
    const data = await readVault(password, projectId, vaultPath);
    delete data[key];
    await writeVault(password, projectId, vaultPath, data);
  });
}

/** Check if a per-project vault exists. */
export function projectVaultExists(projectDir: string): boolean {
  return existsSync(getVaultPath(projectDir));
}

/** Verify password can decrypt the project vault. */
export function projectVaultUnlock(
  password: string,
  projectId: string,
  projectDir: string,
): Promise<boolean> {
  const vaultPath = getVaultPath(projectDir);
  if (!existsSync(vaultPath)) {
    return Promise.resolve(true); // No vault yet = password is for creation
  }
  return serialized(vaultPath, async () => {
    try {
      await readVault(password, projectId, vaultPath);
      return true;
    } catch {
      return false;
    }
  });
}

/** List stored keys in a project vault (requires password). */
export function projectVaultKeys(
  password: string,
  projectId: string,
  projectDir: string,
): Promise<string[]> {
  const vaultPath = getVaultPath(projectDir);
  return serialized(vaultPath, async () => {
    const data = await readVault(password, projectId, vaultPath);
    return Object.keys(data);
  });
}

/** Clear the in-memory cache for a specific project vault. */
export function projectVaultLock(projectDir: string): void {
  const vaultPath = getVaultPath(projectDir);
  const cache = sessionCaches.get(vaultPath);
  if (cache) {
    cache.password = '\0'.repeat(cache.password.length);
    sessionCaches.delete(vaultPath);
  }
}

/** Clear ALL per-project vault caches — call on daemon shutdown. */
export function projectVaultLockAll(): void {
  for (const [, cache] of sessionCaches) {
    cache.password = '\0'.repeat(cache.password.length);
  }
  sessionCaches.clear();
}

/** Return the vault file path for a project directory. */
export function projectVaultPath(projectDir: string): string {
  return getVaultPath(projectDir);
}

// Export for testing
export { deriveProjectKey as _deriveProjectKey };
