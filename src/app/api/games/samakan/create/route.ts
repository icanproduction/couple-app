import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendPushToProfile } from '@/lib/push-server'
import { getChapter } from '@/data/samakan'

const WAITING_TTL_MS = 10 * 60 * 1000 // lobby nobody joined
const PLAYING_TTL_MS = 30 * 60 * 1000 // game abandoned mid-way
const UNIQUE_VIOLATION = '23505' // game_sessions_one_open_per_couple

interface OpenSession {
  id: string
  chapter_id: string
  created_by: string
  status: string
}

/**
 * Start (or rejoin) a Sinkronisasi game. A couple has at most one open
 * ('waiting' | 'playing') session, enforced by a partial unique index.
 *
 * - stale open sessions are expired first (waiting > 10 min, playing > 30 min)
 * - an open session for the same chapter, or a game already being played, is
 *   returned as-is (existing: true)
 * - the caller's own unstarted lobby for another chapter is replaced
 * - two simultaneous creates: the loser gets the winner's session back
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Log in first' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : ''
    const chapter = getChapter(chapterId)
    if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 400 })

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) {
      return NextResponse.json({ error: 'You\'re not connected with a partner yet' }, { status: 400 })
    }
    const coupleId = membership.couple_id

    const { data: partners } = await supabase
      .from('couple_members').select('profile_id')
      .eq('couple_id', coupleId).neq('profile_id', user.id)
    const partnerId = partners?.[0]?.profile_id
    if (!partnerId) {
      return NextResponse.json({ error: 'Your partner hasn\'t joined yet. Invite them first.' }, { status: 400 })
    }

    // Expire abandoned sessions so they cannot block the couple forever.
    const admin = createServiceRoleClient()
    const now = Date.now()
    const waitingCutoff = new Date(now - WAITING_TTL_MS).toISOString()
    const playingCutoff = new Date(now - PLAYING_TTL_MS).toISOString()
    await Promise.all([
      admin.from('game_sessions').update({ status: 'expired' })
        .eq('couple_id', coupleId).eq('status', 'waiting').lt('created_at', waitingCutoff),
      admin.from('game_sessions').update({ status: 'expired' })
        .eq('couple_id', coupleId).eq('status', 'playing').lt('started_at', playingCutoff),
      admin.from('game_sessions').update({ status: 'expired' })
        .eq('couple_id', coupleId).eq('status', 'playing').is('started_at', null).lt('created_at', playingCutoff),
    ])

    const findOpen = async (): Promise<OpenSession | null> => {
      const { data } = await admin.from('game_sessions')
        .select('id, chapter_id, created_by, status')
        .eq('couple_id', coupleId)
        .in('status', ['waiting', 'playing'])
        .order('created_at', { ascending: false })
        .limit(1)
      return (data?.[0] as OpenSession | undefined) ?? null
    }

    const open = await findOpen()
    if (open) {
      const replaceable = open.chapter_id !== chapterId && open.status === 'waiting' && open.created_by === user.id
      if (!replaceable) {
        // Same chapter, the partner's lobby, or a game in progress: join it.
        return NextResponse.json({ sessionId: open.id, existing: true, chapterId: open.chapter_id })
      }
      await admin.from('game_sessions').update({ status: 'expired' })
        .eq('id', open.id).eq('status', 'waiting')
    }

    const { data: session, error } = await supabase.from('game_sessions').insert({
      couple_id: coupleId,
      created_by: user.id,
      partner_id: partnerId,
      chapter_id: chapterId,
      round_types: chapter.rounds.map(r => r.type),
      rounds: [],
    }).select('id').single()

    if (error || !session) {
      if (error?.code === UNIQUE_VIOLATION) {
        // The partner created one at the same moment: both end up in it.
        const winner = await findOpen()
        if (winner) return NextResponse.json({ sessionId: winner.id, existing: true, chapterId: winner.chapter_id })
      }
      console.error('[samakan/create] insert failed:', error?.message)
      return NextResponse.json({ error: 'Couldn\'t start the game. Try again.' }, { status: 500 })
    }

    // Push notify partner (optional; never blocks the game)
    try {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
      await sendPushToProfile(partnerId, {
        title: 'Nanti Kita',
        body: `${profile?.name ?? 'Your partner'} wants to play Samakan with you`,
        url: `/app/games/samakan/${session.id}`,
      }, 'activity')
    } catch (err) {
      console.error('[samakan/create] push failed:', err)
    }

    return NextResponse.json({ sessionId: session.id, chapterId })
  } catch (err) {
    console.error('[samakan/create] unhandled:', err)
    return NextResponse.json({ error: 'Couldn\'t start the game. Try again.' }, { status: 500 })
  }
}
