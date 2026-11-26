import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { TRY_ON_LINK_SECONDS } from './try-on-images'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes('__fixtures__') ? [full] : []
  })
}

describe('try-on private links', () => {
  it('try-on links never outlive 5 minutes', () => {
    expect(TRY_ON_LINK_SECONDS).toBe(300)
    const src = join(__dirname, '..')
    for (const file of sources(src)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/storage\s*\.from\(([^)]*)\)\s*\.createSignedUrl\(([^)]*)\)/g)) {
        if (!/TRY_ON_BUCKET/.test(m[1])) continue // the garment-photo bucket keeps its own life
        expect(m[2], file).toMatch(/TRY_ON_LINK_SECONDS\s*$/)
      }
      expect(text, file).not.toMatch(/SIGNED_SECONDS\s*=\s*3600/)
    }
  })
})
