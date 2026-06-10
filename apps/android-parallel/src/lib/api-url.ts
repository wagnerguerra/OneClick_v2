import Constants from 'expo-constants'
import { Platform } from 'react-native'

export function getApiUrl() {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string; EXPO_PUBLIC_API_URL?: string }
    | null
    | undefined
  const configured = extra?.apiUrl || extra?.EXPO_PUBLIC_API_URL
  if (configured) return configured.replace(/\/$/, '')

  const manifest2 = Constants.manifest2 as
    | { extra?: { expoClient?: { hostUri?: string } } }
    | null
    | undefined
  const hostUri = Constants.expoConfig?.hostUri || manifest2?.extra?.expoClient?.hostUri || ''
  const host = hostUri.split(':')[0]

  if (host) return `http://${host}:4000`
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000'
  return 'http://localhost:4000'
}
