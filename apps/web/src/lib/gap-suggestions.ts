import { sydneyMonth } from '@/lib/try-on'
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export const GAP_NO_TIER_MESSAGE = 'Pick a budget to get suggestions'
export const GAP_UNAVAILABLE_MESSAGE = "Suggestions aren't available right now"

/** Searches allowed in a calendar month, all users together, when GAP_SEARCH_MONTHLY_CAP is not set. */
export const DEFAULT_GAP_SEARCH_MONTHLY_CAP = 900

/** The source has this long to answer before the gap shows "not available". */
export const GAP_SEARCH_TIMEOUT_MS = 12_000

/** GAP_SEARCH_MONTHLY_CAP as a whole number of searches (0 pauses every search). Missing or unreadable means the default. */
export function readGapSearchCap(): number {
  const raw = process.env.GAP_SEARCH_MONTHLY_CAP?.trim()
  if (!raw || !/^[0-9]+$/.test(raw)) return DEFAULT_GAP_SEARCH_MONTHLY_CAP
  return Number(raw)
}

/** The month searches are counted in: the Sydney calendar month, the same one try-on uses. "YYYY-MM". */
export function gapSearchMonth(now: Date): string {
  return sydneyMonth(now)
}

/** The day a gap's suggestions are stored for: the Sydney calendar day, "YYYY-MM-DD". */
export function gapDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Takes one search from this month's count in one database step. Returns the new count, or null
 * when the cap is already reached (the search must not be made). Throws when the count can't be
 * checked, so callers make no search then either. The shop-link lookup uses this too.
 */
export async function reserveGapSearch(service: ServiceClient, month: string, cap: number): Promise<number | null> {
  const { data, error } = await service.rpc('gap_search_reserve', { p_month: month, p_cap: cap })
  if (error) throw new Error('Could not check the search count')
  return data
}

/** Rejects after ms, so a source that never answers can't hold a gap open. */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
