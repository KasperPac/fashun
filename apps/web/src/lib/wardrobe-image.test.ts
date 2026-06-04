import { describe, it, expect, vi } from 'vitest'
import { toObjectPath, signWardrobeImage } from './wardrobe-image'

describe('toObjectPath', () => {
  it('extracts the path from a public URL', () => {
    expect(toObjectPath('https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/abc.png'))
      .toBe('u1/abc.png')
  })
  it('extracts the path from a signed URL and strips the query string', () => {
    expect(toObjectPath('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/u1/abc.png?token=zzz'))
      .toBe('u1/abc.png')
  })
  it('returns a bare path unchanged', () => {
    expect(toObjectPath('u1/abc.png')).toBe('u1/abc.png')
  })
  it('returns a value without the bucket marker unchanged (minus query)', () => {
    expect(toObjectPath('weird-value?x=1')).toBe('weird-value')
  })
})

describe('signWardrobeImage', () => {
  function fakeClient(result: unknown) {
    const createSignedUrl = vi.fn().mockResolvedValue(result)
    return { client: { storage: { from: () => ({ createSignedUrl }) } } as never, createSignedUrl }
  }

  it('signs the normalized path and returns the signed URL', async () => {
    const { client, createSignedUrl } = fakeClient({ data: { signedUrl: 'https://signed/url' }, error: null })
    const url = await signWardrobeImage(
      client,
      'https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/abc.png',
      3600,
    )
    expect(createSignedUrl).toHaveBeenCalledWith('u1/abc.png', 3600)
    expect(url).toBe('https://signed/url')
  })

  it('returns null on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'nope' } })
    expect(await signWardrobeImage(client, 'u1/abc.png', 3600)).toBeNull()
  })
})
