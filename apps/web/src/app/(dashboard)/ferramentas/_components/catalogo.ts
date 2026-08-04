import { FileText, type LucideIcon } from 'lucide-react'

/**
 * Catálogo das ferramentas de uso geral.
 *
 * Uma entrada por utilitário. As ferramentas abrem em MODAL, e não em página
 * própria: são operações curtas e de ida e volta — sair da vitrine para voltar
 * logo em seguida só somava navegação.
 *
 * `cor` é o hex do selo do ícone. Cada ferramenta tem a sua, para o cartão ser
 * reconhecível de relance quando a grade crescer.
 */
export interface Ferramenta {
  slug: string
  titulo: string
  descricao: string
  icone: LucideIcon
  cor: string
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    slug: 'html-pdf',
    titulo: 'HTML para PDF',
    descricao: 'Converte relatórios em HTML para PDF, um por arquivo ou tudo num documento só, '
      + 'preservando fundos, cores e a quebra de página dos blocos.',
    icone: FileText,
    cor: '#e11d48',
  },
]
