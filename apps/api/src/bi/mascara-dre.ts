/**
 * A máscara da DRE — estrutura do demonstrativo, em forma de dado.
 *
 * Vem de `docs/balancetes/Máscara.xlsx`, a planilha que alimenta a tabela
 * `dMáscara` do Power BI do escritório. São 16 linhas em ordem: 9 de DADOS
 * (que agregam contas do balancete) e 7 de SUBTOTAL.
 *
 * ## Por que isto substitui o motor de fórmulas
 *
 * Um subtotal não precisa de fórmula própria. Ele é a **soma acumulada de
 * todas as linhas de dados até o índice dele**. Receita Líquida é tudo até o
 * índice 3; Margem Bruta é tudo até o 5; EBITDA é tudo até o 9. É literalmente
 * a medida `Realizado Subtotais` do Power BI:
 *
 *     VAR varOrdemContexto = MAX('dMáscara'[Índice])
 *     RETURN CALCULATE([Realizado Base],
 *            FILTER(ALL('dMáscara'), 'dMáscara'[Índice] <= varOrdemContexto))
 *
 * Funciona porque os valores chegam com o **sinal natural** de
 * `créditos − débitos`: receita é credora (positiva), despesa é devedora
 * (negativa). Acumular basta — não há subtração a escrever, e portanto não há
 * `Math.abs` para inverter estorno.
 *
 * O `Sinal` que existe na planilha (e nas nossas tabelas) é vestigial: no
 * modelo do Power BI ele só aparece na medida `Realizado Corrigido`, que não é
 * usada em nenhum visual. O sinal do dado já faz o trabalho.
 */

/** As 9 categorias que agregam contas. Espelham `cliente_bi_categorias.categoria_dre`. */
export type CategoriaDre =
  | 'RECEITA_BRUTA'
  | 'DEDUCOES_IMPOSTOS'
  | 'CUSTO_DAS_VENDAS'
  | 'DESPESAS_VARIAVEIS'
  | 'DESPESAS_OPERACIONAIS'
  | 'RECEITAS_FINANCEIRAS'
  | 'DESPESAS_FINANCEIRAS'
  | 'IR_CS'
  | 'DISTRIBUICAO_LUCROS'

export type LinhaMascara = {
  /** Ordem no demonstrativo. É a chave da acumulação. */
  indice: number
  /** Rótulo, como está na planilha. */
  rotulo: string
  /** 0 = linha de dados (agrega contas) · 1 = subtotal acumulado. */
  subnivel: 0 | 1
  /** Só em linha de dados. Subtotal não tem categoria própria. */
  categoria: CategoriaDre | null
}

/**
 * A ordem é a da planilha, e ela É a semântica: mudar a posição de uma linha
 * muda o que cada subtotal acumula.
 */
export const MASCARA_DRE: readonly LinhaMascara[] = [
  { indice: 1,  rotulo: 'RECEITA BRUTA',                            subnivel: 0, categoria: 'RECEITA_BRUTA' },
  { indice: 2,  rotulo: 'DEDUÇÕES E IMPOSTOS',                      subnivel: 0, categoria: 'DEDUCOES_IMPOSTOS' },
  { indice: 3,  rotulo: 'RECEITA LÍQUIDA',                          subnivel: 1, categoria: null },
  { indice: 4,  rotulo: 'CUSTO DAS VENDAS',                         subnivel: 0, categoria: 'CUSTO_DAS_VENDAS' },
  { indice: 5,  rotulo: 'MARGEM BRUTA',                             subnivel: 1, categoria: null },
  { indice: 6,  rotulo: 'DESPESAS VARIÁVEIS',                       subnivel: 0, categoria: 'DESPESAS_VARIAVEIS' },
  { indice: 7,  rotulo: 'MARGEM DE CONTRIBUIÇÃO',                   subnivel: 1, categoria: null },
  { indice: 8,  rotulo: 'DESPESAS OPERACIONAIS',                    subnivel: 0, categoria: 'DESPESAS_OPERACIONAIS' },
  { indice: 9,  rotulo: 'EBITDA',                                   subnivel: 1, categoria: null },
  { indice: 10, rotulo: 'RECEITAS FINANCEIRAS',                     subnivel: 0, categoria: 'RECEITAS_FINANCEIRAS' },
  { indice: 11, rotulo: 'DESPESAS FINANCEIRAS',                     subnivel: 0, categoria: 'DESPESAS_FINANCEIRAS' },
  { indice: 12, rotulo: 'RESULTADO OPERACIONAL',                    subnivel: 1, categoria: null },
  { indice: 13, rotulo: 'IR / CS',                                  subnivel: 0, categoria: 'IR_CS' },
  { indice: 14, rotulo: 'RESULTADO LÍQUIDO ANTES DE PARTICIPAÇÕES', subnivel: 1, categoria: null },
  { indice: 15, rotulo: 'DISTRIBUIÇÃO DE LUCROS',                   subnivel: 0, categoria: 'DISTRIBUICAO_LUCROS' },
  { indice: 16, rotulo: 'RESULTADO LÍQUIDO',                        subnivel: 1, categoria: null },
]

/** Atalhos para os subtotais que a tela consome pelo nome. */
export const INDICE = {
  RECEITA_LIQUIDA: 3,
  MARGEM_BRUTA: 5,
  MARGEM_CONTRIBUICAO: 7,
  EBITDA: 9,
  RESULTADO_OPERACIONAL: 12,
  RESULTADO_ANTES_PARTICIPACOES: 14,
  RESULTADO_LIQUIDO: 16,
} as const

export type SomasPorCategoria = Partial<Record<CategoriaDre, number>>

/**
 * Resolve o demonstrativo inteiro a partir das somas ALGÉBRICAS por categoria.
 *
 * "Algébricas" é a palavra que importa: os valores têm que chegar com o sinal
 * natural de `créditos − débitos`, sem `Math.abs`. Passar despesa positiva faz
 * o acumulado somar onde deveria subtrair.
 *
 * Devolve valor por índice — linhas de dados com o próprio valor, subtotais com
 * o acumulado até ali.
 */
export function calcularDre(somas: SomasPorCategoria): Map<number, number> {
  const out = new Map<number, number>()
  let acumulado = 0
  for (const linha of MASCARA_DRE) {
    if (linha.subnivel === 0) {
      const v = (linha.categoria && somas[linha.categoria]) || 0
      acumulado += v
      out.set(linha.indice, v)
    } else {
      out.set(linha.indice, arredondar(acumulado))
    }
  }
  return out
}

/** Duas casas — é dinheiro, e a acumulação de floats acumula resto. */
function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}
