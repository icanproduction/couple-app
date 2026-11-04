import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * The v1 live lobby is retired (Samakan v2, 2026-11-04). An old client that
 * still posts here learns to refresh; nothing is created and nobody is pushed.
 * New sets start at POST /api/games/samakan/sets.
 */
export async function POST() {
  return NextResponse.json({ error: 'This version of Samakan was retired. Refresh the app.' }, { status: 410 })
}
