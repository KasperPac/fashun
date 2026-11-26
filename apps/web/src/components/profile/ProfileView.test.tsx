import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
import { TraitRow } from './ProfileView'
import ShoppingBudgetRow from './ShoppingBudgetRow'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('Profile control names', () => {
  it('About you row names contain their visible text', () => {
    for (const value of ['Light', 'Not sure. Tap to set it.']) {
      const html = renderToStaticMarkup(<ul><TraitRow label="Skin tone" value={value} onClick={() => {}} /></ul>)
      // No aria-label: the button is named by its visible text, so the name always contains it.
      expect(html).not.toMatch(/aria-label=/)
      expect(text(html)).toContain('Skin tone')
      expect(text(html)).toContain(value)
    }
  })

  it('the Shopping budget row is named by its visible text', () => {
    for (const tier of [null, 'mid'] as const) {
      const html = renderToStaticMarkup(<ShoppingBudgetRow tier={tier} department="womens" />)
      expect(html).not.toMatch(/aria-label=/)
      expect(text(html)).toContain('Shopping budget')
    }
  })
})
