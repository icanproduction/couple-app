'use client'

import { useState, useRef } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface AvatarUploadProps {
  userId: string
  currentUrl: string | null
  name: string | null
  size?: 'sm' | 'md' | 'lg'
  editable?: boolean
  onUploaded?: (url: string) => void
}

const SIZES = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-16 w-16 text-lg',
  lg: 'h-24 w-24 text-2xl',
}

const CAMERA_SIZES = {
  sm: 'h-4 w-4 -bottom-0.5 -right-0.5 p-0.5',
  md: 'h-6 w-6 -bottom-0.5 -right-0.5 p-1',
  lg: 'h-8 w-8 -bottom-1 -right-1 p-1.5',
}

export default function AvatarUpload({
  userId, currentUrl, name, size = 'md', editable = false, onUploaded,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(currentUrl)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const initial = (name || '?')[0].toUpperCase()

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${userId}/avatar.${ext}`

    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { setUploadError('Gagal upload foto. Coba lagi ya.'); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`

    const { error: saveError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
    setUploading(false)
    if (saveError) { setUploadError('Foto belum tersimpan. Coba lagi ya.'); return }
    setAvatarUrl(url)
    onUploaded?.(url)
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => editable && fileRef.current?.click()}
        disabled={uploading || !editable}
        className={`relative flex items-center justify-center rounded-full overflow-hidden border-2 border-white shadow-md ${SIZES[size]} ${
          editable ? 'cursor-pointer' : 'cursor-default'
        } ${avatarUrl ? '' : 'bg-gradient-to-br from-rose/20 to-purple-100'}`}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-rose" />
        ) : avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar from Supabase public storage (host differs per environment), next/image would need every host whitelisted
          <img src={avatarUrl} alt={name ?? 'Avatar'} className="h-full w-full object-cover" />
        ) : (
          <span className="font-bold text-rose">{initial}</span>
        )}
      </button>

      {editable && !uploading && (
        <div className={`absolute flex items-center justify-center rounded-full bg-rose text-white shadow-sm ${CAMERA_SIZES[size]}`}>
          <Camera className="h-full w-full" />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      {uploadError && (
        <p className="absolute left-1/2 top-full mt-1 w-40 -translate-x-1/2 text-center text-[10px] font-medium text-red-500">
          {uploadError}
        </p>
      )}
    </div>
  )
}
