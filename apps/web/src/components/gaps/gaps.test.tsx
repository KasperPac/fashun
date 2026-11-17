import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OccasionTag } from '@fashun/shared'
import type { GapSuggestion } from '@/lib/gap-search'
import type { GapItem } from '@/lib/wardrobe-gaps'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import FillTheGapsCard from './FillTheGapsCard'
import { SheetBody, type SheetState } from './GapSuggestionsSheet'
import { gapRows, type GapStatus } from '@/lib/gap-card'

const item = (category: string, tag: OccasionTag, ownership = 'owned'): GapItem =>
  ({ category, occasionTags: [tag], ownership } as unknown as GapItem)
const two = (category: string, tag: OccasionTag) => [item(category, tag), item(category, tag)]

const READY: GapStatus = {
  status: 'ready', tier: 'budget', department: 'womens',
  ranges: { tops: [5, 40], bottoms: [10, 50], shoes: [15, 60] },
}
const card = (items: GapItem[], occasion: OccasionTag, status: GapStatus | null, online = true) =>
  renderToStaticMarkup(
    <FillTheGapsCard rows={gapRows(items, occasion, 'womens')} status={status} online={online} occasion={occasion} seasonName="Winter" onOpen={() => {}} />,
  )

const WORK_NO_SHOES = [...two('tops', 'work'), ...two('bottoms', 'work')]

describe('Fill the gaps card', () => {
  it('UI-8 shows "Work shoes" with "None yet" when no Work shoes are owned', () => {
    const html = card(WORK_NO_SHOES, 'work', READY)
    expect(html).toContain('>Fill the gaps<')
    expect(html).toContain('>Work shoes<')
    expect(html).toContain('None yet')
    expect(html).toContain('aria-label="Find Work shoes, none yet"')
  })

  it('UI-9 one Casual top gives "Another Casual top" / "You have 1"; two of each gives no card', () => {
    const html = card([item('tops', 'casual'), ...two('bottoms', 'casual'), ...two('shoes', 'casual')], 'casual', READY)
    expect(html).toContain('>Another Casual top<')
    expect(html).toContain('You have 1')
    expect(html).toContain('aria-label="Find another Casual top, you have 1"')
    expect(card([...two('tops', 'casual'), ...two('bottoms', 'casual'), ...two('shoes', 'casual')], 'casual', READY)).toBe('')
  })

  it('UI-10 a wishlist item does not stop a gap showing', () => {
    const html = card([...WORK_NO_SHOES, item('shoes', 'work', 'wishlist')], 'work', READY)
    expect(html).toContain('>Work shoes<')
    expect(html).toContain('None yet')
  })

  it('no tier shows Pick a budget and makes no search', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const html = card(WORK_NO_SHOES, 'work', { status: 'no_tier' })
    expect(html).toContain('Pick a budget to get suggestions.')
    expect(html).toContain('href="/profile/budget?from=style-me&amp;occasion=work"')
    expect(html).toContain('>Pick a budget<')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('aria-label="Find')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('UI-12 the source line names the tier\'s shops and the season', () => {
    expect(card(WORK_NO_SHOES, 'work', READY)).toContain('From Kmart, Target and Big W, within your budget, in your Winter colours.')
    expect(card(WORK_NO_SHOES, 'work', { ...READY, tier: 'mid' } as GapStatus))
      .toContain('From Country Road, Myer, David Jones and THE ICONIC, within your budget')
  })

  it('UI-18 switch off or service down: the line shows and the gaps are not tappable', () => {
    const html = card(WORK_NO_SHOES, 'work', { status: 'unavailable' })
    expect(html).toContain("Suggestions aren&#x27;t available right now.")
    expect(html).not.toContain('<button')
    expect(html).toContain('None yet')
  })

  it('UI-19 at the monthly limit the card says paused until the 1st and the gaps are not tappable', () => {
    const html = card(WORK_NO_SHOES, 'work', { status: 'paused', resume_on: '2026-12-01' })
    expect(html).toContain('Suggestions are paused until 1 December.')
    expect(card(WORK_NO_SHOES, 'work', { status: 'paused', resume_on: '2027-01-01' })).toContain('until 1 January.')
    expect(html).not.toContain('<button')
  })

  it('UI-21 offline disables the rows and says so', () => {
    const html = card(WORK_NO_SHOES, 'work', READY, false)
    expect(html).toContain("You&#x27;re offline. Connect to the internet to see suggestions.")
    expect(html).not.toContain('<button')
  })

  it('rows are enabled buttons when ready, and disabled while the status loads', () => {
    expect(card(WORK_NO_SHOES, 'work', READY)).not.toContain('disabled=""')
    expect(card(WORK_NO_SHOES, 'work', null)).toContain('disabled=""')
  })

  it('UI-24 long gap labels are plain text that can wrap', () => {
    const rows = gapRows([...two('tops', 'smart-casual'), item('bottoms', 'smart-casual'), item('shoes', 'smart-casual')], 'smart-casual', 'womens')
    expect(rows.map((r) => r.label)).toEqual(['More Smart casual trousers or skirts', 'Another pair of Smart casual shoes'])
    expect(card([...two('tops', 'smart-casual'), item('bottoms', 'smart-casual'), item('shoes', 'smart-casual')], 'smart-casual', READY)).toContain('min-w-0')
  })

  it('bottoms and formal wording follows the spec', () => {
    expect(gapRows([], 'formal', 'mens').map((r) => r.label)).toEqual(['Formal shirts or tops', 'Formal trousers', 'Formal shoes'])
    expect(gapRows([item('tops', 'formal'), item('bottoms', 'formal'), item('shoes', 'formal')], 'formal', 'both').map((r) => r.label))
      .toEqual(['Another formal shirt or top', 'More Formal trousers or skirts', 'Another pair of Formal shoes'])
  })
})

const row = gapRows(WORK_NO_SHOES, 'work', 'womens')[0]
const sug = (n: number, over: Partial<GapSuggestion> = {}): GapSuggestion => ({
  title: `Loafers ${n}`, shop: 'Kmart', price: 35, imageUrl: `https://img.example/${n}.jpg`, link: 'https://kmart.com.au/p', productId: `${n}`,
  colour: '#000080', colourName: 'Navy', reason: 'Navy, one of your Winter colours.', ...over,
})
const sheet = (state: SheetState) =>
  renderToStaticMarkup(
    <SheetBody state={state} row={row} occasion="work" tier="budget" range={[15, 60]} season="winter" onClose={() => {}} onRetry={() => {}} />,
  )

describe('Suggestions sheet', () => {
  it('UI-13 loading shows the looking line, skeletons and, after 8 seconds, the still looking line', () => {
    const html = sheet({ name: 'loading', slow: false })
    expect(html).toContain('Looking for Work shoes at Kmart, Target and Big W…')
    expect(html).toContain('From Kmart, Target and Big W, within A$15–A$60, in your Winter colours.')
    expect(html).not.toContain('Still looking')
    expect(sheet({ name: 'loading', slow: true })).toContain('Still looking. This can take up to 15 seconds.')
  })

  it('UI-14 each item shows photo through the app, shop, name, price and reason', () => {
    const html = sheet({ name: 'items', items: [sug(1, { price: 49.95 }), sug(2, { imageUrl: null }), sug(3)] })
    expect(html).toContain('src="/api/gaps/photo?occasion=work&amp;category=shoes&amp;u=https%3A%2F%2Fimg.example%2F1.jpg"')
    expect(html).not.toContain('src="https://')
    expect(html).toContain('>Kmart<')
    expect(html).toContain('Loafers 1')
    expect(html).toContain('A$49.95')
    expect(html).toContain('>A$35<')
    expect(html).toContain('35 Australian dollars')
    expect(html).toContain('Navy, one of your Winter colours.')
    expect(html).toContain('>shoes<') // no photo: the category label
    expect(html).toContain('line-clamp-2')
  })

  it('a gap shows at most 6 items in the sheet', () => {
    const html = sheet({ name: 'items', items: Array.from({ length: 9 }, (_, i) => sug(i)) })
    expect(html.match(/>Kmart</g)).toHaveLength(6)
  })

  it('UI-15 fewer than 6 shows the everything-found line; the prices note always shows', () => {
    const few = sheet({ name: 'items', items: [sug(1), sug(2)] })
    expect(few).toContain("That&#x27;s everything we found in your colours and price range.")
    expect(few).toContain('Prices and stock can change at the shop.')
    const six = sheet({ name: 'items', items: Array.from({ length: 6 }, (_, i) => sug(i)) })
    expect(six).not.toContain('everything we found')
    expect(six).toContain('Prices and stock can change at the shop.')
  })

  it('UI-22 and checks 20: no add, save or wishlist control; nothing is written to the wardrobe', () => {
    const html = sheet({ name: 'items', items: [sug(1), sug(2)] })
    expect(html.toLowerCase()).not.toMatch(/add to wardrobe|save|wishlist|add a piece/)
    expect(html).not.toContain('<button')
  })

  it('suggestions are not added to the wardrobe: the gap is still there after browsing', () => {
    const before = gapRows(WORK_NO_SHOES, 'work', 'womens')
    sheet({ name: 'items', items: [sug(1)] })
    expect(gapRows(WORK_NO_SHOES, 'work', 'womens')).toEqual(before)
    expect(before[0].label).toBe('Work shoes')
  })

  it('nothing matching shows a plain message with Change my budget and Close (UI-17, check 15)', () => {
    const html = sheet({ name: 'items', items: [] })
    expect(html).toContain('>Nothing found this time<')
    expect(html).toContain("We couldn&#x27;t find Work shoes at Kmart, Target or Big W between A$15 and A$60 in your colours. Try a higher price range for shoes, or a different budget.")
    expect(html).toContain('href="/profile/budget?from=style-me&amp;occasion=work"')
    expect(html).toContain('>Change my budget<')
    expect(html).toContain('>Close<')
    expect(html).not.toContain('<ul')
  })

  it('only-one gaps use the plural noun when nothing is found', () => {
    const one = gapRows([item('tops', 'casual')], 'casual', 'womens')[0]
    const html = renderToStaticMarkup(
      <SheetBody state={{ name: 'items', items: [] }} row={one} occasion="casual" tier="premium" range={[90, 300]} season="winter" onClose={() => {}} onRetry={() => {}} />,
    )
    expect(html).toContain('We couldn&#x27;t find Casual tops at Rodd &amp; Gunn, R.M. Williams or M.J. Bale between A$90 and A$300')
  })

  it('UI-18 service down in the sheet shows both lines; paused and offline have their own', () => {
    const down = sheet({ name: 'unavailable' })
    expect(down).toContain('role="alert"')
    expect(down).toContain("Suggestions aren&#x27;t available right now.")
    expect(down).toContain('Your wardrobe, outfits and saved outfits still work.')
    expect(sheet({ name: 'paused', resumeOn: '2026-12-01' })).toContain('Suggestions are paused until 1 December.')
    expect(sheet({ name: 'offline' })).toContain("You&#x27;re offline. Connect to the internet to see suggestions.")
    expect(sheet({ name: 'error' })).toContain("We couldn&#x27;t load suggestions just now.")
  })
})

describe('Shop link button', () => {
  it('UI-16 shop link opens the shop\'s own page in a new tab: a link with target _blank and a full accessible name', () => {
    const html = sheet({ name: 'items', items: [sug(1)] })
    const a = html.match(/<a[^>]*>See it at the shop/)?.[0] ?? ''
    expect(a).toContain('target="_blank"')
    expect(a).toContain('rel="noopener noreferrer"')
    expect(a).toContain('aria-label="See Loafers 1 at Kmart (opens in a new tab)"')
    expect(a).toContain('href="/api/gaps/shop-link?occasion=work&amp;category=shoes&amp;t=Loafers+1"')
    expect(html).not.toContain('<button')
  })
})
