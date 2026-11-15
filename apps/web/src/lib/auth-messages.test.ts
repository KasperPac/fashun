import { describe, it, expect } from 'vitest'
import { AUTH_MESSAGES, checkEmailMessage, classifyInviteStatus, classifySignInError } from './auth-messages'

describe('auth messages', () => {
  it('uses the exact copy from the design spec', () => {
    expect(AUTH_MESSAGES.wrongPassword).toBe("That password doesn't match. Try again or reset it.")
    expect(AUTH_MESSAGES.invalidInvite).toBe(
      "That invite code isn't valid. Check it with the person who invited you.",
    )
    expect(AUTH_MESSAGES.offline).toBe("Couldn't reach Fashun. Check your connection and try again.")
    expect(checkEmailMessage('a@b.co')).toBe(
      'Check your email. We sent a link to a@b.co. Open it on this phone to continue.',
    )
  })

  it('classifies sign-in errors', () => {
    expect(classifySignInError({ code: 'invalid_credentials', status: 400 })).toBe('wrong-password')
    expect(classifySignInError({ code: 'email_not_confirmed', status: 400 })).toBe('unconfirmed')
    expect(classifySignInError({ name: 'AuthRetryableFetchError', status: 0 })).toBe('offline')
    expect(classifySignInError({ status: 503 })).toBe('offline')
    expect(classifySignInError({})).toBe('wrong-password')
  })

  it('classifies invite check responses', () => {
    expect(classifyInviteStatus(200)).toBe('ok')
    expect(classifyInviteStatus(400)).toBe('invalid')
    expect(classifyInviteStatus(404)).toBe('invalid')
    expect(classifyInviteStatus(409)).toBe('invalid')
    expect(classifyInviteStatus(500)).toBe('offline')
  })
})
