/**
 * Um único lugar para responder "esta linha do balancete entra em qual
 * categoria da DRE, e ela é folha?".
 *
 * Antes cada consulta respondia por conta própria — por prefixo de conta, por
 * regex no nome, ou pelo template global de 142 classificações. O módulo
 * chegou a ter três respostas diferentes na mesma tela.
 */

import { prisma } from '@saas/db'
import {
  deparaDoPlano,
  sqlDeparaValues,
  sqlNivel3,
  type DeparaCliente,
} from './depara-nivel3'

/**
 * Carrega o de-para do plano de contas do cliente.
 *
 * O nome do nível 3 sai do catálogo (`nomeSci`); quando o catálogo não tem a
 * conta — cliente importado antes do catálogo existir — cai no nome que veio
 * com a própria linha do balancete, que é o mesmo texto do SCI.
 */
export async function carregarDepara(clienteId: string): Promise<DeparaCliente> {
  // Só as contas de nível 3 (dois pontos) — costumam ser duas dezenas. O
  // catálogo tem prioridade sobre a linha do balancete; as duas guardam o
  // mesmo texto do SCI.
  const rows = await prisma.$queryRaw<Array<{ conta: string; nome: string | null }>>`
    SELECT DISTINCT ON (conta) conta, nome
    FROM (
      SELECT conta, nome_sci AS nome, 1 AS prio
        FROM cliente_bi_categorias WHERE cliente_id = ${clienteId}
      UNION ALL
      SELECT conta, nome_conta AS nome, 2 AS prio
        FROM cliente_bi_linhas WHERE cliente_id = ${clienteId}
    ) t
    WHERE LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 2
    ORDER BY conta, prio
  `
  return deparaDoPlano(rows.map(r => ({ conta: r.conta, nomeSci: r.nome })))
}

/**
 * Os JOINs que resolvem a categoria de `<alias>`: override do cliente primeiro,
 * de-para da máscara depois.
 *
 * Usa os apelidos fixos `cbc` e `dp` — quem escrever a consulta se refere à
 * categoria por `SQL_CATEGORIA`.
 */
export function sqlJoinsCategoria(depara: DeparaCliente, alias = 'l'): string {
  return `
      LEFT JOIN cliente_bi_categorias cbc
        ON cbc.cliente_id = ${alias}.cliente_id AND cbc.conta = ${alias}.conta
       AND cbc.categoria_dre IS NOT NULL
      LEFT JOIN ${sqlDeparaValues(depara)} AS dp(conta3, categoria)
        ON dp.conta3 = ${sqlNivel3(`${alias}.conta`)}`
}

/** A categoria resolvida, para usar no SELECT, no WHERE e no GROUP BY. */
export const SQL_CATEGORIA = 'COALESCE(cbc.categoria_dre, dp.categoria)'

// O filtro de folha mora em `folha.ts` — sem Prisma, para ter teste direto.
export { sqlSomenteFolhas, ehFolha } from './folha'

/**
 * Restringe a consulta aos meses escolhidos no filtro da tela.
 *
 * Vem como fragmento ADICIONAL, somado ao `BETWEEN` do ano — e não no lugar
 * dele. Trocar um pelo outro deixaria `$2`/`$3` sem referência no SQL, e o
 * Postgres recusa a consulta ("bind message supplies 3 parameters, but
 * prepared statement requires 1").
 *
 * Os períodos são gerados por nós (`ano` + mês do filtro), mas passam por um
 * formato estrito antes de virarem literal: é dado que chegou pela URL.
 */
export function sqlPeriodosEscolhidos(periodos: string[] | undefined, alias = 'l'): string {
  if (!periodos || periodos.length === 0) return ''
  const validos = periodos.filter(p => /^\d{6}$/.test(p))
  if (validos.length === 0) return ''
  return `AND ${alias}.periodo IN (${validos.map(p => `'${p}'`).join(', ')})`
}
