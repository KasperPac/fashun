import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { tryOnEnabled } from '@/lib/paid-extras'
import { chargedSpendByMonth } from '@/lib/try-on-ledger'
import { fromUnits, isTryOnOwner, readTryOnConfig, sydneyMonth, toUnits } from '@/lib/try-on'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/** Owner-only: this month's try-on spend, the cap, pictures made and previous months. */
export async function GET() {
  if (!tryOnEnabled()) return notFound()

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTryOnOwner(user.id)) return notFound()

  const config = readTryOnConfig()
  const months = await chargedSpendByMonth(await createServiceClient())
  const month = sydneyMonth(new Date())
  const current = months.find((m) => m.month === month)
  const spentUnits = toUnits(current?.spentUsd ?? 0)

  return NextResponse.json({
    month,
    spent_usd: fromUnits(spentUnits),
    cap_usd: config ? fromUnits(config.capUnits) : null,
    price_usd: config ? fromUnits(config.priceUnits) : null,
    remaining_usd: config ? fromUnits(Math.max(0, config.capUnits - spentUnits)) : null,
    pictures: current?.pictures ?? 0,
    previous: months
      .filter((m) => m.month !== month)
      .map((m) => ({ month: m.month, spent_usd: m.spentUsd, pictures: m.pictures })),
  })
}
