import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  Image, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import CameraCapture from '../../../components/CameraCapture'
import { processImage, saveWardrobeItem } from '../../../lib/api'

type Stage = 'camera' | 'processing' | 'confirming' | 'saving'

export default function AddItemScreen() {
  const [stage, setStage] = useState<Stage>('camera')
  const [result, setResult] = useState<Awaited<ReturnType<typeof processImage>> | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleCapture(uri: string) {
    setStage('processing')
    try {
      const data = await processImage(uri)
      setResult(data)
      setName(data.suggestedName)
      setStage('confirming')
    } catch {
      setError('Processing failed — try again')
      setStage('camera')
    }
  }

  async function handleSave() {
    if (!result) return
    setStage('saving')
    await saveWardrobeItem({
      name,
      category: result.category,
      colours: result.colours,
      styleTags: result.styleTags,
      imageUrl: result.processedImageUrl,
      ownership: 'owned',
    })
    router.replace('/(tabs)/wardrobe')
  }

  if (stage === 'camera') return <CameraCapture onCapture={handleCapture} />

  if (stage === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#9333ea" size="large" />
        <Text style={styles.subtitle}>Removing background and tagging…</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Confirm item</Text>
      {result && (
        <Image source={{ uri: result.processedImageUrl }} style={styles.preview} resizeMode="contain" />
      )}
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor="#444"
      />
      <TouchableOpacity
        style={[styles.button, stage === 'saving' && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={stage === 'saving'}
      >
        <Text style={styles.buttonText}>{stage === 'saving' ? 'Saving…' : '✓ Save to Wardrobe'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  preview: { width: '100%', height: 240, backgroundColor: '#111', borderRadius: 16, marginBottom: 8 },
  label: { color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 14, color: '#fff' },
  button: { backgroundColor: '#9333ea', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  subtitle: { color: '#666', fontSize: 13 },
  error: { color: '#f87171', fontSize: 13 },
})
