export type OnboardingStep = 'selfie' | 'profile' | 'items'

/** Query value ProfileView adds when it opens the selfie step from "Retake selfie". */
export const FROM_PROFILE = 'profile'

const EARLIER: Record<OnboardingStep, string | null> = {
  selfie: null,
  profile: '/onboarding/selfie',
  items: '/onboarding/profile',
}

/**
 * Where Back goes. Steps 2 and 3 go to the step before. Step 1 goes to Profile
 * when the user came from Retake selfie, otherwise to the start screen. Back
 * never signs anyone out.
 */
export function onboardingBackTarget(step: OnboardingStep, from: string | null): string {
  const earlier = EARLIER[step]
  if (earlier) return earlier
  return from === FROM_PROFILE ? '/profile' : '/login'
}
