import { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'

interface Props {
  onCapture: (uri: string) => void
}

export default function CameraCapture({ onCapture }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)

  async function takePhoto() {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 })
    if (photo?.uri) onCapture(photo.uri)
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      onCapture(result.assets[0].uri)
    }
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>Camera access needed to photograph your clothes</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={pickFromLibrary}>
          <Text style={styles.secondaryButtonText}>Pick from library instead</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.guide} />
          <Text style={styles.hint}>Fit your garment in the frame</Text>
        </View>
      </CameraView>
      <View style={styles.controls}>
        <TouchableOpacity style={styles.libraryBtn} onPress={pickFromLibrary}>
          <Text style={styles.libraryBtnText}>📁</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>
        <View style={{ width: 44 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20 },
  guide: {
    position: 'absolute',
    top: 40, bottom: 40, left: 40, right: 40,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.5)',
    borderRadius: 12,
  },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 10 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 24,
    backgroundColor: '#000',
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  libraryBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  libraryBtnText: { fontSize: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#000', gap: 16 },
  subtitle: { color: '#666', textAlign: 'center', fontSize: 14 },
  button: { backgroundColor: '#9333ea', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { paddingVertical: 8 },
  secondaryButtonText: { color: '#666', fontSize: 13 },
})
