import { describe, it, expect } from 'vitest'
import { onboardingBackTarget, onboardingHref, showOnboardingSignOut, SELFIE_FROM_PROFILE_HREF } from './onboarding-back'

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
    expect(onboardingBackTarget('profile', null)).toBe('/onboarding/selfie')
    expect(onboardingBackTarget('items', null)).toBe('/onboarding/profile')
  })
  it('later steps keep from=profile on Back', () => {
    expect(onboardingBackTarget('profile', 'profile')).toBe('/onboarding/selfie?from=profile')
    expect(onboardingBackTarget('items', 'profile')).toBe('/onboarding/profile?from=profile')
  })
  it('Profile -> step 1 -> step 2 -> Back shows step 1 with Back to Profile and no Sign out', () => {
    const step2 = onboardingHref('/onboarding/profile', 'profile')
    expect(step2).toBe('/onboarding/profile?from=profile')
    const back = onboardingBackTarget('profile', new URL(step2, 'http://x').searchParams.get('from'))!
    const from = new URL(back, 'http://x').searchParams.get('from')
    expect(back).toBe('/onboarding/selfie?from=profile')
    expect(onboardingBackTarget('selfie', from)).toBe('/profile')
    expect(showOnboardingSignOut(from)).toBe(false)
  })
  it('ignores an unknown from value', () => {
    expect(onboardingBackTarget('profile', 'elsewhere')).toBe('/onboarding/selfie')
  })
})

describe('onboardingHref', () => {
  it('adds from=profile only for Profile', () => {
    expect(onboardingHref('/onboarding/items', 'profile')).toBe('/onboarding/items?from=profile')
    expect(onboardingHref('/onboarding/items', null)).toBe('/onboarding/items')
    expect(onboardingHref('/onboarding/items', '')).toBe('/onboarding/items')
    expect(onboardingHref('/onboarding/items', 'elsewhere')).toBe('/onboarding/items')
  })
  it('keeps other params', () => {
    expect(onboardingHref('/onboarding/profile', 'profile', 'manual=1')).toBe('/onboarding/profile?manual=1&from=profile')
    expect(onboardingHref('/onboarding/profile', null, 'manual=1')).toBe('/onboarding/profile?manual=1')
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
