'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Shield, User, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface UserRow {
  id: string
  name: string | null
  role: string | null
  created_at: string
  email?: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    const supabase = createClient()
    const [{ data: { user } }, { data, error: loadError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('id, name, role, created_at').order('created_at', { ascending: false }),
    ])
    setMe(user?.id ?? null)
    if (loadError) setError(`Gagal memuat pengguna: ${loadError.message}`)
    else setUsers((data ?? []) as UserRow[])
    setLoading(false)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => (u.name ?? '').toLowerCase().includes(q) || u.id.includes(q))
  }, [search, users])

  async function toggleRole(user: UserRow) {
    // Your own row is locked: demoting yourself would lock you out of here.
    if (user.id === me) return
    setConfirmId(null)
    setError('')
    setToggling(user.id)
    const supabase = createClient()
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', user.id)
      .select('id')
    if (updateError) setError(`Gagal mengubah role ${user.name ?? 'pengguna'}: ${updateError.message}`)
    else if (!data?.length) setError(`Role ${user.name ?? 'pengguna'} tidak berubah — pastikan akunmu masih admin.`)
    await loadUsers()
    setToggling(null)
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Pengguna</h1>
        <p className="mt-1 text-sm text-ink-muted">{users.length} pengguna terdaftar</p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-xs font-semibold">Tutup</button>
        </div>
      )}

      {/* Search */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <Search className="h-4 w-4 flex-shrink-0 text-ink-muted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama atau ID pengguna..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted">Nama</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted">ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted">Bergabung</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-ink-muted"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(user => {
                const isMe = user.id === me
                const makeAdmin = user.role !== 'admin'
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose/10 text-xs font-bold text-rose">
                          {(user.name || '?')[0].toUpperCase()}
                        </div>
                        <span className="whitespace-nowrap font-medium text-ink">{user.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-ink-muted">{user.id.slice(0, 8)}…</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-ink-muted">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.role === 'admin' ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {user.role ?? 'user'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {isMe ? (
                        <span className="text-xs text-ink-muted">Akun kamu</span>
                      ) : confirmId === user.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-ink-muted">{makeAdmin ? 'Jadikan admin?' : 'Hapus akses admin?'}</span>
                          <button
                            onClick={() => toggleRole(user)}
                            disabled={toggling !== null}
                            className={`font-semibold ${makeAdmin ? 'text-purple-600 hover:text-purple-800' : 'text-red-500 hover:text-red-700'} disabled:opacity-50`}
                          >
                            Ya
                          </button>
                          <button onClick={() => setConfirmId(null)} className="text-ink-muted hover:text-ink">
                            Batal
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmId(user.id)}
                          disabled={toggling !== null}
                          className={`text-xs font-medium transition-colors disabled:opacity-50 ${
                            makeAdmin
                              ? 'text-purple-600 hover:text-purple-800'
                              : 'text-red-500 hover:text-red-700'
                          }`}
                        >
                          {toggling === user.id ? '...' : makeAdmin ? 'Jadikan Admin' : 'Hapus Admin'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-ink-muted">
                    {search ? 'Tidak ada pengguna ditemukan' : 'Belum ada pengguna'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
