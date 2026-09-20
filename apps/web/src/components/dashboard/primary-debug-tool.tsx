'use client'

/* ============================================================================
 * ⚠️ DEBUG — FERRAMENTA TEMPORÁRIA (branch feat/module-color-to-primary).
 * REMOVER ANTES DO PR: este arquivo + a montagem em (dashboard)/layout.tsx +
 * a skin [data-skin="debug"] no globals.css.
 *
 * Valida visualmente a migração cor-de-módulo → primária:
 *  - "Arco-íris": cicla data-skin por todas as skins rapidamente. Todo elemento
 *    que respeita a cor PRIMÁRIA do sistema muda de cor a cada passo; o que
 *    sobrou preso à cor de módulo fica PARADO → evidencia o que falta migrar.
 *  - "Magenta debug": aplica [data-skin="debug"] (magenta vívido, fora do menu
 *    de skins) — mesma finalidade, estático.
 *
 * Manipula document.documentElement.dataset.skin DIRETO (efêmero; NÃO persiste
 * em localStorage). Restaura o data-skin original ao desligar/desmontar.
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { Palette, X } from 'lucide-react'
import { cn } from '@saas/ui'

type Mode = 'off' | 'rainbow' | 'debug'
const CYCLE = ['padrao', 'esmeralda', 'ambar', 'coral', 'lilas', 'grafite', 'debug'] as const
const MAGENTA = '#ff00d4'
const DEBUG_KEY = 'oc-debug-primary-mode'

/** Skin REAL do usuário (autoritativa em oc-layout-prefs) — não o data-skin ao
 *  vivo, que pode estar num valor de debug. Usada para restaurar. */
function realUserSkin(): string {
  try {
    const raw = localStorage.getItem('oc-layout-prefs')
    return (raw ? (JSON.parse(raw).skin as string) : 'padrao') || 'padrao'
  } catch { return 'padrao' }
}

export function PrimaryDebugTool() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('off')

  // Restaura o modo salvo ao montar — sobrevive a recompilações/HMR do dev.
  useEffect(() => {
    try {
      const m = localStorage.getItem(DEBUG_KEY)
      if (m === 'rainbow' || m === 'debug') setMode(m)
    } catch { /* ignora */ }
  }, [])

  // Persiste o modo selecionado.
  useEffect(() => {
    try { mode === 'off' ? localStorage.removeItem(DEBUG_KEY) : localStorage.setItem(DEBUG_KEY, mode) } catch { /* ignora */ }
  }, [mode])

  // Aplica o modo em data-skin (efêmero, não persiste a skin). Re-afirma em
  // intervalo pra sobreviver a um re-apply do provider de skin (ex.: full reload).
  useEffect(() => {
    const html = document.documentElement
    const apply = (skin: string) =>
      skin === 'padrao' ? html.removeAttribute('data-skin') : html.setAttribute('data-skin', skin)

    if (mode === 'off') { apply(realUserSkin()); return }
    if (mode === 'debug') {
      apply('debug')
      const t = setInterval(() => apply('debug'), 1000)
      return () => clearInterval(t)
    }
    // rainbow: cicla as skins num intervalo curto
    let i = 0
    apply(CYCLE[0])
    const t = setInterval(() => { i = (i + 1) % CYCLE.length; apply(CYCLE[i]!) }, 450)
    return () => clearInterval(t)
  }, [mode])

  // Ao desmontar (navegar pra fora do dashboard), restaura a skin real do usuário
  // — um remount com modo persistido reaplica o debug pelo efeito de cima.
  useEffect(() => () => {
    const html = document.documentElement
    const s = realUserSkin()
    if (s === 'padrao') html.removeAttribute('data-skin')
    else html.setAttribute('data-skin', s)
  }, [])

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-20 lg:right-32 z-[60] pointer-events-auto w-56 rounded-xl border-2 border-dashed bg-card p-3 shadow-xl"
             style={{ borderColor: MAGENTA }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MAGENTA }}>Debug · cor primária</span>
            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
            O que muda de cor respeita a cor do sistema; o que fica parado é cor de módulo residual.
          </p>
          <button
            type="button"
            onClick={() => setMode(mode === 'rainbow' ? 'off' : 'rainbow')}
            className={cn('mb-1.5 w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors',
              mode === 'rainbow' ? 'bg-primary text-primary-foreground border-transparent' : 'border-border hover:bg-muted')}
          >
            🌈 Arco-íris {mode === 'rainbow' ? '· parar' : ''}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'debug' ? 'off' : 'debug')}
            className={cn('w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors', mode === 'debug' && 'border-transparent text-white')}
            style={mode === 'debug' ? { backgroundColor: MAGENTA } : undefined}
          >
            🐛 Magenta debug {mode === 'debug' ? '· off' : ''}
          </button>
          <p className="mt-2 text-[9px] text-muted-foreground/70">Temporário — removido antes do PR.</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Debug de cor primária (temporário — remover antes do PR)"
        className="fixed bottom-5 right-20 lg:right-32 z-[60] pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed bg-card shadow-lg"
        style={{ borderColor: MAGENTA, color: mode !== 'off' ? '#fff' : MAGENTA, backgroundColor: mode !== 'off' ? MAGENTA : undefined }}
      >
        <Palette className="h-5 w-5" />
      </button>
    </>
  )
}
