import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NotClothingNotice from './NotClothingNotice'
import CategoryIcon from './CategoryIcon'
import ReadyStrip from './ReadyStrip'

describe('NotClothingNotice', () => {
  it('shows the exact notice with "Try another photo" inside it, and no form', () => {
    const html = renderToStaticMarkup(<NotClothingNotice onTryAnother={() => {}} />)
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'")
    expect(text).toContain("This doesn't look like a piece of clothing. Try a photo of just the piece, laid flat or on a hanger.")
    expect(html).toContain('Try another photo')
    expect(html.indexOf('Try another photo')).toBeGreaterThan(html.indexOf('role="status"'))
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
  })
})

describe('CategoryIcon', () => {
  it('is decorative', () => {
    expect(renderToStaticMarkup(<CategoryIcon category="bottoms" />)).toContain('aria-hidden="true"')
  })
})

describe('ReadyStrip while loading', () => {
  const readiness = [
    { occasion: 'casual' as const, ready: false, missing: 'tops' as const, status: 'Needs a top' },
    { occasion: 'work' as const, ready: true, missing: null, status: 'Ready' },
  ]
  it('shows names only, no status and no links', () => {
    const html = renderToStaticMarkup(<ReadyStrip readiness={readiness} loading />)
    expect(html).toContain('Casual')
    expect(html).not.toContain('Needs a top')
    expect(html).not.toContain('Ready</span>')
    expect(html).not.toContain('<a ')
  })
  it('shows status once loaded', () => {
    const html = renderToStaticMarkup(<ReadyStrip readiness={readiness} />)
    expect(html).toContain('Needs a top')
  })
})
