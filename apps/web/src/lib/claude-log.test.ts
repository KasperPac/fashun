import { describe, it, expect, vi, afterEach } from 'vitest'
import { describeClaudeError, logClaudeError } from './claude-log'

class FakeApiError extends Error {
  constructor(public status: number, public error: unknown) { super('secret message text') }
}

describe('describeClaudeError', () => {
  it('gives status and error type for SDK API errors', () => {
    const err = new FakeApiError(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key sk-ant-xyz' } })
    expect(describeClaudeError(err)).toBe('anthropic 401 authentication_error')
  })
  it('gives only the status when there is no type', () => {
    expect(describeClaudeError(new FakeApiError(529, undefined))).toBe('anthropic 529')
  })
  it('ignores an unsafe type value', () => {
    expect(describeClaudeError(new FakeApiError(400, { error: { type: 'has spaces and data:image/jpeg;base64,AAAA' } }))).toBe('anthropic 400')
  })
  it('uses the error name for other errors, never the message', () => {
    expect(describeClaudeError(new TypeError('fetch failed for user@example.com'))).toBe('error TypeError')
    expect(describeClaudeError('boom')).toBe('error unknown')
  })
})

describe('logClaudeError', () => {
  afterEach(() => vi.restoreAllMocks())
  it('logs one line with the scope', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logClaudeError('tagger', new FakeApiError(400, { error: { type: 'invalid_request_error' } }))
    expect(spy).toHaveBeenCalledExactlyOnceWith('tagger: anthropic 400 invalid_request_error')
  })
})
