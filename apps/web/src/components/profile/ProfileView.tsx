'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { ColourSeason, StylePref } from '@fashun/shared'
import { SEASON_DESCRIPTIONS, getProfileColours } from '@fashun/shared'
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
import { SELFIE_FROM_PROFILE_HREF } from '@/lib/onboarding-back'
import { Banner, ErrorState, Skeleton, Toast } from '@/components/ui/Feedback'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Overlays'
import { SeasonSheet, StylesSheet, TraitSheet } from './ProfileSheets'
import {
  TRAITS,
  changeLabel,
  currentOptionValue,
  seasonSavedMessage,
  type TraitKey,
} from '@/lib/profile-edit'
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

function Reveal({ index, children, className = '' }: { index: number; children: ReactNode; className?: string }) {
  return (
    <div className={`animate-reveal ${className}`} style={{ animationDelay: `${Math.min(index * 60, 540)}ms` }}>
      {children}
    </div>
  )
}

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** A 48px tap target: label, current value, chevron. Opens the picker for that trait. */
function TraitRow({ label, value, ariaLabel, onClick }: { label: string; value: string; ariaLabel: string; onClick: () => void }) {
  return (
    <li className="border-b-[1.5px] border-ink last:border-b-0">
      <button type="button" onClick={onClick} aria-label={ariaLabel} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left">
        <span className="font-display text-[13px] font-bold uppercase tracking-[1.5px] text-ink-2">{label}</span>
        <span className="flex items-center gap-2">
          <span className={`text-base font-medium ${value === NOT_SURE ? 'text-ink-2' : ''}`}>{value}</span>
          <Chevron />
        </span>
      </button>
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

type Editing = TraitKey | 'styles' | 'season' | null

async function saveProfile(patch: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/onboarding/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return res.ok
  } catch {
    return false
  }
}

const SAVE_FAILED = "Couldn't save. Check your connection and try again."

/** Colour profile: season hero, selfie line, tap-to-change traits, colours and styles. */
export default function ProfileView({
  headline,
  footer,
  manual = false,
  selfieHref = SELFIE_FROM_PROFILE_HREF,
}: {
  /** 'reveal' words the hero as "You're an Autumn"; 'tab' shows the season word alone. */
  headline: 'reveal' | 'tab'
  footer?: ReactNode
  /** Start in "enter my details by hand" mode when there is no profile yet. */
  manual?: boolean
  /** Where Take my selfie / Retake go. Profile keeps the default (Back returns to Profile); onboarding step 2 passes its own so Sign out stays. */
  selfieHref?: string
}) {
  const router = useRouter()
  const { state, load } = useProfile()
  const [edits, setEdits] = useState<Partial<ProfileData>>({})
  const [editing, setEditing] = useState<Editing>(null)
  const [draftStyles, setDraftStyles] = useState<StylePref[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [retakeOpen, setRetakeOpen] = useState(false)
  const [byHand, setByHand] = useState(manual)
  const clearToast = useCallback(() => setToast(null), [])

  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">Loading your profile…</p>
        <div data-occasion="house">
          <ScreenBlock theme="house"><Skeleton className="h-24 w-3/4 bg-step-todo" /></ScreenBlock>
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

  const loaded = state.profile
  const profile: ProfileData | null = loaded ? { ...loaded, ...edits } : null
  const hasSeason = !!profile?.season

  if ((!profile || !hasSeason) && !byHand) {
    return (
      <div className="flex max-w-[480px] flex-col items-start gap-4 px-6 py-8">
        <p className="text-base">Take a selfie to find your colour season and the colours that suit you.</p>
        <ButtonLink href={selfieHref}>Take my selfie</ButtonLink>
        <Button variant="text" onClick={() => setByHand(true)}>Enter my details by hand</Button>
      </div>
    )
  }

  const current: ProfileData = profile ?? {
    season: null, skinTone: null, undertone: null, hair: null, eyes: null, best: [], avoid: [], styles: [],
  }
  const season = current.season

  function open(next: Editing) {
    setSaveError(null)
    if (next === 'styles') setDraftStyles(current.styles)
    setEditing(next)
  }

  function close() {
    if (!saving) setEditing(null)
  }

  async function pickTrait(key: TraitKey, value: string) {
    const trait = TRAITS[key]
    setSaving(true)
    setSaveError(null)
    const ok = await saveProfile({ [trait.field]: value })
    setSaving(false)
    if (!ok) { setSaveError(SAVE_FAILED); return }
    const label = trait.options.find((o) => o.value === value)?.label ?? null
    const field = key === 'skin' ? 'skinTone' : key === 'undertone' ? 'undertone' : key === 'hair' ? 'hair' : 'eyes'
    setEdits((e) => ({ ...e, [field]: label }))
    setEditing(null)
    setToast('Saved.')
  }

  async function pickSeason(next: ColourSeason) {
    setSaving(true)
    setSaveError(null)
    const ok = await saveProfile({ colour_season: next })
    setSaving(false)
    if (!ok) { setSaveError(SAVE_FAILED); return }
    const colours = getProfileColours(next)
    setEdits((e) => ({ ...e, season: next, best: colours.best, avoid: colours.avoid }))
    setEditing(null)
    setBanner(seasonSavedMessage(next))
  }

  async function saveStyles() {
    setSaving(true)
    setSaveError(null)
    const ok = await saveProfile({ suggested_styles: draftStyles })
    setSaving(false)
    if (!ok) { setSaveError(SAVE_FAILED); return }
    setEdits((e) => ({ ...e, styles: draftStyles }))
    setEditing(null)
    setToast('Saved.')
  }

  const trait = editing && editing !== 'styles' && editing !== 'season' ? TRAITS[editing] : null
  const shown: Record<TraitKey, string | null> = {
    skin: current.skinTone, undertone: current.undertone, hair: current.hair, eyes: current.eyes,
  }
  const heroWord = !season ? 'Your colours' : headline === 'reveal' ? seasonHeadline(season) : SEASON_NAMES[season]

  return (
    <div data-occasion="house">
      <ScreenBlock theme="house">
        <Kicker>Your colour season</Kicker>
        <h1
          className={`mt-2 animate-reveal font-display font-extrabold uppercase tracking-[-1px] ${
            headline === 'reveal' || !season ? 'text-[52px] leading-none' : 'text-[76px] leading-[0.9]'
          }`}
        >
          {heroWord}
        </h1>
        <p className="mt-3 max-w-[480px] text-base leading-[1.4] text-(--on-block-2)">
          {season ? SEASON_DESCRIPTIONS[season] : 'Choose your season to see the colours that suit you.'}
        </p>
        <p className="mt-4 text-[15px] font-semibold text-(--on-block)">
          <span aria-hidden="true">🔒 </span>Your selfie isn&apos;t kept. Only the results are saved.
        </p>
      </ScreenBlock>

      {banner && (
        <div className="mx-auto max-w-[1120px] px-6 pt-6 lg:px-10">
          <Banner onDismiss={() => setBanner(null)}>{banner}</Banner>
        </div>
      )}

      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-6 py-8 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-8 lg:px-10">
        <Reveal index={1} className="lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="about-you">
            <h2 id="about-you" className="mb-1 font-display text-[22px] font-extrabold uppercase">About you</h2>
            <ul className="border-y-[1.5px] border-ink">
              {(Object.keys(TRAITS) as TraitKey[]).map((key) => (
                <TraitRow
                  key={key}
                  label={TRAITS[key].label}
                  value={traitLabel(shown[key])}
                  ariaLabel={changeLabel(TRAITS[key], shown[key])}
                  onClick={() => open(key)}
                />
              ))}
              <TraitRow
                label="Season"
                value={season ? SEASON_NAMES[season] : NOT_SURE}
                ariaLabel={`Change season, currently ${season ? SEASON_NAMES[season] : 'not set'}`}
                onClick={() => open('season')}
              />
            </ul>
          </section>
        </Reveal>
        <div key={season ?? 'none'} className="flex animate-fade-in flex-col gap-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {season ? (
            <>
              <Reveal index={2}><ColourGrid title="Wear these" hexes={current.best} /></Reveal>
              <Reveal index={3}><ColourGrid title="Skip these" hexes={current.avoid} avoid /></Reveal>
            </>
          ) : (
            <p className="text-[15px] text-ink-2">Pick a season to see your best colours.</p>
          )}
        </div>
        <Reveal index={4} className="lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="styles">
            <h2 id="styles" className="mb-3 font-display text-[22px] font-extrabold uppercase">Styles that suit you</h2>
            {current.styles.length > 0 ? (
              <ul className="mb-3 flex flex-wrap gap-2">
                {current.styles.map((style) => (
                  <li key={style} className="border-[1.5px] border-ink bg-card px-3 py-2 font-display text-[15px] font-bold uppercase tracking-[1px]">
                    {STYLE_NAMES[style] ?? traitLabel(style)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-[15px] text-ink-2">{NOT_SURE}</p>
            )}
            <Button variant="secondary" compact fullWidth={false} onClick={() => open('styles')}>Change</Button>
          </section>
        </Reveal>
        <div className="flex max-w-[480px] flex-col gap-3 lg:col-span-2">
          {headline === 'tab' && (
            <Button variant="secondary" onClick={() => setRetakeOpen(true)}>Retake selfie</Button>
          )}
          {footer}
        </div>
      </div>

      <TraitSheet
        trait={trait}
        current={trait ? currentOptionValue(trait, shown[trait.key]) : null}
        busy={saving}
        error={saveError}
        onPick={(value) => trait && pickTrait(trait.key, value)}
        onClose={close}
      />
      <SeasonSheet open={editing === 'season'} current={season} busy={saving} error={saveError} onPick={pickSeason} onClose={close} />
      <StylesSheet
        open={editing === 'styles'}
        selected={draftStyles}
        busy={saving}
        error={saveError}
        onChange={setDraftStyles}
        onDone={saveStyles}
        onClose={close}
      />
      <ConfirmDialog
        open={retakeOpen}
        title="Retake your selfie?"
        body="Your new results will replace your current profile, including anything you changed by hand."
        confirmLabel="Retake"
        destructive={false}
        onCancel={() => setRetakeOpen(false)}
        onConfirm={() => router.push(selfieHref)}
      />
      {toast && <Toast message={toast} onDone={clearToast} />}
    </div>
  )
}
