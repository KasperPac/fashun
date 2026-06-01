'use client'
import { useState, useEffect } from 'react'
import OutfitSuggestionCard from './OutfitSuggestionCard'
import type { OutfitSuggestion } from './OutfitSuggestionCard'
import type { WardrobeItem } from '@fashun/shared'

export type { OutfitSuggestion }

interface Props {
  isOpen: boolean
  onClose: () => void
  action: 'style' | 'tryon'
  mode: 'loading' | 'results' | 'error'
  item: WardrobeItem | null
  suggestions?: OutfitSuggestion[]
  tryOnImageUrl?: string
  errorMessage?: string
  onRetry: () => void
  onSaveOutfit: (suggestion: OutfitSuggestion) => Promise<void>
  onViewSaved: () => void
  hasSavedOutfits: boolean
}

export default function OutfitModal({
  isOpen, onClose, action, mode, item,
  suggestions = [], tryOnImageUrl, errorMessage,
  onRetry, onSaveOutfit, onViewSaved, hasSavedOutfits,
}: Props) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSavedIds(new Set())
      setSavingId(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async (suggestion: OutfitSuggestion) => {
    setSavingId(suggestion.name)
    try {
      await onSaveOutfit(suggestion)
      setSavedIds(prev => new Set(prev).add(suggestion.name))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />

      {/* Sheet */}
      <div className="relative mt-auto w-full max-h-[85vh] bg-zinc-950 rounded-t-3xl flex flex-col overflow-hidden border-t border-zinc-800">
        {/* Handle + header */}
        <div className="px-5 pt-3 pb-4 border-b border-zinc-800/60 shrink-0">
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-base">
                {action === 'style' ? '✨ Outfit ideas' : '👤 Try on'}
              </h2>
              {item && (
                <p className="text-zinc-500 text-xs mt-0.5">
                  {action === 'style' ? `Built around ${item.name}` : item.name}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <p className="text-zinc-400 text-sm">
                {action === 'style' ? 'Generating outfit ideas…' : 'Rendering try-on (~10s)…'}
              </p>
            </div>
          )}

          {mode === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <span className="text-4xl">😕</span>
              <p className="text-zinc-400 text-sm text-center">{errorMessage ?? 'Something went wrong'}</p>
              <button
                onClick={onRetry}
                className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {mode === 'results' && action === 'style' && (
            <div className="flex flex-col gap-4">
              {suggestions.map((s, i) => (
                <OutfitSuggestionCard
                  key={s.name}
                  suggestion={s}
                  onSave={() => handleSave(s)}
                  saved={savedIds.has(s.name)}
                  saving={savingId === s.name}
                />
              ))}
            </div>
          )}

          {mode === 'results' && action === 'tryon' && (
            tryOnImageUrl ? (
              <div className="flex flex-col items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tryOnImageUrl}
                  alt="Virtual try-on result"
                  className="w-full max-w-xs rounded-2xl border border-zinc-800"
                />
                <p className="text-zinc-500 text-xs">Rendered by Fashn.ai</p>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-16">No image available.</p>
            )
          )}
        </div>

        {/* Footer */}
        {mode === 'results' && hasSavedOutfits && (
          <div className="px-5 py-3 border-t border-zinc-800/60 shrink-0">
            <button
              onClick={onViewSaved}
              className="w-full text-sm text-purple-400 font-medium py-2 hover:text-purple-300 transition-colors"
            >
              💾 View saved outfits →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
