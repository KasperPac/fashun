import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnnouncerProvider } from './Announcer'
import { Banner, Toast } from './Feedback'

describe('AnnouncerProvider', () => {
  it('mounts one empty polite status region', () => {
    const html = renderToStaticMarkup(<AnnouncerProvider><p>page</p></AnnouncerProvider>)
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).toContain('<div role="status" aria-live="polite" class="sr-only"></div>')
  })
  it('toast and banner no longer create their own status element', () => {
    const html = renderToStaticMarkup(
      <AnnouncerProvider><Toast message="Saved." onDone={() => {}} /><Banner>Season changed.</Banner></AnnouncerProvider>,
    )
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).toContain('Saved.')
    expect(html).toContain('Season changed.')
  })
})
