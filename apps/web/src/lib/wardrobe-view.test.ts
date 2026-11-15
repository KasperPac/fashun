import { describe, it, expect } from 'vitest'
import type { OccasionTag, WardrobeCategory } from '@fashun/shared'
import { addHref, filterItems, occasionColour, readPresets, firstColourLabel, noMatchMessage, outfitReadiness, paletteLine, pieceCount } from './wardrobe-view'

const item = (category: WardrobeCategory, occasionTags: OccasionTag[]) => ({ category, occasionTags })

describe('filterItems', () => {
  const items = [item('tops', ['casual']), item('shoes', ['formal']), item('shoes', ['casual', 'formal'])]
  it('returns everything for All and Any', () => {
    expect(filterItems(items, 'all', 'all')).toHaveLength(3)
  })
  it('filters by category, occasion, and both together', () => {
    expect(filterItems(items, 'shoes', 'all')).toHaveLength(2)
    expect(filterItems(items, 'all', 'casual')).toHaveLength(2)
    expect(filterItems(items, 'shoes', 'formal')).toHaveLength(2)
    expect(filterItems(items, 'tops', 'formal')).toHaveLength(0)
  })
  it('handles an empty wardrobe', () => {
    expect(filterItems([], 'shoes', 'work')).toEqual([])
  })
})

describe('noMatchMessage', () => {
  it('words each combination', () => {
    expect(noMatchMessage('shoes', 'formal')).toBe('No formal shoes yet.')
    expect(noMatchMessage('shoes', 'all')).toBe('No shoes yet.')
    expect(noMatchMessage('all', 'smart-casual')).toBe('No smart casual pieces yet.')
  })
})

describe('pieceCount', () => {
  it('pluralises', () => {
    expect(pieceCount(0)).toBe('0 pieces')
    expect(pieceCount(1)).toBe('1 piece')
    expect(pieceCount(24)).toBe('24 pieces')
  })
})

describe('firstColourLabel', () => {
  it('names the first colour and counts the rest', () => {
    expect(firstColourLabel(['#000080'])).toBe('Navy')
    expect(firstColourLabel(['#000080', '#FFFFFF', '#CD853F'])).toBe('Navy +2')
  })
  it('ignores values that are not colours, and says so when none are left', () => {
    expect(firstColourLabel([])).toBe('No colour')
    expect(firstColourLabel(['navy', ''])).toBe('No colour')
    expect(firstColourLabel(['bad', '#000080'])).toBe('Navy')
  })
})

describe('paletteLine', () => {
  it('says nothing without a season or a colour', () => {
    expect(paletteLine(['#D2691E'], null)).toBeNull()
    expect(paletteLine([], 'autumn')).toBeNull()
    expect(paletteLine(['nope'], 'autumn')).toBeNull()
  })
  it('names the season in both outcomes', () => {
    expect(paletteLine(['#D2691E'], 'autumn')).toBe('✓ In your Autumn palette')
    expect(paletteLine(['#0047AB'], 'autumn')).toBe('Outside your Autumn palette. It can still be used in outfits.')
  })
})

describe('outfitReadiness', () => {
  it('lists the four occasions in order, all needing a top when empty', () => {
    const r = outfitReadiness([])
    expect(r.map((x) => x.occasion)).toEqual(['casual', 'smart-casual', 'work', 'formal'])
    expect(r.every((x) => !x.ready && x.status === 'Needs a top')).toBe(true)
  })
  it('names the first missing piece per occasion', () => {
    const r = outfitReadiness([
      item('tops', ['formal']), item('bottoms', ['formal']),
      item('tops', ['casual']), item('bottoms', ['casual']), item('shoes', ['casual']),
    ])
    const by = Object.fromEntries(r.map((x) => [x.occasion, x]))
    expect(by.casual).toMatchObject({ ready: true, missing: null, status: 'Ready' })
    expect(by.formal).toMatchObject({ ready: false, missing: 'shoes', status: 'Needs shoes' })
  })
  it('does not count casual-only pieces for formal, and counts untagged pieces', () => {
    const r = outfitReadiness([item('tops', []), item('bottoms', []), item('shoes', ['casual'])])
    const by = Object.fromEntries(r.map((x) => [x.occasion, x]))
    expect(by.formal.missing).toBe('shoes')
    expect(by.work.ready).toBe(true)
  })
})

describe('addHref / readPresets', () => {
  it('builds and reads the preset links', () => {
    expect(addHref(null, null)).toBe('/wardrobe/add')
    expect(addHref('shoes', 'formal')).toBe('/wardrobe/add?category=shoes&occasion=formal')
    expect(addHref('tops', null, 'onboarding')).toBe('/wardrobe/add?category=tops&from=onboarding')
    expect(readPresets(new URLSearchParams('category=shoes&occasion=formal'))).toEqual({ category: 'shoes', occasion: 'formal' })
  })
  it('ignores unknown presets', () => {
    expect(readPresets(new URLSearchParams('category=hats&occasion=party'))).toEqual({ category: null, occasion: null })
    expect(readPresets(new URLSearchParams(''))).toEqual({ category: null, occasion: null })
  })
  it('maps occasions to colour tokens', () => {
    expect(occasionColour('smart-casual')).toBe('var(--color-occ-smart)')
    expect(occasionColour('formal')).toBe('var(--color-occ-formal)')
  })
})
