#!/usr/bin/env node
// Usage: node apps/web/scripts/try-on-spike/run.mjs <photo-folder> [--out DIR] [--runs N] [--dry-run]
//        [--openai-model NAME] [--gemini-model NAME] [--openai-base-url URL] [--gemini-base-url URL]
// Through the studio gateway (paid run): set OPENAI_BASE_URL=$U/api/studio/paid/<run id>/openai,
// GEMINI_BASE_URL=$U/api/studio/paid/<run id>/gemini, OPENAI_API_KEY and GEMINI_API_KEY both to your
// own $PAPERCLIP_API_KEY, and run with NODE_USE_ENV_PROXY=1. One picture per call, no real key in the repo.
// Keys are read only from OPENAI_API_KEY and GEMINI_API_KEY and are never printed or written.
import { parseArgs } from 'node:util'
import path from 'node:path'
import { DEFAULT_BASE_URLS, DEFAULT_MODELS, fakeProvider, geminiProvider, loadInputs, openaiProvider, runSpike } from './lib.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'try-on-spike-out' },
    runs: { type: 'string', default: '1' },
    'dry-run': { type: 'boolean', default: false },
    'openai-model': { type: 'string' },
    'gemini-model': { type: 'string' },
    'openai-base-url': { type: 'string' },
    'gemini-base-url': { type: 'string' },
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
const baseUrls = {
  openai: values['openai-base-url'] ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URLS.openai,
  gemini: values['gemini-base-url'] ?? process.env.GEMINI_BASE_URL ?? DEFAULT_BASE_URLS.gemini,
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
    openaiProvider({ apiKey: openaiKey, model: models.openai, baseUrl: baseUrls.openai }),
    geminiProvider({ apiKey: geminiKey, model: models.gemini, baseUrl: baseUrls.gemini }),
  ]
}
const outDir = path.resolve(values.out)
const results = await runSpike({ inputs: await loadInputs(dir), providers, runs, outDir })
console.log(`Wrote ${results.outfits.length} sheet(s) and results.json to ${outDir}`)
console.log(JSON.stringify(results.summary, null, 2))
