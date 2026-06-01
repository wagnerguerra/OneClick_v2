/**
 * Migração one-shot dos orçamentos do OneClick v1 (legado) para o modelo atual.
 *
 * Origem: MySQL `db_intranet@192.168.0.7` — tabelas `com_orc`, `com_orc_ser`,
 * `com_orc_int`, `com_orc_arq`, `crp_orc_log`.
 *
 * Destino: PostgreSQL via Prisma — `Orcamento`, `OrcamentoItem`,
 * `OrcamentoMensagem`, `OrcamentoArquivo`, `OrcamentoEvento`.
 *
 * Uso:
 *   pnpm tsx apps/api/scripts/migrate-orcamentos-legacy.ts             # DRY-RUN (default)
 *   pnpm tsx apps/api/scripts/migrate-orcamentos-legacy.ts --commit    # executa de verdade
 *   pnpm tsx apps/api/scripts/migrate-orcamentos-legacy.ts --limit=50  # processa só 50 (debug)
 */

import { prisma } from '@saas/db'
import type { OrcamentoStatus } from '@saas/db'
import * as mysql from 'mysql2/promise'

const LEGACY = {
  host: '192.168.0.7',
  user: 'rose',
  password: 'acesso01',
  database: 'db_intranet',
  charset: 'utf8mb4',     // força conversão de latin1 → utf8 nas reads
}

const DRY_RUN = !process.argv.includes('--commit')
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1] ?? '0', 10) : 0

// ────────────────────────────────────────────────────────────────────
// Mapping de status (10 legado → 6 atual)
// ────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<number, OrcamentoStatus> = {
  1: 'A_ENVIAR',        // ENVIAR (rascunho)
  2: 'ENVIADO',
  3: 'APROVADO',
  4: 'LIBERADO',
  5: 'FINALIZADO',
  6: 'ENCERRADO',       // CANCELADO
  7: 'ENCERRADO',       // NÃO APROVADO
  8: 'ENCERRADO',
  9: 'ENVIADO',         // REVISÃO → volta pra ENVIADO
  10: 'ENVIADO',        // RESPONDIDO
}

// Pra logar contexto da decisão de status (audit trail)
const STATUS_LEGADO_LABEL: Record<number, string> = {
  1: 'ENVIAR', 2: 'ENVIADO', 3: 'APROVADO', 4: 'LIBERADO',
  5: 'FINALIZADO', 6: 'CANCELADO', 7: 'NÃO APROVADO',
  8: 'ENCERRADO', 9: 'REVISÃO', 10: 'RESPONDIDO',
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

/** Parse decimal vindo como string BR (R$ 1.234,56 → 1234.56). */
function parseDecimalBR(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d,.-]/g, '').trim()
  if (!s) return null
  // se tem vírgula como decimal, troca ponto (separador de milhar) por nada e vírgula por ponto
  if (s.includes(',')) {
    const clean = s.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(clean)
    return Number.isFinite(n) ? n : null
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Trata zero-dates do MySQL como null (incluindo Invalid Date que o driver retorna pra 0000-00-00). */
function safeDate(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    if (v.getFullYear() < 1900) return null
    return v
  }
  const s = String(v)
  if (s.startsWith('0000') || s === '') return null
  const d = new Date(s)
  return isNaN(d.getTime()) || d.getFullYear() < 1900 ? null : d
}

function logStat(label: string, n: number) {
  console.log(`  ${label.padEnd(35)} ${n}`)
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Migração de Orçamentos (OneClick v1 → atual) ===`)
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (nenhum INSERT executado)' : '⚠️  COMMIT (gravando no banco)'}`)
  if (LIMIT) console.log(`Limit: ${LIMIT} (debug)`)
  console.log('')

  const my = await mysql.createConnection(LEGACY)

  try {
    // ── 1. Carrega mapping FKs ─────────────────────────────────────
    console.log('▸ Carregando mappings de FK...')
    const clientes = await prisma.cliente.findMany({
      where: { idOneClick: { not: null } },
      select: { id: true, idOneClick: true, razaoSocial: true, empresaId: true },
    })
    const clientesMap = new Map<string, { id: string; razaoSocial: string; empresaId: string | null }>()
    for (const c of clientes) if (c.idOneClick) clientesMap.set(c.idOneClick, { id: c.id, razaoSocial: c.razaoSocial, empresaId: c.empresaId })
    logStat('Clientes c/ idOneClick:', clientesMap.size)

    const users = await prisma.user.findMany({
      where: { idOneClick: { not: null } },
      select: { id: true, idOneClick: true, name: true },
    })
    const usersMap = new Map<string, { id: string; name: string | null }>()
    for (const u of users) if (u.idOneClick) usersMap.set(u.idOneClick, { id: u.id, name: u.name })
    logStat('Users c/ idOneClick:', usersMap.size)

    // ── 2. Lê orçamentos legados ───────────────────────────────────
    console.log('\n▸ Lendo orçamentos legados...')
    const [orcRows] = await my.query<mysql.RowDataPacket[]>(
      `SELECT id, numero, hash, status, cliente, usuario, responsavel,
              desconto, valor_desconto, descricao, validade, vencimento,
              dt_nov, dt_env, dt_apr, dt_lib, dt_fin, dt_enc, dt_can,
              nome_aprovacao, cpf_aprovacao, obs_aprovacao,
              cnpj_faturamento, email_faturamento,
              contato, contato_email, arquivar, atencao, paralizado
       FROM com_orc
       ORDER BY id ASC
       ${LIMIT ? `LIMIT ${LIMIT}` : ''}`
    )
    logStat('Total no legado:', orcRows.length)

    // Mapa pra resolver cliente/user durante loop de itens
    const orcamentoIdMap = new Map<number, string>() // legacy id → novo cuid

    // ── 3. Processa cada orçamento ─────────────────────────────────
    const stats = {
      criados: 0,
      skipExistente: 0,
      skipSemCliente: 0,
      skipSemUser: 0,
      erros: 0,
    }
    const amostra: Array<{ legado: number; status: string; cliente: string; novo?: string }> = []

    // Pre-load orçamentos atuais pra detectar duplicados (numero + clienteId é único de fato)
    const existentes = await prisma.orcamento.findMany({
      select: { numero: true, clienteId: true },
    })
    const existentesKey = new Set(existentes.map(e => `${e.numero}:${e.clienteId}`))

    for (const row of orcRows) {
      try {
        const legacyId = row.id as number
        const numeroLegado = (row.numero as number | null) ?? legacyId
        const clienteLegacy = row.cliente as number | null

        if (!clienteLegacy) {
          stats.skipSemCliente++
          continue
        }
        const cliente = clientesMap.get(String(clienteLegacy))
        if (!cliente) {
          stats.skipSemCliente++
          continue
        }

        // Skip se já existe um orçamento com (numero, clienteId) — idempotência
        if (existentesKey.has(`${numeroLegado}:${cliente.id}`)) {
          stats.skipExistente++
          continue
        }

        const usuarioLegacy = row.usuario as number | null
        const responsavelLegacy = (row.responsavel as number | null) || usuarioLegacy
        const responsavelNovo = responsavelLegacy ? usersMap.get(String(responsavelLegacy)) : null
        if (!responsavelNovo && usuarioLegacy) {
          // Tenta o "usuario" como fallback
          const fallback = usersMap.get(String(usuarioLegacy))
          if (!fallback) {
            stats.skipSemUser++
            continue
          }
        }

        const statusLegado = (row.status as number) ?? 1
        const statusNovo = STATUS_MAP[statusLegado] ?? 'A_ENVIAR'

        const data = {
          numero: numeroLegado,
          token: (row.hash as string) || undefined,
          clienteId: cliente.id,
          responsavelId: responsavelNovo?.id ?? null,
          status: statusNovo,
          validadeDias: (row.validade as number | null) ?? 90,
          descontoPct: parseDecimalBR(row.desconto),
          descontoValor: parseDecimalBR(row.valor_desconto),
          observacoes: decodeEntities(row.descricao) || null,
          decisaoNome: decodeEntities(row.nome_aprovacao) || null,
          decisaoCpf: (row.cpf_aprovacao as string | null) ?? null,
          decisaoObs: decodeEntities(row.obs_aprovacao) || null,
          decisaoEm: safeDate(row.dt_apr),
          empresaId: cliente.empresaId,
          createdAt: safeDate(row.dt_nov) ?? new Date(),
        }

        if (!DRY_RUN) {
          // Cria orçamento real (sem itens/mensagens/anexos nessa fase)
          const novo = await prisma.orcamento.create({
            data: {
              numero: data.numero,
              token: data.token,
              clienteId: data.clienteId,
              responsavelId: data.responsavelId,
              status: data.status,
              validadeDias: data.validadeDias,
              descontoPct: data.descontoPct,
              descontoValor: data.descontoValor,
              observacoes: data.observacoes,
              decisaoNome: data.decisaoNome,
              decisaoCpf: data.decisaoCpf,
              decisaoObs: data.decisaoObs,
              decisaoEm: data.decisaoEm,
              empresaId: data.empresaId,
              createdAt: data.createdAt,
            },
          })
          orcamentoIdMap.set(legacyId, novo.id)
        }

        stats.criados++
        if (amostra.length < 5) {
          amostra.push({
            legado: legacyId,
            status: `${STATUS_LEGADO_LABEL[statusLegado] ?? '?'} → ${statusNovo}`,
            cliente: cliente.razaoSocial,
          })
        }
      } catch (e) {
        stats.erros++
        const msg = (e as Error).message.split('\n').find(l => l.includes('argument') || l.includes('constraint') || l.includes('unique')) ?? (e as Error).message.slice(0, 200)
        if (stats.erros <= 5) console.error(`  ❌ id=${row.id}:`, msg)
      }
    }

    // ── 4. Relatório ───────────────────────────────────────────────
    console.log('\n=== Resultado ===')
    logStat('Criados:', stats.criados)
    logStat('Pulados (já existem):', stats.skipExistente)
    logStat('Pulados (sem cliente mapeado):', stats.skipSemCliente)
    logStat('Pulados (sem user mapeado):', stats.skipSemUser)
    logStat('Erros:', stats.erros)

    if (amostra.length > 0) {
      console.log('\n=== Amostra (primeiros 5) ===')
      for (const a of amostra) {
        console.log(`  legado #${a.legado} · ${a.status} · cliente: ${a.cliente}`)
      }
    }

    if (DRY_RUN) {
      console.log('\n⚠️  DRY-RUN — nada foi gravado. Rode com --commit pra executar.')
    } else {
      console.log('\n✅ COMMIT — orçamentos gravados. Próximo passo: rodar fases de itens/mensagens/anexos.')
    }
  } finally {
    await my.end()
    await prisma.$disconnect()
  }
}

main().catch(e => {
  console.error('Erro fatal:', e)
  process.exit(1)
})
