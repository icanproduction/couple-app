'use client'
import { supabase } from '@/lib/supabase'
type Mood = 'senang' | 'sedih'
const EMPTY = { title: '', category: 'petualangan', status: 'belum', href: '/app/perjalanan' }
const LINKS = [{ label: 'Our Story', href: '/app/perjalanan' }, { label: 'Notifications', href: '/app/profile/notifikasi' }]
export function Good({ partner }: { partner: string }) {
  const q = supabase.from('surat').select('id, nama').eq('status', 'terkunci')
  const mood = 'senang' // copy-ok: stored value
  const locked = (m?: string) => m?.includes('terkunci')
  const go = `/app/perjalanan/${partner}`
  return <div className="flex gap-2" data-x="apa"><p>Send {partner} a Kangen from Nanti Kita.</p><span>Pet Kita misses you. Open Toples or Jelajah.</span></div>
}
