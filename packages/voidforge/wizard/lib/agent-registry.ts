/**
 * Agent Registry — Loads and caches all agent definitions from .claude/agents/.
 *
 * Parses YAML frontmatter (name, description, model, tools, tags) from each
 * agent .md file and returns a structured, sorted array. Cached in memory
 * since agent definitions don't change mid-session.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  model: string;
  tools?: string[];
  tags?: string[];
}

let cachedRegistry: AgentEntry[] | null = null;

/** Parse YAML frontmatter from an agent markdown file. */
function parseFrontmatter(content: string): Record<string, string | string[]> {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};

  const yaml = content.slice(4, end);
  const result: Record<string, string | string[]> = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of yaml.split('\n')) {
    // Multi-line array item (e.g. "  - Read")
    if (currentKey && currentArray && /^\s+-\s+/.test(line)) {
      currentArray.push(line.replace(/^\s+-\s+/, '').trim());
      continue;
    }

    // Flush any in-progress array
    if (currentKey && currentArray) {
      result[currentKey] = currentArray;
      currentKey = null;
      currentArray = null;
    }

    const match = line.match(/^(\w+):\s*(.*)?$/);
    if (!match) continue;

    const key = match[1];
    const rawValue = (match[2] ?? '').trim();

    // Inline array: [a, b, c]
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      result[key] = rawValue.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }

    // Empty value — start of multi-line array
    if (!rawValue) {
      currentKey = key;
      currentArray = [];
      continue;
    }

    // Scalar value — strip quotes
    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  // Flush trailing array
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}

function toStringArray(val: string | string[] | undefined): string[] | undefined {
  if (!val) return undefined;
  return Array.isArray(val) ? val : [val];
}

/** Load all agent definitions from disk, or return cached result. */
export async function loadAgentRegistry(agentsDir?: string): Promise<AgentEntry[]> {
  if (cachedRegistry) return cachedRegistry;

  const dir = agentsDir ?? join(process.cwd(), '.claude', 'agents');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();

  const entries: AgentEntry[] = [];
  for (const file of files) {
    const content = await readFile(join(dir, file), 'utf-8');
    const fm = parseFrontmatter(content);
    const name = typeof fm.name === 'string' ? fm.name : '';
    const description = typeof fm.description === 'string' ? fm.description : '';
    const model = typeof fm.model === 'string' ? fm.model : 'sonnet';
    if (!name) continue;

    entries.push({
      id: basename(file, '.md'),
      name,
      description,
      model,
      tools: toStringArray(fm.tools),
      tags: toStringArray(fm.tags),
    });
  }

  cachedRegistry = entries;
  return entries;
}

/** Clear the cached registry (e.g., after agent files change). */
export function clearRegistryCache(): void {
  cachedRegistry = null;
}

/** Format the registry as a compact string for the Herald's Haiku prompt. */
export function getRegistrySummary(registry: AgentEntry[]): string {
  return registry.map((a) => {
    const tags = a.tags?.length ? ` [${a.tags.join(', ')}]` : '';
    return `${a.id}: ${a.description}${tags}`;
  }).join('\n');
}
