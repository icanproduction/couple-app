import BottomNav from '@/components/app/BottomNav'

// The middleware already requires a signed-in user with a name and a couple
// (unfinished accounts are sent back to onboarding) — no duplicate check here.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen">
      <div className="pb-24">
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
