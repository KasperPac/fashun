export class PhotoroomError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoroomError'
  }
}

/**
 * Remove background from an image using Photoroom API.
 * Returns base64-encoded transparent PNG.
 */
export async function removeBackground(imageBase64: string): Promise<string> {
  const blob = base64ToBlob(imageBase64, 'image/jpeg')
  const form = new FormData()
  form.append('image_file', blob, 'image.jpg')

  const res = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY! },
    body: form,
  })

  if (!res.ok) {
    throw new PhotoroomError(`Photoroom API error: ${res.status}`)
  }

  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Buffer.from(base64, 'base64')
  return new Blob([bytes], { type: mimeType })
}
