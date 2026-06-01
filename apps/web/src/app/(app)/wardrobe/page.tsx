'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { WardrobeItem, WardrobeCategory, ColourSeason } from '@fashun/shared'
import { isColourInSeason } from '@fashun/shared'
import CategoryCarousel from '@/components/wardrobe/CategoryCarousel'
import type { CategoryOption } from '@/components/wardrobe/CategoryCarousel'
import PaletteFilterToggle from '@/components/wardrobe/PaletteFilterToggle'
import WardrobeGrid from '@/components/wardrobe/WardrobeGrid'
import OwnershipToggle from '@/components/wardrobe/OwnershipToggle'
import OutfitModal from '@/components/outfits/OutfitModal'
import type { OutfitSuggestion } from '@/components/outfits/OutfitModal'
import SavedOutfitsSheet from '@/components/outfits/SavedOutfitsSheet'
import { supabase } from '@/lib/supabase/client'

type ModalMode = 'loading' | 'results' | 'error'
type ModalAction = 'style' | 'tryon'

interface ModalState {
  isOpen: boolean
  action: ModalAction
  mode: ModalMode
  item: WardrobeItem | null
  suggestions: OutfitSuggestion[]
  tryOnImageUrl: string | null
  errorMessage: string | null
}

const MODAL_CLOSED: ModalState = {
  isOpen: false, action: 'style', mode: 'loading',
  item: null, suggestions: [], tryOnImageUrl: null, errorMessage: null,
}

export default function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryOption>('all')
  const [ownership, setOwnership] = useState<'owned' | 'wishlist'>('owned')
  const [userSeason, setUserSeason] = useState<ColourSeason | undefined>(undefined)
  const [paletteOnly, setPaletteOnly] = useState(false)
  const [modal, setModal] = useState<ModalState>(MODAL_CLOSED)
  const inFlightRef = useRef<AbortController | null>(null)
  const [savedSheetOpen, setSavedSheetOpen] = useState(false)
  const [hasSavedOutfits, setHasSavedOutfits] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ ownership })
    if (category !== 'all') params.set('category', category as WardrobeCategory)
    const res = await fetch(`/api/wardrobe?${params}`)
    const json = await res.json()
    setItems(json.items ?? [])
    setLoading(false)
  }, [category, ownership])

  useEffect(() => { fetchItems() }, [fetchItems])

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) return
      supabase
        .from('users')
        .select('colour_season')
        .eq('id', data.user.id)
        .single()
        .then(({ data: profile, error: profileError }) => {
          if (profileError || !profile) return
          const season = (profile as { colour_season: string | null }).colour_season
          if (season) setUserSeason(season as ColourSeason)
        })
    })
  }, [])

  // Check if user has any saved outfits (for the modal footer link)
  useEffect(() => {
    fetch('/api/outfits')
      .then(r => r.ok ? r.json() : { outfits: [] })
      .then(json => setHasSavedOutfits((json.outfits ?? []).length > 0))
      .catch(() => {})
  }, [])

  async function handleDelete(id: string) {
    const res = await fetch('/api/wardrobe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }

  async function handleAction(item: WardrobeItem, action: 'style' | 'tryon') {
    // Abort any in-flight request
    inFlightRef.current?.abort()
    const controller = new AbortController()
    inFlightRef.current = controller

    setModal({ isOpen: true, action, mode: 'loading', item, suggestions: [], tryOnImageUrl: null, errorMessage: null })
    await runAction(item, action, controller.signal)
  }

  async function runAction(item: WardrobeItem, action: 'style' | 'tryon', signal?: AbortSignal) {
    try {
      if (action === 'style') {
        const res = await fetch('/api/outfits/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: item.id }),
          signal,
        })
        if (signal?.aborted) return
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to generate outfits')
        setModal(prev => ({ ...prev, mode: 'results', suggestions: json.suggestions ?? [] }))
      } else {
        const res = await fetch('/api/outfits/try-on', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: item.id }),
          signal,
        })
        if (signal?.aborted) return
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Try-on failed')
        setModal(prev => ({ ...prev, mode: 'results', tryOnImageUrl: json.image_url }))
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setModal(prev => ({ ...prev, mode: 'error', errorMessage: message }))
    }
  }


  const validHex = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex)
  const displayItems = paletteOnly && userSeason
    ? items.filter(item =>
        (item.colours ?? []).filter(validHex).some(hex => isColourInSeason(hex, userSeason))
      )
    : items

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black tracking-tight">My Wardrobe</h1>
          <span className="text-zinc-500 text-sm">{displayItems.length} items</span>
        </div>
        <OwnershipToggle active={ownership} onChange={(o) => { setOwnership(o); setPaletteOnly(false) }} />
        <div className="mt-3">
          <CategoryCarousel active={category} onChange={setCategory} />
        </div>
        {userSeason && (
          <PaletteFilterToggle enabled={paletteOnly} onChange={setPaletteOnly} />
        )}
      </div>
      <div className="flex-1 px-4 pb-24">
        <WardrobeGrid
          items={displayItems}
          loading={loading}
          onDelete={handleDelete}
          onAction={handleAction}
          userSeason={userSeason}
        />
      </div>
      <div className="fixed bottom-20 inset-x-4">
        <a
          href="/wardrobe/add"
          className="block bg-purple-600 hover:bg-purple-500 text-white text-center rounded-2xl py-4 font-bold text-sm shadow-xl shadow-purple-900/50"
        >
          📸 Add Item
        </a>
      </div>

      <OutfitModal
        isOpen={modal.isOpen}
        onClose={() => setModal(MODAL_CLOSED)}
        action={modal.action}
        mode={modal.mode}
        item={modal.item}
        suggestions={modal.suggestions}
        tryOnImageUrl={modal.tryOnImageUrl ?? undefined}
        errorMessage={modal.errorMessage ?? undefined}
        onRetry={() => {
          const { item, action } = modal
          if (item) runAction(item, action)
        }}
        onSaveOutfit={async (suggestion) => {
          const item = modal.item
          if (!item) return
          await fetch('/api/outfits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              item_id: item.id,
              name: suggestion.name,
              occasion: suggestion.occasion,
              pieces: suggestion.pieces,
              description: suggestion.description,
            }),
          })
          setHasSavedOutfits(true)
        }}
        onViewSaved={() => setSavedSheetOpen(true)}
        hasSavedOutfits={hasSavedOutfits}
      />

      <SavedOutfitsSheet
        isOpen={savedSheetOpen}
        onClose={() => setSavedSheetOpen(false)}
      />
    </div>
  )
}
