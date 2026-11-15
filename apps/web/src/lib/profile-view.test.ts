import { describe, it, expect } from 'vitest'
import { NOT_SURE, seasonHeadline, traitLabel } from './profile-view'

describe('profile view helpers', () => {
  it('words the season headline with the right article', () => {
    expect(seasonHeadline('autumn')).toBe("You're an Autumn")
    expect(seasonHeadline('winter')).toBe("You're a Winter")
    expect(seasonHeadline('spring')).toBe("You're a Spring")
    expect(seasonHeadline('summer')).toBe("You're a Summer")
  })

  it('turns stored trait values into readable labels', () => {
    expect(traitLabel('dark-brown')).toBe('Dark brown')
    expect(traitLabel('blue')).toBe('Blue')
  })

  it('shows "Not sure" for empty, whitespace or missing values', () => {
    expect(traitLabel(null)).toBe(NOT_SURE)
    expect(traitLabel(undefined)).toBe(NOT_SURE)
    expect(traitLabel('')).toBe(NOT_SURE)
    expect(traitLabel('   ')).toBe(NOT_SURE)
  })
})
