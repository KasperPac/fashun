import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { tryOnEnabled } from '@/lib/paid-extras'
import { TRY_ON_BUCKET, TRY_ON_LINK_SECONDS } from '@/lib/try-on-images'
import { hasAgreed } from '@/lib/try-on-photo-client'
import { readPhotoUpload } from '@/lib/try-on-upload'
import { makeFitNotes } from '@/lib/fit-notes'


type Context = { params: Promise<{ id: string }> }

const off = () => NextResponse.json({ error: 'Try-on is not available', code: 'FEATURE_OFF' }, { status: 404 })
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const failed = (what: string) => NextResponse.json({ error: what }, { status: 500 })

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** The signed-in person's own item. Another person's item looks the same as a missing one. */
async function ownItem(supabase: ServerClient, userId: string, id: string): Promise<{ worn_photo_path: string | null; fit_notes: string | null; name: string | null; category: string | null } | null> {
  const { data } = await supabase.from('wardrobe_items').select('worn_photo_path,fit_notes,name,category').eq('id', id).eq('user_id', userId).maybeSingle()
  return data ?? null
}

/** Only ever remove a worn photo from the person's own folder. */
const isOwnWornPath = (path: string | null, userId: string): path is string => !!path && path.startsWith(`${userId}/worn-`)

/** GET: the item's worn photo (a short-lived signed address), its fit notes and whether the person has agreed. */
export async function GET(_req: Request, { params }: Context) {
  if (!tryOnEnabled()) return off()
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await ownItem(supabase, user.id, id)
  if (!item) return notFound()
  const { data: profile } = await supabase.from('users').select('try_on_consent_at,try_on_consent_note').eq('id', user.id).maybeSingle()
  const consented = hasAgreed(profile)
  if (!isOwnWornPath(item.worn_photo_path, user.id)) return NextResponse.json({ image_url: null, fit_notes: null, consented })
  const { data, error } = await supabase.storage.from(TRY_ON_BUCKET).createSignedUrl(item.worn_photo_path, TRY_ON_LINK_SECONDS)
  return NextResponse.json({ image_url: error || !data ? null : data.signedUrl, fit_notes: item.fit_notes, consented })
}

/** POST multipart {file}: adds or replaces the item's worn photo. Needs the same agreement as the try-on photo. */
export async function POST(req: Request, { params }: Context) {
  if (!tryOnEnabled()) return off()
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await ownItem(supabase, user.id, id)
  if (!item) return notFound()

  const { data: profile } = await supabase.from('users').select('try_on_consent_at,try_on_consent_note').eq('id', user.id).maybeSingle()
  if (!hasAgreed(profile)) {
    return NextResponse.json({ error: 'Please agree before adding a photo', code: 'CONSENT_REQUIRED' }, { status: 400 })
  }

  const upload = await readPhotoUpload(await req.formData().catch(() => null))
  if (!upload.ok) return upload.response
  if (upload.mediaType !== 'image/jpeg') {
    return NextResponse.json({ error: 'Use a JPEG photo', code: 'BAD_PHOTO' }, { status: 400 })
  }

  const path = `${user.id}/worn-${id}-${randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from(TRY_ON_BUCKET).upload(path, upload.bytes, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) return failed('Could not save the photo')

  // Fit notes come from this photo. A failure is silent: the photo is kept and the notes stay empty (the old ones never stay).
  const reading = await makeFitNotes(Buffer.from(upload.bytes).toString('base64'), { name: item.name ?? '', category: item.category ?? '' })

  const { error: saveError } = await supabase.from('wardrobe_items').update({ worn_photo_path: path, fit_notes: reading?.notes ?? null, worn_fit: reading?.fit ?? null }).eq('id', id).eq('user_id', user.id)
  if (saveError) {
    await supabase.storage.from(TRY_ON_BUCKET).remove([path])
    return failed('Could not save the photo')
  }

  // The replaced photo is no longer used; deleting the try-on photo later clears the folder anyway.
  if (isOwnWornPath(item.worn_photo_path, user.id)) await supabase.storage.from(TRY_ON_BUCKET).remove([item.worn_photo_path])

  return NextResponse.json({ ok: true })
}

/** DELETE: removes the item's worn photo file and clears the item, with its fit notes. */
export async function DELETE(_req: Request, { params }: Context) {
  if (!tryOnEnabled()) return off()
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await ownItem(supabase, user.id, id)
  if (!item) return notFound()

  if (isOwnWornPath(item.worn_photo_path, user.id)) {
    const { error } = await supabase.storage.from(TRY_ON_BUCKET).remove([item.worn_photo_path])
    if (error) return failed('Could not delete the photo. Try again.')
  }
  const { error: clearError } = await supabase.from('wardrobe_items').update({ worn_photo_path: null, fit_notes: null, worn_fit: null }).eq('id', id).eq('user_id', user.id)
  if (clearError) return failed('Could not delete the photo. Try again.')
  return NextResponse.json({ ok: true })
}
