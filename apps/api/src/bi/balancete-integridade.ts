/**
 * Conferência de integridade do balancete — a DECISÃO, separada do I/O.
 *
 * O balancete do SCI carrega uma invariante contábil: a soma dos débitos é
 * igual à soma dos créditos. É o "Total de débitos / Total de créditos /
 * Diferença: 0,00" do bloco RESUMO do relatório impresso. Até agora nada no
 * sistema conferia isso — nem na importação, nem depois.
 *
 * Mora fora do service porque é aritmética pura: dá para prender em teste sem
 * banco, sem Firebird e sem Nest. O módulo `bi` não tinha um único `.spec.ts`,
 * e isto aqui é a primeira trava.
 */

export type LinhaBalancete = {
  conta: string
  debitos: number
  creditos: number
}

/**
 * Uma conta é FOLHA quando nenhuma outra conta do mesmo balancete desce dela.
 *
 * Importa para qualquer soma: cada nível sintético repete o valor das filhas
 * (`04` contém `04.1`, que contém `04.1.1`…), então somar todos os níveis
 * contaria a mesma coisa várias vezes. O Power BI resolve o mesmo problema
 * mantendo só folhas na dimensão de contas.
 *
 * O `'.'` no prefixo é essencial: sem ele `04.1` seria "pai" de `04.10`.
 */
export function folhasDe<T extends { conta: string }>(linhas: T[]): T[] {
  const contas = linhas.map(l => l.conta)
  return linhas.filter(l => !contas.some(c => c !== l.conta && c.startsWith(l.conta + '.')))
}

export type ResultadoConferencia = {
  fecha: boolean
  somaDebitos: number
  somaCreditos: number
  diferenca: number
}

/**
 * Confere se o balancete fecha (Σ débitos = Σ créditos), somando só as folhas.
 *
 * Tolerância de um centavo: os valores vêm com duas casas e a soma de muitas
 * linhas acumula erro de ponto flutuante. Diferença real de arredondamento
 * contábil não passa de centavos; o que este teste pega é balancete torto.
 */
export function conferirBalanceteFecha(linhas: LinhaBalancete[]): ResultadoConferencia {
  let somaDebitos = 0
  let somaCreditos = 0
  for (const l of folhasDe(linhas)) {
    somaDebitos += l.debitos
    somaCreditos += l.creditos
  }
  somaDebitos = Math.round(somaDebitos * 100) / 100
  somaCreditos = Math.round(somaCreditos * 100) / 100
  const diferenca = Math.round((somaDebitos - somaCreditos) * 100) / 100
  return { fecha: Math.abs(diferenca) <= 0.01, somaDebitos, somaCreditos, diferenca }
}
