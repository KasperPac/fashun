import { OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag } from '@fashun/shared'

/** One piece of a saved outfit as the Saved screens show it. */
export interface SavedPiece {
  label: string
  colourHex: string
  itemId: string | null
  /** null when the piece is no longer in the wardrobe. */
  category: string | null
  imageUrl: string | null
  /** True when the wardrobe piece was deleted after the outfit was saved. */
  removed: boolean
}

export interface SavedOutfit {
  id: string
  name: string
  occasion: OccasionTag | null
  season: ColourSeason | null
  reason: string | null
  pieces: SavedPiece[]
  createdAt: string
}

export interface StoredPiece {
  label?: unknown
  colour_hex?: unknown
  item_id?: unknown
  in_wardrobe?: unknown
}

export interface WardrobeLookup {
  category: string
  imageUrl: string | null
}

/**
 * Joins the pieces saved on an outfit with the user's current wardrobe.
 * A piece that pointed at a wardrobe item which is gone is marked removed;
 * a piece that never pointed at one (a v1 suggestion) is just a label.
 */
export function joinPieces(stored: unknown, wardrobe: Map<string, WardrobeLookup>): SavedPiece[] {
  if (!Array.isArray(stored)) return []
  return stored.map((raw: StoredPiece) => {
    const itemId = typeof raw.item_id === 'string' && raw.item_id ? raw.item_id : null
    const found = itemId ? wardrobe.get(itemId) : undefined
    return {
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : 'Piece',
      colourHex: typeof raw.colour_hex === 'string' ? raw.colour_hex : '#888888',
      itemId,
      category: found?.category ?? null,
      imageUrl: found?.imageUrl ?? null,
      removed: itemId !== null && !found,
    }
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "16 Nov" in the viewer's own time zone. An unreadable date reads as an empty string, never "NaN". */
export function savedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "Saved 16 Nov", or just "Saved" when the date is unreadable. */
export function savedOn(iso: string): string {
  const date = savedDate(iso)
  return date ? `Saved ${date}` : 'Saved'
}

export type SavedFilter = OccasionTag | 'all'

export function filterSaved<T extends { occasion: OccasionTag | null }>(outfits: T[], filter: SavedFilter): T[] {
  return filter === 'all' ? outfits : outfits.filter((o) => o.occasion === filter)
}

/** "No saved Formal outfits." */
export function noSavedMessage(filter: SavedFilter): string {
  return filter === 'all' ? 'No saved outfits yet' : `No saved ${OCCASION_LABELS[filter]} outfits.`
}
