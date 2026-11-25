import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { tryOnEnabled } from '@/lib/paid-extras'
import { TRY_ON_BUCKET } from '@/lib/try-on-images'
import { hasAgreed } from '@/lib/try-on-photo-client'
import { readPhotoUpload } from '@/lib/try-on-upload'

const SIGNED_SECONDS = 3600

type Context = { params: Promise<{ id: string }> }

const off = () => NextResponse.json({ error: 'Try-on is not available', code: 'FEATURE_OFF' }, { status: 404 })
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const failed = (what: string) => NextResponse.json({ error: what }, { status: 500 })

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** The signed-in person's own item. Another person's item looks the same as a missing one. */
async function ownItem(supabase: ServerClient, userId: string, id: string): Promise<{ worn_photo_path: string | null } | null> {
  const { data } = await supabase.from('wardrobe_items').select('worn_photo_path').eq('id', id).eq('user_id', userId).maybeSingle()
  return data ?? null
}

/** Only ever remove a worn photo from the person's own folder. */
const isOwnWornPath = (path: string | null, userId: string): path is string => !!path && path.startsWith(`${userId}/worn-`)

/** GET: the item's worn photo (a short-lived signed address) and whether the person has agreed. */
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
  if (!isOwnWornPath(item.worn_photo_path, user.id)) return NextResponse.json({ image_url: null, consented })
  const { data, error } = await supabase.storage.from(TRY_ON_BUCKET).createSignedUrl(item.worn_photo_path, SIGNED_SECONDS)
  return NextResponse.json({ image_url: error || !data ? null : data.signedUrl, consented })
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
    return NextResponse.json({ error: 'Use a JPEG, PNG or WebP photo', code: 'BAD_PHOTO' }, { status: 400 })
  }

  const path = `${user.id}/worn-${id}-${randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from(TRY_ON_BUCKET).upload(path, upload.bytes, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) return failed('Could not save the photo')

  const { error: saveError } = await supabase.from('wardrobe_items').update({ worn_photo_path: path }).eq('id', id).eq('user_id', user.id)
  if (saveError) {
    await supabase.storage.from(TRY_ON_BUCKET).remove([path])
    return failed('Could not save the photo')
  }

  // The replaced photo is no longer used; deleting the try-on photo later clears the folder anyway.
  if (isOwnWornPath(item.worn_photo_path, user.id)) await supabase.storage.from(TRY_ON_BUCKET).remove([item.worn_photo_path])

  return NextResponse.json({ ok: true })
}

/** DELETE: removes the item's worn photo file and clears the item. */
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
  const { error: clearError } = await supabase.from('wardrobe_items').update({ worn_photo_path: null }).eq('id', id).eq('user_id', user.id)
  if (clearError) return failed('Could not delete the photo. Try again.')
  return NextResponse.json({ ok: true })
}
