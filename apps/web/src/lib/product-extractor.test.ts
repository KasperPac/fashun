import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } },
}))

import { extractProduct } from './product-extractor'
import type { ScrapedPage } from './product-scraper'

const page: ScrapedPage = {
  url: 'https://shop.com/p/1',
  title: 'Rust Linen Shirt',
  imageUrl: 'https://cdn.shop.com/shirt.jpg',
  price: 89.95,
  retailer: 'THE ICONIC',
  jsonLd: { '@type': 'Product', color: 'Rust' },
  textSnippet: 'A breathable warm-weather shirt available in rust and olive.',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      name: 'Rust Linen Shirt',
      category: 'tops',
      styleTags: ['smart-casual'],
      colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }],
      colours: ['#B7410E'],
    }) }],
  })
})

describe('extractProduct', () => {
  it('returns normalised product fields and passes through page image/price/retailer', async () => {
    const p = await extractProduct(page)
    expect(p.name).toBe('Rust Linen Shirt')
    expect(p.category).toBe('tops')
    expect(p.colourVariants).toHaveLength(2)
    expect(p.imageUrl).toBe('https://cdn.shop.com/shirt.jpg')
    expect(p.price).toBe(89.95)
    expect(p.retailer).toBe('THE ICONIC')
  })

  it('falls back to page title and empty variants when Claude output is unparseable', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json {{' }] })
    const p = await extractProduct(page)
    expect(p.name).toBe('Rust Linen Shirt')
    expect(p.category).toBe('tops')
    expect(p.colourVariants).toEqual([])
  })

  it('parses the object when the model prepends prose before the JSON', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text:
      'Here is the normalised product:\n```json\n{"name":"Olive Linen Shirt","category":"tops","styleTags":[],"colourVariants":[],"colours":["#556B2F"]}\n```' }] })
    const p = await extractProduct(page)
    expect(p.name).toBe('Olive Linen Shirt')
    expect(p.colours).toEqual(['#556B2F'])
  })
})
