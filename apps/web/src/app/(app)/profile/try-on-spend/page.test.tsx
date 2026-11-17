import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fake, A, B } from '@/lib/__fixtures__/try-on-fake'

vi.mock('@/lib/supabase/server', async () => {
  const { fake: f } = await import('@/lib/__fixtures__/try-on-fake')
  return { createServerClient: async () => f.userClient() }
})
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/components/tryon/TryOnSpendScreen', () => ({ default: () => null }))

import TryOnSpendPage from './page'

beforeEach(() => { fake.reset(); vi.stubEnv('TRY_ON_OWNER_USER_ID', A) })
afterEach(() => vi.unstubAllEnvs())

describe('/profile/try-on-spend', () => {
  it('spend panel is not found for anyone but the owner (the page)', async () => {
    await expect(TryOnSpendPage()).resolves.toBeTruthy()
    fake.currentUser = B
    await expect(TryOnSpendPage()).rejects.toThrow('NEXT_NOT_FOUND')
    fake.currentUser = null
    await expect(TryOnSpendPage()).rejects.toThrow('NEXT_NOT_FOUND')
    vi.stubEnv('TRY_ON_OWNER_USER_ID', '')
    fake.currentUser = A
    await expect(TryOnSpendPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
