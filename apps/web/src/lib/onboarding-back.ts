export type OnboardingStep = 'selfie' | 'profile' | 'items'

/** Query value ProfileView adds when it opens the selfie step from "Retake selfie". */
export const FROM_PROFILE = 'profile'

const EARLIER: Record<OnboardingStep, string | null> = {
  selfie: null,
  profile: '/onboarding/selfie',
  items: '/onboarding/profile',
}

/**
 * An onboarding path that keeps `from=profile` when the user started from Profile,
 * so every later step and its Back still know the way back. `query` is any other
 * params, e.g. `manual=1`.
 */
export function onboardingHref(path: string, from: string | null, query = ''): string {
  const params = [query, from === FROM_PROFILE ? `from=${FROM_PROFILE}` : ''].filter(Boolean).join('&')
  return params ? `${path}?${params}` : path
}

/**
 * Where Back goes, or null when there is nowhere to go. Steps 2 and 3 go to the
 * step before and keep `from=profile`. Step 1 goes to Profile when the user came
 * from Profile ("Retake selfie" or Style me's selfie link), otherwise there is no Back: the start screen would show the
 * sign-in form to a signed-in user, so "Sign out" is the way out instead. Back
 * never signs anyone out.
 */
export function onboardingBackTarget(step: OnboardingStep, from: string | null): string | null {
  const earlier = EARLIER[step]
  if (earlier) return onboardingHref(earlier, from)
  return from === FROM_PROFILE ? '/profile' : null
}

/** Step 1 offers "Sign out" only when the user did not come from Profile. */
export function showOnboardingSignOut(from: string | null): boolean {
  return from !== FROM_PROFILE
}

/** The link Profile and Style me use to open step 1. Back from there always returns to Profile, not Style me. */
export const SELFIE_FROM_PROFILE_HREF = `/onboarding/selfie?from=${FROM_PROFILE}`

/** `from` values the Add piece page understands when opened from onboarding step 3. */
export const ADD_FROM_ONBOARDING = 'onboarding'
export const ADD_FROM_ONBOARDING_PROFILE = 'onboarding-profile'

/** The `from` value for an Add piece link on step 3, keeping `from=profile` when the user started from Profile. */
export function addFromOnboarding(from: string | null): typeof ADD_FROM_ONBOARDING | typeof ADD_FROM_ONBOARDING_PROFILE {
  return from === FROM_PROFILE ? ADD_FROM_ONBOARDING_PROFILE : ADD_FROM_ONBOARDING
}

/** Where Add piece's Back goes. From step 3 it returns there, still carrying `from=profile` when it was there. */
export function addPieceBackHref(addFrom: string | null): string {
  if (addFrom === ADD_FROM_ONBOARDING_PROFILE) return onboardingHref('/onboarding/items', FROM_PROFILE)
  if (addFrom === ADD_FROM_ONBOARDING) return '/onboarding/items'
  return '/wardrobe'
}

/** Where Add piece goes after saving: the same place as Back, with the toast name. */
export function addPieceSavedHref(addFrom: string | null, name: string): string {
  const back = addPieceBackHref(addFrom)
  return `${back}${back.includes('?') ? '&' : '?'}added=${encodeURIComponent(name)}`
}
