'use client'

import { useState, useEffect } from 'react'
import {
  Plus, Check, Trash2, User, Heart, Users, ExternalLink,
  ShoppingBag, Link2, Gift, Sparkles, Star, Package,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface WishlistItem {
  id: string
  name: string
  price: number | null
  is_purchased: boolean
  owner_type: string | null
  owner_id: string | null
  link: string | null
  image_url: string | null
}

interface WishlistSectionProps {
  items: WishlistItem[]
  coupleId: string
  userId: string
  userName: string | null
  partnerId: string | null
  partnerName: string | null
  onRefresh: () => void
}

type WishlistTab = 'couple' | 'personal' | 'partner'

function fmtRp(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`
  return `Rp ${n.toLocaleString('id-ID')}`
}

/**
 * Turns what the user typed into a safe absolute link: adds https:// when no
 * scheme was typed ("shopee.co.id/..." would otherwise be a relative link)
 * and only allows http(s) — never javascript:, data:, etc. null = invalid.
 */
function toSafeHref(raw: string | null): string | null {
  const value = raw?.trim()
  if (!value) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.')) return null
    return url.href
  } catch {
    return null
  }
}

function getMarketplaceName(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    if (host.includes('shopee')) return 'Shopee'
    if (host.includes('tokopedia')) return 'Tokopedia'
    if (host.includes('lazada')) return 'Lazada'
    if (host.includes('blibli')) return 'Blibli'
    if (host.includes('bukalapak')) return 'Bukalapak'
    if (host.includes('tiktok')) return 'TikTok Shop'
    if (host.includes('instagram')) return 'Instagram'
    return host.split('.')[0]
  } catch { return null }
}

function getMarketplaceStyle(name: string | null): { bg: string; text: string } {
  if (!name) return { bg: 'bg-ink/5', text: 'text-ink-muted' }
  const n = name.toLowerCase()
  if (n === 'shopee') return { bg: 'bg-orange-50', text: 'text-orange-600' }
  if (n === 'tokopedia') return { bg: 'bg-green-50', text: 'text-green-600' }
  if (n === 'lazada') return { bg: 'bg-blue-50', text: 'text-blue-600' }
  if (n === 'tiktok shop') return { bg: 'bg-slate-100', text: 'text-slate-700' }
  return { bg: 'bg-purple-50', text: 'text-purple-600' }
}

// Assign a gradient to each card based on index
const CARD_THEMES = [
  { bg: 'from-rose-50 to-pink-50', border: 'border-rose/20', accent: 'text-rose', accentBg: 'bg-rose/10', check: 'bg-rose/20 border-rose' },
  { bg: 'from-purple-50 to-indigo-50', border: 'border-purple-200', accent: 'text-purple-600', accentBg: 'bg-purple-100', check: 'bg-purple-200 border-purple-400' },
  { bg: 'from-blue-50 to-cyan-50', border: 'border-blue-200', accent: 'text-blue-600', accentBg: 'bg-blue-100', check: 'bg-blue-200 border-blue-400' },
  { bg: 'from-sage/10 to-emerald-50', border: 'border-sage/30', accent: 'text-sage-dark', accentBg: 'bg-sage/20', check: 'bg-sage/30 border-sage' },
  { bg: 'from-amber-50 to-yellow-50', border: 'border-amber-200', accent: 'text-amber-700', accentBg: 'bg-amber-100', check: 'bg-amber-200 border-amber-400' },
]

const CARD_ICONS = [Gift, Star, Sparkles, Package, Heart]

export default function WishlistSection({
  items, coupleId, userId, userName, partnerId, partnerName, onRefresh,
}: WishlistSectionProps) {
  const [tab, setTab] = useState<WishlistTab>('couple')
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newLink, setNewLink] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [localItems, setLocalItems] = useState(items)
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState('')
  const [listError, setListError] = useState('')

  useEffect(() => { setLocalItems(items) }, [items])

  const filtered = localItems.filter(item => {
    if (tab === 'couple') return item.owner_type === 'couple'
    if (tab === 'personal') return item.owner_type === 'personal' && item.owner_id === userId
    if (tab === 'partner') return item.owner_type === 'personal' && item.owner_id !== userId
    return true
  })

  const unpurchased = filtered.filter(w => !w.is_purchased)
  const purchased = filtered.filter(w => w.is_purchased)
  const totalPrice = unpurchased.reduce((s, w) => s + (w.price ? Number(w.price) : 0), 0)

  const TABS: { key: WishlistTab; label: string; icon: typeof Users; count: number }[] = [
    { key: 'couple', label: 'Bersama', icon: Users, count: localItems.filter(i => i.owner_type === 'couple' && !i.is_purchased).length },
    { key: 'personal', label: 'Milikku', icon: User, count: localItems.filter(i => i.owner_type === 'personal' && i.owner_id === userId && !i.is_purchased).length },
    { key: 'partner', label: partnerName ?? 'Pasangan', icon: Heart, count: localItems.filter(i => i.owner_type === 'personal' && i.owner_id !== userId && !i.is_purchased).length },
  ]

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || adding) return
    setFormError('')

    const link = newLink.trim() ? toSafeHref(newLink) : null
    if (newLink.trim() && !link) {
      setFormError('Link-nya belum valid. Contoh: shopee.co.id/produk-kamu')
      return
    }

    setAdding(true)
    const supabase = createClient()
    const actualTab = tab === 'partner' ? 'couple' : tab

    const { error } = await supabase.from('wishlist_items').insert({
      couple_id: coupleId, name: newName.trim(),
      price: newPrice ? parseInt(newPrice.replace(/\D/g, ''), 10) : null,
      link,
      owner_type: actualTab, owner_id: actualTab === 'personal' ? userId : null,
    })
    if (error) {
      // Keep what was typed
      setFormError('Gagal menambah wishlist. Coba lagi ya.')
      setAdding(false)
      return
    }
    // Notify partner about new wishlist item
    if (partnerId) {
      const name = userName || 'Pasanganmu'
      const priceStr = newPrice ? ` (Rp ${newPrice})` : ''
      try {
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: partnerId,
            title: 'Nanti Kita',
            body: `${name} menambahkan "${newName.trim()}"${priceStr} ke wishlist`,
            url: '/app/partner',
            kind: 'activity',
          }),
        })
      } catch { /* optional */ }
    }

    setNewName(''); setNewPrice(''); setNewLink(''); setShowForm(false); setAdding(false)
    onRefresh()
  }

  async function toggleItem(item: WishlistItem) {
    setListError('')
    const supabase = createClient()
    const { error } = await supabase.from('wishlist_items').update({ is_purchased: !item.is_purchased }).eq('id', item.id)
    if (error) { setListError('Gagal mengubah item. Coba lagi ya.'); return }
    setLocalItems(prev => prev.map(w => w.id === item.id ? { ...w, is_purchased: !w.is_purchased } : w))
  }

  async function deleteItem(id: string) {
    setListError('')
    const supabase = createClient()
    const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
    if (error) { setListError('Gagal menghapus item. Coba lagi ya.'); return }
    setLocalItems(prev => prev.filter(w => w.id !== id))
  }

  const canAdd = tab !== 'partner'

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose/20 to-purple-100">
            <Gift className="h-4 w-4 text-rose" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">Wishlist</h2>
            {totalPrice > 0 && (
              <p className="text-[10px] text-ink-muted">Total: {fmtRp(totalPrice)}</p>
            )}
          </div>
        </div>
        {canAdd && (
          <button onClick={() => setShowForm(!showForm)}
            className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
              showForm ? 'bg-ink/10 rotate-45' : 'bg-rose text-white'
            }`}>
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-cream/80 p-1">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false) }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                tab === t.key
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}>
              <Icon className="h-3 w-3" />
              {t.label}
              {t.count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] ${
                  tab === t.key ? 'bg-rose/10 text-rose font-bold' : 'bg-border'
                }`}>{t.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Add form */}
      {showForm && canAdd && (
        <form onSubmit={addItem} className="rounded-2xl border border-dashed border-rose/30 bg-rose-50/30 p-4 space-y-3">
          <input
            placeholder="Nama item wishlist..."
            value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
            autoFocus
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Rp</span>
              <input type="text" inputMode="numeric" placeholder="Harga"
                value={newPrice}
                onChange={e => { const n = e.target.value.replace(/\D/g, ''); setNewPrice(n ? parseInt(n, 10).toLocaleString('id-ID') : '') }}
                className="w-full rounded-xl border border-border bg-white py-2.5 pl-8 pr-3 text-sm focus:border-rose focus:outline-none"
              />
            </div>
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
              <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="Link (opsional)"
                value={newLink} onChange={e => setNewLink(e.target.value)}
                className="w-full rounded-xl border border-border bg-white py-2.5 pl-8 pr-3 text-sm focus:border-rose focus:outline-none"
              />
            </div>
          </div>
          {formError && <p className="text-xs font-medium text-red-500">{formError}</p>}
          <button type="submit" disabled={!newName.trim() || adding}
            className="w-full rounded-xl bg-rose py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-all active:scale-[0.98]">
            {adding ? 'Menyimpan...' : 'Tambah ke Wishlist'}
          </button>
        </form>
      )}

      {listError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{listError}</p>
      )}

      {/* Empty state */}
      {filtered.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-cream/30 py-10">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose/10 to-purple-100">
            <Gift className="h-7 w-7 text-rose/60" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-ink-muted">
            {tab === 'partner' ? `${partnerName ?? 'Pasangan'} belum punya wishlist` : 'Wishlist masih kosong'}
          </p>
          <p className="mt-1 text-xs text-ink-muted/60">
            {canAdd ? 'Ketuk + untuk menambahkan item impian' : 'Bisa jadi ide kado!'}
          </p>
        </div>
      )}

      {/* Unpurchased items — card grid */}
      {unpurchased.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {unpurchased.map((item, idx) => {
            const theme = CARD_THEMES[idx % CARD_THEMES.length]
            const CardIcon = CARD_ICONS[idx % CARD_ICONS.length]
            // Stored links are re-validated: old rows may lack https:// or hold
            // a non-http scheme, which must never be rendered as a link
            const href = toSafeHref(item.link)
            const marketplace = href ? getMarketplaceName(href) : null
            const mpStyle = getMarketplaceStyle(marketplace)

            return (
              <div key={item.id}
                className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 transition-all ${theme.bg} ${theme.border}`}>
                {/* Background decoration */}
                <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/30" />
                <div className="absolute -bottom-2 -left-2 h-10 w-10 rounded-full bg-white/20" />

                <div className="relative">
                  {/* Icon + delete */}
                  <div className="mb-2.5 flex items-start justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.accentBg}`}>
                      <CardIcon className={`h-4 w-4 ${theme.accent}`} />
                    </div>
                    <button onClick={() => deleteItem(item.id)}
                      className="rounded-lg p-1 text-ink-muted/20 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Name */}
                  <p className="text-sm font-bold text-ink leading-tight line-clamp-2 mb-1.5">
                    {item.name}
                  </p>

                  {/* Price */}
                  {item.price != null && Number(item.price) > 0 && (
                    <p className={`text-xs font-bold ${theme.accent}`}>{fmtRp(Number(item.price))}</p>
                  )}

                  {/* Marketplace badge */}
                  {href && marketplace && (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${mpStyle.bg} ${mpStyle.text} hover:opacity-80 transition-opacity`}>
                      <ShoppingBag className="h-2.5 w-2.5" />
                      {marketplace}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  {href && !marketplace && (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold text-ink-muted hover:text-rose transition-colors">
                      <ExternalLink className="h-2.5 w-2.5" /> Link
                    </a>
                  )}

                  {/* Buy / check button */}
                  <button onClick={() => toggleItem(item)}
                    className={`mt-3 w-full rounded-xl border-2 border-white/60 bg-white/70 py-2 text-xs font-bold backdrop-blur-sm transition-all active:scale-[0.97] ${theme.accent}`}>
                    Sudah Dibeli
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Purchased items — compact list */}
      {purchased.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted/50">
            Sudah Dibeli ({purchased.length})
          </p>
          <div className="space-y-1.5">
            {purchased.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-sage/5 px-3 py-2.5">
                <button onClick={() => toggleItem(item)}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sage/20 border border-sage/40">
                  <Check className="h-3 w-3 text-sage-dark" strokeWidth={3} />
                </button>
                <p className="flex-1 text-sm text-ink-muted line-through truncate">{item.name}</p>
                {item.price != null && Number(item.price) > 0 && (
                  <span className="text-xs text-ink-muted/50">{fmtRp(Number(item.price))}</span>
                )}
                <button onClick={() => deleteItem(item.id)}
                  className="text-ink-muted/20 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partner tab hint */}
      {tab === 'partner' && unpurchased.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-rose-50 to-purple-50 px-4 py-3 text-center">
          <p className="text-xs font-medium text-rose">
            Ini wishlist {partnerName ?? 'pasangan'} — bisa jadi ide kado!
          </p>
        </div>
      )}
    </div>
  )
}
