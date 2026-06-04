'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WardrobeCategory, Ownership } from '@fashun/shared'
import type { ColourVariant } from '@/lib/product-extractor'
import ColourVariantPicker from './ColourVariantPicker'
import OwnershipToggle from './OwnershipToggle'

type Product = {
  suggestedName: string
  category: WardrobeCategory
  colours: string[]
  colourVariants: ColourVariant[]
  styleTags: string[]
  processedImageUrl: string | null
  storeUrl: string
  price: number | null
  retailer: string | null
}
type Candidate = { url: string; title: string; imageUrl: string | null; retailer: string | null }

const CATEGORIES: WardrobeCategory[] = ['tops', 'bottoms', 'shoes', 'outerwear', 'bags', 'accessories']

export default function AddByLinkForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'input' | 'loading' | 'confirm' | 'candidates' | 'manual' | 'saving'>('input')
  const [describe, setDescribe] = useState(false)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [store, setStore] = useState('')
  const [itemPhoto, setItemPhoto] = useState<string | undefined>(undefined)
  const [ownership, setOwnership] = useState<Ownership>('owned')
  const [error, setError] = useState('')

  const [product, setProduct] = useState<Product | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [name, setName] = useState('')
  const [category, setCategory] = useState<WardrobeCategory>('tops')
  const [selectedHex, setSelectedHex] = useState<string | undefined>(undefined)
  const [manualImageUrl, setManualImageUrl] = useState('')

  async function submit(payload: Record<string, unknown>) {
    setMode('loading')
    setError('')
    const res = await fetch('/api/wardrobe/from-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Something went wrong'); setMode('input'); return }

    if (data.mode === 'candidates') { setCandidates(data.candidates); setMode('candidates'); return }
    if (data.mode === 'manual') {
      setName(''); setCategory('tops'); setManualImageUrl(''); setMode('manual')
      setProduct({ suggestedName: '', category: 'tops', colours: [], colourVariants: [], styleTags: [],
        processedImageUrl: null, storeUrl: data.storeUrl, price: null, retailer: null })
      return
    }
    // confirm
    const p: Product = data.product
    setProduct(p); setName(p.suggestedName); setCategory(p.category)
    setSelectedHex(p.colours[0]); setMode('confirm')
  }

  async function handleSave(imageUrl: string, colours: string[]) {
    if (!product) return
    const returnMode = mode === 'manual' ? 'manual' : 'confirm'
    setMode('saving')
    setError('')
    try {
      const res = await fetch('/api/wardrobe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, colours, styleTags: product.styleTags, imageUrl, ownership,
          storeUrl: product.storeUrl, price: product.price ?? undefined, retailer: product.retailer ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not save the item — please try again.')
        setMode(returnMode)
        return
      }
      router.push('/wardrobe')
    } catch {
      setError('Could not save the item — please try again.')
      setMode(returnMode)
    }
  }

  if (mode === 'loading' || mode === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">{mode === 'saving' ? 'Saving…' : 'Finding your item…'}</p>
      </div>
    )
  }

  if (mode === 'candidates') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-zinc-400 text-sm">Which one is it?</p>
        {candidates.map(c => (
          <button key={c.url} onClick={() => submit({ url: c.url, itemPhotoBase64: itemPhoto })}
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-left hover:border-purple-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.imageUrl && <img src={c.imageUrl} alt={c.title} className="w-12 h-12 object-contain rounded" />}
            <div>
              <p className="text-white text-sm font-semibold">{c.title}</p>
              <p className="text-zinc-500 text-xs">{c.retailer}</p>
            </div>
          </button>
        ))}
        <button onClick={() => setMode('input')} className="text-zinc-500 text-sm hover:text-white">← Back</button>
      </div>
    )
  }

  if (mode === 'confirm' && product) {
    const colours = selectedHex ? [selectedHex] : product.colours
    return (
      <div className="flex flex-col gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.processedImageUrl && (
          <img src={product.processedImageUrl} alt={name} className="w-40 h-52 object-contain mx-auto bg-zinc-900 rounded-xl" />
        )}
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <ColourVariantPicker variants={product.colourVariants} selectedHex={selectedHex} onSelect={setSelectedHex} />
        <OwnershipToggle active={ownership} onChange={setOwnership} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={() => setMode('input')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold hover:bg-zinc-800">← Redo</button>
          <button onClick={() => handleSave(product.processedImageUrl ?? '', colours)}
            disabled={!product.processedImageUrl}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50">
            ✓ Save to Wardrobe
          </button>
        </div>
        {!product.processedImageUrl && <p className="text-amber-400 text-xs">No image found — switch to the 📸 Photo tab to add one.</p>}
      </div>
    )
  }

  if (mode === 'manual' && product) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-amber-400 text-sm">Couldn&apos;t read that page automatically — fill in the details.</p>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Image URL</label>
          <input value={manualImageUrl} onChange={e => setManualImageUrl(e.target.value)} placeholder="https://…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
        </div>
        <OwnershipToggle active={ownership} onChange={setOwnership} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={() => setMode('input')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold hover:bg-zinc-800">← Back</button>
          <button onClick={() => handleSave(manualImageUrl, [])}
            disabled={!name || !manualImageUrl}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50">
            ✓ Save to Wardrobe
          </button>
        </div>
      </div>
    )
  }

  // input mode
  return (
    <div className="flex flex-col gap-4">
      {!describe ? (
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Store link</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.theiconic.com.au/…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          <button onClick={() => setDescribe(true)} className="text-purple-400 text-xs mt-2 hover:underline">No link? Describe it instead →</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Describe the item</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="black Nike running shoes"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Store</label>
            <input value={store} onChange={e => setStore(e.target.value)} placeholder="THE ICONIC"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500" />
          </div>
          <button onClick={() => setDescribe(false)} className="text-purple-400 text-xs hover:underline">← Use a link instead</button>
        </div>
      )}

      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Photo of your item (optional — helps pick the colour)</label>
        <input type="file" accept="image/*"
          onChange={async e => { const f = e.target.files?.[0]; if (f) { const b = await fileToBase64(f); if (b) setItemPhoto(b) } }}
          className="text-zinc-400 text-sm" />
      </div>

      <OwnershipToggle active={ownership} onChange={setOwnership} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={() => describe ? submit({ description, store }) : submit({ url, itemPhotoBase64: itemPhoto })}
        disabled={describe ? (!description || !store) : !url}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50">
        Find item
      </button>
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}
