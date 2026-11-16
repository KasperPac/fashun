import type { ButtonHTMLAttributes } from 'react'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  /** 'add' draws the dashed "empty slot" border. */
  variant?: 'default' | 'add'
  /** Fill for the selected state, e.g. an occasion colour. Defaults to ink. */
  selectedFill?: string
  /** Use white text on the selected fill (for the Formal colour). */
  selectedOnDark?: boolean
  role?: 'radio' | 'checkbox' | 'button'
}

export function Chip({
  selected = false,
  variant = 'default',
  selectedFill,
  selectedOnDark = false,
  role = 'button',
  className = '',
  children,
  style,
  ...rest
}: ChipProps) {
  const checked = role === 'button' ? undefined : selected
  const border =
    variant === 'add'
      ? 'border-[1.5px] border-dashed border-ink bg-card text-ink'
      : selected
        ? `border-[2.5px] border-ink ${selectedFill ? (selectedOnDark ? 'text-on-dark' : 'text-ink') : 'bg-ink text-on-dark'}`
        : 'border border-ink bg-card text-ink'
  return (
    <button
      type="button"
      {...rest}
      role={role}
      aria-checked={checked}
      aria-pressed={role === 'button' && variant !== 'add' ? selected : undefined}
      style={selected && selectedFill ? { backgroundColor: selectedFill, ...style } : style}
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-none px-3 font-display text-[13px] font-bold uppercase tracking-[1px] ${border} ${className}`}
    >
      {selected && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  )
}
