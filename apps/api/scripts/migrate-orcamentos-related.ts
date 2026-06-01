/**
 * Fase 2 da migração de orçamentos: itens, mensagens, anexos (físicos), histórico.
 *
 * Pré-requisitos:
 *  - migrate-orcamentos-legacy.ts já rodado (orçamentos core criados)
 *
 * Bridge legacy → atual:
 *  - Atual.numero = Legado.id (ou numero) + Atual.clienteId.idOneClick = Legado.cliente
 *
 * Uso:
 *  pnpm tsx apps/api/scripts/migrate-orcamentos-related.ts             # dry-run
 *  pnpm tsx apps/api/scripts/migrate-orcamentos-related.ts --commit
 *  pnpm tsx apps/api/scripts/migrate-orcamentos-related.ts --commit --skip-anexos
 */

import { prisma } from '@saas/db'
import * as mysql from 'mysql2/promise'
import * as fs from 'node:fs'
import * as path from 'node:path'

const LEGACY = {
  host: '192.168.0.7', user: 'rose', password: 'acesso01',
  database: 'db_intranet', charset: 'utf8mb4',
}
const DRY_RUN = !process.argv.includes('--commit')
const SKIP_ANEXOS = process.argv.includes('--skip-anexos')

// Caminho do share legado (Windows UNC ou montagem local)
const LEGACY_FILES_DIR = '\\\\192.168.0.7\\wwwroot\\files\\orcamentos'
// Destino: pasta de uploads acessível pela API. Usa a mesma estratégia do helpdesk.
const UPLOADS_DIR = path.resolve(process.cwd(), '..', '..', 'uploads', 'orcamentos-legado')

/**
 * Decodifica HTML entities — o legado salvava acentos como `&Ccedil;` (Ç),
 * `&Atilde;` (Ã), `&ccedil;` (ç) etc. PG/UI atual espera texto plano.
 */
function decodeEntities(v: unknown): string {
  if (v == null) return ''
  return String(v)
    .replace(/&Ccedil;/g, 'Ç').replace(/&ccedil;/g, 'ç')
    .replace(/&Atilde;/g, 'Ã').replace(/&atilde;/g, 'ã')
    .replace(/&Aacute;/g, 'Á').replace(/&aacute;/g, 'á')
    .replace(/&Acirc;/g, 'Â').replace(/&acirc;/g, 'â')
    .replace(/&Agrave;/g, 'À').replace(/&agrave;/g, 'à')
    .replace(/&Eacute;/g, 'É').replace(/&eacute;/g, 'é')
    .replace(/&Ecirc;/g, 'Ê').replace(/&ecirc;/g, 'ê')
    .replace(/&Iacute;/g, 'Í').replace(/&iacute;/g, 'í')
    .replace(/&Oacute;/g, 'Ó').replace(/&oacute;/g, 'ó')
    .replace(/&Ocirc;/g, 'Ô').replace(/&ocirc;/g, 'ô')
    .replace(/&Otilde;/g, 'Õ').replace(/&otilde;/g, 'õ')
    .replace(/&Uacute;/g, 'Ú').replace(/&uacute;/g, 'ú')
    .replace(/&Uuml;/g, 'Ü').replace(/&uuml;/g, 'ü')
    .replace(/&Ntilde;/g, 'Ñ').replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    // Entidades numéricas (&#231; = ç, &#xE7; = ç)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function safeDate(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) return isNaN(v.getTime()) || v.getFullYear() < 1900 ? null : v
  const s = String(v)
  if (!s || s.startsWith('0000')) return null
  const d = new Date(s)
  return isNaN(d.getTime()) || d.getFullYear() < 1900 ? null : d
}

function parseDecimalBR(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d,.-]/g, '').trim()
  if (!s) return null
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || null
  return parseFloat(s) || null
}

;(async () => {
  console.log(`=== Migração FASE 2 (itens + mensagens + anexos + log) ===`)
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : '⚠️  COMMIT'}${SKIP_ANEXOS ? ' (skip-anexos)' : ''}\n`)

  const my = await mysql.createConnection(LEGACY)
  try {
    // ── 1. Bridge: cria map legacy_id → cuid atual ─────────────────
    console.log('▸ Construindo bridge legacy → atual...')
    const clientesAtuais = await prisma.cliente.findMany({
      where: { idOneClick: { not: null } },
      select: { id: true, idOneClick: true },
    })
    const clienteAtualPorIdLegacy = new Map<string, string>()
    for (const c of clientesAtuais) if (c.idOneClick) clienteAtualPorIdLegacy.set(c.idOneClick, c.id)

    const usersAtuais = await prisma.user.findMany({
      where: { idOneClick: { not: null } },
      select: { id: true, idOneClick: true },
    })
    const userAtualPorIdLegacy = new Map<string, string>()
    for (const u of usersAtuais) if (u.idOneClick) userAtualPorIdLegacy.set(u.idOneClick, u.id)

    // Carrega orçamentos legados (id, numero, cliente) e atuais (numero, clienteId)
    const [legados] = await my.query<mysql.RowDataPacket[]>(
      `SELECT id, numero, cliente FROM com_orc WHERE cliente > 0`
    )
    const orcsAtuais = await prisma.orcamento.findMany({
      select: { id: true, numero: true, clienteId: true },
    })
    // Indexa atuais por (numero, clienteId)
    const atualKey = new Map<string, string>() // key = `${numero}:${clienteId}` → orcamento.id
    for (const o of orcsAtuais) atualKey.set(`${o.numero}:${o.clienteId}`, o.id)

    const legacyToAtual = new Map<number, string>() // legacy.id → atual.id
    for (const leg of legados) {
      const legId = leg.id as number
      const legNumero = (leg.numero as number | null) ?? legId
      const legCliente = leg.cliente as number
      const clienteCuid = clienteAtualPorIdLegacy.get(String(legCliente))
      if (!clienteCuid) continue
      const atualId = atualKey.get(`${legNumero}:${clienteCuid}`)
      if (atualId) legacyToAtual.set(legId, atualId)
    }
    console.log(`  Bridge montado: ${legacyToAtual.size} orçamentos atuais linkados ao legado`)

    if (legacyToAtual.size === 0) {
      console.log('Nenhum orçamento migrado ainda. Rode migrate-orcamentos-legacy.ts --commit primeiro.')
      return
    }

    // ── 2. FASE: Itens (com_orc_ser) ─────────────────────────────
    console.log('\n▸ FASE: Itens...')
    const idsLegacy = Array.from(legacyToAtual.keys())
    const [itensRows] = await my.query<mysql.RowDataPacket[]>(
      `SELECT cod_orc, cod_serv, qtde, valor, ativo, situacao FROM com_orc_ser WHERE cod_orc IN (${idsLegacy.join(',') || '0'})`
    )
    console.log(`  Encontrados: ${itensRows.length}`)
    const itensExistentes = await prisma.orcamentoItem.findMany({
      where: { orcamentoId: { in: Array.from(legacyToAtual.values()) } },
      select: { orcamentoId: true },
    })
    const orcamentosComItens = new Set(itensExistentes.map(i => i.orcamentoId))
    let itensCriados = 0, itensSkip = 0
    if (!DRY_RUN) {
      const toCreate: { orcamentoId: string; tipo: string; descricao: string; quantidade: number; valorUnitario: number }[] = []
      for (const r of itensRows) {
        const orcamentoId = legacyToAtual.get(r.cod_orc as number)
        if (!orcamentoId) continue
        if (orcamentosComItens.has(orcamentoId)) { itensSkip++; continue }  // já migrado, idempotente
        const qtde = parseDecimalBR(r.qtde) ?? 1
        const valor = parseDecimalBR(r.valor) ?? 0
        toCreate.push({
          orcamentoId,
          tipo: 'SERVICO',
          descricao: `Serviço #${r.cod_serv ?? '?'}`,  // sem detalhes (crp_srv não acessível 1:1)
          quantidade: qtde,
          valorUnitario: valor,
        })
        itensCriados++
      }
      if (toCreate.length > 0) {
        await prisma.orcamentoItem.createMany({ data: toCreate })
      }
    } else {
      for (const r of itensRows) {
        const orcamentoId = legacyToAtual.get(r.cod_orc as number)
        if (!orcamentoId) continue
        if (orcamentosComItens.has(orcamentoId)) itensSkip++
        else itensCriados++
      }
    }
    console.log(`  ${itensCriados} ${DRY_RUN ? 'criariam' : 'criados'} · ${itensSkip} skip (já migrados)`)

    // ── 3. FASE: Mensagens (com_orc_int) ─────────────────────────
    console.log('\n▸ FASE: Mensagens...')
    const [intRows] = await my.query<mysql.RowDataPacket[]>(
      `SELECT controle, usuario, dt_int, interacao, fechado_financeiro
       FROM com_orc_int WHERE controle IN (${idsLegacy.join(',') || '0'})`
    )
    console.log(`  Encontradas: ${intRows.length}`)
    let msgCriadas = 0, msgSkipExistentes = 0
    const msgExistentes = await prisma.orcamentoMensagem.findMany({
      where: { orcamentoId: { in: Array.from(legacyToAtual.values()) } },
      select: { orcamentoId: true },
    })
    const orcamentosComMsg = new Set(msgExistentes.map(m => m.orcamentoId))
    if (!DRY_RUN) {
      const toCreate: { orcamentoId: string; userId: string | null; mensagem: string; restritoFinanceiro: boolean; createdAt: Date }[] = []
      for (const r of intRows) {
        const orcamentoId = legacyToAtual.get(r.controle as number)
        if (!orcamentoId) continue
        if (orcamentosComMsg.has(orcamentoId)) { msgSkipExistentes++; continue }
        // user no legado é varchar (pode ser ID ou email) — tentativa de mapping
        const usuarioStr = String(r.usuario ?? '')
        const userId = userAtualPorIdLegacy.get(usuarioStr) ?? null
        const conteudo = decodeEntities(r.interacao).trim()
        if (!conteudo) continue
        toCreate.push({
          orcamentoId,
          userId,
          mensagem: conteudo,
          restritoFinanceiro: r.fechado_financeiro === 1,
          createdAt: safeDate(r.dt_int) ?? new Date(),
        })
        msgCriadas++
      }
      if (toCreate.length > 0) {
        await prisma.orcamentoMensagem.createMany({ data: toCreate })
      }
    } else {
      for (const r of intRows) {
        const orcamentoId = legacyToAtual.get(r.controle as number)
        if (!orcamentoId) continue
        if (orcamentosComMsg.has(orcamentoId)) msgSkipExistentes++
        else msgCriadas++
      }
    }
    console.log(`  ${msgCriadas} ${DRY_RUN ? 'criariam' : 'criadas'} · ${msgSkipExistentes} skip`)

    // ── 4. FASE: Histórico (crp_orc_log) ─────────────────────────
    console.log('\n▸ FASE: Histórico (logs/eventos)...')
    const [logRows] = await my.query<mysql.RowDataPacket[]>(
      `SELECT id_registro AS cod_orc, dt_evento AS dt_reg, usuario, situacao, evento
       FROM crp_orc_log WHERE id_registro IN (${idsLegacy.join(',') || '0'}) AND ativo = 1`
    )
    console.log(`  Encontrados: ${logRows.length}`)
    let logCriados = 0, logSkip = 0
    const logExistentes = await prisma.orcamentoEvento.findMany({
      where: { orcamentoId: { in: Array.from(legacyToAtual.values()) } },
      select: { orcamentoId: true },
    })
    const orcamentosComLog = new Set(logExistentes.map(l => l.orcamentoId))
    const STATUS_LABEL: Record<number, string> = {
      1: 'ENVIAR', 2: 'ENVIADO', 3: 'APROVADO', 4: 'LIBERADO',
      5: 'FINALIZADO', 6: 'CANCELADO', 7: 'NÃO APROVADO',
      8: 'ENCERRADO', 9: 'REVISÃO', 10: 'RESPONDIDO',
    }
    if (!DRY_RUN) {
      const toCreate: { orcamentoId: string; userId: string | null; tipo: string; descricao: string | null; createdAt: Date }[] = []
      for (const r of logRows) {
        const orcamentoId = legacyToAtual.get(r.cod_orc as number)
        if (!orcamentoId) continue
        if (orcamentosComLog.has(orcamentoId)) { logSkip++; continue }
        const userId = userAtualPorIdLegacy.get(String(r.usuario ?? '')) ?? null
        const eventoDesc = decodeEntities(r.evento).trim()
        toCreate.push({
          orcamentoId,
          userId,
          tipo: 'status_change',
          descricao: eventoDesc || `Status: ${STATUS_LABEL[r.situacao as number] ?? r.situacao}`,
          createdAt: safeDate(r.dt_reg) ?? new Date(),
        })
        logCriados++
      }
      if (toCreate.length > 0) {
        await prisma.orcamentoEvento.createMany({ data: toCreate })
      }
    } else {
      for (const r of logRows) {
        const orcamentoId = legacyToAtual.get(r.cod_orc as number)
        if (!orcamentoId) continue
        if (orcamentosComLog.has(orcamentoId)) logSkip++
        else logCriados++
      }
    }
    console.log(`  ${logCriados} ${DRY_RUN ? 'criariam' : 'criados'} · ${logSkip} skip`)

    // ── 5. FASE: Anexos (com_orc_arq) ────────────────────────────
    // Arquivos físicos já foram transferidos via tar+ssh pra
    // /var/lib/docker/volumes/oneclick_oneclick_uploads/_data/orcamentos-legado/.
    // Aqui só registramos OrcamentoArquivo apontando pra URL que o endpoint
    // /api/upload/orcamentos-legado/:filename serve.
    if (SKIP_ANEXOS) {
      console.log('\n▸ FASE: Anexos — SKIP (--skip-anexos)')
    } else {
      console.log('\n▸ FASE: Anexos (registra no banco; arquivos já transferidos)...')
      const [arqRows] = await my.query<mysql.RowDataPacket[]>(
        `SELECT orcamento, descricao, link, dt_arq FROM com_orc_arq WHERE orcamento IN (${idsLegacy.join(',') || '0'}) AND ativo = 1`
      )
      console.log(`  Encontrados: ${arqRows.length}`)
      let arqCriados = 0, arqSkipExistentes = 0
      const arqExistentes = await prisma.orcamentoArquivo.findMany({
        where: { orcamentoId: { in: Array.from(legacyToAtual.values()) } },
        select: { orcamentoId: true },
      })
      const orcamentosComArq = new Set(arqExistentes.map(a => a.orcamentoId))

      const toCreate: { orcamentoId: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: Date }[] = []
      for (const r of arqRows) {
        const orcamentoId = legacyToAtual.get(r.orcamento as number)
        if (!orcamentoId) continue
        if (orcamentosComArq.has(orcamentoId)) { arqSkipExistentes++; continue }
        const link = String(r.link ?? '').trim().replace(/^\//, '')
        if (!link) continue

        toCreate.push({
          orcamentoId,
          fileName: decodeEntities(r.descricao) || link,
          fileUrl: `/api/upload/orcamentos-legado/${encodeURIComponent(link)}`,
          fileSize: null,  // não conhecemos sem acessar o arquivo
          mimeType: null,
          createdAt: safeDate(r.dt_arq) ?? new Date(),
        })
        arqCriados++
      }
      if (!DRY_RUN && toCreate.length > 0) {
        await prisma.orcamentoArquivo.createMany({ data: toCreate })
      }
      console.log(`  ${arqCriados} ${DRY_RUN ? 'criariam' : 'criados'} · ${arqSkipExistentes} skip (já migrados)`)
    }

    console.log('\n=== Resumo final ===')
    console.log(`  Itens:     ${itensCriados}`)
    console.log(`  Mensagens: ${msgCriadas}`)
    console.log(`  Histórico: ${logCriados}`)
    if (DRY_RUN) console.log('\n⚠️  DRY-RUN — nada gravado. Rode com --commit pra executar.')
    else console.log('\n✅ COMMIT concluído.')
  } finally {
    await my.end()
    await prisma.$disconnect()
  }
})().catch(e => { console.error(e); process.exit(1) })
