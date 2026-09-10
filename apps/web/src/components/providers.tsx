'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorReporter } from './error-reporter'
import { ModuleColorsProvider } from './theme/module-colors'
import { getApiUrl } from '@/lib/api-url'

export function Providers({ children }: { children: React.ReactNode }) {
  // O RichEditor vive em `packages/ui` e não pode importar `getApiUrl` (o
  // pacote não conhece o app). Ele já lia `window.__NEXT_PUBLIC_API_URL` — só
  // que ninguém nunca setava, então caía no `http://localhost:4000` chumbado:
  // do navegador de qualquer máquina que não fosse a da API, o upload falhava
  // e a imagem virava base64 dentro do HTML, calada. Um print de 2 MB colado
  // num artigo virava 2,7 MB de texto no banco.
  //
  // Setar aqui, uma vez, conserta TODAS as instâncias do editor de uma vez.
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__NEXT_PUBLIC_API_URL = getApiUrl()
  }
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
