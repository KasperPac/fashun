export interface LandingState {
  hasProfile: boolean
  pieceCount: number
  onboardingDone: boolean
}

/** Where a signed-in user should land: Style me, or the next unfinished onboarding step. */
export function landingPath({ hasProfile, pieceCount, onboardingDone }: LandingState): string {
  if (!hasProfile) return '/onboarding/selfie'
  if (pieceCount >= 1 || onboardingDone) return '/style-me'
  return '/onboarding/items'
}
