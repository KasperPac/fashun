import { redirect } from 'next/navigation'

// Default onboarding entry: go straight to first step
export default function OnboardingPage() {
  redirect('/onboarding/skin-tone')
}
