'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorReporter } from './error-reporter'
import { ModuleColorsProvider } from './theme/module-colors'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ModuleColorsProvider>
        <ErrorReporter>{children}</ErrorReporter>
      </ModuleColorsProvider>
    </QueryClientProvider>
  )
}
