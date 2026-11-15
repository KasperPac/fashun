'use client'
import { usePathname, useRouter } from 'next/navigation'
import { StepProgress } from '@/components/ui/Onboarding'
import { onboardingBackTarget } from '@/lib/onboarding-back'

const STEPS = ['selfie', 'profile', 'items'] as const

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const index = Math.max(0, STEPS.findIndex((s) => pathname.endsWith(`/${s}`)))

  function handleBack() {
    const from = new URLSearchParams(window.location.search).get('from')
    router.push(onboardingBackTarget(STEPS[index], from))
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
