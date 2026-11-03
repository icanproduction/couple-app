'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface LettersBannerProps {
  myId: string
  coupleId: string | null
}

export default function LettersBanner({ myId, coupleId }: LettersBannerProps) {
  const router = useRouter()
  const [readyCount, setReadyCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const checkLetters = useCallback(async () => {
    if (!coupleId) { setLoading(false); return }
    const supabase = createClient()
    const now = new Date().toISOString()

    // select('id'): `*` would include the non-granted `content` column (403)
    const { count } = await supabase
      .from('letters')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', myId)
      .eq('is_opened', false)
      .lte('unlock_date', now)

    setReadyCount(count ?? 0)
    setLoading(false)
  }, [myId, coupleId])

  useEffect(() => { checkLetters() }, [checkLetters])

  if (loading) return null

  // If there are ready-to-open letters — show urgent banner
  if (readyCount > 0) {
    return (
      <button
        onClick={() => router.push('/app/letters')}
        className="mx-6 flex w-[calc(100%-3rem)] items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 p-4 text-left shadow-elevated transition-all active:scale-[0.98]"
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm animate-bounce">
          <Mail className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">
            {readyCount} surat siap dibuka!
          </p>
          <p className="text-xs text-white/80">Tap untuk membaca suratnya</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/70" />
      </button>
    )
  }

  // Default: subtle banner
  return (
    <button
      onClick={() => router.push('/app/letters')}
      className="mx-6 flex w-[calc(100%-3rem)] items-center gap-4 rounded-2xl border border-border bg-white p-4 text-left shadow-card transition-all active:scale-[0.98]"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50">
        <Mail className="h-5 w-5 text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-ink">Surat Rahasia</p>
        <p className="text-xs text-ink-muted">Tulis surat terkunci untuk momen spesial</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
    </button>
  )
}
