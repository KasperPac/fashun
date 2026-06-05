# Lens Query-Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Focus the Lens reverse-image search on the garment by passing a text query (Google Lens multisearch), so a worn/scene photo returns the item rather than the background.

**Architecture:** `searchByImage` gains an optional `query` that becomes the SerpAPI `q` param; `/api/wardrobe/process` passes the garment description `tagImage` already produces (`searchQuery || suggestedName`). Spec: `docs/superpowers/specs/2026-06-05-lens-query-refine-design.md`.

**Tech Stack:** Next.js (non-standard — see `apps/web/AGENTS.md`), TypeScript, Vitest.

---

## Shared conventions

- Run all commands from the repo root `C:\dev\fashun`. Full suite: `pnpm --filter web test` (currently 115 green).
- Soft-fail behaviour and existing mapping in `lens-search.ts` must stay unchanged — this only adds an optional `q`.

## File Structure

- **Modify** `apps/web/src/lib/lens-search.ts` (+ test) — optional `query` → `q` param.
- **Modify** `apps/web/src/app/api/wardrobe/process/route.ts` (+ test) — pass the garment description as the query.

---

## Task 1: `searchByImage` accepts an optional text query

**Files:**
- Modify: `apps/web/src/lib/lens-search.ts`
- Test: `apps/web/src/lib/lens-search.test.ts`

- [ ] **Step 1: Add failing tests**

In `apps/web/src/lib/lens-search.test.ts`, add two tests inside `describe('searchByImage', ...)`:

```ts
  it('includes the q param when a query is given', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => lensResponse })
    await searchByImage('https://signed/photo.jpg', 'blue oxford shirt')
    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string)
    expect(calledUrl.searchParams.get('q')).toBe('blue oxford shirt')
  })

  it('omits the q param when no query is given', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => lensResponse })
    await searchByImage('https://signed/photo.jpg')
    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string)
    expect(calledUrl.searchParams.has('q')).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm --filter web test src/lib/lens-search.test.ts`
Expected: the "includes the q param" test FAILS (`q` is null — not added yet). Others pass.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/lens-search.ts`, change the signature and add the `q` param.

Change the function signature line:
```ts
export async function searchByImage(imageUrl: string, query?: string): Promise<ProductCandidate[]> {
```

Immediately after the `const params = new URLSearchParams({ ... })` block (and before the `const res = await fetch(...)` line), add:
```ts
    if (query) params.set('q', query)
```

Leave everything else (key guard, fetch, mapping, soft-fail) exactly as-is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test src/lib/lens-search.test.ts`
Expected: PASS — all tests green (existing 5 + new 2).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/lens-search.ts apps/web/src/lib/lens-search.test.ts
git commit -m "feat(lens-search): optional text query (q) to focus the visual search"
```

---

## Task 2: `/process` passes the garment description as the query

**Files:**
- Modify: `apps/web/src/app/api/wardrobe/process/route.ts`
- Test: `apps/web/src/app/api/wardrobe/process/route.test.ts`

- [ ] **Step 1: Update the test**

In `apps/web/src/app/api/wardrobe/process/route.test.ts`:

(a) In the happy-path test (named like 'returns tags, a signed preview, and Lens candidates'), change the `searchByImage` call assertion to include the query. Replace:
```ts
    expect(searchByImage).toHaveBeenCalledWith('https://signed/preview.jpg')
```
with:
```ts
    expect(searchByImage).toHaveBeenCalledWith('https://signed/preview.jpg', 'Timberland 6-inch boots')
```
(The `tags` fixture has `searchQuery: 'Timberland 6-inch boots'`, so that's the query.)

(b) Add a test that the query falls back to `suggestedName` when `searchQuery` is empty:
```ts
  it('falls back to suggestedName as the Lens query when searchQuery is empty', async () => {
    tagImage.mockResolvedValueOnce({ ...tags, searchQuery: '' })
    await post(VALID)
    expect(searchByImage).toHaveBeenCalledWith('https://signed/preview.jpg', 'Boots')
  })
```
(The `tags` fixture has `suggestedName: 'Boots'`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/app/api/wardrobe/process/route.test.ts`
Expected: FAIL — the route still calls `searchByImage(processedImageUrl)` with no query argument.

- [ ] **Step 3: Implement the route change**

In `apps/web/src/app/api/wardrobe/process/route.ts`, change the single line inside the candidate block:
```ts
      candidates = await searchByImage(processedImageUrl)
```
to:
```ts
      candidates = await searchByImage(processedImageUrl, tags.searchQuery || tags.suggestedName)
```
(Leave the `if (processedImageUrl)` guard and try/catch as-is.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test src/app/api/wardrobe/process/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the FULL suite**

Run: `pnpm --filter web test`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/wardrobe/process/route.ts apps/web/src/app/api/wardrobe/process/route.test.ts
git commit -m "feat(process): focus Lens search with the garment description"
```

---

## Post-implementation (before/after merging to prod)

- [ ] Deploy (needs `SERPAPI_API_KEY` already in Vercel). Re-upload a worn/scene photo (e.g. person-on-couch wearing a shirt) and confirm the gallery now returns **shirts**, not scenes.
- [ ] If `q` is rejected by SerpAPI or doesn't focus enough, escalate to the Approach B fallback (crop to the garment bounding box) — not built here.

## Integration & handoff

- Branch `feature/lens-query-refine` → subagent-driven execution → merge `--no-ff` to master. **Confirm before `git push origin master`** (deploys to prod).
- Verify: `pnpm --filter web test` (and `pnpm --filter web build`).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- `searchByImage(imageUrl, query?)` adds `q` only when query non-empty; mapping/soft-fail unchanged → Task 1. ✓
- `/process` passes `tags.searchQuery || tags.suggestedName` → Task 2. ✓
- Tests: `q` present-with-query / absent-without; `/process` calls with the query incl. the suggestedName fallback → Tasks 1 & 2. ✓
- Build/deploy verification (can't unit-test SerpAPI honouring `q`) → Post-implementation. ✓

**Placeholder scan:** none — all code shown in full.

**Type consistency:** `searchByImage(imageUrl: string, query?: string)` is the signature added in Task 1 and called with two args in Task 2 and the tests. The query source `tags.searchQuery || tags.suggestedName` matches the `TagResult` fields (`searchQuery: string`, `suggestedName: string`) returned by `tagImage`.
