import { EYE_COLOURS, HAIR_COLOURS, STYLE_PREFS } from '@fashun/shared'
import type { EyeColour, HairColour, SkinDepth, SkinUndertone, StylePref } from '@fashun/shared'
import { extractJson } from './extract-json'

export interface SkinToneAnalysis {
  undertone: SkinUndertone
  depth: SkinDepth
  hairColour: HairColour | null
  eyeColour: EyeColour | null
  suggestedStyles: StylePref[]
}

export type SkinToneParseResult =
  | { ok: true; analysis: SkinToneAnalysis; dropped: string[] }
  | { ok: false; reason: string }

const MAX_STYLES = 4
const UNDERTONES = ['warm', 'cool', 'neutral'] as const
const DEPTHS = ['light', 'medium', 'deep'] as const

/** "Dark Brown", "dark_brown " and "Dark-Brown" all become "dark-brown". */
export function normaliseValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return clean || null
}

function matchOne<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const n = normaliseValue(value)
  return allowed.find((a) => a === n) ?? null
}

/**
 * Reads the model's reply. Only undertone and depth are essential; hair and eye colour
 * that don't match become null, and unknown styles are dropped.
 */
export function parseSkinToneReply(text: string): SkinToneParseResult {
  const raw = extractJson<Record<string, unknown>>(text, 'object')
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'no JSON in reply' }

  const undertone = matchOne(raw.undertone, UNDERTONES)
  if (!undertone) return { ok: false, reason: 'parse failed: undertone' }
  const depth = matchOne(raw.depth, DEPTHS)
  if (!depth) return { ok: false, reason: 'parse failed: depth' }

  const dropped: string[] = []
  const hairColour = matchOne(raw.hairColour, HAIR_COLOURS)
  if (!hairColour) dropped.push('hairColour')
  const eyeColour = matchOne(raw.eyeColour, EYE_COLOURS)
  if (!eyeColour) dropped.push('eyeColour')

  const styles: StylePref[] = []
  if (Array.isArray(raw.suggestedStyles)) {
    for (const s of raw.suggestedStyles) {
      const style = matchOne(s, STYLE_PREFS)
      if (style && !styles.includes(style)) styles.push(style)
    }
  }
  const suggestedStyles = styles.slice(0, MAX_STYLES)
  if (suggestedStyles.length === 0) dropped.push('suggestedStyles')

  return { ok: true, analysis: { undertone, depth, hairColour, eyeColour, suggestedStyles }, dropped }
}
