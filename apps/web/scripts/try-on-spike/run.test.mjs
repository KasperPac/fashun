import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fakeProvider, geminiProvider, loadInputs, openaiProvider, percentile, runSpike } from './lib.mjs'

async function photoFolder() {
  const dir = await mkdtemp(path.join(tmpdir(), 'spike-in-'))
  await writeFile(path.join(dir, 'person.jpg'), 'person')
  for (const n of [1, 2]) {
    await mkdir(path.join(dir, `outfit-${n}`))
    await writeFile(path.join(dir, `outfit-${n}`, 'top.jpg'), 'top')
    await writeFile(path.join(dir, `outfit-${n}`, 'bottom.jpg'), 'bottom')
  }
  return dir
}

describe('percentile', () => {
  it('handles empty, one and many values', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([7], 95)).toBe(7)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
  })
})

describe('loadInputs', () => {
  it('rejects a folder without person.jpg', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'spike-empty-'))
    await expect(loadInputs(dir)).rejects.toThrow('person.jpg')
  })
})

describe('dry run', () => {
  it('writes pictures, sheets and results.json without network or keys', async () => {
    const dir = await photoFolder()
    const out = await mkdtemp(path.join(tmpdir(), 'spike-out-'))
    const script = path.join(import.meta.dirname, 'run.mjs')
    const env = { PATH: process.env.PATH }
    const stdout = execFileSync('node', [script, dir, '--out', out, '--runs', '3', '--dry-run'], { env }).toString()
    expect(stdout).toContain('results.json')
    const files = await readdir(out)
    expect(files).toContain('outfit-1-sheet.html')
    expect(files).toContain('outfit-2-sheet.html')
    expect(files).toContain('outfit-1-openai-run3.png')
    expect(files).toContain('outfit-2-gemini-run1.png')
    const results = JSON.parse(await readFile(path.join(out, 'results.json'), 'utf8'))
    expect(results.runs).toBe(3)
    expect(results.outfits).toHaveLength(2)
    expect(results.outfits[0].providers.openai.calls).toHaveLength(3)
    expect(results.summary.gemini.successfulCalls).toBe(6)
    expect(results.outfits[0].garmentSizes).toEqual([6, 3])
  })

  it('refuses to run live without both keys', () => {
    expect(() => execFileSync('node', [path.join(import.meta.dirname, 'run.mjs'), '.'], { env: { PATH: process.env.PATH }, stdio: 'pipe' })).toThrow()
  })

  it('records a failed call without stopping', async () => {
    const dir = await photoFolder()
    const out = await mkdtemp(path.join(tmpdir(), 'spike-out-'))
    const bad = { id: 'openai', model: 'm', generate: async () => { throw new Error('openai request failed (HTTP 500)') } }
    const r = await runSpike({ inputs: await loadInputs(dir), providers: [bad, fakeProvider('gemini', 'g')], outDir: out })
    expect(r.outfits[0].providers.openai.calls[0].ok).toBe(false)
    expect(r.summary.openai.p50Ms).toBeNull()
    expect(r.summary.gemini.successfulCalls).toBe(2)
  })
})

describe('provider requests', () => {
  const person = { name: 'person.jpg', mime: 'image/jpeg', bytes: Buffer.from('P') }
  const garments = [{ name: 'top.jpg', mime: 'image/jpeg', bytes: Buffer.from('T') }, { name: 'b.png', mime: 'image/png', bytes: Buffer.from('B') }]
  const png = Buffer.from('out').toString('base64')

  it('openai sends every photo as a file part, key only in the header', async () => {
    let seen
    const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ data: [{ b64_json: png }] }) } }
    const r = await openaiProvider({ apiKey: 'sk-test', model: 'gpt-image-1', fetchImpl }).generate({ person, garments, prompt: 'p' })
    expect(seen.url).toBe('https://api.openai.com/v1/images/edits')
    expect(seen.init.headers.Authorization).toBe('Bearer sk-test')
    expect(seen.init.body.getAll('image[]')).toHaveLength(3)
    expect(seen.init.body.get('model')).toBe('gpt-image-1')
    expect(r.bytes.toString()).toBe('out')
  })

  it('gemini sends every photo as base64 inline data, key only in the header', async () => {
    let seen
    const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }, { inlineData: { mimeType: 'image/png', data: png } }] } }] }) } }
    const r = await geminiProvider({ apiKey: 'g-test', model: 'm1', fetchImpl }).generate({ person, garments, prompt: 'p' })
    expect(seen.url).not.toContain('g-test')
    expect(seen.init.headers['x-goog-api-key']).toBe('g-test')
    const body = JSON.parse(seen.init.body)
    expect(body.contents[0].parts.filter((p) => p.inline_data)).toHaveLength(3)
    expect(r.bytes.toString()).toBe('out')
  })

  it('errors carry the status only, not the provider body', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'secret detail' })
    await expect(openaiProvider({ apiKey: 'k', model: 'm', fetchImpl }).generate({ person, garments, prompt: 'p' })).rejects.toThrow(/^openai request failed \(HTTP 429\)$/)
  })
})
