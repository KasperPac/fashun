'use client'
import { useRouter } from 'next/navigation'
import ProfileView from '@/components/profile/ProfileView'
import { Button } from '@/components/ui/Button'

export default function ProfileStep() {
  const router = useRouter()
  return (
    <main>
      <ProfileView
        headline="reveal"
        footer={
          <div className="flex max-w-[480px] flex-col gap-3">
            <Button onClick={() => router.push('/onboarding/items')}>Looks right</Button>
            <p className="text-[13px] text-ink-2">Tap anything that&apos;s wrong to change it.</p>
          </div>
        }
      />
    </main>
  )
}
