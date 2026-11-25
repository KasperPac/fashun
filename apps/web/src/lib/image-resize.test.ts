import { describe, it, expect, vi, afterEach } from 'vitest'
import { photoToJpegBase64, WARDROBE_PHOTO_MAX_EDGE } from './image-resize'

function stubBrowser(width: number, height: number) {
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toDataURL: () => 'data:image/jpeg;base64,QUJD' }
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => {} }))
  vi.stubGlobal('document', { createElement: () => canvas })
  return canvas
}

afterEach(() => vi.unstubAllGlobals())

describe('photoToJpegBase64', () => {
  it('new garment photos are kept at up to about 2048px', async () => {
    expect(WARDROBE_PHOTO_MAX_EDGE).toBe(2048)
    const canvas = stubBrowser(4000, 3000)
    expect(await photoToJpegBase64(new File(['x'], 'a.jpg'), WARDROBE_PHOTO_MAX_EDGE)).toBe('QUJD')
    expect([canvas.width, canvas.height]).toEqual([2048, 1536]) // longest side 2048, proportions kept
    const small = stubBrowser(800, 600)
    await photoToJpegBase64(new File(['x'], 'a.jpg'), WARDROBE_PHOTO_MAX_EDGE)
    expect([small.width, small.height]).toEqual([800, 600]) // never enlarged
  })

  it('other callers still get 1024px', async () => {
    const canvas = stubBrowser(4000, 3000)
    await photoToJpegBase64(new File(['x'], 'a.jpg'))
    expect([canvas.width, canvas.height]).toEqual([1024, 768])
  })
})
