/**
 * Backfill de NotaServicoImportada: extrai tomadorCnpjCpf e valorServicos
 * do XML original (storage local) e atualiza as linhas que ficaram incompletas
 * pelo parser antigo (que não navegava dentro de DPS/infDPS).
 *
 * Rodar UMA vez após corrigir o parser:
 *   node packages/db/scripts/backfill-nfse-tomador-valor.cjs
 *
 * Idempotente: só atualiza linhas onde tomadorCnpjCpf==null OU valorServicos==0.
 */

const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('../src/generated/client')

// Storage de XMLs (mesmo path do DanfeStorage)
const STORAGE_BASE = path.resolve(__dirname, '../../../apps/api/uploads/danfe')

const prisma = new PrismaClient()

/** Extrai conteúdo entre <tag>...</tag> (1ª ocorrência, qualquer prefixo de ns). */
function tagText(xml, tag) {
  const re = new RegExp(`<(?:[a-zA-Z0-9-]+:)?${tag}>([\\s\\S]*?)</(?:[a-zA-Z0-9-]+:)?${tag}>`)
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

/** Extrai conteúdo de tag dentro de um pai (ex: tomador). */
function tagTextInside(xml, parentTag, innerTag) {
  const reParent = new RegExp(`<(?:[a-zA-Z0-9-]+:)?${parentTag}>([\\s\\S]*?)</(?:[a-zA-Z0-9-]+:)?${parentTag}>`)
  const pm = xml.match(reParent)
  if (!pm) return null
  return tagText(pm[1], innerTag)
}

function toNumber(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

;(async () => {
  const notas = await prisma.notaServicoImportada.findMany({
    where: {
      OR: [
        { tomadorCnpjCpf: null },
        { valorServicos: 0 },
      ],
    },
    select: { id: true, numero: true, xmlKey: true, tomadorCnpjCpf: true, valorServicos: true, padrao: true },
  })
  console.log(`Encontradas ${notas.length} notas pra backfill.`)
  if (notas.length === 0) { process.exit(0) }

  let atualizadas = 0
  let pulados = 0
  let erros = 0

  for (const n of notas) {
    const xmlPath = path.join(STORAGE_BASE, n.xmlKey)
    if (!fs.existsSync(xmlPath)) {
      pulados++
      continue
    }
    try {
      const xml = fs.readFileSync(xmlPath, 'utf8')

      // Tomador: <toma><CNPJ>X</CNPJ> ou <toma><CPF>X</CPF> ou <toma><xNome>...</xNome>
      let tomadorCnpj = tagTextInside(xml, 'toma', 'CNPJ')
        || tagTextInside(xml, 'toma', 'CPF')
        || tagTextInside(xml, 'TomadorServico', 'Cnpj')
        || tagTextInside(xml, 'TomadorServico', 'Cpf')
      if (tomadorCnpj) tomadorCnpj = tomadorCnpj.replace(/\D/g, '')

      let tomadorRazao = tagTextInside(xml, 'toma', 'xNome')
        || tagTextInside(xml, 'TomadorServico', 'RazaoSocial')

      // Valor dos serviços: <vServPrest><vServ>X</vServ> ou <ValorServicos>
      const vServ = tagTextInside(xml, 'vServPrest', 'vServ')
        || tagText(xml, 'ValorServicos')
      const valorServicos = toNumber(vServ)

      // Valor líquido (já tava no parser, mas garantia)
      const vLiq = tagText(xml, 'vLiq') || tagText(xml, 'ValorLiquidoNfse')
      const valorLiquido = toNumber(vLiq)

      // Atualiza só campos que faltam
      const data = {}
      if (!n.tomadorCnpjCpf && tomadorCnpj) data.tomadorCnpjCpf = tomadorCnpj
      if (tomadorRazao && !data.tomadorRazao) data.tomadorRazao = tomadorRazao
      if (Number(n.valorServicos) === 0 && valorServicos != null && valorServicos > 0) {
        data.valorServicos = valorServicos
      }
      if (valorLiquido != null && valorLiquido > 0) {
        data.valorLiquido = valorLiquido
      }

      if (Object.keys(data).length === 0) {
        pulados++
        continue
      }

      await prisma.notaServicoImportada.update({ where: { id: n.id }, data })
      atualizadas++
      if (atualizadas % 20 === 0) {
        console.log(`Progresso: ${atualizadas}/${notas.length}`)
      }
    } catch (e) {
      erros++
      console.error(`Erro nota ${n.numero}: ${e.message}`)
    }
  }

  console.log('\n─── Resultado ──────────────────────')
  console.log(`Atualizadas: ${atualizadas}`)
  console.log(`Puladas (sem XML / nada a mudar): ${pulados}`)
  console.log(`Erros: ${erros}`)
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
