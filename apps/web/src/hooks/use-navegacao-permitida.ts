'use client'

/**
 * A navegação que ESTE usuário pode ver.
 *
 * Nasceu dentro da sidebar. Virou hook quando a busca global passou a precisar
 * da mesma lista: uma paleta que oferecesse páginas escondidas do menu seria
 * pior que não ter busca — o usuário acharia o item, clicaria e tomaria um
 * "sem permissão". Duas cópias da regra viram duas respostas diferentes no dia
 * em que alguém mexer numa só.
 */

import { useMemo } from 'react'
import { navigation, type NavGroup, type NavItem } from '@/lib/navigation'
import { useUserPermissions } from '@/hooks/use-user-permissions'

export function useNavegacaoPermitida(): { grupos: NavGroup[]; podeFerramentas: boolean } {
  const { isMaster, isEmpresaMaster, allowedSlugs, permissions, role } = useUserPermissions()
  const ehLiderSetor = ['GESTOR', 'COORDENADOR', 'DIRETOR'].includes(role)

  // Ferramentas fica fora dos blocos da navegação, então não passa pelo filtro.
  const podeFerramentas = isMaster || isEmpresaMaster || allowedSlugs.includes('ferramentas-gerais')

  const grupos = useMemo(() => {
    const isAdmin = isMaster || isEmpresaMaster
    const hasSub = (module: string, sub: string): boolean =>
      isAdmin || permissions.find((p) => p.moduleSlug === module)?.subPermissions?.[sub] === true
    // Alguma sub-permissão do módulo — para item de menu único cujas telas
    // internas são abas com permissões distintas.
    const hasAnySub = (module: string): boolean =>
      isAdmin || Object.values(permissions.find((p) => p.moduleSlug === module)?.subPermissions ?? {}).some(Boolean)
    const subOk = (item: NavItem): boolean => {
      if (!item.requirePerm) return true
      const { module, sub } = item.requirePerm
      return sub ? hasSub(module, sub) : hasAnySub(module)
    }

    const byPermission = (item: NavItem): boolean => {
      // Módulos master-only (ex.: Empresas — admin global multi-tenant): nunca
      // aparecem para admins de tenant, mesmo com o slug nas permissões.
      if (item.masterOnly) return false
      // FAQ é conteúdo de ajuda — sempre visível.
      if (item.href === '/faq') return true
      // Painel Comercial consolida CRM/Orçamentos/Contratos — visível a quem tem
      // leitura em qualquer um deles (os dados são gateados no backend).
      if (item.href === '/comercial') {
        return ['crm', 'orcamentos', 'contratos'].some((s) => allowedSlugs.includes(s))
      }
      // Benefícios: líder de setor lança os apontamentos do próprio setor.
      if (item.href === '/beneficios' && ehLiderSetor) return true
      if (item.href.startsWith('/ferramentas/')) {
        const area = item.href.split('/')[2]
        return allowedSlugs.includes(`ferramentas-${area}`)
      }
      return allowedSlugs.includes(item.href.replace('/', ''))
    }

    return navigation
      .map((group) => {
        // wip = rota ainda não publicada (404). Escondida de TODOS, inclusive
        // master (também tomaria 404). Aplica também aos subItems. F-006.
        let items: NavItem[] = group.items
          .filter((item) => !item.wip)
          .map((item) =>
            item.subItems
              ? { ...item, subItems: item.subItems.filter((s) => !s.wip && subOk(s)) }
              : item,
          )
        if (!isMaster) items = items.filter(byPermission)
        return { ...group, items }
      })
      .filter((group) => group.items.length > 0)
  }, [isMaster, isEmpresaMaster, allowedSlugs, permissions, ehLiderSetor])

  return { grupos, podeFerramentas }
}
