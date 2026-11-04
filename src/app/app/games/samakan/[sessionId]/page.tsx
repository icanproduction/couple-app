'use client'

import { useParams } from 'next/navigation'
import { OlderGameView } from '@/components/games/samakan/OlderGames'

// A game from the first version of Samakan (old push links land here too).
// Read-only: the table no longer takes writes from the app.
export default function SamakanOlderGamePage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : ''
  return <OlderGameView key={sessionId} sessionId={sessionId} />
}
