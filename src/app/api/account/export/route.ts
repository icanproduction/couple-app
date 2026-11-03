import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { todayJakarta } from '@/lib/dates'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'

type CoupleTable = keyof Database['public']['Tables']

const PAGE = 1000

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/** Every row of a query, fetched in pages (the API caps one response at 1000 rows). */
async function all(page: (from: number, to: number) => Page): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) break
  }
  return rows
}

function single<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R['data']> | null {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? null) as NonNullable<R['data']> | null
}

const LETTER_META = 'id, couple_id, sender_id, receiver_id, occasion, occasion_label, photo_url, unlock_date, is_opened, opened_at, created_at'

/**
 * Download my data (F05) as JSON: everything I can see through RLS, read
 * with my own session. The one exception is letter text, which users can't
 * select: the service role reads it, limited to letters I sent, or received
 * and have already opened.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const uid = user.id

    const membership = single(await supabase
      .from('couple_members').select('couple_id').eq('profile_id', uid).maybeSingle())
    const cid = membership?.couple_id ?? null

    // Mine, couple or not.
    const [profile, notificationPrefs, dailyAnswers, assessments, mbti, spending, loveLanguages] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle().then(single),
      supabase.from('notification_prefs').select('*').eq('profile_id', uid).maybeSingle().then(single),
      all((f, t) => supabase.from('daily_responses').select('*').eq('profile_id', uid).order('created_at').order('id').range(f, t)),
      all((f, t) => supabase.from('assessment_results').select('*').eq('profile_id', uid).order('taken_at').order('id').range(f, t)),
      all((f, t) => supabase.from('mbti_results').select('*').eq('profile_id', uid).order('taken_at').order('id').range(f, t)),
      all((f, t) => supabase.from('spending_results').select('*').eq('profile_id', uid).order('created_at').order('id').range(f, t)),
      // Scores only: the per-question answers are not readable through the API, not even by their owner.
      supabase.from('love_language_results').select('profile_id, couple_id, scores, taken_at').eq('profile_id', uid).maybeSingle().then(single),
    ])

    let couple: Record<string, unknown> | null = null
    let shared: Record<string, unknown> = {}

    if (cid) {
      // Same session, untyped: the table name is a parameter here.
      const loose = supabase as unknown as SupabaseClient
      const byCouple = (table: CoupleTable, order: string, select = '*') =>
        all((f, t) => loose.from(table).select(select).eq('couple_id', cid).order(order).range(f, t))

      const [coupleRow, members, moments, comments, reactions, events, goals, transactions, monthlyEntries,
        wishlist, weddingBudget, bucket, moods, gratitude, letterMeta, kangen, pets] = await Promise.all([
        supabase.from('couples')
          .select('id, created_at, invite_code, invite_expires_at, closed_at, is_premium, unlocked_at')
          .eq('id', cid).maybeSingle().then(single),
        supabase.from('couple_members').select('profile_id, joined_at').eq('couple_id', cid)
          .then((r) => single(r) ?? []),
        byCouple('moments', 'moment_date',
          'id, title, description, moment_date, location_name, latitude, longitude, is_favorite, created_by, created_at, updated_at, ' +
          'photos:moment_photos(id, storage_path, sort_order, width, height, taken_at, created_at)'),
        byCouple('moment_comments', 'created_at'),
        byCouple('moment_reactions', 'created_at'),
        byCouple('couple_events', 'event_date'),
        byCouple('savings_goals', 'created_at'),
        byCouple('couple_transactions', 'created_at'),
        byCouple('savings_entries', 'created_at'),
        byCouple('wishlist_items', 'created_at'),
        byCouple('wedding_budget_items', 'sort_order'),
        byCouple('bucket_items', 'created_at'),
        byCouple('mood_checkins', 'checkin_date'),
        byCouple('gratitude_notes', 'created_at'),
        byCouple('letters', 'created_at', LETTER_META),
        byCouple('miss_you', 'created_at'),
        byCouple('couple_pets', 'created_at'),
      ])

      const memberIds = members.map((m) => m.profile_id)
      const names = memberIds.length
        ? single(await supabase.from('profiles').select('id, name').in('id', memberIds)) ?? []
        : []
      const nameOf = new Map(names.map((p) => [p.id, p.name]))
      couple = coupleRow
        ? { ...coupleRow, members: members.map((m) => ({ ...m, name: nameOf.get(m.profile_id) ?? null, is_me: m.profile_id === uid })) }
        : null

      const petIds = (pets as { id: string }[]).map((p) => p.id)
      const petMood = petIds.length
        ? single(await supabase.from('pet_mood_state').select('*').in('pet_id', petIds)) ?? []
        : []

      // Letter text: service role, strictly letters I sent or received and opened.
      const admin = createServiceRoleClient()
      const readable = single(await admin
        .from('letters')
        .select('id, content')
        .eq('couple_id', cid)
        .or(`sender_id.eq.${uid},and(receiver_id.eq.${uid},is_opened.eq.true)`)) ?? []
      const contentOf = new Map(readable.map((l) => [l.id, l.content]))
      const letters = (letterMeta as { id: string }[]).map((l) => ({
        ...l,
        content: contentOf.get(l.id) ?? null,
        ...(contentOf.has(l.id) ? {} : { content_hidden: 'Letter text not exported: you haven\'t opened it yet, or it isn\'t a letter from or to you.' }),
      }))

      // Jar notes: a note to me that I haven't opened stays a surprise —
      // listed (id, dates) without its text. Notes I sent keep their text.
      type Note = { id: string; from_id: string; to_id: string; body: string | null; opened_at: string | null }
      const gratitudeNotes = (gratitude as Note[]).map((n) =>
        n.to_id === uid && n.from_id !== uid && !n.opened_at
          ? { ...n, body: null, body_hidden: 'Note text not exported: you haven\'t opened it in the Jar yet.' }
          : n)

      shared = {
        moments,
        moment_comments: comments,
        moment_reactions: reactions,
        calendar_events: events,
        savings: { goals, transactions, monthly_entries: monthlyEntries },
        wishlist,
        wedding_budget: weddingBudget,
        bucket_list: bucket,
        moods,
        gratitude_notes: gratitudeNotes,
        letters,
        kangen,
        pet: { pets, mood: petMood },
      }
    }

    const body = {
      app: 'Nanti Kita',
      format_version: 1,
      exported_at: new Date().toISOString(),
      account: { id: uid, email: user.email ?? null, created_at: user.created_at },
      profile,
      notification_prefs: notificationPrefs,
      couple,
      ...shared,
      daily_answers: dailyAnswers,
      results: { assessment: assessments, mbti, spending, love_languages: loveLanguages },
      notes: {
        photos: 'Moment photos are stored privately. storage_path points to a file in the "moments" bucket.',
        scope: 'Contains the data you can see in the app. Your partner\'s answers are not included, and neither is the text of letters or Jar notes you haven\'t opened.',
      },
    }

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="nanti-kita-${todayJakarta()}.json"`, // copy-ok: download file name
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[account/export] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Couldn\'t prepare your data. Try again.' }, { status: 500 })
  }
}
