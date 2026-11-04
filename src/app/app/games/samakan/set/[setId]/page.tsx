'use client'

import { useParams } from 'next/navigation'
import SetScreen from '@/components/games/samakan/SetScreen'

// The static "set" segment outranks the legacy [sessionId] route, so old push
// links still open the read-only older game.
export default function SamakanSetPage() {
  const params = useParams<{ setId: string }>()
  const setId = typeof params?.setId === 'string' ? params.setId : ''
  return <SetScreen key={setId} setId={setId} />
}
