import { describe, it, expect } from 'vitest'
import { nextMissingPiece } from './first-pieces'

describe('nextMissingPiece', () => {
  it('asks for a top first when nothing is owned', () => {
    expect(nextMissingPiece([])?.prompt).toBe('Add a top to see your first outfits.')
  })

  it('names the next missing piece in order', () => {
    expect(nextMissingPiece(['tops'])?.prompt).toBe('Add a bottom to see your first outfits.')
    expect(nextMissingPiece(['tops', 'bottoms'])?.prompt).toBe('Add shoes to see your first outfits.')
    expect(nextMissingPiece(['shoes', 'bags'])?.prompt).toBe('Add a top to see your first outfits.')
  })

  it('returns null once top, bottom and shoes are all there', () => {
    expect(nextMissingPiece(['shoes', 'tops', 'bottoms', 'outerwear'])).toBeNull()
  })
})
