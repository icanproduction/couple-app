'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Send, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface UserSub {
  profile_id: string
  name: string | null
  email: string | null
  endpoint: string
  created_at: string
}

export default function AdminNotificationsPage() {
  const [users, setUsers] = useState<UserSub[]>([])
  const [allProfiles, setAllProfiles] = useState<{ id: string; name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState('')
  const [title, setTitle] = useState('🔔 Nanti Kita')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('📢 Nanti Kita')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()

    // Get all push subscriptions with profile info
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('profile_id, endpoint, created_at')
      .order('created_at', { ascending: false })

    // Get all profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .order('name')

    setAllProfiles(profiles ?? [])

    if (subs && profiles) {
      const mapped: UserSub[] = subs.map(s => {
        const p = profiles.find(pp => pp.id === s.profile_id)
        return {
          profile_id: s.profile_id,
          name: p?.name ?? null,
          email: null,
          endpoint: s.endpoint,
          created_at: s.created_at ?? '',
        }
      })
      setUsers(mapped)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function sendTest() {
    if (!selectedUser || !body.trim()) return
    setSending(true)
    setResult(null)

    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedUser,
          title: title || '🔔 Nanti Kita',
          body: body.trim(),
          url: '/app/home',
          kind: 'admin',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, msg: `Terkirim ke ${data.sent} perangkat${data.stale ? `, ${data.stale} stale dihapus` : ''}` })
      } else {
        setResult({ ok: false, msg: data.error || 'Gagal mengirim' })
      }
    } catch (e) {
      setResult({ ok: false, msg: 'Network error' })
    }
    setSending(false)
  }

  async function sendBroadcast() {
    if (!broadcastBody.trim()) return
    setBroadcasting(true)
    setBroadcastResult(null)

    const uniqueUserIds = Array.from(new Set(users.map(u => u.profile_id)))
    let totalSent = 0
    let totalFailed = 0

    for (const userId of uniqueUserIds) {
      try {
        const res = await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: userId,
            title: broadcastTitle || '📢 Nanti Kita',
            body: broadcastBody.trim(),
            url: '/app/home',
            kind: 'admin',
          }),
        })
        const data = await res.json()
        if (res.ok) totalSent += data.sent ?? 0
        else totalFailed++
      } catch {
        totalFailed++
      }
    }

    setBroadcastResult({
      ok: totalFailed === 0,
      msg: `Broadcast selesai: ${totalSent} notif terkirim ke ${uniqueUserIds.length} user${totalFailed ? `, ${totalFailed} gagal` : ''}`,
    })
    setBroadcasting(false)
  }

  // Unique users with subscriptions
  const uniqueSubUsers = Array.from(new Map(users.map(u => [u.profile_id, u] as [string, UserSub])).values())
  // Users without subscriptions
  const usersWithoutSub = allProfiles.filter(p => !users.some(u => u.profile_id === p.id))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Push Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">Test & kirim push notifikasi ke pengguna</p>
      </div>

      {/* Subscription status */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-ink">{loading ? '—' : uniqueSubUsers.length}</p>
          <p className="mt-0.5 text-sm text-ink-muted">User dengan push aktif</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-ink">{loading ? '—' : usersWithoutSub.length}</p>
          <p className="mt-0.5 text-sm text-ink-muted">User tanpa push</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Bell className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-ink">{loading ? '—' : users.length}</p>
          <p className="mt-0.5 text-sm text-ink-muted">Total subscription</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Send to specific user */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-ink flex items-center gap-2">
            <Send className="h-4 w-4" /> Kirim ke User
          </h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">Pilih User</label>
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none"
              >
                <option value="">— Pilih —</option>
                {uniqueSubUsers.map(u => (
                  <option key={u.profile_id} value={u.profile_id}>
                    {u.name ?? 'Tanpa nama'} ({u.endpoint.includes('apple') ? '🍎 iOS' : '🤖 Android'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">Judul</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none"
                placeholder="🔔 Nanti Kita"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">Pesan</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none"
                placeholder="Tulis pesan notifikasi..."
              />
            </div>

            {result && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {result.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                {result.msg}
              </div>
            )}

            <button
              onClick={sendTest}
              disabled={sending || !selectedUser || !body.trim()}
              className="w-full rounded-xl bg-rose py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {sending ? 'Mengirim...' : 'Kirim Notifikasi'}
            </button>
          </div>
        </div>

        {/* Broadcast */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-ink flex items-center gap-2">
            📢 Broadcast ke Semua
          </h2>
          <p className="mb-4 text-xs text-ink-muted">Kirim notifikasi ke semua user yang punya push subscription aktif ({uniqueSubUsers.length} user)</p>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">Judul</label>
              <input
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none"
                placeholder="📢 Nanti Kita"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-muted">Pesan</label>
              <textarea
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-rose focus:outline-none"
                placeholder="Tulis pesan broadcast..."
              />
            </div>

            {broadcastResult && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${broadcastResult.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                {broadcastResult.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                {broadcastResult.msg}
              </div>
            )}

            <button
              onClick={sendBroadcast}
              disabled={broadcasting || !broadcastBody.trim() || uniqueSubUsers.length === 0}
              className="w-full rounded-xl bg-ink py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {broadcasting ? 'Broadcasting...' : `Broadcast ke ${uniqueSubUsers.length} User`}
            </button>
          </div>
        </div>
      </div>

      {/* Subscription table */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold text-ink">Push Subscriptions</h2>
          <button onClick={() => { setLoading(true); loadData() }} className="text-ink-muted hover:text-ink">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-xs font-semibold text-ink-muted">User</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-muted">Platform</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-muted">Endpoint</th>
                <th className="px-5 py-3 text-xs font-semibold text-ink-muted">Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-ink-muted">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-ink-muted">Belum ada subscription</td></tr>
              ) : (
                users.map((u, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-ink">{u.name ?? '—'}</td>
                    <td className="px-5 py-3">{u.endpoint.includes('apple') ? '🍎 iOS Safari' : u.endpoint.includes('fcm') ? '🤖 Android/Chrome' : '🌐 Lainnya'}</td>
                    <td className="px-5 py-3 text-ink-muted text-xs font-mono max-w-[200px] truncate">{u.endpoint}</td>
                    <td className="px-5 py-3 text-ink-muted text-xs">
                      {new Date(u.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users without push */}
      {usersWithoutSub.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-bold text-amber-800 mb-2">⚠️ User tanpa push notification ({usersWithoutSub.length})</h3>
          <div className="flex flex-wrap gap-2">
            {usersWithoutSub.map(u => (
              <span key={u.id} className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200">
                {u.name ?? 'Tanpa nama'}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-600">User ini belum mengaktifkan notifikasi di Profil atau Onboarding.</p>
        </div>
      )}
    </div>
  )
}
