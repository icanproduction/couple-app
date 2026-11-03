'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Heart, MessageCircleHeart, Bell, ChevronRight } from 'lucide-react'
import { getAdminStats } from '@/lib/admin'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalUsers: 0, totalCouples: 0, totalSessions: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdminStats().then(s => {
      setStats({ totalUsers: s.totalUsers ?? 0, totalCouples: s.totalCouples ?? 0, totalSessions: s.totalSessions ?? 0 })
      setLoading(false)
    })
  }, [])

  const STAT_CARDS = [
    { label: 'Total users', value: stats.totalUsers, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Total couples', value: stats.totalCouples, icon: Heart, color: 'bg-rose/10 text-rose' },
    { label: 'Deep Talk sessions', value: stats.totalSessions, icon: MessageCircleHeart, color: 'bg-purple-50 text-purple-600' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">Nanti Kita at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STAT_CARDS.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="text-2xl font-bold text-ink">
                {loading ? '…' : card.value?.toLocaleString()}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Quick links */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Manage content</h2>
        <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {[
            { href: '/admin/deep-talk', label: 'Deep Talk packs', desc: 'Packs, levels and questions', icon: MessageCircleHeart },
            { href: '/admin/notifications', label: 'Push notifications', desc: 'Test and broadcast notifications', icon: Bell },
            { href: '/admin/users', label: 'Users', desc: 'Manage accounts and user roles', icon: Users },
          ].map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
                  <Icon className="h-4 w-4 text-ink-muted" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="text-xs text-ink-muted">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
