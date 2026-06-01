'use client'
import { isColourInSeason } from '@fashun/shared'
import type { WardrobeItem, ColourSeason } from '@fashun/shared'

interface Props {
  item: WardrobeItem
  onDelete: (id: string) => void
  onAction?: (item: WardrobeItem, action: 'style' | 'tryon') => void
  userSeason?: ColourSeason
  isActive?: boolean
  onActivate?: (e: React.MouseEvent) => void
}

export default function ItemCard({ item, onDelete, onAction, userSeason, isActive, onActivate }: Props) {
  const validHexes = (item.colours ?? []).filter(hex => /^#[0-9a-fA-F]{6}$/.test(hex))
  const paletteMatch: boolean | null =
    userSeason && validHexes.length
      ? validHexes.some(hex => isColourInSeason(hex, userSeason))
      : null

  return (
    <div
      className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-[3/4] cursor-pointer"
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate?.(e as unknown as React.MouseEvent)
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageUrl}
        alt={item.name}
        className="w-full h-full object-contain p-2"
      />

      {/* Palette match badge — top-right */}
      {paletteMatch === true && (
        <div className="absolute top-2 right-2 z-10 bg-green-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
          ✓ In palette
        </div>
      )}
      {paletteMatch === false && (
        <div className="absolute top-2 right-2 z-10 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
          Off palette
        </div>
      )}

      {/* Hover overlay: name + colour dots (hidden when action bar is active) */}
      {!isActive && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-xs font-semibold truncate">{item.name}</p>
          <div className="flex gap-1 mt-1">
            {(item.colours ?? []).slice(0, 3).map(c => (
              <div key={c} className="w-3 h-3 rounded-full border border-white/20" style={{ background: c }} />
            ))}
          </div>
        </div>
      )}

      {/* Action bar — shown on tap */}
      {isActive && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/80 to-transparent pt-6 pb-2 px-1.5 flex flex-col gap-1">
          <p className="text-white text-[9px] font-semibold truncate px-0.5 mb-0.5">{item.name}</p>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAction?.(item, 'style') }}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-[9px] font-bold py-1.5 rounded-lg transition-colors"
            >
              ✨ Style it
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction?.(item, 'tryon') }}
              disabled={!item.imageUrl}
              title={!item.imageUrl ? 'Add a photo to enable try-on' : undefined}
              className="flex-1 bg-zinc-900 border border-purple-400/40 text-purple-300 text-[9px] font-bold py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:border-purple-400/70"
            >
              👤 Try on
            </button>
          </div>
        </div>
      )}

      {/* Delete button — top-left */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
        aria-label={`Delete ${item.name}`}
        className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-red-600/80 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 flex items-center justify-center"
      >
        ×
      </button>

      {/* Wishlist badge */}
      {item.ownership === 'wishlist' && (
        <div className="absolute bottom-8 left-2 bg-amber-400/90 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          WISHLIST
        </div>
      )}
    </div>
  )
}
