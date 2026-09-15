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

/** Marca do escritório que atende o cliente — a logo do topo. */
export interface MarcaDoEscritorio {
  nome: string
  logoUrl: string | null
  logoDarkUrl: string | null
}

export interface VinculoPortal {
  clienteId: string
  razaoSocial: string
  nivel: 'ADMINISTRADOR' | 'OPERACIONAL' | 'CONSULTA'
  areas: string[]
  /**
   * O que esta pessoa faz com arquivos. Vem do vínculo, não do nível: o
   * escritório concede um a um, e a tela usa para decidir o que oferecer —
   * botão que a API vai recusar é pior do que botão ausente.
   */
  podeVer: boolean
  podeEditar: boolean
  podeExcluir: boolean
  /** Módulos que o master liberou para a empresa deste cliente. */
  modulos: string[]
  /** Acompanha o cliente ATIVO: trocar de empresa pode trocar de escritório. */
  escritorio: MarcaDoEscritorio | null
}

export const PortalContexto = createContext<{
  clienteId: string
  vinculo: VinculoPortal | null
}>({ clienteId: '', vinculo: null })

export function usePortal() {
  return useContext(PortalContexto)
}
