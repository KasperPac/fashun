'use client'
import { useState, useEffect, useCallback } from 'react'
import type { WardrobeItem, WardrobeCategory } from '@fashun/shared'
import CategoryCarousel from '@/components/wardrobe/CategoryCarousel'
import type { CategoryOption } from '@/components/wardrobe/CategoryCarousel'
import WardrobeGrid from '@/components/wardrobe/WardrobeGrid'
import OwnershipToggle from '@/components/wardrobe/OwnershipToggle'

export default function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryOption>('all')
  const [ownership, setOwnership] = useState<'owned' | 'wishlist'>('owned')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ ownership })
    if (category !== 'all') params.set('category', category as WardrobeCategory)
    const res = await fetch(`/api/wardrobe?${params}`)
    const json = await res.json()
    setItems(json.items ?? [])
    setLoading(false)
  }, [category, ownership])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleDelete(id: string) {
    await fetch('/api/wardrobe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black tracking-tight">My Wardrobe</h1>
          <span className="text-zinc-500 text-sm">{items.length} items</span>
        </div>
        <OwnershipToggle active={ownership} onChange={setOwnership} />
        <div className="mt-3">
          <CategoryCarousel active={category} onChange={setCategory} />
        </div>
      </div>
      <div className="flex-1 px-4 pb-24">
        <WardrobeGrid items={items} loading={loading} onDelete={handleDelete} />
      </div>
      <div className="fixed bottom-6 inset-x-4">
        <a
          href="/wardrobe/add"
          className="block bg-purple-600 hover:bg-purple-500 text-white text-center rounded-2xl py-4 font-bold text-sm shadow-xl shadow-purple-900/50"
        >
          📸 Add Item
        </a>
      </div>
    </div>
  )
}
