import { describe, it, expect, vi } from 'vitest'
import { resendEmail } from './auth-resend'

function fake() {
  return {
    resend: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  }
}

describe('resendEmail', () => {
  it('resends the sign-up email by default kind', async () => {
    const auth = fake()
    await resendEmail(auth, 'signup', 'a@b.co')
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.co' })
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
  it('resends the reset email after "Forgot password?"', async () => {
    const auth = fake()
    await resendEmail(auth, 'reset', 'a@b.co')
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co')
    expect(auth.resend).not.toHaveBeenCalled()
  })
})
