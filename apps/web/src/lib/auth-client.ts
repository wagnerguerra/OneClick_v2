import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { getApiUrl } from './api-url'

export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Quando o login detecta MFA habilitado, redireciona para a tela de verificacao
        window.location.href = '/login/2fa'
      },
    }),
  ],
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  twoFactor,
} = authClient
