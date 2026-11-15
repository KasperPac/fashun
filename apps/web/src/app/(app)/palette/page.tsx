import { redirect } from 'next/navigation'

/** The v1 palette page is replaced by Profile. Anyone who lands here goes to Profile. */
export default function PalettePage() {
  redirect('/profile')
}
