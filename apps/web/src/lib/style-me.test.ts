import { describe, it, expect } from 'vitest'
import {
  clampIndex, fewerMessage, loadingLine, missingPieceLine, notEnoughIntro, notEnoughTitle, pickerSubtitle,
  readGenerateResponse, readyLine, saveBody, slideIndex, sortPieces, styleButtonLabel, type StyledOutfit,
} from './style-me'

describe('not-enough copy', () => {
  it('uses the exact patterns', () => {
    expect(notEnoughTitle('formal')).toBe('Not enough for Formal yet')
    expect(notEnoughTitle('smart-casual')).toBe('Not enough for Smart casual yet')
    expect(notEnoughIntro('formal')).toBe('To make Formal outfits, add:')
    expect(missingPieceLine('shoes', 'formal')).toBe('a pair of formal shoes')
    expect(missingPieceLine('tops', 'formal')).toBe('a formal shirt or top')
    expect(missingPieceLine('tops', 'smart-casual')).toBe('a smart casual top')
    expect(missingPieceLine('bottoms', 'work')).toBe('work trousers or a skirt')
  })
  it('says what is ready, or nothing when nothing is', () => {
    expect(readyLine('formal', ['tops', 'bottoms'])).toBe('Your formal shirt and trousers are ready.')
    expect(readyLine('work', ['tops', 'bottoms', 'shoes'])).toBe('Your work top, trousers and shoes are ready.')
    expect(readyLine('casual', ['shoes'])).toBe('Your casual shoes are ready.')
    expect(readyLine('casual', ['tops'])).toBe('Your casual top is ready.')
    expect(readyLine('casual', [])).toBeNull()
  })
})

describe('fewerMessage', () => {
  it('names the count, the occasion and what to add', () => {
    expect(fewerMessage(2, 'work', 'tops')).toBe('We could only make 2 Work outfits from your wardrobe. Add a work top for more choice.')
    expect(fewerMessage(1, 'formal', 'shoes')).toBe('We could only make 1 Formal outfit from your wardrobe. Add a pair of formal shoes for more choice.')
    expect(fewerMessage(2, 'casual', null)).toBe('We could only make 2 Casual outfits from your wardrobe.')
  })
})

describe('small labels', () => {
  it('words the loading line, subtitle and button', () => {
    expect(loadingLine('work')).toBe('Putting together your Work outfits from your wardrobe…')
    expect(pickerSubtitle('autumn')).toBe('3 outfits from your own clothes, in your Autumn palette.')
    expect(pickerSubtitle(null)).not.toContain('null')
    expect(styleButtonLabel(null)).toBe('Style me')
    expect(styleButtonLabel('work')).toBe('Style me for Work')
  })
})

describe('swipe position', () => {
  it('clamps and handles empty lists', () => {
    expect(clampIndex(5, 3)).toBe(2)
    expect(clampIndex(-1, 3)).toBe(0)
    expect(clampIndex(1, 0)).toBe(0)
  })
  it('finds the slide from the scroll position', () => {
    expect(slideIndex(0, 300, 3)).toBe(0)
    expect(slideIndex(310, 300, 3)).toBe(1)
    expect(slideIndex(1200, 300, 3)).toBe(2)
    expect(slideIndex(100, 0, 3)).toBe(0)
  })
})

describe('sortPieces', () => {
  it('puts top, bottom and shoes first, then the rest; unknown last', () => {
    const out = sortPieces([{ category: 'bags' }, { category: 'shoes' }, { category: null }, { category: 'tops' }, { category: 'outerwear' }, { category: 'bottoms' }])
    expect(out.map((p) => p.category)).toEqual(['tops', 'bottoms', 'shoes', 'outerwear', 'bags', null])
  })
})

const outfit: StyledOutfit = {
  name: 'Sharp Work', occasion: 'work', description: 'd', reason: 'r',
  pieces: [{ label: 'Navy shirt', colour_hex: '#000080', item_id: 'a', in_wardrobe: true, category: 'tops', image_url: 'https://x/y.png' }],
}

describe('saveBody', () => {
  it('sends only what the API stores, with the season when known', () => {
    const body = saveBody(outfit, 'autumn')
    expect(body).toMatchObject({ name: 'Sharp Work', occasion: 'work', reason: 'r', season: 'autumn' })
    expect(body.pieces[0]).toEqual({ label: 'Navy shirt', colour_hex: '#000080', item_id: 'a', in_wardrobe: true })
    expect('season' in saveBody(outfit, null)).toBe(false)
  })
})

describe('readGenerateResponse', () => {
  it('reads outfits and the season', () => {
    expect(readGenerateResponse(200, { suggestions: [outfit], season: 'winter' })).toEqual({ kind: 'outfits', outfits: [outfit], season: 'winter', missing: null, limited: false })
    expect(readGenerateResponse(200, { suggestions: [outfit], missing: ['shoes', 'tops'] })).toMatchObject({ missing: 'tops' })
    expect(readGenerateResponse(200, { suggestions: [outfit], season: 'monsoon' })).toMatchObject({ season: null })
    expect(readGenerateResponse(200, { suggestions: [outfit], limited: true })).toMatchObject({ limited: true })
  })
  it('reads the not-enough answer with what is missing and what is there', () => {
    expect(readGenerateResponse(422, { code: 'not_enough_items', missing: ['shoes', 'nope'], have: ['tops'] }))
      .toEqual({ kind: 'not-enough', missing: ['shoes'], have: ['tops'] })
    expect(readGenerateResponse(422, { code: 'not_enough_items' })).toEqual({ kind: 'not-enough', missing: [], have: [] })
  })
  it('reads a missing colour profile', () => {
    expect(readGenerateResponse(422, { code: 'no_colour_profile' })).toEqual({ kind: 'no-profile' })
  })
  it.each([[500, { error: 'x' }], [200, {}], [200, { suggestions: [] }], [200, null], [401, {}]])('treats status %s %j as an error', (status, json) => {
    expect(readGenerateResponse(status, json)).toEqual({ kind: 'error' })
  })
})
