// Utilitários de push notifications (Expo SDK 56).
// Handler global, registro de canal Android, permissão + obtenção do Expo push token.
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// Handler global: define como notificações recebidas com o app aberto se comportam.
// Campos atuais da API do SDK 56 (substituem o antigo shouldShowAlert).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// Cria o canal 'default' no Android (obrigatório para exibir notificações lá).
export async function registrarCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0ea5e9',
  })
}

// Pede permissão e retorna o Expo push token (ou null se indisponível/negado).
export async function pedirPermissaoEObterToken(): Promise<string | null> {
  // Emulador/simulador não recebe push remoto — só dispositivo físico.
  if (!Device.isDevice) return null

  try {
    const { status: statusExistente } = await Notifications.getPermissionsAsync()
    let statusFinal = statusExistente

    if (statusExistente !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      statusFinal = status
    }

    // Permissão negada → sem token.
    if (statusFinal !== 'granted') return null

    // projectId vem da config do EAS (necessário para gerar o token).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) {
      console.warn('[push] projectId do EAS não encontrado em expoConfig.extra.eas.projectId')
      return null
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    return token.data
  } catch (err) {
    console.warn('[push] falha ao obter o push token:', err)
    return null
  }
}

// PLACEHOLDER: envia o token pro backend.
// TODO: ligar ao tRPC quando o backend de armazenamento de token existir.
export async function sendTokenToServer(token: string): Promise<void> {
  console.log('[push] TODO registrar token no backend:', token)
}
