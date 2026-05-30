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
})
