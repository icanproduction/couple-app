'use client'

// Last resort when the root layout itself fails: no app CSS is guaranteed,
// so styles are inline.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#FFF8F0', color: '#2D2424', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24,
        }}
      >
        <div style={{ maxWidth: 320 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>The app hit an error</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#8B7E7E', margin: '0 0 24px' }}>
            Try reloading. If it still fails, close the app and open it again.
          </p>
          <button
            onClick={reset}
            style={{
              width: '100%', border: 0, borderRadius: 16, background: '#F06B6B', color: '#fff',
              fontWeight: 700, fontSize: 14, padding: '14px 24px', cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
