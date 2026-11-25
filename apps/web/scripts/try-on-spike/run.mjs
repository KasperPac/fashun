#!/usr/bin/env node
// Usage: node apps/web/scripts/try-on-spike/run.mjs <photo-folder> [--out DIR] [--runs N] [--dry-run]
//        [--openai-model NAME] [--gemini-model NAME]
// Keys are read only from OPENAI_API_KEY and GEMINI_API_KEY and are never printed or written.
import { parseArgs } from 'node:util'
import path from 'node:path'
import { DEFAULT_MODELS, fakeProvider, geminiProvider, loadInputs, openaiProvider, runSpike } from './lib.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'try-on-spike-out' },
    runs: { type: 'string', default: '1' },
    'dry-run': { type: 'boolean', default: false },
    'openai-model': { type: 'string' },
    'gemini-model': { type: 'string' },
  },
})
const dir = positionals[0]
const runs = Number.parseInt(values.runs, 10)
if (!dir || !Number.isInteger(runs) || runs < 1) {
  console.error('Usage: run.mjs <photo-folder> [--out DIR] [--runs N] [--dry-run]')
  process.exit(2)
}
const models = {
  openai: values['openai-model'] ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODELS.openai,
  gemini: values['gemini-model'] ?? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODELS.gemini,
}
let providers
if (values['dry-run']) {
  providers = [fakeProvider('openai', `${models.openai} (dry-run)`), fakeProvider('gemini', `${models.gemini} (dry-run)`)]
} else {
  const { OPENAI_API_KEY: openaiKey, GEMINI_API_KEY: geminiKey } = process.env
  if (!openaiKey || !geminiKey) {
    console.error('Set OPENAI_API_KEY and GEMINI_API_KEY (or use --dry-run).')
    process.exit(2)
  }
  providers = [
    openaiProvider({ apiKey: openaiKey, model: models.openai }),
    geminiProvider({ apiKey: geminiKey, model: models.gemini }),
  ]
}
const outDir = path.resolve(values.out)
const results = await runSpike({ inputs: await loadInputs(dir), providers, runs, outDir })
console.log(`Wrote ${results.outfits.length} sheet(s) and results.json to ${outDir}`)
console.log(JSON.stringify(results.summary, null, 2))
