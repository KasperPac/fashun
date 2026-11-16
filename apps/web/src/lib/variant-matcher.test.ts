import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// Test named in docs/test-scripts/KAS-174.md (C4)
const apiErr = (status: number, type: string) =>
  Object.assign(new Error('SECRET-TEXT user@example.com'), { status, error: { error: { type, message: 'SECRET-TEXT' } } })

describe('variant-matcher', () => {
  afterEach(() => vi.restoreAllMocks())
  it('variant-matcher: logs a reason on every failure path', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cases: Array<[() => void, string]> = [
      [() => mockCreate.mockRejectedValueOnce(apiErr(529, 'overloaded_error')), 'variant-matcher: anthropic 529 overloaded_error'],
      [() => mockCreate.mockRejectedValueOnce(new Error('SECRET-TEXT user@example.com')), 'variant-matcher: error Error'],
      [() => mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use' }] }), 'variant-matcher: no text in reply'],
    ]
    for (const [setup, line] of cases) {
      spy.mockClear()
      setup()
      await matchVariantToPhoto(variants, 'BASE64DATA')
      expect(spy.mock.calls.map((c) => c.join(' '))).toEqual([line])
    }
  })
})
