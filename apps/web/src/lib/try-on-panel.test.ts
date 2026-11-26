import { describe, it, expect } from 'vitest'
import { besideLine, pausedTitle, planPanel, type PanelPiece } from './try-on-panel'

const p = (label: string, category: string | null, photo = true, removed = false): PanelPiece => ({
  label, category, imageUrl: photo ? `https://x/${label}.jpg` : null, removed,
})

describe('planPanel', () => {
  it('top and bottoms need 2 images and list shoes and bags beside', () => {
    const plan = planPanel([p('Tee', 'tops'), p('Jeans', 'bottoms'), p('Trainers', 'shoes'), p('Tote', 'bags')])
    expect(plan.kind).toBe('ready')
    if (plan.kind !== 'ready') return
    expect(plan.images).toBe(2)
    expect(besideLine(plan.beside)).toBe("Shoes and bags aren't shown on you.")
  })

  it('names the piece to photograph when a drawn piece has none', () => {
    expect(planPanel([p('Tee', 'tops', false), p('Jeans', 'bottoms')])).toEqual({ kind: 'missing', title: 'Add a photo of your top to try this on' })
    expect(planPanel([p('Tee', 'tops'), p('Jeans', 'bottoms', false)])).toEqual({ kind: 'missing', title: 'Add a photo of your bottoms to try this on' })
    expect(planPanel([p('Tee', 'tops', false), p('Jeans', 'bottoms', false)])).toEqual({ kind: 'missing', title: 'Add photos of your top and bottoms to try this on' })
  })

  it('has nothing to draw with only shoes, a jacket or removed pieces', () => {
    const none = { kind: 'missing', title: 'This outfit needs a top, bottoms or a dress to try on' }
    expect(planPanel([p('Trainers', 'shoes'), p('Coat', 'outerwear')])).toEqual(none)
    expect(planPanel([p('Tee', null, false, true), p('Jeans', null, false, true)])).toEqual(none)
    expect(planPanel([])).toEqual(none)
  })

  it('draws one piece for a top alone, and a one-piece on its own', () => {
    expect(planPanel([p('Tee', 'tops')])).toMatchObject({ kind: 'ready', images: 1 })
    expect(planPanel([p('Frock', 'dresses'), p('Tee', 'tops')])).toMatchObject({ kind: 'ready', images: 1 })
    expect(planPanel([p('Frock', 'dresses', false)])).toEqual({ kind: 'missing', title: 'Add a photo of your dress to try this on' })
    expect(planPanel([p('Suit', 'jumpsuits', false)])).toEqual({ kind: 'missing', title: 'Add a photo of your jumpsuit to try this on' })
  })

  it('lists a second top beside the first', () => {
    const plan = planPanel([p('A', 'tops'), p('B', 'tops'), p('Jeans', 'bottoms')])
    expect(plan.kind === 'ready' && plan.beside.map((b) => b.piece.label)).toEqual(['B'])
  })

  it('with Gemini draws shoes and outerwear in one picture and names only the bag', () => {
    const plan = planPanel([p('Tee', 'tops'), p('Jeans', 'bottoms'), p('Trainers', 'shoes'), p('Jacket', 'outerwear'), p('Tote', 'bags')], 'gemini')
    expect(plan.kind === 'ready' && plan.images).toBe(1)
    expect(plan.kind === 'ready' && besideLine(plan.beside)).toBe("Bags aren't shown on you.")
  })

  it('with Gemini lists an add-on without a photo, a second pair of shoes and accessories', () => {
    const plan = planPanel([p('Tee', 'tops'), p('Trainers', 'shoes', false), p('Boots', 'shoes'), p('Watch', 'accessories')], 'gemini')
    expect(plan.kind === 'ready' && plan.beside.map((b) => b.piece.label).sort()).toEqual(['Boots', 'Trainers', 'Watch'])
  })

  it('with FASHN still lists shoes and outerwear beside', () => {
    const plan = planPanel([p('Tee', 'tops'), p('Jeans', 'bottoms'), p('Trainers', 'shoes'), p('Jacket', 'outerwear')], 'fashn')
    expect(plan.kind === 'ready' && plan.images).toBe(2)
    expect(plan.kind === 'ready' && besideLine(plan.beside)).toBe("Shoes and outerwear aren't shown on you.")
  })
})

describe('besideLine', () => {
  const b = (categoryLabel: string) => ({ categoryLabel, piece: p(categoryLabel, 'shoes') })
  it('names the outfit\'s own pieces in order with commas and "and"', () => {
    expect(besideLine([b('Shoes'), b('Accessories')])).toBe("Shoes and accessories aren't shown on you.")
    expect(besideLine([b('Outerwear'), b('Shoes'), b('Bags')])).toBe("Outerwear, shoes and bags aren't shown on you.")
    expect(besideLine([b('Shoes'), b('Shoes')])).toBe("Shoes aren't shown on you.")
  })
  it('says nothing when nothing is beside', () => {
    expect(besideLine([])).toBeNull()
  })
})

describe('pausedTitle', () => {
  it('names the next month in full', () => {
    expect(pausedTitle('2026-12-01')).toBe('Try-on is paused until 1 December')
    expect(pausedTitle('2027-01-01')).toBe('Try-on is paused until 1 January')
    expect(pausedTitle(null)).toBeNull()
    expect(pausedTitle('nonsense')).toBeNull()
  })
})
