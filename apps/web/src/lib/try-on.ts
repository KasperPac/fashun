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

/** Each setting on its own; null when it is missing or not a positive number. Lets the owner's spend page say exactly which one is missing. */
export function readTryOnSettings(): { capUnits: number | null; priceUnits: number | null } {
  const cap = parsePositive(process.env.TRY_ON_MONTHLY_CAP_USD)
  const price = parsePositive(process.env.TRY_ON_PRICE_USD)
  return { capUnits: cap === null ? null : toUnits(cap), priceUnits: price === null ? null : toUnits(price) }
}

/** Monthly cap and price per picture from settings. null when either is missing or not a positive number, so nothing is ever drawn unconfigured. */
export function readTryOnConfig(): TryOnConfig | null {
  const { capUnits, priceUnits } = readTryOnSettings()
  if (capUnits === null || priceUnits === null) return null
  return { capUnits, priceUnits }
}

/** True when this user is the owner named in TRY_ON_OWNER_USER_ID. */
export function isTryOnOwner(userId: string): boolean {
  const owner = process.env.TRY_ON_OWNER_USER_ID?.trim()
  return !!owner && owner === userId
}

/**
 * "Now" for the try-on month logic. TRY_ON_TEST_DATE (an ISO date-time with offset) replaces the
 * clock on preview and local runs only, so QA can see the new month. It is ignored in production
 * (VERCEL_ENV=production, or NODE_ENV=production when not on Vercel) and when it isn't a valid date.
 */
export function tryOnNow(): Date {
  const raw = process.env.TRY_ON_TEST_DATE?.trim()
  const inProduction = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === 'production'
    : process.env.NODE_ENV === 'production'
  if (raw && !inProduction) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return date
  }
  return new Date()
}

/** Whole units -> "US$3.15", to the cent, halves rounded up. */
export function formatUsd(units: number): string {
  const cents = Math.floor((units + UNIT / 200) / (UNIT / 100))
  return `US$${(cents / 100).toFixed(2)}`
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
  /** FASHN images FASHN charged for. This is the exact stored spend. */
  images: number
  /** Pictures made and saved. A failed request never counts here, even when FASHN charged an image for it. */
  pictures: number
}

/** Exact spend of a number of FASHN images, in whole units. */
export function imagesToUnits(images: number, priceUnits: number): number {
  return images * priceUnits
}

/** Groups charged ledger rows (one per FASHN image) by month, newest first. */
export function summariseSpend(rows: Array<{ month: string; batch_id: string; picture_made: boolean }>): SpendMonth[] {
  const byMonth = new Map<string, { images: number; batches: Set<string> }>()
  for (const r of rows) {
    const cur = byMonth.get(r.month) ?? { images: 0, batches: new Set<string>() }
    cur.images += 1
    if (r.picture_made) cur.batches.add(r.batch_id)
    byMonth.set(r.month, cur)
  }
  return [...byMonth.entries()]
    .map(([month, v]) => ({ month, images: v.images, pictures: v.batches.size }))
    .sort((a, b) => (a.month < b.month ? 1 : -1))
}
