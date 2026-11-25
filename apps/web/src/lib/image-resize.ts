const MAX_EDGE = 1024
/** Wardrobe garment photos keep about 2048px, so stripes and buttons survive until try-on. */
export const WARDROBE_PHOTO_MAX_EDGE = 2048
const JPEG_QUALITY = 0.85

/** Shrinks a photo to a JPEG no larger than maxEdge px (1024 unless told otherwise) and returns it as base64 without the data: prefix. */
export async function photoToJpegBase64(file: File, maxEdge: number = MAX_EDGE): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/** Shrinks a photo to a JPEG with its long edge at most maxEdge px. Rejects when the file isn't a readable image. */
export async function photoToJpegBlob(file: File, maxEdge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))), 'image/jpeg', JPEG_QUALITY)
  })
}
