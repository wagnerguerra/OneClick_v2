'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Indicador de progresso de navegação entre rotas.
 *
 * - Intercepta cliques em <a> internos (mesma origem) e exibe imediatamente:
 *   1. Uma **barra fina** animada no topo (NProgress-like)
 *   2. Um **overlay "Carregando..."** discreto se a navegação demorar > 400ms
 *
 * - Esconde tudo quando o `pathname` efetivamente muda (Next concluiu a navegação)
 *   ou após timeout de segurança (8s).
 */
export function RouteProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helpers para limpar timers
  function clearTimers() {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    overlayTimerRef.current = null
    safetyTimerRef.current = null
  }

  // Intercepta cliques em links internos
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Ignora cliques modificados (abrir nova aba, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const link = target.closest('a')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href) return
      // Ignora hash, externos, mailto, tel, target=_blank
      if (
        href.startsWith('#')
        || href.startsWith('http')
        || href.startsWith('mailto:')
        || href.startsWith('tel:')
        || link.target === '_blank'
        || link.hasAttribute('download')
      ) return

      // Se for a mesma rota (sem considerar query/hash), ignora
      const hrefPath = href.split('?')[0]!.split('#')[0]
      const currPath = pathname.split('?')[0]!.split('#')[0]
      if (hrefPath === currPath) return

      // Aciona o loading
      setLoading(true)
      // Mostra "Carregando..." só se a navegação demorar (evita flash em rotas instantâneas)
      overlayTimerRef.current = setTimeout(() => setShowOverlay(true), 400)
      // Timeout de segurança — caso a navegação trave por algum motivo
      safetyTimerRef.current = setTimeout(() => {
        setLoading(false)
        setShowOverlay(false)
      }, 8000)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname])

  // Limpa quando o pathname efetivamente muda (rota carregou)
  useEffect(() => {
    setLoading(false)
    setShowOverlay(false)
    clearTimers()
    return () => clearTimers()
  }, [pathname])

  if (!loading) return null

  return (
    <>
      {/* Barra no topo — animação CSS própria (sem dependência) */}
      <div
        className="fixed top-0 left-0 right-0 z-[200] h-[4px] bg-transparent overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div
          className="h-full bg-[#5ea3cb] shadow-[0_0_8px_rgba(94,163,203,0.6)]"
          style={{
            // Cresce de 0 a ~85% rápido, depois "trava" — some quando rota carrega
            animation: 'route-progress-grow 6s cubic-bezier(0.1, 0.9, 0.3, 1) forwards',
            transformOrigin: 'left',
          }}
        />
      </div>

      {/* Overlay com "Carregando..." — só aparece após 400ms de delay */}
      {showOverlay && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-background/40 backdrop-blur-[2px] pointer-events-none"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-2 rounded-lg bg-card border shadow-lg px-5 py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
            <p className="text-xs font-medium text-muted-foreground">Carregando...</p>
          </div>
        </div>
      )}

      {/* Keyframes inline (componentes client podem ter <style jsx global> mas mantemos
          simples). A animação cresce até 85% nos primeiros segundos e trava ali. */}
      <style>{`
        @keyframes route-progress-grow {
          0%   { transform: scaleX(0); }
          30%  { transform: scaleX(0.55); }
          60%  { transform: scaleX(0.78); }
          100% { transform: scaleX(0.85); }
        }
      `}</style>
    </>
  )
}
