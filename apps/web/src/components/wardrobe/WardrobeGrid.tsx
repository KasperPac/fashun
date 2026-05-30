'use client'
import type { WardrobeItem } from '@fashun/shared'
import ItemCard from './ItemCard'

interface Props {
  items: WardrobeItem[]
  loading: boolean
  onDelete: (id: string) => void
}

export default function WardrobeGrid({ items, loading, onDelete }: Props) {
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
        <ItemCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  )
}
