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

  it('uses a generic retailer clause and still returns candidates when store is empty', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify([
          { url: 'https://shop.com/p/1', title: 'Timberland 6-inch boots', imageUrl: 'https://shop.com/i.jpg', retailer: 'Timberland' },
        ]) },
      ],
    })
    const out = await searchProduct('Timberland 6-inch premium boots', '')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://shop.com/p/1')
    const sent = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(sent).toContain('from any major Australian retailer')
    expect(sent).not.toContain('retailer ""')
    expect(out[0].retailer).toBe('Timberland')
  })

  it('falls back to null retailer (not empty string) when store is empty and the model omits it', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { url: 'https://shop.com/p/2', title: 'Boots', imageUrl: null },
      ]) }],
    })
    const out = await searchProduct('boots', '')
    expect(out[0].retailer).toBeNull()
  })

  it('uses the named retailer clause when a store is given', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '[]' }] })
    await searchProduct('white tee', 'THE ICONIC')
    const sent = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(sent).toContain('at the Australian retailer "THE ICONIC"')
  })
})
