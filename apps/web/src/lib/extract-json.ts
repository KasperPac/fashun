/**
 * Extracts a JSON value from an LLM text response that may wrap it in prose
 * and/or a markdown code fence — e.g. a web_search answer like
 * "Based on my search results:\n```json\n[ ... ]\n```" or "Here it is: [ ... ]".
 *
 * Models routinely ignore "reply with ONLY JSON" and narrate first, so parsing
 * the whole text (or only stripping a leading fence) throws. This finds the
 * outermost array/object instead. Returns the parsed value, or null if none is
 * found or it doesn't parse.
 */
export function extractJson<T = unknown>(text: string, kind: 'array' | 'object'): T | null {
  if (!text) return null
  // Prefer the contents of a fenced code block if one is present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence ? fence[1] : text
  const [open, close] = kind === 'array' ? ['[', ']'] : ['{', '}']
  const start = body.indexOf(open)
  const end = body.lastIndexOf(close)
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(body.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
