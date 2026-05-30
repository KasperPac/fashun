'use client'
import { useState } from 'react'

interface Props {
  item: {
    name: string
    imageUrl: string
    storeUrl: string
    price?: number
    retailer?: string
    category: string
    colours?: string[]
  }
}

export default function SaveToWardrobeButton({ item }: Props) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleSave() {
    setStatus('saving')
    const res = await fetch('/api/wardrobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        category: item.category,
        colours: item.colours ?? [],
        styleTags: [],
        imageUrl: item.imageUrl,
        ownership: 'wishlist',
        storeUrl: item.storeUrl,
        price: item.price,
        retailer: item.retailer,
      }),
    })
    setStatus(res.ok ? 'saved' : 'error')
  }

  if (status === 'saved') {
    return (
      <button disabled className="bg-green-900 text-green-400 text-xs font-bold rounded-lg px-3 py-1.5">
        Saved ✓
      </button>
    )
  }

  return (
    <button
      onClick={handleSave}
      disabled={status === 'saving'}
      className="bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50"
    >
      {status === 'saving' ? '…' : status === 'error' ? 'Try again' : 'Save'}
    </button>
  )
}
