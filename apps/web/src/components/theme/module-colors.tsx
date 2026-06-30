'use client'

/**
 * ModuleColorsProvider — carrega as cores por módulo do backend e injeta
 * como CSS variables no <html>. Toda a UI lê via `var(--mod-<slug>)` ou
 * via o hook `useModuleColor(slug)`.
 *
 * Slugs disponíveis (em sync com DEFAULT_MODULE_COLORS no backend):
 *   cadastros, comercial, corporativo, administrativo, legalizacao,
 *   trabalhista, fiscal, contabil, ti, qualidade, configuracoes,
 *   processos, faq, perfil
 *
 * Como usar:
 *   - Inline style: style={{ background: 'var(--mod-cadastros)' }}
 *   - Tailwind:     className="bg-[var(--mod-cadastros)]"
 *   - JS (lê hex):  const c = useModuleColor('cadastros') // string
 *   - JS (lê tudo): const map = useModuleColors() // Record<slug, color>
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'

export type ModuleColorMap = Record<string, string>

/** Defaults — usados como fallback quando o backend ainda não respondeu.
 *  Mantém em sync com DEFAULT_MODULE_COLORS em apps/api/src/theme/theme.service.ts. */
export const DEFAULT_MODULE_COLORS: ModuleColorMap = {
  cadastros:     '#10b981',
  comercial:     '#fb7185',
  corporativo:   '#0ea5e9',
  administrativo: '#38bdf8',
  legalizacao:   '#e879f9',
  trabalhista:   '#a3e635',
  fiscal:        '#0369a1',
  contabil:      '#a78bfa',
  ferramentas:   '#8b5cf6',
  ti:            '#22d3ee',
  qualidade:     '#f59e0b',
  configuracoes: '#f97316',
  processos:     '#8b5cf6',
  faq:           '#0891b2',
  perfil:        '#5ea3cb',
}

interface ContextValue {
  colors: ModuleColorMap
  refresh: () => Promise<void>
  /** Atualiza uma cor localmente (no estado + CSS var) sem refetch.
   *  Usar pra optimistic update — a UI propaga instantaneamente. */
  setLocalColor: (slug: string, color: string) => void
  loading: boolean
}

const ModuleColorsContext = createContext<ContextValue>({
  colors: DEFAULT_MODULE_COLORS,
  refresh: async () => {},
  setLocalColor: () => {},
  loading: false,
})

function applyCssVariables(map: ModuleColorMap) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [slug, color] of Object.entries(map)) {
    root.style.setProperty(`--mod-${slug}`, color)
  }
}

export function ModuleColorsProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColors] = useState<ModuleColorMap>(DEFAULT_MODULE_COLORS)
  const [loading, setLoading] = useState(false)

  // Aplica os defaults imediatamente no mount (antes de fetch)
  // pra evitar flash de cor antiga durante hidratação.
  useEffect(() => {
    applyCssVariables(DEFAULT_MODULE_COLORS)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await (trpc.theme as any).list.query()
      const map: ModuleColorMap = { ...DEFAULT_MODULE_COLORS }
      for (const e of list as { slug: string; color: string }[]) {
        map[e.slug] = e.color
      }
      setColors(map)
      applyCssVariables(map)
    } catch {
      // Fallback silencioso pros defaults — não bloqueia a UI.
    } finally {
      setLoading(false)
    }
  }, [])

  /** Optimistic update — atualiza só a cor de um slug, sem refetch nem awaitar backend.
   *  Útil enquanto o usuário arrasta o color picker (várias mudanças por segundo). */
  const setLocalColor = useCallback((slug: string, color: string) => {
    setColors(prev => {
      const next = { ...prev, [slug]: color }
      // Aplica APENAS essa variável (não re-itera todo o map).
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty(`--mod-${slug}`, color)
      }
      return next
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ colors, refresh, setLocalColor, loading }),
    [colors, refresh, setLocalColor, loading],
  )

  return (
    <ModuleColorsContext.Provider value={value}>
      {children}
    </ModuleColorsContext.Provider>
  )
}

/** Retorna o map completo de cores (slug → hex). Re-renderiza ao mudar. */
export function useModuleColors() {
  return useContext(ModuleColorsContext).colors
}

/** Retorna a cor de um slug específico. Re-renderiza ao mudar.
 *  Se o slug não existir, retorna `fallback` ou o default global. */
export function useModuleColor(slug: string, fallback?: string): string {
  const colors = useModuleColors()
  return colors[slug] ?? fallback ?? DEFAULT_MODULE_COLORS[slug] ?? '#5ea3cb'
}

/** Hook que expõe `refresh` — útil pra forçar re-fetch após salvar uma cor. */
export function useRefreshModuleColors() {
  return useContext(ModuleColorsContext).refresh
}

/** Hook que expõe o setter local (optimistic update). Use durante o drag do
 *  color picker; chame refresh() depois pra reconciliar com o backend. */
export function useSetLocalModuleColor() {
  return useContext(ModuleColorsContext).setLocalColor
}
