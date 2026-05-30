'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ColourSeason } from '@fashun/shared'
import { SEASON_LABELS } from '@fashun/shared'

export default function SkinToneStep() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<{ season: ColourSeason } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleAnalyse() {
    if (!preview) return
    setLoading(true)
    setError('')
    // Strip the data:image/...;base64, prefix
    const base64 = preview.split(',')[1]
    const res = await fetch('/api/onboarding/skin-tone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    setResult(data)
    setLoading(false)
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Your colour story starts here 🤳</h2>
        <p className="text-zinc-400 text-sm">
          Take a selfie in natural light so we can find your colour season.
          Your photo is analysed immediately and never stored.
        </p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 rounded-2xl h-52 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-500 transition-colors overflow-hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="selfie preview" className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="text-4xl">👤</span>
            <span className="text-zinc-500 text-sm">Tap to upload selfie</span>
            <span className="text-zinc-700 text-xs">Good natural lighting works best</span>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {result && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
          <p className="text-zinc-400 text-xs uppercase tracking-widest mb-1">Your season</p>
          <p className="text-xl font-bold text-purple-300">{SEASON_LABELS[result.season]}</p>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!result ? (
        <button
          onClick={handleAnalyse}
          disabled={!preview || loading}
          className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
        >
          {loading ? 'Analysing…' : 'Analyse my skin tone'}
        </button>
      ) : (
        <button
          onClick={() => router.push('/onboarding/style')}
          className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold"
        >
          Looks good — continue →
        </button>
      )}
    </div>
  )
}
