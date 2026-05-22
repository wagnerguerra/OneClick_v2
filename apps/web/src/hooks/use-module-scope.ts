'use client'

/**
 * useModuleScope — determina o "slug do módulo atual" baseado no pathname
 * e aplica a classe `mod-<slug>` no <body>. Permite que overrides CSS escopados
 * em `globals.css` (ex: `.mod-legalizacao .bg-fuchsia-500 { ... }`) afetem TODA
 * a árvore — sidebar, tab bar, page content, badges — não só o wrapper da página.
 *
 * Slugs disponíveis correspondem aos sidebar groups (e às CSS vars `--mod-<slug>`):
 *   cadastros, comercial, administrativo, legalizacao, trabalhista, fiscal,
 *   contabil, ti, qualidade, configuracoes, processos, faq, perfil, corporativo.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Mapa de prefixos de rota → slug do módulo. A rota mais específica vence
 *  (ordem importa — verifica prefixos do MAIS específico pro menos). */
const ROUTE_PREFIXES: Array<[string, string]> = [
  // Cadastros
  ['/clientes', 'cadastros'],
  ['/colaboradores', 'cadastros'],
  ['/empresas', 'cadastros'],
  ['/fornecedores', 'cadastros'],
  ['/socios', 'cadastros'],
  ['/usuarios', 'cadastros'],
  ['/areas', 'cadastros'],
  ['/cargos', 'cadastros'],
  ['/obrigacoes', 'cadastros'],
  ['/servicos', 'cadastros'],

  // Comercial
  ['/orcamentos', 'comercial'],
  ['/crm', 'comercial'],
  ['/pesquisas', 'comercial'],
  ['/contratos', 'comercial'],
  ['/contrato-templates', 'comercial'],
  ['/clausulas', 'comercial'],

  // Processos (sub-bloco de Comercial mas tem cor própria)
  ['/processos', 'processos'],

  // Administrativo
  ['/agenda', 'administrativo'],
  ['/acessorias', 'administrativo'],

  // Corporativo (dashboard, meus, minhas)
  ['/dashboard', 'corporativo'],
  ['/meus-servicos', 'corporativo'],
  ['/minhas-obrigacoes', 'corporativo'],
  ['/perfil', 'perfil'],

  // Legalização
  ['/gestao-certificados', 'legalizacao'],
  ['/certidoes-cnd', 'legalizacao'],
  ['/quadro-societario', 'legalizacao'],

  // Trabalhista
  ['/folha-pagamento', 'trabalhista'],

  // Fiscal
  ['/caixapostal', 'fiscal'],
  ['/danfe', 'fiscal'],
  ['/dctfweb', 'fiscal'],
  ['/dte', 'fiscal'],
  ['/situacao-fiscal', 'fiscal'],

  // Contábil
  ['/bi-categorias-balancete', 'contabil'],
  ['/bi-faturamento', 'contabil'],

  // TI
  ['/ativos', 'ti'],
  ['/helpdesk', 'ti'],

  // Configurações
  ['/configuracoes', 'configuracoes'],

  // FAQ / Ajuda
  ['/faq', 'faq'],

  // Admin (não tem slug de módulo — usa cores próprias)
  ['/admin', ''],
]

function resolveSlug(pathname: string): string | null {
  if (!pathname) return null
  // Match exato ou prefix com `/`
  for (const [prefix, slug] of ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return slug || null
    }
  }
  return null
}

export function useModuleScope() {
  const pathname = usePathname()
  useEffect(() => {
    if (typeof document === 'undefined') return
    const slug = resolveSlug(pathname ?? '')
    // Remove qualquer classe mod-* antiga
    const body = document.body
    Array.from(body.classList)
      .filter(c => c.startsWith('mod-'))
      .forEach(c => body.classList.remove(c))
    // Aplica a nova
    if (slug) body.classList.add(`mod-${slug}`)
  }, [pathname])
}
