import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { tryOnEnabled } from '@/lib/paid-extras'
import { TRY_ON_BUCKET } from '@/lib/try-on-images'
import { readPhotoUpload } from '@/lib/try-on-upload'
import { PRIVACY_NOTE_VERSION, hasAgreed } from '@/lib/try-on-photo-client'

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const SIGNED_SECONDS = 3600
const PAGE = 100

const off = () => NextResponse.json({ error: 'Try-on is not available', code: 'FEATURE_OFF' }, { status: 404 })

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

/** Every file in the person's own try-on folder (photo, pictures and worn photos, including orphans). */
async function listOwnFiles(supabase: ServerClient, userId: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(TRY_ON_BUCKET).list(userId, { limit: PAGE, offset })
    if (error) throw new Error('Could not list try-on files')
    paths.push(...(data ?? []).map((f) => `${userId}/${f.name}`))
    if (!data || data.length < PAGE) return paths
  }
}

/** GET: the person's try-on photo, if they have one. */
export async function GET() {
  if (!tryOnEnabled()) return off()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('try_on_photo_url,try_on_consent_at,try_on_consent_note').eq('id', user.id).maybeSingle()
  if (!profile?.try_on_photo_url) return NextResponse.json({ image_url: null, consented: hasAgreed(profile) })
  const { data, error } = await supabase.storage.from(TRY_ON_BUCKET).createSignedUrl(profile.try_on_photo_url, SIGNED_SECONDS)
  return NextResponse.json({ image_url: error || !data ? null : data.signedUrl, consented: hasAgreed(profile) })
}

/** POST multipart {file, consent}: adds or replaces the photo. The first one needs consent. */
export async function POST(req: Request) {
  if (!tryOnEnabled()) return off()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const upload = await readPhotoUpload(form)
  if (!upload.ok) return upload.response
  const { bytes, mediaType } = upload

  const { data: profile } = await supabase.from('users').select('try_on_photo_url,try_on_consent_at,try_on_consent_note').eq('id', user.id).maybeSingle()
  const alreadyAgreed = hasAgreed(profile)
  const agreed = alreadyAgreed || form?.get('consent') === 'true'
  if (!agreed) {
    return NextResponse.json({ error: 'Please agree before adding a photo', code: 'CONSENT_REQUIRED' }, { status: 400 })
  }

  const path = `${user.id}/photo-${randomUUID()}.${EXT[mediaType]}`
  const { error: uploadError } = await supabase.storage.from(TRY_ON_BUCKET).upload(path, bytes, { contentType: mediaType, upsert: false })
  if (uploadError) return NextResponse.json({ error: 'Could not save the photo' }, { status: 500 })

  const { error: saveError } = await supabase
    .from('users')
    .update({
      try_on_photo_url: path,
      try_on_consent_at: alreadyAgreed ? profile?.try_on_consent_at : new Date().toISOString(),
      try_on_consent_note: PRIVACY_NOTE_VERSION,
    })
    .eq('id', user.id)
  if (saveError) {
    await supabase.storage.from(TRY_ON_BUCKET).remove([path])
    return NextResponse.json({ error: 'Could not save the photo' }, { status: 500 })
  }

  // The replaced photo is no longer used; deleting the photo later clears the folder anyway.
  if (profile?.try_on_photo_url) await supabase.storage.from(TRY_ON_BUCKET).remove([profile.try_on_photo_url])

  return NextResponse.json({ ok: true })
}

/** PUT: records that the person agreed to the privacy note (the date is kept). Stores no photo. */
export async function PUT() {
  if (!tryOnEnabled()) return off()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('try_on_consent_at,try_on_consent_note').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Could not save your agreement' }, { status: 500 })
  if (!hasAgreed(profile)) {
    const { error } = await supabase
      .from('users')
      .update({ try_on_consent_at: new Date().toISOString(), try_on_consent_note: PRIVACY_NOTE_VERSION })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: 'Could not save your agreement' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE: removes the photo, every try-on picture and every worn photo. Outfits and items stay. */
export async function DELETE() {
  if (!tryOnEnabled()) return off()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const remaining = await listOwnFiles(supabase, user.id)
    if (remaining.length > 0) {
      const { error } = await supabase.storage.from(TRY_ON_BUCKET).remove(remaining)
      if (error) throw new Error('Could not delete try-on files')
    }
  } catch {
    return NextResponse.json({ error: 'Could not delete your try-on photo. Try again.' }, { status: 500 })
  }

  const { error: outfitsError } = await supabase
    .from('outfits')
    .update({ try_on_image_path: null, try_on_made_at: null })
    .eq('user_id', user.id)
    .not('try_on_image_path', 'is', null)
  const { error: wornError } = await supabase
    .from('wardrobe_items')
    .update({ worn_photo_path: null })
    .eq('user_id', user.id)
    .not('worn_photo_path', 'is', null)
  const { error: userError } = await supabase
    .from('users')
    .update({ try_on_photo_url: null, try_on_consent_at: null, try_on_consent_note: null })
    .eq('id', user.id)
  if (outfitsError || wornError || userError) {
    return NextResponse.json({ error: 'Could not delete your try-on photo. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
