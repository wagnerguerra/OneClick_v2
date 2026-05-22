/** Simula auditoria end-to-end com a lógica do service. */
import { prisma } from '../src/client'

const PATTERNS: Record<string, string[][]> = {
  'DAS — Simples Nacional':            [['das', 'mensal'], ['extrato', 'pgdas']],
  'DCTFWeb':                           [['dctfweb'], ['dctf', 'web']],
  'ECD':                               [['sped', 'ecd'], ['escrituracao', 'contabil', 'digital']],
  'EFD ICMS/IPI':                      [['efd', 'icms'], ['sped', 'fiscal']],
  'EFD-Contribuições':                 [['efd', 'contribuic']],
  'EFD-Reinf':                         [['reinf']],
  'FGTS Digital':                      [['fgts', 'digital'], ['fgts', 'guia']],
  'ICMS — Apuração Mensal':            [['registro', 'apuracao', 'icms'], ['dua', 'icms']],
  'INSS':                              [['darf', 'inss']],
  'IRPJ/CSLL — Lucro Presumido':       [['darf', 'irpj'], ['darf', 'csll'], ['irpj', 'presumido']],
  'IRPJ/CSLL — Lucro Real':            [['darf', 'irpj'], ['darf', 'csll'], ['irpj', 'real']],
  'IRRF':                              [['darf', 'irrf'], ['bases', 'irrf']],
  'ISSQN':                             [['issqn'], ['servico', 'prestado'], ['servicos', 'tomado']],
  'Balanço Patrimonial Anual':         [['balanco', 'patrimonial'], ['livro', 'razao']],
  'PIS/COFINS':                        [['darf', 'pis'], ['darf', 'cofins']],
  'Pagamento de Salários':             [['folha', 'pagamento'], ['recibo', 'pagamento', 'salario']],
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function matchByPatterns(nomeObr: string, nomeAce: string): boolean {
  const n = norm(nomeAce)
  let p: string[][] | null = null
  for (const [k, alts] of Object.entries(PATTERNS)) {
    if (nomeObr.startsWith(k)) { p = alts; break }
  }
  if (!p) return false
  return p.some((alt) => alt.every((t) => n.includes(t)))
}

function dataTeorica(comp: Date, r: { frequencia: string; ancoragem: string; valorAncoragem: number; competenciaOffset: number }): Date | null {
  if (r.frequencia === 'DIARIA' || r.frequencia === 'SEMANAL') return null
  const compAno = comp.getUTCFullYear()
  const compMes = comp.getUTCMonth()
  const vencMes = compMes + r.competenciaOffset
  const ano = compAno + Math.floor(vencMes / 12)
  const mes = ((vencMes % 12) + 12) % 12
  switch (r.ancoragem) {
    case 'DIA_UTIL': {
      let d = 1, c = 0
      while (true) {
        const t = new Date(ano, mes, d, 9, 0, 0, 0)
        const dia = t.getDay()
        if (dia !== 0 && dia !== 6) c++
        if (c === r.valorAncoragem) return t
        d++; if (d > 31) break
      }
      return new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
    }
    case 'DIAS_APOS_COMPETENCIA': {
      const fim = new Date(compAno, compMes + 1, 0)
      return new Date(fim.getTime() + r.valorAncoragem * 86400000)
    }
    default:
      return new Date(ano, mes, Math.min(r.valorAncoragem, 28), 9, 0, 0, 0)
  }
}

async function main() {
  const obrigacoes = await prisma.servico.findMany({
    where: { ehObrigacaoAcessoria: true, ativo: true },
    include: { recorrencia: true },
  })
  const execs = await prisma.servicoExecucao.findMany({
    where: { acessoriasPrazo: { not: null }, acessoriasComp: { not: null }, acessoriasNome: { not: null } },
    select: { acessoriasNome: true, acessoriasPrazo: true, acessoriasComp: true },
  })

  // Feriados nacionais (set MM-DD por simplicidade)
  const FERIADOS_FIXOS = new Set(['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'])
  function ehNaoUtil(d: Date): boolean {
    const dia = d.getDay()
    if (dia === 0 || dia === 6) return true
    const k = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return FERIADOS_FIXOS.has(k)
  }

  console.log('\n========== SIMULAÇÃO AUDITORIA ==========\n')
  console.log('Obr.'.padEnd(50), 'Amostr.'.padStart(7), 'Releva'.padStart(7), 'Anteci'.padStart(7), 'Poster'.padStart(7), 'Manti'.padStart(7), 'Sugest.')
  for (const o of obrigacoes) {
    const r = o.recorrencia
    if (!r) { console.log(`${o.nome.slice(0,48).padEnd(50)}  sem recorrencia`); continue }
    const matched = execs.filter((e) => e.acessoriasNome && matchByPatterns(o.nome, e.acessoriasNome))
    let amostras = matched.length
    let releva = 0, anteci = 0, poster = 0, manti = 0
    const exemplos: string[] = []
    for (const e of matched) {
      if (!e.acessoriasComp || !e.acessoriasPrazo) continue
      const teo = dataTeorica(new Date(e.acessoriasComp), {
        frequencia: r.frequencia,
        ancoragem: r.ancoragem,
        valorAncoragem: r.valorAncoragem,
        competenciaOffset: r.competenciaOffset,
      })
      if (!teo) continue
      if (!ehNaoUtil(teo)) continue
      releva++
      const off = e.acessoriasPrazo
      const delta = Math.round((Date.UTC(off.getFullYear(), off.getMonth(), off.getDate()) - Date.UTC(teo.getFullYear(), teo.getMonth(), teo.getDate())) / 86400000)
      if (delta > 0) poster++
      else if (delta < 0) anteci++
      else manti++
      if (exemplos.length < 3) {
        exemplos.push(`comp=${e.acessoriasComp.toISOString().slice(0,10)} teo=${teo.toISOString().slice(0,10)} off=${off.toISOString().slice(0,10)} delta=${delta}d`)
      }
    }
    const top = Math.max(anteci, poster, manti)
    let sug = 'SEM_DADOS'
    if (releva > 0) {
      const ratio = top / releva
      if (ratio < 0.6) sug = 'INCONCL'
      else if (top === poster) sug = `POSTERG (${Math.round(ratio*100)}%)`
      else if (top === anteci) sug = `ANTECIP (${Math.round(ratio*100)}%)`
      else sug = `MANTER (${Math.round(ratio*100)}%)`
    } else if (amostras > 0) sug = 'MANTER (100%)'

    console.log(
      o.nome.slice(0,48).padEnd(50),
      String(amostras).padStart(7),
      String(releva).padStart(7),
      String(anteci).padStart(7),
      String(poster).padStart(7),
      String(manti).padStart(7),
      sug,
    )
    if (releva > 0 && exemplos.length > 0) {
      for (const ex of exemplos) console.log(`    ${ex}`)
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
