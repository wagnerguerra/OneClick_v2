import { redirect } from 'next/navigation'

/**
 * Os relatórios comerciais viraram abas do Painel Comercial (25/09/2026).
 * Esta rota fica só para não quebrar links e favoritos antigos.
 */
const ABA_DO_RELATORIO: Record<string, string> = {
  funil: 'funil-unificado',
  mrr: 'mrr',
  vendedores: 'vendedores',
  descontos: 'descontos',
}

export default async function ComercialRelatoriosRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  redirect(`/comercial?aba=${ABA_DO_RELATORIO[tab ?? ''] ?? 'funil-unificado'}`)
}
