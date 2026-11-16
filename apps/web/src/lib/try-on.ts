/**
 * Pure rules for "See it on me": which pieces get drawn, what is skipped, the
 * money (in whole 1/10,000 US$ so cents never drift) and the Sydney-time month.
 */

export type TryOnStep = 'top' | 'bottom' | 'one-piece'

export const TRY_ON_LABEL = 'Made by AI. Fit and details may not be exact.'

const UNIT = 10_000

/** US$ -> whole units of 1/10,000 US$. */
export function toUnits(usd: number): number {
  return Math.round(usd * UNIT)
}

/** Whole units -> US$ (exact to 4 decimal places). */
export function fromUnits(units: number): number {
  return units / UNIT
}

export interface TryOnConfig {
  capUnits: number
  priceUnits: number
}

function parsePositive(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Monthly cap and price per picture from settings. null when either is missing or not a positive number, so nothing is ever drawn unconfigured. */
export function readTryOnConfig(): TryOnConfig | null {
  const cap = parsePositive(process.env.TRY_ON_MONTHLY_CAP_USD)
  const price = parsePositive(process.env.TRY_ON_PRICE_USD)
  if (cap === null || price === null) return null
  return { capUnits: toUnits(cap), priceUnits: toUnits(price) }
}

/** True when this user is the owner named in TRY_ON_OWNER_USER_ID. */
export function isTryOnOwner(userId: string): boolean {
  const owner = process.env.TRY_ON_OWNER_USER_ID?.trim()
  return !!owner && owner === userId
}

/** The calendar month in Sydney, as "YYYY-MM". */
export function sydneyMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** "2026-11" -> "2026-12-01" (the day paused try-on resumes). */
export function firstOfNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export interface OutfitPiece {
  label: string
  itemId: string | null
  /** Wardrobe category, null when the piece is not (or no longer) a wardrobe item. */
  category: string | null
  /** Object path or URL of the item's photo. */
  imageRef: string | null
}

export interface PlannedStep {
  step: TryOnStep
  label: string
  /** FASHN v1.6 category. */
  category: 'tops' | 'bottoms' | 'one-pieces'
  imageRef: string
}

export interface SkippedPiece {
  label: string
  reason: 'not_drawn' | 'covered' | 'not_in_wardrobe'
}

export type TryOnPlan =
  | { ok: true; steps: PlannedStep[]; skipped: SkippedPiece[] }
  | { ok: false; code: 'NO_TRYABLE_PIECES' | 'MISSING_GARMENT_PHOTO'; message: string; missing: string[] }

const NOT_DRAWN = new Set(['shoes', 'bags', 'accessories', 'outerwear'])

/**
 * Works out what to draw: a dress or jumpsuit is one step; otherwise the top, then the
 * bottom. Shoes, bags, accessories and outerwear are skipped and listed back. If any
 * piece that would be drawn has no photo, nothing is planned (so nothing is charged).
 */
export function planTryOn(pieces: OutfitPiece[]): TryOnPlan {
  const skipped: SkippedPiece[] = []
  const tops: OutfitPiece[] = []
  const bottoms: OutfitPiece[] = []
  const onePieces: OutfitPiece[] = []

  for (const p of pieces) {
    if (p.category === null) skipped.push({ label: p.label, reason: 'not_in_wardrobe' })
    else if (NOT_DRAWN.has(p.category)) skipped.push({ label: p.label, reason: 'not_drawn' })
    else if (p.category === 'tops') tops.push(p)
    else if (p.category === 'bottoms') bottoms.push(p)
    else if (p.category === 'dresses' || p.category === 'jumpsuits') onePieces.push(p)
    else skipped.push({ label: p.label, reason: 'not_drawn' })
  }

  const chosen: Array<{ piece: OutfitPiece; step: TryOnStep; category: PlannedStep['category'] }> = []
  if (onePieces.length > 0) {
    chosen.push({ piece: onePieces[0], step: 'one-piece', category: 'one-pieces' })
    for (const p of [...onePieces.slice(1), ...tops, ...bottoms]) skipped.push({ label: p.label, reason: 'covered' })
  } else {
    if (tops.length > 0) chosen.push({ piece: tops[0], step: 'top', category: 'tops' })
    if (bottoms.length > 0) chosen.push({ piece: bottoms[0], step: 'bottom', category: 'bottoms' })
    for (const p of [...tops.slice(1), ...bottoms.slice(1)]) skipped.push({ label: p.label, reason: 'covered' })
  }

  if (chosen.length === 0) {
    return {
      ok: false,
      code: 'NO_TRYABLE_PIECES',
      message: 'Add a top, bottom or dress from your wardrobe to this outfit to try it on',
      missing: [],
    }
  }

  const missing = chosen.filter((c) => !c.piece.imageRef).map((c) => c.piece.label)
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'MISSING_GARMENT_PHOTO',
      message: `Add a photo of your ${missing.join(' and ')} to try this on`,
      missing,
    }
  }

  return {
    ok: true,
    steps: chosen.map((c) => ({ step: c.step, label: c.piece.label, category: c.category, imageRef: c.piece.imageRef as string })),
    skipped,
  }
}

export interface SpendMonth {
  month: string
  pictures: number
  spentUsd: number
}

/** Groups charged ledger rows by month, newest first. */
export function summariseSpend(rows: Array<{ month: string; cost_usd: number | string }>): SpendMonth[] {
  const byMonth = new Map<string, { pictures: number; units: number }>()
  for (const r of rows) {
    const cur = byMonth.get(r.month) ?? { pictures: 0, units: 0 }
    cur.pictures += 1
    cur.units += toUnits(Number(r.cost_usd))
    byMonth.set(r.month, cur)
  }
  return [...byMonth.entries()]
    .map(([month, v]) => ({ month, pictures: v.pictures, spentUsd: fromUnits(v.units) }))
    .sort((a, b) => (a.month < b.month ? 1 : -1))
}
