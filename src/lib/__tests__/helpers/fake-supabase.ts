// A minimal stand-in for the supabase-js query builder, for route tests.
// Every chained call (.select/.eq/.insert/...) is recorded; awaiting the chain
// logs the query and resolves to what `resolve` returns for it.

export type Op = { method: string; args: unknown[] }
export type Query = { table: string; ops: Op[] }
export type QueryResult = { data?: unknown; error?: unknown; count?: number | null }
export type Resolver = (q: Query) => QueryResult

export const hasOp = (q: Query, method: string) => q.ops.some((o) => o.method === method)
export const opArgs = (q: Query, method: string) => q.ops.find((o) => o.method === method)?.args

export function createFakeSupabase(resolve: Resolver, user: { id: string } | null = null) {
  const log: Query[] = []

  const builder = (q: Query): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
              log.push(q)
              let result: QueryResult
              try {
                result = { data: null, error: null, ...resolve(q) }
              } catch (e) {
                return Promise.reject(e).then(onFulfilled, onRejected)
              }
              return Promise.resolve(result).then(onFulfilled, onRejected)
            }
          }
          return (...args: unknown[]) => {
            q.ops.push({ method: String(prop), args })
            return proxy
          }
        },
      },
    )
    return proxy
  }

  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => builder({ table, ops: [] }),
    rpc: (fn: string, args: unknown) => builder({ table: `rpc:${fn}`, ops: [{ method: 'rpc', args: [args] }] }),
  }
  return { client, log }
}
