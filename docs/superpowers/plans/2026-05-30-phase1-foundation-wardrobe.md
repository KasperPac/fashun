# Fashun Phase 1: Foundation & Wardrobe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Turborepo monorepo, wire up Supabase auth with invite-only signup, implement the 5-step onboarding flow, and deliver a fully working wardrobe screen where users can add/view/delete items via mobile camera, web upload, or in-app save.

**Architecture:** Turborepo monorepo with `apps/web` (Next.js 15 App Router on Vercel), `apps/mobile` (Expo SDK 52), and `packages/shared` (TypeScript types + pure business logic). Both apps call the same Next.js API routes. Supabase provides auth, Postgres, and file storage.

**Tech Stack:** pnpm + Turborepo · Next.js 15 App Router · Expo SDK 52 · Supabase JS v2 · Tailwind CSS + NativeWind · Zod · Vitest · Claude API (Vision) · Photoroom API

**Phase scope note:** This is Phase 1 of 4. Subsequent plans cover: Phase 2 (Colour Palette), Phase 3 (AI Outfits + Try-On), Phase 4 (Shop + Affiliate).

---

## Environment Variables

Create `apps/web/.env.local` before starting:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PHOTOROOM_API_KEY=<photoroom-key>
ANTHROPIC_API_KEY=<anthropic-key>
```

---

## Task 0: Monorepo Scaffold

**Goal:** Working Turborepo monorepo with Next.js web app, Expo mobile app, and shared types package — all compiling cleanly.

**Files:**
- Create: `turbo.json`
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `apps/web/` (Next.js 15)
- Create: `apps/mobile/` (Expo SDK 52)
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/palette.ts`

**Acceptance Criteria:**
- [ ] `pnpm dev` starts both web (port 3000) and mobile (Expo Metro)
- [ ] `packages/shared` types are importable from both apps with no TS errors
- [ ] `pnpm build` completes without errors

**Verify:** `pnpm --filter shared build` → `dist/index.js` generated

**Steps:**

- [ ] **Step 1: Init monorepo**

```bash
cd C:\dev\fashun
pnpm init
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Create root `package.json`:
```json
{
  "name": "fashun",
  "private": true,
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "prettier": "^3.2.0"
  }
}
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 2: Scaffold Next.js web app**

```bash
cd apps
pnpm dlx create-next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

Add to `apps/web/package.json` dependencies:
```json
{
  "@supabase/supabase-js": "^2.43.0",
  "@supabase/ssr": "^0.4.0",
  "zod": "^3.23.0",
  "@fashun/shared": "workspace:*"
}
```

- [ ] **Step 3: Scaffold Expo mobile app**

```bash
cd apps
pnpm dlx create-expo-app@latest mobile --template blank-typescript
cd mobile
pnpm add @supabase/supabase-js zod nativewind @fashun/shared@workspace:*
pnpm add -D tailwindcss
```

- [ ] **Step 4: Create shared package**

Create `packages/shared/package.json`:
```json
{
  "name": "@fashun/shared",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Create `packages/shared/src/types.ts`:
```typescript
export type SkinUndertone = 'warm' | 'cool' | 'neutral'
export type SkinDepth = 'light' | 'medium' | 'deep'
export type ColourSeason = 'spring' | 'summer' | 'autumn' | 'winter'
export type StylePref =
  | 'casual' | 'smart-casual' | 'business' | 'streetwear'
  | 'minimalist' | 'athleisure' | 'bohemian' | 'glam'
export type WardrobeCategory = 'tops' | 'bottoms' | 'shoes' | 'outerwear' | 'bags' | 'accessories'
export type OccasionTag = 'work' | 'casual' | 'dinner' | 'event'
export type Ownership = 'owned' | 'wishlist'

export interface CategoryBudgets {
  tops: [number, number]
  bottoms: [number, number]
  shoes: [number, number]
  outerwear: [number, number]
  bags: [number, number]
  accessories: [number, number]
}

export const DEFAULT_BUDGETS: CategoryBudgets = {
  tops: [20, 150],
  bottoms: [30, 200],
  shoes: [50, 350],
  outerwear: [80, 500],
  bags: [40, 300],
  accessories: [10, 100],
}

export interface UserProfile {
  id: string
  email: string
  skinUndertone?: SkinUndertone
  skinDepth?: SkinDepth
  colourSeason?: ColourSeason
  stylePrefs: StylePref[]
  budgets: CategoryBudgets
  tryOnPhotoUrl?: string
  onboardingCompletedAt?: string
  createdAt: string
}

export interface WardrobeItem {
  id: string
  userId: string
  ownership: Ownership
  category: WardrobeCategory
  name: string
  colours: string[]
  styleTags: string[]
  occasionTags: OccasionTag[]
  imageUrl: string
  storeUrl?: string
  affiliateUrl?: string
  price?: number
  retailer?: string
  lastWornAt?: string
  createdAt: string
}

export interface ProcessItemRequest {
  imageBase64: string  // full image before processing
}

export interface ProcessItemResponse {
  processedImageUrl: string  // transparent-bg PNG in Supabase Storage
  category: WardrobeCategory
  colours: string[]         // hex codes
  styleTags: string[]
  suggestedName: string
}
```

Create `packages/shared/src/palette.ts`:
```typescript
import type { ColourSeason, SkinDepth, SkinUndertone } from './types'

export function determineColourSeason(
  undertone: SkinUndertone,
  depth: SkinDepth
): ColourSeason {
  if (undertone === 'warm') return depth === 'light' ? 'spring' : 'autumn'
  if (undertone === 'cool') return depth === 'deep' ? 'winter' : 'summer'
  // neutral: depth as tiebreaker
  return depth === 'deep' ? 'winter' : 'spring'
}

export const SEASON_LABELS: Record<ColourSeason, string> = {
  spring: 'Warm Spring 🌸',
  summer: 'Cool Summer ☀️',
  autumn: 'Warm Autumn 🍂',
  winter: 'Cool Winter ❄️',
}
```

Create `packages/shared/src/index.ts`:
```typescript
export * from './types'
export * from './palette'
```

- [ ] **Step 5: Install and verify**

```bash
cd C:\dev\fashun
pnpm install
pnpm --filter shared build
```

Expected: `packages/shared/dist/` created with no TS errors.

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "feat: init Turborepo monorepo with Next.js, Expo, shared package"
```

---

## Task 1: Supabase Schema & Storage

**Goal:** Supabase project configured with full DB schema, RLS policies, storage buckets, and generated TypeScript types importable from `packages/shared`.

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/migrations/002_rls_policies.sql`
- Create: `supabase/migrations/003_storage_buckets.sql`
- Create: `packages/shared/src/database.types.ts` (generated)
- Create: `supabase/config.toml`

**Acceptance Criteria:**
- [ ] All 4 tables exist with correct columns and constraints
- [ ] RLS enabled — a user cannot read another user's wardrobe items
- [ ] `wardrobe-images` and `try-on-photos` storage buckets exist (private)
- [ ] Generated types in `packages/shared/src/database.types.ts`

**Verify:** `supabase db diff` → no pending changes

**Steps:**

- [ ] **Step 1: Install Supabase CLI and init**

```bash
pnpm add -D supabase --filter @fashun/shared
npx supabase init
```

- [ ] **Step 2: Create initial schema migration**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  skin_undertone TEXT CHECK (skin_undertone IN ('warm', 'cool', 'neutral')),
  skin_depth TEXT CHECK (skin_depth IN ('light', 'medium', 'deep')),
  colour_season TEXT CHECK (colour_season IN ('spring', 'summer', 'autumn', 'winter')),
  style_prefs TEXT[] DEFAULT '{}',
  budgets JSONB DEFAULT '{"tops":[20,150],"bottoms":[30,200],"shoes":[50,350],"outerwear":[80,500],"bags":[40,300],"accessories":[10,100]}',
  try_on_photo_url TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ownership TEXT NOT NULL CHECK (ownership IN ('owned', 'wishlist')),
  category TEXT NOT NULL CHECK (category IN ('tops','bottoms','shoes','outerwear','bags','accessories')),
  name TEXT NOT NULL,
  colours TEXT[] DEFAULT '{}',
  style_tags TEXT[] DEFAULT '{}',
  occasion_tags TEXT[] DEFAULT '{}',
  image_url TEXT NOT NULL,
  store_url TEXT,
  affiliate_url TEXT,
  price NUMERIC,
  retailer TEXT,
  last_worn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.outfits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT,
  item_ids UUID[] DEFAULT '{}',
  occasion TEXT CHECK (occasion IN ('work','casual','dinner','event')),
  ai_generated BOOLEAN DEFAULT FALSE,
  palette_match_pct INTEGER,
  try_on_image_url TEXT,
  worn_count INTEGER DEFAULT 0,
  last_worn_at TIMESTAMPTZ,
  last_recommended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  used_by UUID REFERENCES public.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 3: RLS policies**

Create `supabase/migrations/002_rls_policies.sql`:
```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "wardrobe_all_own" ON public.wardrobe_items FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "outfits_all_own" ON public.outfits FOR ALL USING (auth.uid() = user_id);

-- Anyone can read invite codes (to validate), only service role can insert
CREATE POLICY "invite_codes_select" ON public.invite_codes FOR SELECT USING (true);
```

- [ ] **Step 4: Storage buckets**

Create `supabase/migrations/003_storage_buckets.sql`:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('wardrobe-images', 'wardrobe-images', false),
  ('try-on-photos', 'try-on-photos', false);

-- Users can only access their own files (path format: {user_id}/{filename})
CREATE POLICY "wardrobe_images_user_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'wardrobe-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "try_on_photos_user_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'try-on-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 5: Push to Supabase and generate types**

```bash
# Link to your Supabase project (get project ref from dashboard)
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase gen types typescript --linked > packages/shared/src/database.types.ts
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: supabase schema, RLS policies, storage buckets"
```

---

## Task 2: Auth — Invite-Only Signup

**Goal:** Working signup and login flow for both web and mobile, gated by invite code. Authenticated session available to all API routes and mobile screens.

**Files:**
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/signup/page.tsx`
- Create: `apps/web/src/app/api/auth/invite/route.ts`
- Create: `apps/mobile/lib/supabase.ts`
- Create: `apps/mobile/app/(auth)/login.tsx`
- Test: `apps/web/src/app/api/auth/invite/route.test.ts`

**Acceptance Criteria:**
- [ ] Signup rejects with error if invite code is invalid/already used
- [ ] Signup creates user and marks invite code as used
- [ ] Login redirects to `/onboarding` if onboarding incomplete, `/wardrobe` if complete
- [ ] Unauthenticated requests to protected routes redirect to `/login`
- [ ] Mobile login stores session and persists across app restarts

**Verify:** `pnpm --filter web test src/app/api/auth/invite/` → all tests pass

**Steps:**

- [ ] **Step 1: Write invite validation test**

Create `apps/web/src/app/api/auth/invite/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSingle = vi.fn()
const mockUpdate = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: mockSingle }) }),
      update: () => ({ eq: () => mockUpdate() }),
    }),
  }),
}))

import { POST } from './route'

describe('POST /api/auth/invite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 if code is missing', async () => {
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 if code does not exist', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'INVALID' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 409 if code already used', async () => {
    mockSingle.mockResolvedValue({
      data: { id: '1', code: 'USED', used_by: 'some-user-id', used_at: new Date().toISOString() },
      error: null,
    })
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'USED' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })

  it('returns 200 for valid unused code', async () => {
    mockSingle.mockResolvedValue({
      data: { id: '1', code: 'VALID', used_by: null, used_at: null },
      error: null,
    })
    const req = new Request('http://localhost/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ code: 'VALID' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/web && pnpm vitest run src/app/api/auth/invite/route.test.ts
```
Expected: FAIL — `route.ts` does not exist yet.

- [ ] **Step 3: Create Supabase server client**

Create `apps/web/src/lib/supabase/server.ts`:
```typescript
import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@fashun/shared/database.types'

export function createServerClient() {
  const cookieStore = cookies()
  return _createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export function createServiceClient() {
  return _createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
```

Create `apps/web/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@fashun/shared/database.types'

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

- [ ] **Step 4: Create invite validation route**

Create `apps/web/src/app/api/auth/invite/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ code: z.string().min(1) })

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', parsed.data.code.toUpperCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }
  if (data.used_by) {
    return NextResponse.json({ error: 'Invite code already used' }, { status: 409 })
  }

  return NextResponse.json({ valid: true })
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd apps/web && pnpm vitest run src/app/api/auth/invite/route.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 6: Add Next.js middleware for protected routes**

Create `apps/web/src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/(auth)')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  const isPublicRoute = ['/login', '/signup'].includes(request.nextUrl.pathname)

  if (!user && !isPublicRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 7: Create signup page**

Create `apps/web/src/app/(auth)/signup/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate invite code first
    const inviteRes = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode }),
    })
    if (!inviteRes.ok) {
      const { error: msg } = await inviteRes.json()
      setError(msg)
      setLoading(false)
      return
    }

    const { error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">fashun</h1>
        <p className="text-zinc-500 mb-8 text-sm">You need an invite to join.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Invite code"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-zinc-600 text-sm mt-4 text-center">
          Already have an account?{' '}
          <a href="/login" className="text-purple-400 hover:underline">Log in</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: invite-only auth with signup/login and protected routes"
```

---

## Task 3: Onboarding Shell + Skin Tone Analysis

**Goal:** 5-step onboarding wizard UI with progress indicator, skin tone selfie upload, Claude Vision analysis, and colour season assignment stored to the user profile.

**Files:**
- Create: `apps/web/src/app/(app)/onboarding/layout.tsx`
- Create: `apps/web/src/app/(app)/onboarding/page.tsx` (step router)
- Create: `apps/web/src/app/(app)/onboarding/steps/SkinToneStep.tsx`
- Create: `apps/web/src/app/api/onboarding/skin-tone/route.ts`
- Create: `apps/web/src/app/api/onboarding/skin-tone/route.test.ts`
- Create: `packages/shared/src/palette.test.ts`

**Acceptance Criteria:**
- [ ] `determineColourSeason` returns correct season for all 9 input combos
- [ ] `/api/onboarding/skin-tone` returns `{ undertone, depth, season }` for a valid image
- [ ] Submitting the selfie updates `users.skin_undertone`, `users.skin_depth`, `users.colour_season`
- [ ] Progress bar shows correct step (1 of 5, 2 of 5, etc.)

**Verify:** `pnpm --filter shared test` → palette tests pass

**Steps:**

- [ ] **Step 1: Write palette unit tests**

Create `packages/shared/src/palette.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { determineColourSeason } from './palette'

describe('determineColourSeason', () => {
  it.each([
    ['warm', 'light', 'spring'],
    ['warm', 'medium', 'autumn'],
    ['warm', 'deep', 'autumn'],
    ['cool', 'light', 'summer'],
    ['cool', 'medium', 'summer'],
    ['cool', 'deep', 'winter'],
    ['neutral', 'light', 'spring'],
    ['neutral', 'medium', 'spring'],
    ['neutral', 'deep', 'winter'],
  ] as const)('%s + %s = %s', (undertone, depth, expected) => {
    expect(determineColourSeason(undertone, depth)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run palette tests**

```bash
pnpm --filter shared build
pnpm --filter shared test
```
Expected: 9 tests pass.

- [ ] **Step 3: Create skin tone API route**

Create `apps/web/src/app/api/onboarding/skin-tone/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { determineColourSeason } from '@fashun/shared'
import type { SkinUndertone, SkinDepth } from '@fashun/shared'
import { z } from 'zod'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const schema = z.object({
  imageBase64: z.string().min(100),
})

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid image' }, { status: 400 })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: parsed.data.imageBase64 },
        },
        {
          type: 'text',
          text: `Analyse this selfie photo for skin tone only. Respond with ONLY valid JSON in this exact format:
{"undertone": "warm|cool|neutral", "depth": "light|medium|deep"}
undertone: warm = yellow/olive/peachy, cool = pink/blue/rosy, neutral = mix of both.
depth: light = fair/light, medium = medium/tan/olive, deep = dark/deep brown.
No explanation, no markdown, just the JSON object.`,
        },
      ],
    }],
  })

  let undertone: SkinUndertone
  let depth: SkinDepth
  try {
    const parsed = JSON.parse((message.content[0] as { text: string }).text.trim())
    undertone = parsed.undertone
    depth = parsed.depth
  } catch {
    return NextResponse.json({ error: 'Could not analyse skin tone' }, { status: 422 })
  }

  const season = determineColourSeason(undertone, depth)

  await supabase
    .from('users')
    .update({ skin_undertone: undertone, skin_depth: depth, colour_season: season })
    .eq('id', user.id)

  return NextResponse.json({ undertone, depth, season })
}
```

- [ ] **Step 4: Create onboarding layout with progress bar**

Create `apps/web/src/app/(app)/onboarding/layout.tsx`:
```tsx
'use client'
import { usePathname } from 'next/navigation'

const STEPS = [
  { path: '/onboarding/skin-tone', label: 'Skin tone' },
  { path: '/onboarding/style', label: 'Your style' },
  { path: '/onboarding/budget', label: 'Budget' },
  { path: '/onboarding/add-items', label: 'Add items' },
]

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentStep = STEPS.findIndex(s => pathname.includes(s.path))
  const progress = ((currentStep + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="w-full h-1 bg-zinc-900">
        <div
          className="h-full bg-purple-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-black tracking-tight">fashun</span>
        <span className="text-zinc-500 text-sm">
          Step {currentStep + 1} of {STEPS.length}
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-lg mx-auto w-full">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create skin tone step UI**

Create `apps/web/src/app/(app)/onboarding/steps/SkinToneStep.tsx`:
```tsx
'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ColourSeason } from '@fashun/shared'
import { SEASON_LABELS } from '@fashun/shared'

export default function SkinToneStep() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<{ season: ColourSeason } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleAnalyse() {
    if (!preview) return
    setLoading(true)
    setError('')
    // Strip the data:image/...;base64, prefix
    const base64 = preview.split(',')[1]
    const res = await fetch('/api/onboarding/skin-tone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    setResult(data)
    setLoading(false)
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Your colour story starts here 🤳</h2>
        <p className="text-zinc-400 text-sm">
          Take a selfie in natural light so we can find your colour season.
          Your photo is analysed immediately and never stored.
        </p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 rounded-2xl h-52 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-500 transition-colors"
      >
        {preview ? (
          <img src={preview} alt="selfie preview" className="h-full w-full object-cover rounded-2xl" />
        ) : (
          <>
            <span className="text-4xl">👤</span>
            <span className="text-zinc-500 text-sm">Tap to upload selfie</span>
            <span className="text-zinc-700 text-xs">Good natural lighting works best</span>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {result && (
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-700">
          <p className="text-zinc-400 text-xs uppercase tracking-widest mb-1">Your season</p>
          <p className="text-xl font-bold text-purple-300">{SEASON_LABELS[result.season]}</p>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!result ? (
        <button
          onClick={handleAnalyse}
          disabled={!preview || loading}
          className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
        >
          {loading ? 'Analysing…' : 'Analyse my skin tone'}
        </button>
      ) : (
        <button
          onClick={() => router.push('/onboarding/style')}
          className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold"
        >
          Looks good — continue →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: onboarding shell + skin tone analysis with Claude Vision"
```

---

## Task 4: Onboarding — Style Preferences & Budgets

**Goal:** Steps 3 and 4 of onboarding: multi-select style archetypes and per-category budget sliders, both saved to the user profile.

**Files:**
- Create: `apps/web/src/app/(app)/onboarding/style/page.tsx`
- Create: `apps/web/src/app/(app)/onboarding/budget/page.tsx`
- Create: `apps/web/src/components/StyleGrid.tsx`
- Create: `apps/web/src/components/BudgetSliders.tsx`
- Create: `apps/web/src/app/api/onboarding/profile/route.ts`
- Test: `apps/web/src/app/api/onboarding/profile/route.test.ts`

**Acceptance Criteria:**
- [ ] Style grid allows selecting 1–8 archetypes, at least 1 required
- [ ] Budget sliders enforce min < max and min ≥ 0
- [ ] POST `/api/onboarding/profile` updates `style_prefs` and `budgets` in DB
- [ ] After budgets step, user is directed to `/onboarding/add-items`

**Verify:** `pnpm --filter web test src/app/api/onboarding/profile/` → all tests pass

**Steps:**

- [ ] **Step 1: Write profile update tests**

Create `apps/web/src/app/api/onboarding/profile/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdate = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ update: () => ({ eq: mockUpdate }) }),
  }),
}))

import { PATCH } from './route'

describe('PATCH /api/onboarding/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({ error: null })
  })

  it('rejects empty style_prefs', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ style_prefs: [] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('rejects invalid budget (min >= max)', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({
        budgets: { tops: [200, 50], bottoms: [30, 200], shoes: [50, 350], outerwear: [80, 500], bags: [40, 300], accessories: [10, 100] },
      }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('saves valid style prefs', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ style_prefs: ['casual', 'minimalist'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/web && pnpm vitest run src/app/api/onboarding/profile/
```
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Create profile PATCH route**

Create `apps/web/src/app/api/onboarding/profile/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { CategoryBudgets } from '@fashun/shared'

const StylePrefsSchema = z.array(
  z.enum(['casual','smart-casual','business','streetwear','minimalist','athleisure','bohemian','glam'])
).min(1, 'Select at least one style')

const BudgetRangeSchema = z.tuple([z.number().min(0), z.number()]).refine(
  ([min, max]) => min < max,
  { message: 'Min must be less than max' }
)

const BudgetsSchema = z.object({
  tops: BudgetRangeSchema,
  bottoms: BudgetRangeSchema,
  shoes: BudgetRangeSchema,
  outerwear: BudgetRangeSchema,
  bags: BudgetRangeSchema,
  accessories: BudgetRangeSchema,
})

const BodySchema = z.object({
  style_prefs: StylePrefsSchema.optional(),
  budgets: BudgetsSchema.optional(),
}).refine(data => data.style_prefs || data.budgets, {
  message: 'Provide style_prefs or budgets',
})

export async function PATCH(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.style_prefs) updates.style_prefs = parsed.data.style_prefs
  if (parsed.data.budgets) updates.budgets = parsed.data.budgets

  const { error } = await supabase.from('users').update(updates).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web && pnpm vitest run src/app/api/onboarding/profile/
```
Expected: 3 tests pass.

- [ ] **Step 5: Create StyleGrid component**

Create `apps/web/src/components/StyleGrid.tsx`:
```tsx
'use client'
import type { StylePref } from '@fashun/shared'

const STYLES: { value: StylePref; label: string; emoji: string; description: string }[] = [
  { value: 'casual', label: 'Casual', emoji: '👟', description: 'Everyday comfort' },
  { value: 'smart-casual', label: 'Smart Casual', emoji: '🧥', description: 'Polished but relaxed' },
  { value: 'business', label: 'Business', emoji: '👔', description: 'Professional & sharp' },
  { value: 'streetwear', label: 'Streetwear', emoji: '🧢', description: 'Urban & bold' },
  { value: 'minimalist', label: 'Minimalist', emoji: '🤍', description: 'Clean & simple' },
  { value: 'athleisure', label: 'Athleisure', emoji: '🏃', description: 'Active & sporty' },
  { value: 'bohemian', label: 'Bohemian', emoji: '🌸', description: 'Free & flowy' },
  { value: 'glam', label: 'Glam', emoji: '✨', description: 'Dressed up always' },
]

interface Props {
  selected: StylePref[]
  onChange: (prefs: StylePref[]) => void
}

export default function StyleGrid({ selected, onChange }: Props) {
  function toggle(value: StylePref) {
    onChange(
      selected.includes(value)
        ? selected.filter(s => s !== value)
        : [...selected, value]
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {STYLES.map(style => {
        const active = selected.includes(style.value)
        return (
          <button
            key={style.value}
            type="button"
            onClick={() => toggle(style.value)}
            className={`rounded-xl p-3 text-left border-2 transition-all ${
              active
                ? 'border-purple-500 bg-purple-950'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <div className="text-2xl mb-1">{style.emoji}</div>
            <div className={`font-bold text-sm ${active ? 'text-white' : 'text-zinc-400'}`}>
              {style.label}
            </div>
            <div className="text-zinc-600 text-xs mt-0.5">{style.description}</div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Create BudgetSliders component**

Create `apps/web/src/components/BudgetSliders.tsx`:
```tsx
'use client'
import type { CategoryBudgets, WardrobeCategory } from '@fashun/shared'
import { DEFAULT_BUDGETS } from '@fashun/shared'

const CATEGORY_META: { key: WardrobeCategory; label: string; emoji: string; max: number }[] = [
  { key: 'tops', label: 'Tops', emoji: '👔', max: 500 },
  { key: 'bottoms', label: 'Bottoms', emoji: '👖', max: 500 },
  { key: 'shoes', label: 'Shoes', emoji: '👟', max: 1000 },
  { key: 'outerwear', label: 'Outerwear', emoji: '🧥', max: 1000 },
  { key: 'bags', label: 'Bags', emoji: '👜', max: 800 },
  { key: 'accessories', label: 'Accessories', emoji: '💍', max: 300 },
]

interface Props {
  budgets: CategoryBudgets
  onChange: (budgets: CategoryBudgets) => void
}

export default function BudgetSliders({ budgets, onChange }: Props) {
  function updateRange(key: WardrobeCategory, index: 0 | 1, value: number) {
    const current = budgets[key]
    const next: [number, number] = index === 0
      ? [Math.min(value, current[1] - 10), current[1]]
      : [current[0], Math.max(value, current[0] + 10)]
    onChange({ ...budgets, [key]: next })
  }

  return (
    <div className="flex flex-col gap-5">
      {CATEGORY_META.map(({ key, label, emoji, max }) => (
        <div key={key}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span>{emoji}</span> {label}
            </span>
            <span className="text-xs text-zinc-400">
              ${budgets[key][0]} – ${budgets[key][1]}
            </span>
          </div>
          <div className="flex gap-3 items-center">
            <span className="text-xs text-zinc-600 w-4">$0</span>
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range" min={0} max={max} step={5}
                value={budgets[key][0]}
                onChange={e => updateRange(key, 0, Number(e.target.value))}
                className="w-full accent-amber-400"
              />
              <input
                type="range" min={0} max={max} step={5}
                value={budgets[key][1]}
                onChange={e => updateRange(key, 1, Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <span className="text-xs text-zinc-600 w-8">${max}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Wire up style + budget pages**

Create `apps/web/src/app/(app)/onboarding/style/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StyleGrid from '@/components/StyleGrid'
import type { StylePref } from '@fashun/shared'

export default function StylePage() {
  const router = useRouter()
  const [selected, setSelected] = useState<StylePref[]>(['casual'])
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    if (selected.length === 0) return
    setLoading(true)
    await fetch('/api/onboarding/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_prefs: selected }),
    })
    router.push('/onboarding/budget')
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">How do you dress? 👗</h2>
        <p className="text-zinc-400 text-sm">Pick all that apply — we'll tailor recommendations to your vibe.</p>
      </div>
      <StyleGrid selected={selected} onChange={setSelected} />
      <button
        onClick={handleContinue}
        disabled={selected.length === 0 || loading}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
      >
        Continue →
      </button>
    </div>
  )
}
```

Create `apps/web/src/app/(app)/onboarding/budget/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BudgetSliders from '@/components/BudgetSliders'
import { DEFAULT_BUDGETS } from '@fashun/shared'
import type { CategoryBudgets } from '@fashun/shared'

export default function BudgetPage() {
  const router = useRouter()
  const [budgets, setBudgets] = useState<CategoryBudgets>(DEFAULT_BUDGETS)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    setLoading(true)
    await fetch('/api/onboarding/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgets }),
    })
    router.push('/onboarding/add-items')
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black mb-1">Shopping budget 💛</h2>
        <p className="text-zinc-400 text-sm">We'll only show items in your range. Change anytime.</p>
      </div>
      <BudgetSliders budgets={budgets} onChange={setBudgets} />
      <button
        onClick={handleContinue}
        disabled={loading}
        className="bg-amber-400 hover:bg-amber-300 text-black rounded-xl py-3 font-bold disabled:opacity-50"
      >
        All set — continue →
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: onboarding style preferences and per-category budget sliders"
```

---

## Task 5: Wardrobe Screen

**Goal:** Wardrobe page showing all items in a grid, with category carousel filter and owned/wishlist toggle. Fully wired to Supabase, loading/empty states included.

**Files:**
- Create: `apps/web/src/app/(app)/wardrobe/page.tsx`
- Create: `apps/web/src/app/api/wardrobe/route.ts`
- Create: `apps/web/src/components/wardrobe/CategoryCarousel.tsx`
- Create: `apps/web/src/components/wardrobe/WardrobeGrid.tsx`
- Create: `apps/web/src/components/wardrobe/ItemCard.tsx`
- Create: `apps/web/src/components/wardrobe/OwnershipToggle.tsx`
- Test: `apps/web/src/app/api/wardrobe/route.test.ts`

**Acceptance Criteria:**
- [ ] GET `/api/wardrobe` returns only the authenticated user's items
- [ ] Category filter limits results to selected category (All = no filter)
- [ ] Ownership toggle switches between owned / wishlist views
- [ ] Empty state shown when no items match the current filter
- [ ] Delete button removes item from DB and grid

**Verify:** `pnpm --filter web test src/app/api/wardrobe/` → all tests pass

**Steps:**

- [ ] **Step 1: Write wardrobe API tests**

Create `apps/web/src/app/api/wardrobe/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockItems = [
  { id: '1', user_id: 'user-1', category: 'tops', ownership: 'owned', name: 'White Tee', colours: ['#ffffff'], style_tags: ['casual'], occasion_tags: ['casual'], image_url: 'https://example.com/1.png', created_at: '2026-01-01' },
  { id: '2', user_id: 'user-1', category: 'shoes', ownership: 'wishlist', name: 'Sneakers', colours: ['#000000'], style_tags: ['casual'], occasion_tags: ['casual'], image_url: 'https://example.com/2.png', created_at: '2026-01-02' },
]

const mockQuery = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ select: () => ({ eq: mockQuery }) }),
  }),
}))

import { GET } from './route'

describe('GET /api/wardrobe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns items for authenticated user', async () => {
    mockQuery.mockResolvedValue({ data: mockItems, error: null })
    const req = new Request('http://localhost/api/wardrobe')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toHaveLength(2)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(vi.fn()).mockResolvedValueOnce({ data: { user: null } })
    // Re-mock for this test
    const { createServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
    const req = new Request('http://localhost/api/wardrobe')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Create wardrobe API route**

Create `apps/web/src/app/api/wardrobe/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { WardrobeItem } from '@fashun/shared'

export async function GET(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  const ownership = url.searchParams.get('ownership') ?? 'owned'

  let query = supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('ownership', ownership)
    .order('created_at', { ascending: false })

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data as WardrobeItem[] })
}

export async function DELETE(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)  // RLS + explicit filter

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create CategoryCarousel component**

Create `apps/web/src/components/wardrobe/CategoryCarousel.tsx`:
```tsx
'use client'
import type { WardrobeCategory } from '@fashun/shared'

type CategoryOption = WardrobeCategory | 'all'

const CATEGORIES: { value: CategoryOption; label: string; emoji: string }[] = [
  { value: 'all', label: 'All', emoji: '' },
  { value: 'tops', label: 'Tops', emoji: '👔' },
  { value: 'bottoms', label: 'Bottoms', emoji: '👖' },
  { value: 'shoes', label: 'Shoes', emoji: '👟' },
  { value: 'outerwear', label: 'Outerwear', emoji: '🧥' },
  { value: 'bags', label: 'Bags', emoji: '👜' },
  { value: 'accessories', label: 'Accessories', emoji: '💍' },
]

interface Props {
  active: CategoryOption
  onChange: (cat: CategoryOption) => void
}

export default function CategoryCarousel({ active, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onChange(cat.value)}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
            active === cat.value
              ? 'bg-purple-600 text-white'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
          {cat.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create ItemCard and WardrobeGrid**

Create `apps/web/src/components/wardrobe/ItemCard.tsx`:
```tsx
'use client'
import type { WardrobeItem } from '@fashun/shared'

interface Props {
  item: WardrobeItem
  onDelete: (id: string) => void
}

export default function ItemCard({ item, onDelete }: Props) {
  return (
    <div className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-[3/4]">
      <img
        src={item.imageUrl}
        alt={item.name}
        className="w-full h-full object-contain p-2"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-white text-xs font-semibold truncate">{item.name}</p>
        <div className="flex gap-1 mt-1">
          {item.colours.slice(0, 3).map(c => (
            <div key={c} className="w-3 h-3 rounded-full border border-white/20" style={{ background: c }} />
          ))}
        </div>
      </div>
      <button
        onClick={() => onDelete(item.id)}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600/80 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
      >
        ×
      </button>
      {item.ownership === 'wishlist' && (
        <div className="absolute top-2 left-2 bg-amber-400/90 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          WISHLIST
        </div>
      )}
    </div>
  )
}
```

Create `apps/web/src/components/wardrobe/WardrobeGrid.tsx`:
```tsx
'use client'
import type { WardrobeItem } from '@fashun/shared'
import ItemCard from './ItemCard'

interface Props {
  items: WardrobeItem[]
  loading: boolean
  onDelete: (id: string) => void
}

export default function WardrobeGrid({ items, loading, onDelete }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-xl bg-zinc-900 animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="text-5xl">👗</span>
        <p className="text-zinc-400 text-sm">No items here yet</p>
        <p className="text-zinc-600 text-xs">Add clothes using the button below</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(item => (
        <ItemCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create wardrobe page**

Create `apps/web/src/app/(app)/wardrobe/page.tsx`:
```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import type { WardrobeItem, WardrobeCategory } from '@fashun/shared'
import CategoryCarousel from '@/components/wardrobe/CategoryCarousel'
import WardrobeGrid from '@/components/wardrobe/WardrobeGrid'
import OwnershipToggle from '@/components/wardrobe/OwnershipToggle'

type CategoryOption = WardrobeCategory | 'all'

export default function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryOption>('all')
  const [ownership, setOwnership] = useState<'owned' | 'wishlist'>('owned')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ ownership })
    if (category !== 'all') params.set('category', category)
    const res = await fetch(`/api/wardrobe?${params}`)
    const { items } = await res.json()
    setItems(items ?? [])
    setLoading(false)
  }, [category, ownership])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleDelete(id: string) {
    await fetch('/api/wardrobe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black tracking-tight">My Wardrobe</h1>
          <span className="text-zinc-500 text-sm">{items.length} items</span>
        </div>
        <OwnershipToggle active={ownership} onChange={setOwnership} />
        <div className="mt-3">
          <CategoryCarousel active={category} onChange={setCategory} />
        </div>
      </div>
      <div className="flex-1 px-4 pb-24">
        <WardrobeGrid items={items} loading={loading} onDelete={handleDelete} />
      </div>
      <div className="fixed bottom-6 inset-x-4">
        <a
          href="/wardrobe/add"
          className="block bg-purple-600 hover:bg-purple-500 text-white text-center rounded-2xl py-4 font-bold text-sm shadow-xl shadow-purple-900/50"
        >
          📸 Add Item
        </a>
      </div>
    </div>
  )
}
```

Create `apps/web/src/components/wardrobe/OwnershipToggle.tsx`:
```tsx
'use client'
interface Props {
  active: 'owned' | 'wishlist'
  onChange: (v: 'owned' | 'wishlist') => void
}
export default function OwnershipToggle({ active, onChange }: Props) {
  return (
    <div className="flex bg-zinc-900 rounded-xl p-1 gap-1">
      {(['owned', 'wishlist'] as const).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
            active === v ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {v === 'owned' ? '👗 Owned' : '💛 Wishlist'}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: wardrobe screen with category carousel and owned/wishlist toggle"
```

---

## Task 6: Add-Item Processing Pipeline (API)

**Goal:** `/api/wardrobe/process` accepts a base64 image, removes the background via Photoroom, tags it via Claude Vision, uploads to Supabase Storage, and returns structured item data ready to confirm.

**Files:**
- Create: `apps/web/src/app/api/wardrobe/process/route.ts`
- Create: `apps/web/src/lib/photoroom.ts`
- Create: `apps/web/src/lib/tagger.ts`
- Test: `apps/web/src/lib/tagger.test.ts`

**Acceptance Criteria:**
- [ ] Background removed from test image (transparent PNG returned)
- [ ] Claude Vision returns valid `category`, `colours`, `styleTags`, `suggestedName`
- [ ] Processed image uploaded to `wardrobe-images/{userId}/{uuid}.png` in Supabase Storage
- [ ] Returns `ProcessItemResponse` on success
- [ ] If Photoroom fails, returns `{ error: 'bg_removal_failed' }` with status 502
- [ ] If Claude Vision fails, returns partial result with empty tags (not a hard failure)

**Verify:** `pnpm --filter web test src/lib/tagger.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write tagger unit tests**

Create `apps/web/src/lib/tagger.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{
          text: JSON.stringify({
            category: 'tops',
            colours: ['#1a1a6e', '#ffffff'],
            styleTags: ['casual', 'smart-casual'],
            suggestedName: 'Navy Linen Shirt',
          })
        }]
      })
    }
  }
}))

import { tagImage } from './tagger'

describe('tagImage', () => {
  it('returns structured tags from Claude', async () => {
    const result = await tagImage('base64imagedata')
    expect(result.category).toBe('tops')
    expect(result.colours).toContain('#1a1a6e')
    expect(result.styleTags).toContain('casual')
    expect(result.suggestedName).toBe('Navy Linen Shirt')
  })

  it('returns fallback when Claude response is malformed', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    vi.mocked(new Anthropic().messages.create).mockResolvedValueOnce({
      content: [{ text: 'not json' }]
    } as never)
    const result = await tagImage('base64imagedata')
    expect(result.category).toBe('tops') // fallback default
    expect(result.colours).toEqual([])
    expect(result.styleTags).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web && pnpm vitest run src/lib/tagger.test.ts
```

- [ ] **Step 3: Create tagger module**

Create `apps/web/src/lib/tagger.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { WardrobeCategory } from '@fashun/shared'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface TagResult {
  category: WardrobeCategory
  colours: string[]   // hex codes
  styleTags: string[]
  suggestedName: string
}

const FALLBACK: TagResult = {
  category: 'tops',
  colours: [],
  styleTags: [],
  suggestedName: 'My item',
}

export async function tagImage(imageBase64: string): Promise<TagResult> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Analyse this clothing item image. Return ONLY valid JSON:
{
  "category": "tops|bottoms|shoes|outerwear|bags|accessories",
  "colours": ["#hexcode1", "#hexcode2"],
  "styleTags": ["casual|smart-casual|business|streetwear|minimalist|athleisure|bohemian|glam"],
  "suggestedName": "Short descriptive name e.g. Navy Linen Shirt"
}
No markdown, no explanation, just the JSON.`,
          },
        ],
      }],
    })

    const text = (message.content[0] as { text: string }).text.trim()
    const parsed = JSON.parse(text)
    return {
      category: parsed.category ?? FALLBACK.category,
      colours: Array.isArray(parsed.colours) ? parsed.colours : [],
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      suggestedName: parsed.suggestedName ?? FALLBACK.suggestedName,
    }
  } catch {
    return FALLBACK
  }
}
```

- [ ] **Step 4: Create Photoroom client**

Create `apps/web/src/lib/photoroom.ts`:
```typescript
export class PhotoroomError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoroomError'
  }
}

/**
 * Remove background from an image using Photoroom API.
 * Returns base64-encoded transparent PNG.
 */
export async function removeBackground(imageBase64: string): Promise<string> {
  const blob = base64ToBlob(imageBase64, 'image/jpeg')
  const form = new FormData()
  form.append('image_file', blob, 'image.jpg')

  const res = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY! },
    body: form,
  })

  if (!res.ok) {
    throw new PhotoroomError(`Photoroom API error: ${res.status}`)
  }

  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Buffer.from(base64, 'base64')
  return new Blob([bytes], { type: mimeType })
}
```

- [ ] **Step 5: Create process route**

Create `apps/web/src/app/api/wardrobe/process/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { removeBackground, PhotoroomError } from '@/lib/photoroom'
import { tagImage } from '@/lib/tagger'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const schema = z.object({ imageBase64: z.string().min(100) })

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid image' }, { status: 400 })

  // 1. Remove background
  let processedBase64: string
  try {
    processedBase64 = await removeBackground(parsed.data.imageBase64)
  } catch (err) {
    if (err instanceof PhotoroomError) {
      return NextResponse.json({ error: 'bg_removal_failed' }, { status: 502 })
    }
    throw err
  }

  // 2. Tag the processed image (soft failure — returns fallback)
  const tags = await tagImage(processedBase64)

  // 3. Upload to Supabase Storage
  const filename = `${user.id}/${randomUUID()}.png`
  const imageBytes = Buffer.from(processedBase64, 'base64')
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('wardrobe-images')
    .upload(filename, imageBytes, { contentType: 'image/png', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('wardrobe-images')
    .getPublicUrl(filename)

  return NextResponse.json({
    processedImageUrl: publicUrl,
    category: tags.category,
    colours: tags.colours,
    styleTags: tags.styleTags,
    suggestedName: tags.suggestedName,
  })
}
```

- [ ] **Step 6: Run tagger tests — expect PASS**

```bash
cd apps/web && pnpm vitest run src/lib/tagger.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add-item processing pipeline (BG removal + Claude Vision tagging)"
```

---

## Task 7: Add Item — Web Upload

**Goal:** Web "Add Item" page with drag-and-drop file upload, preview of processed result, editable tags, and save to wardrobe.

**Files:**
- Create: `apps/web/src/app/(app)/wardrobe/add/page.tsx`
- Create: `apps/web/src/components/wardrobe/AddItemForm.tsx`
- Create: `apps/web/src/components/wardrobe/ProcessingQueue.tsx`
- Modify: `apps/web/src/app/api/wardrobe/route.ts` (add POST handler)

**Acceptance Criteria:**
- [ ] User can drag & drop or click to select an image
- [ ] Processing state shown while pipeline runs
- [ ] Processed image + auto-tags displayed for confirmation
- [ ] User can edit name, category, and style tags before saving
- [ ] POST `/api/wardrobe` saves item to DB
- [ ] After save, redirects to `/wardrobe`
- [ ] Bulk: multiple files can be selected and queued

**Verify:** Manual test — upload an image, confirm tags appear, save redirects to wardrobe

**Steps:**

- [ ] **Step 1: Add POST handler to wardrobe route**

Add to `apps/web/src/app/api/wardrobe/route.ts`:
```typescript
import type { WardrobeItem, WardrobeCategory, OccasionTag } from '@fashun/shared'

const CreateItemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['tops','bottoms','shoes','outerwear','bags','accessories']),
  colours: z.array(z.string()).default([]),
  styleTags: z.array(z.string()).default([]),
  occasionTags: z.array(z.enum(['work','casual','dinner','event'])).default([]),
  imageUrl: z.string().url(),
  ownership: z.enum(['owned', 'wishlist']).default('owned'),
  storeUrl: z.string().url().optional(),
  price: z.number().optional(),
  retailer: z.string().optional(),
})

export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      category: parsed.data.category,
      colours: parsed.data.colours,
      style_tags: parsed.data.styleTags,
      occasion_tags: parsed.data.occasionTags,
      image_url: parsed.data.imageUrl,
      ownership: parsed.data.ownership,
      store_url: parsed.data.storeUrl,
      price: parsed.data.price,
      retailer: parsed.data.retailer,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}
```

- [ ] **Step 2: Create AddItemForm component**

Create `apps/web/src/components/wardrobe/AddItemForm.tsx`:
```tsx
'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WardrobeCategory, StylePref } from '@fashun/shared'

type ProcessResult = {
  processedImageUrl: string
  category: WardrobeCategory
  colours: string[]
  styleTags: string[]
  suggestedName: string
}

export default function AddItemForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'processing' | 'confirming' | 'saving'>('idle')
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<WardrobeCategory>('tops')
  const [error, setError] = useState('')

  async function processFile(file: File) {
    setState('processing')
    setError('')
    const base64 = await fileToBase64(file)
    const res = await fetch('/api/wardrobe/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Processing failed'); setState('idle'); return }
    setResult(data)
    setName(data.suggestedName)
    setCategory(data.category)
    setState('confirming')
  }

  async function handleSave() {
    if (!result) return
    setState('saving')
    await fetch('/api/wardrobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        colours: result.colours,
        styleTags: result.styleTags,
        imageUrl: result.processedImageUrl,
        ownership: 'owned',
      }),
    })
    router.push('/wardrobe')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  if (state === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Removing background and tagging item…</p>
      </div>
    )
  }

  if (state === 'confirming' && result) {
    return (
      <div className="flex flex-col gap-5">
        <img src={result.processedImageUrl} alt="Processed" className="w-40 h-52 object-contain mx-auto bg-zinc-900 rounded-xl" />
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as WardrobeCategory)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white"
          >
            {['tops','bottoms','shoes','outerwear','bags','accessories'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setState('idle')} className="flex-1 bg-zinc-900 text-zinc-400 rounded-xl py-3 font-bold">
            ← Redo
          </button>
          <button
            onClick={handleSave}
            disabled={state === 'saving'}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {state === 'saving' ? 'Saving…' : '✓ Save to Wardrobe'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 rounded-2xl h-52 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-purple-500 transition-colors"
      >
        <span className="text-4xl">📂</span>
        <span className="text-zinc-400 text-sm font-semibold">Drop photo here or click to browse</span>
        <span className="text-zinc-600 text-xs">JPG or PNG — works best on a neutral background</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 3: Create Add Item page**

Create `apps/web/src/app/(app)/wardrobe/add/page.tsx`:
```tsx
import AddItemForm from '@/components/wardrobe/AddItemForm'

export default function AddItemPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <a href="/wardrobe" className="text-zinc-500 hover:text-white">←</a>
        <h1 className="text-xl font-black">Add Item</h1>
      </div>
      <AddItemForm />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: web upload add-item flow with drag-and-drop and tag confirmation"
```

---

## Task 8: Add Item — Mobile Camera Flow

**Goal:** Expo mobile camera screen that captures a photo, sends it through the processing pipeline, and saves the confirmed item to the wardrobe.

**Files:**
- Create: `apps/mobile/app/(tabs)/wardrobe/add.tsx`
- Create: `apps/mobile/components/CameraCapture.tsx`
- Create: `apps/mobile/components/ConfirmItem.tsx`
- Create: `apps/mobile/lib/api.ts`

**Acceptance Criteria:**
- [ ] Camera permission requested on first launch
- [ ] Photo captured and sent to `/api/wardrobe/process`
- [ ] Processed image + tags displayed for confirmation
- [ ] User can edit name and category before saving
- [ ] On save, item appears in wardrobe screen
- [ ] If camera permission denied, shows file picker fallback

**Verify:** Manual test on iOS/Android simulator — capture → process → confirm → item in wardrobe

**Steps:**

- [ ] **Step 1: Install Expo camera dependencies**

```bash
cd apps/mobile
npx expo install expo-camera expo-image-picker expo-file-system
```

- [ ] **Step 2: Create API helper**

Create `apps/mobile/lib/api.ts`:
```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

export async function processImage(imageUri: string): Promise<{
  processedImageUrl: string
  category: string
  colours: string[]
  styleTags: string[]
  suggestedName: string
}> {
  const base64 = await uriToBase64(imageUri)
  const res = await fetch(`${API_BASE}/api/wardrobe/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64 }),
  })
  if (!res.ok) throw new Error('Processing failed')
  return res.json()
}

export async function saveWardrobeItem(item: {
  name: string
  category: string
  colours: string[]
  styleTags: string[]
  imageUrl: string
  ownership: 'owned' | 'wishlist'
}) {
  const res = await fetch(`${API_BASE}/api/wardrobe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!res.ok) throw new Error('Save failed')
  return res.json()
}

async function uriToBase64(uri: string): Promise<string> {
  const { FileSystem } = await import('expo-file-system')
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return base64
}
```

- [ ] **Step 3: Create CameraCapture component**

Create `apps/mobile/components/CameraCapture.tsx`:
```tsx
import { useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'

interface Props {
  onCapture: (uri: string) => void
}

export default function CameraCapture({ onCapture }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)

  async function takePhoto() {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 })
    if (photo?.uri) onCapture(photo.uri)
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      onCapture(result.assets[0].uri)
    }
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>Camera access needed to photograph your clothes</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={pickFromLibrary}>
          <Text style={styles.secondaryButtonText}>Pick from library instead</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.guide} />
          <Text style={styles.hint}>Fit your garment in the frame</Text>
        </View>
      </CameraView>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.libraryBtn} onPress={pickFromLibrary}>
          <Text style={styles.libraryBtnText}>📁</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>
        <View style={{ width: 44 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20 },
  guide: { position: 'absolute', inset: 40, borderWidth: 1, borderColor: 'rgba(108,99,255,0.5)', borderRadius: 12 },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 24, backgroundColor: '#000' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  libraryBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  libraryBtnText: { fontSize: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#000', gap: 16 },
  subtitle: { color: '#666', textAlign: 'center', fontSize: 14 },
  button: { backgroundColor: '#6c63ff', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { paddingVertical: 8 },
  secondaryButtonText: { color: '#666', fontSize: 13 },
})
```

- [ ] **Step 4: Create mobile add screen**

Create `apps/mobile/app/(tabs)/wardrobe/add.tsx`:
```tsx
import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import CameraCapture from '@/components/CameraCapture'
import { processImage, saveWardrobeItem } from '@/lib/api'

type Stage = 'camera' | 'processing' | 'confirming' | 'saving'

export default function AddItemScreen() {
  const [stage, setStage] = useState<Stage>('camera')
  const [result, setResult] = useState<Awaited<ReturnType<typeof processImage>> | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleCapture(uri: string) {
    setStage('processing')
    try {
      const data = await processImage(uri)
      setResult(data)
      setName(data.suggestedName)
      setStage('confirming')
    } catch (e) {
      setError('Processing failed — try again')
      setStage('camera')
    }
  }

  async function handleSave() {
    if (!result) return
    setStage('saving')
    await saveWardrobeItem({
      name,
      category: result.category,
      colours: result.colours,
      styleTags: result.styleTags,
      imageUrl: result.processedImageUrl,
      ownership: 'owned',
    })
    router.replace('/(tabs)/wardrobe')
  }

  if (stage === 'camera') return <CameraCapture onCapture={handleCapture} />

  if (stage === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6c63ff" size="large" />
        <Text style={styles.subtitle}>Removing background and tagging…</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Confirm item</Text>
      {result && (
        <Image source={{ uri: result.processedImageUrl }} style={styles.preview} resizeMode="contain" />
      )}
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor="#444"
      />
      <TouchableOpacity
        style={[styles.button, stage === 'saving' && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={stage === 'saving'}
      >
        <Text style={styles.buttonText}>{stage === 'saving' ? 'Saving…' : '✓ Save to Wardrobe'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  preview: { width: '100%', height: 240, backgroundColor: '#111', borderRadius: 16 },
  label: { color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 14, color: '#fff' },
  button: { backgroundColor: '#6c63ff', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  subtitle: { color: '#666', fontSize: 13 },
})
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: mobile camera add-item flow with Expo Camera"
```

---

## Task 9: Save from Store (In-App Wishlist Save)

**Goal:** "Save" button on any product card adds the item to the user's Wishlist section of the wardrobe. Covers the in-app flow; Share Sheet / bookmarklet are Phase 4 scope.

**Files:**
- Create: `apps/web/src/components/wardrobe/SaveToWardrobeButton.tsx`
- Modify: `apps/web/src/app/api/wardrobe/route.ts` (already has POST — ensure wishlist ownership supported)

**Acceptance Criteria:**
- [ ] Saving a store item with `ownership: 'wishlist'` creates a `wardrobe_items` row
- [ ] Saved item appears under Wishlist tab in wardrobe
- [ ] Button shows "Saved ✓" after success and prevents duplicate saves
- [ ] Store URL and price saved alongside the item

**Verify:** Save a product → switch to Wishlist in wardrobe → item appears

**Steps:**

- [ ] **Step 1: Create SaveToWardrobeButton**

Create `apps/web/src/components/wardrobe/SaveToWardrobeButton.tsx`:
```tsx
'use client'
import { useState } from 'react'

interface Props {
  item: {
    name: string
    imageUrl: string
    storeUrl: string
    price?: number
    retailer?: string
    category: string
    colours?: string[]
  }
}

export default function SaveToWardrobeButton({ item }: Props) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleSave() {
    setStatus('saving')
    const res = await fetch('/api/wardrobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        category: item.category,
        colours: item.colours ?? [],
        styleTags: [],
        imageUrl: item.imageUrl,
        ownership: 'wishlist',
        storeUrl: item.storeUrl,
        price: item.price,
        retailer: item.retailer,
      }),
    })
    setStatus(res.ok ? 'saved' : 'error')
  }

  if (status === 'saved') {
    return (
      <button disabled className="bg-green-900 text-green-400 text-xs font-bold rounded-lg px-3 py-1.5">
        Saved ✓
      </button>
    )
  }

  return (
    <button
      onClick={handleSave}
      disabled={status === 'saving'}
      className="bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50"
    >
      {status === 'saving' ? '…' : status === 'error' ? 'Try again' : 'Save'}
    </button>
  )
}
```

- [ ] **Step 2: Verify POST route handles wishlist ownership**

The POST handler added in Task 7 already accepts `ownership: 'wishlist'` via Zod schema. Confirm by checking `apps/web/src/app/api/wardrobe/route.ts` — `ownership: z.enum(['owned', 'wishlist'])` should be present. No code change needed.

- [ ] **Step 3: Add a placeholder shop page to test with**

Create `apps/web/src/app/(app)/shop/page.tsx`:
```tsx
import SaveToWardrobeButton from '@/components/wardrobe/SaveToWardrobeButton'

// Placeholder products — replaced in Phase 4 with real Commission Factory feed
const DEMO_PRODUCTS = [
  {
    id: '1',
    name: 'Classic White Linen Shirt',
    imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&q=80',
    storeUrl: 'https://www.theiconic.com.au',
    price: 89,
    retailer: 'THE ICONIC',
    category: 'tops',
    colours: ['#ffffff', '#f5f5dc'],
  },
  {
    id: '2',
    name: 'Slim Fit Chinos',
    imageUrl: 'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=400&q=80',
    storeUrl: 'https://www.countryroad.com.au',
    price: 149,
    retailer: 'Country Road',
    category: 'bottoms',
    colours: ['#8B7355'],
  },
]

export default function ShopPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <h1 className="text-2xl font-black mb-6">Shop 🛍️</h1>
      <p className="text-zinc-500 text-sm mb-6">Australian retailers · filtered by your palette · Phase 1 demo</p>
      <div className="grid grid-cols-2 gap-4">
        {DEMO_PRODUCTS.map(product => (
          <div key={product.id} className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
            <img src={product.imageUrl} alt={product.name} className="w-full aspect-square object-cover" />
            <div className="p-3">
              <p className="text-sm font-semibold text-white truncate">{product.name}</p>
              <p className="text-xs text-zinc-500 mb-2">{product.retailer} · ${product.price}</p>
              <div className="flex gap-2">
                <SaveToWardrobeButton item={product} />
                <a
                  href={product.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-400 font-bold py-1.5 hover:underline"
                >
                  Buy AU →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: End-to-end verification**

1. Navigate to `/shop`
2. Click "Save" on a product
3. Button shows "Saved ✓"
4. Navigate to `/wardrobe`
5. Switch to "Wishlist" tab
6. Item appears with WISHLIST badge

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: save-to-wishlist from shop with SaveToWardrobeButton"
```

---

## Phase 1 Complete — Verification Checklist

Run all tests before marking Phase 1 done:

```bash
# Shared package tests
pnpm --filter shared test
# Expected: palette tests pass (9 tests)

# Web unit tests
pnpm --filter web test
# Expected: invite, skin-tone, profile, wardrobe, tagger tests all pass

# Build verification
pnpm build
# Expected: no TS errors
```

Manual smoke test:
1. Sign up with invite code → onboarding runs 5 steps
2. Upload a selfie → season assigned and shown
3. Pick style prefs → saved
4. Set budgets → saved
5. Navigate to wardrobe → empty state shown
6. Add item via web upload → processed, confirmed, appears in wardrobe
7. Save item from shop → appears in Wishlist
8. Delete item → removed from grid

---

## Next Steps — Phase 2 (Colour Palette)

Phase 2 spec covers:
- Palette tab with season badge + colour swatches
- Wardrobe match % calculation
- Clash detection (items outside season palette highlighted)
- Palette-aware filtering in wardrobe

Run: create spec `docs/superpowers/specs/2026-05-30-fashun-phase2-palette.md` then write Phase 2 plan.
