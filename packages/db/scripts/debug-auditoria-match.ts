import { prisma } from '../src/client'

const ACESSORIAS_PATTERNS: Record<string, string[][]> = {
  'DAS — Simples Nacional':            [['das', 'mensal'], ['extrato', 'pgdas']],
  'DASN-SIMEI':                        [['dasn'], ['simei']],
  'DEFIS':                             [['defis']],
  'DCTFWeb':                           [['dctfweb'], ['dctf', 'web']],
  'EFD-Contribuições':                 [['efd', 'contribuic']],
  'EFD-Reinf':                         [['reinf']],
  'PIS/COFINS':                        [['darf', 'pis'], ['darf', 'cofins']],
  'IRPJ/CSLL — Lucro Presumido':       [['darf', 'irpj'], ['darf', 'csll'], ['irpj', 'presumido']],
  'IRPJ/CSLL — Lucro Real':            [['darf', 'irpj'], ['darf', 'csll'], ['irpj', 'real']],
  'ECD':                               [['sped', 'ecd'], ['escrituracao', 'contabil', 'digital']],
  'ECF':                               [['sped', 'ecf'], ['escrituracao', 'contabil', 'fiscal']],
  'EFD ICMS/IPI':                      [['efd', 'icms'], ['sped', 'fiscal']],
  'IRPF':                              [['irpf']],
  'DIMOB':                             [['dimob']],
  'DITR':                              [['ditr']],
  'Informe de Rendimentos':            [['informe', 'rendiment']],
  'eSocial':                           [['esocial'], ['e-social']],
  'FGTS Digital':                      [['fgts', 'digital'], ['fgts', 'guia']],
  'INSS':                              [['darf', 'inss']],
  'IRRF':                              [['darf', 'irrf'], ['bases', 'irrf']],
  'Pagamento de Salários':             [['folha', 'pagamento'], ['recibo', 'pagamento', 'salario']],
  '13º Salário — 1ª Parcela':          [['13', 'primeira'], ['13', '1', 'parcela']],
  '13º Salário — 2ª Parcela':          [['13', 'segunda'], ['13', '2', 'parcela']],
  'ICMS — Apuração Mensal':            [['registro', 'apuracao', 'icms'], ['dua', 'icms']],
  'DeSTDA':                            [['destda']],
  'ISSQN':                             [['issqn'], ['iss']],
  'Balancete':                         [['balancete']],
  'Balanço Patrimonial Anual':         [['balanco', 'patrimonial'], ['livro', 'razao']],
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function matchByPatterns(nomeObr: string, nomeAce: string): boolean {
  const nomeAceN = norm(nomeAce)
  let patterns: string[][] | null = null
  for (const [key, alts] of Object.entries(ACESSORIAS_PATTERNS)) {
    if (nomeObr.startsWith(key)) { patterns = alts; break }
  }
  if (!patterns) return false
  return patterns.some((alt) => alt.every((tok) => nomeAceN.includes(tok)))
}

async function main() {
  const obrigacoes = await prisma.servico.findMany({
    where: { ehObrigacaoAcessoria: true, ativo: true },
    select: { nome: true },
    orderBy: { nome: 'asc' },
  })
  const execucoes = await prisma.servicoExecucao.findMany({
    where: { acessoriasPrazo: { not: null }, acessoriasNome: { not: null } },
    select: { acessoriasNome: true },
  })
  console.log(`\nTotal exec com nome do Acessórias: ${execucoes.length}\n`)
  console.log(`MATCHES por obrigação:\n`)
  for (const o of obrigacoes) {
    const count = execucoes.filter((e) => e.acessoriasNome && matchByPatterns(o.nome, e.acessoriasNome)).length
    const mark = count > 0 ? '✓' : ' '
    console.log(`  ${mark} ${String(count).padStart(4)}× ${o.nome}`)
  }
  // Quais nomes do Acessórias NÃO foram matcheados?
  const todos = new Set(execucoes.map((e) => e.acessoriasNome!))
  const matchados = new Set<string>()
  for (const o of obrigacoes) {
    for (const n of todos) {
      if (matchByPatterns(o.nome, n)) matchados.add(n)
    }
  }
  const naoMatchados = [...todos].filter((n) => !matchados.has(n))
  console.log(`\nNomes do Acessórias NÃO matcheados (${naoMatchados.length}):`)
  for (const n of naoMatchados.slice(0, 20)) console.log(`  - ${n}`)
  if (naoMatchados.length > 20) console.log(`  ... e mais ${naoMatchados.length - 20}`)
}
main().catch(console.error).finally(() => prisma.$disconnect())
