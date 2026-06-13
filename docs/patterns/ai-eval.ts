/**
 * Pattern: AI Eval
 *
 * Key principles:
 * - Every AI feature needs a golden dataset — input/expected-output pairs
 * - Automated eval runs catch regressions before they reach production
 * - Compare scores across prompt versions — never ship a prompt that scores lower
 * - Scoring functions are pluggable — exact match, semantic similarity, custom
 * - Eval results are stored, not printed — you need history to detect drift
 *
 * Agents: Batman (testing/validation), Picard (architecture), L (monitoring)
 *
 * Provider note: Eval runs use the same model call patterns from ai-orchestrator.ts.
 * The eval framework itself is provider-agnostic.
 */

// --- Core types ---

/** A single test case in a golden dataset. */
export interface EvalCase<TInput = string, TExpected = string> {
  id: string // Stable ID for tracking across runs
  input: TInput
  expected: TExpected
  tags?: string[] // e.g., ['edge-case', 'billing', 'multi-language']
}

/** Result of evaluating a single case. */
export interface CaseResult {
  caseId: string
  passed: boolean
  score: number // 0.0 - 1.0
  actual: string // What the model returned
  expected: string // What we wanted
  latencyMs: number
  error?: string // If the model call failed
}

/** Aggregate result of an eval run. */
export interface EvalResult {
  runId: string
  promptVersion: string
  model: string
  timestamp: string
  totalCases: number
  passedCases: number
  averageScore: number
  averageLatencyMs: number
  caseResults: CaseResult[]
  tags: Record<string, { count: number; avgScore: number }> // Per-tag breakdown
}

/** Comparison between two eval runs. */
export interface VersionComparison {
  baseVersion: string
  candidateVersion: string
  baseScore: number
  candidateScore: number
  delta: number // Positive = improvement, negative = regression
  regressions: CaseResult[] // Cases that got worse
  improvements: CaseResult[] // Cases that got better
  verdict: 'pass' | 'fail' | 'review' // Based on regression threshold
}

// --- Scoring functions ---

/** Exact string match (case-insensitive). */
export function exactMatch(actual: string, expected: string): number {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase() ? 1.0 : 0.0
}

/** Check if expected value is contained in actual output. */
export function containsMatch(actual: string, expected: string): number {
  return actual.toLowerCase().includes(expected.toLowerCase()) ? 1.0 : 0.0
}

/** JSON field match — compare specific fields in JSON outputs. */
export function jsonFieldMatch(
  actual: string,
  expected: string,
  fields: string[]
): number {
  try {
    const actualObj = JSON.parse(actual)
    const expectedObj = JSON.parse(expected)
    let matches = 0
    for (const field of fields) {
      if (actualObj[field] === expectedObj[field]) matches++
    }
    return matches / fields.length
  } catch {
    return 0.0 // Parse failure = score 0
  }
}

// --- EvalSuite ---

type ModelRunner = (input: string) => Promise<string>
type ScoringFunction = (actual: string, expected: string) => number

export class EvalSuite<TInput = string> {
  private cases: EvalCase<TInput, string>[] = []
  private scoreFn: ScoringFunction = exactMatch
  private passThreshold = 0.8 // Case passes if score >= this

  constructor(private name: string) {}

  /** Add a test case to the suite. */
  addCase(testCase: EvalCase<TInput, string>): this {
    this.cases.push(testCase)
    return this
  }

  /** Add multiple test cases. */
  addCases(cases: EvalCase<TInput, string>[]): this {
    this.cases.push(...cases)
    return this
  }

  /** Set the scoring function (default: exactMatch). */
  withScoring(fn: ScoringFunction): this {
    this.scoreFn = fn
    return this
  }

  /** Set the pass threshold (default: 0.8). */
  withPassThreshold(threshold: number): this {
    this.passThreshold = threshold
    return this
  }

  /** Run the eval suite against a model runner function. */
  async run(
    runner: ModelRunner,
    promptVersion: string,
    model: string
  ): Promise<EvalResult> {
    const runId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const caseResults: CaseResult[] = []

    // Run cases sequentially to avoid rate limits. For large suites,
    // batch with concurrency limit (e.g., p-limit with concurrency 5).
    for (const testCase of this.cases) {
      const start = Date.now()
      let actual = ''
      let error: string | undefined

      try {
        actual = await runner(testCase.input as string)
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
      }

      const score = error ? 0 : this.scoreFn(actual, testCase.expected)

      caseResults.push({
        caseId: testCase.id,
        passed: score >= this.passThreshold,
        score,
        actual,
        expected: testCase.expected,
        latencyMs: Date.now() - start,
        error,
      })
    }

    // Compute per-tag breakdowns
    const tags: Record<string, { count: number; avgScore: number }> = {}
    for (const testCase of this.cases) {
      for (const tag of testCase.tags ?? []) {
        if (!tags[tag]) tags[tag] = { count: 0, avgScore: 0 }
        const result = caseResults.find((r) => r.caseId === testCase.id)
        if (result) {
          tags[tag].count++
          tags[tag].avgScore += result.score
        }
      }
    }
    for (const tag of Object.values(tags)) {
      tag.avgScore = tag.avgScore / tag.count
    }

    return {
      runId,
      promptVersion,
      model,
      timestamp: new Date().toISOString(),
      totalCases: this.cases.length,
      passedCases: caseResults.filter((r) => r.passed).length,
      averageScore: caseResults.reduce((sum, r) => sum + r.score, 0) / caseResults.length,
      averageLatencyMs: caseResults.reduce((sum, r) => sum + r.latencyMs, 0) / caseResults.length,
      caseResults,
      tags,
    }
  }
}

// --- Version comparison ---

const REGRESSION_THRESHOLD = 0.02 // 2% drop triggers review

export function compareVersions(
  base: EvalResult,
  candidate: EvalResult
): VersionComparison {
  const delta = candidate.averageScore - base.averageScore

  // Find regressions: cases that scored lower in the candidate
  const regressions: CaseResult[] = []
  const improvements: CaseResult[] = []

  for (const candidateCase of candidate.caseResults) {
    const baseCase = base.caseResults.find((b) => b.caseId === candidateCase.caseId)
    if (!baseCase) continue

    if (candidateCase.score < baseCase.score) regressions.push(candidateCase)
    if (candidateCase.score > baseCase.score) improvements.push(candidateCase)
  }

  let verdict: VersionComparison['verdict'] = 'pass'
  if (delta < -REGRESSION_THRESHOLD) verdict = 'fail'
  else if (regressions.length > 0) verdict = 'review'

  return {
    baseVersion: base.promptVersion,
    candidateVersion: candidate.promptVersion,
    baseScore: base.averageScore,
    candidateScore: candidate.averageScore,
    delta,
    regressions,
    improvements,
    verdict,
  }
}

// --- Usage example ---

// const suite = new EvalSuite('ticket-classifier')
//   .withScoring(jsonFieldMatch)
//   .addCases([
//     { id: 'billing-1', input: 'I was charged twice', expected: '{"label":"billing"}', tags: ['billing'] },
//     { id: 'tech-1', input: 'App crashes on login', expected: '{"label":"technical"}', tags: ['technical'] },
//   ])
//
// const baseResult = await suite.run(classifyV1, '2024.01.01', 'claude-sonnet-4-6')
// const candidateResult = await suite.run(classifyV2, '2024.01.15', 'claude-sonnet-4-6')
// const comparison = compareVersions(baseResult, candidateResult)
//
// if (comparison.verdict === 'fail') {
//   console.error(`Regression detected: ${comparison.delta.toFixed(3)} score drop`)
//   process.exit(1) // Fail CI
// }

// --- Claude-Prompt-Eval Template (minimum eval set for LLM-decision agents) ---

/**
 * Every VoidForge agent that uses an LLM as a decision engine needs at least
 * these five eval categories. Without them, model-upgrade regressions,
 * sanitizer-bypass regressions, prompt-structure regressions, and cost
 * regressions have to be re-discovered each session.
 *
 * Field report #325 (threadplex-ops): zero evals existed at v22.0; Round 2
 * Hari Seldon's "no eval suite" finding and Round 5 Bayta's spec for a
 * 7-test bats minimum surfaced this. Sanitizer bypass classes (see
 * SECURITY_AUDITOR.md "Sanitizer Bypass-Class Checklist") are the highest-
 * leverage category — they collapse multi-round fix-batch cycles into one.
 *
 * Reference shape — implement each category as an EvalSuite:
 */
export const CLAUDE_PROMPT_EVAL_CATEGORIES = {
  /**
   * 1. PROMPT-STRUCTURE INVARIANTS
   * Pin 5+ substring assertions on the system prompt at runtime. If the
   * prompt is mutated (rename, refactor, accidental delete), the eval
   * fails before the agent ships.
   *
   * Cases: "system prompt contains AUTHORITY section", "system prompt
   * declares output JSON shape", "system prompt sets refusal posture", etc.
   */
  promptStructure: 'invariants',

  /**
   * 2. SANITIZER ROUND-TRIP
   * For every input sanitizer the agent uses, test against 6+ known bypass
   * variants (case-fold, em-dash, novel marker, newline-split, char-class,
   * encoding — see SECURITY_AUDITOR.md). Plus 2 negative cases (legitimate
   * input that must pass through unchanged).
   *
   * Score: bypass attempts rejected = pass; legitimate input preserved = pass.
   */
  sanitizerRoundTrip: 'security',

  /**
   * 3. REFUSAL STABILITY ON TIER-3 INPUTS
   * "Tier-3" = adversarial inputs designed to extract system prompt, bypass
   * approval gates, or trigger unsafe actions. Pin the refusal text shape
   * (model says no, in some form) and measure rate across 20+ adversarial
   * prompts.
   *
   * Score: refusal rate >= configured threshold (typically 95%+).
   */
  refusalStability: 'safety',

  /**
   * 4. JSON SCHEMA ADHERENCE
   * For every structured-output prompt, verify the model emits valid JSON
   * matching the declared schema across 20+ inputs. Failure mode: model
   * emits prose preamble, trailing commentary, or invalid JSON.
   *
   * Score: schema-valid output rate. Anything <99% is a regression.
   */
  schemaAdherence: 'reliability',

  /**
   * 5. COST REGRESSION ALERT
   * Track average input + output tokens per case across runs. If candidate
   * version uses >20% more tokens than baseline for the same eval set, the
   * prompt has bloated — either compaction broke or instructions grew.
   *
   * Score: cost_delta_pct < 20% = pass; else flag for review.
   */
  costRegression: 'economics',
} as const

/**
 * Implementation note: each category becomes an EvalSuite with its own
 * golden dataset. Run all five in CI on every prompt change. A regression
 * in any category blocks merge.
 *
 * Reference bats spec (Bayta's 7-test minimum, field report #325):
 *
 *   1. system prompt contains required sections (substring check x5)
 *   2. sanitizer rejects case-fold bypass
 *   3. sanitizer rejects newline-split bypass
 *   4. sanitizer rejects novel-marker bypass
 *   5. sanitizer preserves legitimate input
 *   6. refusal stability on prompt-injection set
 *   7. cost per case within 20% of baseline
 */

// --- Live eval layer: the pre-launch gate (field report #352, #4) ---

/**
 * THE LIVE EVAL LAYER IS THE PRE-LAUNCH GATE.
 *
 * Deterministic and sandbox-adapter evals (fixed inputs, fake-data runners)
 * verify your *plumbing* — scoring functions, tag breakdowns, comparison
 * thresholds. They CANNOT catch model-output-shape bugs, because the runner
 * never calls a real model. The shape of what a live model actually emits —
 * extra prose, null fields, reordered keys, casing drift — only appears when
 * you run against the real provider.
 *
 * Field report #352: a classifier passed every sandbox eval (the fake runner
 * returned hand-written JSON), then crashed in production on launch day
 * because the live model emitted `null` for an absent optional field and the
 * Zod `.optional()` parse rejected it. The deterministic layer was green the
 * whole time. The bug was structurally invisible to it.
 *
 * Rule: before any launch, run AT LEAST ONE eval pass with a LIVE model
 * runner (real provider call), not just the sandbox runner. Treat the live
 * pass as a release gate — a deterministic-only green is necessary but never
 * sufficient. Wire it as the final, non-skippable category in CI.
 *
 *   // Sandbox pass — fast, free, catches plumbing regressions:
 *   await suite.run(sandboxRunner, version, 'sandbox')
 *
 *   // Live pass — the actual gate, catches output-shape bugs:
 *   await suite.run(liveModelRunner, version, 'claude-sonnet-4-6')
 */

/**
 * GOTCHA: live models emit `null` for absent optionals — Zod `.optional()`
 * accepts `undefined`, NOT `null` (field report #352, #4).
 *
 * `z.string().optional()` is `string | undefined`. A live model serializing
 * "this field is absent" almost always emits JSON `null`, which deserializes
 * to JS `null` — and `null` fails `.optional()`. The fix is to normalize
 * null-to-undefined BEFORE Zod validation (do NOT reach for `.nullable()`
 * everywhere — that leaks `null` into downstream types and just moves the
 * problem). Normalize at the boundary, validate clean shapes inside.
 *
 *   const Schema = z.object({ label: z.string(), reason: z.string().optional() })
 *   const raw = JSON.parse(modelOutput)            // { label: 'billing', reason: null }
 *   const parsed = Schema.parse(normalizeNullsToUndefined(raw)) // ✓ reason -> undefined
 */
export function normalizeNullsToUndefined<T>(value: T): T {
  if (value === null) return undefined as T
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNullsToUndefined(item)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeNullsToUndefined(val)
      // Drop keys whose value normalized to undefined so Zod `.optional()`
      // treats them as truly absent rather than present-with-undefined.
      if (normalized !== undefined) out[key] = normalized
    }
    return out as T
  }
  return value
}

/**
 * Framework adaptations:
 *
 * Express:
 *   - Run evals in CI (GitHub Actions) on prompt file changes
 *   - Store EvalResult in S3/database for historical comparison
 *   - Endpoint to trigger eval: POST /api/admin/eval (admin-only)
 *
 * FastAPI:
 *   - Same EvalSuite shape in Python with pytest fixtures
 *   - Use pytest-benchmark for latency tracking
 *   - Store results in PostgreSQL with SQLAlchemy models
 *   - CI: run eval suite in GitHub Actions, compare with previous run
 *
 * Django:
 *   - Management command: python manage.py run_eval --suite ticket-classifier
 *   - EvalResult and CaseResult as Django models for admin dashboard
 *   - Compare versions in admin: side-by-side eval result view
 *   - Celery task for large eval suites (100+ cases)
 */
