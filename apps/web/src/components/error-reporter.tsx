'use client'

/**
 * ErrorReporter — captura erros do navegador e envia pro backend pra agrupar
 * em /admin/erros-cliente. Só ativo quando NODE_ENV !== 'production'.
 *
 * Hooks usados:
 *  - window.onerror              → captura erros JS síncronos
 *  - window.onunhandledrejection → captura promises rejeitadas
 *  - console.error / console.warn → captura logs explícitos
 *  - React ErrorBoundary         → captura erros em render/lifecycle (wrap externo)
 *
 * Dedup local: hash de cada erro só é enviado 1× a cada 30s pra evitar flood
 * (o backend também dedup, mas economiza chamadas inúteis).
 *
 * Tudo é fire-and-forget: nunca bloqueia o app. Erro de envio é silenciado
 * (loga warning local) pra não criar loop.
 */

import { Component, useEffect } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { trpc } from '@/lib/trpc'
import { detectarModulo } from '@/lib/modulo-da-url'

/** Cache local em memória: hash → timestamp do último envio. */
const sentCache = new Map<string, number>()
const DEDUP_WINDOW_MS = 30_000

function localHash(level: string, message: string, stack?: string | null): string {
  const firstLine = (stack ?? '').split('\n')[0]?.replace(/:\d+:\d+/g, '') ?? ''
  // hash bem simples — só pra dedup local; backend usa SHA1 próprio.
  let h = 0
  const s = `${level}:${message}:${firstLine}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return String(h)
}

function shouldSend(hash: string): boolean {
  const now = Date.now()
  const last = sentCache.get(hash)
  if (last && now - last < DEDUP_WINDOW_MS) return false
  sentCache.set(hash, now)
  // GC simples — limpa entradas antigas pra cache não crescer infinito
  if (sentCache.size > 200) {
    for (const [k, v] of sentCache) if (now - v > DEDUP_WINDOW_MS * 2) sentCache.delete(k)
  }
  return true
}

async function report(level: 'ERROR' | 'WARN' | 'REJECTION', message: string, stack?: string | null) {
  const msg = (message ?? '').toString().slice(0, 5000)
  if (!msg) return
  const hash = localHash(level, msg, stack)
  if (!shouldSend(hash)) return
  try {
    await (trpc.clientError as any).report.mutate({
      level,
      message: msg,
      stack: stack ? String(stack).slice(0, 20000) : null,
      url:    typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      environment: process.env.NODE_ENV ?? 'development',
      modulo: detectarModulo(),
    })
  } catch {
    // Silencioso — não queremos que o reporter dispare reports do próprio reporter.
  }
}

/** Filtros pra evitar capturar ruído conhecido (React HMR, ChunkLoadError de
 *  reload, mensagens de hot reload, etc). Pode ser estendido conforme aparecer. */
function shouldIgnore(message: string): boolean {
  if (!message) return true
  const lower = message.toLowerCase()
  // Erros conhecidos do dev/HMR — não são bugs reais
  if (lower.includes('hydration failed') && lower.includes('inspected')) return true
  if (lower.includes('hmr') || lower.includes('hot module replacement')) return true
  // AbortError em qualquer variante — quase sempre é timeout de AbortController
  // em sondas (ex: SciButton, polling de status). Não é bug.
  if (lower.includes('aborterror')) return true
  if (lower.includes('signal is aborted')) return true
  if (lower.includes('the operation was aborted')) return true
  // Logs internos do trpc-fetch (meta-bug — meu próprio sistema reportando).
  if (lower.includes('[trpc-fetch')) return true
  // Timeouts/falhas de rede genéricas — caem no fallback XHR e/ou já tratadas.
  if (lower === 'failed to fetch') return true
  if (/^timeout \d+ms$/i.test(message)) return true
  if (/tempo limite excedido/i.test(lower)) return true
  // Recharts: container com width/height 0 no primeiro render (bug benigno
  // conhecido da lib, some no segundo render após layout).
  if (lower.includes('width(') && lower.includes('height(') && lower.includes('chart')) return true
  // ResizeObserver loop — bug benigno do Chromium
  if (lower.includes('resizeobserver loop')) return true
  // Meta-bug: o próprio reporter falhando ao reportar (API caiu / dev server
  // reiniciou). Sem isso, qualquer hiccup gera 1 log por tab aberta a cada
  // 30s e poluí o /admin/erros-cliente.
  if (lower.includes('clienterror.report') && lower.includes('failed to fetch')) return true
  if (lower.includes('/trpc/clienterror.report')) return true
  // Qualquer log do nosso wrapper trpc indicando "API offline" — não é bug de app
  if (lower.includes('[trpc]') && lower.includes('falhou em') && lower.includes('failed to fetch')) return true
  return false
}

/** Setup global dos handlers de captura. Só roda 1×, no client, em DEV. */
function setupGlobalCapture() {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV === 'production') return
  // @ts-expect-error — flag no window pra evitar setup duplicado
  if (window.__erroReporterSetup) return
  // @ts-expect-error
  window.__erroReporterSetup = true

  // 1) Erros JS síncronos (window.onerror) — geralmente cobertos por console.error
  //    via React, mas mantemos como backup pra erros que escapam do React.
  window.addEventListener('error', (ev) => {
    if (shouldIgnore(ev.message)) return
    // ev.error pode ser undefined em erros cross-origin
    const stack = ev.error?.stack ?? `${ev.filename}:${ev.lineno}:${ev.colno}`
    void report('ERROR', ev.message || 'Erro desconhecido', stack)
  })

  // 2) Promise rejections não tratadas
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    if (shouldIgnore(message)) return
    void report('REJECTION', message, reason instanceof Error ? reason.stack : null)
  })

  // 3) Overrides de console.error / console.warn — preserva o comportamento
  //    original (logar no console) e adiciona o report. Captura também os
  //    erros que o Next.js dev overlay mostra (eles chegam via console.error).
  const origError = console.error.bind(console)
  const origWarn  = console.warn.bind(console)
  console.error = (...args: unknown[]) => {
    origError(...args)
    try {
      const msg = args.map(a => a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 5000)
      if (shouldIgnore(msg)) return
      const firstError = args.find(a => a instanceof Error) as Error | undefined
      void report('ERROR', msg, firstError?.stack ?? null)
    } catch { /* nada */ }
  }
  console.warn = (...args: unknown[]) => {
    origWarn(...args)
    try {
      const msg = args.map(a => a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)).join(' ').slice(0, 5000)
      if (shouldIgnore(msg)) return
      void report('WARN', msg, null)
    } catch { /* nada */ }
  }
}

/** Componente sem UI — só monta os listeners globais. */
function ErrorReporterMount() {
  useEffect(() => {
    setupGlobalCapture()
  }, [])
  return null
}

/** ErrorBoundary React — captura erros em render/lifecycle/effects que
 *  acontecem dentro do tree filho. Re-renderiza o tree normalmente (o
 *  overlay do Next.js continua aparecendo) mas a gente registra o erro. */
class GlobalErrorBoundary extends Component<{ children: ReactNode }, { errored: boolean }> {
  state = { errored: false }

  static getDerivedStateFromError() {
    return { errored: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      void report('ERROR', error.message, `${error.stack ?? ''}\n\nComponent stack:${info.componentStack}`)
    }
    // Re-throw pra não engolir o erro — o overlay do Next.js precisa exibir.
    // (Em prod, podemos optar por fallback UI no futuro.)
    setTimeout(() => { throw error }, 0)
  }

  render() {
    return this.props.children
  }
}

export function ErrorReporter({ children }: { children: ReactNode }) {
  // Em produção, só renderiza os filhos sem mexer em nada — economiza overhead.
  if (process.env.NODE_ENV === 'production') return <>{children}</>
  return (
    <GlobalErrorBoundary>
      <ErrorReporterMount />
      {children}
    </GlobalErrorBoundary>
  )
}
