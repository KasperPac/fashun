'use client'
import { Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { StepProgress } from '@/components/ui/Onboarding'
import { onboardingBackTarget } from '@/lib/onboarding-back'

const STEPS = ['selfie', 'profile', 'items'] as const

/** Back, or nothing when this step has nowhere to go back to. */
function BackButton({ step }: { step: (typeof STEPS)[number] }) {
  const router = useRouter()
  const target = onboardingBackTarget(step, useSearchParams().get('from'))
  if (!target) return <div className="mb-2 h-11" aria-hidden="true" />
  return (
    <button
      type="button"
      onClick={() => router.push(target)}
      className="-ml-3 mb-2 flex h-11 min-w-11 items-center gap-2 px-3 font-display text-[15px] font-bold uppercase tracking-[1px]"
    >
      <span aria-hidden="true">←</span>
      Back
    </button>
  )
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const index = Math.max(0, STEPS.findIndex((s) => pathname.endsWith(`/${s}`)))

  return (
    <div className="flex min-h-screen flex-col lg:items-center">
      <div className="w-full bg-ink text-on-dark on-dark">
        <div className="mx-auto w-full max-w-[1120px] px-6 pt-4 lg:px-10">
          <Suspense fallback={<div className="mb-2 h-11" aria-hidden="true" />}>
            <BackButton step={STEPS[index]} />
          </Suspense>
          <StepProgress step={index + 1} />
        </div>
      </div>
      <div className="w-full flex-1">{children}</div>
    </div>
  )
}
