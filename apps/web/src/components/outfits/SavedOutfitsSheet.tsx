'use client'
import { useState, useEffect } from 'react'
import type { OutfitPiece } from './OutfitSuggestionCard'

interface SavedOutfit {
  id: string
  item_id: string | null
  item_name?: string
  name: string
  occasion: string | null
  pieces: OutfitPiece[]
  description: string | null
  try_on_image_url: string | null
  created_at: string | null
}

function groupByItemName(outfits: SavedOutfit[]): Map<string, SavedOutfit[]> {
  const map = new Map<string, SavedOutfit[]>()
  for (const o of outfits) {
    const key = o.item_name ?? 'Unknown item'
    const arr = map.get(key) ?? []
    arr.push(o)
    map.set(key, arr)
  }
  return map
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function SavedOutfitsSheet({ isOpen, onClose }: Props) {
  const [outfits, setOutfits] = useState<SavedOutfit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/outfits')
      .then(r => r.json())
      .then(json => setOutfits(json.outfits ?? []))
      .catch(() => setOutfits([]))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative mt-auto w-full max-h-[80vh] bg-zinc-950 rounded-t-3xl flex flex-col overflow-hidden border-t border-zinc-800">
        <div className="px-5 pt-3 pb-4 border-b border-zinc-800/60 shrink-0">
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold text-base">💾 Saved outfits</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && outfits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <span className="text-4xl">✨</span>
              <p className="text-zinc-400 text-sm">No saved outfits yet</p>
              <p className="text-zinc-600 text-xs">Tap "Style it" on any wardrobe item to generate outfit ideas</p>
            </div>
          )}

          {!loading && outfits.length > 0 && (
            <div className="flex flex-col gap-3">
              {Array.from(groupByItemName(outfits).entries()).map(([itemName, group]) => (
                <div key={itemName}>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 mt-4 first:mt-0">
                    {itemName}
                  </h3>
                  {group.map(outfit => (
                    <div key={outfit.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 mb-3 last:mb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-white font-semibold text-sm">{outfit.name}</p>
                          {outfit.occasion && (
                            <p className="text-purple-400 text-xs">{outfit.occasion}</p>
                          )}
                        </div>
                        {outfit.try_on_image_url && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={outfit.try_on_image_url} alt="try-on" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {(outfit.pieces ?? []).slice(0, 5).map((piece, i) => (
                          <div
                            key={i}
                            className="w-6 h-6 rounded-full border-2 border-zinc-700"
                            style={{ background: piece.colour_hex }}
                            title={piece.label}
                          />
                        ))}
                      </div>
                      {outfit.description && (
                        <p className="text-zinc-500 text-xs mt-2 leading-relaxed">{outfit.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
