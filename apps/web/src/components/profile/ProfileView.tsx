'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ColourSeason, StylePref } from '@fashun/shared'
import { SEASON_DESCRIPTIONS } from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { colourName } from '@/lib/colour-names'
import {
  NOT_SURE,
  SEASON_NAMES,
  SKIN_TONE_NAMES,
  STYLE_NAMES,
  UNDERTONE_NAMES,
  seasonHeadline,
  traitLabel,
} from '@/lib/profile-view'
import { ColourCard } from '@/components/ui/ColourSwatch'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Kicker, ScreenBlock } from '@/components/ui/Onboarding'

export interface ProfileData {
  season: ColourSeason | null
  skinTone: string | null
  undertone: string | null
  hair: string | null
  eyes: string | null
  best: string[]
  avoid: string[]
  styles: StylePref[]
}

const SEASONS: ColourSeason[] = ['spring', 'summer', 'autumn', 'winter']
const isSeason = (value: string | null): value is ColourSeason =>
  SEASONS.some((s) => s === value)

export async function loadProfile(): Promise<ProfileData | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('users')
    .select('colour_season, skin_depth, skin_undertone, hair_colour, eye_colour, best_colours, avoid_colours, suggested_styles')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const depth = data.skin_depth as keyof typeof SKIN_TONE_NAMES | null
  const undertone = data.skin_undertone as keyof typeof UNDERTONE_NAMES | null
  return {
    season: isSeason(data.colour_season) ? data.colour_season : null,
    skinTone: depth && SKIN_TONE_NAMES[depth] ? SKIN_TONE_NAMES[depth] : null,
    undertone: undertone && UNDERTONE_NAMES[undertone] ? UNDERTONE_NAMES[undertone] : null,
    hair: data.hair_colour,
    eyes: data.eye_colour,
    best: data.best_colours ?? [],
    avoid: data.avoid_colours ?? [],
    styles: (data.suggested_styles ?? []) as StylePref[],
  }
}

function useProfile() {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; profile: ProfileData | null }
  >({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    loadProfile().then(
      (profile) => { if (!cancelled) setState({ status: 'ready', profile }) },
      () => { if (!cancelled) setState({ status: 'error' }) },
    )
    return () => { cancelled = true }
  }, [attempt])
  const load = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])
  return { state, load }
}

function Reveal({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="animate-reveal" style={{ animationDelay: `${Math.min(index * 60, 540)}ms` }}>
      {children}
    </div>
  )
}

function TraitRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 border-b-[1.5px] border-ink py-2 last:border-b-0">
      <span className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">{label}</span>
      <span className={`text-base font-medium ${value === NOT_SURE ? 'text-ink-2' : ''}`}>{value}</span>
    </li>
  )
}

function ColourGrid({ title, hexes, avoid = false }: { title: string; hexes: string[]; avoid?: boolean }) {
  return (
    <section aria-labelledby={`grid-${title}`}>
      <h2 id={`grid-${title}`} className="mb-3 font-display text-[22px] font-extrabold uppercase">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {hexes.map((hex) => (
          <ColourCard key={hex} hex={hex} name={colourName(hex)} avoid={avoid} />
        ))}
      </ul>
    </section>
  )
}

/** Read-only colour profile: season hero, selfie line, traits, colours and styles. */
export default function ProfileView({
  headline,
  footer,
}: {
  /** 'reveal' words the hero as "You're an Autumn"; 'tab' shows the season word alone. */
  headline: 'reveal' | 'tab'
  footer?: ReactNode
}) {
  const { state, load } = useProfile()

  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">Loading your profile…</p>
        <div data-occasion="house">
          <ScreenBlock><Skeleton className="h-24 w-3/4 bg-step-todo" /></ScreenBlock>
        </div>
        <div className="flex flex-col gap-4 px-6 py-8">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[54px]" />)}
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="px-6 py-8">
        <ErrorState message="Couldn't load your profile." onRetry={load} />
      </div>
    )
  }

  const { profile } = state
  if (!profile || !profile.season) {
    return (
      <div className="px-6 py-8">
        <p className="text-base">Take a selfie to find your colour season and the colours that suit you.</p>
      </div>
    )
  }

  const season = profile.season
  const heroWord = headline === 'reveal' ? seasonHeadline(season) : SEASON_NAMES[season]
  return (
    <div data-occasion="house">
      <ScreenBlock>
        <Kicker>Your colour season</Kicker>
        <h1
          className={`mt-2 animate-reveal font-display font-extrabold uppercase tracking-[-1px] ${
            headline === 'reveal' ? 'text-[52px] leading-none' : 'text-[76px] leading-[0.9]'
          }`}
        >
          {heroWord}
        </h1>
        <p className="mt-3 max-w-[480px] text-base leading-[1.4] text-(--on-block-2)">
          {SEASON_DESCRIPTIONS[season]}
        </p>
        <p className="mt-4 text-[15px] font-semibold text-(--on-block)">
          <span aria-hidden="true">🔒 </span>Your selfie isn&apos;t kept. Only the results are saved.
        </p>
      </ScreenBlock>

      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-6 py-8 lg:grid lg:grid-cols-2 lg:gap-12 lg:px-10">
        <div className="flex flex-col gap-8">
          <Reveal index={1}>
            <section aria-labelledby="about-you">
              <h2 id="about-you" className="mb-1 font-display text-[22px] font-extrabold uppercase">About you</h2>
              <ul className="border-y-[1.5px] border-ink">
                <TraitRow label="Skin tone" value={traitLabel(profile.skinTone)} />
                <TraitRow label="Undertone" value={traitLabel(profile.undertone)} />
                <TraitRow label="Hair" value={traitLabel(profile.hair)} />
                <TraitRow label="Eyes" value={traitLabel(profile.eyes)} />
                <TraitRow label="Season" value={SEASON_NAMES[season]} />
              </ul>
            </section>
          </Reveal>
          <Reveal index={4}>
            <section aria-labelledby="styles">
              <h2 id="styles" className="mb-3 font-display text-[22px] font-extrabold uppercase">Styles that suit you</h2>
              <ul className="flex flex-wrap gap-2">
                {profile.styles.map((style) => (
                  <li key={style} className="border-[1.5px] border-ink bg-card px-3 py-2 font-display text-[15px] font-bold uppercase tracking-[1px]">
                    {STYLE_NAMES[style] ?? traitLabel(style)}
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        </div>
        <div className="flex flex-col gap-8">
          <Reveal index={2}><ColourGrid title="Wear these" hexes={profile.best} /></Reveal>
          <Reveal index={3}><ColourGrid title="Skip these" hexes={profile.avoid} avoid /></Reveal>
        </div>
        {footer && <div className="lg:col-span-2">{footer}</div>}
      </div>
    </div>
  )
}
