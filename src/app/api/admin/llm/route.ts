// Admin → AI settings. The API key is written to Supabase Vault by the
// admin-only RPCs and is never sent back: responses carry its last 4
// characters at most. Every handler re-checks the admin role in the database.
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { DEFAULT_LLM_MODEL, envLlmSettings } from '@/lib/llm'
import { checkLlmConnection, forgetLlmConfig, getLlmWithSource } from '@/lib/llm-config'

export const dynamic = 'force-dynamic'

type Status = {
  key_set: boolean
  key_last4: string | null
  key_set_at: string | null
  model: string | null
  tested_at: string | null
  test_ok: boolean | null
  test_message: string | null
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) return { supabase, error: NextResponse.json({ error: 'Hanya admin' }, { status: 403 }) }
  return { supabase, error: null }
}

/** What the page shows: the stored status plus which key is actually in use. */
async function describe(status: Status) {
  // Always fresh here: the 60 s cache is for the AI routes, and another
  // server instance may have changed the settings meanwhile.
  forgetLlmConfig()
  const env = envLlmSettings()
  const { llm, source } = await getLlmWithSource()
  return {
    ...status,
    in_use: { source, model: llm.modelId },
    env_key_set: env.apiKey.trim().length > 0,
    default_model: DEFAULT_LLM_MODEL,
  }
}

function rpcError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { data, error: rpcErr } = await supabase.rpc('admin_llm_status')
  if (rpcErr) return rpcError(rpcErr.message)
  return NextResponse.json(await describe(data as Status))
}

export async function PUT(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const body = await req.json().catch(() => null) as { apiKey?: unknown; model?: unknown } | null
  if (!body || (body.apiKey === undefined && body.model === undefined)) {
    return rpcError('Tidak ada yang disimpan')
  }
  if (body.apiKey !== undefined && typeof body.apiKey !== 'string') return rpcError('API key harus berupa teks')
  if (body.model !== undefined && body.model !== null && typeof body.model !== 'string') return rpcError('Model harus berupa teks')

  let status: Status | null = null
  if (typeof body.apiKey === 'string') {
    const { data, error: e } = await supabase.rpc('admin_set_llm_key', { p_key: body.apiKey })
    if (e) return rpcError(e.message)
    status = data as Status
  }
  if (body.model !== undefined) {
    const { data, error: e } = await supabase.rpc('admin_set_llm_model', { p_model: (body.model as string | null) ?? '' })
    if (e) return rpcError(e.message)
    status = data as Status
  }
  forgetLlmConfig()
  return NextResponse.json(await describe(status as Status))
}

export async function DELETE() {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const { data, error: e } = await supabase.rpc('admin_clear_llm_key')
  if (e) return rpcError(e.message)
  forgetLlmConfig()
  return NextResponse.json(await describe(data as Status))
}

/** POST { action: 'test' } — one tiny request with the settings in use. */
export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin()
  if (error) return error
  const body = await req.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== 'test') return rpcError('Aksi tidak dikenal')

  forgetLlmConfig()
  const { llm } = await getLlmWithSource()
  const check = await checkLlmConnection(llm)
  const { error: recordErr } = await createServiceRoleClient().rpc('record_llm_test', { p_ok: check.ok, p_message: check.message })
  if (recordErr) console.error('[admin/llm] record test failed:', recordErr.message)

  const { data, error: e } = await supabase.rpc('admin_llm_status')
  if (e) return rpcError(e.message)
  return NextResponse.json({ ...(await describe(data as Status)), check })
}
