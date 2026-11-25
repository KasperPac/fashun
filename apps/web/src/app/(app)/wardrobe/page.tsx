'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, WardrobeItem } from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Banner, EmptyState, ErrorState, Skeleton, Toast } from '@/components/ui/Feedback'
import { BottomSheet, ConfirmDialog } from '@/components/ui/Overlays'
import ItemTile from '@/components/wardrobe/ItemTile'
import ItemSheet from '@/components/wardrobe/ItemSheet'
import ReadyStrip from '@/components/wardrobe/ReadyStrip'
import ReviewForm from '@/components/wardrobe/ReviewForm'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  addHref,
  filterItems,
  isDarkOccasion,
  noMatchMessage,
  occasionColour,
  outfitReadiness,
  pieceCount,
  type CategoryFilter,
  type OccasionFilter,
} from '@/lib/wardrobe-view'
import type { ReviewValues } from '@/lib/item-form'

const SEASONS = ['spring', 'summer', 'autumn', 'winter']

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready' }

function WardrobeContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [stale, setStale] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [season, setSeason] = useState<ColourSeason | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [occasion, setOccasion] = useState<OccasionFilter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(params.get('added') ? `${params.get('added')} added.` : null)
  const clearToast = useCallback(() => setToast(null), [])
  const loadedOnce = useRef(false)

  useEffect(() => {
    if (params.get('added')) router.replace('/wardrobe')
    // Only on first render: the toast text was already captured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/wardrobe?ownership=owned')
      .then(async (res) => {
        if (!res.ok) throw new Error('load failed')
        const json = await res.json()
        if (cancelled) return
        setItems(json.items ?? [])
        setStale(false)
        setLoad({ status: 'ready' })
        loadedOnce.current = true
      })
      .catch(() => {
        if (cancelled) return
        if (loadedOnce.current) setStale(true)
        else setLoad({ status: 'error' })
      })
    return () => { cancelled = true }
  }, [attempt])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: row } = await supabase.from('users').select('colour_season').eq('id', data.user.id).maybeSingle()
      const value = row?.colour_season
      if (!cancelled && SEASONS.includes(value ?? '')) setSeason(value as ColourSeason)
    })
    return () => { cancelled = true }
  }, [])

  const retry = useCallback(() => {
    setLoad({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])

  const visible = useMemo(() => filterItems(items, category, occasion), [items, category, occasion])
  const readiness = useMemo(() => outfitReadiness(items), [items])
  const open = items.find((i) => i.id === openId) ?? null

  async function deleteItem() {
    if (!open) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/wardrobe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: open.id }),
      })
      if (!res.ok) throw new Error('delete failed')
      setItems((all) => all.filter((i) => i.id !== open.id))
      setToast(`${open.name} deleted.`)
      setConfirmDelete(false)
      setOpenId(null)
    } catch {
      setDeleteError("Couldn't delete this item. Try again.")
    } finally {
      setDeleting(false)
    }
  }

  async function saveEdit(values: ReviewValues): Promise<boolean> {
    if (!open) return false
    setEditError(null)
    try {
      const res = await fetch('/api/wardrobe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: open.id,
          name: values.name,
          category: values.category,
          colours: values.colours,
          occasionTags: values.occasions,
        }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setEditError("Couldn't save this piece. Check your connection and try again.")
      return false
    }
    setItems((all) =>
      all.map((i) =>
        i.id === open.id ? { ...i, name: values.name, category: values.category, colours: values.colours, occasionTags: values.occasions } : i,
      ),
    )
    setEditing(false)
    setToast('Changes saved.')
    return true
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-6 pb-8 pt-10 lg:px-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[56px] font-extrabold uppercase leading-none">Wardrobe</h1>
          {load.status === 'ready' && <p className="mt-1 text-sm text-ink-2">{pieceCount(items.length)}</p>}
        </div>
        <ButtonLink href={addHref(null, null)} fullWidth={false} compact>
          <span aria-hidden="true">+</span> Add
        </ButtonLink>
      </div>

      {stale && (
        <div className="mb-4">
          <Banner>You&apos;re offline. Showing what was last loaded.</Banner>
        </div>
      )}

      {load.status === 'error' ? (
        <ErrorState message="Couldn't load your wardrobe." onRetry={retry} />
      ) : (
        <div className="flex flex-col gap-5">
          <ReadyStrip readiness={readiness} loading={load.status === 'loading'} />

          <div className="flex min-w-0 flex-col gap-2">
            <div role="radiogroup" aria-label="Category" className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              <Chip role="radio" selected={category === 'all'} onClick={() => setCategory('all')}>All</Chip>
              {CATEGORIES.map((c) => (
                <Chip key={c} role="radio" selected={category === c} onClick={() => setCategory(c)}>
                  {CATEGORY_LABELS[c]}
                </Chip>
              ))}
            </div>
            <div role="radiogroup" aria-label="Occasion" className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              <Chip role="radio" selected={occasion === 'all'} onClick={() => setOccasion('all')}>Any occasion</Chip>
              {OCCASIONS.map((o) => (
                <Chip
                  key={o}
                  role="radio"
                  selected={occasion === o}
                  selectedFill={occasionColour(o)}
                  selectedOnDark={isDarkOccasion(o)}
                  onClick={() => setOccasion(o)}
                >
                  {OCCASION_LABELS[o]}
                </Chip>
              ))}
            </div>
          </div>

          {load.status === 'loading' ? (
            <div aria-busy="true">
              <p role="status" className="sr-only">Loading your wardrobe…</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
                {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}
              </div>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Your wardrobe is empty"
              action={<ButtonLink href={addHref(null, null)} fullWidth={false}>Add a piece</ButtonLink>}
            >
              Add a top, a bottom and a pair of shoes to get your first outfits.
            </EmptyState>
          ) : visible.length === 0 ? (
            <div role="status" className="flex flex-col items-start gap-3">
              <p className="text-base font-semibold">{noMatchMessage(category, occasion)}</p>
              <Button variant="secondary" fullWidth={false} onClick={() => { setCategory('all'); setOccasion('all') }}>
                Clear filters
              </Button>
              <ButtonLink
                href={addHref(category === 'all' ? null : category, occasion === 'all' ? null : occasion)}
                fullWidth={false}
              >
                Add a piece
              </ButtonLink>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
              {visible.map((item) => (
                <ItemTile key={item.id} item={item} onOpen={() => setOpenId(item.id)} />
              ))}
            </ul>
          )}
        </div>
      )}

      <ItemSheet
        item={editing || confirmDelete ? null : open}
        season={season}
        onClose={() => setOpenId(null)}
        onEdit={() => { setEditError(null); setEditing(true) }}
        onDelete={() => { setDeleteError(null); setConfirmDelete(true) }}
        onWornPhotoChange={(id, has) => setItems((all) => all.map((i) => (i.id === id ? { ...i, hasWornPhoto: has } : i)))}
      />
      <BottomSheet open={editing && open !== null} title="Edit item" onClose={() => setEditing(false)}>
        {open && (
          <ReviewForm
            key={open.id}
            mode="edit"
            initial={{ name: open.name, category: open.category, colours: open.colours, occasions: open.occasionTags }}
            photoUrl={open.imageUrl || null}
            season={season}
            saveError={editError}
            onSave={saveEdit}
          />
        )}
      </BottomSheet>
      <ConfirmDialog
        open={confirmDelete && open !== null}
        title={`Delete ${open?.name ?? 'this item'}?`}
        body={`It will be removed from your wardrobe${open?.hasWornPhoto ? ', with the photo of you wearing it' : ''}. Saved outfits that use it will show it as removed. You can't undo this.`}
        confirmLabel="Delete"
        busy={deleting}
        error={deleteError}
        onCancel={() => { setConfirmDelete(false) }}
        onConfirm={deleteItem}
      />
      {toast && <Toast message={toast} onDone={clearToast} />}
    </main>
  )
}

export default function WardrobePage() {
  return (
    <Suspense fallback={null}>
      <WardrobeContent />
    </Suspense>
  )
}
