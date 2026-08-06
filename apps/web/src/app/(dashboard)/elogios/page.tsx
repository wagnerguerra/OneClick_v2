'use client'

import { ThumbsUp } from 'lucide-react'
import { ManifestacaoPage } from '../_manifestacoes/manifestacao-page'
import type { Config } from '../_manifestacoes/tipos'

/**
 * Elogios.
 *
 * No legado o elogio vinha sempre de cliente e os elogiados eram guardados como
 * texto solto — nomes separados por vírgula. Aqui a origem é escolha e o
 * elogiado é vínculo por id, então o registro segue a pessoa mesmo que ela
 * mude de nome.
 */
const CONFIG: Config = {
  slug: 'elogios',
  router: 'elogio',
  titulo: 'Elogios',
  subtitulo: 'O que foi bem feito — de dentro de casa ou vindo de um cliente.',
  rotuloNovo: 'Registrar elogio',
  vazio: 'Nenhum elogio registrado ainda.',
  icone: ThumbsUp,
  status: ['RECEBIDA', 'RESPONDIDA', 'ENCERRADA'],
  pedeElogiados: true,
  origemPadrao: 'CLIENTE',
  avisoAnonimo: 'O elogio chega a quem foi elogiado sem dizer quem o escreveu.',
}

export default function ElogiosPage() {
  return <ManifestacaoPage config={CONFIG} />
}
