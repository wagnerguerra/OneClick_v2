'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ROTEIRO_SOLICITACAO_ORCAMENTO, roteiroEfetivo } from './roteiro-solicitacao'

/**
 * Roteiro do Detalhamento configurado pela empresa (Configurações de
 * Orçamentos → Textos padrão). Até carregar — ou se a consulta falhar — vale o
 * roteiro padrão, para o formulário nunca abrir sem nada.
 */
export function useRoteiroSolicitacao(): string {
  const [roteiro, setRoteiro] = useState(ROTEIRO_SOLICITACAO_ORCAMENTO)
  useEffect(() => {
    let vivo = true
    ;(trpc.orcamento as any).roteiroSolicitacao.query()
      .then((r: string | null) => { if (vivo) setRoteiro(roteiroEfetivo(r)) })
      .catch(() => { /* fica o padrão */ })
    return () => { vivo = false }
  }, [])
  return roteiro
}
