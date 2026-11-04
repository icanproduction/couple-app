// Admin → AI: Claude status. The key lives only in the server env
// (ANTHROPIC_API_KEY) and is never sent back; responses carry its last 4
// characters at most. The model is fixed (Sonnet 5.5). Every handler re-checks
// the admin role in the database.
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  AI_DAILY_CAP_USD,
  aiSpendTodayAll,
  checkClaudeConnection,
  claudeConfigured,
  claudeKeyLast4,
  SONNET,
  SONNET_LABEL,
} from '@/lib/claude'
import { aiFailure, describeAiFailure } from '@/lib/ai-errors'
import { todayJakarta } from '@/lib/dates'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  return null
}

/** What the page shows. */
async function describe() {
  let spend: Awaited<ReturnType<typeof aiSpendTodayAll>> | null = null
  try {
    spend = await aiSpendTodayAll()
  } catch (err) {
    console.error('[admin/llm] spend lookup failed:', err instanceof Error ? err.message : err)
  }
  return {
    configured: claudeConfigured(),
    key_source: 'env' as const,
    key_last4: claudeKeyLast4(),
    model: SONNET,
    model_label: SONNET_LABEL,
    day: todayJakarta(),
    spend_today_usd: spend?.totalUsd ?? null,
    spend_by_feature: spend?.byFeature ?? null,
    calls_today: spend?.calls ?? null,
    caps_usd: AI_DAILY_CAP_USD,
  }
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json(await describe())
}

/** POST { action: 'test' }: one tiny Sonnet request with the key in use. */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await req.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== 'test') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const check = await checkClaudeConnection()
  const seconds = (check.latencyMs / 1000).toFixed(1)
  let message: string
  if (check.ok) {
    message = `Connected to ${SONNET_LABEL} (${seconds} s).`
  } else if (check.reason === 'no_key') {
    message = 'No API key yet. Set ANTHROPIC_API_KEY on the server, then redeploy.'
  } else {
    console.error('[admin/llm] connection check failed:', describeAiFailure(check))
    message = aiFailure(check, { retry: 'Couldn\'t reach Claude. Try again in a moment.' }).error
  }
  return NextResponse.json({ ...(await describe()), check: { ok: check.ok, message, latencyMs: check.latencyMs } })
}
