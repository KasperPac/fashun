export type OnboardingStep = 'selfie' | 'profile' | 'items'

/** Query value ProfileView adds when it opens the selfie step from "Retake selfie". */
export const FROM_PROFILE = 'profile'

const EARLIER: Record<OnboardingStep, string | null> = {
  selfie: null,
  profile: '/onboarding/selfie',
  items: '/onboarding/profile',
}

/**
 * Where Back goes, or null when there is nowhere to go. Steps 2 and 3 go to the
 * step before. Step 1 goes to Profile when the user came from Profile, Style me
 * or Retake selfie, otherwise there is no Back: the start screen would show the
 * sign-in form to a signed-in user, so "Sign out" is the way out instead. Back
 * never signs anyone out.
 */
export function onboardingBackTarget(step: OnboardingStep, from: string | null): string | null {
  const earlier = EARLIER[step]
  if (earlier) return earlier
  return from === FROM_PROFILE ? '/profile' : null
}

/** Step 1 offers "Sign out" only when the user did not come from Profile. */
export function showOnboardingSignOut(from: string | null): boolean {
  return from !== FROM_PROFILE
}

/** The link that opens step 1 from Profile and Style me, so Back returns there. */
export const SELFIE_FROM_PROFILE_HREF = `/onboarding/selfie?from=${FROM_PROFILE}`
