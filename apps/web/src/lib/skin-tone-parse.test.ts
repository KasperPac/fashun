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
})
