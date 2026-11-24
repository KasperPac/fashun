'use client'
import type { ReactNode } from 'react'
import type { ColourSeason, StylePref } from '@fashun/shared'
import { BottomSheet } from '@/components/ui/Overlays'
import { Button } from '@/components/ui/Button'
import { ColourSwatch } from '@/components/ui/ColourSwatch'
import { SEASON_NAMES } from '@/lib/profile-view'
import {
  SEASON_ORDER,
  STYLE_OPTIONS,
  seasonSampleColours,
  toggleStyle,
  type TraitConfig,
} from '@/lib/profile-edit'

export function SaveError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-3 text-[13px] font-semibold text-danger">
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  )
}

export function OptionRow({
  selected,
  disabled,
  onClick,
  role,
  flush = false,
  children,
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  role: 'radio' | 'checkbox'
  /** No side padding, so the row lines up with a heading above it. */
  flush?: boolean
  children: ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        role={role}
        aria-checked={selected}
        disabled={disabled}
        onClick={onClick}
        className={`flex min-h-12 w-full items-center justify-between gap-3 border-b-[1.5px] border-ink ${flush ? 'px-0' : 'px-1'} py-2 text-left text-base font-medium ${
          selected ? 'font-bold' : ''
        }`}
      >
        <span className="flex min-w-0 flex-col">{children}</span>
        <span aria-hidden="true" className="w-6 shrink-0 text-center text-lg font-bold">{selected ? '✓' : ''}</span>
      </button>
    </li>
  )
}

/** One-tap picker for a single trait. Choosing saves at once. */
export function TraitSheet({
  trait,
  current,
  busy,
  error,
  onPick,
  onClose,
}: {
  trait: TraitConfig | null
  current: string | null
  busy: boolean
  error: string | null
  onPick: (value: string) => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={trait !== null} title={trait?.sheetTitle ?? ''} onClose={onClose}>
      <ul role="radiogroup" aria-label={trait?.sheetTitle} className="border-t-[1.5px] border-ink">
        {trait?.options.map((o) => (
          <OptionRow key={o.value} role="radio" selected={o.value === current} disabled={busy} onClick={() => onPick(o.value)}>
            {o.label}
          </OptionRow>
        ))}
      </ul>
      <SaveError message={error} />
    </BottomSheet>
  )
}

/** Season picker: four options, each with four named swatches. */
export function SeasonSheet({
  open,
  current,
  busy,
  error,
  onPick,
  onClose,
}: {
  open: boolean
  current: ColourSeason | null
  busy: boolean
  error: string | null
  onPick: (season: ColourSeason) => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} title="Season" onClose={onClose}>
      <p className="mb-3 text-[15px] leading-[1.4] text-ink-2">
        Your season decides your best colours and the colours your outfits are built from.
      </p>
      <ul role="radiogroup" aria-label="Season" className="border-t-[1.5px] border-ink">
        {SEASON_ORDER.map((season) => {
          const sample = seasonSampleColours(season)
          return (
            <OptionRow key={season} role="radio" selected={season === current} disabled={busy} onClick={() => onPick(season)}>
              <span className="font-display text-[22px] font-extrabold uppercase">{SEASON_NAMES[season]}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
                {sample.map((c) => (
                  <span key={c.hex} className="inline-flex items-center gap-1">
                    <ColourSwatch hex={c.hex} size={16} />
                    {c.name}
                  </span>
                ))}
              </span>
            </OptionRow>
          )
        })}
      </ul>
      <SaveError message={error} />
    </BottomSheet>
  )
}

/** Multi-select styles, at least one, saved with Done. */
export function StylesSheet({
  open,
  selected,
  busy,
  error,
  onChange,
  onDone,
  onClose,
}: {
  open: boolean
  selected: StylePref[]
  busy: boolean
  error: string | null
  onChange: (next: StylePref[]) => void
  onDone: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} title="Styles that suit you" onClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-2">Pick at least one.</p>
      <ul role="group" aria-label="Styles" className="mb-4 border-t-[1.5px] border-ink">
        {STYLE_OPTIONS.map((o) => (
          <OptionRow
            key={o.value}
            role="checkbox"
            selected={selected.some((s) => s === o.value)}
            disabled={busy}
            onClick={() => onChange(toggleStyle(selected, o.value as StylePref))}
          >
            {o.label}
          </OptionRow>
        ))}
      </ul>
      <Button busy={busy} busyLabel="Saving…" onClick={onDone}>Done</Button>
      <SaveError message={error} />
    </BottomSheet>
  )
}
