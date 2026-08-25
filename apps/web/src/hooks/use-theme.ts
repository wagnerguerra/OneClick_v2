'use client'

import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  // RAIZ do bug de transição inconsistente: elementos com transition-colors/
  // transition-all animam a `color` durante a troca de tema, enquanto o fundo
  // da página (sem transição) muda na hora — o texto "atrasa" o fundo, e ao
  // togglar rápido a transição interrompida gera jank (visível em dev).
  // Solução (igual ao `disableTransitionOnChange` do next-themes): desligar TODAS
  // as transições só durante o instante do toggle, para fundo e texto trocarem
  // juntos e instantaneamente. Removido no próximo frame, restaurando as
  // transições normais (hover etc.).
  const kill = document.createElement('style')
  kill.appendChild(document.createTextNode('*,*::before,*::after{transition:none !important}'))
  document.head.appendChild(kill)

  document.documentElement.classList.toggle('dark', resolved === 'dark')

  // Força reflow para o navegador aplicar a troca já sem transição...
  window.getComputedStyle(document.body).getPropertyValue('opacity')
  // ...e só então remove o override (2 frames = garante o paint sem transição).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (kill.parentNode) kill.parentNode.removeChild(kill)
  }))
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null
    const initial = stored ?? 'system'
    setThemeState(initial)
    applyTheme(initial)
    setMounted(true)

    // Escutar mudanças no system theme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if ((localStorage.getItem(THEME_KEY) ?? 'system') === 'system') {
        applyTheme('system')
      }
    }
    mq.addEventListener('change', handler)
    // Outra instância (ex.: painel "Configurações de layout") mudou o tema
    const onPrefs = (e: Event) => {
      if ((e as CustomEvent).detail?.chave !== 'theme') return
      const t = (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'system'
      setThemeState(t); applyTheme(t)
    }
    window.addEventListener('oc-prefs', onPrefs)
    return () => { mq.removeEventListener('change', handler); window.removeEventListener('oc-prefs', onPrefs) }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
    window.dispatchEvent(new CustomEvent('oc-prefs', { detail: { chave: 'theme' } }))
  }, [])

  const toggleTheme = useCallback(() => {
    // Efeitos (localStorage/applyTheme/dispatch) FORA do updater: dispará-los
    // dentro do updater de setState os executa na fase de render, e o
    // dispatch de `oc-prefs` é síncrono → o listener do LayoutCustomizer daria
    // setState durante o render do Header ("Cannot update a component while
    // rendering a different component"). Espelha o setTheme acima.
    const resolved = theme === 'system' ? getSystemTheme() : theme
    const next = resolved === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
    window.dispatchEvent(new CustomEvent('oc-prefs', { detail: { chave: 'theme' } }))
  }, [theme])

  return { theme, setTheme, toggleTheme, mounted }
}
