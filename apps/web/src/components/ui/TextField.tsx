'use client'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string
  hint?: string
  /** Trailing action, e.g. "Show" or "Change". Rendered inside the box. */
  trailing?: ReactNode
  /** Label colour when the field sits on the ink block. */
  onDark?: boolean
}

export function TextField({ label, error, hint, trailing, onDark = false, className = '', ...rest }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const described = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={`mb-1 block font-display text-[13px] font-bold uppercase tracking-[1.5px] ${
          onDark ? 'text-on-dark-2' : 'text-ink'
        }`}
      >
        {label}
      </label>
      <div
        className={`flex h-12 items-center bg-card ${
          error ? 'border-2 border-danger' : 'border-[1.5px] border-ink'
        }`}
      >
        <input
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-sans text-base font-medium text-ink placeholder:text-ink-2 focus-visible:outline-offset-4"
        />
        {trailing && <div className="flex h-full items-center pr-1">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className={`mt-1 text-[13px] ${onDark ? 'text-on-dark-2' : 'text-ink-2'}`}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 bg-card px-1 text-[13px] font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  )
}
