import type { createServiceClient } from '@/lib/supabase/server'
import { imagesToUnits, summariseSpend, type SpendMonth, type TryOnStep } from '@/lib/try-on'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Checks the whole outfit fits under the cap and reserves one ledger row per picture,
 * in one database step. Returns the reserved row ids, or null when it would go over
 * the cap (nothing is reserved and FASHN must not be called).
 */
export async function reservePictures(
  service: ServiceClient,
  args: { userId: string; outfitId: string; month: string; steps: TryOnStep[]; priceUnits: number; capUnits: number },
): Promise<string[] | null> {
  const { data, error } = await service.rpc('try_on_reserve', {
    p_user: args.userId,
    p_outfit: args.outfitId,
    p_month: args.month,
    p_steps: args.steps,
    p_price_units: args.priceUnits,
    p_cap_units: args.capUnits,
  })
  if (error) throw new Error('Could not check the try-on spend')
  return data
}

/** A picture came back from FASHN: it now counts as spend. */
export async function chargePicture(service: ServiceClient, id: string): Promise<void> {
  const { error } = await service
    .from('try_on_ledger')
    .update({ status: 'charged', charged_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error('Could not record the try-on spend')
}

/** The picture was saved with the outfit: these images now also count as a picture made. */
export async function markPictureMade(service: ServiceClient, ids: string[]): Promise<void> {
  const { error } = await service.from('try_on_ledger').update({ picture_made: true }).in('id', ids)
  if (error) throw new Error('Could not record the try-on picture')
}

/** FASHN did not return these images: the reservations go away, so nothing is added to spend. */
export async function releasePictures(service: ServiceClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await service.from('try_on_ledger').delete().in('id', ids).eq('status', 'reserved')
  if (error) throw new Error('Could not release the try-on reservation')
}

/** Charged spend per month, newest first. In-flight reservations are not included. */
export async function chargedSpendByMonth(service: ServiceClient): Promise<SpendMonth[]> {
  const { data, error } = await service.from('try_on_ledger').select('month,batch_id,picture_made').eq('status', 'charged')
  if (error) throw new Error('Could not read the try-on spend')
  return summariseSpend(data ?? [])
}

/** True when this month's charged images leave room for `images` more, checked on the exact amount. */
export function hasRoomForImages(spent: SpendMonth | undefined, images: number, capUnits: number, priceUnits: number): boolean {
  return imagesToUnits((spent?.images ?? 0) + images, priceUnits) <= capUnits
}
