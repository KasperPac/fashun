'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WardrobeCategory } from '@fashun/shared'

type ProcessResult = {
  processedImageUrl: string
  category: WardrobeCategory
  colours: string[]
  styleTags: string[]
  suggestedName: string
}

export default function AddItemForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'processing' | 'confirming' | 'saving'>('idle')
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<WardrobeCategory>('tops')
  const [error, setError] = useState('')

  async function processFile(file: File) {
    setState('processing')
    setError('')
    const base64 = await fileToBase64(file)
    const res = await fetch('/api/wardrobe/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Processing failed'); setState('idle'); return }
    setResult(data)
    setName(data.suggestedName)
    setCategory(data.category)
    setState('confirming')
  }

  async function handleSave() {
    if (!result) return
    setState('saving')
    await fetch('/api/wardrobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        colours: result.colours,
        styleTags: result.styleTags,
        imageUrl: result.processedImageUrl,
        ownership: 'owned',
      }),
    })
    router.push('/wardrobe')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  if (state === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Removing background and tagging item…</p>
      </div>
    )
  }

  if ((state === 'confirming' || state === 'saving') && result) {
    return (
      <div className="flex flex-col gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.processedImageUrl} alt="Processed" className="w-40 h-52 object-contain mx-auto bg-zinc-900 rounded-xl" />
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
          >
            {['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setState('idle')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold hover:bg-zinc-800">
            ← Redo
          </button>
          <button
            onClick={handleSave}
            disabled={state === 'saving'}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {state === 'saving' ? 'Saving…' : '✓ Save to Wardrobe'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 rounded-2xl h-52 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-purple-500 transition-colors"
      >
        <span className="text-4xl">📂</span>
        <span className="text-zinc-400 text-sm font-semibold">Drop photo here or click to browse</span>
        <span className="text-zinc-600 text-xs">JPG or PNG — works best on a neutral background</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  })
}
