'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import { ButtonLink, Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, ErrorState, Skeleton, Toast } from '@/components/ui/Feedback'
import { useSavedOutfits } from '@/components/outfits/useSavedOutfits'
import { filterSaved, noSavedMessage, savedCountLabel, savedOn, type SavedFilter, type SavedOutfit } from '@/lib/saved-outfits'
import { sortPieces } from '@/lib/style-me'
import { CATEGORY_LABELS, isDarkOccasion, occasionColour } from '@/lib/wardrobe-view'
import type { WardrobeCategory } from '@fashun/shared'
import CategoryIcon from '@/components/wardrobe/CategoryIcon'

function Row({ outfit }: { outfit: SavedOutfit }) {
  const thumbs = sortPieces(outfit.pieces).slice(0, 4)
  return (
    <li>
      <Link href={`/saved/${outfit.id}`} className="flex min-h-[72px] items-center gap-3 border-[1.5px] border-ink bg-card p-3">
        <span aria-hidden="true" className="flex shrink-0 gap-1">
          {thumbs.map((p, i) => (
            <span key={`${p.itemId ?? p.label}-${i}`} className="flex h-12 w-10 items-center justify-center overflow-hidden border border-ink bg-tile">
              {p.imageUrl && !p.removed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-ink-2">
                  {p.category && p.category in CATEGORY_LABELS ? <CategoryIcon category={p.category as WardrobeCategory} /> : '·'}
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[22px] font-extrabold uppercase leading-tight">{outfit.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
            {outfit.occasion && (
              <span
                style={{ backgroundColor: occasionColour(outfit.occasion) }}
                className={`border border-ink px-1.5 font-display text-xs font-bold uppercase tracking-[1px] ${
                  isDarkOccasion(outfit.occasion) ? 'text-on-dark' : 'text-ink'
                }`}
              >
                {OCCASION_LABELS[outfit.occasion]}
              </span>
            )}
            <span>{savedOn(outfit.createdAt)}</span>
          </span>
        </span>
        <span aria-hidden="true" className="text-xl">›</span>
      </Link>
    </li>
  )
}

function SavedContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { state, retry } = useSavedOutfits()
  const [filter, setFilter] = useState<SavedFilter>('all')
  const [toast, setToast] = useState<string | null>(params.get('removed') ? 'Outfit removed.' : null)
  const clearToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (params.get('removed')) router.replace('/saved')
    // Only on first render: the toast text was already captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const all = state.status === 'ready' ? state.outfits : []
  const visible = filterSaved(all, filter)

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6 pb-8 pt-10 lg:px-10">
      <h1 className="font-display text-[56px] font-extrabold uppercase leading-none">Saved</h1>
      {state.status === 'ready' && savedCountLabel(all.length) && (
        <p className="mb-5 mt-1 text-sm text-ink-2">{savedCountLabel(all.length)}</p>
      )}

      {state.status === 'error' ? (
        <div className="mt-5">
          <ErrorState message="Couldn't load your saved outfits." onRetry={retry} />
        </div>
      ) : state.status === 'loading' ? (
        <div aria-busy="true" className="mt-5">
          <p role="status" className="sr-only">Loading your saved outfits…</p>
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px]" />)}</div>
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          title="No saved outfits yet"
          action={<ButtonLink href="/style-me" fullWidth={false}>Style me</ButtonLink>}
        >
          Tap Save on any outfit in Style me and it&apos;ll be kept here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Occasion" className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            <Chip role="radio" selected={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
            {OCCASIONS.map((o) => (
              <Chip
                key={o}
                role="radio"
                selected={filter === o}
                selectedFill={occasionColour(o)}
                selectedOnDark={isDarkOccasion(o)}
                onClick={() => setFilter(o)}
              >
                {OCCASION_LABELS[o]}
              </Chip>
            ))}
          </div>
          {visible.length === 0 ? (
            <div role="status" className="flex flex-col items-start gap-3">
              <p className="text-base font-semibold">{noSavedMessage(filter)}</p>
              <Button fullWidth={false} onClick={() => setFilter('all')}>Show all</Button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {visible.map((o) => <Row key={o.id} outfit={o} />)}
            </ul>
          )}
        </div>
      )}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </main>
  )
}

export default function SavedPage() {
  return (
    <Suspense fallback={null}>
      <SavedContent />
    </Suspense>
  )
}
