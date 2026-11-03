'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, ArrowRight, Clock, Shield, BarChart3 } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

export default function SpendingHabitsIntro() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const user = await getClientUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data: membership } = await supabase
        .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()

      if (membership?.couple_id) {
        const { data } = await supabase
          .from('spending_results')
          .select('id')
          .eq('couple_id', membership.couple_id)
          .eq('profile_id', user.id)
          .maybeSingle()
        // Navigate from the effect, never during render
        if (data) { router.replace('/app/about-me/spending-habits/result'); return }
      }
      setLoading(false)
    }
    check()
  }, [router])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  return (
    <div className="animate-fade-in flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-100 to-rose-100">
        <Wallet className="h-10 w-10 text-amber-600" strokeWidth={1.5} />
      </div>

      <h1 className="mb-2 text-2xl font-extrabold text-ink">Spending Habits</h1>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-ink-muted">
        Find your spending personality and see how your money style fits with your partner&apos;s.
      </p>

      <div className="mb-8 flex items-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> 3–5 min</span>
        <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" /> 15 questions</span>
        <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Private</span>
      </div>

      <p className="mb-8 max-w-xs text-xs text-ink-muted/70">
        Pick the answer that sounds most like you, not the ideal one. There are no right or wrong answers.
      </p>

      <Button onClick={() => router.push('/app/about-me/spending-habits/questions')} size="lg">
        <span className="flex items-center gap-2">
          Start test <ArrowRight className="h-4 w-4" />
        </span>
      </Button>
    </div>
  )
}
