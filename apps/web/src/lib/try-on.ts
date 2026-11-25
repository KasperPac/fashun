/**
 * Pure rules for "See it on me": which pieces get drawn, what is skipped, the
 * money (in whole 1/10,000 US$ so cents never drift) and the Sydney-time month.
 */

export type TryOnStep = 'top' | 'bottom' | 'one-piece' | 'outfit'

/** 'gemini': one image-edit request per outfit (default). 'fashn': today's two-pass path, kept as the fallback. */
export type TryOnProvider = 'gemini' | 'fashn'

/** TRY_ON_PROVIDER=fashn switches back to FASHN. Anything else, including missing or misspelt, is Gemini, so an unknown value never reaches an unknown service. */
export function readTryOnProvider(): TryOnProvider {
  return process.env.TRY_ON_PROVIDER?.trim().toLowerCase() === 'fashn' ? 'fashn' : 'gemini'
}

/** FASHN's published price of one image (US$0.075) in whole units. Fixed, so rolling back to FASHN needs no price change. */
export const FASHN_PRICE_UNITS = 750

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

/**
 * Monthly cap and the price of one ledger row (one Gemini picture, or one FASHN image) for the
 * provider in use. Gemini's price is TRY_ON_PRICE_USD; FASHN's is fixed (the setting must still be
 * set). null when the cap or the price is missing or not a positive number, so nothing is ever drawn unconfigured.
 */
export function readTryOnConfig(provider: TryOnProvider = readTryOnProvider()): TryOnConfig | null {
  const { capUnits, priceUnits } = readTryOnSettings()
  if (capUnits === null || priceUnits === null) return null
  return { capUnits, priceUnits: provider === 'fashn' ? FASHN_PRICE_UNITS : priceUnits }
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
  /** The item's "photo of me wearing it" (an object path in the try-on bucket) and its fit notes, when it has them. */
  wornPhotoPath?: string | null
  fitNotes?: string | null
}

export interface PlannedStep {
  step: TryOnStep
  /** FASHN v1.6 category. null for the one-request 'outfit' step. */
  category: 'tops' | 'bottoms' | 'one-pieces' | null
}

/** What a garment photo is, so the request can say what each picture shows. Never the person's own label. */
export type GarmentKind = 'top' | 'bottom' | 'one-piece' | 'outerwear' | 'shoes'

export interface PlannedGarment {
  kind: GarmentKind
  label: string
  imageRef: string
  wornPhotoPath?: string | null
  fitNotes?: string | null
}

export interface SkippedPiece {
  label: string
  reason: 'not_drawn' | 'covered' | 'not_in_wardrobe'
}

export type TryOnPlan =
  | { ok: true; steps: PlannedStep[]; garments: PlannedGarment[]; skipped: SkippedPiece[] }
  | { ok: false; code: 'NO_TRYABLE_PIECES' | 'MISSING_GARMENT_PHOTO'; message: string; missing: string[] }

const NOT_DRAWN = new Set(['shoes', 'bags', 'accessories', 'outerwear'])

/**
 * Works out what to draw. FASHN (the default here, as before): a dress or jumpsuit is one
 * step; otherwise the top, then the bottom; shoes, bags, accessories and outerwear are
 * skipped and listed back. Gemini: one 'outfit' step that carries the same core pieces plus
 * one pair of shoes and one outerwear piece when the outfit has them (an add-on without a
 * photo is skipped, not an error); bags and accessories are never sent. If any core piece
 * has no photo, nothing is planned (so nothing is charged).
 */
export function planTryOn(pieces: OutfitPiece[], provider: TryOnProvider = 'fashn'): TryOnPlan {
  const oneShot = provider === 'gemini'
  const skipped: SkippedPiece[] = []
  const tops: OutfitPiece[] = []
  const bottoms: OutfitPiece[] = []
  const onePieces: OutfitPiece[] = []
  const outerwear: OutfitPiece[] = []
  const shoes: OutfitPiece[] = []

  for (const p of pieces) {
    if (p.category === null) skipped.push({ label: p.label, reason: 'not_in_wardrobe' })
    else if (oneShot && p.category === 'outerwear') outerwear.push(p)
    else if (oneShot && p.category === 'shoes') shoes.push(p)
    else if (NOT_DRAWN.has(p.category)) skipped.push({ label: p.label, reason: 'not_drawn' })
    else if (p.category === 'tops') tops.push(p)
    else if (p.category === 'bottoms') bottoms.push(p)
    else if (p.category === 'dresses' || p.category === 'jumpsuits') onePieces.push(p)
    else skipped.push({ label: p.label, reason: 'not_drawn' })
  }

  const chosen: Array<{ piece: OutfitPiece; step: Exclude<TryOnStep, 'outfit'>; category: PlannedStep['category'] }> = []
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

  const garments: PlannedGarment[] = chosen.map((c) => ({ kind: c.step, label: c.piece.label, imageRef: c.piece.imageRef as string, wornPhotoPath: c.piece.wornPhotoPath, fitNotes: c.piece.fitNotes }))

  if (!oneShot) {
    return { ok: true, steps: chosen.map((c) => ({ step: c.step, category: c.category })), garments, skipped }
  }

  // Core pieces first, then outerwear, then shoes: the request names each picture in this order. A second jacket or pair of shoes is covered, as a second top is.
  for (const [list, kind] of [[outerwear, 'outerwear'], [shoes, 'shoes']] as const) {
    const [first, ...rest] = list
    if (first) {
      if (first.imageRef) garments.push({ kind, label: first.label, imageRef: first.imageRef, wornPhotoPath: first.wornPhotoPath, fitNotes: first.fitNotes })
      else skipped.push({ label: first.label, reason: 'not_drawn' })
    }
    for (const p of rest) skipped.push({ label: p.label, reason: 'covered' })
  }
  return { ok: true, steps: [{ step: 'outfit', category: null }], garments, skipped }
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

/**
 * Exact spend per month in whole units: each row at the price it was made at. Rows from before
 * the price was stored (price_units null) are FASHN images, counted at FASHN's price.
 */
export function unitsByMonth(rows: Array<{ month: string; price_units?: number | null }>): Map<string, number> {
  const byMonth = new Map<string, number>()
  for (const r of rows) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + (r.price_units ?? FASHN_PRICE_UNITS))
  return byMonth
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
