/**
 * Recorte da carteira do Acessórias: o que as telas do módulo podem mostrar.
 *
 * Só entra cliente MENSAL ATIVO da empresa carregada. Até 30/09/2026 esse
 * recorte só valia na ESCRITA (a sincronização grava entregas apenas de
 * mensal ativo) — as linhas já espelhadas de um cliente inativado depois
 * continuavam no painel e nos indicadores (em produção: 2.914 entregas de
 * 108 clientes inativos/avulsos/paralisados). Agora toda LEITURA passa por
 * aqui também.
 */

import type { Prisma } from '@saas/db'

/** Cliente que faz parte da carteira do Acessórias. */
export const CLIENTE_ATIVO_MENSAL = { status: 'ATIVO', situacao: 'MENSAL' } as const

/**
 * Filtro de `AcessoriasEntrega`: cliente mensal ativo e, com empresa
 * carregada, da empresa — tanto a coluna da entrega quanto o cadastro do
 * cliente (a coluna é cópia feita no sync; o cadastro é a fonte).
 */
export function daCarteira(empresaId?: string | null): Prisma.AcessoriasEntregaWhereInput {
  return {
    ...(empresaId ? { empresaId } : {}),
    cliente: { is: { ...CLIENTE_ATIVO_MENSAL, ...(empresaId ? { empresaId } : {}) } },
  }
}

/**
 * Rotinas que GRAVAM (sincronizar, vincular, remover…) só agem na empresa
 * carregada. Sem empresa no contexto, recusam — antes caíam num "sem filtro"
 * e alcançavam clientes e registros de todas as empresas.
 */
export function exigirEmpresa(empresaId: string | null | undefined): string {
  if (!empresaId) throw new Error('Selecione a empresa antes de usar a integração com o Acessórias.')
  return empresaId
}

/** Entregas da empresa cujo cliente saiu da carteira (inativo, avulso, paralisado…). */
export function foraDaCarteira(empresaId: string): Prisma.AcessoriasEntregaWhereInput {
  return {
    empresaId,
    cliente: { is: { OR: [{ status: { not: CLIENTE_ATIVO_MENSAL.status } }, { situacao: { not: CLIENTE_ATIVO_MENSAL.situacao } }] } },
  }
}
