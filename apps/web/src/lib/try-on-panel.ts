import { CATEGORY_LABELS } from '@/lib/wardrobe-view'
import { sortPieces } from '@/lib/style-me'
import type { WardrobeCategory } from '@fashun/shared'

/** What the "On you" panel needs to know about one piece of a saved outfit. */
export interface PanelPiece {
  label: string
  /** null when the piece is no longer in the wardrobe. */
  category: string | null
  imageUrl: string | null
  removed: boolean
}

export interface BesidePiece {
  piece: PanelPiece
  /** The category shown in the line, e.g. "Shoes". */
  categoryLabel: string
}

export type PanelPlan =
  | { kind: 'ready'; images: 1 | 2; beside: BesidePiece[] }
  | { kind: 'missing'; title: string }

const ONE_PIECE_WORDS: Record<string, string> = { dresses: 'dress', jumpsuits: 'jumpsuit' }

function categoryLabel(category: string): string {
  return category in CATEGORY_LABELS ? CATEGORY_LABELS[category as WardrobeCategory] : 'Pieces'
}

/**
 * Mirrors what the server will draw (see planTryOn): a dress or jumpsuit alone, otherwise the
 * first top and the first bottom. Everything else is listed beside the picture. A drawn piece
 * with no photo means nothing is sent, so the panel says what to add instead.
 */
export function planPanel(pieces: PanelPiece[]): PanelPlan {
  const sorted = sortPieces(pieces)
  const live = sorted.filter((p) => p.category !== null && !p.removed)
  const first = (pred: (c: string) => boolean) => live.find((p) => pred(p.category as string))
  const onePiece = first((c) => c in ONE_PIECE_WORDS)
  const top = onePiece ? undefined : first((c) => c === 'tops')
  const bottom = onePiece ? undefined : first((c) => c === 'bottoms')
  const drawn = onePiece ? [onePiece] : [top, bottom].filter((p): p is PanelPiece => p !== undefined)

  if (drawn.length === 0) return { kind: 'missing', title: 'This outfit needs a top, bottoms or a dress to try on' }

  const noPhoto = drawn.filter((p) => !p.imageUrl)
  if (noPhoto.length > 0) {
    if (onePiece) return { kind: 'missing', title: `Add a photo of your ${ONE_PIECE_WORDS[onePiece.category as string]} to try this on` }
    if (noPhoto.length === 2) return { kind: 'missing', title: 'Add photos of your top and bottoms to try this on' }
    return { kind: 'missing', title: `Add a photo of your ${noPhoto[0] === top ? 'top' : 'bottoms'} to try this on` }
  }

  const beside = live
    .filter((p) => !drawn.includes(p))
    .map((p) => ({ piece: p, categoryLabel: categoryLabel(p.category as string) }))
  return { kind: 'ready', images: drawn.length === 2 ? 2 : 1, beside }
}

/** "Shoes and accessories aren't shown on you." / "Outerwear, shoes and bags aren't shown on you." null when nothing is beside. */
export function besideLine(beside: BesidePiece[]): string | null {
  const names: string[] = []
  for (const b of beside) if (!names.includes(b.categoryLabel)) names.push(b.categoryLabel)
  if (names.length === 0) return null
  const words = names.map((n, i) => (i === 0 ? n : n.toLowerCase()))
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  return `${list} aren't shown on you.`
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-12-01" -> "Try-on is paused until 1 December". null when the date can't be read. */
export function pausedTitle(resumeOn: string | null): string | null {
  const m = /^\d{4}-(\d{2})-01$/.exec(resumeOn ?? '')
  const name = m ? MONTH_NAMES[Number(m[1]) - 1] : undefined
  return name ? `Try-on is paused until 1 ${name}` : null
}

export const PAUSED_BODY = 'Your saved try-ons still show.'
export const FAILED_TITLE = "Try-on didn't work this time"
export const FAILED_BODY = 'Nothing was charged. Try again later.'
export const NO_PHOTO_LINE = 'Add a try-on photo to see this on you'
