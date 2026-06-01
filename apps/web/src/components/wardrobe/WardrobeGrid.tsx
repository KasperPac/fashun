'use client'
import { useState, useEffect } from 'react'
import type { WardrobeItem, ColourSeason } from '@fashun/shared'
import ItemCard from './ItemCard'

interface Props {
  items: WardrobeItem[]
  loading: boolean
  onDelete: (id: string) => void
  onAction?: (item: WardrobeItem, action: 'style' | 'tryon') => void
  userSeason?: ColourSeason
}

export default function WardrobeGrid({ items, loading, onDelete, onAction, userSeason }: Props) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null)

  useEffect(() => {
    const collapse = () => setActiveCardId(null)
    document.addEventListener('click', collapse)
    return () => document.removeEventListener('click', collapse)
  }, [])

  useEffect(() => {
    setActiveCardId(null)
  }, [items])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 pt-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-xl bg-zinc-900 animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="text-5xl">👗</span>
        <p className="text-zinc-400 text-sm">No items here yet</p>
        <p className="text-zinc-600 text-xs">Add clothes using the button below</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 pt-3">
      {items.map(item => (
        <ItemCard
          key={item.id}
          item={item}
          onDelete={onDelete}
          onAction={onAction}
          userSeason={userSeason}
          isActive={activeCardId === item.id}
          onActivate={(e) => { e.stopPropagation(); setActiveCardId(item.id) }}
        />
      ))}
    </div>
  )
}
