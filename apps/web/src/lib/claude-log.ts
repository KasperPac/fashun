/**
 * Safe failure logging for the Claude call sites. Logs a short reason only:
 * never the image, the model's text, or anything about the user.
 */

const SAFE_TOKEN = /^[a-z0-9_.-]{1,60}$/i

function safeToken(value: unknown): string | null {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : null
}

/** "anthropic 401 authentication_error" for SDK API errors, otherwise just the error class name. */
export function describeClaudeError(err: unknown): string {
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
