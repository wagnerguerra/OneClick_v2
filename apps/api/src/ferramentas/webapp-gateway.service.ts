import { Injectable } from '@nestjs/common'
import { TOOL_AREA, type JobToolId, type ToolArea } from '@saas/types/ferramentas'

// ─────────────────────────────────────────────────────────────────────────────
// Gateway server-to-server para a API Fastify do webapp (porta 8000, /api/v1).
// O browser nunca fala com o webapp: o OneClick proxia upload/status/download.
// Config-driven por ferramenta (TOOL_ADAPTERS). Ver docs/plano-ferramentas.md §3.3.
// ─────────────────────────────────────────────────────────────────────────────

const API_PREFIX = '/api/v1'
const DEFAULT_WEBAPP_URL = 'http://192.168.0.47:8000'

/** Configuração por ferramenta job-based. `basePath` é a base de create/status/download. */
export interface ToolAdapter {
  /** Bloco/menu + slug RBAC (`ferramentas-<area>`). Deriva de TOOL_AREA (fonte única). */
  area: ToolArea
  /** Base relativa a /api/v1. NFe usa a rota genérica `/jobs`; as demais `/tools/<id>/jobs`. */
  basePath: string
  /** Limite de upload aplicado pelo webapp (MAX_UPLOAD_MB=50 / MAX_UPLOAD_NFSE_MB=300). */
  uploadLimitMb: 50 | 300
  /** Rota de pré-passo (relativa a /api/v1), quando a ferramenta tem inspeção. */
  inspectPath?: string
  /** Fluxo de criação: `single` (1 POST) ou `multi-step` (init → chunk → start). */
  flow?: 'single' | 'multi-step'
}

/** Mapa autoritativo das 8 ferramentas job-based. Single source de rota/área/limite. */
export const TOOL_ADAPTERS: Record<JobToolId, ToolAdapter> = {
  nfe: { area: TOOL_AREA.nfe, basePath: '/jobs', uploadLimitMb: 50 },
  sped: {
    area: TOOL_AREA.sped,
    basePath: '/tools/sped/jobs',
    uploadLimitMb: 50,
    inspectPath: '/tools/sped/inspect',
  },
  'sped-merge': {
    area: TOOL_AREA['sped-merge'],
    basePath: '/tools/sped-merge/jobs',
    uploadLimitMb: 50,
    inspectPath: '/tools/sped-merge/inspect-xlsx',
  },
  'sci-consolidado': {
    area: TOOL_AREA['sci-consolidado'],
    basePath: '/tools/sci-consolidado/jobs',
    uploadLimitMb: 50,
  },
  'comparacao-planilhas': {
    area: TOOL_AREA['comparacao-planilhas'],
    basePath: '/tools/comparacao-planilhas/jobs',
    uploadLimitMb: 50,
  },
  'comparacao-nfse': {
    area: TOOL_AREA['comparacao-nfse'],
    basePath: '/tools/comparacao-nfse/jobs',
    uploadLimitMb: 300,
    flow: 'multi-step',
  },
  'sci-portal-nacional': {
    area: TOOL_AREA['sci-portal-nacional'],
    basePath: '/tools/sci-portal-nacional/jobs',
    uploadLimitMb: 50,
  },
  gnre: { area: TOOL_AREA.gnre, basePath: '/tools/gnre/jobs', uploadLimitMb: 300 },
}

/** Arquivo a enviar no multipart (campo + nome + conteúdo). */
export interface GatewayUploadFile {
  field: string
  filename: string
  content: Buffer | Uint8Array
  contentType?: string
}

/** Resposta de criação de job do webapp (HTTP 202). */
export interface WebappCreateJobResponse {
  id: string
  status: string
}

/** Resposta de status do webapp (`GET …/jobs/:id`). */
export interface WebappJobStatus {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'not_found'
  progress?: number
  error?: string
  downloadToken?: string
  fileName?: string
}

@Injectable()
export class WebappGatewayService {
  private readonly baseUrl: string

  constructor() {
    // Padrão do projeto: lê env direto (sem ConfigService), com default p/ a intranet.
    this.baseUrl = (process.env.WEBAPP_API_URL ?? DEFAULT_WEBAPP_URL).replace(/\/+$/, '')
  }

  private adapter(tool: JobToolId): ToolAdapter {
    return TOOL_ADAPTERS[tool]
  }

  /** Monta a URL absoluta: `${WEBAPP}/api/v1${basePath}${suffix}`. */
  private url(tool: JobToolId, suffix = ''): string {
    return `${this.baseUrl}${API_PREFIX}${this.adapter(tool).basePath}${suffix}`
  }

  /** Cria um job no webapp (upload multipart). Campos opcionais (ex.: sheets/presentRegs) verbatim. */
  async createJob(
    tool: JobToolId,
    files: GatewayUploadFile[],
    fields: Record<string, string> = {},
  ): Promise<WebappCreateJobResponse> {
    if (this.adapter(tool).flow === 'multi-step') {
      return this.createJobMultiStep(tool, files)
    }
    const res = await fetch(this.url(tool), { method: 'POST', body: this.buildForm(files, fields) })
    return this.parseJson<WebappCreateJobResponse>(res, `criar job ${tool}`)
  }

  /** Fluxo multi-step (ex.: comparacao-nfse): init → chunk(s) → start. */
  private async createJobMultiStep(tool: JobToolId, files: GatewayUploadFile[]): Promise<WebappCreateJobResponse> {
    // 1) init — cria o job no webapp (corpo vazio).
    const initRes = await fetch(this.url(tool), { method: 'POST' })
    const init = await this.parseJson<{ id: string }>(initRes, `init ${tool}`)

    // 2) chunk — envia os arquivos (um único lote).
    const chunkRes = await fetch(this.url(tool, `/${encodeURIComponent(init.id)}/chunk`), {
      method: 'POST',
      body: this.buildForm(files),
    })
    await this.parseJson(chunkRes, `chunk ${tool}`)

    // 3) start — enfileira o processamento.
    const startRes = await fetch(this.url(tool, `/${encodeURIComponent(init.id)}/start`), { method: 'POST' })
    const started = await this.parseJson<{ id?: string; status?: string }>(startRes, `start ${tool}`)
    return { id: started.id ?? init.id, status: started.status ?? 'queued' }
  }

  private buildForm(files: GatewayUploadFile[], fields: Record<string, string> = {}): FormData {
    const form = new FormData()
    for (const f of files) {
      const blob = new Blob([f.content], { type: f.contentType ?? 'application/octet-stream' })
      form.append(f.field, blob, f.filename)
    }
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return form
  }

  /** Consulta o status de um job. Quando `done`, traz `downloadToken` + `fileName`. */
  async getStatus(tool: JobToolId, webappJobId: string): Promise<WebappJobStatus> {
    const res = await fetch(this.url(tool, `/${encodeURIComponent(webappJobId)}`), { method: 'GET' })
    return this.parseJson<WebappJobStatus>(res, `status do job ${tool}`)
  }

  /** URL de download da ferramenta com o token JWT (curto, exp 15min) na query. */
  downloadUrl(tool: JobToolId, webappJobId: string, token: string): string {
    return this.url(
      tool,
      `/${encodeURIComponent(webappJobId)}/download?token=${encodeURIComponent(token)}`,
    )
  }

  /** Busca o arquivo no webapp e devolve a Response (stream) para o controller repassar ao browser. */
  async streamDownload(tool: JobToolId, webappJobId: string, token: string): Promise<Response> {
    const res = await fetch(this.downloadUrl(tool, webappJobId, token), { method: 'GET' })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`webapp download ${tool} falhou: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    return res
  }

  /** Pré-passo de inspeção (ex.: SPED `/inspect` → REGs presentes). Lança se a tool não tiver inspeção. */
  async inspect(tool: JobToolId, files: GatewayUploadFile[]): Promise<unknown> {
    const { inspectPath } = this.adapter(tool)
    if (!inspectPath) throw new Error(`Ferramenta ${tool} não tem pré-passo de inspeção.`)
    const form = new FormData()
    for (const f of files) {
      const blob = new Blob([f.content], { type: f.contentType ?? 'application/octet-stream' })
      form.append(f.field, blob, f.filename)
    }
    const res = await fetch(`${this.baseUrl}${API_PREFIX}${inspectPath}`, { method: 'POST', body: form })
    return this.parseJson(res, `inspect ${tool}`)
  }

  /**
   * Proxy do cadastro do Editor de Extrato (`/tools/extrato-edit/*`, REST simples,
   * sem fila). O cadastro vive em SQLite no webapp (global) — fase 1 de dados.
   */
  async extratoEditRequest(
    method: 'GET' | 'POST' | 'DELETE',
    subpath: string,
    opts: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<unknown> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v != null) params.set(k, v)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const init: RequestInit = { method }
    if (opts.body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(opts.body)
    }
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/tools/extrato-edit/${subpath}${qs}`, init)
    return this.parseJson(res, `extrato-edit ${method} /${subpath}`)
  }

  private async parseJson<T>(res: Response, ctx: string): Promise<T> {
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`webapp ${ctx} falhou: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }
}
