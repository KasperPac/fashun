'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate invite code first
    const inviteRes = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode }),
    })
    if (!inviteRes.ok) {
      const { error: msg } = await inviteRes.json()
      setError(msg)
      setLoading(false)
      return
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    // If session is null, Supabase sent a confirmation email — tell the user
    if (!signupData.session) {
      router.push('/signup/confirm')
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">fashun</h1>
        <p className="text-zinc-500 mb-8 text-sm">You need an invite to join.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Invite code"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-zinc-600 text-sm mt-4 text-center">
          Already have an account?{' '}
          <a href="/login" className="text-purple-400 hover:underline">Log in</a>
        </p>
      </div>
    </div>
  )
}
