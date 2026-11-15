import { redirect } from 'next/navigation'

// Sign-up now lives on the single start screen.
export default function SignupPage() {
  redirect('/login')
}
