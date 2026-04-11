import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        })
      },
    }),
  ],
})
