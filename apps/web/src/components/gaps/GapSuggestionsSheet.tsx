'use client'
import { useEffect, useState } from 'react'
import type { BudgetTier, OccasionTag } from '@fashun/shared'
import { SEASON_NAMES } from '@/lib/profile-view'
import type { ColourSeason } from '@fashun/shared'
import { SEASON_ACCENTS } from '@/lib/style-me'
import { colourName } from '@/lib/colour-names'
import type { GapSuggestion } from '@/lib/gap-search'
import { BottomSheet } from '@/components/ui/Overlays'
import { Button, ButtonLink, buttonClasses } from '@/components/ui/Button'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { ColourSwatch } from '@/components/ui/ColourSwatch'
import {
  GAP_ALL_FOUND_LINE, GAP_LOAD_FAILED_LINE, GAP_OFFLINE_LINE, GAP_OTHER_THINGS_WORK_LINE,
  GAP_PRICES_NOTE, GAP_STILL_LOOKING_LINE, GAP_UNAVAILABLE_LINE,
  budgetHref, lookingLine, nothingFoundLine, pausedLine, photoHref, priceSpoken, priceText, sheetIntro, shopLinkHref, suggestionsHref,
  type GapRow,
} from '@/lib/gap-card'

export type SheetState =
  | { name: 'blank' }
  | { name: 'loading'; slow: boolean }
  | { name: 'items'; items: GapSuggestion[] }
  | { name: 'unavailable' }
  | { name: 'paused'; resumeOn: string }
  | { name: 'error' }
  | { name: 'offline' }

const STILL_LOOKING_AFTER_MS = 8000
/** An answer inside this time shows no loading state at all. */
const LOADING_DELAY_MS = 300

type Answer = { status?: string; items?: unknown; resume_on?: unknown }

function readAnswer(httpStatus: number, body: Answer | null): SheetState {
  if (httpStatus === 503 || body?.status === 'unavailable') return { name: 'unavailable' }
  if (body?.status === 'paused' && typeof body.resume_on === 'string') return { name: 'paused', resumeOn: body.resume_on }
  if (httpStatus === 200 && body?.status === 'ok' && Array.isArray(body.items)) return { name: 'items', items: body.items as GapSuggestion[] }
  return { name: 'error' }
}

function ItemPhoto({ src, alt, category }: { src: string | null; alt: string; category: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex h-[120px] w-24 shrink-0 items-center justify-center overflow-hidden border-[1.5px] border-ink bg-tile">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-contain" />
      ) : (
        <span className="px-1 text-center font-display text-[13px] font-bold uppercase tracking-[1px] text-ink-2">{category}</span>
      )}
    </div>
  )
}

function ItemCard({ item, occasion, row, season }: { item: GapSuggestion; occasion: OccasionTag; row: GapRow; season: ColourSeason }) {
  const seasonName = SEASON_NAMES[season]
  return (
    <li className="border-b-[1.5px] border-ink py-4 first:pt-0">
      <div className="flex gap-3">
        <ItemPhoto src={photoHref(occasion, row.category, item.imageUrl)} alt={item.title} category={row.category} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">{item.shop}</p>
          <p className="line-clamp-2 text-[15px] font-semibold">{item.title}</p>
          <p className="font-display text-[22px] font-extrabold leading-tight">
            <span aria-hidden="true">{priceText(item.price)}</span>
            <span className="sr-only">{priceSpoken(item.price)}</span>
          </p>
          <p className="mt-1 flex items-start gap-2 text-[13px] text-ink-2">
            <span aria-hidden="true" className="mt-0.5 w-1 shrink-0 self-stretch" style={{ backgroundColor: SEASON_ACCENTS[season] }} />
            <ColourSwatch hex={item.colour} size={16} />
            <span>{`${item.colourName || colourName(item.colour)}, one of your ${seasonName} colours.`}</span>
          </p>
        </div>
      </div>
      {/* A plain link that opens a new tab at once (so iPhone Safari allows it); the app then looks the shop's page up and forwards. */}
      <a
        href={shopLinkHref(occasion, row.category, item.title)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`See it at the shop: ${item.title} at ${item.shop} (opens in a new tab)`}
        className={`${buttonClasses({ variant: 'secondary', compact: true })} mt-3`}
      >
        See it at the shop
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 11l6-6M6 5h5v5" /></svg>
      </a>
    </li>
  )
}

/** The body of the sheet for one state. Pure, so each state can be rendered on its own. */
export function SheetBody({
  state, row, occasion, tier, range, season, onClose, onRetry,
}: {
  state: SheetState
  row: GapRow
  occasion: OccasionTag
  tier: BudgetTier
  range: readonly [number, number]
  season: ColourSeason
  onClose: () => void
  onRetry: () => void
}) {
  const seasonName = SEASON_NAMES[season]
  const intro = <p className="mb-4 text-[15px] text-ink-2">{sheetIntro(tier, range, seasonName)}</p>
  const closeText = <Button variant="text" onClick={onClose}>Close</Button>

  if (state.name === 'blank') return <div aria-busy="true">{intro}</div>
  if (state.name === 'loading') {
    return (
      <div aria-busy="true">
        {intro}
        <p role="status" aria-live="polite" className="mb-4 text-[15px] font-semibold">
          {lookingLine(row.label, tier)}
          {state.slow && <span className="mt-1 block font-medium text-ink-2">{GAP_STILL_LOOKING_LINE}</span>}
        </p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-4 flex gap-3">
            <Skeleton className="h-[120px] w-24 shrink-0" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" /></div>
          </div>
        ))}
      </div>
    )
  }
  if (state.name === 'items' && state.items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h3 className="font-display text-[22px] font-extrabold uppercase leading-tight">Nothing found this time</h3>
        <p className="text-[15px] leading-[1.4] text-ink-2">{nothingFoundLine(row.findLabel, row.category, tier, range)}</p>
        <ButtonLink href={budgetHref(occasion)}>Change my budget</ButtonLink>
        {closeText}
      </div>
    )
  }
  if (state.name === 'items') {
    return (
      <div>
        {intro}
        <ul className="border-t-[1.5px] border-ink pt-4">
          {state.items.slice(0, 6).map((item, i) => (
            <ItemCard key={`${item.productId ?? item.title}-${i}`} item={item} occasion={occasion} row={row} season={season} />
          ))}
        </ul>
        {state.items.length < 6 && <p role="status" className="mt-4 text-[15px] font-semibold">{GAP_ALL_FOUND_LINE}</p>}
        <p className="mt-2 text-[13px] text-ink-2">{GAP_PRICES_NOTE}</p>
      </div>
    )
  }
  if (state.name === 'unavailable' || state.name === 'paused') {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-base font-semibold">{state.name === 'paused' ? pausedLine(state.resumeOn) : GAP_UNAVAILABLE_LINE}</p>
        <p className="text-[15px] text-ink-2">{GAP_OTHER_THINGS_WORK_LINE}</p>
        {closeText}
      </div>
    )
  }
  if (state.name === 'offline') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="status" className="text-base font-semibold">{GAP_OFFLINE_LINE}</p>
        {closeText}
      </div>
    )
  }
  return <ErrorState message={GAP_LOAD_FAILED_LINE} onRetry={onRetry} />
}

type SheetProps = {
  row: GapRow
  occasion: OccasionTag
  tier: BudgetTier
  range: readonly [number, number]
  season: ColourSeason
  online: boolean
  onClose: () => void
}

/** Asks for the items when mounted and drops the request when unmounted. Remount (key) to ask again. */
function LoadedBody({ row, occasion, tier, range, season, online, onClose, onRetry }: SheetProps & { onRetry: () => void }) {
  const [state, setState] = useState<SheetState>({ name: 'blank' })
  const category = row.category

  useEffect(() => {
    if (!online) return
    const controller = new AbortController()
    // A fast (stored) answer should not flash a loading state, so the skeletons wait a moment.
    let answered = false
    const loadingTimer = setTimeout(() => { if (!answered) setState({ name: 'loading', slow: false }) }, LOADING_DELAY_MS)
    const slowTimer = setTimeout(() => { if (!answered) setState({ name: 'loading', slow: true }) }, STILL_LOOKING_AFTER_MS)
    fetch(suggestionsHref(occasion, category), { signal: controller.signal })
      .then(async (res) => readAnswer(res.status, await res.json().catch(() => null)))
      .catch((): SheetState | null => (controller.signal.aborted ? null : { name: 'error' }))
      .then((next) => { answered = true; clearTimeout(loadingTimer); clearTimeout(slowTimer); if (next) setState(next) })
    return () => { answered = true; clearTimeout(loadingTimer); clearTimeout(slowTimer); controller.abort() }
  }, [category, occasion, online])

  return (
    <SheetBody
      state={online ? state : { name: 'offline' }} row={row} occasion={occasion} tier={tier} range={range} season={season}
      onClose={onClose} onRetry={onRetry}
    />
  )
}

/** The suggestions sheet for one gap. */
export default function GapSuggestionsSheet({ row, ...rest }: Omit<SheetProps, 'row'> & { row: GapRow | null }) {
  const [attempt, setAttempt] = useState(0)
  return (
    <BottomSheet open={row !== null} title={row?.label ?? ''} onClose={rest.onClose} side>
      {row && <LoadedBody key={`${row.category}-${attempt}-${rest.online}`} row={row} {...rest} onRetry={() => setAttempt((n) => n + 1)} />}
    </BottomSheet>
  )
}
