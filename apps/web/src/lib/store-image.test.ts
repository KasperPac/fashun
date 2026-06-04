import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadImageFromUrl } from './store-image'

const upload = vi.fn().mockResolvedValue({ error: null })
const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://supa.co/wardrobe/u1/x.jpg' } })
const supabase = { storage: { from: () => ({ upload, getPublicUrl }) } } as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('uploadImageFromUrl', () => {
  it('uploads the fetched image and returns the public URL', async () => {
    const url = await uploadImageFromUrl(supabase, 'https://cdn.shop.com/shirt.jpg', 'u1')
    expect(upload).toHaveBeenCalled()
    expect(url).toBe('https://supa.co/wardrobe/u1/x.jpg')
  })

  it('throws when the image fetch fails', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(uploadImageFromUrl(supabase, 'https://cdn.shop.com/missing.jpg', 'u1')).rejects.toThrow()
  })

  it('throws when storage upload errors', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'nope' } })
    await expect(uploadImageFromUrl(supabase, 'https://cdn.shop.com/shirt.jpg', 'u1')).rejects.toThrow()
  })
})
