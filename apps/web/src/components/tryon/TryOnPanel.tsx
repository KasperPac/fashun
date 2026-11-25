'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState, Notice, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Overlays'
import { PieceTile } from '@/components/outfits/HangTag'
import { savedDate } from '@/lib/saved-outfits'
import { TRY_ON_LABEL } from '@/lib/try-on'
import {
  FAILED_BODY, FAILED_TITLE, LOST_BODY, LOST_NOT_YET, LOST_TITLE, NO_PHOTO_LINE, PAUSED_BODY, besideLine, pausedTitle, planPanel,
  type BesidePiece, type PanelPiece, type PanelPlan,
} from '@/lib/try-on-panel'
import {
  LOAD_FAILED, checkPicture, createRunner, loadPanel, progressLines, reloadPicture as fetchPicture, whenOnline,
  type PanelApi, type PanelState, type Picture,
} from '@/lib/try-on-panel-client'
import { CONSENT_FAILED, recordConsent } from '@/lib/try-on-photo-client'
import TryOnFrame from './TryOnFrame'
import { PrivacyStep } from './TryOnPhotoSection'

export type Phase = 'idle' | 'working' | 'failed' | 'lost'

const realApi: PanelApi = { fetch: (input, init) => fetch(input, init) }

function Beside({ beside, line }: { beside: BesidePiece[]; line: string }) {
  return (
    <div>
      <p className="text-[15px] font-semibold">{line}</p>
      <ul className="mt-2 flex flex-wrap gap-3">
        {beside.map((b, i) => (
          <PieceTile
            key={`${b.piece.label}-${i}`}
            size="sm"
            piece={{ key: `${b.piece.label}-${i}`, label: b.piece.label, category: b.piece.category, imageUrl: b.piece.imageUrl, removed: b.piece.removed }}
          />
        ))}
      </ul>
    </div>
  )
}

export interface TryOnPanelViewProps {
  outfitName: string
  plan: PanelPlan
  state: Extract<PanelState, { kind: 'ready' }>
  picture: Picture | null
  phase: Phase
  elapsedMs: number
  onStart: () => void
  onTryAgain: () => void
  /** Looks again at the saved picture (free). */
  onCheck?: () => void
  /** True after a check that found nothing new. */
  notYet?: boolean
  /** True when the picture's address failed to load; shows a waiting state and a free check. */
  imageBroken?: boolean
  onImageError?: () => void
  /** Called with the label line, which takes focus when a picture arrives. */
  onLabel?: (el: HTMLParagraphElement | null) => void
  announce?: string
  /** Set when the person must agree to the privacy note before a picture is made. */
  agree?: { busy: boolean; error: string | null; onAgree: () => void; onNotNow: () => void } | null
}

/** Everything the "On you" panel shows once its state has loaded (states 3b to 3i). */
export function TryOnPanelView({ outfitName, plan, state, picture, phase, elapsedMs, onStart, onTryAgain, onCheck, notYet, imageBroken, onImageError, onLabel, announce, agree }: TryOnPanelViewProps) {
  const beside = plan.kind === 'ready' ? plan.beside : []
  const line = besideLine(beside)
  const paused = state.paused ? pausedTitle(state.resumeOn) ?? 'Try-on is paused' : null

  if (!state.hasPhoto) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px]">{NO_PHOTO_LINE}</p>
        <ButtonLink href="/profile#try-on-photo" variant="secondary">Add a try-on photo</ButtonLink>
      </div>
    )
  }

  const working = phase === 'working'
  const images = plan.kind === 'ready' ? plan.images : 1
  const progress = working ? progressLines(images, elapsedMs) : null

  return (
    <div className="flex flex-col gap-4">
      {working ? (
        <TryOnFrame variant="progress" src={picture?.url ?? state.photoUrl} />
      ) : picture ? (
        <TryOnFrame variant="picture" src={picture.url} alt={`You wearing ${outfitName}`} broken={imageBroken} onImageError={onImageError} />
      ) : null}

      {progress && (
        <div className="flex flex-col gap-1">
          <p role="status" aria-live="polite" className="text-[15px] font-semibold">{progress.status}</p>
          {progress.stillWorking && <p className="text-[15px]">Still working. This can take up to a minute and a half.</p>}
          <p className="text-[13px] text-ink-2">Keep this page open until it&apos;s done.</p>
        </div>
      )}

      {!working && picture && (
        <div>
          <p ref={onLabel} tabIndex={-1} className="text-[13px] text-ink-2 outline-offset-2">{TRY_ON_LABEL}</p>
          {picture.madeAt && savedDate(picture.madeAt) && <p className="text-[13px] text-ink-2">Made {savedDate(picture.madeAt)}</p>}
        </div>
      )}
      <p role="status" className="sr-only">{announce ?? ''}</p>

      {!working && line && picture && <Beside beside={beside} line={line} />}

      {phase === 'failed' && (
        <div role="alert">
          <Notice title={FAILED_TITLE} focusTitle>{FAILED_BODY}</Notice>
        </div>
      )}

      {!working && picture && imageBroken && phase !== 'lost' && (
        <Button variant="secondary" onClick={onCheck}>Check for my picture</Button>
      )}

      {phase === 'lost' && (
        <div role="alert" className="flex flex-col gap-2">
          <Notice title={LOST_TITLE} focusTitle>{notYet ? `${LOST_NOT_YET} ${LOST_BODY}` : LOST_BODY}</Notice>
          <Button variant="secondary" onClick={onCheck}>Check for my picture</Button>
        </div>
      )}

      {!working && phase !== 'lost' && (
        agree ? (
          <PrivacyStep busy={agree.busy} error={agree.error} onAgree={agree.onAgree} onNotNow={agree.onNotNow} />
        ) : plan.kind === 'missing' ? (
          <Notice title={plan.title}>
            Tap the piece <span className="lg:hidden">above</span><span className="hidden lg:inline">on the left</span> to add its photo.
          </Notice>
        ) : paused ? (
          <div role="status"><Notice title={paused}>{PAUSED_BODY}</Notice></div>
        ) : picture ? (
          <Button variant="secondary" onClick={onTryAgain}>Try again</Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button onClick={onStart}>See it on me</Button>
            <p className="text-[13px] text-ink-2">Takes up to a minute and a half.</p>
          </div>
        )
      )}
    </div>
  )
}

/** The "On you" panel on a saved outfit. Renders nothing when try-on is switched off. */
export default function TryOnPanel({
  outfitId,
  outfitName,
  pieces,
  onAvailable,
  api = realApi,
}: {
  outfitId: string
  outfitName: string
  pieces: PanelPiece[]
  onAvailable?: (available: boolean) => void
  api?: PanelApi
}) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PanelState | null>(null)
  // The first load asks as FASHN would (only FASHN reads the count); the answer names the provider the plan then follows.
  const provider = state?.kind === 'ready' ? state.provider : 'fashn'
  const plan = useMemo(() => planPanel(pieces, provider), [pieces, provider])
  const images = useMemo(() => { const p = planPanel(pieces, 'fashn'); return p.kind === 'ready' ? p.images : 1 }, [pieces])
  const [picture, setPicture] = useState<Picture | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [paused, setPaused] = useState<{ resumeOn: string | null } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [agree, setAgree] = useState<{ regenerate: boolean; busy: boolean; error: string | null } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [announce, setAnnounce] = useState('')
  const [arrived, setArrived] = useState(false)
  const [notYet, setNotYet] = useState(false)
  const [imageBroken, setImageBroken] = useState(false)
  const [runner] = useState(() => createRunner(api))

  useEffect(() => {
    let cancelled = false
    loadPanel(api, outfitId, images).then((s) => {
      if (cancelled) return
      setState(s)
      onAvailable?.(s.kind !== 'off')
      if (s.kind === 'ready') { setPicture(s.picture); setImageBroken(false) }
    })
    return () => { cancelled = true }
  }, [api, outfitId, images, attempt, onAvailable])

  useEffect(() => {
    if (phase !== 'working') return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - started), 1000)
    return () => clearInterval(t)
  }, [phase])

  // A new picture takes focus on its label line, so it is announced and the person lands on it.
  const focusLabel = useCallback((el: HTMLParagraphElement | null) => { if (el && arrived) el.focus() }, [arrived])

  function run(regenerate: boolean) {
    const started = runner.start(outfitId, { regenerate, previousMadeAt: picture?.madeAt ?? null })
    if (!started) return // a second tap while one is running does nothing
    setConfirm(false)
    setNotYet(false)
    setArrived(false)
    setElapsed(0)
    setPhase('working')
    void started.then((r) => {
      if (r.kind === 'picture') {
        setPicture(r.picture)
        setImageBroken(false)
        setPhase('idle')
        setArrived(true)
        setAnnounce('Your try-on is ready.')
      } else if (r.kind === 'consent') {
        setAgree({ regenerate, busy: false, error: null })
        setPhase('idle')
      } else if (r.kind === 'paused') {
        setPaused({ resumeOn: r.resumeOn })
        setPhase('idle')
      } else {
        setPhase(r.kind === 'lost' ? 'lost' : 'failed')
      }
    })
  }

  async function agreeAndRun() {
    if (!agree) return
    setAgree({ ...agree, busy: true, error: null })
    if (!(await recordConsent({ fetch: (input, init) => api.fetch(String(input), init) }))) { setAgree({ ...agree, busy: false, error: CONSENT_FAILED }); return }
    setAgree(null)
    run(agree.regenerate)
  }

  // Only looks (a free read); never starts a new picture.
  const check = useCallback(() => {
    void checkPicture(api, outfitId, picture?.madeAt ?? null).then((r) => {
      if (r.kind === 'picture') {
        setPicture(r.picture)
        setImageBroken(false)
        setPhase('idle')
        setNotYet(false)
        setArrived(true)
        setAnnounce('Your try-on is ready.')
      } else {
        setNotYet(r.kind === 'none')
      }
    })
  }, [api, outfitId, picture])

  // The picture's address failed to load: look again (free GET, never a new try-on) and load it again.
  const reloadPicture = useCallback(() => {
    void fetchPicture(api, outfitId).then((p) => {
      if (p) {
        setPicture({ ...p })
        setImageBroken(false)
      }
    })
  }, [api, outfitId])

  useEffect(() => {
    if (phase !== 'lost') return
    return whenOnline(check)
  }, [phase, check])

  useEffect(() => {
    if (!imageBroken) return
    return whenOnline(reloadPicture)
  }, [imageBroken, reloadPicture])

  if (state === null) {
    return (
      <section aria-labelledby="on-you" aria-busy="true" className="border-2 border-ink bg-card p-5">
        <h2 id="on-you" className="mb-3 font-display text-[22px] font-extrabold uppercase">On you</h2>
        <Skeleton className="aspect-[3/4] w-full" />
      </section>
    )
  }
  if (state.kind === 'off') return null

  return (
    <section aria-labelledby="on-you" className="border-2 border-ink bg-card p-5">
      <h2 id="on-you" className="mb-3 font-display text-[22px] font-extrabold uppercase">On you</h2>
      {state.kind === 'error' ? (
        <ErrorState message={LOAD_FAILED} onRetry={() => { setState(null); setAttempt((a) => a + 1) }} />
      ) : (
        <TryOnPanelView
          outfitName={outfitName}
          plan={plan}
          state={paused ? { ...state, paused: true, resumeOn: paused.resumeOn } : state}
          picture={picture}
          phase={phase}
          elapsedMs={elapsed}
          onStart={() => run(false)}
          onTryAgain={() => setConfirm(true)}
          onCheck={phase !== 'lost' && imageBroken ? reloadPicture : check}
          imageBroken={imageBroken}
          onImageError={() => setImageBroken(true)}
          notYet={notYet}
          onLabel={focusLabel}
          announce={announce}
          agree={agree && { busy: agree.busy, error: agree.error, onAgree: () => { void agreeAndRun() }, onNotNow: () => setAgree(null) }}
        />
      )}
      <ConfirmDialog
        open={confirm}
        title="Make a new picture?"
        body="This uses some of this month's try-ons. Your current picture is replaced when the new one is ready."
        confirmLabel="Make new picture"
        destructive={false}
        onCancel={() => setConfirm(false)}
        onConfirm={() => run(true)}
      />
    </section>
  )
}
