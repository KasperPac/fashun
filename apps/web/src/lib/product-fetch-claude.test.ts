import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mockCreate } } }))

import { extractProductViaClaude } from './product-fetch-claude'

const productJson = {
  name: 'Rust Linen Shirt',
  category: 'tops',
  retailer: 'Kmart',
  imageUrl: 'https://cdn.kmart.com/shirt.jpg',
  price: 25,
  styleTags: ['smart-casual'],
  colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Olive', hex: '#556B2F' }],
  colours: ['#B7410E'],
}

beforeEach(() => vi.clearAllMocks())

describe('extractProductViaClaude', () => {
  it('parses a product from the final text block (after tool-use blocks)', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'server_tool_use', id: 't1', name: 'web_fetch', input: { url: 'https://kmart.com/p/1' } },
        { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_result', url: 'https://kmart.com/p/1' } },
        { type: 'text', text: JSON.stringify(productJson) },
      ],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out).not.toBeNull()
    expect(out!.name).toBe('Rust Linen Shirt')
    expect(out!.category).toBe('tops')
    expect(out!.colourVariants).toHaveLength(2)
    expect(out!.colours).toEqual(['#B7410E'])
    expect(out!.styleTags).toEqual(['smart-casual'])
  })

  it('parses a product when the model prepends prose before the JSON (post-tool narration)', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'server_tool_use', id: 't1', name: 'web_fetch', input: { url: 'https://kmart.com/p/1' } },
        { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_result', url: 'https://kmart.com/p/1' } },
        { type: 'text', text: 'Based on the fetched page, here is the product:\n\n```json\n' + JSON.stringify(productJson) + '\n```' },
      ],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out).not.toBeNull()
    expect(out!.name).toBe('Rust Linen Shirt')
    expect(out!.colourVariants).toHaveLength(2)
  })

  it('parses JSON wrapped in a markdown fence', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '```json\n' + JSON.stringify(productJson) + '\n```' },
      ],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out).not.toBeNull()
    expect(out!.name).toBe('Rust Linen Shirt')
  })

  it('coerces an unknown category to tops and drops invalid hex variants', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        ...productJson,
        category: 'gadgets',
        colourVariants: [{ label: 'Rust', hex: '#B7410E' }, { label: 'Bad', hex: 'red' }],
        colours: ['#B7410E', 'notahex'],
      }) }],
    })
    const out = await extractProductViaClaude('https://kmart.com/p/1')
    expect(out!.category).toBe('tops')
    expect(out!.colourVariants).toHaveLength(1)
    expect(out!.colours).toEqual(['#B7410E'])
  })

  it('returns null when web_fetch returns an error block', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'server_tool_use', id: 't1', name: 'web_fetch', input: { url: 'https://kmart.com/p/1' } },
        { type: 'web_fetch_tool_result', tool_use_id: 't1', content: { type: 'web_fetch_tool_error', error_code: 'url_not_accessible' } },
        { type: 'text', text: 'I could not access that page.' },
      ],
    })
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })

  it('returns null when there is no text block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'server_tool_use', id: 't1', name: 'web_fetch', input: {} }] })
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })

  it('returns null on unparseable text', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry, no JSON here' }] })
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })

  it('returns null when the SDK call throws', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    expect(await extractProductViaClaude('https://kmart.com/p/1')).toBeNull()
  })
})
