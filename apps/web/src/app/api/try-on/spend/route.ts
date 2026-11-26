import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { chargedSpendByMonth } from '@/lib/try-on-ledger'
import { fromUnits, isTryOnOwner, readTryOnSettings, sydneyMonth, tryOnNow } from '@/lib/try-on'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/** Owner-only: this month's try-on spend, the cap, pictures made and previous months. */
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTryOnOwner(user.id)) return notFound()

  const { capUnits, priceUnits } = readTryOnSettings()
  const months = await chargedSpendByMonth(await createServiceClient())
  const month = sydneyMonth(tryOnNow())
  const current = months.find((m) => m.month === month)
  const images = current?.images ?? 0
  // Spend is the exact sum of every row at the price it was made at: never rounded here. Only the screen rounds it, to the cent.
  const spentUnits = priceUnits === null ? null : (current?.units ?? 0)

  return NextResponse.json({
    month,
    images,
    spent_usd: spentUnits === null ? null : fromUnits(spentUnits),
    cap_usd: capUnits === null ? null : fromUnits(capUnits),
    price_usd: priceUnits === null ? null : fromUnits(priceUnits),
    remaining_usd: capUnits !== null && spentUnits !== null ? fromUnits(Math.max(0, capUnits - spentUnits)) : null,
    pictures: current?.pictures ?? 0,
    previous: months
      .filter((m) => m.month !== month)
      .map((m) => ({
        month: m.month,
        images: m.images,
        spent_usd: priceUnits === null ? null : fromUnits(m.units),
        pictures: m.pictures,
      })),
  })
}
