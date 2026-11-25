import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient() }
})

import { DELETE, GET } from './route'

const ITEM = '10000000-0000-4000-8000-000000000001'
const OTHER = '10000000-0000-4000-8000-0000000000b1'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const del = (id: string) => DELETE(new Request('http://localhost/api/wardrobe', { method: 'DELETE', body: JSON.stringify({ id }) }))

beforeEach(() => {
  fake.reset()
  fake.tables.wardrobe_items.push(
    { id: ITEM, user_id: A, name: 'Tee', category: 'tops', ownership: 'owned', image_url: '', worn_photo_path: `${A}/worn-${ITEM}-x.jpg` },
    { id: OTHER, user_id: B, name: 'Jeans', category: 'bottoms', ownership: 'owned', image_url: '', worn_photo_path: `${B}/worn-${OTHER}-y.jpg` },
  )
  fake.buckets['try-on-photos'].set(`${A}/worn-${ITEM}-x.jpg`, JPEG)
  fake.buckets['try-on-photos'].set(`${B}/worn-${OTHER}-y.jpg`, JPEG)
})

describe('/api/wardrobe worn photos', () => {
  it('deleting an item removes its worn photo file', async () => {
    expect((await del(ITEM)).status).toBe(200)
    expect(fake.buckets['try-on-photos'].has(`${A}/worn-${ITEM}-x.jpg`)).toBe(false)
    expect(fake.tables.wardrobe_items.map((i) => i.id)).toEqual([OTHER])
  })

  it("deleting someone else's item leaves their worn photo alone", async () => {
    expect((await del(OTHER)).status).toBe(404)
    expect(fake.buckets['try-on-photos'].has(`${B}/worn-${OTHER}-y.jpg`)).toBe(true)
    expect(fake.tables.wardrobe_items).toHaveLength(2)
  })

  it('tells the browser whether an item has a worn photo, never the path', async () => {
    const { items } = await (await GET(new Request('http://localhost/api/wardrobe?ownership=owned'))).json()
    expect(items).toHaveLength(1)
    expect(items[0].hasWornPhoto).toBe(true)
    expect(JSON.stringify(items)).not.toContain('worn-')
  })
})
