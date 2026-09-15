import { prisma } from '@saas/db'

/**
 * Rotinas automáticas não trabalham para empresa inativa.
 *
 * Inativar um tenant corta o acesso das pessoas (login e sessão), mas os
 * agendadores não passam por login: sem este recorte, seguiriam mandando
 * e-mail aos clientes, consultando a SEFAZ e criando execuções para um
 * escritório desligado.
 *
 * Quem se aplica: a consulta que ESCOLHE o trabalho de cada rotina. O recorte
 * é "fora de empresa inativa", e não "dentro de empresa ativa", de propósito:
 * registro sem empresa segue sendo processado como sempre foi. Quando não há
 * empresa inativa — o caso normal — a consulta sai idêntica à de antes.
 */

let cache: { ids: string[]; expira: number } | null = null
const TTL_MS = 30_000

/** Ids das empresas inativas. Cache curto: rotinas de 20s não precisam consultar a cada volta. */
export async function idsDeEmpresasInativas(): Promise<string[]> {
  if (cache && cache.expira > Date.now()) return cache.ids
  const linhas = await prisma.empresa.findMany({ where: { isActive: false }, select: { id: true } })
  cache = { ids: linhas.map((l) => l.id), expira: Date.now() + TTL_MS }
  return cache.ids
}

/** Chamado ao inativar ou reativar: a próxima volta das rotinas já enxerga a mudança. */
export function esquecerEmpresasInativas(): void {
  cache = null
}

/**
 * Acrescenta ao `where` do Prisma o recorte "fora de empresa inativa".
 *
 * Entra como item de `AND`, para não colidir com um `OR` que o `where` já
 * tenha. Só para `empresaId` ANULÁVEL: o recorte aceita `null`, e o Prisma
 * recusa comparar campo obrigatório com `null`.
 *
 * Passe o tipo do where na chamada — `semEmpresaInativa<Prisma.ClienteWhereInput>(...)`.
 * Sem ele, o literal perde o contexto e `'ATIVO'` vira `string`, que o enum recusa.
 */
export function semEmpresaInativa<W extends object>(where: W, inativas: string[], campo = 'empresaId'): W {
  if (inativas.length === 0) return where
  const atual = (where as { AND?: unknown }).AND
  const lista = Array.isArray(atual) ? atual : atual ? [atual] : []
  return { ...where, AND: [...lista, { OR: [{ [campo]: null }, { [campo]: { notIn: inativas } }] }] } as W
}

/**
 * O mesmo recorte para SQL cru. `coluna` é o nome qualificado da coluna de
 * empresa (ex.: `v.empresa_id`) — sempre um literal do código, nunca entrada.
 * `NOT EXISTS` porque também deixa passar a linha sem empresa.
 */
export function sqlSemEmpresaInativa(coluna: string): string {
  return `NOT EXISTS (SELECT 1 FROM empresas e_inativa WHERE e_inativa.id = ${coluna} AND e_inativa.is_active = false)`
}
