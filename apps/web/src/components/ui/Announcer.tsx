'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Announce = (message: string) => void

const AnnounceContext = createContext<Announce>(() => {})

/**
 * Keeps one empty role="status" region mounted for the whole session and writes
 * toast and banner text into it, so screen readers announce the change. A live
 * region created together with its text is often not announced.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const announce = useCallback<Announce>((message) => {
    if (timer.current) clearTimeout(timer.current)
    // Clear first so the same message twice in a row is announced twice.
    setText('')
    timer.current = setTimeout(() => setText(message), 50)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">{text}</div>
    </AnnounceContext.Provider>
  )
}

export function useAnnounce(): Announce {
  return useContext(AnnounceContext)
}
