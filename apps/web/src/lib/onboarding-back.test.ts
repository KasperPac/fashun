import { describe, it, expect } from 'vitest'
import { onboardingBackTarget } from './onboarding-back'

describe('onboardingBackTarget', () => {
  it('step 1 returns to Profile when opened from Retake selfie', () => {
    expect(onboardingBackTarget('selfie', 'profile')).toBe('/profile')
  })
  it('step 1 returns to the start screen otherwise', () => {
    expect(onboardingBackTarget('selfie', null)).toBe('/login')
    expect(onboardingBackTarget('selfie', '')).toBe('/login')
    expect(onboardingBackTarget('selfie', 'elsewhere')).toBe('/login')
  })
  it('later steps go to the step before', () => {
    expect(onboardingBackTarget('profile', 'profile')).toBe('/onboarding/selfie')
    expect(onboardingBackTarget('items', null)).toBe('/onboarding/profile')
  })
})
