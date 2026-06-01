'use client'
import { isColourInSeason } from '@fashun/shared'
import type { WardrobeItem, ColourSeason } from '@fashun/shared'

interface Props {
  item: WardrobeItem
  onDelete: (id: string) => void
  userSeason?: ColourSeason
}

export default function ItemCard({ item, onDelete, userSeason }: Props) {
  const paletteMatch: boolean | null =
    userSeason && item.colours?.length
      ? item.colours.some(hex => isColourInSeason(hex, userSeason))
      : null

  return (
    <div className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-[3/4]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageUrl}
        alt={item.name}
        className="w-full h-full object-contain p-2"
      />

      {/* Palette match badge — top-right */}
      {paletteMatch === true && (
        <div className="absolute top-2 right-2 bg-green-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
          ✓ In palette
        </div>
      )}
      {paletteMatch === false && (
        <div className="absolute top-2 right-2 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
          Off palette
        </div>
      )}

      {/* Hover overlay: name + colour dots */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-white text-xs font-semibold truncate">{item.name}</p>
        <div className="flex gap-1 mt-1">
          {item.colours.slice(0, 3).map(c => (
            <div key={c} className="w-3 h-3 rounded-full border border-white/20" style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* Delete button — top-left (moved from top-right to make room for badge) */}
      <button
        onClick={() => onDelete(item.id)}
        aria-label={`Delete ${item.name}`}
        className="absolute top-2 left-2 w-6 h-6 rounded-full bg-red-600/80 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 flex items-center justify-center"
      >
        ×
      </button>

      {/* Wishlist badge — bottom-left (moved from top-left to avoid conflict with delete) */}
      {item.ownership === 'wishlist' && (
        <div className="absolute bottom-2 left-2 bg-amber-400/90 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          WISHLIST
        </div>
      )}
    </div>
  )
}
