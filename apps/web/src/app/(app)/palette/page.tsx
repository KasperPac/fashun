import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  isColourInSeason,
  getSeasonSwatches,
  SEASON_LABELS,
  SEASON_DESCRIPTIONS,
} from '@fashun/shared'
import type { ColourSeason } from '@fashun/shared'
import BottomNav from '@/components/BottomNav'

const SEASON_GRADIENTS: Record<ColourSeason, string> = {
  spring:  'from-pink-900 via-rose-800 to-orange-800',
  summer:  'from-blue-950 via-indigo-900 to-purple-900',
  autumn:  'from-orange-950 via-amber-900 to-yellow-900',
  winter:  'from-slate-950 via-blue-950 to-indigo-950',
}

export default async function PalettePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch season and owned items in parallel
  type ProfileRow = { colour_season: string | null } | null
  type ItemRow = { colours: string[] | null }

  const profileQuery = (supabase.from('users').select('colour_season').eq('id', user.id).single() as unknown as { data: ProfileRow; error: unknown })
  const itemsQuery = (supabase.from('wardrobe_items').select('colours').eq('user_id', user.id).eq('ownership', 'owned') as unknown as { data: ItemRow[] | null; error: unknown })

  const [profileRes, itemsRes] = await Promise.all([profileQuery, itemsQuery])

  const season = (profileRes.data?.colour_season ?? null) as ColourSeason | null
  const items: ItemRow[] = itemsRes.data ?? []

  // Compute stats
  const inPalette = season
    ? items.filter(item => item.colours?.some(hex => isColourInSeason(hex, season))).length
    : 0
  const outPalette = items.length - inPalette
  const matchPct = items.length > 0 ? Math.round((inPalette / items.length) * 100) : 0

  const swatchData = season ? getSeasonSwatches(season) : null
  const seasonLabel = season ? SEASON_LABELS[season] : null
  const seasonDesc = season ? SEASON_DESCRIPTIONS[season] : null
  const gradient = season ? SEASON_GRADIENTS[season] : 'from-zinc-900 to-zinc-800'

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="px-4 pt-6 space-y-4">

        {/* Season hero */}
        <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-6 text-center`}>
          <div className="text-4xl mb-2">{seasonLabel?.split(' ')[2] ?? '🌈'}</div>
          <h1 className="text-2xl font-black tracking-tight">
            {seasonLabel ?? 'Your Palette'}
          </h1>
          {seasonDesc && (
            <p className="text-white/60 text-sm mt-1">{seasonDesc}</p>
          )}
        </div>

        {!season && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-3">Complete your skin tone analysis to see your colour palette</p>
            <a href="/onboarding" className="text-purple-400 font-semibold text-sm hover:underline">
              Start onboarding →
            </a>
          </div>
        )}

        {season && items.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-900 rounded-xl p-3 text-center border border-zinc-800">
              <div className="text-2xl font-black text-green-400">{inPalette}</div>
              <div className="text-zinc-500 text-xs mt-0.5">In palette</div>
            </div>
            <div className="bg-zinc-900 rounded-xl p-3 text-center border border-zinc-800">
              <div className="text-2xl font-black text-amber-400">{outPalette}</div>
              <div className="text-zinc-500 text-xs mt-0.5">Off palette</div>
            </div>
            <div className="bg-zinc-900 rounded-xl p-3 text-center border border-zinc-800">
              <div className="text-2xl font-black text-white">{matchPct}%</div>
              <div className="text-zinc-500 text-xs mt-0.5">Match</div>
            </div>
          </div>
        )}

        {swatchData && (
          <>
            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Your colours</p>
              <div className="flex flex-wrap gap-2">
                {swatchData.swatches.map(hex => (
                  <div
                    key={hex}
                    title={hex}
                    className="w-9 h-9 rounded-lg border border-white/10"
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Avoid</p>
              <div className="flex gap-2">
                {swatchData.avoid.map(hex => (
                  <div key={hex} className="relative w-9 h-9">
                    <div
                      className="w-9 h-9 rounded-lg border border-white/10 opacity-40"
                      style={{ background: hex }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-base">×</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
      <BottomNav />
    </div>
  )
}
