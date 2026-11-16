'use client'
import { useCallback, useEffect, useState } from 'react'
import type { SavedOutfit } from '@/lib/saved-outfits'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; outfits: SavedOutfit[] }

interface ApiOutfit {
  id: string
  name: string | null
  occasion: SavedOutfit['occasion']
  season: SavedOutfit['season']
  reason: string | null
  pieces: SavedOutfit['pieces']
  created_at: string
}

/** The signed-in user's saved outfits, newest first, with a retry. */
export function useSavedOutfits(): { state: State; retry: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/outfits')
      .then(async (res) => {
        if (!res.ok) throw new Error('load failed')
        const json = (await res.json()) as { outfits?: ApiOutfit[] }
        if (cancelled) return
        setState({
          status: 'ready',
          outfits: (json.outfits ?? []).map((o) => ({
            id: o.id,
            name: o.name?.trim() || 'Saved outfit',
            occasion: o.occasion,
            season: o.season,
            reason: o.reason,
            pieces: o.pieces,
            createdAt: o.created_at,
          })),
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => { cancelled = true }
  }, [attempt])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])
  return { state, retry }
}
