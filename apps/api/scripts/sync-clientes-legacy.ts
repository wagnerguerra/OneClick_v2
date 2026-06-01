/**
 * Sincronização não-destrutiva de clientes do OneClick v1 → atual.
 *
 *  - Match por CNPJ (documento) — atualiza idOneClick + idSistema preservando
 *    todos os outros campos do atual
 *  - Cliente só no legado → INSERT novo (razão, CNPJ, IE, endereço, contato, etc)
 *  - Cliente só no atual → não toca
 *
 *  Uso:
 *    pnpm tsx apps/api/scripts/sync-clientes-legacy.ts             # dry-run
 *    pnpm tsx apps/api/scripts/sync-clientes-legacy.ts --commit    # executa
 */

import { prisma } from '@saas/db'
import * as mysql from 'mysql2/promise'

const LEGACY = {
  host: '192.168.0.7', user: 'rose', password: 'acesso01',
  database: 'db_intranet', charset: 'utf8mb4',
}
const DRY_RUN = !process.argv.includes('--commit')
const CENTRAL_CONTABIL_ID = 'cmnn7xm6e00009gqgoii3ims2'

function normCnpj(v: string | null | undefined): string | null {
  if (!v) return null
  const d = String(v).replace(/\D/g, '')
  return d.length >= 11 ? d : null
}

function safeStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' || s === '0' || s === '0000-00-00' ? null : s
}

function safeDate(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) return v.getFullYear() < 1900 ? null : v
  const s = String(v)
  if (!s || s.startsWith('0000')) return null
  const d = new Date(s)
  return isNaN(d.getTime()) || d.getFullYear() < 1900 ? null : d
}

;(async () => {
  console.log(`=== Sync clientes legado → atual ===`)
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : '⚠️  COMMIT'}\n`)

  const my = await mysql.createConnection(LEGACY)

  try {
    // ── 1. Carrega legado ──
    const [legadoRows] = await my.query<mysql.RowDataPacket[]>(`
      SELECT id, cad_cli_cnpj AS cnpj, cad_cli_razao AS razao,
             cad_cli_ie AS ie, cad_cli_im AS im,
             cad_cli_contato AS contato, cad_cli_tel AS tel, cad_cli_email AS email,
             cad_cli_cep AS cep, cad_cli_end AS end_logr, cad_cli_num AS num,
             cad_cli_complemento AS complemento, cad_cli_bairro AS bairro,
             cad_cli_cidade AS cidade, cad_cli_estado AS uf,
             cad_cli_dt_ini AS dt_ini, cad_cli_obs AS obs,
             cad_cli_regime AS regime, cad_cli_situacao AS situacao
      FROM ger_cad_cli
      WHERE id_sistema = '0' OR id_sistema IS NULL
    `)

    // ── 2. Carrega atual ──
    const atuais = await prisma.cliente.findMany({
      where: { deletedAt: null },
      select: { id: true, documento: true, idOneClick: true, razaoSocial: true },
    })
    const atuaisByCnpj = new Map<string, typeof atuais[number]>()
    for (const c of atuais) {
      const n = normCnpj(c.documento)
      if (n) atuaisByCnpj.set(n, c)
    }

    console.log(`  Legado: ${legadoRows.length} clientes`)
    console.log(`  Atual:  ${atuais.length} clientes\n`)

    // ── 3. Decidir ações ──
    const linkar: Array<{ atualId: string; legadoId: number; razao: string }> = []
    const inserir: typeof legadoRows = []
    let semCnpjLegado = 0

    for (const row of legadoRows) {
      const c = normCnpj(row.cnpj as string)
      if (!c) { semCnpjLegado++; continue }
      const match = atuaisByCnpj.get(c)
      if (match) {
        if (match.idOneClick !== String(row.id)) {
          linkar.push({ atualId: match.id, legadoId: row.id as number, razao: match.razaoSocial })
        }
      } else {
        inserir.push(row)
      }
    }

    console.log(`Decisões:`)
    console.log(`  Linkar idOneClick (match CNPJ):  ${linkar.length}`)
    console.log(`  Inserir cliente novo:            ${inserir.length}`)
    console.log(`  Pular (sem CNPJ no legado):      ${semCnpjLegado}`)

    if (DRY_RUN) {
      console.log(`\n=== Amostra de matches (5 primeiros) ===`)
      for (const m of linkar.slice(0, 5)) {
        console.log(`  legado #${m.legadoId} → ${m.razao}`)
      }
      console.log(`\n=== Amostra de novos (5 primeiros) ===`)
      for (const i of inserir.slice(0, 5)) {
        console.log(`  legado #${i.id} · ${i.razao} · ${i.cnpj}`)
      }
      console.log(`\n⚠️  DRY-RUN — nada gravado. Rode com --commit pra executar.`)
      return
    }

    // ── 4. Executa em transação ──
    await prisma.$transaction(async tx => {  // eslint-disable-line @typescript-eslint/no-unused-vars
      // 4a. Linka idOneClick nos matches
      for (const m of linkar) {
        await tx.cliente.update({
          where: { id: m.atualId },
          data: { idOneClick: String(m.legadoId) },
        })
      }
      console.log(`  ✓ ${linkar.length} clientes linkados (idOneClick)`)

      // 4b. Insere novos
      let novosOk = 0
      for (const row of inserir) {
        try {
          await tx.cliente.create({
            data: {
              razaoSocial: (row.razao as string)?.trim() || 'Sem nome',
              documento: row.cnpj as string,
              idOneClick: String(row.id),
              idSistema: '0',
              inscricaoEstadual: safeStr(row.ie),
              inscricaoMunicipal: safeStr(row.im),
              telefone: safeStr(row.tel),
              email: safeStr(row.email),
              cep: safeStr(row.cep),
              logradouro: safeStr(row.end_logr),
              numero: safeStr(row.num),
              complemento: safeStr(row.complemento),
              bairro: safeStr(row.bairro),
              cidade: safeStr(row.cidade),
              uf: (() => { const u = safeStr(row.uf); return u && u.length === 2 ? u.toUpperCase() : null })(),
              dataEntrada: safeDate(row.dt_ini),
              observacoes: safeStr(row.obs),
              empresaId: CENTRAL_CONTABIL_ID,
            },
          })
          novosOk++
        } catch (e) {
          console.error(`  ❌ INSERT id=${row.id}:`, (e as Error).message)
        }
      }
      console.log(`  ✓ ${novosOk}/${inserir.length} clientes inseridos`)
    }, { timeout: 600_000, maxWait: 600_000 })

    console.log(`\n✅ COMMIT concluído.`)
  } finally {
    await my.end()
    await prisma.$disconnect()
  }
})().catch(e => {
  console.error('Erro fatal:', e)
  process.exit(1)
})
