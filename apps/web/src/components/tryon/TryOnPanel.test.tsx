import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TryOnPanelView, type TryOnPanelViewProps } from './TryOnPanel'
import { planPanel, type PanelPiece } from '@/lib/try-on-panel'
import { TRY_ON_LABEL } from '@/lib/try-on'

const piece = (label: string, category: string): PanelPiece => ({ label, category, imageUrl: `https://x/${label}.jpg`, removed: false })
const TOP_BOTTOM = [piece('Tee', 'tops'), piece('Jeans', 'bottoms')]
const WITH_SHOES = [...TOP_BOTTOM, piece('Trainers', 'shoes'), piece('Belt', 'accessories')]
const NEW = { url: 'https://signed/new.jpg', madeAt: '2026-11-16T02:00:00Z' }

function props(over: Partial<Omit<TryOnPanelViewProps, 'state'>> & { pieces?: PanelPiece[]; state?: Partial<Extract<TryOnPanelViewProps['state'], { kind: 'ready' }>> } = {}): TryOnPanelViewProps {
  return {
    outfitName: 'Friday dinner',
    plan: planPanel(over.pieces ?? TOP_BOTTOM),
    state: { kind: 'ready', hasPhoto: true, photoUrl: 'https://signed/me.jpg', picture: null, paused: false, resumeOn: null, ...over.state },
    picture: over.picture ?? null,
    phase: over.phase ?? 'idle',
    elapsedMs: over.elapsedMs ?? 0,
    onStart: over.onStart ?? (() => {}),
    onTryAgain: over.onTryAgain ?? (() => {}),
    notYet: over.notYet,
  }
}
const html = (p: TryOnPanelViewProps) => renderToStaticMarkup(<TryOnPanelView {...p} />)

function clickable(node: ReactNode, text: string): (() => void) | null {
  if (!isValidElement(node)) return null
  const el = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>
  const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children]
  if (el.props.onClick && children.includes(text)) return el.props.onClick
  for (const c of children) { const f = clickable(c, text); if (f) return f }
  return null
}

describe('On you panel', () => {
  it('saved outfit shows See it on me when there is a try-on photo', () => {
    const out = html(props())
    expect(out).toContain('>See it on me<')
    expect(out).toContain('Takes up to a minute and a half.')
    expect(out).not.toContain('Add a try-on photo')
  })

  it('saved outfit without a try-on photo links to the photo section', () => {
    const out = html(props({ state: { hasPhoto: false, photoUrl: null } }))
    expect(out).toContain('Add a try-on photo to see this on you')
    expect(out).toContain('href="/profile#try-on-photo"')
    expect(out).toContain('>Add a try-on photo<')
    expect(out).not.toContain('See it on me')
  })

  it('every try-on picture carries the AI label', () => {
    // A new picture and a saved one are the same view, so both carry it, under the picture.
    for (const picture of [NEW, { ...NEW, madeAt: '2026-11-01T02:00:00Z' }]) {
      const out = html(props({ picture, pieces: WITH_SHOES }))
      expect(out).toContain(TRY_ON_LABEL)
      expect(out.indexOf('<img')).toBeLessThan(out.indexOf(TRY_ON_LABEL))
    }
    expect(TRY_ON_LABEL).toBe('Made by AI. Fit and details may not be exact.')
    expect(html(props({ picture: NEW }))).toContain('alt="You wearing Friday dinner"')
  })

  it('shows the date and the line naming the pieces that are not drawn', () => {
    const out = html(props({ picture: NEW, pieces: WITH_SHOES }))
    expect(out).toContain('Made 16 Nov')
    expect(out).toContain('Shoes and accessories aren&#x27;t shown on you.')
    expect(html(props({ picture: NEW }))).not.toContain('aren&#x27;t shown on you')
  })

  it('not shown line names only the outfit\'s own undrawn pieces', () => {
    const shoesOnly = html(props({ picture: NEW, pieces: [...TOP_BOTTOM, piece('Trainers', 'shoes')] }))
    expect(shoesOnly).toContain('Shoes aren&#x27;t shown on you.')
    expect(shoesOnly).not.toContain('ccessories')
    const both = html(props({ picture: NEW, pieces: [...TOP_BOTTOM, piece('Trainers', 'shoes'), piece('Tote', 'bags')] }))
    expect(both).toContain('Shoes and bags aren&#x27;t shown on you.')
  })

  it('shows Try again for a saved picture and the missing-photo message instead of the button', () => {
    expect(html(props({ picture: NEW }))).toContain('>Try again<')
    const out = html(props({ pieces: [piece('Jeans', 'bottoms'), { ...piece('Tee', 'tops'), imageUrl: null }] }))
    expect(out).toContain('Add a photo of your top to try this on')
    expect(out).not.toContain('See it on me')
  })

  it('shows progress with the dimmed photo and no button', () => {
    const out = html(props({ phase: 'working', elapsedMs: 31_000 }))
    expect(out).toContain('Adding your bottoms… (2 of 2)')
    expect(out).toContain('Still working. This can take up to a minute and a half.')
    expect(out).toContain('Keep this page open until it&#x27;s done.')
    expect(out).toContain('src="https://signed/me.jpg"')
    expect(out).not.toContain('See it on me')
  })

  it('shows the failure message, with the old picture and Try again still there', () => {
    const out = html(props({ phase: 'failed', picture: NEW }))
    expect(out).toContain("Try-on didn&#x27;t work this time")
    expect(out).toContain('Nothing was charged. Try again later.')
    expect(out).toContain('role="alert"')
    expect(out).toContain('src="https://signed/new.jpg"')
    expect(out).toContain('>Try again<')
  })

  it('replaces the buttons with the paused message and keeps a saved picture', () => {
    const out = html(props({ picture: NEW, state: { paused: true, resumeOn: '2026-12-01' } }))
    expect(out).toContain('Try-on is paused until 1 December')
    expect(out).toContain('Your saved try-ons still show.')
    expect(out).toContain('src="https://signed/new.jpg"')
    expect(out).not.toContain('Try again<')
    expect(out).not.toContain('See it on me')
  })

  it('backing out of Try again charges nothing', () => {
    // Try again only opens the warning; it never starts a picture by itself.
    const onStart = vi.fn()
    const onTryAgain = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const tree = TryOnPanelView(props({ picture: NEW, onStart, onTryAgain }))
    clickable(tree, 'Try again')?.()
    expect(onTryAgain).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('server failure still says nothing was charged', () => {
    expect(html(props({ phase: 'failed' }))).toContain('Nothing was charged. Try again later.')
    expect(html(props({ phase: 'failed' }))).toContain('>See it on me<')
  })

  it('connection lost never says nothing was charged, offers a check and no new paid try-on', () => {
    const out = html(props({ phase: 'lost', picture: NEW }))
    expect(out).toContain('Connection lost')
    expect(out).toContain('may still be on its way')
    expect(out).toContain('Check for my picture')
    expect(out).not.toContain('Nothing was charged')
    expect(out).not.toContain('>Try again<')
    expect(out).not.toContain('See it on me')
    expect(out).toContain('src="https://signed/new.jpg"')
    expect(html(props({ phase: 'lost', notYet: true }))).toContain('No new picture yet.')
  })
})
