/**
 * Diagnóstico Acessórias — produz 4 CSVs pra entender como o sistema agrupa
 * obrigações por cliente. Não escreve no banco.
 *
 * Saída em ./tmp/diagnostico-acessorias/:
 *   - 1-obrigacoes-distintas.csv  → nome único × ocorrências
 *   - 2-por-cliente.csv           → CNPJ, razão, tributação, CNAE, atividade, lista
 *   - 3-por-tributacao.csv        → tributação × obrigação × total
 *   - 4-por-cnae.csv              → CNAE primário × obrigação × total
 *
 * Resumo no console aponta padrão dominante (tributação, CNAE ou nenhum).
 *
 * Execução:
 *   cd packages/db
 *   pnpm exec tsx scripts/diagnostico-acessorias.ts
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import { config as loadEnv } from 'dotenv'
import { prisma } from '../src/client'

// Token do Acessórias vive em apps/api/.env (junto com SMTP, S3, etc.).
// Não no .env do packages/db (que tem só DATABASE_URL).
loadEnv({ path: path.resolve(process.cwd(), '../../apps/api/.env') })
loadEnv() // fallback pro .env local, caso o anterior não exista

// ────────────────────────────────────────────────────────────────────
// Helpers HTTP — replica AcessoriasService.request sem o Nest DI.
// ────────────────────────────────────────────────────────────────────
async function acessoriasFetch<T = unknown>(pathPart: string): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const raw = process.env.ACESSORIAS_API_URL?.trim() || 'https://api.acessorias.com'
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const baseUrl = withProto.replace(/\/$/, '')
  const token = process.env.ACESSORIAS_API_TOKEN?.trim()
  if (!token) return { ok: false, status: 0, error: 'ACESSORIAS_API_TOKEN ausente no .env' }
  try {
    const res = await fetch(`${baseUrl}${pathPart}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const text = await res.text()
    let data: unknown
    try { data = text ? JSON.parse(text) : undefined } catch { data = text }
    if (!res.ok) return { ok: false, status: res.status, error: typeof data === 'string' ? data : `HTTP ${res.status}` }
    return { ok: true, status: res.status, data: data as T }
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message }
  }
}

/** Normaliza CNPJ pra 14 dígitos. */
function normCnpj(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

/** Escapa célula CSV (envolve em aspas se contém vírgula/aspas/quebra). */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Escreve CSV (BOM UTF-8 pra abrir no Excel sem bagunçar acentos). */
async function escreverCsv(arquivo: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const linhas = [header.map(csvCell).join(';')]
  for (const r of rows) linhas.push(r.map(csvCell).join(';'))
  await fs.writeFile(arquivo, '﻿' + linhas.join('\n'), 'utf8')
}

// ────────────────────────────────────────────────────────────────────
// Coleta — itera /companies/ListAll?obligations
// ────────────────────────────────────────────────────────────────────
type Empresa = {
  cnpj: string
  razao: string
  obrigacoes: string[]
}

async function coletarEmpresas(): Promise<Empresa[]> {
  console.log('Coletando empresas + obrigações via /companies/ListAll?obligations...')
  const todas: Empresa[] = []
  let pagina = 1
  while (true) {
    const res = await acessoriasFetch<Array<Record<string, unknown>>>(`/companies/ListAll?obligations&Pagina=${pagina}`)
    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) break
    // Dump do shape da 1ª empresa pra debug (só na primeira página)
    if (pagina === 1 && res.data.length > 0) {
      const sample = res.data[0]
      console.log('\n  [DEBUG] keys da 1ª empresa:', Object.keys(sample!))
    }
    for (const co of res.data) {
      // Campo correto no JSON do Acessórias é "Identificador" (CNPJ formatado)
      const cnpj = normCnpj(String(co.Identificador ?? co.CNPJ ?? co.cnpj ?? ''))
      if (!cnpj) continue
      const razao = String(co.RazaoSocial ?? co.Razao ?? co.razao ?? co.Nome ?? '').trim()
      const obs = (co.Obrigacoes ?? []) as Array<Record<string, unknown>>
      const nomes = obs.map((o) => String(o.Nome ?? '').trim()).filter((n) => n.length > 0)
      todas.push({ cnpj, razao, obrigacoes: nomes })
    }
    process.stdout.write(`  página ${pagina} (${res.data.length} empresas)\r`)
    pagina++
    await new Promise(r => setTimeout(r, 200))
    if (pagina > 200) break
  }
  console.log(`\n  ${todas.length} empresas coletadas.`)
  return todas
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────
async function main() {
  const outDir = path.resolve(process.cwd(), 'tmp/diagnostico-acessorias')
  await fs.mkdir(outDir, { recursive: true })

  const empresas = await coletarEmpresas()
  if (empresas.length === 0) {
    console.error('Nenhuma empresa retornada. Verifique ACESSORIAS_API_TOKEN.')
    return
  }

  // Carrega TODOS os clientes (cnpj pode estar com máscara no banco — normaliza
  // em memória pra match robusto). Indexa por CNPJ normalizado.
  console.log('\nCruzando com Clientes OneClick...')
  const clientesAll = await prisma.cliente.findMany({
    select: { documento: true, razaoSocial: true, tributacao: true, cnaePrincipal: true, situacao: true, status: true, cnpjAcessorias: true },
  })
  const clientesMap = new Map<string, typeof clientesAll[number]>()
  for (const c of clientesAll) {
    const k = normCnpj(c.cnpjAcessorias ?? c.documento)
    if (k.length === 14) clientesMap.set(k, c)
  }
  const matched = empresas.filter((e) => clientesMap.has(e.cnpj)).length
  console.log(`  ${matched} de ${empresas.length} empresas com Cliente OneClick correspondente.`)
  console.log(`  ${clientesAll.length} clientes no banco no total (incluindo sem CNPJ válido).`)

  // ── 1. Obrigações distintas ──
  const contagem = new Map<string, number>()
  for (const e of empresas) {
    for (const nome of new Set(e.obrigacoes)) {
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1)
    }
  }
  const obrigacoesDistintas = [...contagem.entries()]
    .map(([nome, n]) => [nome, n] as [string, number])
    .sort((a, b) => b[1] - a[1])

  await escreverCsv(
    path.join(outDir, '1-obrigacoes-distintas.csv'),
    ['Obrigação', 'Nº empresas'],
    obrigacoesDistintas,
  )

  // ── 2. Por cliente ──
  const linhasCli: Array<Array<string | number | null>> = empresas.map((e) => {
    const c = clientesMap.get(e.cnpj)
    return [
      e.cnpj,
      e.razao || c?.razaoSocial || '',
      c?.tributacao ?? '(sem cliente OC)',
      c?.cnaePrincipal ?? '',
      c?.situacao ?? '',
      c?.status ?? '',
      e.obrigacoes.length,
      e.obrigacoes.join(' | '),
    ]
  })
  await escreverCsv(
    path.join(outDir, '2-por-cliente.csv'),
    ['CNPJ', 'Razão Social', 'Tributação', 'CNAE Principal', 'Situação', 'Status', 'Nº Obrigações', 'Lista de Obrigações'],
    linhasCli,
  )

  // ── 3. Por tributação ──
  // Diferencia 3 buckets: sem cliente OC | cliente sem tributação | tributação cadastrada
  const porTrib = new Map<string, Map<string, number>>()
  for (const e of empresas) {
    const c = clientesMap.get(e.cnpj)
    const trib = !c ? '(sem cliente OC)' : (c.tributacao ?? '(tributação não preenchida)')
    if (!porTrib.has(trib)) porTrib.set(trib, new Map())
    const inner = porTrib.get(trib)!
    for (const nome of new Set(e.obrigacoes)) inner.set(nome, (inner.get(nome) ?? 0) + 1)
  }
  const linhasTrib: Array<Array<string | number>> = []
  for (const [trib, inner] of porTrib) {
    const sortedInner = [...inner.entries()].sort((a, b) => b[1] - a[1])
    for (const [nome, n] of sortedInner) linhasTrib.push([trib, nome, n])
  }
  await escreverCsv(
    path.join(outDir, '3-por-tributacao.csv'),
    ['Tributação', 'Obrigação', 'Nº empresas'],
    linhasTrib,
  )

  // ── 4. Por CNAE primário ──
  const porCnae = new Map<string, Map<string, number>>()
  for (const e of empresas) {
    const c = clientesMap.get(e.cnpj)
    const cnae = (c?.cnaePrincipal ?? '').slice(0, 4) || '(sem CNAE)' // agrupa pelos 4 primeiros dígitos (divisão CNAE)
    if (!porCnae.has(cnae)) porCnae.set(cnae, new Map())
    const inner = porCnae.get(cnae)!
    for (const nome of new Set(e.obrigacoes)) inner.set(nome, (inner.get(nome) ?? 0) + 1)
  }
  const linhasCnae: Array<Array<string | number>> = []
  for (const [cnae, inner] of porCnae) {
    const sortedInner = [...inner.entries()].sort((a, b) => b[1] - a[1])
    for (const [nome, n] of sortedInner) linhasCnae.push([cnae, nome, n])
  }
  await escreverCsv(
    path.join(outDir, '4-por-cnae.csv'),
    ['CNAE (divisão)', 'Obrigação', 'Nº empresas'],
    linhasCnae,
  )

  // ── Resumo no console ──
  console.log('\n══════════════════════════════════════════════════════════════════')
  console.log('RESUMO')
  console.log('══════════════════════════════════════════════════════════════════\n')
  console.log(`Empresas Acessórias:                     ${empresas.length}`)
  console.log(`  com Cliente OneClick correspondente:   ${matched}`)
  console.log(`  sem cliente OC (não cadastrados):      ${empresas.length - matched}`)
  console.log(`Obrigações distintas (catálogo):         ${obrigacoesDistintas.length}`)

  // Quantas obrigações em comum dentro de cada tributação?
  console.log('\n── Por tributação (top obrigações dominantes) ──')
  for (const [trib, inner] of porTrib) {
    const empresasTrib = empresas.filter((e) => (clientesMap.get(e.cnpj)?.tributacao ?? '(sem cliente OC)') === trib).length
    if (empresasTrib === 0) continue
    const top = [...inner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const universais = [...inner.entries()].filter(([, n]) => n === empresasTrib).length
    console.log(`\n  ${trib}: ${empresasTrib} empresas`)
    console.log(`    Obrigações universais (presentes em 100% dos clientes): ${universais}`)
    console.log(`    Top 5:`)
    for (const [n, c] of top) {
      const pct = Math.round((c / empresasTrib) * 100)
      console.log(`      ${String(pct).padStart(3)}%  ${c}/${empresasTrib}  ${n}`)
    }
  }

  // CNAE vazio em 100% dos clientes hoje — pular análise.
  const totalComCnae = clientesAll.filter((c) => c.cnaePrincipal).length
  if (totalComCnae === 0) {
    console.log('\n── Por CNAE ──')
    console.log('  Nenhum cliente tem cnaePrincipal preenchido — análise pulada.')
    console.log('  Importar CNAE via BrasilAPI antes de re-rodar pra essa dimensão.')
  }

  // ── 5. Clusters de obrigações idênticas ──
  // Revela "templates implícitos": grupos de empresas com EXATAMENTE a mesma
  // lista de obrigações. Se houver clusters grandes, esses são candidatos
  // naturais a virar Grupos de Obrigação no OneClick.
  console.log('\n── Clusters: empresas com lista IDÊNTICA de obrigações ──')
  const clusters = new Map<string, { tributacoes: Map<string, number>; total: number; obrigacoes: string[] }>()
  for (const e of empresas) {
    const ordenadas = [...new Set(e.obrigacoes)].sort()
    const key = ordenadas.join('|')
    if (!clusters.has(key)) clusters.set(key, { tributacoes: new Map(), total: 0, obrigacoes: ordenadas })
    const c = clientesMap.get(e.cnpj)
    const trib = !c ? '(sem cliente OC)' : (c.tributacao ?? '(sem trib)')
    const entry = clusters.get(key)!
    entry.total++
    entry.tributacoes.set(trib, (entry.tributacoes.get(trib) ?? 0) + 1)
  }
  const clustersOrd = [...clusters.values()].sort((a, b) => b.total - a.total)
  console.log(`  Total de combinações distintas: ${clustersOrd.length}`)
  const clustersGrandes = clustersOrd.filter((c) => c.total >= 3)
  console.log(`  Combinações com ≥3 empresas (potenciais templates): ${clustersGrandes.length}`)
  console.log(`  Top 10 maiores clusters:`)
  for (const c of clustersOrd.slice(0, 10)) {
    const tribs = [...c.tributacoes.entries()].sort((a, b) => b[1] - a[1])
    const tribSummary = tribs.map(([t, n]) => `${t}=${n}`).join(', ')
    console.log(`    ${c.total} empresas (${c.obrigacoes.length} obrigações)  [${tribSummary}]`)
  }

  // CSV dos clusters
  await escreverCsv(
    path.join(outDir, '5-clusters.csv'),
    ['# Empresas', 'Tributações', '# Obrigações', 'Obrigações (lista)'],
    clustersOrd.map((c) => [
      c.total,
      [...c.tributacoes.entries()].map(([t, n]) => `${t}=${n}`).join(' / '),
      c.obrigacoes.length,
      c.obrigacoes.join(' | '),
    ]),
  )

  console.log('\n══════════════════════════════════════════════════════════════════')
  console.log('CSVs gerados em:', outDir)
  console.log('══════════════════════════════════════════════════════════════════\n')
}

main()
  .catch((e) => { console.error('Erro fatal:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
