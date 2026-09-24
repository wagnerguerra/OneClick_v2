/**
 * Folha ou sintética — a pergunta que impede contar o mesmo dinheiro duas vezes.
 *
 * O balancete do SCI traz os dois: a conta sintética ("DESPESAS OPERACIONAIS")
 * e as analíticas embaixo dela. A sintética já é a soma das filhas. Somar as
 * duas dobra o valor.
 *
 * Enquanto a categoria vinha de um template com 142 contas de nível 5, isso era
 * seguro por acidente — nenhuma sintética tinha categoria. Com o de-para pelo
 * nível 3 (`depara-nivel3.ts`), TODA a subárvore passa a ter categoria, e o
 * filtro deixa de ser opcional.
 *
 * Vive em arquivo próprio, sem Prisma, para poder ser testado direto.
 */

/**
 * O filtro, em SQL.
 *
 * `analitica` é o `BDTIPCTA` do SCI: a fonte dizendo se a conta é folha. Linha
 * importada antes dessa coluna existir cai na heurística — é folha quem não tem
 * descendente no mesmo período. A heurística erra quando um nível inteiro não
 * foi importado, daí preferir o dado da fonte.
 */
export function sqlSomenteFolhas(alias = 'l'): string {
  return `(
        ${alias}.analitica = true
        OR (${alias}.analitica IS NULL AND NOT EXISTS (
          SELECT 1 FROM cliente_bi_linhas f
          WHERE f.cliente_id = ${alias}.cliente_id
            AND f.periodo = ${alias}.periodo
            AND f.conta LIKE ${alias}.conta || '.%'
            AND LENGTH(f.conta) > LENGTH(${alias}.conta)
        ))
      )`
}

/** O mesmo critério em memória, para quem já carregou as linhas. */
export function ehFolha(
  linha: { conta: string; analitica: boolean | null },
  todasAsContas: ReadonlySet<string>,
): boolean {
  if (linha.analitica === true) return true
  if (linha.analitica === false) return false
  const prefixo = `${linha.conta}.`
  for (const c of todasAsContas) {
    if (c.length > prefixo.length && c.startsWith(prefixo)) return false
  }
  return true
}
