import { describe, it, expect } from 'vitest'
import { parseSkinToneReply, normaliseValue } from './skin-tone-parse'

const base = { undertone: 'warm', depth: 'light', hairColour: 'blonde', eyeColour: 'blue', suggestedStyles: ['casual', 'minimalist'] }
const reply = (o: Record<string, unknown>) => JSON.stringify({ ...base, ...o })

function ok(text: string) {
  const r = parseSkinToneReply(text)
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`)
  return r
}

describe('normaliseValue', () => {
  it.each([['Dark Brown', 'dark-brown'], ['  dark_brown ', 'dark-brown'], ['Dark-Brown', 'dark-brown'], ['smart casual', 'smart-casual']])('%s', (i, o) => {
    expect(normaliseValue(i)).toBe(o)
  })
  it('returns null for non-strings and blanks', () => {
    expect(normaliseValue(3)).toBeNull()
    expect(normaliseValue('   ')).toBeNull()
  })
})

describe('parseSkinToneReply', () => {
  it('accepts an exact match', () => {
    const r = ok(reply({}))
    expect(r.analysis).toEqual({ undertone: 'warm', depth: 'light', hairColour: 'blonde', eyeColour: 'blue', suggestedStyles: ['casual', 'minimalist'] })
    expect(r.dropped).toEqual([])
  })
  it('accepts case, space and underscore variants', () => {
    const r = ok(reply({ undertone: ' Warm ', depth: 'MEDIUM', hairColour: 'Dark Brown', eyeColour: 'HAZEL', suggestedStyles: ['Smart Casual', 'smart_casual'] }))
    expect(r.analysis).toMatchObject({ undertone: 'warm', depth: 'medium', hairColour: 'dark-brown', eyeColour: 'hazel', suggestedStyles: ['smart-casual'] })
  })
  it('saves unknown hair as null and reports it', () => {
    const r = ok(reply({ hairColour: 'purple' }))
    expect(r.analysis.hairColour).toBeNull()
    expect(r.dropped).toEqual(['hairColour'])
  })
  it('saves unknown eye as null and reports it', () => {
    const r = ok(reply({ eyeColour: 'violet' }))
    expect(r.analysis.eyeColour).toBeNull()
    expect(r.dropped).toEqual(['eyeColour'])
  })
  it('treats missing hair and eye as null', () => {
    const r = ok(JSON.stringify({ undertone: 'cool', depth: 'deep', suggestedStyles: ['glam'] }))
    expect(r.analysis).toMatchObject({ hairColour: null, eyeColour: null })
  })
  it('keeps valid styles and drops unknown ones', () => {
    expect(ok(reply({ suggestedStyles: ['casual', 'goth', 42, 'glam'] })).analysis.suggestedStyles).toEqual(['casual', 'glam'])
  })
  it('keeps at most 4 styles', () => {
    const r = ok(reply({ suggestedStyles: ['casual', 'business', 'streetwear', 'minimalist', 'glam'] }))
    expect(r.analysis.suggestedStyles).toEqual(['casual', 'business', 'streetwear', 'minimalist'])
  })
  it('accepts an empty or missing style list as empty', () => {
    expect(ok(reply({ suggestedStyles: [] })).analysis.suggestedStyles).toEqual([])
    expect(ok(reply({ suggestedStyles: 'casual' })).analysis.suggestedStyles).toEqual([])
  })
  it('fails when undertone is missing or invalid', () => {
    expect(parseSkinToneReply(JSON.stringify({ depth: 'light' }))).toEqual({ ok: false, reason: 'parse failed: undertone' })
    expect(parseSkinToneReply(reply({ undertone: 'purple' }))).toEqual({ ok: false, reason: 'parse failed: undertone' })
  })
  it('fails when depth is missing or invalid', () => {
    expect(parseSkinToneReply(JSON.stringify({ undertone: 'warm' }))).toEqual({ ok: false, reason: 'parse failed: depth' })
    expect(parseSkinToneReply(reply({ depth: 'dark' }))).toEqual({ ok: false, reason: 'parse failed: depth' })
  })
  it('reads fenced JSON and JSON inside prose', () => {
    expect(ok('```json\n' + reply({}) + '\n```').analysis.undertone).toBe('warm')
    expect(ok('Here you go: ' + reply({}) + ' hope that helps').analysis.depth).toBe('light')
  })
  it('fails when there is no JSON', () => {
    expect(parseSkinToneReply('sorry, I cannot do that')).toEqual({ ok: false, reason: 'no JSON in reply' })
    expect(parseSkinToneReply('{"undertone": "warm", ')).toEqual({ ok: false, reason: 'no JSON in reply' })
  })

  // Tests named in docs/test-scripts/KAS-174.md (section A)
  it('parses hair colour regardless of case, spaces and hyphens', () => {
    for (const v of ['Dark Brown', 'dark brown', 'dark-brown', 'DARK-BROWN', ' dark  brown ']) {
      expect(ok(reply({ hairColour: v })).analysis.hairColour).toBe('dark-brown')
    }
  })
  it('normalises case, spaces and hyphens for every field', () => {
    const r = ok(JSON.stringify({ undertone: ' WARM ', depth: 'Medium', hairColour: ' Dark  Brown', eyeColour: 'HAZEL', suggestedStyles: ['Smart  Casual', 'smart-casual '] }))
    expect(r.analysis).toEqual({ undertone: 'warm', depth: 'medium', hairColour: 'dark-brown', eyeColour: 'hazel', suggestedStyles: ['smart-casual'] })
    expect(ok(reply({ eyeColour: 'Blue ' })).analysis.eyeColour).toBe('blue')
  })
  it('drops an unknown hair colour and keeps the reading', () => {
    const r = ok(reply({ hairColour: 'salt and pepper' }))
    expect(r.analysis).toMatchObject({ undertone: 'warm', depth: 'light', hairColour: null, eyeColour: 'blue' })
    expect(r.analysis.suggestedStyles).toEqual(['casual', 'minimalist'])
  })
  it('drops an unknown eye colour and keeps the reading', () => {
    const r = ok(reply({ eyeColour: 'violet' }))
    expect(r.analysis).toMatchObject({ undertone: 'warm', depth: 'light', eyeColour: null, hairColour: 'blonde' })
  })
  it('drops only the unknown style', () => {
    expect(ok(reply({ suggestedStyles: ['casual', 'goth', 'glam'] })).analysis.suggestedStyles).toEqual(['casual', 'glam'])
  })
  it('keeps the reading when no style matches', () => {
    expect(ok(reply({ suggestedStyles: ['goth', 'punk'] })).analysis.suggestedStyles).toEqual([])
    expect(ok(JSON.stringify({ undertone: 'warm', depth: 'light' })).analysis.suggestedStyles).toEqual([])
  })
  it('undertone and depth alone are enough', () => {
    const r = ok(JSON.stringify({ undertone: 'cool', depth: 'deep' }))
    expect(r.analysis).toEqual({ undertone: 'cool', depth: 'deep', hairColour: null, eyeColour: null, suggestedStyles: [] })
  })
  it('fails when undertone is missing or unknown', () => {
    expect(parseSkinToneReply(JSON.stringify({ depth: 'light' })).ok).toBe(false)
    expect(parseSkinToneReply(reply({ undertone: 'purple' })).ok).toBe(false)
  })
  it('fails when depth is missing or unknown', () => {
    expect(parseSkinToneReply(JSON.stringify({ undertone: 'warm' })).ok).toBe(false)
    expect(parseSkinToneReply(reply({ depth: 'dark' })).ok).toBe(false)
  })
  it('fails cleanly on an unreadable answer', () => {
    for (const text of ['', 'I could not see a face.', '{"undertone": "warm", "depth": "li']) {
      expect(parseSkinToneReply(text).ok).toBe(false)
    }
  })
})
