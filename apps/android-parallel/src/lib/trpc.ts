import { createTRPCReact } from '@trpc/react-query'
import { httpLink } from '@trpc/client'

import { authClient } from './auth-client'
import { getApiUrl } from './api-url'

export const trpc: any = createTRPCReact<any>() as any

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpLink({
        url: `${getApiUrl()}/trpc`,
        headers() {
          const cookie = authClient.getCookie()
          return cookie ? { Cookie: cookie } : {}
        },
      }),
    ],
  })
}
