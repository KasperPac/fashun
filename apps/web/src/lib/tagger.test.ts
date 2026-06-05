import { describe, it, expect, vi } from 'vitest'

// vi.hoisted ensures this is available when vi.mock factory runs (hoisting order)
const mockCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    content: [{
      type: 'text',
      text: JSON.stringify({
        category: 'tops',
        colours: ['#1a1a6e', '#ffffff'],
        styleTags: ['casual', 'smart-casual'],
        suggestedName: 'Navy Linen Shirt',
        searchQuery: 'Uniqlo navy linen shirt',
      }),
    }],
  })
)

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { tagImage } from './tagger'

describe('tagImage', () => {
  it('returns structured tags from Claude', async () => {
    const result = await tagImage('base64imagedata')
    expect(result.category).toBe('tops')
    expect(result.colours).toContain('#1a1a6e')
    expect(result.styleTags).toContain('casual')
    expect(result.suggestedName).toBe('Navy Linen Shirt')
    expect(result.searchQuery).toBe('Uniqlo navy linen shirt')
  })

  it('returns an empty searchQuery when absent or malformed', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ category: 'tops', colours: [], styleTags: [], suggestedName: 'Item' }) }],
    })
    const result = await tagImage('base64imagedata')
    expect(result.searchQuery).toBe('')

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ category: 'tops', colours: [], styleTags: [], suggestedName: 'Item', searchQuery: 42 }) }],
    })
    const malformed = await tagImage('base64imagedata')
    expect(malformed.searchQuery).toBe('')
  })

  it('returns fallback when Claude response is malformed', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })
    const result = await tagImage('base64imagedata')
    expect(result.category).toBe('tops')   // fallback default
    expect(result.colours).toEqual([])
    expect(result.styleTags).toEqual([])
  })

  it('sends image/jpeg media_type for a JPEG base64 (phone photos)', async () => {
    await tagImage('/9j/4AAQSkZJRgABAQ')
    const src = mockCreate.mock.calls.at(-1)[0].messages[0].content[0].source
    expect(src.media_type).toBe('image/jpeg')
  })

  it('sends image/png media_type for a PNG base64', async () => {
    await tagImage('iVBORw0KGgoAAAANS')
    const src = mockCreate.mock.calls.at(-1)[0].messages[0].content[0].source
    expect(src.media_type).toBe('image/png')
  })

  it('parses tags when the model wraps the JSON in a markdown fence', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n{"category":"shoes","colours":["#000000"],"styleTags":["casual"],"suggestedName":"Black Sneakers","searchQuery":"nike air force 1"}\n```' }],
    })
    const result = await tagImage('/9j/abc')
    expect(result.suggestedName).toBe('Black Sneakers')
    expect(result.category).toBe('shoes')
    expect(result.searchQuery).toBe('nike air force 1')
  })
})
