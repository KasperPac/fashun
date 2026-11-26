import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TryOnPhotoSection, { PickStep, PrivacyStep } from './TryOnPhotoSection'
import TryOnSpendRow from './TryOnSpendRow'
import { PRIVACY_NOTE } from '@/lib/try-on-photo-client'

const empty = { kind: 'ready', photoUrl: null, consented: false } as const
const saved = { kind: 'ready', photoUrl: 'https://x/p.jpg', consented: true } as const

/** Walks a rendered element tree for the first element whose text contains `text` and has an onClick. */
function clickable(node: ReactNode, text: string): (() => void) | null {
  if (!isValidElement(node)) return null
  const el = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>
  const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children]
  if (el.props.onClick && children.includes(text)) return el.props.onClick
  for (const c of children) {
    const found = clickable(c, text)
    if (found) return found
  }
  return null
}

describe('Your try-on photo section', () => {
  it('profile shows the try-on photo section with Add photo', () => {
    const html = renderToStaticMarkup(<TryOnPhotoSection initial={empty} />)
    expect(html).toContain('id="try-on-photo"')
    expect(html).toContain('>Your try-on photo<')
    expect(html).toContain('See saved outfits on you.')
    expect(html).toContain('Use one full-length photo: plain background, facing the camera.')
    expect(html).toContain('>Add photo<')
    expect(html).not.toContain('Replace')
  })

  it('first Add photo shows the privacy note before any upload', () => {
    const html = renderToStaticMarkup(<PrivacyStep busy={false} error={null} onAgree={() => {}} onNotNow={() => {}} />)
    expect(html).toContain(PRIVACY_NOTE.replace(/'/g, '&#x27;').replace(/"/g, '&quot;'))
    expect(html).toContain('>I agree<')
    expect(html).toContain('>Not now<')
    expect(html).not.toContain('Take a photo')
    expect(html).not.toContain('Choose a photo')
    expect(html).not.toContain('type="file"')
    expect(PRIVACY_NOTE.startsWith('To make your try-on picture, Fashun sends your photo, your clothing photos and any "photo of me wearing it" to Google, whose Gemini AI makes it.')).toBe(true)
    expect(PRIVACY_NOTE.endsWith('Try-on is for people aged 18 and over.')).toBe(true)
    expect(PRIVACY_NOTE).not.toContain('FASHN')
    expect(PRIVACY_NOTE).toContain('Anthropic')
    expect(PRIVACY_NOTE.split(/\s+/).length).toBeLessThan(110)
  })

  it('try-on privacy note matches the signed-off wording', () => {
    const signedOff =
      'To make your try-on picture, Fashun sends your photo, your clothing photos and any "photo of me wearing it" to Google, whose Gemini AI makes it. To write short fit notes, it also sends worn photos to Anthropic, whose Claude AI describes the clothes. Neither trains its AI on them. Google keeps them for 55 days and Anthropic for 30 days (longer if flagged for misuse), and either may process them in other countries. Fashun keeps your photos privately until you delete them: under Profile, or on the item page for a worn photo. Try-on is for people aged 18 and over.'
    const html = renderToStaticMarkup(<PrivacyStep busy={false} error={null} onAgree={() => {}} onNotNow={() => {}} />)
    expect(html).toContain(signedOff.replace(/'/g, '&#x27;').replace(/"/g, '&quot;'))
    expect(PRIVACY_NOTE).toBe(signedOff)
    expect(PRIVACY_NOTE).toContain('Gemini')
    expect(PRIVACY_NOTE).toContain('photo of me wearing it')
  })

  it('Not now uploads nothing and records no agreement', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const onAgree = vi.fn()
    const onNotNow = vi.fn()
    const notNow = clickable(PrivacyStep({ busy: false, error: null, onAgree, onNotNow }), 'Not now')
    expect(notNow).not.toBeNull()
    notNow?.()
    expect(onNotNow).toHaveBeenCalledOnce()
    expect(onAgree).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('after I agree the sheet offers Take a photo and Choose a photo, and Replace adds the saved-pictures line', () => {
    const add = renderToStaticMarkup(<PickStep replacing={false} onTake={() => {}} onChoose={() => {}} />)
    expect(add).toContain('Full-length, plain background, facing the camera.')
    expect(add).toContain('>Take a photo<')
    expect(add).toContain('>Choose a photo<')
    expect(add).not.toContain('saved try-on pictures stay')
    const replace = renderToStaticMarkup(<PickStep replacing onTake={() => {}} onChoose={() => {}} />)
    expect(replace).toContain('Your saved try-on pictures stay. Tap See it on me again to use the new photo.')
  })

  it('uploaded try-on photo shows with Replace and Delete', () => {
    const html = renderToStaticMarkup(<TryOnPhotoSection initial={saved} />)
    expect(html).toContain('alt="Your try-on photo"')
    expect(html).toContain('Only you can see this photo.')
    expect(html).toContain('>Replace<')
    expect(html).toContain('>Delete<')
    expect(html).not.toContain('>Add photo<')
  })

  it('shows a clear message and Try again when the section cannot load, without breaking the rest', () => {
    const html = renderToStaticMarkup(<TryOnPhotoSection initial={{ kind: 'error' }} />)
    expect(html).toContain("Couldn&#x27;t load your try-on photo.")
    expect(html).toContain('>Try again<')
  })

  it('try-on off hides the photo section and the button', () => {
    expect(renderToStaticMarkup(<TryOnPhotoSection initial={{ kind: 'off' }} />)).toBe('')
  })
})

describe('owner row', () => {
  it('links to the spend page with this month against the cap', () => {
    const html = renderToStaticMarkup(<TryOnSpendRow value="US$3.15 of US$7.50" />)
    expect(html).toContain('href="/profile/try-on-spend"')
    expect(html).toContain('Try-on spend')
    expect(html).toContain('US$3.15 of US$7.50')
  })
})
