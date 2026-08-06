'use client'

import { MessageSquare } from 'lucide-react'
import { ManifestacaoPage } from '../_manifestacoes/manifestacao-page'
import type { Config } from '../_manifestacoes/tipos'

/**
 * Reclamações.
 *
 * O único dos três com fluxo de verdade, e ele vem inteiro do v1: separar o
 * RETORNO IMEDIATO ao cliente da ANÁLISE de procedência é o que prova, numa
 * auditoria, que a empresa respondeu rápido e apurou depois. Um fluxo de
 * "aberta/encerrada" perderia essa distinção.
 *
 * A novidade em relação ao legado é a origem: lá a reclamação era sempre de
 * cliente, e não havia como registrar uma reclamação interna.
 */
const CONFIG: Config = {
  slug: 'reclamacoes',
  router: 'reclamacao',
  titulo: 'Reclamações',
  subtitulo: 'O que deu errado — do cliente ou de dentro de casa —, e como foi tratado.',
  rotuloNovo: 'Registrar reclamação',
  vazio: 'Nenhuma reclamação registrada ainda.',
  icone: MessageSquare,
  status: [
    'AGUARDANDO_RETORNO',
    'AGUARDANDO_ANALISE',
    'REGISTRAR_EFICACIA',
    'NAO_PROCEDENTE',
    'FINALIZADA',
  ],
  temFluxo: true,
  origemPadrao: 'CLIENTE',
  avisoAnonimo: 'A reclamação é apurada sem que se saiba quem a registrou.',
}

export default function ReclamacoesPage() {
  return <ManifestacaoPage config={CONFIG} />
}
