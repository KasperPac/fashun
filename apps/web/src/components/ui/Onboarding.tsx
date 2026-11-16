import type { ReactNode } from 'react'

/** "Step 1 of 3" kicker plus three 6px segments. Lives on the ink house block. */
export function StepProgress({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div>
      <p className="font-display text-[13px] font-bold uppercase tracking-[2px] text-signal">
        Step {step} of {total}
      </p>
      <div aria-hidden="true" className="mt-2 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 ${i < step ? 'bg-signal' : 'bg-step-todo'}`} />
        ))}
      </div>
    </div>
  )
}

/** 224px white circle, 2px ink, dashed face guide. Rotates slowly while reading. */
export function SelfieFrame({
  previewUrl,
  reading = false,
}: {
  previewUrl?: string | null
  reading?: boolean
}) {
  return (
    <div className="relative mx-auto h-56 w-56 overflow-hidden rounded-full border-2 border-ink bg-card">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Your selfie" className="h-full w-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-6 rounded-full border-[1.5px] border-dashed border-ink"
        />
      )}
      {reading && (
        <span
          aria-hidden="true"
          className="absolute inset-2 animate-scan rounded-full border-[3px] border-dashed border-signal"
        />
      )}
    </div>
  )
}

/** Full-width block coloured by the nearest data-occasion theme. Pass the theme so dark blocks get the yellow focus ring. */
export function ScreenBlock({ children, theme }: { children: ReactNode; theme?: string }) {
  const dark = theme === 'formal' || theme === 'house'
  return (
    <div className={`${dark ? 'on-dark ' : ''}bg-(--block) px-6 pb-8 pt-10 text-(--on-block) lg:px-10`}>
      {children}
    </div>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-[15px] font-bold uppercase tracking-[2px] text-(--kicker)">{children}</p>
  )
}
