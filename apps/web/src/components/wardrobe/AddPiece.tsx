'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OCCASIONS, OCCASION_LABELS } from '@fashun/shared'
import type { ColourSeason, OccasionTag, WardrobeCategory } from '@fashun/shared'
import { supabase } from '@/lib/supabase/client'
import { photoToJpegBase64 } from '@/lib/image-resize'
import { Button } from '@/components/ui/Button'
import { Notice, Toast } from '@/components/ui/Feedback'
import { BottomSheet } from '@/components/ui/Overlays'
import { TextField } from '@/components/ui/TextField'
import ReviewForm from './ReviewForm'
import NotClothingNotice from './NotClothingNotice'
import { asWebUrl, shopDomain, type ReviewValues } from '@/lib/item-form'
import { CATEGORY_LABELS } from '@/lib/wardrobe-view'

interface Presets {
  category: WardrobeCategory | null
  occasion: OccasionTag | null
}

interface Draft {
  source: 'photo' | 'link' | 'manual'
  initial: ReviewValues
  suggested: OccasionTag[]
  photoUrl: string | null
  styleTags: string[]
  storeUrl?: string
  price?: number
  retailer?: string
  /** Why we're showing an empty form, if reading failed. */
  failure?: 'link' | 'photo'
}

type Stage = { name: 'choose' } | { name: 'not-clothing' } | { name: 'reading'; what: 'photo' | 'link' } | { name: 'review'; draft: Draft; seq: number }

const READ_FAILED_PHOTO = "We couldn't read this photo. Fill in the details below, or try another photo."
const OFFLINE = "Couldn't reach Fashun. Check your connection and try again."

function isCategory(value: unknown): value is WardrobeCategory {
  return typeof value === 'string' && value in CATEGORY_LABELS
}

function occasionsOf(value: unknown): OccasionTag[] {
  return Array.isArray(value) ? OCCASIONS.filter((o) => value.includes(o)) : []
}

function withPresets(values: ReviewValues, presets: Presets): ReviewValues {
  return {
    ...values,
    category: presets.category ?? values.category,
    occasions: presets.occasion && !values.occasions.includes(presets.occasion)
      ? OCCASIONS.filter((o) => o === presets.occasion || values.occasions.includes(o))
      : values.occasions,
  }
}

function emptyDraft(presets: Presets, extra: Partial<Draft> = {}): Draft {
  return {
    source: 'manual',
    initial: withPresets({ name: '', category: 'tops', colours: [], occasions: [] }, presets),
    suggested: [],
    photoUrl: null,
    styleTags: [],
    ...extra,
  }
}

/** Add a piece: choose how, read it, then check the details and save. */
export default function AddPiece({ presets, returnTo, onSaved }: { presets: Presets; returnTo: string; onSaved?: (name: string) => string }) {
  const router = useRouter()
  const takeRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [stage, setStage] = useState<Stage>({ name: 'choose' })
  const [activePresets, setActivePresets] = useState(presets)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [season, setSeason] = useState<ColourSeason | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const clearToast = useCallback(() => setToast(null), [])
  const seqRef = useRef(0)
  const [addPhotoOpen, setAddPhotoOpen] = useState(false)
  const [addPhotoError, setAddPhotoError] = useState<string | null>(null)
  const [addingPhoto, setAddingPhoto] = useState(false)

  function showReview({ draft }: { draft: Draft }) {
    seqRef.current += 1
    setStage({ name: 'review', draft, seq: seqRef.current })
  }

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: row } = await supabase.from('users').select('colour_season').eq('id', data.user.id).maybeSingle()
      const value = row?.colour_season
      if (!cancelled && (value === 'spring' || value === 'summer' || value === 'autumn' || value === 'winter')) setSeason(value)
    })
    return () => { cancelled = true }
  }, [])

  async function openLink() {
    setLinkOpen(true)
    try {
      const text = await navigator.clipboard.readText()
      const found = asWebUrl(text)
      if (found) setUrl((current) => current || found)
    } catch {
      // Clipboard access is optional; the field simply stays empty.
    }
  }

  async function readPhoto(file: File) {
    setReadError(null)
    setStage({ name: 'reading', what: 'photo' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const imageBase64 = await photoToJpegBase64(file)
      const res = await fetch('/api/wardrobe/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('read failed')
      const data = await res.json()
      if (data.notClothing === true) {
        setStage({ name: 'not-clothing' })
        return
      }
      const suggested = occasionsOf(data.occasionTags)
      const colours: string[] = Array.isArray(data.colours) ? data.colours.filter((c: unknown) => typeof c === 'string') : []
      showReview({
        draft: {
          source: 'photo',
          initial: withPresets(
            { name: String(data.suggestedName ?? ''), category: isCategory(data.category) ? data.category : 'tops', colours, occasions: suggested },
            activePresets,
          ),
          suggested,
          photoUrl: typeof data.processedImageUrl === 'string' ? data.processedImageUrl : null,
          styleTags: Array.isArray(data.styleTags) ? data.styleTags : [],
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      showReview({ draft: emptyDraft(activePresets, { failure: 'photo' }) })
    }
  }

  async function readLink() {
    const link = asWebUrl(url)
    if (!link) {
      setUrlError('Paste the full web address of the piece, starting with https://')
      return
    }
    setUrlError(null)
    setReadError(null)
    setStage({ name: 'reading', what: 'link' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/wardrobe/from-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.mode === 'confirm' && data.product) {
        const p = data.product
        const suggested = occasionsOf(p.occasionTags)
        showReview({
          draft: {
            source: 'link',
            initial: withPresets(
              {
                name: String(p.suggestedName ?? ''),
                category: isCategory(p.category) ? p.category : 'tops',
                colours: Array.isArray(p.colours) ? p.colours.filter((c: unknown) => typeof c === 'string') : [],
                occasions: suggested,
              },
              activePresets,
            ),
            suggested,
            photoUrl: typeof p.processedImageUrl === 'string' ? p.processedImageUrl : null,
            styleTags: Array.isArray(p.styleTags) ? p.styleTags : [],
            storeUrl: link,
            price: typeof p.price === 'number' ? p.price : undefined,
            retailer: typeof p.retailer === 'string' ? p.retailer : undefined,
          },
        })
        return
      }
      // Unreadable page, a blocked address, or a result we can't use: add by hand and keep the link.
      showReview({ draft: emptyDraft(activePresets, { failure: 'link', storeUrl: link }) })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setStage({ name: 'choose' })
      setReadError(OFFLINE)
    }
  }

  /** Put a picture in the empty photo tile. Only stores the picture; the details the user has checked stay as they are. */
  async function addPhoto(file: File) {
    setAddPhotoError(null)
    setAddingPhoto(true)
    try {
      const imageBase64 = await photoToJpegBase64(file)
      const res = await fetch('/api/wardrobe/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, uploadOnly: true }),
      })
      if (!res.ok) throw new Error('upload failed')
      const data = await res.json()
      if (typeof data.processedImageUrl !== 'string') throw new Error('no photo url')
      const photoUrl: string = data.processedImageUrl
      setStage((s) => (s.name === 'review' ? { ...s, draft: { ...s.draft, photoUrl } } : s))
    } catch {
      setAddPhotoError("Couldn't add that photo. Try again.")
    } finally {
      setAddingPhoto(false)
    }
  }

  function handleAddPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setAddPhotoOpen(false)
    if (file) void addPhoto(file)
  }

  function cancelReading() {
    abortRef.current?.abort()
    setStage({ name: 'choose' })
  }

  async function save(draft: Draft, values: ReviewValues, andAnother: boolean): Promise<boolean> {
    setSaveError(null)
    try {
      const res = await fetch('/api/wardrobe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          category: values.category,
          colours: values.colours,
          occasionTags: values.occasions,
          styleTags: draft.styleTags,
          imageUrl: draft.photoUrl ?? '',
          ownership: 'owned',
          storeUrl: draft.storeUrl,
          price: draft.price,
          retailer: draft.retailer ?? shopDomain(draft.storeUrl) ?? undefined,
        }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setSaveError("Couldn't save this piece. Check your connection and try again.")
      return false
    }
    if (andAnother) {
      setActivePresets({ category: null, occasion: null })
      setUrl('')
      setLinkOpen(false)
      setFormKey((k) => k + 1)
      setStage({ name: 'choose' })
      setToast(`${values.name} added.`)
    } else {
      const target = onSaved ? onSaved(values.name) : returnTo
      router.push(target)
    }
    return true
  }

  function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void readPhoto(file)
  }

  const presetText = [
    activePresets.category ? CATEGORY_LABELS[activePresets.category] : null,
    activePresets.occasion ? OCCASION_LABELS[activePresets.occasion] : null,
  ].filter(Boolean).join(' · ')

  if (stage.name === 'reading') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div aria-hidden="true" className="h-52 w-40 animate-pulse-skeleton border-[1.5px] border-ink bg-skeleton" />
        <p role="status" className="text-base font-semibold">
          {stage.what === 'photo' ? 'Reading your photo…' : 'Reading the page…'}
        </p>
        <Button variant="secondary" fullWidth={false} onClick={cancelReading}>Cancel</Button>
      </div>
    )
  }

  if (stage.name === 'not-clothing') {
    return (
      <NotClothingNotice onTryAnother={() => setStage({ name: 'choose' })} />
    )
  }

  if (stage.name === 'review') {
    const draft = stage.draft
    const domain = shopDomain(draft.storeUrl)
    const failed = draft.failure
    return (
      <>
        <ReviewForm
          key={`${formKey}-${stage.seq}`}
          mode="add"
          initial={draft.initial}
          suggested={draft.suggested}
          photoUrl={draft.photoUrl}
          season={season}
          backLabel={draft.source === 'photo' ? 'Retake' : 'Back'}
          onBack={() => { setSaveError(null); setStage({ name: 'choose' }) }}
          onChangePhoto={draft.source === 'photo' ? () => setStage({ name: 'choose' }) : undefined}
          onAddPhoto={() => setAddPhotoOpen(true)}
          saveError={saveError}
          onSave={(values, another) => save(draft, values, another)}
          intro={
            failed === 'link' ? (
              <Notice title="We couldn't read this page" role="status">
                Some shops block us. Add it manually below. It only takes a minute.
                {domain && <span className="mt-1 block text-[13px]">From: {domain}</span>}
                <span className="mt-1 block text-[13px]">Add a photo (optional). Snap the piece or save a picture from the shop.</span>
              </Notice>
            ) : failed === 'photo' ? (
              <Notice title="We couldn't read this photo" role="status">
                {READ_FAILED_PHOTO}
                <span className="mt-3 block">
                  <Button variant="secondary" fullWidth={false} onClick={() => setStage({ name: 'choose' })}>Try another photo</Button>
                </span>
              </Notice>
            ) : undefined
          }
        />
        {addingPhoto && <p role="status" className="mt-3 text-[15px] font-semibold">Adding your photo…</p>}
        {addPhotoError && <p role="alert" className="mt-3 text-[15px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{addPhotoError}</p>}
        <input ref={takeRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleAddPhotoPicked} />
        <input ref={chooseRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleAddPhotoPicked} />
        <BottomSheet open={addPhotoOpen} title="Add a photo" onClose={() => setAddPhotoOpen(false)}>
          <div className="flex flex-col gap-3">
            <Button onClick={() => takeRef.current?.click()}>Take a photo</Button>
            <Button variant="secondary" onClick={() => chooseRef.current?.click()}>Choose a photo</Button>
          </div>
        </BottomSheet>
        {toast && <Toast message={toast} onDone={clearToast} />}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {presetText && <p className="text-[15px] font-semibold">Adding: {presetText}</p>}
      {readError && <p role="alert" className="text-[15px] font-semibold text-danger"><span aria-hidden="true">⚠ </span>{readError}</p>}
      <input ref={takeRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handlePicked} />
      <input ref={chooseRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handlePicked} />
      <Button className="h-14!" onClick={() => takeRef.current?.click()}>Take a photo</Button>
      <Button className="h-14!" variant="secondary" onClick={() => chooseRef.current?.click()}>Choose a photo</Button>
      {linkOpen ? (
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); void readLink() }}
          className="flex flex-col gap-3 border-2 border-ink bg-card p-4"
        >
          <TextField
            label="Shop link"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={urlError ?? undefined}
          />
          <Button type="submit">Read link</Button>
        </form>
      ) : (
        <Button className="h-14!" variant="secondary" onClick={() => void openLink()}>Paste a shop link</Button>
      )}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </div>
  )
}
