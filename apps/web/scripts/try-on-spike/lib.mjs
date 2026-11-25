// Try-on model comparison harness (KAS-651 T1). Plain fetch, no dependencies.
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export const PROMPT =
  "Edit the first picture, which shows a person. Keep the person's face, body, pose and background exactly as they are. " +
  'Dress the person in the garments shown in the other pictures. Keep each garment\'s colour, pattern, fabric and hardware ' +
  '(buttons, belt loops, pockets, zips) exactly as photographed. Dress them naturally: tuck or untuck each garment as it suits. ' +
  'Leave the feet bare unless shoes are shown in the other pictures. Return one photo-realistic picture of the person wearing the outfit.'

// Defaults are the current models as last known; check each provider's docs and override with
// --openai-model / --gemini-model (or OPENAI_IMAGE_MODEL / GEMINI_IMAGE_MODEL). The chosen names
// are written to results.json.
export const DEFAULT_MODELS = { openai: 'gpt-image-1', gemini: 'gemini-2.5-flash-image' }

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

export function percentile(values, p) {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}

async function loadImage(file) {
  const bytes = await readFile(file)
  const mime = MIME[path.extname(file).toLowerCase()]
  if (!mime) throw new Error(`Unsupported image type: ${path.basename(file)}`)
  return { name: path.basename(file), mime, bytes }
}

/** person.jpg + outfit-N/ folders of garment photos -> { person, outfits: [{ name, garments }] } */
export async function loadInputs(dir) {
  const entries = await readdir(dir)
  const personName = entries.find((e) => /^person\.(jpe?g|png|webp)$/i.test(e))
  if (!personName) throw new Error('person.jpg not found in the photo folder')
  const person = await loadImage(path.join(dir, personName))
  const outfitDirs = []
  for (const e of entries.filter((e) => /^outfit-\d+$/i.test(e))) {
    if ((await stat(path.join(dir, e))).isDirectory()) outfitDirs.push(e)
  }
  outfitDirs.sort((a, b) => parseInt(a.split('-')[1], 10) - parseInt(b.split('-')[1], 10))
  if (outfitDirs.length === 0) throw new Error('no outfit-N folders found in the photo folder')
  const outfits = []
  for (const name of outfitDirs) {
    const files = (await readdir(path.join(dir, name))).filter((f) => MIME[path.extname(f).toLowerCase()]).sort()
    if (files.length === 0) throw new Error(`${name} has no garment photos`)
    outfits.push({ name, garments: await Promise.all(files.map((f) => loadImage(path.join(dir, name, f)))) })
  }
  return { person, outfits }
}

function httpError(provider, status) {
  // Status only: provider error text is never copied into logs or files.
  return new Error(`${provider} request failed (HTTP ${status})`)
}

export function openaiProvider({ apiKey, model, fetchImpl = fetch }) {
  return {
    id: 'openai',
    model,
    async generate({ person, garments, prompt }) {
      const form = new FormData()
      form.append('model', model)
      form.append('prompt', prompt)
      form.append('n', '1')
      form.append('quality', 'high')
      form.append('input_fidelity', 'high')
      for (const img of [person, ...garments]) {
        form.append('image[]', new Blob([img.bytes], { type: img.mime }), img.name)
      }
      const res = await fetchImpl('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })
      if (!res.ok) throw httpError('openai', res.status)
      const json = await res.json()
      const b64 = json?.data?.[0]?.b64_json
      if (!b64) throw new Error('openai returned no picture')
      return { mime: 'image/png', bytes: Buffer.from(b64, 'base64') }
    },
  }
}

export function geminiProvider({ apiKey, model, fetchImpl = fetch }) {
  return {
    id: 'gemini',
    model,
    async generate({ person, garments, prompt }) {
      const parts = [{ text: prompt }]
      for (const img of [person, ...garments]) {
        parts.push({ inline_data: { mime_type: img.mime, data: img.bytes.toString('base64') } })
      }
      const res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        },
      )
      if (!res.ok) throw httpError('gemini', res.status)
      const json = await res.json()
      const out = (json?.candidates?.[0]?.content?.parts ?? []).find((p) => (p.inlineData ?? p.inline_data)?.data)
      const data = out && (out.inlineData ?? out.inline_data)
      if (!data) throw new Error('gemini returned no picture')
      return { mime: data.mimeType ?? data.mime_type ?? 'image/png', bytes: Buffer.from(data.data, 'base64') }
    },
  }
}

// 1x1 PNG. Used only by --dry-run so the flow runs without network or keys.
const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
export function fakeProvider(id, model) {
  return {
    id,
    model,
    async generate() {
      return { mime: 'image/png', bytes: FAKE_PNG }
    },
  }
}

async function timed(provider, input) {
  const start = performance.now()
  try {
    const picture = await provider.generate(input)
    return { ok: true, ms: Math.round(performance.now() - start), picture }
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - start), error: err instanceof Error ? err.message : 'failed' }
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function sheetHtml(outfit, personFile, garmentFiles, cells) {
  const col = (title, body) => `<td><h3>${esc(title)}</h3>${body}</td>`
  const img = (f) => `<img src="${esc(f)}">`
  return `<!doctype html><meta charset="utf-8"><title>${esc(outfit)}</title>
<style>body{font-family:sans-serif}td{vertical-align:top;padding:8px}img{max-width:320px;display:block;margin-bottom:6px}</style>
<h2>${esc(outfit)}</h2><table><tr>
${col('Person', img(personFile))}${col('Garments', garmentFiles.map(img).join(''))}
${cells.map((c) => col(`${c.provider} (${c.model})`, c.file ? img(c.file) : `<p>${esc(c.error ?? 'no picture')}</p>`)).join('\n')}
</tr></table>`
}

export async function runSpike({ inputs, providers, runs = 1, outDir }) {
  await mkdir(path.join(outDir, 'inputs'), { recursive: true })
  const personFile = `inputs/person${path.extname(inputs.person.name)}`
  await writeFile(path.join(outDir, personFile), inputs.person.bytes)
  const results = {
    runs,
    prompt: PROMPT,
    models: Object.fromEntries(providers.map((p) => [p.id, p.model])),
    inputSizes: { person: inputs.person.bytes.length },
    outfits: [],
    summary: {},
  }
  const allMs = Object.fromEntries(providers.map((p) => [p.id, []]))
  for (const outfit of inputs.outfits) {
    const garmentFiles = []
    for (const g of outfit.garments) {
      const f = `inputs/${outfit.name}-${g.name}`
      await writeFile(path.join(outDir, f), g.bytes)
      garmentFiles.push(f)
    }
    const entry = { outfit: outfit.name, garmentSizes: outfit.garments.map((g) => g.bytes.length), providers: {} }
    const cells = []
    for (const provider of providers) {
      const calls = []
      let firstFile = null
      let firstError = null
      for (let run = 1; run <= runs; run++) {
        const r = await timed(provider, { person: inputs.person, garments: outfit.garments, prompt: PROMPT })
        const call = { run, ms: r.ms, ok: r.ok }
        if (r.ok) {
          const file = `${outfit.name}-${provider.id}-run${run}${EXT[r.picture.mime] ?? '.png'}`
          await writeFile(path.join(outDir, file), r.picture.bytes)
          call.file = file
          call.bytes = r.picture.bytes.length
          allMs[provider.id].push(r.ms)
          firstFile ??= file
        } else {
          call.error = r.error
          firstError ??= r.error
        }
        calls.push(call)
      }
      entry.providers[provider.id] = { model: provider.model, calls }
      cells.push({ provider: provider.id, model: provider.model, file: firstFile, error: firstError })
    }
    await writeFile(path.join(outDir, `${outfit.name}-sheet.html`), sheetHtml(outfit.name, personFile, garmentFiles, cells))
    results.outfits.push(entry)
  }
  for (const p of providers) {
    const ms = allMs[p.id]
    results.summary[p.id] = { model: p.model, successfulCalls: ms.length, p50Ms: percentile(ms, 50), p95Ms: percentile(ms, 95) }
  }
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
  return results
}
