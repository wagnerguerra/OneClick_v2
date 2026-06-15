import { createTRPCReact } from '@trpc/react-query'
import { httpLink } from '@trpc/client'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'
import { getApiUrl } from './api-url'
import { authClient } from './auth-client'
import { getTenantId } from './tenant'

// Cliente tRPC type-safe reusando o AppRouter da API. Sem transformer e com
// httpLink (sem batch) — espelha o web (que teve deadlock com httpBatchLink).
// Auth via Cookie do SecureStore (Better Auth Expo); tenant via x-tenant-id.
export const trpc = createTRPCReact<AppRouter>()

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpLink({
        url: `${getApiUrl()}/trpc`,
        headers() {
          const headers: Record<string, string> = {}
          const cookie = authClient.getCookie()
          if (cookie) headers.Cookie = cookie
          const tenant = getTenantId()
          if (tenant) headers['x-tenant-id'] = tenant
          return headers
        },
      }),
    ],
  })
}
