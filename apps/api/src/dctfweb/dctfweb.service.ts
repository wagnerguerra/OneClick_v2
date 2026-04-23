import { Injectable, Inject } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import { SitfisService } from '../sitfis/sitfis.service'
import { avaliarPosEntrega, aplicarDiagnosticoPosEntrega, marcarRetificadoraTransmitida } from './dctfweb.diagnostico'

// ============================================================
// Tipos
// ============================================================

interface ApuracaoApi {
  periodoApuracao?: { mesApuracao: number; anoApuracao: number }
  idApuracao?: number
  situacao?: number
  textoSituacao?: string
  dataEncerramento?: string
  eventoEspecial?: boolean
  valorTotalApurado?: number
}

const STATUS_PROCESSO: Record<string, string> = {
  aguardando_fechamento: 'Aguardando Fechamento',
  pronto_envio: 'Pronto para Envio',
  aguardando_pagamento: 'Aguardando Pagamento',
  concluido: 'Concluído',
  erro: 'Erro',
}

const SITUACAO_APURACAO: Record<number, string> = {
  1: 'Aberta',
  2: 'Em Andamento',
  3: 'Encerrada',
  4: 'Retificada',
  5: 'Excluída',
}

/**
 * Feriados nacionais fixos + móveis (Páscoa-dependentes).
 * Carnaval = Páscoa - 47 dias; Corpus Christi = Páscoa + 60 dias; Sexta-feira Santa = Páscoa - 2.
 */
function feriadosNacionais(ano: number): Set<string> {
  const fixos = [
    `${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`, `${ano}-09-07`,
    `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-12-25`,
  ]
  // Páscoa (algoritmo de Meeus)
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mesPascoa = Math.floor((h + l - 7 * m + 114) / 31)
  const diaPascoa = ((h + l - 7 * m + 114) % 31) + 1
  const pascoa = new Date(ano, mesPascoa - 1, diaPascoa)
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10)
  const moveis = [
    fmt(new Date(pascoa.getTime() - 47 * 86400000)), // Carnaval (segunda)
    fmt(new Date(pascoa.getTime() - 48 * 86400000)), // Carnaval (terça) — ponto facultativo mas considerado
    fmt(new Date(pascoa.getTime() - 2 * 86400000)),  // Sexta-feira Santa
    fmt(pascoa),                                       // Páscoa
    fmt(new Date(pascoa.getTime() + 60 * 86400000)),  // Corpus Christi
  ]
  return new Set([...fixos, ...moveis])
}

/**
 * Calcula a data de vencimento da DCTFWeb.
 * Regra: dia 20 do mês seguinte à competência.
 * Se cair em sábado, domingo ou feriado, prorroga para o próximo dia útil.
 */
function calcularVencimento(competencia: string): Date {
  const [mes, ano] = competencia.split('/')
  const anoNum = Number(ano)
  let d = new Date(anoNum, Number(mes), 20) // Number(mes) já é mês seguinte (0-indexed +1)
  const feriados = feriadosNacionais(d.getFullYear())
  // Prorrogar para próximo dia útil
  while (true) {
    const dow = d.getDay()
    const iso = d.toISOString().slice(0, 10)
    if (dow !== 0 && dow !== 6 && !feriados.has(iso)) break
    d = new Date(d.getTime() + 86400000) // avança 1 dia
  }
  return d
}

const NIVEL_ALERTA_LABELS: Record<string, string> = {
  verde: 'Regular',
  amarelo: 'Atenção',
  vermelho: 'Crítico',
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class DctfwebService {
  constructor(@Inject(SitfisService) private readonly sitfisService: SitfisService) {}

  // ── Tabela (criacao automatica) ───────────────────────

  private tableChecked = false
  private columnsChecked = false
  async ensureTable() {
    if (this.tableChecked && this.columnsChecked) return
    const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'obrigacoes_dctfweb')`,
    )
    if (exists[0]?.exists && !this.columnsChecked) {
      // Tabela existe, verificar se precisa de migration de colunas
      await this.ensureColumns()
      this.tableChecked = true
      this.columnsChecked = true
      return
    }
    if (exists[0]?.exists) { this.tableChecked = true; return }
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS obrigacoes_dctfweb (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        cliente_id TEXT,
        documento TEXT NOT NULL,
        razao_social TEXT,
        competencia TEXT NOT NULL,

        esocial_fechado BOOLEAN DEFAULT false,
        reinf_fechado BOOLEAN DEFAULT false,

        status_dctfweb TEXT,
        valor_debito_api DECIMAL(14,2),
        situacao_fiscal TEXT,
        id_apuracao INT,
        texto_situacao TEXT,

        status_processo TEXT DEFAULT 'aguardando_fechamento',
        divergente BOOLEAN DEFAULT false,

        darf_emitido BOOLEAN DEFAULT false,
        darf_pago BOOLEAN DEFAULT false,
        valor_darf DECIMAL(14,2),

        data_consulta_api TIMESTAMPTZ,
        data_transmissao TIMESTAMPTZ,
        data_pagamento TIMESTAMPTZ,
        data_encerramento TEXT,

        nivel_alerta TEXT DEFAULT 'verde',
        resposta_api JSONB,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_dctf_doc ON obrigacoes_dctfweb (documento)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_dctf_comp ON obrigacoes_dctfweb (competencia)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_dctf_cliente ON obrigacoes_dctfweb (cliente_id)`)
    // Log table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS log_dctfweb (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        cliente_id TEXT,
        documento TEXT,
        competencia TEXT,
        acao TEXT,
        detalhe TEXT,
        user_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await this.ensureColumns()
    this.tableChecked = true
    this.columnsChecked = true
  }

  private async ensureColumns() {
    const colsToAdd = [
      { name: 'data_ultima_entrega', def: 'TIMESTAMPTZ' },
      { name: 'data_ultimo_fechamento_esocial', def: 'TIMESTAMPTZ' },
      { name: 'data_ultimo_fechamento_reinf', def: 'TIMESTAMPTZ' },
      { name: 'data_ultima_atualizacao_mit', def: 'TIMESTAMPTZ' },
      { name: 'retificadora_pendente', def: 'BOOLEAN DEFAULT false' },
      { name: 'motivo_retificadora', def: 'TEXT' },
      { name: 'status_pos_entrega', def: "TEXT DEFAULT 'sem_alteracao'" },
      { name: 'data_vencimento', def: 'DATE' },
    ]
    const existingCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'obrigacoes_dctfweb'`,
    )
    const existingSet = new Set(existingCols.map(c => c.column_name))
    for (const col of colsToAdd) {
      if (!existingSet.has(col.name)) {
        await prisma.$executeRawUnsafe(`ALTER TABLE obrigacoes_dctfweb ADD COLUMN ${col.name} ${col.def}`).catch(() => {})
      }
    }
  }

  // ── Consulta API SERPRO — Listar Apuracoes ───────────

  async consultarApuracoes(documento: string, ano: number, mes?: number): Promise<ApuracaoApi[]> {
    const doc = documento.replace(/\D/g, '')
    const tipoDoc = doc.length === 11 ? 1 : 2

    const dados: Record<string, unknown> = { anoApuracao: ano }
    if (mes) dados.mesApuracao = mes

    // Usar a autenticação do SitfisService (mesma API Integra Contador)
    const result = await (this.sitfisService as any).callIntegra({
      documento: doc,
      tipoDocumento: tipoDoc,
      idSistema: 'MIT',
      idServico: 'LISTAAPURACOES317',
      versaoSistema: '1.0',
      dados: JSON.stringify(dados),
      endpoint: 'Consultar',
    })

    if (!result || result.status !== 200) {
      const msg = result?.mensagens?.[0]?.texto || `Status ${result?.status}`
      throw new Error(`Erro ao consultar apurações: ${msg}`)
    }

    let apuracoes: ApuracaoApi[] = []
    if (result.dados) {
      const parsed = typeof result.dados === 'string' ? JSON.parse(result.dados) : result.dados
      // A API retorna { Apuracoes: [...] } com A maiúsculo
      const list = parsed?.Apuracoes || parsed?.apuracoes || parsed?.listaApuracoes || (Array.isArray(parsed) ? parsed : null)
      if (list && Array.isArray(list)) {
        apuracoes = list.map((a: Record<string, unknown>) => ({
          situacao: a.situacao as number,
          textoSituacao: a.textoSituacao as string || undefined,
          idApuracao: a.idApuracao as number,
          valorTotalApurado: a.valorTotalApurado as number,
          dataEncerramento: a.dataEncerramento as string,
          eventoEspecial: a.eventoEspecial as boolean,
          periodoApuracao: typeof a.periodoApuracao === 'number'
            ? { mesApuracao: a.periodoApuracao % 100, anoApuracao: Math.floor(a.periodoApuracao / 100) }
            : a.periodoApuracao as ApuracaoApi['periodoApuracao'],
        }))
      }
    }

    return apuracoes
  }

  // ── Consultar Relatório Completo (PDF) ───────────────

  async consultarRelatorio(documento: string, competencia: string, categoria = 'GERAL_MENSAL'): Promise<string> {
    const doc = documento.replace(/\D/g, '')
    const tipoDoc = doc.length === 11 ? 1 : 2
    const [ano, mes] = competencia.split('/').reverse()

    const result = await (this.sitfisService as any).callIntegra({
      documento: doc,
      tipoDocumento: tipoDoc,
      idSistema: 'DCTFWEB',
      idServico: 'CONSDECCOMPLETA33',
      versaoSistema: '1.0',
      dados: JSON.stringify({ categoria, anoPA: ano, mesPA: mes }),
      endpoint: 'Consultar',
    })

    console.log('[DCTFWeb] Relatório response status:', result?.status, 'mensagens:', JSON.stringify(result?.mensagens?.slice(0, 2)))

    if (result?.status === 200 && result.dados) {
      const parsed = typeof result.dados === 'string' ? JSON.parse(result.dados) : result.dados
      if (parsed.PDFByteArrayBase64) return parsed.PDFByteArrayBase64
    }

    const msg = result?.mensagens?.[0]?.texto || result?.data?.slice?.(0, 200) || `Status ${result?.status || 'desconhecido'}`
    throw new Error(msg)
  }

  // ── Consultar Recibo de Transmissão (PDF) ────────────

  async consultarRecibo(documento: string, competencia: string): Promise<string> {
    const doc = documento.replace(/\D/g, '')
    const tipoDoc = doc.length === 11 ? 1 : 2
    const [ano, mes] = competencia.split('/').reverse()

    const result = await (this.sitfisService as any).callIntegra({
      documento: doc,
      tipoDocumento: tipoDoc,
      idSistema: 'DCTFWEB',
      idServico: 'CONSRECIBO32',
      versaoSistema: '1.0',
      dados: JSON.stringify({ categoria: 40, anoPA: ano, mesPA: mes }),
      endpoint: 'Consultar',
    })

    console.log('[DCTFWeb] Recibo response status:', result?.status, 'mensagens:', JSON.stringify(result?.mensagens?.slice(0, 2)))

    if (result?.status === 200 && result.dados) {
      const parsed = typeof result.dados === 'string' ? JSON.parse(result.dados) : result.dados
      if (parsed.PDFByteArrayBase64) return parsed.PDFByteArrayBase64
    }

    const msg = result?.mensagens?.[0]?.texto || result?.data?.slice?.(0, 200) || `Status ${result?.status || 'desconhecido'}`
    throw new Error(msg)
  }

  // ── Gerar Guia DARF (PDF) ────────────────────────────

  async gerarGuia(documento: string, competencia: string, categoria = 'GERAL_MENSAL'): Promise<{ pdf: string; dataVencimento: string | null; valorTotal: number | null }> {
    const doc = documento.replace(/\D/g, '')
    const tipoDoc = doc.length === 11 ? 1 : 2
    const [ano, mes] = competencia.split('/').reverse()

    const result = await (this.sitfisService as any).callIntegra({
      documento: doc,
      tipoDocumento: tipoDoc,
      idSistema: 'DCTFWEB',
      idServico: 'GERARGUIA31',
      versaoSistema: '1.0',
      dados: JSON.stringify({ categoria, anoPA: ano, mesPA: mes }),
      endpoint: 'Emitir',
    })

    console.log('[DCTFWeb] Guia response status:', result?.status)

    if (result?.status === 200 && result.dados) {
      const parsed = typeof result.dados === 'string' ? JSON.parse(result.dados) : result.dados
      // Logar todas as chaves para descobrir onde está o vencimento
      console.log('[DCTFWeb] Guia dados keys:', Object.keys(parsed))
      console.log('[DCTFWeb] Guia dados (sem PDF):', JSON.stringify({ ...parsed, PDFByteArrayBase64: parsed.PDFByteArrayBase64 ? '[PDF]' : null }).slice(0, 500))

      if (parsed.PDFByteArrayBase64) {
        // Extrair data de vencimento — pode estar em vários campos
        const dataVenc = parsed.dataVencimento || parsed.DataVencimento || parsed.vencimento
          || parsed.dataArrecadacao || parsed.DataArrecadacao || null

        const valorTotal = parsed.valorTotal || parsed.ValorTotal || parsed.valorApurado || null

        // Se achou vencimento, atualizar no banco
        if (dataVenc) {
          await prisma.$executeRawUnsafe(
            `UPDATE obrigacoes_dctfweb SET data_vencimento = $2::date, updated_at = NOW()
             WHERE documento = $1 AND competencia = $3`,
            doc, typeof dataVenc === 'string' && dataVenc.length === 8
              ? `${dataVenc.slice(0, 4)}-${dataVenc.slice(4, 6)}-${dataVenc.slice(6, 8)}`
              : dataVenc,
            competencia,
          ).catch(() => {})
        }

        return { pdf: parsed.PDFByteArrayBase64, dataVencimento: dataVenc, valorTotal }
      }
    }

    const msg = result?.mensagens?.[0]?.texto || result?.data?.slice?.(0, 200) || `Status ${result?.status || 'desconhecido'}`
    throw new Error(msg)
  }

  // ── Sincronizar competência de um cliente ─────────────

  async sincronizar(documento: string, competencia: string, opts?: { clienteId?: string; userId?: string }) {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    const [mes, ano] = competencia.split('/')

    // Buscar razão social
    let razaoSocial: string | null = null
    if (opts?.clienteId) {
      const cli = await prisma.cliente.findUnique({ where: { id: opts.clienteId }, select: { razaoSocial: true } })
      razaoSocial = cli?.razaoSocial || null
    } else {
      const cli = await prisma.$queryRawUnsafe<Array<{ razao_social: string }>>(
        `SELECT razao_social FROM clientes WHERE deleted_at IS NULL
         AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
      )
      razaoSocial = cli[0]?.razao_social || null
    }

    try {
      const apuracoes = await this.consultarApuracoes(doc, Number(ano), Number(mes))
      // Pegar a apuração mais recente (maior idApuracao)
      const apuracao = apuracoes.length > 0
        ? apuracoes.sort((a, b) => (b.idApuracao ?? 0) - (a.idApuracao ?? 0))[0]
        : undefined

      // Determinar status e alerta
      let statusProcesso = 'aguardando_fechamento'
      let nivelAlerta = 'verde'
      let statusDctfweb: string | null = null
      let valorDebito: number | null = null
      let textoSituacao: string | null = null
      let dataEncerramento: string | null = null
      let idApuracao: number | null = null

      if (apuracao) {
        const sit = apuracao.situacao ?? 0
        textoSituacao = apuracao.textoSituacao || SITUACAO_APURACAO[sit] || `Situação ${sit}`
        statusDctfweb = textoSituacao
        valorDebito = apuracao.valorTotalApurado ?? null
        dataEncerramento = apuracao.dataEncerramento || null
        idApuracao = apuracao.idApuracao ?? null

        // Classificar status do processo
        if (sit >= 3) { // ENCERRADA ou superior
          statusProcesso = valorDebito && valorDebito > 0 ? 'aguardando_pagamento' : 'concluido'
        } else if (sit === 2) { // EM ANDAMENTO
          statusProcesso = 'pronto_envio'
        } else {
          statusProcesso = 'aguardando_fechamento'
        }

        // Classificar alerta baseado no dia do mês
        const hoje = new Date()
        const dia = hoje.getDate()
        if (statusProcesso === 'aguardando_fechamento' && dia >= 13) nivelAlerta = 'vermelho'
        else if (statusProcesso === 'aguardando_fechamento' && dia >= 10) nivelAlerta = 'amarelo'
        else if (statusProcesso === 'aguardando_pagamento') nivelAlerta = 'amarelo'
      } else {
        statusDctfweb = 'nao_encontrada'
        nivelAlerta = 'amarelo'
      }

      // Upsert no banco
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string; data_ultima_entrega: Date | null; data_ultimo_fechamento_esocial: Date | null; data_ultimo_fechamento_reinf: Date | null; data_ultima_atualizacao_mit: Date | null }>>(
        `SELECT id, data_ultima_entrega, data_ultimo_fechamento_esocial, data_ultimo_fechamento_reinf, data_ultima_atualizacao_mit
         FROM obrigacoes_dctfweb WHERE documento = $1 AND competencia = $2 LIMIT 1`,
        doc, competencia,
      )

      // Se encerrada (sit >= 3) e é a primeira vez, setar data_ultima_entrega
      const isEncerrada = apuracao && (apuracao.situacao ?? 0) >= 3
      const vencimento = calcularVencimento(competencia)
      let recordId: string

      if (existing.length > 0) {
        recordId = existing[0]!.id
        await prisma.$executeRawUnsafe(
          `UPDATE obrigacoes_dctfweb SET
            razao_social = $2, status_dctfweb = $3, valor_debito_api = $4,
            status_processo = $5, nivel_alerta = $6, texto_situacao = $7,
            data_encerramento = $8, id_apuracao = $9, data_consulta_api = NOW(),
            resposta_api = $10::jsonb,
            data_ultima_entrega = CASE WHEN $11 AND data_ultima_entrega IS NULL THEN NOW() WHEN $11 THEN data_ultima_entrega ELSE data_ultima_entrega END,
            data_vencimento = $12,
            updated_at = NOW()
           WHERE id = $1`,
          recordId, razaoSocial, statusDctfweb, valorDebito,
          statusProcesso, nivelAlerta, textoSituacao, dataEncerramento, idApuracao,
          JSON.stringify(apuracoes), isEncerrada, vencimento,
        )
      } else {
        recordId = `dctf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        await prisma.$executeRawUnsafe(
          `INSERT INTO obrigacoes_dctfweb (id, cliente_id, documento, razao_social, competencia,
            status_dctfweb, valor_debito_api, status_processo, nivel_alerta, texto_situacao,
            data_encerramento, id_apuracao, data_consulta_api, resposta_api, data_ultima_entrega, data_vencimento)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13::jsonb, $14, $15)`,
          recordId, opts?.clienteId || null, doc, razaoSocial, competencia,
          statusDctfweb, valorDebito, statusProcesso, nivelAlerta, textoSituacao,
          dataEncerramento, idApuracao, JSON.stringify(apuracoes),
          isEncerrada ? new Date() : null, vencimento,
        )
      }

      // Diagnóstico pós-entrega
      const row = existing[0]
      const diagnostico = avaliarPosEntrega({
        dataUltimaEntrega: row?.data_ultima_entrega || (isEncerrada ? new Date() : null),
        dataUltimoFechamentoEsocial: row?.data_ultimo_fechamento_esocial || null,
        dataUltimoFechamentoReinf: row?.data_ultimo_fechamento_reinf || null,
        dataUltimaAtualizacaoMit: row?.data_ultima_atualizacao_mit || null,
        statusDctfweb,
        situacaoApi: apuracao?.situacao ?? null,
      })
      await aplicarDiagnosticoPosEntrega(recordId, diagnostico, doc, competencia, opts?.clienteId, opts?.userId)

      // Log
      await this.registrarLog(doc, competencia, 'CONSULTA_API', `Sincronizado: ${statusProcesso} (${textoSituacao || 'N/A'})`, opts?.userId, opts?.clienteId)

      return { sucesso: true, statusProcesso, nivelAlerta, statusDctfweb, valorDebito, diagnostico }
    } catch (e) {
      await this.registrarLog(doc, competencia, 'ERRO_API', (e as Error).message, opts?.userId, opts?.clienteId)
      throw e
    }
  }

  // ── Sincronizar em lote ──────────────────────────────

  async sincronizarLote(competencia: string, userId?: string, clienteIds?: string[]) {
    await this.ensureTable()
    const where: Record<string, unknown> = { deletedAt: null, situacao: 'MENSAL' }
    if (clienteIds && clienteIds.length > 0) where.id = { in: clienteIds }
    const clientes = await prisma.cliente.findMany({
      where,
      select: { id: true, documento: true, razaoSocial: true },
      orderBy: { razaoSocial: 'asc' },
    })

    const resultados: Array<{ documento: string; razaoSocial: string; sucesso: boolean; erro?: string }> = []

    for (const c of clientes) {
      try {
        await this.sincronizar(c.documento, competencia, { clienteId: c.id, userId })
        resultados.push({ documento: c.documento, razaoSocial: c.razaoSocial, sucesso: true })
      } catch (e) {
        resultados.push({ documento: c.documento, razaoSocial: c.razaoSocial, sucesso: false, erro: (e as Error).message })
      }
      // Delay entre consultas
      await new Promise(r => setTimeout(r, 3000))
    }

    return resultados
  }

  // ── Atualizar campos manuais ─────────────────────────

  async atualizarManual(id: string, dados: {
    esocialFechado?: boolean; reinfFechado?: boolean;
    darfEmitido?: boolean; darfPago?: boolean; valorDarf?: number;
    dataPagamento?: string; dataVencimento?: string;
  }, userId?: string) {
    await this.ensureTable()
    const sets: string[] = ['updated_at = NOW()']
    const params: unknown[] = [id]
    let idx = 2

    if (dados.esocialFechado !== undefined) { sets.push(`esocial_fechado = $${idx}`); params.push(dados.esocialFechado); idx++ }
    if (dados.reinfFechado !== undefined) { sets.push(`reinf_fechado = $${idx}`); params.push(dados.reinfFechado); idx++ }
    if (dados.darfEmitido !== undefined) { sets.push(`darf_emitido = $${idx}`); params.push(dados.darfEmitido); idx++ }
    if (dados.darfPago !== undefined) { sets.push(`darf_pago = $${idx}`); params.push(dados.darfPago); idx++ }
    if (dados.valorDarf !== undefined) { sets.push(`valor_darf = $${idx}`); params.push(dados.valorDarf); idx++ }
    if (dados.dataPagamento) { sets.push(`data_pagamento = $${idx}::timestamptz`); params.push(dados.dataPagamento); idx++ }
    if (dados.dataVencimento) { sets.push(`data_vencimento = $${idx}::date`); params.push(dados.dataVencimento); idx++ }

    // Recalcular divergência
    if (dados.valorDarf !== undefined) {
      sets.push(`divergente = CASE WHEN valor_debito_api IS NOT NULL AND valor_debito_api != $${idx} THEN true ELSE false END`)
      params.push(dados.valorDarf); idx++
    }

    // Recalcular status_processo
    if (dados.darfPago !== undefined && dados.darfPago) {
      sets.push(`status_processo = 'concluido'`)
      sets.push(`nivel_alerta = 'verde'`)
    }

    await prisma.$executeRawUnsafe(`UPDATE obrigacoes_dctfweb SET ${sets.join(', ')} WHERE id = $1`, ...params)

    // Log
    const row = await prisma.$queryRawUnsafe<Array<{ documento: string; competencia: string }>>(
      `SELECT documento, competencia FROM obrigacoes_dctfweb WHERE id = $1`, id,
    )
    if (row[0]) {
      await this.registrarLog(row[0].documento, row[0].competencia, 'ATUALIZACAO_MANUAL', JSON.stringify(dados), userId)
    }

    return { sucesso: true }
  }

  // ── Listagem ─────────────────────────────────────────

  async list(input: { page: number; limit: number; search?: string; competencia?: string; statusProcesso?: string; nivelAlerta?: string; statusPosEntrega?: string; sortBy?: string; sortDir?: string }) {
    await this.ensureTable()
    const { page, limit, search, competencia, statusProcesso, nivelAlerta, statusPosEntrega, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (competencia) { conditions.push(`competencia = $${idx}`); params.push(competencia); idx++ }
    if (statusProcesso) { conditions.push(`status_processo = $${idx}`); params.push(statusProcesso); idx++ }
    if (nivelAlerta) { conditions.push(`nivel_alerta = $${idx}`); params.push(nivelAlerta); idx++ }
    if (statusPosEntrega === 'retificadora_pendente') { conditions.push(`retificadora_pendente = true`); }
    else if (statusPosEntrega && statusPosEntrega !== '') { conditions.push(`status_pos_entrega = $${idx}`); params.push(statusPosEntrega); idx++ }
    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderCol = sortBy === 'razaoSocial' ? 'razao_social' : sortBy === 'competencia' ? 'competencia' : sortBy === 'status' ? 'status_processo' : sortBy === 'alerta' ? 'nivel_alerta' : 'razao_social'
    const orderDir = sortDir === 'desc' ? 'DESC' : 'ASC'

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM obrigacoes_dctfweb ${where}`, ...params,
    )

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM obrigacoes_dctfweb ${where} ORDER BY ${orderCol} ${orderDir} NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, take, skip,
    )

    return buildPaginatedResponse(rows.map(r => this.formatRow(r)), countRows[0]?.total || 0, page, limit)
  }

  // ── Totalizadores ────────────────────────────────────

  async totalizadores(competencia?: string) {
    await this.ensureTable()
    const compFilter = competencia ? `WHERE competencia = $1` : ''
    const params = competencia ? [competencia] : []

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status_processo = 'aguardando_fechamento')::int as aguardando_fechamento,
        COUNT(*) FILTER (WHERE status_processo = 'pronto_envio')::int as pronto_envio,
        COUNT(*) FILTER (WHERE status_processo = 'aguardando_pagamento')::int as aguardando_pagamento,
        COUNT(*) FILTER (WHERE status_processo = 'concluido')::int as concluido,
        COUNT(*) FILTER (WHERE nivel_alerta = 'vermelho')::int as alertas_criticos,
        COUNT(*) FILTER (WHERE nivel_alerta = 'amarelo')::int as alertas_atencao,
        COUNT(*) FILTER (WHERE divergente = true)::int as divergentes,
        COUNT(*) FILTER (WHERE retificadora_pendente = true)::int as retificadoras,
        COALESCE(SUM(valor_debito_api), 0)::numeric as total_debitos
      FROM obrigacoes_dctfweb ${compFilter}
    `, ...params)

    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      aguardandoFechamento: Number(r.aguardando_fechamento ?? 0),
      prontoEnvio: Number(r.pronto_envio ?? 0),
      aguardandoPagamento: Number(r.aguardando_pagamento ?? 0),
      concluido: Number(r.concluido ?? 0),
      alertasCriticos: Number(r.alertas_criticos ?? 0),
      alertasAtencao: Number(r.alertas_atencao ?? 0),
      divergentes: Number(r.divergentes ?? 0),
      retificadoras: Number(r.retificadoras ?? 0),
      totalDebitos: Number(r.total_debitos ?? 0),
    }
  }

  // ── Histórico de logs ────────────────────────────────

  async listarLogs(documento?: string, competencia?: string, limit = 50) {
    await this.ensureTable()
    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (documento) { conditions.push(`documento = $${idx}`); params.push(documento.replace(/\D/g, '')); idx++ }
    if (competencia) { conditions.push(`competencia = $${idx}`); params.push(competencia); idx++ }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM log_dctfweb ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      ...params, limit,
    )
  }

  // ── Helpers ──────────────────────────────────────────

  private async registrarLog(documento: string, competencia: string, acao: string, detalhe: string, userId?: string, clienteId?: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO log_dctfweb (id, cliente_id, documento, competencia, acao, detalhe, user_id)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
      clienteId || null, documento, competencia, acao, detalhe, userId || null,
    )
  }

  private formatRow(r: Record<string, unknown>) {
    return {
      id: r.id as string,
      clienteId: r.cliente_id as string | null,
      documento: r.documento as string,
      razaoSocial: r.razao_social as string | null,
      competencia: r.competencia as string,
      esocialFechado: r.esocial_fechado as boolean,
      reinfFechado: r.reinf_fechado as boolean,
      statusDctfweb: r.status_dctfweb as string | null,
      valorDebitoApi: r.valor_debito_api ? Number(r.valor_debito_api) : null,
      situacaoFiscal: r.situacao_fiscal as string | null,
      idApuracao: r.id_apuracao as number | null,
      textoSituacao: r.texto_situacao as string | null,
      statusProcesso: r.status_processo as string,
      statusProcessoLabel: STATUS_PROCESSO[r.status_processo as string] || r.status_processo as string,
      divergente: r.divergente as boolean,
      darfEmitido: r.darf_emitido as boolean,
      darfPago: r.darf_pago as boolean,
      valorDarf: r.valor_darf ? Number(r.valor_darf) : null,
      dataConsultaApi: r.data_consulta_api instanceof Date ? r.data_consulta_api.toISOString() : r.data_consulta_api ? String(r.data_consulta_api) : null,
      dataTransmissao: r.data_transmissao instanceof Date ? r.data_transmissao.toISOString() : r.data_transmissao ? String(r.data_transmissao) : null,
      dataPagamento: r.data_pagamento instanceof Date ? r.data_pagamento.toISOString() : r.data_pagamento ? String(r.data_pagamento) : null,
      dataEncerramento: r.data_encerramento as string | null,
      nivelAlerta: r.nivel_alerta as string,
      nivelAlertaLabel: NIVEL_ALERTA_LABELS[r.nivel_alerta as string] || r.nivel_alerta as string,
      retificadoraPendente: (r.retificadora_pendente ?? false) as boolean,
      motivoRetificadora: r.motivo_retificadora as string | null,
      statusPosEntrega: (r.status_pos_entrega || 'sem_alteracao') as string,
      dataUltimaEntrega: r.data_ultima_entrega instanceof Date ? r.data_ultima_entrega.toISOString() : r.data_ultima_entrega ? String(r.data_ultima_entrega) : null,
      dataUltimoFechamentoEsocial: r.data_ultimo_fechamento_esocial instanceof Date ? r.data_ultimo_fechamento_esocial.toISOString() : r.data_ultimo_fechamento_esocial ? String(r.data_ultimo_fechamento_esocial) : null,
      dataUltimoFechamentoReinf: r.data_ultimo_fechamento_reinf instanceof Date ? r.data_ultimo_fechamento_reinf.toISOString() : r.data_ultimo_fechamento_reinf ? String(r.data_ultimo_fechamento_reinf) : null,
      dataUltimaAtualizacaoMit: r.data_ultima_atualizacao_mit instanceof Date ? r.data_ultima_atualizacao_mit.toISOString() : r.data_ultima_atualizacao_mit ? String(r.data_ultima_atualizacao_mit) : null,
      dataVencimento: r.data_vencimento instanceof Date ? r.data_vencimento.toISOString() : r.data_vencimento ? String(r.data_vencimento) : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || ''),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at || ''),
    }
  }

  // ── Pós-entrega: atualizar datas de fechamento ─────

  async atualizarFechamento(id: string, dados: {
    dataUltimoFechamentoEsocial?: string
    dataUltimoFechamentoReinf?: string
    dataUltimaAtualizacaoMit?: string
  }, userId?: string) {
    await this.ensureTable()
    const sets: string[] = ['updated_at = NOW()']
    const params: unknown[] = [id]
    let idx = 2

    if (dados.dataUltimoFechamentoEsocial) { sets.push(`data_ultimo_fechamento_esocial = $${idx}::timestamptz`); params.push(dados.dataUltimoFechamentoEsocial); idx++ }
    if (dados.dataUltimoFechamentoReinf) { sets.push(`data_ultimo_fechamento_reinf = $${idx}::timestamptz`); params.push(dados.dataUltimoFechamentoReinf); idx++ }
    if (dados.dataUltimaAtualizacaoMit) { sets.push(`data_ultima_atualizacao_mit = $${idx}::timestamptz`); params.push(dados.dataUltimaAtualizacaoMit); idx++ }

    await prisma.$executeRawUnsafe(`UPDATE obrigacoes_dctfweb SET ${sets.join(', ')} WHERE id = $1`, ...params)

    // Re-avaliar diagnóstico
    const row = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM obrigacoes_dctfweb WHERE id = $1`, id,
    )
    if (row[0]) {
      const r = row[0]
      const diagnostico = avaliarPosEntrega({
        dataUltimaEntrega: r.data_ultima_entrega as Date | null,
        dataUltimoFechamentoEsocial: r.data_ultimo_fechamento_esocial as Date | null,
        dataUltimoFechamentoReinf: r.data_ultimo_fechamento_reinf as Date | null,
        dataUltimaAtualizacaoMit: r.data_ultima_atualizacao_mit as Date | null,
        statusDctfweb: r.status_dctfweb as string | null,
        situacaoApi: r.id_apuracao ? 3 : null,
      })
      await aplicarDiagnosticoPosEntrega(id, diagnostico, r.documento as string, r.competencia as string, r.cliente_id as string | null, userId)
    }

    return { sucesso: true }
  }

  async marcarRetificadoraOk(id: string, userId?: string) {
    const row = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT documento, competencia, cliente_id FROM obrigacoes_dctfweb WHERE id = $1`, id,
    )
    if (!row[0]) throw new Error('Registro não encontrado')
    await marcarRetificadoraTransmitida(id, new Date(), row[0].documento as string, row[0].competencia as string, row[0].cliente_id as string | null, userId)
    return { sucesso: true }
  }

  async listarClientesMensais() {
    return prisma.cliente.findMany({
      where: { deletedAt: null, situacao: 'MENSAL' },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }
}
