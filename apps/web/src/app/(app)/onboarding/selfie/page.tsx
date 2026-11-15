'use client'
import { useEffect, useRef, useState } from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { onboardingHref, showOnboardingSignOut } from '@/lib/onboarding-back'
import { photoToJpegBase64 } from '@/lib/image-resize'
import { Button } from '@/components/ui/Button'
import { SelfieFrame } from '@/components/ui/Onboarding'

type Phase = 'idle' | 'preview' | 'reading' | 'failed'

/** The way out for a new user, since Back doesn't sign anyone out. Not shown when they came from Profile. */
function SignOutButton({ reading }: { reading: boolean }) {
  const router = useRouter()
  const from = useSearchParams().get('from')
  const [failed, setFailed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  if (reading || !showOnboardingSignOut(from)) return null

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setFailed(false)
    const { error } = await supabase.auth.signOut()
    if (error) {
      setFailed(true)
      setSigningOut(false)
      return
    }
    router.push('/login')
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="text" fullWidth={false} busy={signingOut} busyLabel="Signing out…" onClick={signOut}>Sign out</Button>
      {failed && <p role="alert" className="text-[15px] font-semibold">Couldn&apos;t sign you out. Try again.</p>}
    </div>
  )
}

function SelfieContent() {
  const router = useRouter()
  const from = useSearchParams().get('from')
  const takeRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setPhase('preview')
  }

  function reset() {
    setFile(null)
    setPreviewUrl(null)
    setPhase('idle')
  }

  async function readColours() {
    if (!file) return
    setPhase('reading')
    try {
      const imageBase64 = await photoToJpegBase64(file)
      const res = await fetch('/api/onboarding/skin-tone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })
      if (!res.ok) throw new Error('could not read')
      router.push(onboardingHref('/onboarding/profile', from))
    } catch {
      setPhase('failed')
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-6 py-8">
      <h1 className="font-display text-[44px] font-extrabold uppercase leading-none">Let&apos;s find your colours</h1>
      <p className="text-base leading-[1.4]">
        Take a selfie in daylight, facing a window if you can. Your selfie is read once and then deleted. Only the
        results are saved.
      </p>

      <SelfieFrame previewUrl={previewUrl} reading={phase === 'reading'} />

      <input ref={takeRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handlePicked} />
      <input ref={chooseRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handlePicked} />

      {phase === 'idle' && (
        <div className="flex flex-col gap-3">
          <Button onClick={() => takeRef.current?.click()}>Take a selfie</Button>
          <Button variant="secondary" onClick={() => chooseRef.current?.click()}>Choose a photo</Button>
        </div>
      )}

      {phase === 'preview' && (
        <div className="flex flex-col gap-3">
          <Button onClick={readColours}>Use this photo</Button>
          <Button variant="secondary" onClick={reset}>Retake</Button>
        </div>
      )}

      <p role="status" aria-live="polite" className={phase === 'reading' ? 'text-center text-base font-semibold' : 'sr-only'}>
        {phase === 'reading' ? 'Reading your colours…' : ''}
      </p>

      {phase === 'failed' && (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-base font-semibold">
            We couldn&apos;t read your colours from that photo. Try again in daylight with your face filling most of the frame.
          </p>
          <Button onClick={reset}>Try again</Button>
          <Button variant="text" onClick={() => router.push(onboardingHref('/onboarding/profile', from, 'manual=1'))}>
            Enter my details by hand
          </Button>
        </div>
      )}

      <Suspense fallback={null}>
        <SignOutButton reading={phase === 'reading'} />
      </Suspense>
    </main>
  )
}

export default function SelfieStep() {
  return (
    <Suspense fallback={null}>
      <SelfieContent />
    </Suspense>
  )
}
