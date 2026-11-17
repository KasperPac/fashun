'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag, WardrobeItem } from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Kicker, ScreenBlock } from '@/components/ui/Onboarding'
import HangTag from '@/components/outfits/HangTag'
import FillTheGapsCard from '@/components/gaps/FillTheGapsCard'
import GapSuggestionsSheet from '@/components/gaps/GapSuggestionsSheet'
import { DEFAULT_DEPARTMENT } from '@fashun/shared'
import { SEASON_NAMES } from '@/lib/profile-view'
import { gapRows, type GapRow, type GapStatus } from '@/lib/gap-card'
import { prefersReducedMotion, rememberOccasion, useLastOccasion, useOnline } from '@/lib/browser-state'
import {
  OCCASION_DESCRIPTIONS,
  SEASON_ACCENTS,
  fewerFromModelMessage,
  fewerMessage,
  isOccasion,
  loadingLine,
  missingPieceLine,
  notEnoughIntro,
  notEnoughTitle,
  occasionTheme,
  pickerSubtitle,
  readGenerateResponse,
  readyLine,
  saveBody,
  slideIndex,
  sortPieces,
  styleButtonLabel,
  type RequiredCategory,
  type StyledOutfit,
} from '@/lib/style-me'
import { SELFIE_FROM_PROFILE_HREF } from '@/lib/onboarding-back'
import { addHref, isDarkOccasion, occasionColour, outfitReadiness, type Readiness } from '@/lib/wardrobe-view'

const SEASONS: ColourSeason[] = ['spring', 'summer', 'autumn', 'winter']

type Setup =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: WardrobeItem[]; season: ColourSeason | null }

type Phase =
  | { name: 'picker' }
  | { name: 'loading'; occasion: OccasionTag; slow: boolean }
  | { name: 'results'; occasion: OccasionTag; outfits: StyledOutfit[]; missing: RequiredCategory | null; limited: boolean }
  | { name: 'not-enough'; occasion: OccasionTag; missing: RequiredCategory[]; have: RequiredCategory[] }
  | { name: 'failed'; occasion: OccasionTag }
  | { name: 'no-profile' }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const SLOW_AFTER_MS = 15000

function useSetup(): { setup: Setup; retry: () => void } {
  const [setup, setSetup] = useState<Setup>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [wardrobe, auth] = await Promise.all([fetch('/api/wardrobe?ownership=owned'), supabase.auth.getUser()])
      if (!wardrobe.ok || !auth.data.user) throw new Error('load failed')
      const json = await wardrobe.json()
      const { data: row, error } = await supabase.from('users').select('colour_season').eq('id', auth.data.user.id).maybeSingle()
      if (error) throw error
      const season = SEASONS.find((s) => s === row?.colour_season) ?? null
      if (!cancelled) setSetup({ status: 'ready', items: json.items ?? [], season })
    }
    load().catch(() => {
      if (!cancelled) setSetup({ status: 'error' })
    })
    return () => { cancelled = true }
  }, [attempt])
  return {
    setup,
    retry: () => {
      setSetup({ status: 'loading' })
      setAttempt((a) => a + 1)
    },
  }
}

function Hero({ children }: { children: string }) {
  return (
    <h1 key={children} className="animate-rise font-display text-[76px] font-extrabold uppercase leading-[0.9] tracking-[-1px] text-(--on-block)">
      {children}
    </h1>
  )
}

function OccasionPicker({
  readiness,
  selected,
  onSelect,
}: {
  readiness: Readiness[]
  selected: OccasionTag | null
  onSelect: (o: OccasionTag) => void
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Occasion</legend>
      {OCCASIONS.map((o) => {
        const dark = isDarkOccasion(o)
        const r = readiness.find((x) => x.occasion === o)
        return (
          <label
            key={o}
            style={{ backgroundColor: occasionColour(o) }}
            className={`relative flex min-h-[104px] cursor-pointer items-center gap-3 border-[1.5px] border-ink p-4 has-[:checked]:border-[3px] has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 ${
              dark ? 'text-on-dark has-[:focus-visible]:outline-ink' : 'text-ink has-[:focus-visible]:outline-ink'
            }`}
          >
            <input
              type="radio"
              name="occasion"
              value={o}
              checked={selected === o}
              onChange={() => onSelect(o)}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[34px] font-extrabold uppercase leading-none">{OCCASION_LABELS[o]}</span>
              <span className="mt-1 block text-sm">{OCCASION_DESCRIPTIONS[o]}</span>
              {r && !r.ready && (
                <span className={`mt-1 block font-display text-[13px] font-bold uppercase tracking-[1px] ${dark ? 'text-signal' : 'text-ink'}`}>
                  <span aria-hidden="true">· </span>
                  {r.status}
                </span>
              )}
            </span>
            <span
              aria-hidden="true"
              className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center border-2 text-lg ${
                dark ? 'border-on-dark' : 'border-ink'
              } ${selected === o ? (dark ? 'bg-on-dark text-ink' : 'bg-ink text-on-dark') : 'text-transparent'}`}
            >
              ✓
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function StyleMeContent() {
  const params = useSearchParams()
  const online = useOnline()
  const last = useLastOccasion()
  const { setup, retry } = useSetup()
  const fromLink = params.get('occasion')
  const [picked, setPicked] = useState<OccasionTag | null>(isOccasion(fromLink) ? fromLink : null)
  const selected = picked ?? last
  const [phase, setPhase] = useState<Phase>({ name: 'picker' })
  const [saves, setSaves] = useState<Record<string, SaveState>>({})
  const [index, setIndex] = useState(0)
  const slider = useRef<HTMLDivElement>(null)
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runId = useRef(0)

  const [gapStatus, setGapStatus] = useState<GapStatus | null>(null)
  const [openGap, setOpenGap] = useState<GapRow | null>(null)
  const gapsShown = phase.name === 'results' || phase.name === 'not-enough'
  useEffect(() => {
    if (!gapsShown) return
    let cancelled = false
    // The status call never searches. Any failure reads as "not available".
    fetch('/api/gaps/status')
      .then(async (res) => (res.ok ? ((await res.json()) as GapStatus) : ({ status: 'unavailable' } as GapStatus)))
      .catch((): GapStatus => ({ status: 'unavailable' }))
      .then((next) => { if (!cancelled) setGapStatus(next) })
    return () => { cancelled = true }
  }, [gapsShown])

  const items = setup.status === 'ready' ? setup.items : []
  const season = setup.status === 'ready' ? setup.season : null
  const readiness = useMemo(() => outfitReadiness(setup.status === 'ready' ? setup.items : []), [setup])

  const clearSlow = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current)
    slowTimer.current = null
  }
  useEffect(() => clearSlow, [])

  const run = useCallback(async (occasion: OccasionTag) => {
    const id = ++runId.current
    rememberOccasion(occasion)
    setPicked(occasion)
    setIndex(0)
    setSaves({})
    setPhase({ name: 'loading', occasion, slow: false })
    clearSlow()
    slowTimer.current = setTimeout(() => {
      setPhase((p) => (p.name === 'loading' && runId.current === id ? { ...p, slow: true } : p))
    }, SLOW_AFTER_MS)
    let result
    try {
      const res = await fetch('/api/outfits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion }),
      })
      result = readGenerateResponse(res.status, await res.json().catch(() => null))
    } catch {
      result = { kind: 'error' as const }
    }
    if (runId.current !== id) return
    clearSlow()
    if (result.kind === 'outfits') setPhase({ name: 'results', occasion, outfits: result.outfits, missing: result.missing, limited: result.limited })
    else if (result.kind === 'not-enough') setPhase({ name: 'not-enough', occasion, missing: result.missing, have: result.have })
    else if (result.kind === 'no-profile') setPhase({ name: 'no-profile' })
    else setPhase({ name: 'failed', occasion })
  }, [])

  async function save(i: number, outfit: StyledOutfit) {
    const key = `${i}:${outfit.name}`
    setSaves((s) => ({ ...s, [key]: 'saving' }))
    try {
      const res = await fetch('/api/outfits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveBody(outfit, season)),
      })
      if (!res.ok) throw new Error('save failed')
      setSaves((s) => ({ ...s, [key]: 'saved' }))
    } catch {
      setSaves((s) => ({ ...s, [key]: 'error' }))
    }
  }

  function goTo(next: number, count: number) {
    const el = slider.current
    const target = Math.min(Math.max(next, 0), count - 1)
    setIndex(target)
    el?.scrollTo({ left: target * (el.clientWidth + 12), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const backToPicker = () => {
    runId.current++
    clearSlow()
    setPhase({ name: 'picker' })
  }

  if (setup.status === 'loading') {
    return (
      <main aria-busy="true" className="px-6 pt-10">
        <p role="status" className="sr-only">Loading…</p>
        <Skeleton className="mb-4 h-14 w-48" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px]" />)}
        </div>
      </main>
    )
  }
  if (setup.status === 'error') {
    return (
      <main className="mx-auto max-w-[480px] px-6 pt-10">
        <h1 className="mb-4 font-display text-[56px] font-extrabold uppercase leading-none">Style me</h1>
        <ErrorState message="Couldn't load your wardrobe." onRetry={retry} />
      </main>
    )
  }

  const noProfileView = (
    <main className="mx-auto max-w-[480px] px-6 pt-10">
      <h1 className="mb-4 font-display text-[56px] font-extrabold uppercase leading-none">Style me</h1>
      <div className="flex flex-col items-start gap-4">
        <p className="text-base font-semibold">Take a selfie first, so outfits can follow your colours.</p>
        <ButtonLink href={SELFIE_FROM_PROFILE_HREF}>Take my selfie</ButtonLink>
        <ButtonLink href="/onboarding/profile?manual=1" variant="secondary">Enter my details by hand</ButtonLink>
      </div>
    </main>
  )
  if (!season || phase.name === 'no-profile') return noProfileView

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-[480px] px-6 pt-10">
        <h1 className="mb-4 font-display text-[56px] font-extrabold uppercase leading-none">Style me</h1>
        <EmptyState
          title="Your wardrobe is empty"
          action={<ButtonLink href={addHref(null, null)} fullWidth={false}>Add a piece</ButtonLink>}
        >
          Add a top, a bottom and a pair of shoes to get your first outfits.
        </EmptyState>
      </main>
    )
  }

  if (phase.name === 'picker') {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-6 pb-8 pt-10 lg:px-10">
        <h1 className="font-display text-[56px] font-extrabold uppercase leading-none">Style me</h1>
        <p className="mb-5 mt-2 text-[15px] text-ink-2">{pickerSubtitle(season)}</p>
        <div className="lg:[&_fieldset]:grid lg:[&_fieldset]:grid-cols-4">
          <OccasionPicker readiness={readiness} selected={selected} onSelect={setPicked} />
        </div>
        <div className="mt-5 flex flex-col gap-2 lg:max-w-[480px]">
          {!online && <p role="status" className="text-[15px] font-semibold">You&apos;re offline. Connect to the internet to get new outfits.</p>}
          <Button disabled={!selected || !online} onClick={() => selected && run(selected)}>
            {styleButtonLabel(selected)}
          </Button>
          {last && <p className="text-sm text-ink-2">Last time you picked {OCCASION_LABELS[last]}.</p>}
        </div>
      </main>
    )
  }

  const occasion = phase.occasion
  const block = (
    <ScreenBlock theme={occasionTheme(occasion)}>
      <Kicker>Style me</Kicker>
      <Hero>{OCCASION_LABELS[occasion]}</Hero>
      <p className="mt-3 text-[15px] text-(--on-block-2)">{pickerSubtitle(season)}</p>
    </ScreenBlock>
  )
  const frame = (children: React.ReactNode) => (
    <main data-occasion={occasionTheme(occasion)}>
      {block}
      <div className="mx-auto w-full max-w-[1120px] px-6 pb-8 pt-6 lg:px-10">{children}</div>
    </main>
  )

  const gapCard = (
    <div className="mt-8 w-full max-w-[480px]">
      <FillTheGapsCard
        rows={gapRows(items, occasion, gapStatus?.status === 'ready' ? gapStatus.department : DEFAULT_DEPARTMENT)}
        status={gapStatus}
        online={online}
        occasion={occasion}
        seasonName={SEASON_NAMES[season]}
        onOpen={(row) => setOpenGap(row)}
      />
      {gapStatus?.status === 'ready' && (
        <GapSuggestionsSheet
          row={openGap}
          occasion={occasion}
          tier={gapStatus.tier}
          range={openGap ? gapStatus.ranges[openGap.category] : [0, 0]}
          season={season}
          online={online}
          onClose={() => setOpenGap(null)}
        />
      )}
    </div>
  )

  if (phase.name === 'loading') {
    return frame(
      <div aria-busy="true">
        <p role="status" aria-live="polite" className="mb-4 text-[15px] font-semibold">
          {loadingLine(occasion)}
          {phase.slow && <span className="mt-1 block font-medium text-ink-2">Still working on it…</span>}
        </p>
        <Skeleton className="h-[420px] max-w-[480px]" />
      </div>,
    )
  }

  if (phase.name === 'failed') {
    return frame(
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-base font-semibold">We couldn&apos;t put outfits together just now. Please try again.</p>
        <Button fullWidth={false} onClick={() => run(occasion)}>Try again</Button>
        <Button variant="text" onClick={backToPicker}>Change occasion</Button>
      </div>,
    )
  }

  if (phase.name === 'not-enough') {
    const missing = phase.missing.length > 0 ? phase.missing : (['tops'] as RequiredCategory[])
    const ready = readyLine(occasion, phase.have)
    return frame(
      <div className="flex max-w-[480px] flex-col items-start gap-3">
        <h2 className="font-display text-[31px] font-extrabold uppercase leading-[1.05]">{notEnoughTitle(occasion)}</h2>
        <p className="text-base">{notEnoughIntro(occasion)}</p>
        <ul className="list-disc pl-5 text-base font-semibold">
          {missing.map((c) => <li key={c}>{missingPieceLine(c, occasion)}</li>)}
        </ul>
        {ready && <p className="text-[15px] text-ink-2">{ready}</p>}
        <div className="mt-2 flex w-full flex-col gap-3">
          <ButtonLink href={addHref(missing[0], occasion)}>Add a piece</ButtonLink>
          <Button variant="secondary" onClick={backToPicker}>Try another occasion</Button>
        </div>
        {gapCard}
      </div>,
    )
  }

  const { outfits } = phase
  const accent = SEASON_ACCENTS[season]
  const count = outfits.length
  return frame(
    <>
      <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <p aria-live="polite" className="font-display text-[15px] font-bold uppercase tracking-[1.5px]">
          Outfit {index + 1} of {count}
        </p>
        {count > 1 && <div aria-hidden="true" className="flex gap-1.5">
          {outfits.map((o, i) => (
            <span key={o.name + i} className={`h-2.5 w-2.5 border-[1.5px] border-ink ${i === index ? 'bg-ink' : 'bg-card'}`} />
          ))}
        </div>}
      </div>
      <div
        ref={slider}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${OCCASION_LABELS[occasion]} outfits`}
        tabIndex={0}
        onScroll={(e) => setIndex(slideIndex(e.currentTarget.scrollLeft, e.currentTarget.clientWidth + 12, count))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1, count) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1, count) }
        }}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:items-start lg:overflow-visible"
      >
        {outfits.map((o, i) => {
          const key = `${i}:${o.name}`
          const state = saves[key] ?? 'idle'
          return (
            <div
              key={key}
              role="group"
              aria-roledescription="slide"
              aria-label={`Outfit ${i + 1} of ${count}`}
              className="w-full shrink-0 snap-center lg:w-auto lg:shrink"
            >
              <HangTag
                kicker={`Outfit ${i + 1} / ${count}`}
                name={o.name}
                reason={o.reason}
                accent={accent}
                pieces={sortPieces(o.pieces.map((p) => ({ key: p.item_id, label: p.label, category: p.category, imageUrl: p.image_url, removed: false })))}
              >
                {state === 'saved' ? (
                  <div role="status" className="flex flex-col gap-2">
                    <p className="inline-flex h-13 w-full items-center justify-center border-2 border-ink bg-card font-display text-[15px] font-bold uppercase tracking-[1px]">
                      <span aria-hidden="true">✓&nbsp;</span>Saved
                    </p>
                    <Link href="/saved" className="inline-flex min-h-11 items-center font-sans text-[15px] font-semibold underline decoration-[1.5px] underline-offset-4">
                      See saved outfits
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" busy={state === 'saving'} busyLabel="Saving…" onClick={() => save(i, o)}>
                      Save outfit
                    </Button>
                    {state === 'error' && <p role="alert" className="text-[13px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>Couldn&apos;t save. Try again.</p>}
                  </div>
                )}
              </HangTag>
            </div>
          )
        })}
      </div>
      {count > 1 && (
        <div className="mt-3 flex gap-3 lg:hidden">
          <Button variant="secondary" disabled={index === 0} onClick={() => goTo(index - 1, count)}>Previous</Button>
          <Button variant="secondary" disabled={index === count - 1} onClick={() => goTo(index + 1, count)}>Next</Button>
        </div>
      )}
      {count < 3 && (
        <p role="status" className="mt-4 text-[15px] font-semibold">
          {phase.limited ? fewerMessage(count, occasion, phase.missing) : fewerFromModelMessage(count, occasion)}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3 lg:max-w-[480px]">
        {phase.limited ? (
          <ButtonLink href={addHref(phase.missing ?? 'tops', occasion)}>Add a piece</ButtonLink>
        ) : (
          <Button disabled={!online} onClick={() => run(occasion)}>{count < 3 ? 'Try again' : 'Show 3 more'}</Button>
        )}
        <Button variant="secondary" onClick={backToPicker}>Change occasion</Button>
        {!online && <p role="status" className="text-sm text-ink-2">You&apos;re offline. Connect to the internet to get new outfits.</p>}
      </div>
      {gapCard}
    </>,
  )
}

export default function StyleMePage() {
  return (
    <Suspense fallback={null}>
      <StyleMeContent />
    </Suspense>
  )
}
