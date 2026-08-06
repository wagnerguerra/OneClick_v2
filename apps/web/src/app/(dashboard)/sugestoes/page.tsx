'use client'

import { Lightbulb } from 'lucide-react'
import { ManifestacaoPage } from '../_manifestacoes/manifestacao-page'
import type { Config } from '../_manifestacoes/tipos'

/**
 * Sugestões.
 *
 * O legado já tinha anonimato aqui — furado: respondia por e-mail ao autor
 * mesmo quando a sugestão era anônima. Agora não há autor a quem escrever, e o
 * acompanhamento é pelo protocolo.
 *
 * O mural veio do v1 (`publicar`): o colaborador PEDE que a sugestão apareça
 * para todos, e a Qualidade decide. Continua sendo pedido, não direito.
 */
const CONFIG: Config = {
  slug: 'sugestoes',
  router: 'sugestao',
  titulo: 'Sugestões',
  subtitulo: 'Ideias para melhorar o que fazemos — de colaboradores ou de clientes.',
  rotuloNovo: 'Registrar sugestão',
  vazio: 'Nenhuma sugestão registrada ainda.',
  icone: Lightbulb,
  status: ['RECEBIDA', 'RESPONDIDA', 'ENCERRADA'],
  temMural: true,
  origemPadrao: 'INTERNA',
  avisoAnonimo: 'A sugestão é avaliada sem que se saiba de quem partiu.',
}

export default function SugestoesPage() {
  return <ManifestacaoPage config={CONFIG} />
}
