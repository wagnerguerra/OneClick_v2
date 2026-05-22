/**
 * trpc-fetch — helper que chama um endpoint tRPC via fetch nativo.
 *
 * Why existe: o trpc client está com bug de mutations travando em certas
 * condições (provável bug de batch/links em v11, ainda sob investigação).
 * Esse helper bypassa o trpc client inteiro — bota o request direto via
 * fetch nativo. Formato tRPC v11 sem transformer: body = input direto.
 *
 * Quando usar:
 *  - Em qualquer mutation que falhar com o trpc.X.Y.mutate() (sintoma:
 *    botão fica girando, Promise nunca resolve).
 *  - Como padrão pra ações destrutivas (mais previsível que o trpc client).
 *
 * Em ações de baixo risco e queries, continuar usando o trpc client normal.
 *
 * Exemplo:
 *   await trpcMutate('ativo.create', { nome: 'X', tipoId: 'a', categoriaId: 'b' })
 *   await trpcMutate('clientError.markResolved', { id: '...' })
 *   const r = await trpcMutate<{ count: number }>('clientError.deleteResolved')
 */

import { getApiUrl } from './api-url'

export async function trpcMutate<T = unknown>(
  route: string,
  input: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const url = `${getApiUrl()}/trpc/${route}`
  const timeoutMs = opts.timeoutMs ?? 15_000
  const body = JSON.stringify(input)
  if (typeof window !== 'undefined') console.info(`[trpc-fetch] POST /trpc/${route}`, input)

  // Tenta fetch primeiro. Se travar (extensão de adblock/privacy filtra),
  // cai pro fallback XMLHttpRequest (que é menos filtrado).
  // Tempo curto no fetch (5s) pra dar tempo de fallback dentro do timeout total.
  const fetchTimeout = Math.min(5_000, timeoutMs)
  try {
    return await viaFetch<T>(url, route, body, fetchTimeout)
  } catch (e) {
    const msg = (e as Error).message || ''
    const name = (e as Error).name || ''
    const ehTimeoutOuRede =
      msg.includes('Tempo limite') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('ERR_') ||
      name === 'AbortError' ||
      name === 'TypeError'
    if (!ehTimeoutOuRede) throw e
    if (typeof window !== 'undefined') console.warn(`[trpc-fetch] fetch falhou (${msg}), tentando fallback XHR`)
    return await viaXhr<T>(url, route, body, timeoutMs)
  }
}

async function viaFetch<T>(url: string, route: string, body: string, timeoutMs: number): Promise<T> {
  const t0 = performance.now()
  // Promise.race em vez de AbortController — evita AbortError no console
  // quando o timeout dispara. Tradeoff: fetch continua em background após
  // timeout (não cancela rede), mas pra timeout curto (5s) o desperdício é OK.
  const fetchP = fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  }).catch((e) => {
    // Wrap erros de rede num Error custom (não propaga TypeError raw)
    const msg = (e as Error).message || 'erro de rede'
    throw new Error(`Falha no fetch: ${msg}`)
  })
  // Suprime "unhandled promise rejection" quando o timeout vence a corrida
  // (fetchP continua resolvendo/rejeitando em background — só ignoramos).
  fetchP.catch(() => { /* já tratado via Promise.race */ })

  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Tempo limite excedido (fetch ${timeoutMs}ms)`))
    }, timeoutMs)
  })

  let res: Response
  try {
    res = await Promise.race([fetchP, timeoutP])
  } finally {
    if (timer) clearTimeout(timer)
  }
  return parseResponse<T>(route, res.ok, res.status, await res.text(), Math.round(performance.now() - t0))
}

async function viaXhr<T>(url: string, route: string, body: string, timeoutMs: number): Promise<T> {
  const t0 = performance.now()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    xhr.timeout = timeoutMs
    xhr.ontimeout = () => reject(new Error(`Tempo limite excedido (XHR ${timeoutMs}ms)`))
    xhr.onerror = () => reject(new Error('Erro de rede no XHR (extensão bloqueando?)'))
    xhr.onload = () => {
      try {
        const ms = Math.round(performance.now() - t0)
        const ok = xhr.status >= 200 && xhr.status < 300
        const result = parseResponse<T>(route, ok, xhr.status, xhr.responseText, ms, 'xhr')
        resolve(result)
      } catch (e) { reject(e) }
    }
    xhr.send(body)
  })
}

function parseResponse<T>(route: string, ok: boolean, status: number, text: string, ms: number, transport: 'fetch' | 'xhr' = 'fetch'): T {
  let payload: any = null
  try { payload = JSON.parse(text) } catch { /* não-JSON */ }
  if (!ok || payload?.error) {
    const code = payload?.error?.data?.code
    const errMsg = payload?.error?.message ?? `HTTP ${status}`
    if (typeof window !== 'undefined') console.error(`[trpc-fetch:${transport}] /trpc/${route} FALHOU em ${ms}ms — status=${status} code=${code}`, payload)
    throw new Error(errMsg)
  }
  if (typeof window !== 'undefined') console.info(`[trpc-fetch:${transport}] /trpc/${route} OK em ${ms}ms`, payload?.result?.data)
  return payload?.result?.data as T
}
