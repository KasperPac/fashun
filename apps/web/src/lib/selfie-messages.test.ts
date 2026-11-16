import { describe, it, expect, vi } from 'vitest'
import { selfieFailureMessage, PHOTO_PROBLEM_MESSAGE, SERVICE_PROBLEM_MESSAGE } from './selfie-messages'

describe('selfieFailureMessage', () => {
  it('keeps the photo wording for 422, exactly as before', () => {
    expect(selfieFailureMessage(422)).toBe(
      "We couldn't read your colours from that photo. Try again in daylight with your face filling most of the frame.",
    )
  })
  it.each([500, 502, 503, 529])('uses the service message for %i', (status) => {
    expect(selfieFailureMessage(status)).toBe(SERVICE_PROBLEM_MESSAGE)
  })
  it('uses the service message for a network failure', () => {
    expect(selfieFailureMessage(null)).toBe(SERVICE_PROBLEM_MESSAGE)
  })
  it('keeps today\'s wording for 401 and 400', () => {
    expect(selfieFailureMessage(401)).toBe(PHOTO_PROBLEM_MESSAGE)
    expect(selfieFailureMessage(400)).toBe(PHOTO_PROBLEM_MESSAGE)
  })
})

describe('selfie messages for each status', () => {
  const PHOTO = "We couldn't read your colours from that photo. Try again in daylight with your face filling most of the frame."
  const SERVICE = "We couldn't read your colours just now. That's on our side, not your photo, so try again in a few minutes."

  it('service failure shows the service message', () => {
    for (const status of [500, 502, 503, 529, null]) expect(selfieFailureMessage(status)).toBe(SERVICE)
  })
  it('save failure shows the service message', () => {
    expect(selfieFailureMessage(500)).toBe(SERVICE)
  })
  it('unreadable photo shows the photo message', () => {
    expect(selfieFailureMessage(422)).toBe(PHOTO)
  })
  it('connection lost shows the service message', async () => {
    // Mirrors the selfie page: fetch itself throws, the page's catch reports "no status" (null).
    const lost = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    let status: number | null | undefined
    try {
      const res = await lost('/api/onboarding/skin-tone', { method: 'POST' })
      status = res.status
    } catch {
      status = null
    }
    expect(lost).toHaveBeenCalledTimes(1)
    expect(status).toBeNull()
    expect(selfieFailureMessage(status)).toBe(SERVICE)
    expect(selfieFailureMessage(status)).not.toBe(PHOTO)
  })
  it('rejected upload shows the photo message (400 reply)', () => {
    expect(selfieFailureMessage(400)).toBe(PHOTO)
  })
  it('failure messages match approved wording', () => {
    expect(PHOTO_PROBLEM_MESSAGE).toBe(PHOTO)
    expect(SERVICE_PROBLEM_MESSAGE).toBe(SERVICE)
    for (const m of [PHOTO_PROBLEM_MESSAGE, SERVICE_PROBLEM_MESSAGE]) {
      expect(m).not.toMatch(/[?\uFFFD]/)
      expect(m).toContain("'")
    }
  })
})
