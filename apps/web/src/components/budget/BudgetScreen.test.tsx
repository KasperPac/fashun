import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_BUDGETS, tierRanges } from '@fashun/shared'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))

import { BudgetEditor } from './BudgetScreen'
import ShoppingBudgetRow from '@/components/profile/ShoppingBudgetRow'

const noFlush = { current: () => {} }
const render = (initial: Parameters<typeof BudgetEditor>[0]['initial']) =>
  renderToStaticMarkup(<BudgetEditor initial={initial} flushRef={noFlush} />)
const fresh = { tier: null, department: 'both', budgets: DEFAULT_BUDGETS } as const

describe('Shopping budget screen', () => {
  it('budget screen shows four tiers with their example shops', () => {
    const html = render(fresh)
    const order = ['>Budget<', '>High street<', '>Mid<', '>Premium<'].map((t) => html.indexOf(t))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const line of [
      'Kmart, Target, Big W', 'Uniqlo, Cotton On, H&amp;M', 'Country Road, Myer, David Jones, THE ICONIC', 'Rodd &amp; Gunn, R.M. Williams, M.J. Bale',
      'Tops about A$5–A$40', 'Tops about A$15–A$70', 'Tops about A$40–A$150', 'Tops about A$90–A$300',
    ]) expect(html).toContain(line)
    expect(html).not.toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>\s*<span[^>]*><span[^>]*>(Budget|High street|Mid|Premium)/)
  })

  it('ticks no tier for a new user and Both for "I shop"', () => {
    const html = render(fresh)
    const tiers = html.slice(html.indexOf('id="where-you-shop"'), html.indexOf('id="i-shop"'))
    expect(tiers).not.toContain('aria-checked="true"')
    const chips = html.slice(html.indexOf('id="i-shop"'), html.indexOf('id="your-ranges"'))
    expect(chips).toMatch(/aria-checked="true"[^>]*>(<span[^>]*>✓<\/span>)Both/)
    expect(chips.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(chips).toContain("Men&#x27;s")
    expect(chips).toContain("Women&#x27;s")
  })

  it('tier rows have no side padding, so they line up with the "Where you shop" heading', () => {
    const html = render(fresh)
    const tiers = html.slice(html.indexOf('id="where-you-shop"'), html.indexOf('id="i-shop"'))
    expect(tiers.match(/px-0/g)).toHaveLength(4)
    expect(tiers).not.toContain('px-1 ')
  })

  it('saved tier shows after signing in again', () => {
    const html = render({ tier: 'mid', department: 'womens', budgets: tierRanges('mid') })
    const tiers = html.slice(html.indexOf('id="where-you-shop"'), html.indexOf('id="i-shop"'))
    expect(tiers.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(tiers).toMatch(/aria-checked="true"[\s\S]*?Mid/)
    expect(html).toContain('A$40 – A$150')
  })

  it('m1 the chosen tier has a second cue: its sub-lines are dark and semibold, the others stay grey', () => {
    const html = render({ tier: 'mid', department: 'womens', budgets: tierRanges('mid') })
    const tiers = html.slice(html.indexOf('id="where-you-shop"'), html.indexOf('id="i-shop"'))
    expect(tiers.match(/font-semibold text-ink"/g)).toHaveLength(2)
    expect(tiers.match(/font-normal text-ink-2"/g)).toHaveLength(6)
  })

  it('shows a moved slider value and only Tops, Bottoms and Shoes', () => {
    const html = render({ tier: 'budget', department: 'both', budgets: { ...tierRanges('budget'), shoes: [15, 120] } })
    expect(html).toContain('A$15 – A$120')
    expect(html).toContain('aria-label="Lowest price for shoes"')
    expect(html).toContain('aria-label="Highest price for tops"')
    expect(html).not.toContain('outerwear')
  })
})

describe('Profile Shopping row', () => {
  it('profile shows a Shopping section with a Shopping budget row reading Not set', () => {
    const html = renderToStaticMarkup(<ShoppingBudgetRow tier={null} department="both" />)
    expect(html).toContain('>Shopping<')
    expect(html).toContain('>Shopping budget<')
    expect(html).toContain('>Not set<')
    expect(html).toContain('href="/profile/budget"')
  })
  it('reads "<Tier> · <Department>" once set', () => {
    const html = renderToStaticMarkup(<ShoppingBudgetRow tier="mid" department="womens" />)
    expect(html).toContain('Mid · Women&#x27;s')
  })
})
