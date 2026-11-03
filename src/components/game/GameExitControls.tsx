'use client'

import { X, UserX, Loader2 } from 'lucide-react'

/** Top-right close button for game screens that have no score bar. */
export function GameCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Leave the game"
      className="fixed right-4 top-4 z-[70] rounded-full bg-black/30 p-2 backdrop-blur-sm transition-colors hover:bg-black/40 active:scale-95"
    >
      <X className="h-5 w-5 text-white/70" />
    </button>
  )
}

/** "End the game for both of you?" confirmation. */
export function ConfirmExitSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-t-3xl bg-gray-900 px-6 pb-8 pt-6 text-center sm:rounded-3xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold text-white">End the game?</p>
        <p className="mt-2 text-sm text-white/60">
          This ends the game for both of you. Points from this game won&apos;t be saved to your history.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/20 py-3 text-sm font-medium text-white/80 active:scale-95 transition-transform"
          >
            Keep playing
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose py-3 text-sm font-bold text-white shadow-lg shadow-rose/20 active:scale-95 transition-transform"
          >
            End game
          </button>
        </div>
      </div>
    </div>
  )
}

/** Shown when the partner dropped out of the channel mid-game. */
export function PartnerAwayOverlay({
  partnerName, onWait, onEnd,
}: { partnerName: string; onWait: () => void; onEnd: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-gray-900 px-6 py-7 text-center animate-scale-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <UserX className="h-7 w-7 text-white/70" />
        </div>
        <p className="text-lg font-bold text-white">{partnerName} left the game</p>
        <p className="mt-2 text-sm text-white/60">
          Their connection may have dropped. Hang on, the game picks up again as soon as they&apos;re back.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Waiting for {partnerName}...
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onWait}
            className="flex-1 rounded-xl border border-white/20 py-3 text-sm font-medium text-white/80 active:scale-95 transition-transform"
          >
            Wait
          </button>
          <button
            onClick={onEnd}
            className="flex-1 rounded-xl bg-rose py-3 text-sm font-bold text-white shadow-lg shadow-rose/20 active:scale-95 transition-transform"
          >
            End game
          </button>
        </div>
      </div>
    </div>
  )
}

/** Small reminder after "Wait": tap to reopen the choices. */
export function PartnerAwayBanner({ partnerName, onClick }: { partnerName: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-sm"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Waiting for {partnerName} to come back...
    </button>
  )
}
