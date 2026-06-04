import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * Shareable result card (4:5 portrait, IG-friendly) rendered with Satori via
 * next/og. Premium feature. Example:
 *   /api/share-card?score=82&label=Sangat%20Siap!
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const score = Math.max(0, Math.min(100, parseInt(searchParams.get('score') ?? '0', 10) || 0))
  const label = (searchParams.get('label') ?? 'Kesiapan Hubungan').slice(0, 40)

  // Color by score band
  const accent = score >= 80 ? '#5B8C6E' : score >= 60 ? '#7BA98C' : score >= 40 ? '#C9A227' : '#D9534F'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFF5F7 0%, #FDF0E6 100%)',
          padding: '80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: '#9A8C90',
            marginBottom: 24,
          }}
        >
          Skor Kesiapan
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            color: accent,
            fontSize: 300,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {score}
          <span style={{ fontSize: 96, marginTop: 40 }}>%</span>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 700,
            color: accent,
            marginTop: 16,
          }}
        >
          {label}
        </div>

        <div
          style={{
            display: 'flex',
            width: 480,
            height: 2,
            background: '#E8D9DD',
            marginTop: 64,
            marginBottom: 32,
          }}
        />

        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#3A3338' }}>
          Couple App
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#9A8C90', marginTop: 8 }}>
          Kesiapan Assessment untuk pasangan
        </div>
      </div>
    ),
    { width: 1080, height: 1350 }
  )
}
