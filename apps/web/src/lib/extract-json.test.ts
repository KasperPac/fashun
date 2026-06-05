import { describe, it, expect } from 'vitest'
import { extractJson } from './extract-json'

describe('extractJson', () => {
  it('parses a clean JSON array', () => {
    expect(extractJson('[{"a":1}]', 'array')).toEqual([{ a: 1 }])
  })

  it('parses a fenced JSON array', () => {
    expect(extractJson('```json\n[{"a":1}]\n```', 'array')).toEqual([{ a: 1 }])
  })

  it('parses an array when the model prepends prose then a fenced block (haiku web_search shape)', () => {
    const text = 'Based on my search results, here are 3 product pages:\n\n```json\n[{"url":"https://x.com/p","title":"T"}]\n```'
    expect(extractJson(text, 'array')).toEqual([{ url: 'https://x.com/p', title: 'T' }])
  })

  it('parses an array when the model prepends prose then a bare array (sonnet web_search shape)', () => {
    const text = 'Based on the search results, here is the JSON array: [{"url":"https://x.com/p","title":"T"}]'
    expect(extractJson(text, 'array')).toEqual([{ url: 'https://x.com/p', title: 'T' }])
  })

  it('parses a JSON object wrapped in prose + fence', () => {
    const text = 'Here is the product:\n```json\n{"name":"Shoe","category":"shoes"}\n```'
    expect(extractJson(text, 'object')).toEqual({ name: 'Shoe', category: 'shoes' })
  })

  it('returns null when no JSON of the requested kind is present', () => {
    expect(extractJson('sorry, I could not find anything', 'array')).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(extractJson('[{"a": }]', 'array')).toBeNull()
  })

  it('returns null on empty input', () => {
    expect(extractJson('', 'array')).toBeNull()
  })
})
