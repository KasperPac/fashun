const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

export async function processImage(imageUri: string): Promise<{
  processedImageUrl: string
  category: string
  colours: string[]
  styleTags: string[]
  suggestedName: string
}> {
  const base64 = await uriToBase64(imageUri)
  const res = await fetch(`${API_BASE}/api/wardrobe/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64 }),
  })
  if (!res.ok) throw new Error('Processing failed')
  return res.json()
}

export async function saveWardrobeItem(item: {
  name: string
  category: string
  colours: string[]
  styleTags: string[]
  imageUrl: string
  ownership: 'owned' | 'wishlist'
}) {
  const res = await fetch(`${API_BASE}/api/wardrobe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!res.ok) throw new Error('Save failed')
  return res.json()
}

async function uriToBase64(uri: string): Promise<string> {
  const { FileSystem } = await import('expo-file-system')
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return base64
}
