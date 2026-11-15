import { describe, it, expect } from 'vitest'
import { landingPath } from './landing'

describe('landingPath', () => {
  it('sends a user with no profile to the selfie step, even with pieces', () => {
    expect(landingPath({ hasProfile: false, pieceCount: 0, onboardingDone: false })).toBe('/onboarding/selfie')
    expect(landingPath({ hasProfile: false, pieceCount: 5, onboardingDone: true })).toBe('/onboarding/selfie')
  })

  it('sends a user with a profile and no pieces to the first-pieces step', () => {
    expect(landingPath({ hasProfile: true, pieceCount: 0, onboardingDone: false })).toBe('/onboarding/items')
  })

  it('lands on Style me with a profile and at least one piece', () => {
    expect(landingPath({ hasProfile: true, pieceCount: 1, onboardingDone: false })).toBe('/style-me')
  })

  it('lands on Style me when onboarding was finished with "Skip for now"', () => {
    expect(landingPath({ hasProfile: true, pieceCount: 0, onboardingDone: true })).toBe('/style-me')
  })
})
