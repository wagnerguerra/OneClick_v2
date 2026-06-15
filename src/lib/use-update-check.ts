import { useEffect, useRef } from 'react'

import { checkForUpdate } from './update-check'

/**
 * Verifica, ao abrir o app, se há uma versão mais nova publicada (silencioso —
 * só avisa se houver atualização). Roda uma vez por sessão. A lógica fica em
 * `checkForUpdate`, reutilizada pelo botão "Verificar atualizações".
 */
export function useUpdateCheck(): void {
  const jaChecou = useRef(false)

  useEffect(() => {
    if (jaChecou.current) return
    jaChecou.current = true
    void checkForUpdate({ manual: false })
  }, [])
}
