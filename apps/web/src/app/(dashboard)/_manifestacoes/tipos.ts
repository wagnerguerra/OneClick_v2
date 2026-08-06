import type { LucideIcon } from 'lucide-react'

/**
 * O que distingue um módulo do outro.
 *
 * A tela é a mesma para elogio, reclamação e sugestão; o que muda cabe aqui.
 * Manter as diferenças num objeto — e não em três telas parecidas — é o que
 * impede que uma correção feita num deles esqueça os outros dois.
 */
export interface Config {
  /** Slug do módulo, usado para permissão. */
  slug: 'elogios' | 'reclamacoes' | 'sugestoes'
  /** Chave do router no tRPC. */
  router: 'elogio' | 'reclamacao' | 'sugestao'
  titulo: string
  subtitulo: string
  rotuloNovo: string
  vazio: string
  icone: LucideIcon
  /** Situações que este tipo usa, na ordem do fluxo. */
  status: string[]
  /** Pergunta quem foi elogiado (só Elogios). */
  pedeElogiados?: boolean
  /** Oferece o mural público (só Sugestões). */
  temMural?: boolean
  /** Origem que vem marcada por padrão no formulário. */
  origemPadrao: 'INTERNA' | 'CLIENTE'
  /** Texto do aviso de anonimato, específico do módulo. */
  avisoAnonimo: string
}

export interface Linha {
  id: string
  protocolo: string
  titulo: string | null
  descricao: string
  status: string
  origem: string
  anonima: boolean
  publica: boolean
  criadoEm: string
  autor: { id: string; name: string; image?: string | null } | null
  cliente: { id: string; razaoSocial: string } | null
  area: { id: string; name: string } | null
  informanteNome: string | null
  _count?: { mensagens: number; arquivos: number }
}
