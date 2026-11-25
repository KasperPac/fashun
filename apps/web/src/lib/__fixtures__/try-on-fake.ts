/**
 * In-memory stand-in for Supabase (tables, private storage buckets, the service
 * client and the try_on_reserve function) for the try-on tests. It does not apply
 * row-level security; the routes' own user scoping is what the tests exercise.
 */
type Row = Record<string, unknown>
type Bucket = Map<string, Uint8Array>

export const A = '00000000-0000-4000-8000-00000000000a'
export const B = '00000000-0000-4000-8000-00000000000b'

class Fake {
  tables: Record<string, Row[]> = {}
  buckets: Record<string, Bucket> = {}
  currentUser: string | null = A
  rpcCalls: Array<Record<string, unknown>> = []
  uploadError = false
  /** How many updates to the ledger fail before they work again. */
  ledgerUpdateFailures = 0

  reset() {
    this.tables = { users: [], outfits: [], wardrobe_items: [], try_on_ledger: [] }
    this.buckets = { 'try-on-photos': new Map(), 'wardrobe-images': new Map() }
    this.currentUser = A
    this.rpcCalls = []
    this.uploadError = false
    this.ledgerUpdateFailures = 0
  }

  private from(table: string) {
    let rows = this.tables[table] ?? []
    let op: 'select' | 'update' | 'delete' = 'select'
    let patch: Row = {}
    const chain: Record<string, unknown> = {}
    const done = () => {
      if (op === 'update' && table === 'try_on_ledger' && this.ledgerUpdateFailures > 0) {
        this.ledgerUpdateFailures -= 1
        return { data: [] as Row[], error: { message: 'ledger update failed' } }
      }
      if (op === 'update') rows.forEach((r) => Object.assign(r, patch))
      if (op === 'delete') this.tables[table] = this.tables[table].filter((r) => !rows.includes(r))
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    const filter = (fn: (r: Row) => boolean) => { rows = rows.filter(fn); return chain }
    chain.select = () => chain
    chain.update = (p: Row) => { op = 'update'; patch = p; return chain }
    chain.delete = () => { op = 'delete'; return chain }
    chain.order = () => chain
    chain.eq = (c: string, v: unknown) => filter((r) => r[c] === v)
    chain.in = (c: string, v: unknown[]) => filter((r) => v.includes(r[c]))
    chain.not = (c: string, _op: string, v: unknown) => filter((r) => r[c] !== v)
    chain.maybeSingle = () => Promise.resolve({ data: done().data[0] ?? null, error: null })
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(done()).then(resolve)
    return chain
  }

  private storage() {
    return {
      from: (name: string) => {
        const b = this.buckets[name]
        const mine = (p: string) => this.currentUser !== null && p.startsWith(`${this.currentUser}/`)
        return {
          download: async (path: string) => {
            const bytes = b.get(path)
            return bytes && mine(path)
              ? { data: new Blob([bytes as BlobPart]), error: null }
              : { data: null, error: { message: 'not found' } }
          },
          upload: async (path: string, body: Uint8Array) => {
            if (this.uploadError || !mine(path)) return { data: null, error: { message: 'denied' } }
            b.set(path, new Uint8Array(body))
            return { data: { path }, error: null }
          },
          remove: async (paths: string[]) => {
            paths.filter(mine).forEach((p) => b.delete(p))
            return { data: [], error: null }
          },
          list: async (folder: string, opts?: { limit?: number; offset?: number }) => {
            const names = [...b.keys()].filter((p) => p.startsWith(`${folder}/`) && mine(p)).map((p) => ({ name: p.slice(folder.length + 1) }))
            const off = opts?.offset ?? 0
            return { data: names.slice(off, off + (opts?.limit ?? 100)), error: null }
          },
          createSignedUrl: async (path: string, _seconds?: number) =>
            b.has(path) && mine(path)
              ? { data: { signedUrl: `https://signed.example/${name}/${path}` }, error: null }
              : { data: null, error: { message: 'not found' } },
        }
      },
    }
  }

  userClient() {
    return {
      auth: { getUser: async () => ({ data: { user: this.currentUser ? { id: this.currentUser } : null } }) },
      from: (t: string) => this.from(t),
      storage: this.storage(),
    }
  }

  /** Mirrors the SQL function try_on_reserve in 010_try_on_outfit_step.sql. */
  serviceClient() {
    return {
      from: (t: string) => this.from(t),
      rpc: async (name: string, args: Record<string, unknown>) => {
        this.rpcCalls.push({ name, ...args })
        const steps = args.p_steps as string[]
        // Each row counts at the price it was made at; rows from before prices were stored are FASHN images at 750.
        const spent = this.tables.try_on_ledger
          .filter((r) => r.month === args.p_month)
          .reduce((sum, r) => sum + Number(r.price_units ?? 750), 0)
        if (spent + steps.length * Number(args.p_price_units) > Number(args.p_cap_units)) return { data: null, error: null }
        const batch = crypto.randomUUID()
        const ids = steps.map((step) => {
          const id = crypto.randomUUID()
          this.tables.try_on_ledger.push({
            id, batch_id: batch, user_id: args.p_user, outfit_id: args.p_outfit, month: args.p_month, step,
            status: 'reserved', picture_made: false, price_units: args.p_price_units,
          })
          return id
        })
        return { data: ids, error: null }
      },
    }
  }
}

export const fake = new Fake()
