'use client'

import { MailWarning, Zap, GitCompareArrows, BarChart3 } from 'lucide-react'
import { useUserPermissions } from '@/hooks/use-user-permissions'

/**
 * As telas do Acessórias vivem sob um único item de menu.
 *
 * Cada aba tem sua própria sub-permissão e só aparece para quem a tem: quem só
 * acompanha entregas não vê a aba de integração, e vice-versa.
 */
export const ABAS = [
  { href: '/acessorias/indicadores', label: 'Indicadores', icon: BarChart3, sub: 'ver_painel_entregas' },
  { href: '/acessorias/painel', label: 'Entregas e guias', icon: MailWarning, sub: 'ver_painel_entregas' },
  { href: '/acessorias/integracao', label: 'Integração', icon: Zap, sub: 'gerenciar_integracao' },
  { href: '/acessorias/divergencias', label: 'Divergências', icon: GitCompareArrows, sub: 'conciliar_cadastro' },
] as const

/** Abas que este usuário pode ver, na ordem acima. */
export function useAbasPermitidas() {
  const { isMaster, isEmpresaMaster, permissions, loading } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'acessorias')?.subPermissions ?? {}) as Record<string, boolean>
  const tudo = isMaster || isEmpresaMaster
  return { abas: ABAS.filter((a) => tudo || subs[a.sub] === true), loading }
}
