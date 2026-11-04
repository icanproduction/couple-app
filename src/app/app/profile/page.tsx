'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LogOut, Heart, ChevronRight, Pencil, Check, Link2, Copy,
  User, Wallet, CalendarDays, Gamepad2,
  Mail, HelpCircle, Shield, MessageCircle, Users, Plus, LayoutDashboard,
  Bell, Download, HeartCrack, Trash2, Archive, Sprout,
} from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import {
  createCouple, getMyCouple, isCoupleHasDataError, isExpiredInviteError, joinCouple, leaveCouple, seedCalendarEvents,
  type MyCouple,
} from '@/lib/couple'
import { signOutCompletely } from '@/lib/session'
import { daysSince, formatDateID, getRelationshipLevel, relationshipLevelLabel, todayJakarta } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import NotificationToggle from '@/components/app/NotificationToggle'
import PersonalRoundsSwitch from '@/components/games/samakan/PersonalRoundsSwitch'
import AvatarUpload from '@/components/app/AvatarUpload'
import { InviteExpiry } from '@/components/account/InviteExpiry'
import { ExpiredInviteNotice } from '@/components/account/ExpiredInviteNotice'
import { TypedConfirmModal } from '@/components/account/TypedConfirmModal'
import { DiscardCoupleModal } from '@/components/account/DiscardCoupleModal'
import { exportOutcomeMessage, useDataExport, type ExportOutcome } from '@/components/account/useDataExport'
import { cleanInviteCode } from '@/app/onboarding/steps'

interface ProfileData {
  name: string | null
  gender: string | null
  birthday: string | null
  relationship_start_date: string | null
  avatar_url: string | null
  role: string | null
}

const HELP_ITEMS = [
  {
    q: 'How do I connect with my partner?',
    a: 'Open Profile, then copy or share your invite code. Your partner signs up through that link, or enters the code under Join. A code works for 7 days. If it has expired, tap "New code".',
  },
  {
    q: 'Not getting notifications?',
    a: 'Turn on Notifications in Profile and allow them in your browser. On iPhone, add Nanti Kita to your Home Screen first (iOS 16.4 or later), then turn them on from the app on your Home Screen.',
  },
  {
    q: 'Who can see our data?',
    a: 'Only you and your partner. Moment photos are stored privately, and a letter only opens for the person it is for once its time comes. When you use AI questions, AI Date Ideas or personal rounds in Samakan, the data they need is sent to Claude by Anthropic to be processed. Personal rounds have their own switch in Profile. The details are on the Privacy & Data page.',
  },
  {
    q: 'Forgot password?',
    a: 'Log out first, then tap "Forgot password?" on the Log in page. We will email you a link to set a new password.',
  },
]

function errorText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

export default function ProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [couple, setCouple] = useState<MyCouple | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [notice, setNotice] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  // Edit profile state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editGender, setEditGender] = useState('')
  const [editBirthday, setEditBirthday] = useState('')
  const [editRelDate, setEditRelDate] = useState('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  // Bind partner state
  const [bindMode, setBindMode] = useState<'none' | 'join'>('none')
  const [bindCode, setBindCode] = useState('')
  const [bindError, setBindError] = useState('')
  const [bindLoading, setBindLoading] = useState(false)
  const [creatingCouple, setCreatingCouple] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  // Joining would delete my current space (it holds memories): confirm first.
  const [discardCode, setDiscardCode] = useState<string | null>(null)
  const [discardLoading, setDiscardLoading] = useState(false)
  const [discardError, setDiscardError] = useState('')

  // Data export + danger zone. 'fresh' = "Start fresh" on a closed
  // couple: the same leave flow, which deletes the archive as last member.
  const { exporting, ready: exportReady, exportData, shareReady } = useDataExport()
  const [confirmAction, setConfirmAction] = useState<'leave' | 'delete' | 'fresh' | null>(null)
  const [dangerLoading, setDangerLoading] = useState(false)
  const [dangerError, setDangerError] = useState('')

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const user = await getClientUser()
    if (!user) { router.replace('/auth/login'); return }
    setUserId(user.id)

    try {
      const [{ data: prof, error: profError }, myCouple] = await Promise.all([
        supabase
          .from('profiles')
          .select('name, gender, birthday, relationship_start_date, avatar_url, role')
          .eq('id', user.id)
          .single(),
        getMyCouple(user.id),
      ])
      if (profError) throw new Error(profError.message)
      setProfile(prof)
      setCouple(myCouple)
    } catch (e: unknown) {
      setNotice(`Couldn't load your profile: ${errorText(e, 'try again')}`)
    }
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const hasPartner = (couple?.memberCount ?? 0) >= 2
  // My partner left: I keep the archive, but nobody can join it any more.
  const closed = !!couple?.closedAt && !hasPartner
  const inviteCode = couple && !hasPartner && !closed ? couple.inviteCode : null

  function openEditProfile() {
    setEditName(profile?.name ?? '')
    setEditGender(profile?.gender ?? '')
    setEditBirthday(profile?.birthday ?? '')
    setEditRelDate(profile?.relationship_start_date ?? '')
    setEditError('')
    setEditOpen(true)
  }

  // /app/profile?edit=1 (e.g. from Milestones' "add your start date") opens the
  // edit form once the profile has loaded, then drops the flag from the URL.
  useEffect(() => {
    if (loading || !profile) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('edit') !== '1') return
    openEditProfile()
    params.delete('edit')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per load; openEditProfile only reads profile
  }, [loading, profile])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !editName.trim() || saving) return
    // ISO dates compare as strings; a date picker's max isn't enforced everywhere.
    const today = todayJakarta()
    if (editBirthday && editBirthday > today) {
      setEditError("Your birthday can't be in the future.")
      return
    }
    if (editRelDate && editRelDate > today) {
      setEditError("The day you got together can't be in the future.")
      return
    }
    setSaving(true)
    setEditError('')
    const previous = {
      birthday: profile?.birthday ?? null,
      relationship_start_date: profile?.relationship_start_date ?? null,
    }

    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({
      name: editName.trim(),
      gender: editGender || null,
      birthday: editBirthday || null,
      relationship_start_date: editRelDate || null,
    }).eq('id', userId)

    if (error) {
      setEditError(`Couldn't save your profile: ${error.message}`)
      setSaving(false)
      return
    }

    // Move the auto-created birthday / anniversary events with the new dates.
    if (couple) {
      try {
        await seedCalendarEvents(userId, couple.id, previous)
      } catch {
        setNotice("Profile saved, but the dates on your calendar didn't update.")
      }
    }

    setSaving(false)
    setEditOpen(false)
    loadData()
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOutCompletely()
    } finally {
      // Full reload so nothing of this account stays in memory or the router cache.
      window.location.replace('/auth/login')
    }
  }

  async function handleCreateCouple() {
    if (!userId || creatingCouple) return
    setCreatingCouple(true)
    setBindError('')
    try {
      await createCouple(userId)
      await loadData()
      router.refresh()
    } catch (e: unknown) {
      setBindError(errorText(e, "Couldn't create an invite code"))
    }
    setCreatingCouple(false)
  }

  async function handleJoinPartner(e: React.FormEvent) {
    e.preventDefault()
    const code = cleanInviteCode(bindCode)
    if (!code || !userId || bindLoading) return
    setBindError('')
    setBindLoading(true)

    // The database checks the code, room in the target couple, and only then
    // removes my solo couple: nothing is deleted if the join fails. If that
    // couple holds memories it refuses until I confirm (DiscardCoupleModal).
    try {
      const joinedId = await joinCouple(code, userId)
      if (joinedId === couple?.id) {
        setBindError("That's your own invite code")
        setBindLoading(false)
        return
      }
      await afterJoin()
    } catch (err: unknown) {
      if (isCoupleHasDataError(err)) {
        setDiscardError('')
        setDiscardCode(code)
      } else {
        setBindError(errorText(err, "Couldn't join"))
      }
    }
    setBindLoading(false)
  }

  async function confirmDiscardJoin() {
    if (!discardCode || !userId || discardLoading) return
    setDiscardLoading(true)
    setDiscardError('')
    try {
      await joinCouple(discardCode, userId, { discard: true })
      setDiscardCode(null)
      await afterJoin()
    } catch (err: unknown) {
      setDiscardError(errorText(err, "Couldn't join"))
    }
    setDiscardLoading(false)
  }

  async function afterJoin() {
    setBindMode('none')
    setBindCode('')
    await loadData()
    router.refresh()
  }

  async function copyInviteLink() {
    const link = `${window.location.origin}/invite/${inviteCode}`
    try {
      await navigator.clipboard.writeText(link)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      setBindError(`Couldn't copy. Share this link yourself: ${link}`)
    }
  }

  function shareWhatsApp() {
    const link = `${window.location.origin}/invite/${inviteCode}`
    const text = encodeURIComponent(
      `Hi! Come join me on Nanti Kita.\n\nOpen this link:\n${link}\n\nOr enter the code: *${inviteCode}*`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  // Home-screen apps on iOS can't download files, so the export goes through
  // the share sheet when the device supports sharing files (useDataExport).
  // Success is only claimed once the share or the download actually ran.
  async function handleExport() {
    if (exporting) return
    let message: string | null
    try {
      const outcome: ExportOutcome = exportReady ? await shareReady() : await exportData()
      message = exportOutcomeMessage(outcome)
    } catch (e: unknown) {
      message = `Couldn't export your data: ${errorText(e, 'try again')}`
    }
    if (message) {
      setNotice(message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function openConfirm(action: 'leave' | 'delete' | 'fresh') {
    setDangerError('')
    // The modals echo the export result (see 'fresh'); start without an old one.
    setNotice('')
    setConfirmAction(action)
  }

  async function handleLeaveCouple() {
    setDangerLoading(true)
    setDangerError('')
    try {
      await leaveCouple()
      // Full reload: no cached couple data survives in memory or the router cache.
      window.location.replace('/onboarding/couple?left=1')
    } catch (e: unknown) {
      setDangerError(errorText(e, "Couldn't leave this couple"))
      setDangerLoading(false)
    }
  }

  async function handleDeleteAccount() {
    setDangerLoading(true)
    setDangerError('')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE ACCOUNT' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : "Couldn't delete your account")
      }
    } catch (e: unknown) {
      setDangerError(errorText(e, "Couldn't delete your account"))
      setDangerLoading(false)
      return
    }
    try {
      await signOutCompletely()
    } finally {
      window.location.replace('/')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" /></div>
  }

  // A start date in the future (saved before it was validated) counts as day 0.
  const daysTogether = profile?.relationship_start_date ? Math.max(0, daysSince(profile.relationship_start_date)) : null
  const level = daysTogether !== null ? getRelationshipLevel(daysTogether) : null

  const MENU_ITEMS = [
    { icon: User, label: 'About Me', desc: 'MBTI, love language and more', href: '/app/about-me' },
    { icon: Gamepad2, label: 'Games', desc: 'Samakan, Deep Talk and more', href: '/app/games' },
    { icon: Wallet, label: 'Money', desc: 'Savings and Wishlist', href: '/app/finance' },
    { icon: CalendarDays, label: 'Calendar', desc: 'Big days and date plans', href: '/app/calendar' },
    { icon: Mail, label: 'Letters', desc: 'Write a locked letter', href: '/app/letters' },
  ]

  const SETTING_ITEMS = [
    { icon: LayoutDashboard, label: 'Admin Panel', show: profile?.role === 'admin', action: () => router.push('/admin') },
    { icon: Bell, label: 'Notifications', show: true, action: () => router.push('/app/profile/notifikasi') },
    { icon: Download, label: exporting ? 'Preparing your data...' : exportReady ? 'Save my data file' : 'Export my data', show: true, action: handleExport },
    { icon: HelpCircle, label: 'Help', show: true, action: () => setHelpOpen(true) },
    { icon: Shield, label: 'Privacy Policy', show: true, action: () => router.push('/privasi') },
  ]

  return (
    <div className="animate-fade-in pb-6">
      <div className="border-b border-border bg-white px-6 py-5">
        <h1 className="text-xl font-bold text-ink">Profile</h1>
      </div>

      <div className="space-y-5 px-6 pt-5">
        {notice && (
          <div className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3">
            <p className="flex-1 text-xs leading-relaxed text-ink-light">{notice}</p>
            {exportReady && (
              <button onClick={handleExport} className="text-xs font-semibold text-rose hover:text-rose-dark">
                Save file
              </button>
            )}
            <button onClick={() => setNotice('')} className="text-xs font-semibold text-ink-muted hover:text-ink">
              Close
            </button>
          </div>
        )}

        {/* ===== PROFILE CARD with edit ===== */}
        <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
          <div className="flex items-center gap-4">
            {userId && (
              <AvatarUpload
                userId={userId}
                currentUrl={profile?.avatar_url ?? null}
                name={profile?.name ?? null}
                size="md"
                editable
                onUploaded={(url) => setProfile(p => p ? { ...p, avatar_url: url } : p)}
              />
            )}
            <div className="flex-1">
              <p className="text-lg font-bold text-ink">{profile?.name ?? 'You'}</p>
              {profile?.birthday && (
                <p className="text-xs text-ink-muted">Birthday: {formatDateID(profile.birthday)}</p>
              )}
            </div>
            <button onClick={openEditProfile} aria-label="Edit profile" className="rounded-xl bg-cream p-2 hover:bg-rose-50">
              <Pencil className="h-4 w-4 text-ink-muted" />
            </button>
          </div>

          {daysTogether !== null && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3">
              <Heart className="h-4 w-4 text-rose" strokeWidth={2} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{daysTogether.toLocaleString('en-GB')} {daysTogether === 1 ? 'day' : 'days'} together</p>
                {profile?.relationship_start_date && (
                  <p className="text-xs text-ink-muted">Since {formatDateID(profile.relationship_start_date)}</p>
                )}
              </div>
              {level && (
                <span className="rounded-full bg-rose/10 px-3 py-1 text-xs font-bold text-rose">{relationshipLevelLabel(level)}</span>
              )}
            </div>
          )}
        </div>

        {/* ===== MEMORY ARCHIVE (partner left; archive only, no invite code) ===== */}
        {closed && (
          <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cream">
                <Archive className="h-4 w-4 text-ink-muted" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-ink">Memory archive</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  Your partner has left. Your memories together are still kept here.
                </p>
                {couple?.closedAt && (
                  <p className="mt-1 text-[11px] text-ink-muted/70">Closed on {formatDateID(todayJakarta(new Date(couple.closedAt)))}</p>
                )}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={handleExport} disabled={exporting}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-white p-3 text-left hover:border-rose disabled:opacity-60">
                <Download className="h-4 w-4 text-ink-muted" />
                <span className="flex-1 text-sm font-semibold text-ink">
                  {exporting ? 'Preparing your data...' : exportReady ? 'Save my data file' : 'Export my data'}
                </span>
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              </button>
              <button onClick={() => openConfirm('fresh')}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-white p-3 text-left hover:border-rose">
                <Sprout className="h-4 w-4 text-sage-dark" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">Start fresh</p>
                  <p className="text-xs text-ink-muted">Delete this archive, then start a new space or join with a code</p>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              </button>
            </div>
          </div>
        )}

        {/* ===== CONNECT YOUR PARTNER (only when solo) ===== */}
        {!hasPartner && !closed && (
          <div className="rounded-2xl border border-rose/20 bg-gradient-to-br from-rose-50 to-white p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-rose" />
              <h3 className="text-sm font-bold text-ink">Connect with your partner</h3>
            </div>

            {bindMode === 'none' ? (
              <div className="space-y-3">
                {/* Option 1: Share my code, or make one first */}
                {inviteCode ? (
                  <div className="rounded-xl border border-border bg-white p-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">Your invite code</p>
                    <p className="mb-3 font-mono text-2xl font-bold tracking-[0.2em] text-rose">{inviteCode}</p>
                    <div className="flex gap-2">
                      <button onClick={copyInviteLink}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-semibold text-ink-muted hover:border-rose hover:text-rose">
                        {codeCopied ? <><Check className="h-3 w-3 text-sage-dark" /> Copied</> : <><Copy className="h-3 w-3" /> Copy link</>}
                      </button>
                      <button onClick={shareWhatsApp}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] py-2 text-xs font-semibold text-white">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </button>
                    </div>
                    {couple && (
                      <InviteExpiry
                        className="mt-3 border-t border-border pt-3"
                        expiresAt={couple.inviteExpiresAt}
                        onRenewed={(next) => {
                          setCodeCopied(false)
                          setCouple((c) => c ? { ...c, ...next } : c)
                        }}
                      />
                    )}
                  </div>
                ) : !couple && (
                  <button onClick={handleCreateCouple} disabled={creatingCouple}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-white p-3 text-left hover:border-rose disabled:opacity-60">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50">
                      <Plus className="h-4 w-4 text-rose" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {creatingCouple ? 'Creating code...' : 'Create an invite code'}
                      </p>
                      <p className="text-xs text-ink-muted">Share it with your partner so they can join</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-muted" />
                  </button>
                )}

                {/* Option 2: Enter partner's code */}
                <button onClick={() => { setBindError(''); setBindMode('join') }}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-white p-3 text-left hover:border-rose">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sage/15">
                    <Link2 className="h-4 w-4 text-sage-dark" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">Got a code from your partner?</p>
                    <p className="text-xs text-ink-muted">Enter their invite code</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted" />
                </button>

                {bindError && <p className="break-all text-xs text-danger">{bindError}</p>}
              </div>
            ) : (
              /* Join mode: enter partner's code */
              <form onSubmit={handleJoinPartner} className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Enter invite code"
                    value={bindCode}
                    onChange={e => setBindCode(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 font-mono text-center text-lg font-bold tracking-widest text-ink placeholder:text-ink-muted/40 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
                    maxLength={8}
                    autoFocus
                    aria-label="Your partner's invite code"
                  />
                  {bindError && (isExpiredInviteError(bindError)
                    ? <div className="mt-2"><ExpiredInviteNotice /></div>
                    : <p className="mt-1 text-xs text-danger">{bindError}</p>)}
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={bindLoading} size="sm">Join</Button>
                  <button type="button" onClick={() => { setBindMode('none'); setBindError('') }}
                    className="px-4 py-2 text-sm text-ink-muted">Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ===== NOTIFICATION TOGGLE ===== */}
        <NotificationToggle />

        {/* ===== SAMAKAN PERSONAL ROUNDS (a couple switch) ===== */}
        {couple && hasPartner && <PersonalRoundsSwitch coupleId={couple.id} />}

        {/* ===== MORE ===== */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted/50">
            More
          </p>
          <div className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
            {MENU_ITEMS.map((item, i) => {
              const Icon = item.icon
              return (
                <button key={item.label} onClick={() => router.push(item.href)}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-cream ${
                    i < MENU_ITEMS.length - 1 ? 'border-b border-border' : ''
                  }`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream">
                    <Icon className="h-4 w-4 text-ink-muted" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="text-[11px] text-ink-muted">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted/40" />
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== SETTINGS ===== */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted/50">
            Settings
          </p>
          <div className="rounded-2xl border border-border bg-white shadow-card overflow-hidden">
            {SETTING_ITEMS.filter(s => s.show).map((item, i, arr) => {
              const Icon = item.icon
              return (
                <button key={item.label} onClick={item.action}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-cream ${
                    i < arr.length - 1 ? 'border-b border-border' : ''
                  }`}>
                  <Icon className="h-4 w-4 text-ink-muted" strokeWidth={2} />
                  <span className="text-sm font-medium text-ink">{item.label}</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-ink-muted/40" />
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== SIGN OUT ===== */}
        <Button onClick={handleSignOut} loading={signingOut} variant="danger" size="lg">
          <span className="flex items-center gap-2"><LogOut className="h-4 w-4" /> Log out</span>
        </Button>

        {/* ===== DANGER ZONE ===== */}
        <div className="pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-danger/70">
            Danger zone
          </p>
          <div className="overflow-hidden rounded-2xl border border-danger/20 bg-white shadow-card">
            {/* A closed couple leaves through "Start fresh" above. */}
            {couple && !closed && (
              <button onClick={() => openConfirm('leave')}
                className="flex w-full items-center gap-3 border-b border-danger/10 px-4 py-3.5 text-left hover:bg-danger/5">
                <HeartCrack className="h-4 w-4 text-danger" strokeWidth={2} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-danger">Leave this couple</p>
                  <p className="text-[11px] text-ink-muted">Unlink your account from your partner&apos;s</p>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-muted/40" />
              </button>
            )}
            <button onClick={() => openConfirm('delete')}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-danger/5">
              <Trash2 className="h-4 w-4 text-danger" strokeWidth={2} />
              <div className="flex-1">
                <p className="text-sm font-medium text-danger">Delete account</p>
                <p className="text-[11px] text-ink-muted">Delete your account and personal data for good</p>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted/40" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== CONFIRM: LEAVE THIS COUPLE ===== */}
      <TypedConfirmModal
        open={confirmAction === 'leave'}
        onClose={() => setConfirmAction(null)}
        title="Leave this couple?"
        phrase="LEAVE"
        confirmLabel="Leave this couple"
        loading={dangerLoading}
        error={dangerError}
        onConfirm={handleLeaveCouple}
      >
        {hasPartner ? (
          <>
            <p>
              Your shared data (moments, savings, calendar, letters, Bucket List and more)
              <span className="font-semibold text-ink"> stays saved for your partner</span>,
              but you won&apos;t be able to open it after you leave.
            </p>
            <p>
              This space then closes: nobody can join it again, including you. Your personal quiz results go with you.
            </p>
          </>
        ) : (
          <p>
            You&apos;re the only member here, so
            <span className="font-semibold text-danger"> all of this couple&apos;s data will be deleted for good</span>,
            including Moment photos.
          </p>
        )}
        <p>After that you can start a new couple or join one with an invite code.</p>
        <p className="text-xs">Want a copy first? Use &ldquo;Export my data&rdquo; in Settings.</p>
      </TypedConfirmModal>

      {/* ===== CONFIRM: START FRESH (closed couple → leave as last member) ===== */}
      <TypedConfirmModal
        open={confirmAction === 'fresh'}
        onClose={() => setConfirmAction(null)}
        title="Start fresh?"
        phrase="DELETE ARCHIVE"
        confirmLabel="Delete archive"
        loading={dangerLoading}
        error={dangerError}
        onConfirm={handleLeaveCouple}
      >
        <p>
          The memory archive with your previous partner will be
          <span className="font-semibold text-danger"> deleted for good and can&apos;t be recovered</span>:
          moments and their photos, letters, savings, calendar, Bucket List, Jar, moods and more.
        </p>
        <p>Your account stays. After this you can start a new space or join one with an invite code.</p>
        <p className="text-xs">
          Want a copy first?{' '}
          <button type="button" onClick={handleExport} disabled={exporting || dangerLoading}
            className="font-semibold text-rose underline-offset-2 hover:underline disabled:opacity-60">
            {exporting ? 'Preparing your data...' : exportReady ? 'Save my data file' : 'Export my data'}
          </button>
        </p>
        {notice && <p className="text-[11px] leading-relaxed text-ink-light">{notice}</p>}
      </TypedConfirmModal>

      {/* ===== CONFIRM: JOINING DELETES THE CURRENT SPACE ===== */}
      <DiscardCoupleModal
        open={discardCode !== null}
        onClose={() => setDiscardCode(null)}
        onConfirm={confirmDiscardJoin}
        loading={discardLoading}
        error={discardError}
        closed={closed}
      />

      {/* ===== CONFIRM: DELETE ACCOUNT ===== */}
      <TypedConfirmModal
        open={confirmAction === 'delete'}
        onClose={() => setConfirmAction(null)}
        title="Delete your account for good?"
        phrase="DELETE ACCOUNT"
        confirmLabel="Delete account"
        loading={dangerLoading}
        error={dangerError}
        onConfirm={handleDeleteAccount}
      >
        <p>
          <span className="font-semibold text-danger">Your account will be deleted for good and can&apos;t be recovered.</span>{' '}
          Your profile, profile photo, quiz results, daily answers and moods go with it.
        </p>
        {hasPartner ? (
          <p>
            The moments, savings, calendar and Bucket List you filled in together stay saved for your partner.
            Letters and Jar notes between you two are deleted too.
          </p>
        ) : couple ? (
          <p>You&apos;re the only member, so all of this couple&apos;s data is deleted too, including Moment photos.</p>
        ) : null}
        <p className="text-xs">Want a copy first? Use &ldquo;Export my data&rdquo; in Settings.</p>
      </TypedConfirmModal>

      {/* ===== HELP SHEET ===== */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Help">
        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {HELP_ITEMS.map((item) => (
            <div key={item.q}>
              <p className="text-sm font-semibold text-ink">{item.q}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </Modal>

      {/* ===== EDIT PROFILE MODAL ===== */}
      <Modal open={editOpen} onClose={() => { if (!saving) setEditOpen(false) }} title="Edit profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Nickname</label>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              placeholder="Your name" required
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Gender</label>
            <div className="flex gap-2">
              {(['male', 'female'] as const).map(g => (
                <button key={g} type="button" onClick={() => setEditGender(g)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                    editGender === g ? 'border-rose bg-rose-50 text-rose' : 'border-border text-ink-muted hover:border-rose'
                  }`}>
                  {g === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Birthday</label>
            <input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} max={todayJakarta()}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">Together since</label>
            <input type="date" value={editRelDate} onChange={e => setEditRelDate(e.target.value)} max={todayJakarta()}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20" />
          </div>
          {editError && <p className="text-xs text-danger">{editError}</p>}
          <Button type="submit" loading={saving} size="lg">
            <span className="flex items-center gap-2"><Check className="h-4 w-4" /> Save</span>
          </Button>
        </form>
      </Modal>
    </div>
  )
}
