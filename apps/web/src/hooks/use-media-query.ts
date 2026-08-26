'use client'

import { useEffect, useState } from 'react'

/**
 * Responde a uma media query e re-renderiza quando ela muda.
 *
 * Serve para o que CSS não resolve: trocar a ESTRUTURA em telas estreitas —
 * empilhar o que era grade arrastável, desligar interações que só existem com
 * mouse. Para aparência (tamanho, espaçamento, colunas), continue usando as
 * classes do Tailwind; media query em JS custa render e não roda no servidor.
 *
 * No servidor e no primeiro render devolve `false`, e só então mede: assim o
 * HTML do servidor e o do cliente batem, sem o aviso de hidratação.
 */
export function useMediaQuery(query: string): boolean {
  const [combina, setCombina] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(query)
    setCombina(mq.matches)
    const ouvir = (e: MediaQueryListEvent) => setCombina(e.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [query])

  return combina
}

/** Abaixo de `sm` (640px) — celular em pé. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 639px)')
}
