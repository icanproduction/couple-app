// Push kind 'games': its own switch in notification_prefs, plus quiet hours,
// honored by sendPushToProfile. web-push and Supabase are fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, opArgs, type Query } from './helpers/fake-supabase'

const state = vi.hoisted(() => ({
  adminClient: null as unknown,
  sent: [] as Array<{ endpoint: string; body: string }>,
}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => { throw new Error('not used') },
  createServiceRoleClient: () => state.adminClient,
}))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, body: string) => {
      state.sent.push({ endpoint: sub.endpoint, body })
      return {}
    },
  },
}))

import { isPushKind, PUSH_KINDS, sendPushToProfile } from '@/lib/push-server'
import { isPushMuted, type MutePrefs } from '@/lib/quiet-hours'

const ALL_ON: MutePrefs = {
  kangen: true, letters: true, moments: true, reminders: true, activity: true, games: true,
  quiet_start: null, quiet_end: null,
}
// 15:00 UTC = 22:00 WIB
const NIGHT = new Date('2026-11-04T15:00:00Z')

let log: Query[] = []
function useDb(prefs: Partial<MutePrefs> | null) {
  const fake = createFakeSupabase((q) => {
    if (q.table === 'notification_prefs') return { data: prefs === null ? null : { ...ALL_ON, ...prefs } }
    if (q.table === 'push_subscriptions') return { data: [{ endpoint: 'https://push.example/1', p256dh: 'p', auth_key: 'a' }] }
    throw new Error(`unexpected query on ${q.table}`)
  })
  state.adminClient = fake.client
  log = fake.log
}

const invite = { title: 'Samakan', body: 'Dita wants to play Samakan now', url: '/app/games' }

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public'
  process.env.VAPID_PRIVATE_KEY = 'test-private'
  state.sent.length = 0
})

describe("push kind 'games'", () => {
  it('is a known kind', () => {
    expect(PUSH_KINDS).toContain('games')
    expect(isPushKind('games')).toBe(true)
  })

  it('the filter: switch off mutes it, quiet hours hold it back, other switches leave it alone', () => {
    expect(isPushMuted({ ...ALL_ON, games: false }, 'games', {}, NIGHT)).toBe(true)
    expect(isPushMuted({ ...ALL_ON, games: false }, 'games', { ignoreQuietHours: true }, NIGHT)).toBe(true)
    expect(isPushMuted(ALL_ON, 'games', {}, NIGHT)).toBe(false)
    expect(isPushMuted({ ...ALL_ON, quiet_start: 22, quiet_end: 6 }, 'games', {}, NIGHT)).toBe(true)
    expect(isPushMuted({ ...ALL_ON, activity: false, kangen: false }, 'games', {}, NIGHT)).toBe(false)
    expect(isPushMuted({ ...ALL_ON, games: false }, 'kangen', {}, NIGHT)).toBe(false)
    // A row read without the column (older select) counts as on.
    const { games: _omit, ...withoutGames } = ALL_ON
    expect(isPushMuted(withoutGames, 'games', {}, NIGHT)).toBe(false)
  })

  it('sendPushToProfile reads the games column and skips the send when it is off', async () => {
    useDb({ games: false })
    expect(await sendPushToProfile('user-b', invite, 'games')).toEqual({ sent: 0, failed: 0, stale: 0, muted: true })
    expect(state.sent).toHaveLength(0)
    const select = opArgs(log.find((q) => q.table === 'notification_prefs')!, 'select')?.[0] as string
    expect(select.split(',').map((s) => s.trim())).toContain('games')
    expect(log.some((q) => q.table === 'push_subscriptions')).toBe(false)
  })

  it('sends when the switch is on', async () => {
    useDb({ games: true })
    expect(await sendPushToProfile('user-b', invite, 'games')).toEqual({ sent: 1, failed: 0, stale: 0 })
    expect(JSON.parse(state.sent[0].body)).toEqual(invite)
  })

  it('no prefs row → on', async () => {
    useDb(null)
    expect((await sendPushToProfile('user-b', invite, 'games'))?.sent).toBe(1)
  })
})
