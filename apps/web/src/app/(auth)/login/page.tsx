'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
  AUTH_MESSAGES,
  checkEmailMessage,
  classifyInviteStatus,
  classifySignInError,
} from '@/lib/auth-messages'
import { resendEmail, type ResendKind } from '@/lib/auth-resend'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Kicker } from '@/components/ui/Onboarding'

type Stage = 'email' | 'password' | 'create' | 'check-email'

const RESEND_SECONDS = 30
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function StartPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; invite?: string; form?: string }>({})
  const [resendIn, setResendIn] = useState(0)
  const [sentNote, setSentNote] = useState('')
  const [resendKind, setResendKind] = useState<ResendKind>('signup')

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  function showCheckEmail(note: string, kind: ResendKind = 'signup') {
    setSentNote(note)
    setResendKind(kind)
    setStage('check-email')
    setResendIn(RESEND_SECONDS)
  }

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(clean)) {
      setErrors({ email: AUTH_MESSAGES.invalidEmail })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const res = await fetch('/api/auth/email-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      })
      if (!res.ok) throw new Error('email-status failed')
      const { known } = (await res.json()) as { known: boolean }
      setEmail(clean)
      setStage(known ? 'password' : 'create')
    } catch {
      setErrors({ form: AUTH_MESSAGES.offline })
    } finally {
      setBusy(false)
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setErrors({})
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const kind = classifySignInError(error)
        if (kind === 'unconfirmed') showCheckEmail(checkEmailMessage(email))
        else if (kind === 'offline') setErrors({ form: AUTH_MESSAGES.offline })
        else setErrors({ password: AUTH_MESSAGES.wrongPassword })
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setErrors({ form: AUTH_MESSAGES.offline })
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!inviteCode.trim()) next.invite = AUTH_MESSAGES.inviteMissing
    if (password.length < 8) next.password = AUTH_MESSAGES.passwordTooShort
    if (next.invite || next.password) {
      setErrors(next)
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const inviteRes = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() }),
      })
      const inviteResult = classifyInviteStatus(inviteRes.status)
      if (inviteResult === 'invalid') {
        setErrors({ invite: AUTH_MESSAGES.invalidInvite })
        return
      }
      if (inviteResult === 'offline') {
        setErrors({ form: AUTH_MESSAGES.offline })
        return
      }
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setErrors({ form: classifySignInError(error) === 'offline' ? AUTH_MESSAGES.offline : AUTH_MESSAGES.signUpFailed })
        return
      }
      if (!data.session) {
        showCheckEmail(checkEmailMessage(email))
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setErrors({ form: AUTH_MESSAGES.offline })
    } finally {
      setBusy(false)
    }
  }

  async function handleForgot() {
    setBusy(true)
    setErrors({})
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      showCheckEmail(checkEmailMessage(email), 'reset')
    } catch {
      setErrors({ form: AUTH_MESSAGES.offline })
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setBusy(true)
    setErrors({})
    try {
      const { error } = await resendEmail(supabase.auth, resendKind, email)
      if (error) throw error
      setResendIn(RESEND_SECONDS)
    } catch {
      setErrors({ form: AUTH_MESSAGES.offline })
    } finally {
      setBusy(false)
    }
  }

  function changeEmail() {
    setStage('email')
    setPassword('')
    setInviteCode('')
    setErrors({})
  }

  const emailAccepted = stage !== 'email'

  return (
    <main className="flex min-h-screen flex-col lg:items-center lg:justify-center lg:bg-page lg:py-10">
      <div className="flex w-full flex-1 flex-col lg:w-[400px] lg:flex-none lg:border-2 lg:border-ink lg:bg-card">
        <div data-occasion="house" className="bg-(--block) px-6 pb-8 pt-12 text-(--on-block)">
          <Kicker>Invite only</Kicker>
          <h1 className="mt-3 font-display text-[76px] font-extrabold uppercase leading-[0.9] tracking-[-1px]">
            Fashun
          </h1>
          <p className="mt-4 text-base leading-[1.4] text-(--on-block-2)">
            Outfits from the clothes you already own.
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-5 px-6 py-8">
          {stage === 'check-email' ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-base leading-[1.4]">{sentNote}</p>
              <Button
                variant="secondary"
                disabled={resendIn > 0}
                busy={busy}
                busyLabel="Sending…"
                onClick={handleResend}
              >
                {resendIn > 0 ? `Resend email (${resendIn}s)` : 'Resend email'}
              </Button>
              <Button variant="text" fullWidth={false} onClick={changeEmail}>Change</Button>
              {errors.form && <FormError>{errors.form}</FormError>}
            </div>
          ) : (
            <form
              onSubmit={stage === 'email' ? handleContinue : stage === 'password' ? handleSignIn : handleCreate}
              className="flex flex-col gap-5"
              noValidate
            >
              {emailAccepted ? (
                <div>
                  <p className="font-display text-[13px] font-bold uppercase tracking-[1.5px]">Email</p>
                  <div className="flex min-h-12 items-center justify-between gap-2 border-[1.5px] border-ink bg-card pl-3">
                    <span className="min-w-0 break-all text-base font-medium">{email}</span>
                    <Button variant="text" fullWidth={false} onClick={changeEmail}>Change</Button>
                  </div>
                </div>
              ) : (
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={errors.email}
                />
              )}

              {stage === 'password' && (
                <>
                  <TextField
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={errors.password}
                    trailing={<ShowHide shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                  />
                  <Button variant="text" fullWidth={false} onClick={handleForgot} className="self-start">
                    Forgot password?
                  </Button>
                </>
              )}

              {stage === 'create' && (
                <>
                  <p className="text-[15px] text-ink-2">New here? Enter your invite code.</p>
                  <TextField
                    label="Invite code"
                    type="text"
                    placeholder="e.g. FSH-4821"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoFocus
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    error={errors.invite}
                  />
                  <TextField
                    label="Create a password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={errors.password}
                    trailing={<ShowHide shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                  />
                </>
              )}

              {errors.form && <FormError>{errors.form}</FormError>}

              <Button
                type="submit"
                busy={busy}
                busyLabel={stage === 'email' ? 'Checking…' : stage === 'password' ? 'Signing in…' : 'Creating account…'}
              >
                {stage === 'email' ? 'Continue' : stage === 'password' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          )}

          <p className="text-[13px] text-ink-2">Fashun is invite-only for now.</p>
        </div>
      </div>
    </main>
  )
}

function ShowHide({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      className="h-11 min-w-11 px-2 font-sans text-[15px] font-semibold underline decoration-[1.5px] underline-offset-4"
    >
      {shown ? 'Hide' : 'Show'}
    </button>
  )
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-[13px] font-semibold text-danger">
      <span aria-hidden="true">⚠ </span>
      {children}
    </p>
  )
}
