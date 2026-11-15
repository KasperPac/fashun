import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReviewForm from './ReviewForm'

const base = {
  mode: 'add' as const,
  initial: { name: 'Shirt', category: 'tops' as const, colours: ['#112233'], occasions: ['casual' as const] },
  season: null,
  onSave: async () => true,
}

describe('ReviewForm photo tile', () => {
  it('offers "Add a photo" under the empty tile', () => {
    const html = renderToStaticMarkup(<ReviewForm {...base} photoUrl={null} onAddPhoto={() => {}} />)
    expect(html).toContain('No photo')
    expect(html).toContain('Add a photo')
  })
  it('does not offer it once there is a photo', () => {
    const html = renderToStaticMarkup(<ReviewForm {...base} photoUrl="https://x/y.jpg" onAddPhoto={() => {}} />)
    expect(html).not.toContain('Add a photo')
    expect(html).toContain('src="https://x/y.jpg"')
  })
  it('shows "Change photo" for a photo that was added, so a wrong one can be replaced', () => {
    const html = renderToStaticMarkup(<ReviewForm {...base} photoUrl="https://x/y.jpg" onAddPhoto={() => {}} onChangePhoto={() => {}} />)
    expect(html).toContain('Change photo')
    expect(html).not.toContain('Add a photo')
  })
  it('does not offer it when the screen gives no way to add one', () => {
    expect(renderToStaticMarkup(<ReviewForm {...base} photoUrl={null} />)).not.toContain('Add a photo')
  })
})
