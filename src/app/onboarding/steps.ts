// Where a signed-in user belongs. Kept free of imports so the middleware
// (edge runtime), the login page and the onboarding pages share one rule.

export interface OnboardingState {
  hasName: boolean
  hasCouple: boolean
  isAdmin?: boolean
}

/** The onboarding step the user still has to finish, or null when /app is usable. */
export function pendingOnboardingStep({ hasName, hasCouple }: OnboardingState): string | null {
  if (!hasName) return hasCouple ? '/onboarding/profile' : '/onboarding/welcome'
  if (!hasCouple) return '/onboarding/couple'
  return null
}

/** Landing page after sign-in. Admins without a couple go to the admin panel. */
export function homeFor(state: OnboardingState): string {
  const step = pendingOnboardingStep(state)
  if (!step) return '/app/home'
  return state.isAdmin ? '/admin' : step
}

/** Invite codes are A–Z/0–9 only; anything else in a URL is dropped. */
export function cleanInviteCode(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
}

/** Only same-site relative paths may be used as a post-auth redirect target. */
export function safeNextPath(raw: string | null | undefined, fallback = '/app/home'): string {
  // No "//host", no backslashes or control/space chars (URL parsers drop
  // tabs and newlines, which would turn "/\t/evil.com" into "//evil.com").
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (Array.from(raw).some((ch) => ch === '\\' || ch.charCodeAt(0) <= 0x20)) return fallback
  return raw
}
