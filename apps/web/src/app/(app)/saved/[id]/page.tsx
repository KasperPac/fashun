'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, WardrobeItem } from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Kicker, ScreenBlock } from '@/components/ui/Onboarding'
import { ConfirmDialog } from '@/components/ui/Overlays'
import HangTag from '@/components/outfits/HangTag'
import { useSavedOutfits } from '@/components/outfits/useSavedOutfits'
import ItemSheet from '@/components/wardrobe/ItemSheet'
import { SEASON_NAMES } from '@/lib/profile-view'
import { savedDate } from '@/lib/saved-outfits'
import { SEASON_ACCENTS, occasionTheme, sortPieces } from '@/lib/style-me'

const SEASONS: ColourSeason[] = ['spring', 'summer', 'autumn', 'winter']

function BackLink() {
  return (
    <Link href="/saved" aria-label="Back" className="-ml-3 mb-2 flex h-11 w-11 items-center justify-center text-(--on-block)">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  )
}

export default function SavedOutfitPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { state, retry } = useSavedOutfits()
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([])
  const [currentSeason, setCurrentSeason] = useState<ColourSeason | null>(null)
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/wardrobe?ownership=owned')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.items) setWardrobe(json.items)
      })
      .catch(() => {
        // Without the wardrobe, pieces still show; they just don't open.
      })
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: row } = await supabase.from('users').select('colour_season').eq('id', data.user.id).maybeSingle()
      if (!cancelled) setCurrentSeason(SEASONS.find((s) => s === row?.colour_season) ?? null)
    })
    return () => { cancelled = true }
  }, [])

  async function remove() {
    setRemoving(true)
    setRemoveError(null)
    try {
      const res = await fetch('/api/outfits', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('remove failed')
      router.push('/saved?removed=1')
    } catch {
      setRemoveError("Couldn't remove this outfit. Try again.")
      setRemoving(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <main data-occasion="house" aria-busy="true">
        <p role="status" className="sr-only">Loading your saved outfit…</p>
        <ScreenBlock><BackLink /><Skeleton className="h-20 w-56" /></ScreenBlock>
        <div className="px-6 pt-6"><Skeleton className="h-[360px] max-w-[480px]" /></div>
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-[480px] px-6 pt-10">
        <ErrorState message="Couldn't load your saved outfits." onRetry={retry} />
      </main>
    )
  }

  const outfit = state.outfits.find((o) => o.id === id)
  if (!outfit) {
    return (
      <main className="mx-auto flex max-w-[480px] flex-col items-start gap-4 px-6 pt-10">
        <p role="status" className="text-base font-semibold">This outfit isn&apos;t here any more.</p>
        <ButtonLink href="/saved" fullWidth={false}>Back to saved</ButtonLink>
      </main>
    )
  }

  const theme = outfit.occasion ? occasionTheme(outfit.occasion) : 'house'
  const date = savedDate(outfit.createdAt)
  const note = outfit.season
    ? `Made for your ${SEASON_NAMES[outfit.season]} palette${date ? ` · saved ${date}` : ''}`
    : date ? `Saved ${date}` : undefined
  const item = wardrobe.find((w) => w.id === openItem) ?? null
  const byId = new Set(wardrobe.map((w) => w.id))
  const pieces = sortPieces(outfit.pieces).map((p, i) => ({
    key: p.itemId && byId.has(p.itemId) ? p.itemId : `${p.label}-${i}`,
    label: p.label,
    category: p.category,
    imageUrl: p.imageUrl,
    removed: p.removed,
  }))

  return (
    <main data-occasion={theme}>
      <ScreenBlock>
        <BackLink />
        <Kicker>Saved outfit</Kicker>
        <h1 className="font-display text-[76px] font-extrabold uppercase leading-[0.9] tracking-[-1px] text-(--on-block)">
          {outfit.occasion ? OCCASION_LABELS[outfit.occasion] : 'Saved'}
        </h1>
      </ScreenBlock>
      <div className="mx-auto w-full max-w-[480px] px-6 pb-8 pt-6">
        <HangTag
          kicker="Saved outfit"
          name={outfit.name}
          reason={outfit.reason}
          accent={outfit.season ? SEASON_ACCENTS[outfit.season] : null}
          note={note}
          pieces={pieces}
          onOpenPiece={(key) => byId.has(key) && setOpenItem(key)}
        >
          <Button variant="secondary" onClick={() => { setRemoveError(null); setConfirm(true) }}>Remove from saved</Button>
        </HangTag>
      </div>
      <ItemSheet item={item} season={currentSeason} onClose={() => setOpenItem(null)} />
      <ConfirmDialog
        open={confirm}
        title="Remove this outfit from saved?"
        body="Your clothes stay in your wardrobe."
        confirmLabel="Remove"
        busy={removing}
        error={removeError}
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    </main>
  )
}
