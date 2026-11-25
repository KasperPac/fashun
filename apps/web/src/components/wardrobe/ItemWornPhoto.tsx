'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { photoToJpegBlob } from '@/lib/image-resize'
import {
  CONSENT_FAILED, DELETE_FAILED, firstSheetStep, PHOTO_MAX_EDGE, WORN_LOAD_FAILED,
  deletePhoto, loadPhotoState, recordConsent, uploadPhoto, wornPhotoUrl,
  type PhotoApi, type PhotoState,
} from '@/lib/try-on-photo-client'
import { Button } from '@/components/ui/Button'
import { ErrorState, Toast } from '@/components/ui/Feedback'
import { BottomSheet, ConfirmDialog } from '@/components/ui/Overlays'
import TryOnFrame from '@/components/tryon/TryOnFrame'
import { PickStep, PrivacyStep } from '@/components/tryon/TryOnPhotoSection'

const api: PhotoApi = {
  fetch: (input, init) => fetch(input, init),
  resize: (file) => photoToJpegBlob(file, PHOTO_MAX_EDGE),
}

type Sheet = { step: 'privacy' | 'pick'; replacing: boolean } | null
type Loaded = { itemId: string; state: PhotoState }

/**
 * State and actions for one item's "photo of me wearing it". It lives above the item sheet so that
 * it survives the item sheet hiding while the consent or pick sheet is open.
 */
export function useWornPhoto(itemId: string | null, itemName: string, onChange?: (hasPhoto: boolean) => void) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [agreeBusy, setAgreeBusy] = useState(false)
  const [agreeError, setAgreeError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [errorFor, setErrorFor] = useState<{ itemId: string | null; message: string } | null>(null)
  const setError = useCallback((message: string | null) => setErrorFor(message ? { itemId, message } : null), [itemId])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<'replace' | 'add' | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const load = useCallback(async (id: string) => {
    const state = await loadPhotoState(api, wornPhotoUrl(id))
    setLoaded({ itemId: id, state })
    return state
  }, [])

  // A different item: read its photo.
  useEffect(() => {
    if (!itemId) return
    let cancelled = false
    void loadPhotoState(api, wornPhotoUrl(itemId)).then((state) => { if (!cancelled) setLoaded({ itemId, state }) })
    return () => { cancelled = true }
  }, [itemId])

  const error = errorFor && errorFor.itemId === itemId ? errorFor.message : null
  const state: PhotoState | null = itemId && loaded?.itemId === itemId ? loaded.state : null
  const ready = state?.kind === 'ready' ? state : null
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
    setLoaded((l) => (l && l.state.kind === 'ready' ? { ...l, state: { ...l.state, consented: true } } : l))
    setSheet((s) => (s ? { ...s, step: 'pick' } : s))
  }

  async function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !itemId) return // cancelling the picker leaves the sheet open
    const replacing = photoUrl !== null
    setSheet(null)
    setError(null)
    const previewUrl = URL.createObjectURL(file)
    setUploading(previewUrl)
    const result = await uploadPhoto(file, api, wornPhotoUrl(itemId))
    URL.revokeObjectURL(previewUrl)
    if (result.ok) {
      const next = await load(itemId)
      setUploading(null)
      if (next.kind === 'ready') {
        onChange?.(next.photoUrl !== null)
        setToast(replacing ? 'Photo replaced.' : 'Photo added.')
        setFocusTarget('replace')
        return
      }
      setError(WORN_LOAD_FAILED)
      return
    }
    setUploading(null)
    setError(result.message)
  }

  async function confirmDelete() {
    if (!itemId) return
    setDeleting(true)
    setDeleteError(null)
    const ok = await deletePhoto(api, wornPhotoUrl(itemId))
    setDeleting(false)
    if (!ok) { setDeleteError(DELETE_FAILED); return }
    setDeleteOpen(false)
    setError(null)
    setLoaded((l) => (l && l.state.kind === 'ready' ? { ...l, state: { ...l.state, photoUrl: null, fitNotes: null } } : l))
    onChange?.(false)
    setToast('Photo deleted.')
    setFocusTarget('add')
  }

  return {
    itemName, state, photoUrl, uploading, error, toast, clearToast, sheet, agreeBusy, agreeError,
    deleteOpen, deleting, deleteError, focusTarget,
    /** True while the consent or pick sheet is open, so the item sheet steps aside. */
    sheetOpen: sheet !== null,
    startAdd, agree, handlePicked, confirmDelete,
    retry: () => { if (itemId) void load(itemId) },
    closeSheet: () => { if (!agreeBusy) setSheet(null) },
    askDelete: () => { setDeleteError(null); setDeleteOpen(true) },
    cancelDelete: () => { if (!deleting) setDeleteOpen(false) },
    clearFocusTarget: () => setFocusTarget(null),
  }
}

export type WornPhotoControl = ReturnType<typeof useWornPhoto>

/** "On you": the item's optional photo of the person wearing it. Hidden when try-on is off. */
export function ItemWornPhotoSection({ ctl, readOnly }: { ctl: WornPhotoControl; readOnly: boolean }) {
  const { state, photoUrl, uploading, error, itemName } = ctl
  const replaceRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLDivElement>(null)
  const { focusTarget, clearFocusTarget } = ctl
  useEffect(() => {
    if (focusTarget === 'replace' && photoUrl) replaceRef.current?.querySelector('button')?.focus()
    else if (focusTarget === 'add' && !photoUrl) addRef.current?.querySelector('button')?.focus()
    else return
    clearFocusTarget()
  }, [focusTarget, photoUrl, clearFocusTarget])

  if (!state || state.kind === 'off') return null
  if (readOnly && !photoUrl) return null

  return (
    <section aria-labelledby="worn-photo-title" className="flex flex-col gap-3 border-y-[1.5px] border-ink py-4">
      <h3 id="worn-photo-title" className="font-display text-[22px] font-extrabold uppercase">On you</h3>
      {state.kind === 'error' ? (
        readOnly ? null : <ErrorState message={WORN_LOAD_FAILED} onRetry={ctl.retry} />
      ) : (
        <>
          <div className="flex gap-4">
            {uploading ? (
              <>
                <TryOnFrame variant="uploading" src={uploading} />
                <p role="status" className="text-[15px] font-semibold">Adding your photo…</p>
              </>
            ) : photoUrl ? (
              <>
                <TryOnFrame variant="photo" src={photoUrl} alt={`You wearing ${itemName}`} />
                <div className="flex flex-col items-start gap-3">
                  <p className="text-[15px] font-semibold"><span aria-hidden="true">🔒 </span>Only you can see this photo.</p>
                  {state.kind === 'ready' && state.fitNotes && (
                    <p className="text-[15px] leading-[1.4]"><span className="font-semibold">How it fits: </span>{state.fitNotes}</p>
                  )}
                  {!readOnly && (
                    <div ref={replaceRef} className="flex flex-wrap gap-3">
                      <Button variant="secondary" compact fullWidth={false} onClick={() => ctl.startAdd(true)}>Replace</Button>
                      <Button variant="secondary" compact fullWidth={false} className="border-danger! text-danger!" onClick={ctl.askDelete}>Delete photo</Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <TryOnFrame variant="empty" />
                <div className="flex flex-col items-start gap-2 text-[15px] leading-[1.4]">
                  <p className="font-semibold">Add a photo of you wearing it</p>
                  <p>Optional. Full length, so we can see how it fits you. A mirror selfie is fine.</p>
                  <div ref={addRef}>
                    <Button variant="secondary" compact fullWidth={false} onClick={() => ctl.startAdd(false)}>Add photo</Button>
                  </div>
                </div>
              </>
            )}
          </div>
          {error && <p role="alert" className="text-[15px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{error}</p>}
        </>
      )}
    </section>
  )
}

/** The consent and pick sheets, the delete confirm and the toast for {@link ItemWornPhotoSection}. */
export function ItemWornPhotoSheets({ ctl }: { ctl: WornPhotoControl }) {
  const { itemName, sheet } = ctl
  const takeRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={takeRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={ctl.handlePicked} />
      <input ref={chooseRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={ctl.handlePicked} />
      <BottomSheet
        open={sheet !== null}
        title={sheet?.step === 'privacy' ? 'Before you add a photo' : 'Add a photo of you wearing it'}
        onClose={ctl.closeSheet}
      >
        {sheet?.step === 'privacy' ? (
          <PrivacyStep busy={ctl.agreeBusy} error={ctl.agreeError} onAgree={() => void ctl.agree()} onNotNow={ctl.closeSheet} />
        ) : (
          <PickStep
            replacing={sheet?.replacing ?? false}
            hint={`Wear the ${itemName} and show your whole body, head to feet. A mirror selfie is fine.`}
            replacingNote="This replaces the photo you added before."
            onTake={() => takeRef.current?.click()}
            onChoose={() => chooseRef.current?.click()}
          />
        )}
      </BottomSheet>
      <ConfirmDialog
        open={ctl.deleteOpen}
        title="Delete this photo?"
        body={`The photo of you wearing the ${itemName} is deleted. The ${itemName} stays in your wardrobe.`}
        confirmLabel="Delete photo"
        busy={ctl.deleting}
        error={ctl.deleteError}
        onCancel={ctl.cancelDelete}
        onConfirm={() => void ctl.confirmDelete()}
      />
      {ctl.toast && <Toast message={ctl.toast} onDone={ctl.clearToast} />}
    </>
  )
}
