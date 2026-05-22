'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTabs } from '@/lib/tabs-store'
import { navigation } from '@/lib/navigation'

// Plural → singular para rotas de detalhe (/{plural}/[id]).
// Páginas de detalhe podem sobrescrever via useTabLabel(...) com o label completo.
const SINGULAR_LABELS: Record<string, string> = {
  'clientes': 'Cliente',
  'empresas': 'Empresa',
  'colaboradores': 'Colaborador',
  'fornecedores': 'Fornecedor',
  'orcamentos': 'Orçamento',
  'contratos': 'Contrato',
  'servicos': 'Serviço',
  'socios': 'Sócio',
  'usuarios': 'Usuário',
  'agenda': 'Evento',
  'crm': 'Oportunidade',
  'pesquisas': 'Pesquisa',
  'processos': 'Processo',
  'projetos': 'Projeto',
}

/**
 * Resolve label e icon de uma rota a partir da configuração da sidebar.
 * Procura primeiro match exato no href; se não achar, é uma rota de detalhe
 * (ex: /clientes/abc) → usa o label singular do recurso (ex: "Cliente").
 *
 * Rotas com sub-segmentos conhecidos (ex: /orcamentos/configuracoes,
 * /orcamentos/parametros) NÃO são rotas de detalhe — caem no prefix match
 * com label do plural ou ignoram.
 */
function resolveRouteMeta(pathname: string): { label: string; icon: string } | null {
  const pathClean = pathname.split('?')[0]!.split('#')[0]
  const allItems = navigation.flatMap(g => [
    ...g.items,
    ...g.items.flatMap(it => it.subItems ?? []),
  ])
  // 1. Match exato em algum item da sidebar (incluindo sub-itens)
  const exato = allItems.find(it => it.href === pathClean)
  if (exato) {
    // Slug deve casar com MODULE_ICONS, que usa `href.replace('/', '')` (só o 1º `/`).
    // Pra rotas multi-segmento (ex: /admin/design-system) o slug é 'admin/design-system'.
    const slug = exato.href.replace(/^\//, '') || 'dashboard'
    return { label: exato.label, icon: slug }
  }
  const segments = pathClean.split('/').filter(Boolean)
  if (segments.length === 0) return null

  // 2. Rota de detalhe (/{recurso}/[id]) — singularize
  if (segments.length === 2 && SINGULAR_LABELS[segments[0]!]) {
    return { label: SINGULAR_LABELS[segments[0]!]!, icon: segments[0]! }
  }

  // 3. Prefix match (rotas tipo /orcamentos/relatorios sem sub-item explícito)
  const primeiro = `/${segments[0]}`
  const prefix = allItems.find(it => it.href === primeiro)
  if (prefix) {
    return { label: prefix.label, icon: segments[0]! }
  }
  return null
}

/**
 * Hook que sincroniza a rota atual com o sistema de abas:
 *  • Ao navegar para uma rota, se ainda não houver aba aberta para ela,
 *    cria automaticamente uma aba.
 *  • Se já existe aba para essa rota, ativa (apenas pelo `pathname`).
 *
 * Deve ser montado uma única vez no layout principal (após TabsProvider).
 */
export function useSyncRouteTab() {
  const pathname = usePathname()
  const { tabs, addOrFocus } = useTabs()
  const lastSyncedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return
    // Ignora rotas que não devem virar aba
    if (
      pathname === '/login'
      || pathname === '/onboarding'
      || pathname.startsWith('/login/')
      || pathname.startsWith('/api/')
    ) return

    if (lastSyncedRef.current === pathname) return
    lastSyncedRef.current = pathname

    const pathClean = pathname.split('?')[0]!.split('#')[0]
    const existing = tabs.find(t => {
      const tClean = t.href.split('?')[0]!.split('#')[0]
      return tClean === pathClean
    })
    if (existing) return // já tem aba — ativação é puramente visual via pathname match

    const meta = resolveRouteMeta(pathname)
    if (!meta) return

    // Cria aba (silenciosamente — se der erro de limite, o user verá no próximo addOrFocus)
    addOrFocus({ href: pathClean, label: meta.label, icon: meta.icon }).catch(() => {
      /* limite atingido — silent, evita poluir UX */
    })
  }, [pathname, tabs, addOrFocus])
}
