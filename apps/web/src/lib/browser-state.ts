'use client'
import { useSyncExternalStore } from 'react'
import type { OccasionTag } from '@fashun/shared'
import { isOccasion } from './style-me'

const KEY = 'fashun:last-occasion'
const listeners = new Set<() => void>()

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** False while the browser reports no connection. Assumed online on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

function subscribeLast(callback: () => void) {
  listeners.add(callback)
  window.addEventListener('storage', callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', callback)
  }
}

function readLast(): OccasionTag | null {
  try {
    const value = window.localStorage.getItem(KEY)
    return isOccasion(value) ? value : null
  } catch {
    return null
  }
}

/** The occasion picked last time, remembered on this device. */
export function useLastOccasion(): OccasionTag | null {
  return useSyncExternalStore(subscribeLast, readLast, () => null)
}

export function rememberOccasion(occasion: OccasionTag): void {
  try {
    window.localStorage.setItem(KEY, occasion)
  } catch {
    // Private mode: the preselection just won't be remembered.
  }
  listeners.forEach((l) => l())
}

/** True when the user asked for less motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
