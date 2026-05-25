import { createTRPCClient, httpLink } from '@trpc/client'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'
import { getApiUrl } from './api-url'

/**
 * Custom fetch que SEMPRE inclui credentials (cookies de sessão) e preserva o
 * `signal` que o trpc client passa pra abort. Fix crítico: o trpc client por
 * default não passa `credentials`, então o cookie de sessão não vai → 401
 * silencioso e a Promise da .mutate pendura indefinidamente.
 */
const fetchWithCredentials: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? 'GET'
  const t0 = performance.now()
  if (typeof window !== 'undefined' && method !== 'GET') {
    console.info(`[trpc] ${method} ${url}`)
  }
  try {
    const res = await fetch(input, { ...init, credentials: 'include' })
    if (typeof window !== 'undefined' && method !== 'GET') {
      console.info(`[trpc] ${method} ${url} → ${res.status} em ${Math.round(performance.now() - t0)}ms`)
    }
    return res
  } catch (err) {
    if (typeof window !== 'undefined') {
      console.error(`[trpc] ${method} ${url} FALHOU em ${Math.round(performance.now() - t0)}ms`, err)
    }
    throw err
  }
}

/**
 * Cliente tRPC — httpLink simples (sem batching).
 *
 * Why sem httpBatchLink: observamos mutations travarem indefinidamente quando
 * havia múltiplos requests em paralelo (ex: color picker do Design System
 * disparando saves rápidos enquanto a página tinha queries em andamento). O
 * batcher acumulava requests e nunca flushava. httpLink envia cada request
 * individual — sem fila, sem deadlock.
 *
 * Em mutations onde quisermos garantia extra (ex: ações destrutivas), usamos
 * fetch nativo direto via helper. Mas a partir desse fix o trpc client deve
 * funcionar normalmente pra cadastros, edições, etc.
 */
// URL do tRPC: em desenvolvimento (browser/Node de :3000), passamos via Next
// rewrite `/be/trpc` → backend NestJS. Isso bypassa:
//   1. Filtros do AdBlock que bloqueiam `/trpc/*` (regras adblock financeiras)
//   2. Limite de 6 conexões cross-origin do Chrome (SSE streams pro :4000
//      consumiam todos os slots → mutations ficavam Stalled)
// Em prod (frontend e backend no mesmo host), o rewrite é no-op funcional.
// `getApiUrl()` continua sendo a base de outros assets (imagens, uploads).
const TRPC_PATH = '/be/trpc'
function getTrpcUrl(): string {
  if (typeof window === 'undefined') {
    // SSR: usa URL direta do backend (não passa pelo Next dev)
    return `${getApiUrl()}/trpc`
  }
  // Client-side: usa o rewrite local (mesmo host)
  return TRPC_PATH
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: getTrpcUrl(),
      fetch: fetchWithCredentials,
    }),
  ],
})
