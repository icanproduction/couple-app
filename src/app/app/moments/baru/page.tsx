'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import MomentForm from '@/components/moments/MomentForm'
import { getCoupleInfo, parseMomentPrefill, type CoupleInfo } from '@/lib/moments'

type SearchParams = Record<string, string | string[] | undefined>

// Optional prefill: ?title=&date=YYYY-MM-DD&location=&lat=&lng=&bucket=<bucket_items id>
export default function NewMomentPage({ searchParams }: { searchParams?: SearchParams }) {
  const router = useRouter()
  const [info, setInfo] = useState<CoupleInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const prefill = useMemo(() => parseMomentPrefill(searchParams), [searchParams])

  useEffect(() => {
    let cancelled = false
    getCoupleInfo()
      .then((i) => {
        if (cancelled) return
        if (!i) router.replace('/auth/login')
        else setInfo(i)
      })
      .catch(() => { if (!cancelled) setError("Couldn't load this page. Check your connection and open it again.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [router])

  if (loading) {
    return <div className="mx-6 mt-6 h-64 animate-pulse rounded-2xl bg-rose-50" />
  }
  if (error) {
    return (
      <div className="px-8 pt-16 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/app/moments" className="mt-4 inline-block text-sm font-semibold text-rose">Back to Moments</Link>
      </div>
    )
  }
  if (!info?.coupleId) {
    return (
      <div className="px-8 pt-16 text-center">
        <p className="text-sm text-ink-muted">Connect with your partner first to save a moment.</p>
        <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-rose">Go to Profile</Link>
      </div>
    )
  }
  return <MomentForm info={{ ...info, coupleId: info.coupleId }} prefill={prefill} />
}
