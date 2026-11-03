import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import ViewportShell from '@/components/admin/ViewportShell'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-dm-sans',
})

const DESCRIPTION = 'An app for couples in Indonesia: shared savings, a calendar for your dates, letters that open on a day you choose, and questions to talk about together.'

export const metadata: Metadata = {
  title: 'Nanti Kita',
  description: DESCRIPTION,
  keywords: ['couple', 'relationship', 'indonesia', 'couples app', 'shared savings'],
  openGraph: {
    title: 'Nanti Kita',
    description: DESCRIPTION,
    siteName: 'Nanti Kita',
    locale: 'en_GB',
    type: 'website',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FFF8F0',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${dmSans.className} min-h-screen bg-cream antialiased`}>
        <ViewportShell>
          {children}
        </ViewportShell>
        <PWARegister />
      </body>
    </html>
  )
}
