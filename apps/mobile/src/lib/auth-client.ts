import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { twoFactorClient } from 'better-auth/client/plugins'
import * as SecureStore from 'expo-secure-store'
import { getApiUrl } from './api-url'

// Cliente Better Auth do app desktop... digo, mobile. O expoClient guarda o
// cookie de sessão no SecureStore e o reanexa nas chamadas; getCookie() devolve
// o header Cookie pra reusarmos no tRPC. twoFactorClient cobre o fluxo MFA TOTP
// (a API tem o plugin twoFactor habilitado).
export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  plugins: [
    expoClient({
      scheme: 'oneclick',
      storagePrefix: 'oneclick',
      storage: SecureStore,
    }),
    twoFactorClient(),
  ],
})

export const { signIn, signOut, useSession } = authClient
