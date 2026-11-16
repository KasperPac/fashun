import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'text'

interface StyleOptions {
  variant?: ButtonVariant
  /** Use on the ink house block or Formal: primary inverts to white fill, ink label. */
  onDark?: boolean
  /** 44px inside dialogs instead of 52px. */
  compact?: boolean
  disabled?: boolean
  fullWidth?: boolean
}

export function buttonClasses({
  variant = 'primary',
  onDark = false,
  compact = false,
  disabled = false,
  fullWidth = true,
}: StyleOptions): string {
  if (variant === 'text') {
    return `inline-flex min-h-11 items-center justify-center font-sans text-[15px] font-semibold underline decoration-[1.5px] underline-offset-4 ${
      onDark ? 'text-on-dark' : 'text-ink'
    }`
  }
  const base = `inline-flex items-center justify-center gap-2 rounded-none px-5 font-display text-[15px] font-bold uppercase tracking-[1px] ${
    compact ? 'h-11' : 'h-13'
  } ${fullWidth ? 'w-full' : ''}`
  if (disabled) {
    return `${base} border-[1.5px] border-dashed border-ink bg-tile text-ink-2`
  }
  switch (variant) {
    case 'secondary':
      return `${base} border-2 border-ink bg-card text-ink`
    case 'destructive':
      return `${base} border-2 border-danger bg-danger text-on-dark`
    default:
      return onDark
        ? `${base} border-2 border-on-dark bg-on-dark text-ink`
        : `${base} border-2 border-ink bg-ink text-on-dark`
  }
}

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>,
    StyleOptions {
  busy?: boolean
  /** Label shown while busy, e.g. "Saving…". */
  busyLabel?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  onDark,
  compact,
  fullWidth,
  disabled = false,
  busy = false,
  busyLabel,
  children,
  className = '',
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const inactive = disabled || busy
  return (
    <button
      {...rest}
      type={type}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      onClick={inactive ? (e) => e.preventDefault() : onClick}
      className={`${buttonClasses({ variant, onDark, compact, fullWidth, disabled })} ${className}`}
    >
      {busy && <Spinner />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  )
}

export function ButtonLink({
  href,
  children,
  className = '',
  ...style
}: StyleOptions & { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`${buttonClasses(style)} ${className}`}>
      {children}
    </Link>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-scan rounded-full border-2 border-current border-t-transparent"
    />
  )
}
