/**
 * Pattern: Error Message Categorization at the UI Boundary
 *
 * Key principles:
 * - Categorize the error BEFORE selecting user-facing copy. The copy you show
 *   is a function of the error CATEGORY, never of where in the call stack the
 *   catch happened. A quota/billing failure must never render "try a different
 *   file" messaging just because it surfaced inside the upload flow.
 * - Classification is driven by two signals: the HTTP status code AND the error
 *   SHAPE (machine-readable `code`/`type` fields, Retry-After header, well-known
 *   message fragments). Status alone is ambiguous (429 = rate limit OR quota),
 *   so we inspect the shape to disambiguate.
 * - Every category maps to copy that is honest and actionable: tell the user
 *   what actually happened and what they can do about it. Quota → "you've hit
 *   your plan limit, upgrade or wait for reset", not "something went wrong".
 * - Unknown/unclassifiable errors fall back to a safe generic category. We
 *   never guess a specific category we can't justify from the signals.
 *
 * Agents: Bilbo (copy), Legolas (code), Samwise (a11y), Stark (error shapes)
 *
 * Framework adaptations:
 *   Next.js/React: This file (classify() + copy map + hook + component)
 *   Vue/Svelte: Same classify() + COPY map; render via the framework's
 *     conditional blocks. The categorization logic is framework-agnostic —
 *     only the rendering changes.
 *   Django/Rails (server-rendered): Run classify() server-side on the caught
 *     exception, pass the category + copy into the template context, render the
 *     matching block. Same union, same map.
 *
 * Why this pattern exists:
 *   (Field report #343 F8: an upload component caught a 402 billing/quota error
 *   from the storage backend and rendered "try a different file" because its
 *   only error branch was shaped for validation failures. The user re-uploaded
 *   the same file five times before contacting support. The copy was selected
 *   by call site, not by error category. Categorize first, then choose copy.)
 *
 * === The Anti-Pattern This Replaces ===
 *
 *   // WRONG — copy chosen by call site, not by error category
 *   try {
 *     await uploadFile(file)
 *   } catch (err) {
 *     // This branch assumes every failure here is the file's fault.
 *     setMessage('That file could not be uploaded. Try a different file.')
 *   }
 *
 *   A 402 (quota), 429 (rate limit), 401 (auth expired), or 503 (server down)
 *   all hit this branch and all get blamed on the file. Categorize instead.
 */

'use client'

import { useCallback, useState } from 'react'

// ── Error category union ─────────────────────────────
// The exhaustive set of categories the UI knows how to talk about. Keep this
// closed — adding a category forces you to add copy for it (the COPY map below
// is keyed by this union, so the compiler flags a missing entry).
export type ErrorCategory =
  | 'quota' // plan/usage limit reached (billing dimension), e.g. 402 + quota code
  | 'rate-limit' // too many requests in a window; retry after a delay (429)
  | 'timeout' // request took too long / aborted (408, AbortError)
  | 'network' // could not reach the server at all (offline, DNS, CORS, fetch throw)
  | 'validation' // the input was rejected (400/422 with field errors)
  | 'auth' // not authenticated / session expired (401)
  | 'forbidden' // authenticated but not allowed (403)
  | 'not-found' // the target does not exist (404)
  | 'server' // backend fault, not the user's fault (500/502/503/504)
  | 'unknown' // safe fallback — none of the signals matched

// ── Normalized error input ───────────────────────────
// Real catch blocks receive heterogeneous junk: fetch Responses, thrown
// Errors, parsed JSON error bodies, DOMExceptions. classify() accepts a
// normalized shape so callers can adapt their transport once at the boundary.
export interface NormalizedError {
  /** HTTP status code, if the error came from an HTTP response. */
  status?: number
  /**
   * Machine-readable error code from the response body. Backends commonly send
   * `{ code: 'quota_exceeded' }` or `{ type: 'insufficient_quota' }`. We check
   * both `code` and `type` because providers disagree on the field name.
   */
  code?: string
  /** Human/loggable message — used only as a last-resort signal, never as copy. */
  message?: string
  /** Retry-After value in seconds, if the server sent one (rate limit / quota). */
  retryAfterSeconds?: number
  /** True if this was a fetch/network throw (no response was received at all). */
  isNetworkError?: boolean
  /** True if the request was aborted or timed out client-side. */
  isTimeout?: boolean
  /** Field-level validation errors, if the backend returned them. */
  fieldErrors?: Record<string, string[]>
}

// Codes (from the body) that signal a billing/quota exhaustion regardless of
// the status code. Different providers use different strings — match on any.
const QUOTA_CODES = new Set([
  'quota_exceeded',
  'insufficient_quota',
  'plan_limit_reached',
  'billing_quota_exceeded',
  'usage_limit_exceeded',
  'storage_quota_exceeded',
])

const RATE_LIMIT_CODES = new Set([
  'rate_limited',
  'rate_limit_exceeded',
  'too_many_requests',
  'throttled',
])

const AUTH_CODES = new Set([
  'token_expired',
  'invalid_token',
  'session_expired',
  'unauthenticated',
])

// ── classify(): error shape + status -> category ─────
//
// Order matters. We check the most specific, least-ambiguous signals first
// (network/timeout, then body codes), and only fall back to bare status codes
// when the shape gave us nothing. This is what stops a 402 quota error from
// being miscategorized as a generic 4xx validation failure.
export function classify(err: NormalizedError): ErrorCategory {
  // 1. No response at all — we never reached the server. This must come before
  //    status checks because a network throw has no status.
  if (err.isNetworkError) return 'network'

  // 2. Client-side timeout / abort.
  if (err.isTimeout || err.status === 408) return 'timeout'

  const code = (err.code ?? '').toLowerCase()

  // 3. Body-code disambiguation — THE critical step (#343 F8). A 402 or even a
  //    429 can be a quota/billing problem; the body code tells us which copy to
  //    show. Decide on the code before falling through to status-only logic.
  if (QUOTA_CODES.has(code)) return 'quota'
  if (RATE_LIMIT_CODES.has(code)) return 'rate-limit'
  if (AUTH_CODES.has(code)) return 'auth'

  // 4. Status-driven categories for the unambiguous cases.
  switch (err.status) {
    case 401:
      return 'auth'
    case 402:
      // Payment Required is, by spec, a billing/quota signal. If we got here the
      // body code didn't say "rate-limit", so treat 402 as quota — NOT as a
      // generic validation error the file-upload branch would have shown.
      return 'quota'
    case 403:
      return 'forbidden'
    case 404:
      return 'not-found'
    case 422:
      return 'validation'
    case 429:
      // 429 with no quota code is a plain rate limit (retry later). A 429 WITH a
      // quota code was already caught in step 3.
      return 'rate-limit'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'server'
    case 400:
      // 400 with field errors is a validation failure; a bare 400 is ambiguous,
      // so only call it validation when the backend actually itemized fields.
      return err.fieldErrors && Object.keys(err.fieldErrors).length > 0
        ? 'validation'
        : 'unknown'
  }

  // 5. Last-resort message sniffing for transports that drop status/code.
  const msg = (err.message ?? '').toLowerCase()
  if (msg.includes('quota') || msg.includes('billing')) return 'quota'
  if (msg.includes('rate limit') || msg.includes('too many requests')) return 'rate-limit'
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout'
  if (msg.includes('network') || msg.includes('failed to fetch')) return 'network'

  // 6. We could not justify a specific category from any signal.
  return 'unknown'
}

// ── normalizeError(): transport junk -> NormalizedError ─
// Reference adapter for the fetch/Response + thrown-Error world. Call this once
// at your data-access boundary so classify() always receives a clean shape.
export async function normalizeError(input: unknown): Promise<NormalizedError> {
  // fetch network failures throw a TypeError before any Response exists.
  if (input instanceof TypeError && /fetch/i.test(input.message)) {
    return { isNetworkError: true, message: input.message }
  }

  // AbortController / client timeout surfaces as a DOMException.
  if (input instanceof DOMException && input.name === 'AbortError') {
    return { isTimeout: true, message: input.message }
  }

  // An HTTP Response that came back non-OK.
  if (input instanceof Response) {
    const retryAfterHeader = input.headers.get('Retry-After')
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined
    let body: { code?: string; type?: string; message?: string; errors?: Record<string, string[]> } = {}
    try {
      body = await input.clone().json()
    } catch {
      // Non-JSON body (HTML error page, empty 502, etc.) — status alone drives it.
    }
    return {
      status: input.status,
      code: body.code ?? body.type,
      message: body.message,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      fieldErrors: body.errors,
    }
  }

  // A plain thrown Error.
  if (input instanceof Error) {
    return { message: input.message }
  }

  return { message: String(input) }
}

// ── Copy map: category -> user-facing copy ───────────
// Keyed by the full ErrorCategory union, so dropping a category is a compile
// error. `action` is the label for the primary recovery button; `retryable`
// tells the UI whether to even offer a retry (retrying a 403 is pointless).
export interface ErrorCopy {
  title: string
  body: string
  action: string
  retryable: boolean
}

export const COPY: Record<ErrorCategory, ErrorCopy> = {
  quota: {
    title: "You've hit your plan limit",
    body: 'This action would exceed your current plan. Upgrade your plan or wait for your usage to reset — re-trying the same request will not help.',
    action: 'View plans',
    retryable: false,
  },
  'rate-limit': {
    title: 'Slow down a moment',
    body: "You're sending requests faster than we allow. Wait a few seconds and try again.",
    action: 'Try again',
    retryable: true,
  },
  timeout: {
    title: 'That took too long',
    body: 'The request timed out before we got a response. Your connection may be slow — try again.',
    action: 'Try again',
    retryable: true,
  },
  network: {
    title: "Can't reach the server",
    body: "We couldn't connect. Check your internet connection and try again.",
    action: 'Try again',
    retryable: true,
  },
  validation: {
    title: 'Check your input',
    body: 'Some of the information you entered was rejected. Fix the highlighted fields and resubmit.',
    action: 'Review fields',
    retryable: false,
  },
  auth: {
    title: 'Your session expired',
    body: 'You need to sign in again to continue. Re-trying will not work until you do.',
    action: 'Sign in',
    retryable: false,
  },
  forbidden: {
    title: "You don't have access",
    body: "Your account isn't permitted to do this. Contact an administrator if you think that's wrong.",
    action: 'Go back',
    retryable: false,
  },
  'not-found': {
    title: "We couldn't find that",
    body: 'The item you were looking for no longer exists or was moved.',
    action: 'Go back',
    retryable: false,
  },
  server: {
    title: 'Something broke on our end',
    body: "This isn't your fault — our server hit an error. We've been notified. Try again in a moment.",
    action: 'Try again',
    retryable: true,
  },
  unknown: {
    title: 'Something went wrong',
    body: "An unexpected error occurred. If it keeps happening, contact support.",
    action: 'Try again',
    retryable: true,
  },
}

/** Convenience: go straight from a caught value to the copy to display. */
export async function copyForError(input: unknown): Promise<{ category: ErrorCategory; copy: ErrorCopy }> {
  const category = classify(await normalizeError(input))
  return { category, copy: COPY[category] }
}

// ── React usage example ──────────────────────────────
// A small hook that turns any caught value into a renderable error state, plus
// the component that renders it. Note the upload handler NEVER hardcodes
// "try a different file" — the copy is whatever the CATEGORY dictates.

interface ErrorState {
  category: ErrorCategory
  copy: ErrorCopy
}

function useCategorizedError() {
  const [errorState, setErrorState] = useState<ErrorState | null>(null)

  const capture = useCallback(async (input: unknown) => {
    setErrorState(await copyForError(input))
  }, [])

  const clear = useCallback(() => setErrorState(null), [])

  return { errorState, capture, clear }
}

export function UploadPanel({ uploadFile }: { uploadFile: (file: File) => Promise<void> }) {
  const { errorState, capture, clear } = useCategorizedError()
  const [busy, setBusy] = useState(false)

  async function handleUpload(file: File) {
    setBusy(true)
    clear()
    try {
      await uploadFile(file)
    } catch (err) {
      // Categorize first. A 402 quota error here renders the quota copy, never
      // the validation "try a different file" copy. (#343 F8)
      await capture(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        type="file"
        disabled={busy}
        aria-label="Choose a file to upload"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
        }}
      />

      {errorState && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">{errorState.copy.title}</p>
          <p className="mt-1 text-sm text-red-600">{errorState.copy.body}</p>
          {errorState.copy.retryable && (
            <button
              onClick={clear}
              className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-800"
            >
              {errorState.copy.action}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
