import { redirect } from 'next/navigation'

/** Shop is hidden in outcome 1 (design spec A0). Anyone who lands here goes to Style me. */
export default function ShopPage() {
  redirect('/style-me')
}
