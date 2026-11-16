import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { tryOnEnabled } from '@/lib/paid-extras'
import { runTryOn, FashnError, FashnTimeoutError, type TryOnImage } from '@/lib/fashn'
import {
  chargePicture, chargedSpendByMonth, hasRoomForImages, markPictureMade, releasePictures, reservePictures,
} from '@/lib/try-on-ledger'
import { loadGarmentPhoto, loadPersonPhoto, TRY_ON_BUCKET } from '@/lib/try-on-images'
import {
  TRY_ON_LABEL, firstOfNextMonth, planTryOn, readTryOnConfig, sydneyMonth, tryOnNow,
  type OutfitPiece,
} from '@/lib/try-on'

// Two FASHN pictures can take up to ~34 seconds; leave room for photos and saving.
export const maxDuration = 90

const SIGNED_SECONDS = 3600

const BodySchema = z.object({ outfit_id: z.string().uuid(), regenerate: z.boolean().optional() })
const QuerySchema = z.object({
  outfit_id: z.string().uuid(),
  // How many FASHN images this outfit needs (a top and bottoms need 2), so "paused" matches what POST would do.
  images: z.enum(['1', '2']).default('1'),
})

/** One fixed reason per failure. Never the error text, an address, a name or an email, which could hold personal data. */
function logFailure(reason: 'fashn_refused' | 'fashn_timeout' | 'unexpected' | 'storage_failed' | 'save_failed' | 'ledger_failed') {
  console.error(`try-on failed: ${reason}`)
}

function off() {
  return NextResponse.json({ error: 'Try-on is not available', code: 'FEATURE_OFF' }, { status: 404 })
}

type ServerClient = Awaited<ReturnType<typeof createServerClient>>

async function signedPicture(supabase: ServerClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(TRY_ON_BUCKET).createSignedUrl(path, SIGNED_SECONDS)
  return error || !data ? null : data.signedUrl
}

interface StoredPiece { label?: unknown; item_id?: unknown }

async function loadOutfit(supabase: ServerClient, userId: string, outfitId: string) {
  const { data } = await supabase
    .from('outfits')
    .select('id,pieces,try_on_image_path,try_on_made_at')
    .eq('id', outfitId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

/** GET ?outfit_id= : the saved picture (free) and whether new pictures are paused. */
export async function GET(req: Request) {
  if (!tryOnEnabled()) return off()

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = QuerySchema.safeParse({
    outfit_id: new URL(req.url).searchParams.get('outfit_id'),
    images: new URL(req.url).searchParams.get('images') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid outfit' }, { status: 400 })

  const outfit = await loadOutfit(supabase, user.id, parsed.data.outfit_id)
  if (!outfit) return NextResponse.json({ error: 'Outfit not found' }, { status: 404 })

  const imageUrl = outfit.try_on_image_path ? await signedPicture(supabase, outfit.try_on_image_path) : null

  const month = sydneyMonth(tryOnNow())
  const config = readTryOnConfig()
  let paused = true
  if (config) {
    const spend = await chargedSpendByMonth(await createServiceClient())
    paused = !hasRoomForImages(spend.find((s) => s.month === month), Number(parsed.data.images), config.capUnits, config.priceUnits)
  }

  return NextResponse.json({
    image_url: imageUrl,
    made_at: imageUrl ? outfit.try_on_made_at : null,
    label: TRY_ON_LABEL,
    paused,
    resume_on: paused ? firstOfNextMonth(month) : null,
  })
}

/** POST {outfit_id, regenerate?}: the saved picture if there is one, otherwise draws a new one. */
export async function POST(req: Request) {
  if (!tryOnEnabled()) return off()

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid outfit' }, { status: 400 })

  const outfit = await loadOutfit(supabase, user.id, parsed.data.outfit_id)
  if (!outfit) return NextResponse.json({ error: 'Outfit not found' }, { status: 404 })

  const previousPath = outfit.try_on_image_path

  // A saved picture is free: no FASHN call, nothing added to spend.
  if (outfit.try_on_image_path && !parsed.data.regenerate) {
    const imageUrl = await signedPicture(supabase, outfit.try_on_image_path)
    if (imageUrl) {
      return NextResponse.json({
        image_url: imageUrl, made_at: outfit.try_on_made_at, label: TRY_ON_LABEL,
        skipped: [], charged_pictures: 0, saved: true,
      })
    }
  }

  const apiKey = process.env.FASHN_API_KEY
  const config = readTryOnConfig()
  if (!apiKey || !config) {
    return NextResponse.json({ error: 'Try-on is not set up yet', code: 'NOT_CONFIGURED' }, { status: 503 })
  }

  const { data: profile } = await supabase.from('users').select('try_on_photo_url').eq('id', user.id).maybeSingle()
  if (!profile?.try_on_photo_url) {
    return NextResponse.json({ error: 'Add a try-on photo to see this on you', code: 'NO_PERSON_PHOTO' }, { status: 400 })
  }

  // Work out what to draw from the outfit's pieces and the user's own wardrobe.
  const stored = (Array.isArray(outfit.pieces) ? outfit.pieces : []) as StoredPiece[]
  const itemIds = [...new Set(stored.flatMap((p) => (typeof p.item_id === 'string' && p.item_id ? [p.item_id] : [])))]
  const wardrobe = new Map<string, { category: string; image_url: string | null }>()
  if (itemIds.length > 0) {
    const { data: items, error } = await supabase
      .from('wardrobe_items')
      .select('id,category,image_url')
      .eq('user_id', user.id)
      .in('id', itemIds)
    if (error) return NextResponse.json({ error: 'Could not read the outfit' }, { status: 500 })
    for (const i of items ?? []) wardrobe.set(i.id, { category: i.category, image_url: i.image_url })
  }
  const pieces: OutfitPiece[] = stored.map((p) => {
    const itemId = typeof p.item_id === 'string' && p.item_id ? p.item_id : null
    const found = itemId ? wardrobe.get(itemId) : undefined
    return {
      label: typeof p.label === 'string' && p.label.trim() ? p.label : 'piece',
      itemId,
      category: found?.category ?? null,
      imageRef: found?.image_url || null,
    }
  })

  const plan = planTryOn(pieces)
  if (!plan.ok) {
    return NextResponse.json({ error: plan.message, code: plan.code, missing: plan.missing }, { status: 400 })
  }

  // Read every photo before reserving anything, so a bad photo costs nothing.
  const person = await loadPersonPhoto(supabase, profile.try_on_photo_url)
  if (!person) {
    return NextResponse.json({ error: 'Could not read your try-on photo', code: 'IMAGE_UNAVAILABLE' }, { status: 500 })
  }
  const garments: TryOnImage[] = []
  for (const s of plan.steps) {
    const img = await loadGarmentPhoto(supabase, s.imageRef)
    if (!img) {
      return NextResponse.json(
        { error: `Could not read the photo of your ${s.label}`, code: 'IMAGE_UNAVAILABLE' },
        { status: 500 },
      )
    }
    garments.push(img)
  }

  // The whole outfit must fit under this month's cap before FASHN is called.
  const month = sydneyMonth(tryOnNow())
  const service = await createServiceClient()
  const reserved = await reservePictures(service, {
    userId: user.id, outfitId: outfit.id, month,
    steps: plan.steps.map((s) => s.step), priceUnits: config.priceUnits, capUnits: config.capUnits,
  })
  if (!reserved) {
    return NextResponse.json(
      { error: 'Try-on is paused until next month', code: 'CAP_REACHED', resume_on: firstOfNextMonth(month) },
      { status: 409 },
    )
  }

  let current: TryOnImage = person
  let returned = 0 // images FASHN gave back: each is charged to us, whatever happens next
  let charged = 0 // of those, the ones now recorded as spend
  try {
    for (let i = 0; i < plan.steps.length; i++) {
      current = await runTryOn({ person: current, garment: garments[i], category: plan.steps[i].category, apiKey })
      returned += 1
      await chargePicture(service, reserved[i])
      charged += 1
    }
  } catch (err) {
    // An image FASHN returned stays counted even if recording it failed: try once more, and if the
    // ledger still can't be written leave its reservation in place rather than under-count.
    if (returned > charged) {
      try {
        await chargePicture(service, reserved[charged])
        charged += 1
      } catch {
        logFailure('ledger_failed')
      }
    }
    // Pictures FASHN did not return add nothing to spend.
    await releasePictures(service, reserved.slice(returned))
    const fromFashn = err instanceof FashnError
    logFailure(err instanceof FashnTimeoutError ? 'fashn_timeout' : fromFashn ? 'fashn_refused' : 'unexpected')
    return NextResponse.json(
      {
        error: fromFashn
          ? "Try-on didn't work this time. Try again later."
          : 'Something went wrong. Try again later.',
        code: 'TRY_ON_FAILED',
        charged_pictures: returned,
      },
      { status: 502 },
    )
  }

  // FASHN deletes its copy within the hour: keep ours, privately, with the outfit.
  const ext = current.mediaType === 'image/png' ? 'png' : current.mediaType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/outfit-${outfit.id}-${randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(TRY_ON_BUCKET)
    .upload(path, Buffer.from(current.base64, 'base64'), { contentType: current.mediaType, upsert: false })
  if (uploadError) {
    logFailure('storage_failed')
    return NextResponse.json(
      { error: 'Could not save the picture', code: 'SAVE_FAILED', charged_pictures: charged },
      { status: 500 },
    )
  }

  const madeAt = tryOnNow().toISOString()
  const { error: saveError } = await supabase
    .from('outfits')
    .update({ try_on_image_path: path, try_on_made_at: madeAt })
    .eq('id', outfit.id)
    .eq('user_id', user.id)
  if (saveError) {
    logFailure('save_failed')
    await supabase.storage.from(TRY_ON_BUCKET).remove([path])
    return NextResponse.json(
      { error: 'Could not save the picture', code: 'SAVE_FAILED', charged_pictures: charged },
      { status: 500 },
    )
  }

  try {
    await markPictureMade(service, reserved)
  } catch {
    // The picture is saved and the images are counted; only the count of pictures is behind by one.
    logFailure('unexpected')
  }

  // The replaced picture is no longer used. If this removal fails the file is only an
  // orphan in the person's own folder, and deleting the try-on photo clears the folder.
  if (previousPath) await supabase.storage.from(TRY_ON_BUCKET).remove([previousPath])

  const skipped = plan.skipped.map((s) => ({ label: s.label, reason: s.reason }))
  return NextResponse.json({
    image_url: await signedPicture(supabase, path),
    made_at: madeAt,
    label: TRY_ON_LABEL,
    skipped,
    charged_pictures: charged,
    saved: false,
  })
}
