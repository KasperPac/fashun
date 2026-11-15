'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      returnFocus.current = document.activeElement as HTMLElement | null
      el.showModal()
    }
    if (!open && el.open) {
      el.close()
      returnFocus.current?.focus()
    }
  }, [open])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handle = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    el.addEventListener('cancel', handle)
    return () => el.removeEventListener('cancel', handle)
  }, [onClose])
  return ref
}

/** Bottom sheet on phone; centred 440px dialog on desktop. Closes on Escape or backdrop. */
export function BottomSheet({
  open,
  title,
  onClose,
  side = false,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  /** On desktop, dock to the right as a 400px panel instead of a centred dialog. */
  side?: boolean
  children: ReactNode
}) {
  const ref = useDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={`m-0 mt-auto max-h-[90vh] w-full max-w-none overflow-y-auto border-0 border-t-2 border-ink bg-card p-0 text-ink backdrop:bg-ink/60 ${
        side
          ? 'lg:m-0 lg:ml-auto lg:h-full lg:max-h-none lg:w-[400px] lg:border-0 lg:border-l-2'
          : 'lg:m-auto lg:w-[440px] lg:border-2'
      }`}
    >
      {open && (
        <div className="animate-sheet-up p-6">
          <div aria-hidden="true" className="mx-auto mb-4 h-1 w-12 bg-ink lg:hidden" />
          <div className="mb-4 flex items-start justify-between gap-2">
            <h2 className="font-display text-[31px] font-extrabold uppercase leading-[1.05]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-2xl"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** Confirm dialog: Cancel is focused first and sits above the destructive action. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  destructive = true,
  error,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
  destructive?: boolean
  error?: string | null
}) {
  const ref = useDialog(open, onCancel)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="m-auto w-[calc(100%-48px)] max-w-[440px] border-2 border-ink bg-card p-0 text-ink backdrop:bg-ink/60"
    >
      {open && (
        <div className="animate-dialog-in p-6">
          <h2 className="mb-2 font-display text-[31px] font-extrabold uppercase leading-[1.05]">{title}</h2>
          <p className="mb-5 text-[15px] leading-[1.4] text-ink-2">{body}</p>
          {error && (
            <p role="alert" className="mb-3 text-[13px] font-semibold text-danger">
              <span aria-hidden="true">⚠ </span>
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 w-full items-center justify-center border-2 border-ink bg-card font-display text-[15px] font-bold uppercase tracking-[1px]"
            >
              Cancel
            </button>
            <Button
              compact
              variant={destructive ? 'destructive' : 'primary'}
              busy={busy}
              busyLabel={`${confirmLabel}…`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
