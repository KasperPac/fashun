'use client'
import { usePathname } from 'next/navigation'

const STEPS = [
  { path: 'skin-tone', label: 'Skin tone' },
  { path: 'style', label: 'Your style' },
  { path: 'budget', label: 'Budget' },
  { path: 'add-items', label: 'Add items' },
]

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentStep = STEPS.findIndex(s => pathname.includes(s.path))
  const stepIndex = currentStep === -1 ? 0 : currentStep
  const progress = ((stepIndex + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="w-full h-1 bg-zinc-900">
        <div
          className="h-full bg-purple-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-black tracking-tight">fashun</span>
        <span className="text-zinc-500 text-sm">
          Step {stepIndex + 1} of {STEPS.length}
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-lg mx-auto w-full">
        {children}
      </div>
    </div>
  )
}
