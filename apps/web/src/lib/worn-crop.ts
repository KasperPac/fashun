import sharp from 'sharp'
import { z } from 'zod'
import type { TryOnImage } from '@/lib/fashn'
import type { GarmentKind } from '@/lib/try-on'

/** Where one item is in its worn photo, as fractions (0 to 1) of the photo's width and height. */
export const WornBoxSchema = z.object({
  left: z.number().min(0).max(1),
  top: z.number().min(0).max(1),
  right: z.number().min(0).max(1),
  bottom: z.number().min(0).max(1),
}).refine((b) => b.right - b.left >= 0.05 && b.bottom - b.top >= 0.05, 'box too small')
export type WornBox = z.infer<typeof WornBoxSchema>

export const TuckedSchema = z.enum(['tucked', 'untucked', 'unclear'])
export type Tucked = z.infer<typeof TuckedSchema>

/** What is stored with a worn photo (wardrobe_items.worn_fit). */
export const WornFitSchema = z.object({ box: WornBoxSchema.nullable(), tucked: TuckedSchema })
export type WornFit = z.infer<typeof WornFitSchema>

/** The stored value, or null when it is missing or not in the expected shape. */
export function parseWornFit(value: unknown): WornFit | null {
  const parsed = WornFitSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Extra room around the item, so a top's waistband and a hem show. */
const MARGIN = 0.08
/** A bottom or one-piece is cut here, as a share of the box height from its top: above the ankle, so no shoes are inside. */
const ANKLE_CUT = 0.9

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * The area to send: the item's box plus a small margin. A bottom or one-piece ends above the ankle,
 * with no margin below it. Footwear keeps its full box, since the shoes are the item.
 */
export function cropArea(box: WornBox, kind: GarmentKind): WornBox {
  const w = box.right - box.left
  const h = box.bottom - box.top
  const cutsAtAnkle = kind === 'bottom' || kind === 'one-piece'
  return {
    left: clamp01(box.left - w * MARGIN),
    right: clamp01(box.right + w * MARGIN),
    top: clamp01(box.top - h * MARGIN),
    bottom: cutsAtAnkle ? clamp01(box.top + h * ANKLE_CUT) : clamp01(box.bottom + h * MARGIN),
  }
}

/**
 * The crop of one item from its worn photo, as a JPEG. null when the photo can't be read or cut,
 * so the request goes with notes only. Never returns the whole photo.
 */
export async function cropWornPhoto(photo: TryOnImage, box: WornBox, kind: GarmentKind): Promise<TryOnImage | null> {
  try {
    const input = Buffer.from(photo.base64, 'base64')
    const { width, height } = await sharp(input).metadata()
    if (!width || !height) return null
    const area = cropArea(box, kind)
    const left = Math.floor(area.left * width)
    const top = Math.floor(area.top * height)
    const w = Math.max(1, Math.min(width - left, Math.round((area.right - area.left) * width)))
    const h = Math.max(1, Math.min(height - top, Math.round((area.bottom - area.top) * height)))
    const out = await sharp(input).extract({ left, top, width: w, height: h }).jpeg({ quality: 90 }).toBuffer()
    return { mediaType: 'image/jpeg', base64: out.toString('base64') }
  } catch {
    return null
  }
}
