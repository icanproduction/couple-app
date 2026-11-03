'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import MomentForm from '@/components/moments/MomentForm'
import { getCoupleInfo, getMoment, type CoupleInfo, type MomentWithPhotos } from '@/lib/moments'

export default function EditMomentPage() {
  const router = useRouter()
  const { momentId } = useParams<{ momentId: string }>()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [moment, setMoment] = useState<MomentWithPhotos | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const i = await getCoupleInfo()
        if (!i) { router.replace('/auth/login'); return }
        const m = await getMoment(momentId)
        if (!cancelled) { setInfo(i); setMoment(m) }
      } catch {
        if (!cancelled) setError('Gagal memuat moment. Cek koneksimu, lalu buka ulang halaman ini.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [momentId, router])

  if (loading) {
    return <div className="mx-6 mt-6 h-64 animate-pulse rounded-2xl bg-rose-50" />
  }
  if (!info?.coupleId || !moment) {
    return (
      <div className="px-8 pt-16 text-center">
        <p className={error ? 'text-sm text-red-600' : 'text-sm text-ink-muted'}>{error || 'Moment ini tidak ditemukan.'}</p>
        <Link href="/app/moments" className="mt-4 inline-block text-sm font-semibold text-rose">Ke Moment Kita</Link>
      </div>
    )
  }
  return <MomentForm info={{ ...info, coupleId: info.coupleId }} initial={moment} />
}
