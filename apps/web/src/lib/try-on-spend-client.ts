import { toUnits } from '@/lib/try-on'

export const SPEND_LOAD_FAILED = "Couldn't load try-on spend."

export interface SpendMonthRow {
  month: string
  images: number
  pictures: number
  /** Whole units of 1/10,000 US$; null when the price setting is missing. */
  spentUnits: number | null
}

export interface SpendReport {
  month: string
  images: number
  pictures: number
  spentUnits: number | null
  capUnits: number | null
  priceUnits: number | null
  previous: SpendMonthRow[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-11" -> "November". */
export function monthName(month: string): string {
  return MONTHS[Number(month.split('-')[1]) - 1] ?? month
}

/** The month after "2026-11", as a name: "December". */
export function nextMonthName(month: string): string {
  const m = Number(month.split('-')[1])
  return MONTHS[m % 12] ?? ''
}

/** Whole percent of the cap used, never above 100; a part-percent stays below the next whole one. */
export function percentUsed(spentUnits: number, capUnits: number): number {
  if (capUnits <= 0) return 0
  return Math.min(100, Math.floor((spentUnits * 100) / capUnits))
}

/** A price in whole units, without trailing zeros past the cent: 750 -> "US$0.075". */
export function formatPrice(priceUnits: number): string {
  return `US$${(priceUnits / 10_000).toFixed(3).replace(/0$/, '')}`
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Reads the owner spend answer. null when it isn't the shape we expect. */
export function parseSpend(json: unknown): SpendReport | null {
  if (typeof json !== 'object' || json === null) return null
  const j = json as Record<string, unknown>
  if (typeof j.month !== 'string' || !isNum(j.images) || !isNum(j.pictures) || !Array.isArray(j.previous)) return null
  const units = (v: unknown) => (isNum(v) ? toUnits(v) : null)
  const previous: SpendMonthRow[] = []
  for (const p of j.previous as unknown[]) {
    if (typeof p !== 'object' || p === null) return null
    const r = p as Record<string, unknown>
    if (typeof r.month !== 'string' || !isNum(r.images) || !isNum(r.pictures)) return null
    previous.push({ month: r.month, images: r.images, pictures: r.pictures, spentUnits: units(r.spent_usd) })
  }
  previous.sort((a, b) => (a.month < b.month ? 1 : -1))
  return {
    month: j.month,
    images: j.images,
    pictures: j.pictures,
    spentUnits: units(j.spent_usd),
    capUnits: units(j.cap_usd),
    priceUnits: units(j.price_usd),
    previous: previous.slice(0, 12),
  }
}

export async function loadSpendReport(api: { fetch: typeof fetch }): Promise<SpendReport | null> {
  try {
    const res = await api.fetch('/api/try-on/spend')
    if (!res.ok) return null
    return parseSpend(await res.json())
  } catch {
    return null
  }
}

