'use client'

// Moldura de celular (bezel + ilha dinâmica + barra de gestos) que envolve as
// telas do app no simulador. É puro CSS — o "miolo" rola internamente.

import type { AppColors } from './app-theme'

export function PhoneFrame({ c, children }: { c: AppColors; children: React.ReactNode }) {
  return (
    <div
      className="relative shrink-0 rounded-[44px] p-[10px] shadow-2xl"
      style={{
        width: 380,
        // Bezel escuro do aparelho (independe do tema do app — é o "plástico").
        background: 'linear-gradient(160deg, #1f2937 0%, #0b0f17 100%)',
        boxShadow: '0 30px 60px -15px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.04) inset',
      }}
    >
      {/* Botões físicos (decorativos) */}
      <span className="absolute -left-[3px] top-[120px] h-10 w-[3px] rounded-l bg-zinc-700" aria-hidden />
      <span className="absolute -left-[3px] top-[170px] h-16 w-[3px] rounded-l bg-zinc-700" aria-hidden />
      <span className="absolute -right-[3px] top-[150px] h-20 w-[3px] rounded-r bg-zinc-700" aria-hidden />

      {/* Tela */}
      <div
        className="relative overflow-hidden rounded-[36px] flex flex-col"
        style={{ height: 760, background: c.background }}
      >
        {/* Ilha dinâmica / notch */}
        <div
          className="absolute top-[10px] left-1/2 -translate-x-1/2 z-30 h-[26px] w-[110px] rounded-full bg-black"
          aria-hidden
        />
        {children}
        {/* Barra de gestos (home indicator) */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-28 rounded-full" style={{ background: c.mutedForeground, opacity: 0.5 }} aria-hidden />
      </div>
    </div>
  )
}
