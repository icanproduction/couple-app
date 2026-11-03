// Two Truths & a Lie: everything that talks to Supabase or the push route.
// The rounds table has no client grants; these RPCs are the only way in.
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient, getClientUser } from '@/lib/supabase'
import { getMyCouple } from '@/lib/couple'
import {
  GAME_PATH,
  errorCode,
  parseGuessResult,
  parseRoundList,
  shuffleRound,
  type Draft,
  type ErrorCode,
  type GuessResult,
  type RoundList,
} from './logic'

export interface Partner {
  id: string
  /** The profile name, or null when it isn't filled in or can't be read. */
  name: string | null
}

export interface GameContext {
  userId: string
  myName: string | null
  coupleId: string | null
  /** Set once a partner left; past rounds stay readable, nothing new. */
  closed: boolean
  /** The other member, if there is one right now. */
  partner: Partner | null
}

export class TwoTruthsError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
    this.name = 'TwoTruthsError'
  }
}

function fail(error: PostgrestError | null | undefined): never {
  throw new TwoTruthsError(errorCode(error), error?.message ?? 'Unknown error')
}

// The RPCs are newer than the generated Database types (src/types/database.ts),
// so they go through an untyped call; parseRoundList / parseGuessResult check
// the payloads instead.
type RpcReply = { data: unknown; error: PostgrestError | null }
type LooseRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcReply>

async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const client = createClient()
  const call = client.rpc as unknown as LooseRpc
  let reply: RpcReply
  try {
    reply = await call.call(client, fn, args)
  } catch (e) {
    throw new TwoTruthsError('NETWORK', e instanceof Error ? e.message : 'Network error')
  }
  if (reply.error) fail(reply.error)
  return reply.data
}

/** Who I am, my couple and my partner. null = signed out. */
export async function loadGameContext(): Promise<GameContext | null> {
  const user = await getClientUser()
  if (!user) return null
  const supabase = createClient()

  const couple = await getMyCouple(user.id)
  const { data: me, error: meError } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
  if (meError) fail(meError)
  const base = { userId: user.id, myName: me?.name?.trim() || null }
  if (!couple) return { ...base, coupleId: null, closed: false, partner: null }

  const { data: others, error: membersError } = await supabase
    .from('couple_members')
    .select('profile_id')
    .eq('couple_id', couple.id)
    .neq('profile_id', user.id)
  if (membersError) fail(membersError)
  const partnerId = others?.[0]?.profile_id ?? null
  let partner: Partner | null = null
  if (partnerId) {
    const { data: profile } = await supabase.from('profiles').select('name').eq('id', partnerId).maybeSingle()
    partner = { id: partnerId, name: profile?.name?.trim() || null }
  }
  return { ...base, coupleId: couple.id, closed: !!couple.closedAt, partner }
}

export async function listRounds(): Promise<RoundList> {
  return parseRoundList(await rpc('two_truths_list'))
}

/** Shuffles, then saves. Returns the new round's id. */
export async function createRound(draft: Draft): Promise<string> {
  if (draft.lieIndex === null) throw new TwoTruthsError('TT_INVALID', 'Mark one of the three statements as the lie')
  const shuffled = shuffleRound(draft.statements, draft.lieIndex)
  const story = draft.story.trim()
  const id = await rpc('two_truths_create', {
    p_statements: shuffled.statements,
    p_lie_index: shuffled.lieIndex,
    p_story: story || null,
  })
  if (typeof id !== 'string') throw new TwoTruthsError('UNKNOWN', 'Unexpected reply from the server')
  return id
}

export async function guessRound(roundId: string, index: number): Promise<GuessResult> {
  return parseGuessResult(await rpc('two_truths_guess', { p_round_id: roundId, p_index: index }))
}

export async function cancelRound(roundId: string): Promise<void> {
  await rpc('two_truths_cancel', { p_round_id: roundId })
}

/**
 * Best effort: a push that fails (offline, notifications off, not configured)
 * never blocks the game. The text never carries a statement or the story.
 */
export function pushPartner(recipientId: string, body: string): void {
  try {
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, title: 'Two Truths & a Lie', body, url: GAME_PATH, kind: 'activity' }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // fetch itself threw (very old browser); the round is saved either way.
  }
}
