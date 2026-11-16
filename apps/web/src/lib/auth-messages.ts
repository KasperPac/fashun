export const AUTH_MESSAGES = {
  wrongPassword: "That password doesn't match. Try again or reset it.",
  invalidInvite: "That invite code isn't valid. Check it with the person who invited you.",
  offline: "Couldn't reach Fashun. Check your connection and try again.",
  invalidEmail: 'Enter a valid email address.',
  passwordTooShort: 'Use at least 8 characters.',
  inviteMissing: 'Enter your invite code.',
  signUpFailed: "We couldn't create your account. Check your details and try again.",
} as const

export function checkEmailMessage(email: string): string {
  return `Check your email. We sent a link to ${email}. Open it on this phone to continue.`
}

export type SignInFailure = 'wrong-password' | 'unconfirmed' | 'offline'

interface AuthErrorLike {
  code?: string
  name?: string
  status?: number
}

/** Maps a Supabase sign-in error to one of the three cases the start screen words. */
export function classifySignInError(error: AuthErrorLike): SignInFailure {
  if (error.code === 'email_not_confirmed') return 'unconfirmed'
  if (error.code === 'invalid_credentials') return 'wrong-password'
  const unreachable =
    error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status ?? 0) >= 500
  return unreachable ? 'offline' : 'wrong-password'
}

/** An invite check fails as "not valid" for unknown/used codes, and as "offline" for server trouble. */
export function classifyInviteStatus(status: number): 'ok' | 'invalid' | 'offline' {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 400 || status === 404 || status === 409) return 'invalid'
  return 'offline'
}
