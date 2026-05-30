'use client'
import { useRouter } from 'next/navigation'

export default function AddItemsPage() {
  const router = useRouter()

  async function handleFinish() {
    // Mark onboarding complete
    await fetch('/api/onboarding/complete', { method: 'POST' })
    router.push('/wardrobe')
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">You&apos;re all set! 🎉</h2>
        <p className="text-zinc-400 text-sm">
          Head to your wardrobe to start adding items, or jump straight in.
        </p>
      </div>
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col gap-3">
        <p className="text-white font-semibold text-sm">Add items by:</p>
        <div className="flex items-start gap-3">
          <span className="text-xl">📸</span>
          <div>
            <p className="text-white text-sm font-medium">Photo upload</p>
            <p className="text-zinc-500 text-xs">Snap or upload a photo — AI tags it automatically</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-xl">🔗</span>
          <div>
            <p className="text-white text-sm font-medium">Save from store</p>
            <p className="text-zinc-500 text-xs">Add items you love while shopping online</p>
          </div>
        </div>
      </div>
      <button
        onClick={handleFinish}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold"
      >
        Go to my wardrobe →
      </button>
    </div>
  )
}
