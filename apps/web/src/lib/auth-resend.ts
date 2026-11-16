export type ResendKind = 'signup' | 'reset'

interface AuthClientLike {
  resend(params: { type: 'signup'; email: string }): Promise<{ error: unknown }>
  resetPasswordForEmail(email: string): Promise<{ error: unknown }>
}

/** Sends the email the user is waiting for again: the sign-up link, or the password reset link. */
export function resendEmail(auth: AuthClientLike, kind: ResendKind, email: string) {
  return kind === 'reset' ? auth.resetPasswordForEmail(email) : auth.resend({ type: 'signup', email })
}
