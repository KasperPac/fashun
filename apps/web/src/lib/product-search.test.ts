import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { searchProduct } from './product-search'

beforeEach(() => vi.clearAllMocks())

describe('searchProduct', () => {
  it('parses candidate products from the final text block', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Here are some options:' },
        { type: 'text', text: JSON.stringify([
          { url: 'https://theiconic.com.au/p/1', title: 'Black Nike Pegasus', imageUrl: null, retailer: 'THE ICONIC' },
        ]) },
      ],
    })
    const out = await searchProduct('black Nike running shoes', 'THE ICONIC')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://theiconic.com.au/p/1')
  })

  it('parses candidates when the JSON array is wrapped in a markdown fence', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Found these:' },
        { type: 'text', text: '```json\n[{"url":"https://theiconic.com.au/p/9","title":"Tee","imageUrl":null,"retailer":"THE ICONIC"}]\n```' },
      ],
    })
    const out = await searchProduct('white tee', 'THE ICONIC')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://theiconic.com.au/p/9')
  })

  it('returns an empty array on error or unparseable output', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    expect(await searchProduct('x', 'y')).toEqual([])
  })
})
