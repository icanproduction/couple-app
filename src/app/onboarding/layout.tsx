'use client'

import { usePathname } from 'next/navigation'

const STEPS = [
  { path: '/onboarding/welcome', label: 'Start' },
  { path: '/onboarding/profile', label: 'Profile' },
  { path: '/onboarding/couple', label: 'Partner' },
  { path: '/onboarding/invite', label: 'Invite' },
  { path: '/onboarding/install', label: 'Install' },
]

function StepIndicator() {
  const pathname = usePathname()
  const currentStep = STEPS.findIndex(s => pathname.startsWith(s.path))

  // Don't show on welcome screen
  if (currentStep <= 0) return null

  // Steps 1-5 (skip welcome in the display)
  const visibleSteps = STEPS.slice(1)
  const dotIndex = currentStep - 1

  return (
    <div className="px-2 pt-6 pb-2">
      <div className="flex items-center justify-between">
        {visibleSteps.map((step, i) => {
          const isActive = i === dotIndex
          const isDone = i < dotIndex
          const isLast = i === visibleSteps.length - 1

          return (
            <div key={step.path} className="flex flex-1 items-center">
              {/* Circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    isActive
                      ? 'bg-rose text-white shadow-glow scale-110'
                      : isDone
                      ? 'bg-rose/20 text-rose'
                      : 'bg-border text-ink-muted'
                  }`}
                >
                  {isDone ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </div>
                <span className={`text-[9px] font-semibold uppercase tracking-wide ${
                  isActive ? 'text-rose' : isDone ? 'text-rose/50' : 'text-ink-muted/50'
                }`}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="mx-1 h-0.5 flex-1 rounded-full mt-[-14px]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isDone ? 'bg-rose/30' : 'bg-border'
                    }`}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-6 py-4">
      <StepIndicator />
      <div className="flex-1 py-4">{children}</div>
    </div>
  )
}
