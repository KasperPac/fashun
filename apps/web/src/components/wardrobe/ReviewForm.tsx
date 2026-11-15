'use client'
import { useState } from 'react'
import { OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag, WardrobeCategory } from '@fashun/shared'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ColourSwatch } from '@/components/ui/ColourSwatch'
import { TextField } from '@/components/ui/TextField'
import { BottomSheet } from '@/components/ui/Overlays'
import { colourName, searchColours } from '@/lib/colour-names'
import {
  addColour,
  removeColour,
  suggestedLine,
  toggleOccasion,
  validateReview,
  type ReviewErrors,
  type ReviewValues,
} from '@/lib/item-form'
import { CATEGORIES, CATEGORY_LABELS, isDarkOccasion, occasionColour, paletteLine } from '@/lib/wardrobe-view'

function ColourPickerSheet({ open, onPick, onClose }: { open: boolean; onPick: (hex: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const results = searchColours(query)
  return (
    <BottomSheet open={open} title="Add colour" onClose={onClose}>
      <TextField
        label="Search colours"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. navy"
        autoComplete="off"
      />
      <ul className="mt-3 max-h-[50vh] overflow-y-auto border-t-[1.5px] border-ink">
        {results.map((c) => (
          <li key={c.name}>
            <button
              type="button"
              onClick={() => { onPick(c.hex); setQuery(''); onClose() }}
              className="flex min-h-12 w-full items-center gap-3 border-b-[1.5px] border-ink px-1 text-left text-base font-medium"
            >
              <ColourSwatch hex={c.hex} size={24} />
              {c.name}
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="py-3 text-[15px] text-ink-2">No colour with that name.</li>}
      </ul>
    </BottomSheet>
  )
}

export interface ReviewFormProps {
  mode: 'add' | 'edit'
  initial: ReviewValues
  photoUrl: string | null
  /** Occasions the AI suggested, shown under the occasion choices. */
  suggested?: OccasionTag[]
  season: ColourSeason | null
  /** Label for the back action: "Retake", "Back". Omit for none (Edit has a Back button on its sheet). */
  backLabel?: string
  onBack?: () => void
  /** Shown only for a photo that can be replaced. */
  onChangePhoto?: () => void
  /** Notice or other content shown above the form fields. */
  intro?: React.ReactNode
  /** Resolves true when saved. For "Save and add another" the parent resets the form. */
  onSave: (values: ReviewValues, andAnother: boolean) => Promise<boolean>
  saveError?: string | null
}

/** The "Check the details" form used after reading a photo or link, when adding by hand, and to edit a piece. */
export default function ReviewForm({
  mode,
  initial,
  photoUrl,
  suggested = [],
  season,
  backLabel,
  onBack,
  onChangePhoto,
  intro,
  onSave,
  saveError,
}: ReviewFormProps) {
  const [name, setName] = useState(initial.name)
  const [category, setCategory] = useState<WardrobeCategory>(initial.category)
  const [colours, setColours] = useState(initial.colours)
  const [occasions, setOccasions] = useState(initial.occasions)
  const [errors, setErrors] = useState<ReviewErrors>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState<'save' | 'another' | null>(null)

  async function submit(andAnother: boolean) {
    const values: ReviewValues = { name: name.trim(), category, colours, occasions }
    const found = validateReview(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setBusy(andAnother ? 'another' : 'save')
    await onSave(values, andAnother)
    setBusy(null)
  }

  const palette = paletteLine(colours, season)
  const suggestion = suggestedLine(suggested, OCCASION_LABELS)

  return (
    <>
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); void submit(false) }}
      className="flex flex-col gap-6"
    >
      {mode === 'add' && (
        <div>
          <h2 className="font-display text-[36px] font-extrabold uppercase leading-none">Check the details</h2>
          <p className="mt-2 text-base text-ink-2">We filled these in. Fix anything that&apos;s wrong.</p>
        </div>
      )}
      {intro}

      <div className="flex flex-col items-start gap-2">
        <div className="flex h-52 w-40 items-center justify-center border-[1.5px] border-ink bg-tile">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name.trim() || 'Your piece'} className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-[13px] text-ink-2">No photo</span>
          )}
        </div>
        {onChangePhoto && <Button variant="text" fullWidth={false} onClick={onChangePhoto}>Change photo</Button>}
      </div>

      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        autoComplete="off"
      />

      <fieldset>
        <legend className="mb-2 font-display text-[13px] font-bold uppercase tracking-[1.5px]">Category</legend>
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} role="radio" selected={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-[13px] font-bold uppercase tracking-[1.5px]">Colours</legend>
        <ul className="flex flex-wrap gap-2">
          {colours.map((hex) => {
            const label = colourName(hex)
            return (
              <li key={hex} className="inline-flex h-11 items-center gap-2 border border-ink bg-card pl-2 font-display text-[13px] font-bold uppercase tracking-[1px]">
                <ColourSwatch hex={hex} size={24} />
                {label}
                <button
                  type="button"
                  aria-label={`Remove ${label.toLowerCase()}`}
                  onClick={() => setColours((c) => removeColour(c, hex))}
                  className="flex h-11 w-11 items-center justify-center text-lg"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            )
          })}
          <li>
            <Chip variant="add" onClick={() => setPickerOpen(true)}>+ Add colour</Chip>
          </li>
        </ul>
        {errors.colours && (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{errors.colours}</p>
        )}
        {palette && <p className="mt-3 text-[15px] font-semibold">{palette}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-[13px] font-bold uppercase tracking-[1.5px]">Occasions</legend>
        <div role="group" aria-label="Occasions" className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => (
            <Chip
              key={o}
              role="checkbox"
              selected={occasions.includes(o)}
              selectedFill={occasionColour(o)}
              selectedOnDark={isDarkOccasion(o)}
              onClick={() => setOccasions((cur) => toggleOccasion(cur, o))}
            >
              {OCCASION_LABELS[o]}
            </Chip>
          ))}
        </div>
        {suggestion && <p className="mt-2 text-[13px] text-ink-2">{suggestion}</p>}
        {errors.occasions && (
          <p role="alert" className="mt-2 text-[13px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{errors.occasions}</p>
        )}
      </fieldset>

      {saveError && (
        <p role="alert" className="text-[15px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{saveError}</p>
      )}

      <div className="flex flex-col gap-3">
        <Button type="submit" busy={busy === 'save'} busyLabel="Saving…" disabled={busy === 'another'}>
          {mode === 'edit' ? 'Save changes' : 'Save'}
        </Button>
        {mode === 'add' && (
          <Button
            variant="secondary"
            busy={busy === 'another'}
            busyLabel="Saving…"
            disabled={busy === 'save'}
            onClick={() => void submit(true)}
          >
            Save and add another
          </Button>
        )}
        {onBack && backLabel && <Button variant="text" onClick={onBack}>{backLabel}</Button>}
      </div>

    </form>
    <ColourPickerSheet
      open={pickerOpen}
      onPick={(hex) => setColours((c) => addColour(c, hex))}
      onClose={() => setPickerOpen(false)}
    />
    </>
  )
}
