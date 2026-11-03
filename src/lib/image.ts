// Client-side photo shrinking before upload: phone photos are 3–10 MB, a
// moment can hold 7 of them, and the scrapbook only needs ~1600px.

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  // createImageBitmap applies EXIF orientation with 'from-image'.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older Safari rejects the options bag — fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Resize to fit 1600px and re-encode as JPEG. Throws a user-facing message on undecodable files (e.g. HEIC on desktop Chrome). */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  let source: Awaited<ReturnType<typeof decode>>
  try {
    source = await decode(file)
  } catch {
    throw new Error('Format foto tidak didukung. Coba pilih foto JPG atau PNG.')
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak bisa memproses foto.')
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source && typeof source.close === 'function') source.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Gagal memproses foto.')
  return { blob, width, height }
}
