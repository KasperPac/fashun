import { describe, it, expect } from 'vitest'
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
