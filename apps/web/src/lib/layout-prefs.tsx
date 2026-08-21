'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Preferências de layout do usuário — o "Configurações de layout" do modelo
 * LuminAux (21/08/2026). Guardadas no navegador (localStorage) e aplicadas
 * na hora; o tema e a sidebar reduzida já tinham chave própria (`theme`,
 * `sidebar-collapsed`) e continuam nelas — o painel só as aciona e avisa as
 * outras instâncias via evento `oc-prefs`.
 */
export type SkinKey = 'padrao' | 'esmeralda' | 'ambar' | 'coral' | 'lilas' | 'grafite'
export type PresetKey = 'padrao' | 'minimo' | 'foco'

export interface LayoutPrefs {
  /** Paleta de acento (primário) — aplicada como data-skin no <html>. */
  skin: SkinKey
  /** Abas de navegação (o modelo antigo: uma aba por tela aberta). */
  abas: boolean
  /** Menu "Acesso rápido" no cabeçalho. */
  acessoRapido: boolean
  /** Cabeçalho do sistema fixo no topo ao rolar. */
  headerFixo: boolean
  /** Barra de título da página (PageHeaderBar) fixa abaixo do cabeçalho. */
  barraPaginaFixa: boolean
  /** Sidebar reduzida expande ao passar o mouse. */
  sidebarHover: boolean
}

export const LAYOUT_DEFAULTS: LayoutPrefs = {
  skin: 'padrao',
  abas: false,
  acessoRapido: true,
  headerFixo: true,
  barraPaginaFixa: true,
  sidebarHover: true,
}

export const SKINS: Array<{ key: SkinKey; nome: string; descricao: string; cor: string }> = [
  { key: 'padrao',    nome: 'Padrão',    descricao: 'Azul · limpo',        cor: '#0067ff' },
  { key: 'esmeralda', nome: 'Esmeralda', descricao: 'Esmeralda · verde',   cor: '#059669' },
  { key: 'ambar',     nome: 'Âmbar',     descricao: 'Âmbar · dourado',     cor: '#d97706' },
  { key: 'coral',     nome: 'Coral',     descricao: 'Coral · quente',      cor: '#e11d48' },
  { key: 'lilas',     nome: 'Lilás',     descricao: 'Lavanda',             cor: '#7c3aed' },
  { key: 'grafite',   nome: 'Grafite',   descricao: 'Mono · minimalista',  cor: '#334155' },
]

/** Combinações prontas (a "Predefinição" do modelo). */
export const PRESETS: Record<PresetKey, { nome: string; prefs: Partial<LayoutPrefs>; sidebarReduzida: boolean }> = {
  padrao: { nome: 'Padrão',           prefs: { abas: false, acessoRapido: true, headerFixo: true, barraPaginaFixa: true, sidebarHover: true }, sidebarReduzida: false },
  minimo: { nome: 'Mínimo',           prefs: { abas: false, acessoRapido: false, headerFixo: true, barraPaginaFixa: false, sidebarHover: true }, sidebarReduzida: true },
  foco:   { nome: 'Foco no conteúdo', prefs: { abas: false, acessoRapido: false, headerFixo: false, barraPaginaFixa: false, sidebarHover: true }, sidebarReduzida: true },
}

const KEY = 'oc-layout-prefs'
export const PREFS_EVENT = 'oc-prefs'

/** Dispara pra outras instâncias de hooks (tema, sidebar) relerem o localStorage. */
export function notificarPrefs(chave: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { chave } }))
}

function ler(): LayoutPrefs {
  if (typeof window === 'undefined') return LAYOUT_DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...LAYOUT_DEFAULTS, ...(JSON.parse(raw) as Partial<LayoutPrefs>) } : LAYOUT_DEFAULTS
  } catch { return LAYOUT_DEFAULTS }
}

interface Ctx {
  prefs: LayoutPrefs
  mounted: boolean
  set: <K extends keyof LayoutPrefs>(k: K, v: LayoutPrefs[K]) => void
  aplicarPreset: (p: PresetKey) => void
  reset: () => void
}
const LayoutPrefsContext = createContext<Ctx | null>(null)

export function LayoutPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<LayoutPrefs>(LAYOUT_DEFAULTS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setPrefs(ler()); setMounted(true) }, [])

  // data-skin no <html> — o CSS (globals) troca os tokens de primário por skin
  useEffect(() => {
    if (!mounted) return
    if (prefs.skin === 'padrao') document.documentElement.removeAttribute('data-skin')
    else document.documentElement.setAttribute('data-skin', prefs.skin)
  }, [prefs.skin, mounted])

  const persistir = useCallback((next: LayoutPrefs) => {
    setPrefs(next)
    localStorage.setItem(KEY, JSON.stringify(next))
    notificarPrefs('layout')
  }, [])

  const set = useCallback(<K extends keyof LayoutPrefs>(k: K, v: LayoutPrefs[K]) => {
    persistir({ ...ler(), [k]: v })
  }, [persistir])

  const aplicarPreset = useCallback((p: PresetKey) => {
    const def = PRESETS[p]
    persistir({ ...ler(), ...def.prefs })
    localStorage.setItem('sidebar-collapsed', String(def.sidebarReduzida))
    notificarPrefs('sidebar')
  }, [persistir])

  const reset = useCallback(() => {
    persistir(LAYOUT_DEFAULTS)
    localStorage.setItem('sidebar-collapsed', 'false')
    localStorage.setItem('theme', 'system')
    notificarPrefs('sidebar'); notificarPrefs('theme')
  }, [persistir])

  const value = useMemo(() => ({ prefs, mounted, set, aplicarPreset, reset }), [prefs, mounted, set, aplicarPreset, reset])
  return <LayoutPrefsContext.Provider value={value}>{children}</LayoutPrefsContext.Provider>
}

export function useLayoutPrefs(): Ctx {
  const ctx = useContext(LayoutPrefsContext)
  // Fora do provider (ex.: páginas públicas) devolve os padrões, sem quebrar.
  if (!ctx) return { prefs: LAYOUT_DEFAULTS, mounted: true, set: () => {}, aplicarPreset: () => {}, reset: () => {} }
  return ctx
}
