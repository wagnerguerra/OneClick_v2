/**
 * Backfill: regenera o PDF de cada NotaServicoImportada usando o novo gerador
 * NT 008/2026 local, E preenche o campo `dadosExtras` (JSON) com todos os
 * campos extras extraídos do XML (endereço, contato, regime SN, NBS, etc.).
 *
 * Só toca em notas com `pdfOficial=false`. O XML salvo é a fonte da verdade.
 *
 * Rodar:  npx tsx scripts/backfill-nfse-pdf-nt008.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaClient, Prisma } from '../../../packages/db/src/generated/client'
import { parseNFSeXml, type ParsedNFSe } from '../src/nfse-dist/nfse.parser'
import { gerarPdfNFSe } from '../src/nfse-dist/nfse-pdf'

const STORAGE = path.resolve(__dirname, '..', 'uploads', 'danfe')
const prisma = new PrismaClient()

/** Extrai os campos extras do ParsedNFSe pra serialização JSON. */
function serializarDadosExtras(p: ParsedNFSe): Record<string, unknown> {
  return {
    localEmissaoNome: p.localEmissaoNome,
    localPrestacaoNome: p.localPrestacaoNome,
    localIncidenciaIbge: p.localIncidenciaIbge,
    localIncidenciaNome: p.localIncidenciaNome,
    descTributacaoNacional: p.descTributacaoNacional,
    ambienteGerador: p.ambienteGerador,
    tipoEmissao: p.tipoEmissao,
    cStat: p.cStat,
    dataProcessamento: p.dataProcessamento?.toISOString() ?? null,
    numeroDFSe: p.numeroDFSe,
    numeroDPS: p.numeroDPS,
    serieDPS: p.serieDPS,
    dataEmissaoDPS: p.dataEmissaoDPS?.toISOString() ?? null,
    prestador: p.prestador,
    tomador: p.tomador,
    intermediario: p.intermediario,
    baseCalculo: p.baseCalculo,
    totalTribFed: p.totalTribFed,
    totalTribEst: p.totalTribEst,
    totalTribMun: p.totalTribMun,
    codigoNBS: p.codigoNBS,
    codigoTributacaoMunicipal: p.codigoTributacaoMunicipal,
    tributacaoISSQN: p.tributacaoISSQN,
    retencaoISSQN: p.retencaoISSQN,
    tipoImunidadeISSQN: p.tipoImunidadeISSQN,
    pisCofinsCST: p.pisCofinsCST,
  }
}

async function main() {
  const notas = await prisma.notaServicoImportada.findMany({
    where: { pdfOficial: false },
    select: { id: true, numero: true, chave: true, xmlKey: true, pdfKey: true },
    orderBy: { dataEmissao: 'desc' },
  })
  console.log(`${notas.length} notas pra regerar.`)

  let ok = 0
  let erro = 0
  let pulado = 0

  for (let i = 0; i < notas.length; i++) {
    const n = notas[i]!
    const xmlPath = path.join(STORAGE, n.xmlKey)
    if (!fs.existsSync(xmlPath)) {
      pulado++
      continue
    }
    try {
      const xml = fs.readFileSync(xmlPath, 'utf8')
      const parsed = parseNFSeXml(xml)
      const pdfBuf = await gerarPdfNFSe(parsed)

      const pdfKey = n.pdfKey ?? `pdfs/nfse/${n.chave ?? n.id}.pdf`
      const pdfPath = path.join(STORAGE, pdfKey)
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true })
      fs.writeFileSync(pdfPath, pdfBuf)

      // Atualiza pdfKey (se faltava) + dadosExtras (sempre)
      await prisma.notaServicoImportada.update({
        where: { id: n.id },
        data: {
          ...(n.pdfKey ? {} : { pdfKey }),
          dadosExtras: serializarDadosExtras(parsed) as Prisma.InputJsonValue,
          // Atualiza alguns campos canônicos que o parser antigo pode ter perdido
          tomadorCnpjCpf: parsed.tomadorCnpjCpf,
          tomadorRazao: parsed.tomadorRazao,
          valorServicos: parsed.valorServicos.toString(),
          valorLiquido: parsed.valorLiquido?.toString() ?? null,
          valorIss: parsed.valorIss?.toString() ?? null,
          aliquotaIss: parsed.aliquotaIss?.toString() ?? null,
        },
      })
      ok++
      if (ok % 20 === 0) console.log(`Progresso: ${ok}/${notas.length}`)
    } catch (e) {
      erro++
      console.error(`Erro nota ${n.numero}: ${(e as Error).message}`)
    }
  }

  console.log('\n─── Resultado ──────────────────────')
  console.log(`Regeradas:   ${ok}`)
  console.log(`Puladas:     ${pulado} (XML não encontrado)`)
  console.log(`Erros:       ${erro}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
