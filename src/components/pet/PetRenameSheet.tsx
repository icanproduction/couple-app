'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PET_RULES } from '@/types/pet'
import { PetError, rename } from './api'

interface Props {
  open: boolean
  onClose: () => void
  petId: string
  name: string
  onRenamed: (name: string) => void
}

const MAX = PET_RULES.limits.name_max

export default function PetRenameSheet({ open, onClose, petId, name, onRenamed }: Props) {
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setValue(name); setError('') }
  }, [open, name])

  const clean = value.trim()
  const valid = clean.length >= 1 && clean.length <= MAX

  async function save() {
    if (!valid || saving) return
    if (clean === name) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      onRenamed(await rename(petId, clean))
      onClose()
    } catch (e) {
      setError(e instanceof PetError ? e.message : "Couldn't rename just now. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Rename">
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <label htmlFor="pet-rename" className="mb-1.5 block text-sm font-medium text-ink-light">New name</label>
        <div className="relative">
          <input
            id="pet-rename"
            value={value}
            maxLength={MAX}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 pr-14 text-sm text-ink outline-none focus:border-rose"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">{clean.length}/{MAX}</span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Either of you can rename it. Your partner sees the new name in Activity.</p>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-ink-light" role="alert">{error}</p>}
        <Button type="submit" className="mt-5" loading={saving} disabled={!valid}>Save name</Button>
      </form>
    </Modal>
  )
}
