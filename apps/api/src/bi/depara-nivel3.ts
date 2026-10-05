/**
 * O de-para da máscara: NOME DO NÍVEL 3 → categoria da DRE.
 *
 * ## Por que o nível 3, e não a conta
 *
 * A aba `DRE` do `docs/balancetes/Máscara.xlsx` tem duas colunas que importam:
 * `Categoria` e `Plano de Contas`. A segunda não é um código de conta — é o
 * NOME de uma conta de nível 3. O Power BI casa exatamente assim:
 *
 *     Table.NestedJoin(…, {"Nível 3"}, MáscaraDEPARA, {"Plano de Contas"}, …)
 *
 * São onze regras, e elas cobrem qualquer folha de qualquer cliente que use o
 * plano padrão do SCI — inclusive contas criadas depois.
 *
 * O porte para o v2 virou `plano_contas_categoria_padrao`: 142 classificações
 * de folha gravadas uma a uma, tiradas do plano da Serrafer, casadas por código
 * exato (`pccp.classificacao = l.conta`). Folha que a Serrafer não tinha
 * simplesmente não existia para o BI. Na Finatto isso escondeu 19 contas com
 * movimento — entre elas "Receita de Aluguel" (54.000), "Serviços Prestados"
 * (17.500) e "Perdas em Transações Comerciais" (−442.504) — e explicava,
 * sozinho, toda a divergência dos quatro cartões contra o Power BI.
 * Laudo completo: `docs/relatorios/bi-divergencia-matriz-2026-09-24.md`.
 *
 * ## Por que o nome vem do `nomeSci`
 *
 * Nunca do `nomeExibicao`: esse é campo livre, editado na tela de categorias.
 * A Finatto tem a conta 03.2.3 com `nomeSci = "OUTRAS RECEITAS"` (que está no
 * de-para) e `nomeExibicao = "RECEITAS FINANCEIRAS"`. Decidir contabilidade por
 * texto que o usuário edita é o defeito que este módulo já teve uma vez, no
 * sinal da matriz.
 *
 * ## Por que a resolução acontece em TypeScript
 *
 * A comparação de nomes (acento, caixa, espaço duplo) fica toda aqui, onde tem
 * teste. O SQL recebe o resultado pronto — uma lista de `conta de nível 3 →
 * categoria` — e só compara códigos.
 */

import type { CategoriaDre } from './mascara-dre'

/** As onze linhas da aba DRE que têm "Plano de Contas" preenchido. */
export const DEPARA_NIVEL3: ReadonlyArray<{ nomeNivel3: string; categoria: CategoriaDre }> = [
  { nomeNivel3: 'RECEITA BRUTA COM VENDAS E SERVIÇOS',      categoria: 'RECEITA_BRUTA' },
  { nomeNivel3: 'DEDUÇÕES DAS RECEITAS C/VENDAS E SERVIÇO', categoria: 'DEDUCOES_IMPOSTOS' },
  { nomeNivel3: 'CUSTOS DAS MERCADORIAS VENDIDAS',          categoria: 'CUSTO_DAS_VENDAS' },
  { nomeNivel3: 'DESPESAS OPERACIONAIS',                    categoria: 'DESPESAS_OPERACIONAIS' },
  { nomeNivel3: 'DESPESAS OPERACIONAIS TRIBUTÁRIAS',        categoria: 'DESPESAS_OPERACIONAIS' },
  { nomeNivel3: 'RECEITAS FINANCEIRAS',                     categoria: 'RECEITAS_FINANCEIRAS' },
  { nomeNivel3: 'RECEITAS OPERACIONAIS DIVERSAS',           categoria: 'RECEITAS_FINANCEIRAS' },
  { nomeNivel3: 'OUTRAS RECEITAS',                          categoria: 'RECEITAS_FINANCEIRAS' },
  { nomeNivel3: 'DESPESAS OPERACIONAIS FINANCEIRAS',        categoria: 'DESPESAS_FINANCEIRAS' },
  { nomeNivel3: 'PROVISÕES P/IMPOSTOS S/LUCRO',             categoria: 'IR_CS' },
  { nomeNivel3: 'DISTRIBUIÇÃO DE LUCROS',                   categoria: 'DISTRIBUICAO_LUCROS' },
]

/**
 * Caixa alta, sem acento, sem espaço sobrando.
 *
 * O SCI escreve o mesmo nome com variação de espaço entre um plano e outro, e
 * o acento depende do encoding com que o balancete foi lido. Comparar o texto
 * cru transformaria um detalhe de digitação em conta fora da DRE.
 */
export function normalizarNomeConta(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const PORNOME = new Map<string, CategoriaDre>(
  DEPARA_NIVEL3.map(d => [normalizarNomeConta(d.nomeNivel3), d.categoria]),
)

/** A categoria de um nome de nível 3, ou null se a máscara não fala dele. */
export function categoriaDeNomeNivel3(nome: string | null | undefined): CategoriaDre | null {
  if (!nome) return null
  return PORNOME.get(normalizarNomeConta(nome)) ?? null
}

/**
 * Os três primeiros segmentos de uma conta — "04.2.1.09.025" → "04.2.1".
 *
 * Conta mais curta que isso é sintética de nível 1 ou 2 (ATIVO, RECEITAS
 * OPERACIONAIS): não tem nível 3 e portanto não tem categoria.
 */
export function nivel3De(conta: string): string | null {
  const p = conta.split('.')
  if (p.length < 3) return null
  return `${p[0]}.${p[1]}.${p[2]}`
}

export type DeparaCliente = ReadonlyArray<{ conta3: string; categoria: CategoriaDre }>

/**
 * Resolve o de-para para o plano de contas DE UM CLIENTE: percorre as contas de
 * nível 3 dele e devolve as que a máscara reconhece.
 *
 * Costuma dar 8 a 12 linhas — é isto que vai para o SQL, que então só compara
 * código de conta.
 */
export function deparaDoPlano(
  contasNivel3: ReadonlyArray<{ conta: string; nomeSci: string | null }>,
): DeparaCliente {
  const out: Array<{ conta3: string; categoria: CategoriaDre }> = []
  for (const c of contasNivel3) {
    if (c.conta.split('.').length !== 3) continue
    const categoria = categoriaDeNomeNivel3(c.nomeSci)
    if (categoria) out.push({ conta3: c.conta, categoria })
  }
  return out
}

/**
 * O de-para do cliente como tabela SQL inline: `(VALUES ('03.1.1','RECEITA_BRUTA'), …)`.
 *
 * Os códigos vêm do banco (dado do cliente), então passam por um filtro estrito
 * de formato antes de virar literal. A categoria é do nosso enum.
 *
 * Com a lista vazia devolve uma linha impossível em vez de `VALUES ()`, que é
 * erro de sintaxe: a consulta continua válida e simplesmente não casa nada.
 */
export function sqlDeparaValues(depara: DeparaCliente): string {
  const linhas = depara
    .filter(d => /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(d.conta3))
    .map(d => `('${d.conta3}','${d.categoria}')`)
  if (linhas.length === 0) return `(VALUES ('\u0000','\u0000'))`
  return `(VALUES ${linhas.join(', ')})`
}

/**
 * Expressão SQL que extrai o nível 3 de uma coluna de conta.
 * Espelha o `nivel3De` acima — conta com menos de 3 segmentos devolve algo que
 * não casa com nenhum código (`split_part` de índice inexistente é '').
 */
export function sqlNivel3(colunaConta: string): string {
  return `(split_part(${colunaConta},'.',1) || '.' || split_part(${colunaConta},'.',2) || '.' || split_part(${colunaConta},'.',3))`
}
