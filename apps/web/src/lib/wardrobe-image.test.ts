import { describe, it, expect, vi } from 'vitest'
import { toObjectPath, signWardrobeImage, isExternalUrl } from './wardrobe-image'

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

describe('isExternalUrl', () => {
  it('is true for an http(s) URL not pointing at our bucket', () => {
    expect(isExternalUrl('https://images.unsplash.com/photo-x?w=400')).toBe(true)
    expect(isExternalUrl('http://cdn.shop.com/a.jpg')).toBe(true)
  })
  it('is false for a bucket public/signed URL', () => {
    expect(isExternalUrl('https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/a.png')).toBe(false)
    expect(isExternalUrl('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/u1/a.png?token=z')).toBe(false)
  })
  it('is false for a bare object path', () => {
    expect(isExternalUrl('u1/a.png')).toBe(false)
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

  it('passes external URLs through unchanged without signing', async () => {
    const { client, createSignedUrl } = fakeClient({ data: { signedUrl: 'x' }, error: null })
    const url = await signWardrobeImage(client, 'https://images.unsplash.com/photo-x?w=400', 3600)
    expect(url).toBe('https://images.unsplash.com/photo-x?w=400')
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
})
