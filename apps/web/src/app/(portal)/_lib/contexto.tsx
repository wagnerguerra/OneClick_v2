'use client'

import { createContext, useContext } from 'react'

/**
 * Cliente ativo do portal.
 *
 * Toda chamada do portal exige `clienteId` — é a assinatura da
 * `portalProcedure` no backend, que resolve o vínculo antes do handler rodar.
 * O contexto existe para as páginas não reimplementarem a escolha da empresa
 * (nem, pior, chutarem um id).
 */

export interface VinculoPortal {
  clienteId: string
  razaoSocial: string
  nivel: 'ADMINISTRADOR' | 'OPERACIONAL' | 'CONSULTA'
  areas: string[]
}

export const PortalContexto = createContext<{
  clienteId: string
  vinculo: VinculoPortal | null
}>({ clienteId: '', vinculo: null })

export function usePortal() {
  return useContext(PortalContexto)
}
