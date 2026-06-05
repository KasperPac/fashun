import Anthropic from '@anthropic-ai/sdk'
import { extractJson } from './extract-json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ProductCandidate {
  url: string
  title: string
  imageUrl: string | null
  retailer: string | null
}

/** Uses Claude's server-side web search to find candidate product pages. Returns [] on failure. */
export async function searchProduct(description: string, store: string): Promise<ProductCandidate[]> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as never],
      messages: [{
        role: 'user',
        content: `Find up to 3 specific product pages for "${description}" ${
          store ? `at the Australian retailer "${store}"` : 'from any major Australian retailer'
        }.
After searching, reply with ONLY a JSON array (no markdown):
[{"url":"direct product page url","title":"product name","imageUrl":"image url or null","retailer":"retailer name"}]`,
      }],
    })

    // Use the last text block as the answer (tool-use blocks precede it). The model
    // usually narrates ("Based on my search results...") before the JSON, so extract
    // the array out of the prose/fence rather than parsing the whole block.
    const texts = message.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    const last = texts[texts.length - 1]
    if (!last) return []
    const parsed = extractJson<ProductCandidate[]>(last.text, 'array')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c: ProductCandidate) => c && typeof c.url === 'string' && /^https?:\/\//.test(c.url))
      .map((c: ProductCandidate) => ({
        url: c.url,
        title: typeof c.title === 'string' ? c.title : c.url,
        imageUrl: typeof c.imageUrl === 'string' ? c.imageUrl : null,
        retailer: typeof c.retailer === 'string' ? c.retailer : (store || null),
      }))
  } catch {
    return []
  }
}
