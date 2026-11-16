'use client'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Button } from './Button'
import { useAnnounce } from './Announcer'

/** Signal-yellow banner, announced through the shared status region, with a 44px dismiss button. */
export function Banner({ children, onDismiss }: { children: string; onDismiss?: () => void }) {
  const announce = useAnnounce()
  useEffect(() => { announce(children) }, [children, announce])
  return (
    <div className="flex items-center gap-2 border-[1.5px] border-ink bg-signal pl-3 text-ink">
      <p className="flex-1 py-2 font-sans text-[15px] font-semibold">{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-11 w-11 shrink-0 items-center justify-center text-xl"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  )
}

/** White card, 2px ink, 8px signal bar on the left. */
export function Notice({
  title,
  children,
  role,
  focusTitle = false,
}: {
  title: string
  children?: ReactNode
  role?: 'alert' | 'status'
  /** Move keyboard focus to the title when the notice appears, for notices that replace what the user was on. */
  focusTitle?: boolean
}) {
  const titleRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus()
  }, [focusTitle])
  return (
    <div role={role} className="flex border-2 border-ink bg-card">
      <span aria-hidden="true" className="w-2 shrink-0 bg-signal" />
      <div className="p-3">
        <p ref={titleRef} tabIndex={focusTitle ? -1 : undefined} className="font-display text-[22px] font-extrabold uppercase leading-tight">{title}</p>
        {children && <div className="mt-1 text-[15px] text-ink-2">{children}</div>}
      </div>
    </div>
  )
}

/** Ink toast above the nav, announced through the shared status region, gone after 4 seconds. */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const announce = useAnnounce()
  useEffect(() => { announce(message) }, [message, announce])
  useEffect(() => {
    const timer = setTimeout(onDone, 4000)
    return () => clearTimeout(timer)
  }, [message, onDone])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-6 lg:bottom-8 lg:pl-[240px]">
      <p
        className="animate-fade-in bg-ink px-4 py-3 font-sans text-[15px] font-semibold text-on-dark"
      >
        {message}
      </p>
    </div>
  )
}

/** Dashed tile as the picture, title, body and one primary action. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div aria-hidden="true" className="h-28 w-full border-[1.5px] border-dashed border-ink bg-tile" />
      <h2 className="font-display text-[31px] font-extrabold uppercase leading-[1.05]">{title}</h2>
      {children && <p className="text-[15px] leading-[1.4] text-ink-2">{children}</p>}
      {action}
    </div>
  )
}

/** Error with retry, used for "Couldn't load …" states. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p className="text-[15px] font-semibold">{message}</p>
      <Button onClick={onRetry} fullWidth={false}>Try again</Button>
    </div>
  )
}

/** Skeleton-grey block. Decorative; pair with an aria-live loading line. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse-skeleton bg-skeleton ${className}`} />
}
