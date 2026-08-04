import { FileText, type LucideIcon } from 'lucide-react'

/**
 * Catálogo das ferramentas de uso geral.
 *
 * Uma entrada por utilitário: acrescentar um novo é acrescentar aqui e criar a
 * rota. A página inicial e a navegação saem daqui, então as duas nunca ficam
 * fora de sincronia.
 *
 * `cor` é o hex do selo do ícone. Cada ferramenta tem a sua, para o cartão ser
 * reconhecível de relance quando a grade crescer.
 */
export interface Ferramenta {
  slug: string
  href: string
  titulo: string
  descricao: string
  icone: LucideIcon
  cor: string
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    slug: 'html-pdf',
    href: '/ferramentas/html-pdf',
    titulo: 'HTML para PDF',
    descricao: 'Converte relatórios em HTML para PDF, um por arquivo ou tudo num documento só, '
      + 'preservando fundos, cores e a quebra de página dos blocos.',
    icone: FileText,
    cor: '#e11d48',
  },
]
