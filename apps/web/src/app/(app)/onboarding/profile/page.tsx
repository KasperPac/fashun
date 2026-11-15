'use client'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ProfileView from '@/components/profile/ProfileView'
import { Button } from '@/components/ui/Button'

function ProfileStepContent() {
  const router = useRouter()
  const manual = useSearchParams().get('manual') === '1'
  return (
    <main>
      <ProfileView
        headline="reveal"
        manual={manual}
        footer={
          <>
            <Button onClick={() => router.push('/onboarding/items')}>Looks right</Button>
            <p className="text-[13px] text-ink-2">Tap anything that&apos;s wrong to change it.</p>
          </>
        }
      />
    </main>
  )
}

export default function ProfileStep() {
  return (
    <Suspense fallback={null}>
      <ProfileStepContent />
    </Suspense>
  )
}
