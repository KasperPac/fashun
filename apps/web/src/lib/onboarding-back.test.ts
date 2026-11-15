import { describe, it, expect } from 'vitest'
import { onboardingBackTarget, showOnboardingSignOut, SELFIE_FROM_PROFILE_HREF } from './onboarding-back'

describe('onboardingBackTarget', () => {
  it('step 1 returns to Profile when opened from Retake selfie', () => {
    expect(onboardingBackTarget('selfie', 'profile')).toBe('/profile')
  })
  it('step 1 has no Back otherwise, so a signed-in user never lands on the sign-in form', () => {
    expect(onboardingBackTarget('selfie', null)).toBeNull()
    expect(onboardingBackTarget('selfie', '')).toBeNull()
    expect(onboardingBackTarget('selfie', 'elsewhere')).toBeNull()
  })
  it('no step ever goes to /login', () => {
    for (const step of ['selfie', 'profile', 'items'] as const) {
      for (const from of [null, '', 'profile', 'elsewhere']) {
        expect(onboardingBackTarget(step, from)).not.toBe('/login')
      }
    }
  })
  it('later steps go to the step before', () => {
    expect(onboardingBackTarget('profile', 'profile')).toBe('/onboarding/selfie')
    expect(onboardingBackTarget('items', null)).toBe('/onboarding/profile')
  })
})

describe('showOnboardingSignOut', () => {
  it('shows Sign out unless the user came from Profile', () => {
    expect(showOnboardingSignOut(null)).toBe(true)
    expect(showOnboardingSignOut('')).toBe(true)
    expect(showOnboardingSignOut('elsewhere')).toBe(true)
    expect(showOnboardingSignOut('profile')).toBe(false)
  })
})

describe('SELFIE_FROM_PROFILE_HREF', () => {
  it('opens step 1 with Back returning to Profile', () => {
    expect(SELFIE_FROM_PROFILE_HREF).toBe('/onboarding/selfie?from=profile')
    const from = new URL(SELFIE_FROM_PROFILE_HREF, 'http://x').searchParams.get('from')
    expect(onboardingBackTarget('selfie', from)).toBe('/profile')
  })
})
