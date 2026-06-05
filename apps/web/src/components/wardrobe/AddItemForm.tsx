'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WardrobeCategory } from '@fashun/shared'

type Candidate = { url: string; title: string; imageUrl: string | null; retailer: string | null; price?: number }

type ProcessResult = {
  processedImageUrl: string
  category: WardrobeCategory
  colours: string[]
  styleTags: string[]
  suggestedName: string
  searchQuery: string
  candidates: Candidate[]
}

type Selected = { kind: 'user' } | { kind: 'stock'; candidate: Candidate }

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

export default function AddItemForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'processing' | 'confirming' | 'saving'>('idle')
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [selected, setSelected] = useState<Selected>({ kind: 'user' })
  const [name, setName] = useState('')
  const [category, setCategory] = useState<WardrobeCategory>('tops')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function processFile(file: File) {
    setState('processing')
    setError('')
    setNotice('')
    const base64 = await fileToBase64(file)
    try {
      const res = await fetch('/api/wardrobe/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Processing failed'); setState('idle'); return }
      const r = data as ProcessResult
      setResult(r)
      setName(r.suggestedName)
      setCategory(r.category)
      // Default to the best stock image when one was found; otherwise the user's photo.
      setSelected(r.candidates.length ? { kind: 'stock', candidate: r.candidates[0] } : { kind: 'user' })
      setState('confirming')
    } catch {
      setError('Could not process that photo — please try again.')
      setState('idle')
    }
  }

  async function handleSave() {
    if (!result) return
    setState('saving')
    setError('')
    setNotice('')

    let imageUrl = result.processedImageUrl
    let colours = result.colours
    let price: number | undefined
    let retailer: string | undefined
    let storeUrl: string | undefined

    if (selected.kind === 'stock') {
      const thumb = selected.candidate.imageUrl
      if (!thumb) {
        setNotice("That match has no image — using your photo instead.")
        setSelected({ kind: 'user' })
        setState('confirming')
        return
      }
      try {
        const res = await fetch('/api/wardrobe/ingest-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: thumb }),
        })
        const data = await res.json()
        if (res.ok && data.path) {
          imageUrl = data.path
          retailer = selected.candidate.retailer ?? undefined
          price = selected.candidate.price
          storeUrl = selected.candidate.url
          // colours stay from Vision tags (Lens returns no colours)
        } else {
          setNotice("Couldn't fetch that product image — using your photo instead.")
          setSelected({ kind: 'user' })
          setState('confirming')
          return
        }
      } catch {
        setNotice("Couldn't fetch that product image — using your photo instead.")
        setSelected({ kind: 'user' })
        setState('confirming')
        return
      }
    }

    try {
      const res = await fetch('/api/wardrobe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, colours, styleTags: result.styleTags, imageUrl,
          ownership: 'owned', price, retailer, storeUrl,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not save the item — please try again.')
        setState('confirming')
        return
      }
      router.push('/wardrobe')
    } catch {
      setError('Could not save the item — please try again.')
      setState('confirming')
    }
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
        <p className="text-zinc-400 text-sm">Tagging and finding your item…</p>
      </div>
    )
  }

  if ((state === 'confirming' || state === 'saving') && result) {
    const previewUrl = selected.kind === 'stock' ? (selected.candidate.imageUrl ?? result.processedImageUrl) : result.processedImageUrl
    return (
      <div className="flex flex-col gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={name} className="w-40 h-52 object-contain mx-auto bg-zinc-900 rounded-xl" />

        {result.candidates.length > 0 && (
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-widest mb-2 block">Which photo?</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                aria-pressed={selected.kind === 'user'}
                onClick={() => { setNotice(''); setSelected({ kind: 'user' }) }}
                className={`shrink-0 rounded-xl p-1 border-2 ${selected.kind === 'user' ? 'border-purple-500' : 'border-zinc-800'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.processedImageUrl} alt="Your photo" className="w-16 h-20 object-contain bg-zinc-900 rounded-lg" />
                <span className="block text-[10px] text-zinc-400 mt-1">Your photo</span>
              </button>
              {result.candidates.map((c) => (
                <button
                  key={c.url}
                  type="button"
                  aria-pressed={selected.kind === 'stock' && selected.candidate.url === c.url}
                  onClick={() => { setNotice(''); setSelected({ kind: 'stock', candidate: c }) }}
                  className={`shrink-0 rounded-xl p-1 border-2 ${selected.kind === 'stock' && selected.candidate.url === c.url ? 'border-purple-500' : 'border-zinc-800'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.imageUrl
                    ? <img src={c.imageUrl} alt={c.title} className="w-16 h-20 object-contain bg-zinc-900 rounded-lg" />
                    : <div className="w-16 h-20 bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-600 text-xs">no img</div>}
                  <span className="block text-[10px] text-zinc-400 mt-1 truncate w-16">{c.retailer ?? 'Stock'}</span>
                </button>
              ))}
            </div>
            <p className="text-zinc-600 text-[11px] mt-1">Official product photos usually look better in try-on.</p>
          </div>
        )}

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
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        {notice && <p className="text-amber-400 text-sm">{notice}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
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
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}
