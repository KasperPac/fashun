'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AddPiece from '@/components/wardrobe/AddPiece'
import { readPresets } from '@/lib/wardrobe-view'
import { addPieceBackHref, addPieceSavedHref } from '@/lib/onboarding-back'

function AddContent() {
  const params = useSearchParams()
  const presets = readPresets(params)
  const addFrom = params.get('from')
  const backHref = addPieceBackHref(addFrom)
  return (
    <main className="mx-auto w-full max-w-[480px] px-6 pb-8 pt-4 lg:max-w-[720px]">
      <Link
        href={backHref}
        aria-label="Back"
        className="-ml-3 mb-2 flex h-11 w-11 items-center justify-center"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>
      <h1 className="mb-6 font-display text-[44px] font-extrabold uppercase leading-none">Add a piece</h1>
      <AddPiece
        presets={presets}
        returnTo={backHref}
        onSaved={(name) => addPieceSavedHref(addFrom, name)}
      />
    </main>
  )
}

export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddContent />
    </Suspense>
  )
}
