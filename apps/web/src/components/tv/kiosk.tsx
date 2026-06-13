'use client'

/**
 * Moldura compartilhada dos painéis "gestão à vista" para TV (kiosk).
 * Tela cheia, dark, slides rotacionando automaticamente, relógio, barra de
 * progresso, dots, atalhos de teclado e fullscreen. As páginas só fornecem
 * os slides (cada um um React node) e o accent do módulo.
 *
 * Usado por /tv/comercial (accent rose) e /tv/helpdesk (accent cyan/TI).
 * Tipografia em `vw` → escala pra qualquer resolução de TV.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { Maximize2, Minimize2, Pause, Play, Activity } from 'lucide-react'

const AccentCtx = createContext('#fb7185')
export const useAccent = () => useContext(AccentCtx)

export const AXIS = { fill: '#94a3b8', fontSize: 18 } as const

export interface TvSlide {
  key: string
  title: string
  node: React.ReactNode
}

// ── Primitivas visuais (escala em vw) ─────────────────────────────────────

export function Metric({ label, value, sub, color, size = 'md' }: {
  label: string; value: string | number; sub?: string; color?: string; size?: 'hero' | 'lg' | 'md'
}) {
  const cls = size === 'hero' ? 'text-[5.2vw]' : size === 'lg' ? 'text-[3.4vw]' : 'text-[2.6vw]'
  return (
    <div>
      <div className="text-[0.95vw] uppercase tracking-[0.12em] text-white/45 font-semibold">{label}</div>
      <div className={`${cls} font-bold leading-none tabular-nums mt-[0.3vw]`} style={{ color: color ?? '#fff' }}>{value}</div>
      {sub && <div className="text-[0.9vw] text-white/40 mt-[0.5vw]">{sub}</div>}
    </div>
  )
}

export function Panel({ title, icon: Icon, children, className = '' }: {
  title?: string; icon?: React.ElementType; children: React.ReactNode; className?: string
}) {
  const accent = useAccent()
  return (
    <div className={`rounded-[1.4vw] border border-white/10 bg-white/[0.035] p-[1.6vw] flex flex-col ${className}`}>
      {title && (
        <div className="flex items-center gap-[0.7vw] mb-[1.2vw]">
          {Icon && <Icon className="h-[1.8vw] w-[1.8vw]" style={{ color: accent }} />}
          <h3 className="text-[1.5vw] font-bold text-white/90">{title}</h3>
        </div>
      )}
      {children}
    </div>
  )
}

export function LegendList({ items }: { items: Array<{ name: string; value: string | number; fill: string }> }) {
  return (
    <div className="flex flex-col justify-center gap-[0.9vw]">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-[0.8vw]">
          <span className="h-[1.1vw] w-[1.1vw] rounded-[0.25vw] shrink-0" style={{ background: it.fill }} />
          <span className="text-[1.15vw] text-white/70 flex-1 truncate">{it.name}</span>
          <span className="text-[1.5vw] font-bold tabular-nums text-white">{it.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Shell do kiosk ─────────────────────────────────────────────────────────

export function TvKiosk({
  accent = '#fb7185',
  title,
  slides,
  loading,
  erro,
  updatedAt,
  periodLabel,
  slideMs = 18_000,
}: {
  accent?: string
  title: string
  slides: TvSlide[]
  loading: boolean
  erro: boolean
  updatedAt: number | null
  periodLabel?: string
  slideMs?: number
}) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [isFs, setIsFs] = useState(false)
  const cycle = useRef(0)
  const len = slides.length

  // Relógio
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Mantém índice válido se o nº de slides mudar
  useEffect(() => {
    if (len > 0 && active >= len) setActive(0)
  }, [len, active])

  // Rotação automática
  useEffect(() => {
    if (paused || len === 0) return
    cycle.current++
    const id = setTimeout(() => setActive((a) => (a + 1) % len), slideMs)
    return () => clearTimeout(id)
  }, [active, paused, len, slideMs])

  const toggleFs = useCallback(() => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setActive((a) => (len ? (a + 1) % len : 0))
      else if (e.key === 'ArrowLeft') setActive((a) => (len ? (a - 1 + len) % len : 0))
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key.toLowerCase() === 'f') toggleFs()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [len, toggleFs])

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const segsSinceUpdate = now && updatedAt ? Math.floor((now.getTime() - updatedAt) / 1000) : null

  return (
    <AccentCtx.Provider value={accent}>
      <div className="fixed inset-0 flex flex-col bg-[#0b0f1a] text-white overflow-hidden select-none">
        <style>{`@keyframes tvbar { from { width: 0% } to { width: 100% } } @keyframes tvfade { from { opacity: 0; transform: translateY(1vh) } to { opacity: 1; transform: none } }`}</style>

        {/* Top bar */}
        <header
          className="h-[8vh] shrink-0 flex items-center justify-between px-[2vw] border-b border-white/10"
          style={{ backgroundImage: `linear-gradient(to right, ${accent}1a, transparent)` }}
        >
          <div className="flex items-center gap-[1.2vw]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-light.png" alt="OneClick" className="h-[3.2vh] w-auto object-contain" />
            <div className="h-[3.5vh] w-px bg-white/15" />
            <div>
              <div className="text-[1.7vw] font-bold leading-none">{title}</div>
              <div className="text-[0.9vw] text-white/45 mt-[0.4vh]">{slides[active]?.title ?? 'Gestão à vista'}</div>
            </div>
          </div>
          <div className="flex items-center gap-[1.8vw]">
            <div className="flex items-center gap-[0.6vw] text-[1.05vw] text-emerald-400">
              <span className="relative flex h-[1vw] w-[1vw]">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex rounded-full h-[1vw] w-[1vw] bg-emerald-400" />
              </span>
              ao vivo
            </div>
            <div className="text-right">
              <div className="text-[1.9vw] font-bold leading-none tabular-nums">
                {now ? now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </div>
              <div className="text-[0.85vw] text-white/45 mt-[0.3vh] capitalize">
                {now ? now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : ''}
              </div>
            </div>
            <button onClick={toggleFs} className="text-white/40 hover:text-white transition-colors" title="Tela cheia (F)">
              {isFs ? <Minimize2 className="h-[1.8vw] w-[1.8vw]" /> : <Maximize2 className="h-[1.8vw] w-[1.8vw]" />}
            </button>
          </div>
        </header>

        {/* Conteúdo (slide ativo) */}
        <main className="flex-1 min-h-0 p-[2vw]">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-[1.5vw] text-white/50">
              <div className="h-[4vw] w-[4vw] animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: accent, borderTopColor: 'transparent' }} />
              <p className="text-[1.5vw]">Carregando painel…</p>
            </div>
          ) : erro || len === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-[1vw] text-white/50">
              <Activity className="h-[4vw] w-[4vw] opacity-30" />
              <p className="text-[1.6vw]">Sem dados ou sem permissão para este módulo.</p>
            </div>
          ) : (
            <div key={active} className="h-full animate-[tvfade_0.5s_ease-out]">{slides[active]?.node}</div>
          )}
        </main>

        {/* Bottom bar: dots + período */}
        <footer className="h-[6vh] shrink-0 flex items-center justify-between px-[2vw] border-t border-white/10">
          <div className="flex items-center gap-[1vw]">
            {slides.map((s, i) => (
              <button key={s.key} onClick={() => setActive(i)} title={s.title}>
                <span
                  className="block h-[0.9vw] rounded-full transition-all duration-300"
                  style={{ width: i === active ? '3vw' : '0.9vw', background: i === active ? accent : 'rgba(255,255,255,0.25)' }}
                />
              </button>
            ))}
            <button onClick={() => setPaused((p) => !p)} className="ml-[1vw] text-white/40 hover:text-white transition-colors" title="Pausar/retomar (espaço)">
              {paused ? <Play className="h-[1.4vw] w-[1.4vw]" /> : <Pause className="h-[1.4vw] w-[1.4vw]" />}
            </button>
          </div>
          <div className="text-[0.9vw] text-white/35 tabular-nums">
            {segsSinceUpdate != null ? `atualizado há ${segsSinceUpdate}s` : ''}{periodLabel ? `${segsSinceUpdate != null ? ' · ' : ''}${periodLabel}` : ''}
          </div>
        </footer>

        {/* Barra de progresso do slide */}
        <div className="absolute bottom-0 left-0 right-0 h-[0.4vh] bg-white/5">
          {!paused && len > 0 && (
            <div
              key={`${active}-${cycle.current}`}
              className="h-full"
              style={{ background: accent, animation: `tvbar ${slideMs}ms linear forwards` }}
            />
          )}
        </div>
      </div>
    </AccentCtx.Provider>
  )
}
