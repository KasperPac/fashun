import { describe, it, expect } from 'vitest'
import { mediaTypeFromBase64 } from './image-media-type'

describe('mediaTypeFromBase64', () => {
  it('detects JPEG from the base64 header', () => {
    expect(mediaTypeFromBase64('/9j/4AAQSkZJRg')).toBe('image/jpeg')
  })
  it('detects PNG from the base64 header', () => {
    expect(mediaTypeFromBase64('iVBORw0KGgoAAAANS')).toBe('image/png')
  })
  it('detects WebP from the base64 header', () => {
    expect(mediaTypeFromBase64('UklGRiQAAABXRUJQ')).toBe('image/webp')
  })
  it('detects GIF from the base64 header', () => {
    expect(mediaTypeFromBase64('R0lGODlhAQABAAAAACw')).toBe('image/gif')
  })
  it('defaults to JPEG for an unrecognised header', () => {
    expect(mediaTypeFromBase64('base64imagedata')).toBe('image/jpeg')
  })
})
