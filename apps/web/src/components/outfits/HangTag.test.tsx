import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import HangTag from './HangTag'

const piece = (over = {}) => ({ key: 'a', label: 'Navy shirt', category: 'tops', imageUrl: 'https://x/y.png', removed: false, ...over })

describe('HangTag', () => {
  it('shows each piece photo with its name as alt text and visible text', () => {
    const html = renderToStaticMarkup(
      <HangTag kicker="Outfit 1 / 3" name="Sharp Work" reason="Navy is one of your best Autumn colours." accent="#A0461E" pieces={[piece()]} />,
    )
    expect(html).toContain('alt="Navy shirt"')
    expect(html).toContain('>Navy shirt<')
    expect(html).toContain('Outfit 1 / 3')
    expect(html).toContain('Navy is one of your best Autumn colours.')
  })
  it('shows a category label when there is no photo, and says when a piece is gone', () => {
    const html = renderToStaticMarkup(
      <HangTag kicker="k" name="n" reason={null} accent={null} pieces={[piece({ imageUrl: null }), piece({ key: 'b', label: 'Old boots', category: null, removed: true, imageUrl: 'https://x/z.png' })]} />,
    )
    expect(html).toContain('>Tops<')
    expect(html).toContain('No longer in your wardrobe')
    expect(html).not.toContain('https://x/z.png')
  })
  it('makes a piece a button only when it can be opened', () => {
    const open = renderToStaticMarkup(<HangTag kicker="k" name="n" reason={null} accent={null} pieces={[piece()]} onOpenPiece={() => {}} />)
    const plain = renderToStaticMarkup(<HangTag kicker="k" name="n" reason={null} accent={null} pieces={[piece()]} />)
    expect(open).toContain('<button')
    expect(plain).not.toContain('<button')
  })
  it('shows the "made for" note', () => {
    const html = renderToStaticMarkup(<HangTag kicker="k" name="n" reason={null} accent={null} note="Made for your Autumn palette · saved 16 Nov" pieces={[]} />)
    expect(html).toContain('Made for your Autumn palette · saved 16 Nov')
  })
})
