'use client'

// <img> for a photo behind a short-lived signed URL. When the URL has expired
// by the time the browser loads it (a page left open, a lazy image scrolled
// into view later), it asks for a fresh URL once and shows that instead.
import { useRef, useState, type ImgHTMLAttributes } from 'react'
import { resignPhotoPath } from '@/lib/moments'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string
  /** storage path, used to sign a new URL */
  path: string
}

export default function SignedPhoto({ src, path, alt = '', ...rest }: Props) {
  // The replacement belongs to the src it replaced; a new src from the parent wins.
  const [fresh, setFresh] = useState<{ from: string; url: string } | null>(null)
  const retriedFor = useRef<string | null>(null)
  const shown = fresh?.from === src ? fresh.url : src

  function handleError() {
    if (retriedFor.current === src) return
    retriedFor.current = src
    const from = src
    resignPhotoPath(path)
      .then((url) => { if (url) setFresh({ from, url }) })
      .catch(() => undefined)
  }

  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
  return <img {...rest} src={shown} alt={alt} onError={handleError} />
}
