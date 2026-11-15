'use client'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { StepProgress } from '@/components/ui/Onboarding'

const STEPS = ['selfie', 'profile', 'items'] as const
const BACK: Record<(typeof STEPS)[number], string | null> = {
  selfie: null,
  profile: '/onboarding/selfie',
  items: '/onboarding/profile',
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const index = Math.max(0, STEPS.findIndex((s) => pathname.endsWith(`/${s}`)))
  const back = BACK[STEPS[index]]

  async function handleBack() {
    if (back) {
      router.push(back)
      return
    }
    // Step 1 has no earlier step: go back to the start screen, signed out.
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen flex-col lg:items-center">
      <div className="w-full bg-ink text-on-dark on-dark">
        <div className="mx-auto w-full max-w-[1120px] px-6 pt-4 lg:px-10">
          <button
            type="button"
            onClick={handleBack}
            className="-ml-3 mb-2 flex h-11 min-w-11 items-center gap-2 px-3 font-display text-[15px] font-bold uppercase tracking-[1px]"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
          <StepProgress step={index + 1} />
        </div>
      </div>
      <div className="w-full flex-1">{children}</div>
    </div>
  )
}
