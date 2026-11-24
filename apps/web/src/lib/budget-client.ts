/** Sends part of the budget to the profile route. True when it was saved. */
export async function saveBudgetPatch(
  patch: Record<string, unknown>,
  call: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
  keepalive = false,
): Promise<boolean> {
  try {
    const res = await call('/api/onboarding/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      keepalive,
    })
    return res.ok
  } catch {
    return false
  }
}
