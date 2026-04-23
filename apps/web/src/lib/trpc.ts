import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'
import { getApiUrl } from './api-url'

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        })
      },
    }),
  ],
})
