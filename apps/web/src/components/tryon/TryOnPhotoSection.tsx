'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { photoToJpegBlob } from '@/lib/image-resize'
import {
  CONSENT_FAILED, DELETE_FAILED, firstSheetStep, LOAD_FAILED, PHOTO_MAX_EDGE, PRIVACY_NOTE,
  deletePhoto, loadPhotoState, recordConsent, uploadPhoto,
  type PhotoApi, type PhotoState,
} from '@/lib/try-on-photo-client'
import { Button } from '@/components/ui/Button'
import { ErrorState, Toast } from '@/components/ui/Feedback'
import { BottomSheet, ConfirmDialog } from '@/components/ui/Overlays'
import TryOnFrame from './TryOnFrame'

export type ReadyPhotoState = Extract<PhotoState, { kind: 'ready' }>

const api: PhotoApi = {
  fetch: (input, init) => fetch(input, init),
  resize: (file) => photoToJpegBlob(file, PHOTO_MAX_EDGE),
}

/** Step 1 of adding a photo: the privacy note with I agree / Not now. */
export function PrivacyStep({ busy, error, onAgree, onNotNow }: { busy: boolean; error: string | null; onAgree: () => void; onNotNow: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-[1.4] text-ink">{PRIVACY_NOTE}</p>
      {error && <p role="alert" className="text-[15px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{error}</p>}
      <div className="flex flex-col gap-3">
        <Button busy={busy} busyLabel="I agree…" onClick={onAgree}>I agree</Button>
        <Button variant="text" onClick={onNotNow}>Not now</Button>
      </div>
    </div>
  )
}

/** Step 2: take or choose. The file inputs are only reachable from here, so nothing opens before I agree. */
export function PickStep({ replacing, onTake, onChoose }: { replacing: boolean; onTake: () => void; onChoose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">Full-length, plain background, facing the camera.</p>
      {replacing && <p className="text-[15px] text-ink-2">Your saved try-on pictures stay. Tap See it on me again to use the new photo.</p>}
      <Button onClick={onTake}>Take a photo</Button>
      <Button variant="secondary" onClick={onChoose}>Choose a photo</Button>
    </div>
  )
}

type Sheet = { step: 'privacy' | 'pick'; replacing: boolean } | null

/** "Your try-on photo": add, replace and delete the one photo used for See it on me. */
export default function TryOnPhotoSection({ initial }: { initial: PhotoState }) {
  const [state, setState] = useState<PhotoState>(initial)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [agreeBusy, setAgreeBusy] = useState(false)
  const [agreeError, setAgreeError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const focusReplace = useRef(false)
  const takeRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLInputElement>(null)
  const buttonsRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const savedUrl = state.kind === 'ready' ? state.photoUrl : null
  useEffect(() => {
    if (focusReplace.current && savedUrl) {
      focusReplace.current = false
      buttonsRef.current?.querySelector('button')?.focus()
    }
  }, [savedUrl])

  // Arriving from a saved outfit (/profile#try-on-photo): scroll to the section and focus its heading.
  useEffect(() => {
    if (window.location.hash === '#try-on-photo') {
      headingRef.current?.scrollIntoView()
      headingRef.current?.focus()
    }
  }, [])

  const reload = useCallback(async () => setState(await loadPhotoState(api)), [])

  if (state.kind === 'off') return null

  const ready = state.kind === 'ready' ? state : null
  const photoUrl = ready?.photoUrl ?? null

  function startAdd(replacing: boolean) {
    setError(null)
    setAgreeError(null)
    setSheet({ step: firstSheetStep(ready?.consented === true), replacing })
  }

  async function agree() {
    setAgreeBusy(true)
    setAgreeError(null)
    const ok = await recordConsent(api)
    setAgreeBusy(false)
    if (!ok) { setAgreeError(CONSENT_FAILED); return }
    setState((s) => (s.kind === 'ready' ? { ...s, consented: true } : s))
    setSheet((s) => (s ? { ...s, step: 'pick' } : s))
  }

  async function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return // cancelling the picker leaves the sheet open
    setSheet(null)
    setError(null)
    const previewUrl = URL.createObjectURL(file)
    setUploading(previewUrl)
    const result = await uploadPhoto(file, api)
    URL.revokeObjectURL(previewUrl)
    if (result.ok) {
      const next = await loadPhotoState(api)
      setUploading(null)
      if (next.kind === 'ready') {
        setState(next)
        setToast('Photo added.')
        focusReplace.current = true
        return
      }
      setError(LOAD_FAILED)
      return
    }
    setUploading(null)
    setError(result.message)
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    const ok = await deletePhoto(api)
    setDeleting(false)
    if (!ok) { setDeleteError(DELETE_FAILED); return }
    setDeleteOpen(false)
    setError(null)
    setState({ kind: 'ready', photoUrl: null, consented: false })
    setToast('Photo and try-on pictures deleted.')
  }

  return (
    <section id="try-on-photo" aria-labelledby="try-on-photo-title">
      <h2 id="try-on-photo-title" ref={headingRef} tabIndex={-1} className="mb-3 font-display text-[22px] font-extrabold uppercase">Your try-on photo</h2>
      {state.kind === 'error' ? (
        <ErrorState message={LOAD_FAILED} onRetry={() => void reload()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            {uploading ? (
              <>
                <TryOnFrame variant="uploading" src={uploading} />
                <p role="status" className="text-[15px] font-semibold">Adding your photo…</p>
              </>
            ) : photoUrl ? (
              <>
                <TryOnFrame variant="photo" src={photoUrl} />
                <div className="flex flex-col items-start gap-3">
                  <p className="text-[15px] font-semibold"><span aria-hidden="true">🔒 </span>Only you can see this photo.</p>
                  <div ref={buttonsRef} className="flex flex-wrap gap-3">
                    <Button variant="secondary" compact fullWidth={false} onClick={() => startAdd(true)}>Replace</Button>
                    <Button variant="secondary" compact fullWidth={false} className="border-danger! text-danger!" onClick={() => { setDeleteError(null); setDeleteOpen(true) }}>Delete</Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <TryOnFrame variant="empty" />
                <div className="flex flex-col gap-1 text-[15px] leading-[1.4]">
                  <p className="font-semibold">See saved outfits on you.</p>
                  <p>Use one full-length photo: plain background, facing the camera.</p>
                </div>
              </>
            )}
          </div>
          {!uploading && !photoUrl && (
            <Button fullWidth className="lg:w-auto!" onClick={() => startAdd(false)}>Add photo</Button>
          )}
          {error && <p role="alert" className="text-[15px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{error}</p>}
        </div>
      )}

      <input ref={takeRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handlePicked} />
      <input ref={chooseRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handlePicked} />
      <BottomSheet
        open={sheet !== null}
        title={sheet?.step === 'privacy' ? 'Before you add a photo' : 'Add your photo'}
        onClose={() => { if (!agreeBusy) setSheet(null) }}
      >
        {sheet?.step === 'privacy' ? (
          <PrivacyStep busy={agreeBusy} error={agreeError} onAgree={() => void agree()} onNotNow={() => setSheet(null)} />
        ) : (
          <PickStep replacing={sheet?.replacing ?? false} onTake={() => takeRef.current?.click()} onChoose={() => chooseRef.current?.click()} />
        )}
      </BottomSheet>
      <ConfirmDialog
        open={deleteOpen}
        title="Delete your try-on photo?"
        body="This also deletes every try-on picture made from it. Your outfits stay saved."
        confirmLabel="Delete"
        busy={deleting}
        error={deleteError}
        onCancel={() => { if (!deleting) setDeleteOpen(false) }}
        onConfirm={() => void confirmDelete()}
      />
      {toast && <Toast message={toast} onDone={clearToast} />}
    </section>
  )
}
