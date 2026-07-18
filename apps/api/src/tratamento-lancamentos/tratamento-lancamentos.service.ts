import { Injectable } from '@nestjs/common'
import { buildPaginatedResponse, getPrismaSkipTake, scoped, prisma, Prisma } from '@saas/db'
import {
  EMPTY_TREATMENT_DEFINITION,
  type CreateTreatmentModelInput,
  type UpdateTreatmentModelInput,
  type ListTreatmentModelInput,
  type TreatmentDefinition,
  type PreviewArquivoInput,
  type ConvertInput,
  type DebugExtractInput,
  stableStringify,
} from '@saas/types'
import { readFileSync } from 'node:fs'
import { extractTabela, configurePdf, type ExtractedTable } from '@saas/extracao'
import { applyModel, type TraceRow } from './lib/apply-model'
import { parseData } from './lib/parsers'

// Configura o motor de PDF (PDFium/WASM) UMA vez, no boot. No Node lemos o binário
// do pacote @embedpdf/pdfium; no browser é o app web que configura via URL servida.
// A API é empacotada por WEBPACK, que reescreve `require.resolve` (devolveria um id
// interno, não o caminho do arquivo) — por isso usamos `__non_webpack_require__`, o
// require REAL de runtime, resolvendo o .wasm do node_modules (o pacote é external).
// Fora do webpack (tsx/testes) cai no `require` normal. Falha aqui não derruba o boot.
declare const __non_webpack_require__: NodeRequire
try {
  const req: NodeRequire = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require
  configurePdf({ wasmBinary: readFileSync(req.resolve('@embedpdf/pdfium/pdfium.wasm')) })
} catch {
  /* wasm indisponível no boot — extração de PDF falhará com erro claro sob demanda */
}

/**
 * Teto de linhas devolvidas no preview (limita payload). Além de alimentar o
 * wizard, o cliente CARREGA essas linhas e as reenvia no `convert` (reuso da
 * extração — ver `convert`). Por isso o teto precisa cobrir os arquivos reais
 * (ex.: extrato Mercado Pago, ~15k linhas); acima dele o cliente marca
 * `truncated` e o `convert` re-extrai no servidor (correção preservada).
 */
const PREVIEW_MAX_ROWS = 50000
/** Teto de linhas no visualizador de debug (limita payload; é ferramenta interna). */
const DEBUG_MAX_ROWS = 5000
/** Teto do traço "Dados processados" devolvido pelo convert (limita payload). */
const CONVERT_TRACE_MAX = 5000

// Traço enxuto para a aba "Dados processados" (sem os campos "parsed").
type ConvertTraceRow = Pick<TraceRow, 'linha' | 'data' | 'valor' | 'descricao' | 'participante' | 'numeroNf' | 'documento' | 'direcao' | 'contaContrapartida' | 'contaCorrente' | 'status'>
function projectTrace(t: TraceRow): ConvertTraceRow {
  return {
    linha: t.linha, data: t.data, valor: t.valor, descricao: t.descricao,
    participante: t.participante, numeroNf: t.numeroNf, documento: t.documento,
    direcao: t.direcao, contaContrapartida: t.contaContrapartida,
    contaCorrente: t.contaCorrente, status: t.status,
  }
}

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.TreatmentModelWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

/** Garante que a linha pertence à empresa do usuário (master ignora o filtro). */
function assertScope(empresaIdRow: string | null, isMaster?: boolean, empresaId?: string) {
  if (!isMaster && empresaId && empresaIdRow !== empresaId) throw new Error('Acesso negado.')
}

/**
 * Resolve authorIds → {name, image}. Users vivem no schema `public` (Better Auth),
 * acessados pelo `prisma` global (não pelo `scoped`/tenant). authorId é id solto
 * (sem FK), então usuários removidos simplesmente não aparecem no mapa.
 */
async function resolveAuthors(ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  const map = new Map<string, { name: string; image: string | null }>()
  if (!unique.length) return map
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, image: true },
  })
  for (const u of users) map.set(u.id, { name: u.name, image: u.image })
  return map
}

/**
 * Valor de exibição da conta corrente do modelo (coluna denormalizada usada na
 * listagem/busca). UNICA → o número; MULTIPLAS → rótulo "Múltiplas contas".
 */
function ccDisplay(def: TreatmentDefinition): string | null {
  const cc = def.contasCorrentes
  if (cc.modo === 'MULTIPLAS') return 'Múltiplas contas'
  return cc.unica.trim() || null
}

@Injectable()
export class TratamentoLancamentosService {
  async list(input: ListTreatmentModelInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, clienteId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.TreatmentModelWhereInput = {
        deletedAt: null,
        ...empresaFilter(isMaster, empresaId),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(clienteId ? { clienteId } : {}),
        ...(search
          ? {
              OR: [
                { nome: { contains: search, mode: 'insensitive' as const } },
                { contaCorrente: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      }

      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'desc' as const }

      const [data, total] = await Promise.all([
        db.treatmentModel.findMany({ where, orderBy, skip, take }),
        db.treatmentModel.count({ where }),
      ])

      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async listTrash(input: ListTreatmentModelInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.TreatmentModelWhereInput = {
        deletedAt: { not: null },
        ...empresaFilter(isMaster, empresaId),
      }
      const [data, total] = await Promise.all([
        db.treatmentModel.findMany({ where, orderBy: { deletedAt: 'desc' }, skip, take }),
        db.treatmentModel.count({ where }),
      ])
      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const model = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      assertScope(model.empresaId, isMaster, empresaId)
      const currentVersion = model.currentVersionId
        ? await db.treatmentModelVersion.findUnique({ where: { id: model.currentVersionId } })
        : null
      return {
        ...model,
        definition: (currentVersion?.definition ?? null) as TreatmentDefinition | null,
        currentVersionNumber: currentVersion?.versionNumber ?? null,
      }
    })
  }

  async create(input: CreateTreatmentModelInput, userId?: string, _isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    const definition: TreatmentDefinition = input.definition ?? EMPTY_TREATMENT_DEFINITION
    const contaCorrente = ccDisplay(definition)

    return scoped(tenantSchema, async (db) => {
      const model = await db.treatmentModel.create({
        data: {
          nome: input.nome,
          contaCorrente,
          clienteId: input.clienteId || null,
          empresaId: empresaId || null,
          isActive: input.isActive ?? true,
          version: 1,
        },
      })

      const version = await db.treatmentModelVersion.create({
        data: {
          modelId: model.id,
          versionNumber: 1,
          definition: definition as unknown as Prisma.InputJsonValue,
          authorId: userId || null,
          note: input.note || null,
        },
      })

      return db.treatmentModel.update({
        where: { id: model.id },
        data: { currentVersionId: version.id },
      })
    })
  }

  async update(id: string, input: UpdateTreatmentModelInput, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      assertScope(existing.empresaId, isMaster, empresaId)

      const data: Prisma.TreatmentModelUpdateInput = {}
      let versionCreated = false
      if (input.nome !== undefined) data.nome = input.nome
      if (input.clienteId !== undefined) data.clienteId = input.clienteId || null
      if (input.isActive !== undefined) data.isActive = input.isActive

      // Nova versão apenas quando a definição muda DE FATO — evita versões
      // idênticas em edições que só alteram metadados (nome/ativo) ou nada.
      if (input.definition !== undefined) {
        const current = existing.currentVersionId
          ? await db.treatmentModelVersion.findUnique({ where: { id: existing.currentVersionId } })
          : null
        const mudou = !current || stableStringify(current.definition) !== stableStringify(input.definition)
        versionCreated = mudou
        if (mudou) {
          const newVersionNumber = existing.version + 1
          const version = await db.treatmentModelVersion.create({
            data: {
              modelId: id,
              versionNumber: newVersionNumber,
              definition: input.definition as unknown as Prisma.InputJsonValue,
              authorId: userId || null,
              note: input.note || null,
            },
          })
          data.version = newVersionNumber
          data.currentVersionId = version.id
        }
        // Mantém a conta corrente do modelo (display) em sincronia com a definição.
        data.contaCorrente = ccDisplay(input.definition)
      }

      const updated = await db.treatmentModel.update({ where: { id }, data })
      return { ...updated, versionCreated }
    })
  }

  async remove(id: string, _userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      assertScope(existing.empresaId, isMaster, empresaId)
      return db.treatmentModel.update({ where: { id }, data: { deletedAt: new Date() } })
    })
  }

  async restore(id: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      assertScope(existing.empresaId, isMaster, empresaId)
      return db.treatmentModel.update({ where: { id }, data: { deletedAt: null } })
    })
  }

  /** Cria um novo Modelo a partir de um existente (copia a definição da versão atual). */
  async duplicate(id: string, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const src = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      assertScope(src.empresaId, isMaster, empresaId)

      const currentVersion = src.currentVersionId
        ? await db.treatmentModelVersion.findUnique({ where: { id: src.currentVersionId } })
        : null
      const definition = (currentVersion?.definition ?? EMPTY_TREATMENT_DEFINITION) as unknown as Prisma.InputJsonValue

      const model = await db.treatmentModel.create({
        data: {
          nome: `${src.nome} (cópia)`,
          contaCorrente: src.contaCorrente,
          clienteId: src.clienteId,
          empresaId: src.empresaId,
          isActive: src.isActive,
          version: 1,
        },
      })
      const version = await db.treatmentModelVersion.create({
        data: { modelId: model.id, versionNumber: 1, definition, authorId: userId || null, note: `Duplicado de "${src.nome}"` },
      })
      return db.treatmentModel.update({ where: { id: model.id }, data: { currentVersionId: version.id } })
    })
  }

  async getVersions(id: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const model = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      assertScope(model.empresaId, isMaster, empresaId)
      const versions = await db.treatmentModelVersion.findMany({
        where: { modelId: id },
        orderBy: { versionNumber: 'desc' },
        select: { id: true, versionNumber: true, note: true, authorId: true, createdAt: true },
      })
      const authors = await resolveAuthors(versions.map((v) => v.authorId))
      // A versão atual é sempre a de maior número (toda nova versão = version+1).
      return versions.map((v) => ({
        ...v,
        isCurrent: v.id === model.currentVersionId,
        authorName: v.authorId ? authors.get(v.authorId)?.name ?? null : null,
        authorImage: v.authorId ? authors.get(v.authorId)?.image ?? null : null,
      }))
    })
  }

  /**
   * Devolve uma versão específica COM a definição completa (snapshot JSON) —
   * usado pelo visualizador de histórico/diff para comparar duas versões.
   */
  async getVersion(versionId: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const version = await db.treatmentModelVersion.findUniqueOrThrow({ where: { id: versionId } })
      const model = await db.treatmentModel.findUniqueOrThrow({ where: { id: version.modelId } })
      assertScope(model.empresaId, isMaster, empresaId)
      const authors = await resolveAuthors([version.authorId])
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        note: version.note,
        authorId: version.authorId,
        authorName: version.authorId ? authors.get(version.authorId)?.name ?? null : null,
        authorImage: version.authorId ? authors.get(version.authorId)?.image ?? null : null,
        createdAt: version.createdAt,
        definition: version.definition as unknown as TreatmentDefinition,
      }
    })
  }

  /**
   * Restaura uma versão anterior: cria uma NOVA versão a partir do snapshot da
   * versão escolhida (não reescreve o histórico) e a torna a versão atual.
   */
  async restoreVersion(versionId: string, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const src = await db.treatmentModelVersion.findUniqueOrThrow({ where: { id: versionId } })
      const model = await db.treatmentModel.findUniqueOrThrow({ where: { id: src.modelId } })
      assertScope(model.empresaId, isMaster, empresaId)

      const definition = (src.definition ?? EMPTY_TREATMENT_DEFINITION) as unknown as TreatmentDefinition
      const newVersionNumber = model.version + 1
      const version = await db.treatmentModelVersion.create({
        data: {
          modelId: model.id,
          versionNumber: newVersionNumber,
          definition: definition as unknown as Prisma.InputJsonValue,
          authorId: userId || null,
          note: `Restaurado da versão ${src.versionNumber}`,
        },
      })
      return db.treatmentModel.update({
        where: { id: model.id },
        data: {
          version: newVersionNumber,
          currentVersionId: version.id,
          // Mantém a conta corrente do modelo (display) em sincronia com a definição restaurada.
          contaCorrente: ccDisplay(definition),
        },
      })
    })
  }

  /**
   * Extrai a tabela de um arquivo-exemplo (base64) para o wizard montar o
   * de/para e os SELECT DISTINCT. Operação pura (sem banco/tenant).
   */
  async preview(input: PreviewArquivoInput) {
    const buffer = Buffer.from(input.fileBase64, 'base64')
    const t = await extractTabela({ buffer, filename: input.filename })
    return {
      headers: t.headers,
      rows: t.rows.slice(0, PREVIEW_MAX_ROWS),
      totalRows: t.meta.totalDataRows,
      truncated: t.meta.totalDataRows > PREVIEW_MAX_ROWS,
      meta: t.meta,
    }
  }

  /**
   * Converte um arquivo de lançamentos aplicando um Modelo → conteúdo SCI
   * (base64, ANSI/latin1) ou lista de pendências quando algo não pôde ser
   * interpretado. "Exportação para o SCI".
   */
  async convert(input: ConvertInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    // Reuso da extração: o preview (pós-upload) já extraiu a tabela e o cliente a
    // carrega de volta aqui → aplica o modelo SEM re-extrair. Só re-extrai no
    // fallback (tabela não carregada: arquivo acima do teto do preview, ou fluxo
    // que não passou pelo preview). `applyModel` consome apenas `rows`; `meta` é
    // reconstruída de forma inerte só para satisfazer o tipo `ExtractedTable`.
    const table: ExtractedTable = input.table
      ? {
          headers: input.table.headers,
          rows: input.table.rows,
          meta: {
            sheetName: '', headerRowIndex: 0, bodyStartIndex: 0,
            bodyEndIndex: input.table.rows.length, totalDataRows: input.table.rows.length,
            mode: 'single',
          },
        }
      : await extractTabela({ buffer: Buffer.from(input.fileBase64 ?? '', 'base64'), filename: input.filename })

    const model = await scoped(tenantSchema, async (db) => {
      const m = await db.treatmentModel.findUniqueOrThrow({ where: { id: input.modelId } })
      assertScope(m.empresaId, isMaster, empresaId)
      const cv = m.currentVersionId
        ? await db.treatmentModelVersion.findUnique({ where: { id: m.currentVersionId } })
        : null
      return { nome: m.nome, definition: (cv?.definition ?? null) as TreatmentDefinition | null }
    })

    const def = model.definition ?? EMPTY_TREATMENT_DEFINITION
    // Colunas opcionais do De/Para que o modelo mapeou → a aba "Dados processados"
    // mostra uma coluna para cada uma (mesmo que o valor venha vazio em algumas linhas).
    const colunasOpcionais = {
      participante: !!def.columnMapping.participante,
      numeroNf: !!def.columnMapping.numeroNf,
      documento: !!def.columnMapping.documento,
    }

    // Datas "dd/mm" sem ano (ex.: Sicoob): sem a competência informada, avisa o
    // front para pedir o ano (popup) e reenviar — não gera o arquivo ainda.
    const dataCol = def.columnMapping.data
    const precisaAno = !input.competenciaAno && !!dataCol && table.rows.some((r) => parseData(r[dataCol]).semAno)
    if (precisaAno) {
      return { needsCompetenciaAno: true, totalLancamentos: 0, pendencias: [], fileBase64: null, fileName: '', trace: [] as ConvertTraceRow[], traceTotal: 0, okTotal: 0, colunasOpcionais }
    }

    // Coleta o traço por-linha (como o modelo interpretou cada lançamento) para a
    // aba "Dados processados". Projeta só os campos exibidos (sem os "parsed").
    const trace: TraceRow[] = []
    const result = applyModel(table, def, input.competenciaAno, trace)
    const safe = model.nome.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'lancamentos'
    return {
      needsCompetenciaAno: false,
      totalLancamentos: result.totalLancamentos,
      pendencias: result.pendencias,
      // .txt em ANSI (latin1); null quando há pendências.
      fileBase64: result.sciText !== null ? Buffer.from(result.sciText, 'latin1').toString('base64') : null,
      fileName: `SCI_${safe}.txt`,
      trace: trace.slice(0, CONVERT_TRACE_MAX).map(projectTrace),
      traceTotal: trace.length,
      // Total de linhas OK sobre TODO o traço (não só o fatiado) → contagem exata.
      okTotal: trace.reduce((n, t) => (t.status === 'ok' ? n + 1 : n), 0),
      colunasOpcionais,
    }
  }

  /**
   * Visualizador de DEBUG (escondido, via ?debug=1): extrai a tabela crua e, se
   * um modelo for informado, também aplica o modelo com traço por-linha (como
   * cada lançamento foi mapeado no de/para, e o que foi pulado/ignorado/pendente).
   * Ferramenta de diagnóstico — não altera o fluxo de geração.
   */
  async debugExtract(input: DebugExtractInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const buffer = Buffer.from(input.fileBase64, 'base64')
    const table = await extractTabela({ buffer, filename: input.filename })

    const base = {
      headers: table.headers,
      rows: table.rows.slice(0, DEBUG_MAX_ROWS),
      totalRows: table.meta.totalDataRows,
      truncated: table.meta.totalDataRows > DEBUG_MAX_ROWS,
      meta: table.meta,
    }

    // Sem modelo → só a tabela crua (view 1). Com modelo → também de/para + traço.
    if (!input.modelId) {
      return { ...base, modelNome: null, columnMapping: null, trace: [] as TraceRow[], pendencias: [], totalLancamentos: table.rows.length }
    }

    const modelId = input.modelId
    const model = await scoped(tenantSchema, async (db) => {
      const m = await db.treatmentModel.findUniqueOrThrow({ where: { id: modelId } })
      assertScope(m.empresaId, isMaster, empresaId)
      const cv = m.currentVersionId
        ? await db.treatmentModelVersion.findUnique({ where: { id: m.currentVersionId } })
        : null
      return { nome: m.nome, definition: (cv?.definition ?? null) as TreatmentDefinition | null }
    })
    const def = model.definition ?? EMPTY_TREATMENT_DEFINITION
    const trace: TraceRow[] = []
    const result = applyModel(table, def, input.competenciaAno, trace)

    return {
      ...base,
      modelNome: model.nome,
      columnMapping: def.columnMapping,
      trace: trace.slice(0, DEBUG_MAX_ROWS),
      pendencias: result.pendencias,
      totalLancamentos: result.totalLancamentos,
    }
  }

  async listForSelect(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.treatmentModel.findMany({
        where: { isActive: true, deletedAt: null, ...empresaFilter(isMaster, empresaId) },
        select: { id: true, nome: true, code: true, contaCorrente: true, clienteId: true },
        orderBy: { nome: 'asc' },
      }),
    )
  }
}
