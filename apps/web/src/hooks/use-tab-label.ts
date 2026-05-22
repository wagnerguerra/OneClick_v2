'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTabs } from '@/lib/tabs-store'

/**
 * Atualiza o label da aba aberta correspondente ao pathname atual.
 * Usado em páginas de detalhe quando os dados do registro carregam, para
 * substituir o label provisório (ex: "Orçamento") por algo descritivo
 * (ex: "Orçamento: #4489").
 *
 * Recebe `null`/`undefined` enquanto os dados não carregam — não faz nada
 * nesse caso (mantém o label provisório).
 */
export function useTabLabel(label: string | null | undefined) {
  const pathname = usePathname()
  const { updateLabel } = useTabs()

  useEffect(() => {
    if (!label || !pathname) return
    const pathClean = pathname.split('?')[0]!.split('#')[0]
    updateLabel(pathClean, label)
  }, [label, pathname, updateLabel])
}
