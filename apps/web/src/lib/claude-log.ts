/**
 * Safe failure logging for the Claude call sites. Logs a short reason only:
 * never the image, the model's text, or anything about the user.
 */

import { APIConnectionError, APIConnectionTimeoutError } from '@anthropic-ai/sdk/error'

const SAFE_TOKEN = /^[a-z0-9_.-]{1,60}$/i

function safeToken(value: unknown): string | null {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : null
}

/** "anthropic 401 authentication_error" for SDK API errors, connection errors and timeouts by fixed names, otherwise the error name. */
export function describeClaudeError(err: unknown): string {
  // Fixed strings chosen by instanceof: bundlers rename or drop class names, so names can't be relied on.
  // The timeout class extends the connection class, so it is checked first.
  if (err instanceof APIConnectionTimeoutError) return 'error APIConnectionTimeoutError'
  if (err instanceof APIConnectionError) return 'error APIConnectionError'
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: unknown; error?: unknown; name?: unknown }
    if (typeof e.status === 'number') {
      const body = e.error as { error?: { type?: unknown } } | undefined
      const type = safeToken(body?.error?.type)
      return type ? `anthropic ${e.status} ${type}` : `anthropic ${e.status}`
    }
    const name = safeToken(e.name)
    if (name) return `error ${name}`
  }
  return 'error unknown'
}

/** Logs `<scope>: <reason>` as one line. */
export function logClaudeFailure(scope: string, reason: string): void {
  console.error(`${scope}: ${reason}`)
}

/** Logs `<scope>: <describeClaudeError(err)>`. */
export function logClaudeError(scope: string, err: unknown): void {
  logClaudeFailure(scope, describeClaudeError(err))
}
