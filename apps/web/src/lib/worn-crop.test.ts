import { describe, it, expect } from 'vitest'
import { cropArea, parseWornFit } from './worn-crop'
import { notesWithTucking, parseFitReading } from './fit-notes'

const box = { left: 0.2, top: 0.2, right: 0.6, bottom: 0.8 }

describe('cropArea', () => {
  it('adds a small margin and stays inside the photo', () => {
    const a = cropArea(box, 'top')
    expect(a.left).toBeCloseTo(0.168)
    expect(a.bottom).toBeCloseTo(0.848)
    expect(cropArea({ left: 0, top: 0, right: 1, bottom: 1 }, 'top')).toEqual({ left: 0, top: 0, right: 1, bottom: 1 })
  })
  it('cuts bottoms and one-pieces above the ankle, with no margin below', () => {
    for (const kind of ['bottom', 'one-piece'] as const) expect(cropArea(box, kind).bottom).toBeCloseTo(0.2 + 0.6 * 0.9)
  })
  it('keeps the full box of footwear', () => {
    expect(cropArea({ left: 0.3, top: 0.85, right: 0.7, bottom: 0.95 }, 'shoes').bottom).toBeCloseTo(0.96)
  })
})

describe('parseWornFit', () => {
  it('accepts a stored value and refuses anything else', () => {
    expect(parseWornFit({ box, tucked: 'tucked' })).toEqual({ box, tucked: 'tucked' })
    expect(parseWornFit({ box: null, tucked: 'unclear' })).toEqual({ box: null, tucked: 'unclear' })
    for (const bad of [null, undefined, 'x', {}, { box, tucked: 'maybe' }, { box: { ...box, right: 1.5 }, tucked: 'tucked' }, { box: { left: 0.5, top: 0.5, right: 0.51, bottom: 0.51 }, tucked: 'tucked' }]) {
      expect(parseWornFit(bad)).toBeNull()
    }
  })
})

describe('parseFitReading', () => {
  it('reads notes, box and tucked from the reply, even inside a code fence', () => {
    const json = JSON.stringify({ notes: 'Slim fit.', box, tucked: 'tucked' })
    expect(parseFitReading('```json\n' + json + '\n```')).toEqual({ notes: 'Slim fit.', fit: { box, tucked: 'tucked' } })
  })
  it('drops a bad box or tucked value and keeps the rest; nothing usable is null', () => {
    expect(parseFitReading(JSON.stringify({ notes: 'Slim.', box: 'x', tucked: 'yes' }))).toEqual({ notes: 'Slim.', fit: { box: null, tucked: 'unclear' } })
    expect(parseFitReading(JSON.stringify({ notes: 'NONE', box: null, tucked: 'tucked' }))).toBeNull()
    expect(parseFitReading('Relaxed fit.')).toBeNull()
    expect(parseFitReading('')).toBeNull()
  })
})

describe('notesWithTucking', () => {
  it('says tucking only when the field does', () => {
    expect(notesWithTucking('Boxy.', 'tucked')).toBe('Boxy. Worn tucked in.')
    expect(notesWithTucking('Boxy.', 'untucked')).toBe('Boxy. Worn untucked.')
    expect(notesWithTucking('Boxy.', 'unclear')).toBe('Boxy.')
    expect(notesWithTucking('Boxy.', null)).toBe('Boxy.')
    expect(notesWithTucking(null, 'untucked')).toBe('Worn untucked.')
    expect(notesWithTucking('  ', 'unclear')).toBeNull()
  })
})
