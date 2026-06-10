import { expoClient } from '@better-auth/expo/client'
import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import * as SecureStore from 'expo-secure-store'

import { getApiUrl } from './api-url'

export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  plugins: [
    expoClient({
      scheme: 'oneclickparallel',
      storagePrefix: 'oneclick-parallel',
      storage: SecureStore,
    }),
    twoFactorClient(),
  ],
})

export const { signOut, useSession } = authClient
