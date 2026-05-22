/**
 * Detecta o slug do módulo a partir da URL atual (ou de uma URL passada).
 * Usado pelo error-reporter pra rotular erros por área da aplicação.
 *
 * Convenções de slug usadas no projeto (alinhadas com docs/MODULOS.md):
 *   'cnd', 'danfe', 'agendamento', 'sci', 'admin', 'crm', 'orcamentos',
 *   'servicos', 'clientes', 'colaboradores', 'empresas', etc.
 *
 * Pra rotas sub-aninhadas, pega o primeiro segmento útil após o grupo
 * `(dashboard)`. Retorna null se a URL não pertencer a um módulo conhecido.
 */

const MAPA: Record<string, string> = {
  // Fiscal
  'danfe': 'danfe',
  'certidoes-cnd': 'cnd',
  'cnd': 'cnd',
  'dctfweb': 'dctfweb',
  'caixapostal': 'caixapostal',
  'caixa-postal-ecac': 'caixapostal',
  'sitfis': 'sitfis',
  'nfse': 'nfse',
  // Corporativo
  'crm': 'crm',
  'orcamentos': 'orcamentos',
  'servicos': 'servicos',
  'processos': 'processos',
  'pesquisas': 'pesquisas',
  'minhas-obrigacoes': 'obrigacoes',
  'tarefas': 'tarefas',
  // Cadastros
  'clientes': 'clientes',
  'colaboradores': 'colaboradores',
  'empresas': 'empresas',
  'fornecedores': 'fornecedores',
  'socios': 'socios',
  'gestao-certificados': 'certificados',
  'areas': 'areas',
  'cargos': 'cargos',
  'ativos': 'ativos',
  // Admin
  'admin': 'admin',
  'bi-faturamento': 'bi',
  'bi-categorias-balancete': 'bi',
  // Outros
  'helpdesk': 'helpdesk',
  'feriados': 'feriados',
  'faq': 'faq',
}

export function detectarModulo(href?: string | null): string | null {
  try {
    const url = href
      ? new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
      : (typeof window !== 'undefined' ? window.location : null)
    if (!url) return null

    const path = url.pathname
    // Pega primeiro segmento não-vazio
    const segs = path.split('/').filter(Boolean)
    for (const seg of segs) {
      if (MAPA[seg]) return MAPA[seg]
    }
    return null
  } catch {
    return null
  }
}
