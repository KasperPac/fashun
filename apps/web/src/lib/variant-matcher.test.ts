import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { matchVariantToPhoto } from './variant-matcher'

const variants = [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }]

beforeEach(() => vi.clearAllMocks())

describe('matchVariantToPhoto', () => {
  it('returns the variant whose label Claude selects', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"label":"Olive"}' }] })
    const match = await matchVariantToPhoto(variants, 'BASE64DATA')
    expect(match?.label).toBe('Olive')
  })

  it('returns null when the label does not match any variant', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"label":"Pink"}' }] })
    expect(await matchVariantToPhoto(variants, 'BASE64DATA')).toBeNull()
  })

  it('returns null on Claude error', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    expect(await matchVariantToPhoto(variants, 'BASE64DATA')).toBeNull()
  })
})
