import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendPushToProfile } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

const BATCH = 200

/**
 * Tells receivers that a time-locked letter can now be opened. Run by Vercel
 * Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 * Each letter is marked once handled, so a missed push is never retried twice
 * and a late run still catches everything due.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceRoleClient()
  const { data: due, error } = await admin
    .from('letters')
    .select('id, sender_id, receiver_id')
    .lte('unlock_date', new Date().toISOString())
    .is('unlock_notified_at', null)
    .eq('is_opened', false)
    .order('unlock_date')
    .limit(BATCH)
  if (error) {
    console.error('[cron/letter-unlocks] query failed:', error.message)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }
  if (!due?.length) return NextResponse.json({ due: 0, sent: 0 })

  const senderIds = Array.from(new Set(due.map((l) => l.sender_id)))
  const { data: senders } = await admin.from('profiles').select('id, name').in('id', senderIds)
  const nameOf = new Map((senders ?? []).map((s) => [s.id, s.name ?? 'Pasanganmu']))

  let sent = 0
  for (const letter of due) {
    // ignoreQuietHours: each letter is marked handled below and never retried,
    // so a push held back for quiet hours would be lost, not delayed. The
    // "Surat" switch still applies.
    const result = await sendPushToProfile(letter.receiver_id, {
      title: 'Nanti Kita',
      body: `Surat dari ${nameOf.get(letter.sender_id) ?? 'pasanganmu'} sudah bisa dibuka`,
      url: `/app/letters/${letter.id}`,
    }, 'letters', { ignoreQuietHours: true })
    sent += result?.sent ?? 0
  }

  // Mark handled even when the receiver has no subscription: the letter
  // shows as ready in the app either way.
  const { error: markError } = await admin
    .from('letters')
    .update({ unlock_notified_at: new Date().toISOString() })
    .in('id', due.map((l) => l.id))
  if (markError) console.error('[cron/letter-unlocks] mark failed:', markError.message)

  return NextResponse.json({ due: due.length, sent })
}
