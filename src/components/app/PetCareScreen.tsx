'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CARE_ACTION_META, type CareAction } from '@/types/pet'
import { performCareAction, getCareLogsToday } from '@/lib/pet'
import { daysSince, todayJakarta } from '@/lib/dates'

interface Props {
  pet: { id: string; name: string; pet_type: string; level: number; created_at: string | null }
  /** Effective roles from ensureCareRoles() — never empty for a member */
  myActions: CareAction[]
  partnerActions: CareAction[]
  userId: string
  partnerId: string | null
  partnerName: string
}

/** done_by is null once the person who did it deleted their account */
interface CareLog { action_type: string; done_by: string | null; done_at: string | null }

const ACTION_EMOJIS: Record<CareAction, string> = {
  feed: '🍖', play: '🎾', bath: '🛁', treat: '🍪', walk: '🏃', cuddle: '💬',
}

const ACTION_COLORS: Record<string, string> = {
  feed: 'bg-[#FFE8E0]', play: 'bg-[#E0EEFF]', bath: 'bg-[#E0F5EC]',
  treat: 'bg-[#FFF8DC]', walk: 'bg-[#E0EEFF]', cuddle: 'bg-[#FFF8DC]',
}

export default function PetCareScreen({ pet, myActions, partnerActions, userId, partnerId, partnerName }: Props) {
  const router = useRouter()
  const [doneLogs, setDoneLogs] = useState<CareLog[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const today = new Date()
  // "Day N": adoption day is day 1 (Jakarta calendar days)
  const dayNumber = pet.created_at ? Math.max(0, daysSince(todayJakarta(new Date(pet.created_at)))) + 1 : 1

  const loadLogs = useCallback(async () => {
    const logs = await getCareLogsToday(pet.id)
    setDoneLogs(logs)
  }, [pet.id])

  useEffect(() => { loadLogs() }, [loadLogs])

  // Each action once in the checklist (a shared action appears under me)
  const partnerOnly = partnerActions.filter(a => !myActions.includes(a))
  const allActions = [...myActions, ...partnerOnly]

  const isDoneByAnyone = (action: CareAction) => doneLogs.some(l => l.action_type === action)
  const getLogFor = (action: CareAction) => doneLogs.find(l => l.action_type === action)
  const whoDid = (log: CareLog | undefined) =>
    log?.done_by === userId ? 'You' : log && !log.done_by ? 'Deleted account' : partnerName
  const totalTasks = allActions.length
  const doneTasks = allActions.filter(a => isDoneByAnyone(a)).length

  const handleAction = async (action: CareAction) => {
    if (actionLoading) return
    setActionLoading(action)
    setActionError('')
    try {
      const meta = CARE_ACTION_META[action]
      await performCareAction(pet.id, action, userId, meta)

      // Send push to partner
      if (partnerId) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: partnerId,
            title: `${pet.name} got some care`,
            body: `Your partner just ticked off "${meta.label}" for ${pet.name}`,
            url: '/app/pet/care',
            kind: 'activity',
          }),
        }).catch(() => {})
      }

      await loadLogs()
    } catch (e) {
      setActionError(e instanceof Error && e.message.includes('cooldown')
        ? `"${CARE_ACTION_META[action].label}" was just done. Give it a little while.`
        : "Couldn't save that. Try again.")
    } finally {
      setActionLoading(null)
    }
  }

  const circumference = 2 * Math.PI * 19
  const progressOffset = circumference - (doneTasks / Math.max(totalTasks, 1)) * circumference

  return (
    <div className="min-h-[100dvh] bg-cream animate-fade-in">
      {/* Hero */}
      <div className="px-4 pt-4 pb-5" style={{ background: 'linear-gradient(160deg, #FFE0CC 0%, #FFF2E8 100%)' }}>
        <div className="flex items-center gap-3 mb-3.5">
          <button onClick={() => router.back()} aria-label="Back" className="p-1">
            <ArrowLeft className="w-5 h-5 text-ink" />
          </button>
          <div className="w-12 h-12 bg-[#FFD0B0] rounded-2xl flex items-center justify-center text-[26px]">
            {pet.pet_type === 'cat' ? '🐱' : '🐶'}
          </div>
          <div>
            <div className="text-[17px] font-bold text-ink">Care for {pet.name}</div>
            <div className="text-[11px] text-ink-muted">
              {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })} · Day {dayNumber}
            </div>
          </div>
        </div>

        {/* Progress card */}
        <div className="bg-white/75 rounded-2xl p-3 flex items-center gap-3.5">
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg className="transform -rotate-90" width="48" height="48">
              <circle cx="24" cy="24" r="19" fill="none" stroke="#F0E8E0" strokeWidth="4" />
              <circle
                cx="24" cy="24" r="19" fill="none" stroke="#F06B6B" strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={progressOffset}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-rose">
              {doneTasks}/{totalTasks}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-ink">{doneTasks} of {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} done</div>
            <div className="text-[10px] text-ink-muted mt-0.5">
              {doneTasks === totalTasks ? 'All done!' : `${totalTasks - doneTasks} still to do`}
            </div>
          </div>
          {totalTasks > 0 && doneTasks === totalTasks && (
            <div className="bg-[rgba(94,196,130,0.14)] text-[#3A9E5A] text-[10px] font-bold px-2.5 py-1.5 rounded-[10px]">
              Teamwork
            </div>
          )}
        </div>
      </div>

      {/* Care actions list */}
      <div className="p-3 flex flex-col gap-2">
        {actionError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{actionError}</p>
        )}
        {/* My actions */}
        {myActions.map(action => {
          const done = isDoneByAnyone(action)
          const meta = CARE_ACTION_META[action]
          const isLoading = actionLoading === action
          const log = getLogFor(action)

          return (
            <div
              key={action}
              className={`relative bg-white rounded-[18px] p-3.5 flex items-center gap-3 transition-transform hover:translate-x-0.5 overflow-hidden ${done ? 'opacity-60' : ''}`}
            >
              {/* Left accent */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-[18px] ${done ? 'bg-sage opacity-50' : 'bg-rose'}`} />

              <div className={`w-[42px] h-[42px] rounded-[14px] flex items-center justify-center text-[21px] flex-shrink-0 ${ACTION_COLORS[action]}`}>
                {ACTION_EMOJIS[action]}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-ink">{meta.label}</div>
                <div className={`text-[10px] font-semibold ${done ? 'text-sage-dark' : 'text-rose-dark'}`}>
                  {done
                    ? `${whoDid(log)} · ${formatTimeAgo(log?.done_at ?? null)} ✓`
                    : 'Your task · not done yet'}
                </div>
              </div>
              {done ? (
                <div className="bg-[#EEF9F4] text-sage-dark text-[11px] font-extrabold px-3.5 py-2 rounded-xl">
                  Done
                </div>
              ) : (
                <button
                  onClick={() => handleAction(action)}
                  disabled={isLoading}
                  className="bg-rose text-white text-[11px] font-extrabold px-3.5 py-2 rounded-xl shadow-[0_3px_10px_rgba(240,107,107,0.35)] hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {isLoading ? '...' : 'Do it'}
                </button>
              )}
            </div>
          )
        })}

        {/* Partner actions */}
        {partnerOnly.map(action => {
          const done = isDoneByAnyone(action)
          const meta = CARE_ACTION_META[action]
          const log = getLogFor(action)

          return (
            <div
              key={action}
              className={`relative bg-white rounded-[18px] p-3.5 flex items-center gap-3 overflow-hidden ${done ? 'opacity-60' : ''}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-[18px] ${done ? 'bg-sage opacity-50' : 'bg-[#7BA8E8]'}`} />

              <div className={`w-[42px] h-[42px] rounded-[14px] flex items-center justify-center text-[21px] flex-shrink-0 ${ACTION_COLORS[action]}`}>
                {ACTION_EMOJIS[action]}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-ink">{meta.label}</div>
                <div className={`text-[10px] font-semibold ${done ? 'text-sage-dark' : 'text-[#4A80CC]'}`}>
                  {done
                    ? `${whoDid(log)} · ${formatTimeAgo(log?.done_at ?? null)} ✓`
                    : `${partnerName}'s task · waiting...`}
                </div>
              </div>
              {done ? (
                <div className="bg-[#EEF9F4] text-sage-dark text-[11px] font-extrabold px-3.5 py-2 rounded-xl">
                  Done
                </div>
              ) : (
                <div className="bg-[#EEF3FC] text-[#4A80CC] text-[11px] font-extrabold px-3.5 py-2 rounded-xl">
                  Waiting
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return 'yesterday'
}
