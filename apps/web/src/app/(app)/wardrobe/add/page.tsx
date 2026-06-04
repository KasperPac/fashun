'use client'
import { useState } from 'react'
import AddItemForm from '@/components/wardrobe/AddItemForm'
import AddByLinkForm from '@/components/wardrobe/AddByLinkForm'

export default function AddItemPage() {
  const [method, setMethod] = useState<'photo' | 'link'>('photo')
  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a href="/wardrobe" className="text-zinc-500 hover:text-white text-xl">←</a>
        <h1 className="text-xl font-black">Add Item</h1>
      </div>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setMethod('photo')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            method === 'photo' ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>
          📸 Photo
        </button>
        <button onClick={() => setMethod('link')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            method === 'link' ? 'bg-purple-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>
          🔗 Link
        </button>
      </div>
      {method === 'photo' ? <AddItemForm /> : <AddByLinkForm />}
    </div>
  )
}
