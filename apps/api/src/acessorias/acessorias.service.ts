import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { RegrasObrigacaoService } from './regras-obrigacao.service'

/**
 * Cliente HTTP do Acessórias (https://api.acessorias.com).
 *
 * REST + Bearer Token (configurado em /configuracoes → pill Acessórias).
 * Rate limit oficial: 100 req/min com janela deslizante — não vamos saturar
 * em uso humano, mas pollings automáticos precisam respeitar.
 *
 * Endpoints relevantes pra dar baixa nas rotinas mensais:
 *   - GET /companies               — empresas cadastradas
 *   - GET /companies/{CNPJ}        — empresa específica + obrigações
 *   - GET /deliveries/ListAll      — entregas com filtros (situação, data)
 *   - GET /deliveries/{CNPJ}       — entregas por empresa
 *   - POST /econtinuo              — upload de PDF que dá baixa automática
 *                                    (única forma de escrita do status via API)
 *
 * Limites conhecidos da API:
 *   - Não há POST/PUT para alterar status de entrega diretamente
 *   - Sem webhooks (precisa polling com DtLastDH)
 *   - Sem sandbox público (testar em produção)
 */

export interface AcessoriasConfig {
  baseUrl: string
  token: string
  user?: string
}

export interface AcessoriasResponse<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
  rateLimitRemaining?: number
}

/**
 * Recorte da carteira que a integração enxerga: cliente ATIVO e de situação
 * MENSAL. É quem o escritório atende de forma recorrente e, portanto, quem tem
 * obrigação e entrega no Acessórias. Sem este corte a sincronização varre
 * prospect, potencial, avulso e paralisado — gasta requisição, infla o
 * histórico e enche a lista de pendências com quem não deveria estar lá.
 */
const CLIENTE_ATIVO_MENSAL = { status: 'ATIVA', situacao: 'MENSAL', deletedAt: null } as const

@Injectable()
export class AcessoriasService {
  constructor(private readonly regras: RegrasObrigacaoService) {}

  /** Lê config corrente do process.env (atualizado por /configuracoes ao salvar).
   *  Throws se token/url ausentes — caller deve tratar pra mostrar mensagem útil. */
  private getConfig(): AcessoriasConfig {
    const raw = process.env.ACESSORIAS_API_URL?.trim() || 'https://api.acessorias.com'
    // Aceita "api.acessorias.com" ou "https://api.acessorias.com" — se faltar
    // o protocolo, prepende https:// (fetch exige URL absoluta).
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const baseUrl = withProto.replace(/\/$/, '') // remove trailing slash
    const token = process.env.ACESSORIAS_API_TOKEN?.trim()
    if (!token) {
      throw new Error('API Token do Acessórias não configurado. Acesse /configuracoes → Acessórias.')
    }
    return {
      baseUrl,
      token,
      user: process.env.ACESSORIAS_USER?.trim(),
    }
  }

  /** Faz request bruto com Bearer auth. Não lança em erro HTTP — devolve
   *  o status no objeto pra caller decidir o que fazer. */
  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<AcessoriasResponse<T>> {
    let cfg: AcessoriasConfig
    try {
      cfg = this.getConfig()
    } catch (e) {
      return { ok: false, status: 0, error: (e as Error).message }
    }

    const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const headers = new Headers(init.headers ?? {})
    headers.set('Authorization', `Bearer ${cfg.token}`)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }

    try {
      const res = await fetch(url, { ...init, headers })
      const rateLimitRemaining = Number(res.headers.get('x-ratelimit-remaining') ?? '')
      const remaining = Number.isFinite(rateLimitRemaining) ? rateLimitRemaining : undefined

      // 204 No Content
      if (res.status === 204) {
        return { ok: true, status: 204, rateLimitRemaining: remaining }
      }

      // Tenta JSON; se falhar, devolve texto cru no error
      let body: unknown
      const text = await res.text()
      try { body = text ? JSON.parse(text) : undefined } catch { body = text }

      if (!res.ok) {
        const errMsg = typeof body === 'object' && body && 'message' in body
          ? String((body as { message: unknown }).message)
          : typeof body === 'string'
            ? body
            : `HTTP ${res.status}`
        return { ok: false, status: res.status, error: errMsg, rateLimitRemaining: remaining }
      }

      return { ok: true, status: res.status, data: body as T, rateLimitRemaining: remaining }
    } catch (err) {
      const msg = (err as Error).message || 'Falha de rede'
      return { ok: false, status: 0, error: `Erro de rede: ${msg}` }
    }
  }

  // ── Endpoints expostos ──────────────────────────────────────

  /** Testa conexão batendo num endpoint leve (lista paginada de empresas).
   *  Retorna info útil pro UI mostrar status amigável. */
  async testConnection(): Promise<{
    ok: boolean
    status: number
    error?: string
    empresasCount?: number
    baseUrl: string
    rateLimitRemaining?: number
  }> {
    const cfg = (() => { try { return this.getConfig() } catch { return null } })()
    if (!cfg) {
      return { ok: false, status: 0, error: 'Token não configurado', baseUrl: '' }
    }

    // Tenta /companies com limit pequeno — é o jeito mais leve de validar token
    const res = await this.request<unknown>('/companies?limit=1')
    const baseUrl = cfg.baseUrl

    if (!res.ok) {
      // Tradução amigável dos códigos comuns
      if (res.status === 401) {
        return { ok: false, status: 401, error: 'Token inválido ou expirado', baseUrl, rateLimitRemaining: res.rateLimitRemaining }
      }
      if (res.status === 429) {
        return { ok: false, status: 429, error: 'Rate limit atingido (100 req/min). Aguarde alguns segundos.', baseUrl, rateLimitRemaining: res.rateLimitRemaining }
      }
      if (res.status === 0) {
        return { ok: false, status: 0, error: res.error ?? 'Sem conexão', baseUrl }
      }
      return { ok: false, status: res.status, error: res.error ?? `HTTP ${res.status}`, baseUrl, rateLimitRemaining: res.rateLimitRemaining }
    }

    // O retorno pode vir como { data: [...], total: N } ou similar — tentamos extrair count
    let empresasCount: number | undefined
    const d = res.data as Record<string, unknown> | unknown[]
    if (Array.isArray(d)) {
      empresasCount = d.length
    } else if (typeof d === 'object' && d) {
      const obj = d as Record<string, unknown>
      empresasCount = typeof obj.total === 'number' ? obj.total
        : typeof obj.count === 'number' ? obj.count
        : Array.isArray(obj.data) ? obj.data.length
        : undefined
    }

    return { ok: true, status: res.status, baseUrl, empresasCount, rateLimitRemaining: res.rateLimitRemaining }
  }

  /** Lista empresas paginadas. Para uso no UI de "mapear cliente → empresa Acessórias". */
  async listCompanies(params?: { search?: string; limit?: number; page?: number }) {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.page) q.set('page', String(params.page))
    const qs = q.toString()
    const res = await this.request(`/companies${qs ? `?${qs}` : ''}`)
    return res
  }

  /** Exploratório — devolve a resposta CRUA de um endpoint pra que o frontend
   *  possa inspecionar o shape antes de modelarmos o sync. Não interpreta nem
   *  transforma — apenas relay com headers úteis. */
  async exploreEndpoint(path: string, query?: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== '') q.set(k, String(v))
      }
    }
    const qs = q.toString()
    const fullPath = `${path}${qs ? `?${qs}` : ''}`
    const res = await this.request<unknown>(fullPath)
    return {
      ok: res.ok,
      status: res.status,
      error: res.error,
      path: fullPath,
      rateLimitRemaining: res.rateLimitRemaining,
      data: res.data,
    }
  }

  /** Lista entregas (deliveries). Filtros opcionais: situação, período, CNPJ.
   *  Situações: 'pending' (pendente), 'read' (lido pelo cliente), 'delivered' (entregue). */
  async listDeliveries(params?: {
    cnpj?: string
    situacao?: 'pending' | 'read' | 'delivered'
    dtInicio?: string
    dtFim?: string
    dtLastDH?: string // só registros alterados depois desta data (otimização polling)
    limit?: number
    page?: number
  }) {
    const q = new URLSearchParams()
    if (params?.cnpj) q.set('cnpj', params.cnpj)
    if (params?.situacao) q.set('situacao', params.situacao)
    if (params?.dtInicio) q.set('dtInicio', params.dtInicio)
    if (params?.dtFim) q.set('dtFim', params.dtFim)
    if (params?.dtLastDH) q.set('DtLastDH', params.dtLastDH)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.page) q.set('page', String(params.page))
    const qs = q.toString()
    const path = params?.cnpj
      ? `/deliveries/${encodeURIComponent(params.cnpj)}${qs ? `?${qs}` : ''}`
      : `/deliveries/ListAll${qs ? `?${qs}` : ''}`
    return this.request(path)
  }

  // ═══════════════════════════════════════════════════════════════════
  //   SYNC ENGINE — sincronização Acessórias → OneClick
  // ═══════════════════════════════════════════════════════════════════

  /** Normaliza CNPJ pra chave canônica (14 dígitos, só números). */
  private normCnpj(s: string | null | undefined): string {
    return (s ?? '').replace(/\D/g, '')
  }

  /** Mapeia status do Acessórias pro status interno do OneClick.
   *  Acessórias status descobertos em produção (ver docs/INTEGRACAO-ACESSORIAS.md §6.3) */
  private mapStatus(acessoriasStatus: string): {
    status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'PULADO'
    /** Quando true, sinaliza atraso (UI deve destacar). */
    atrasada: boolean
  } {
    const s = acessoriasStatus?.trim() ?? ''
    if (s === 'Dispensada') return { status: 'PULADO', atrasada: false }
    if (s.startsWith('Atrasada')) return { status: 'EM_ANDAMENTO', atrasada: true }
    if (s === 'Pendente') return { status: 'EM_ANDAMENTO', atrasada: false }
    // Concluídos: Entregue, Ent. antecipada, Ent. PzTéc, Atraso justificado
    return { status: 'CONCLUIDO', atrasada: s === 'Atraso justificado' }
  }

  /** Converte data "0000-00-00" em null; demais formatos passam. */
  private parseDate(s: string | null | undefined): Date | null {
    if (!s || s === '0000-00-00' || s === '') return null
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }

  /** Converte datetime "YYYY-MM-DD HH:mm:ss" (formato do EntLastDH). */
  private parseDateTime(s: string | null | undefined): Date | null {
    if (!s || s === '0000-00-00 00:00:00' || s === '') return null
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
  }

  /** Sincroniza empresas do Acessórias com Clientes do OneClick.
   *  Match por CNPJ (normalizado). Para cada empresa do Acessórias:
   *   - Cliente existe → atualiza idAcessorias se ainda não tiver
   *   - Cliente não existe → ignora (apenas conta) — NÃO cria cliente novo
   *     automaticamente (decisão consciente: cliente vem da nossa origem). */
  async syncCompanies(opts: { triggeredBy?: string; empresaId?: string | null }) {
    const log = await prisma.acessoriasSyncLog.create({
      data: {
        tipo: 'companies',
        status: 'running',
        triggeredBy: opts.triggeredBy ?? null,
        empresaId: opts.empresaId ?? null,
      },
    })

    let novas = 0, atualizadas = 0, ignoradas = 0
    /** Empresas encerradas no Acessórias e que não são clientes nossos. */
    let inativas = 0
    const erros: string[] = []

    try {
      // Guarda o desfecho de cada empresa para a tela poder listar por grupo.
      const detalhes: Array<{
        situacao: 'casada' | 'atualizada' | 'ignorada' | 'inativa'
        idAcessorias: number
        documento: string
        razaoAcessorias: string
        statusAcessorias: string
        clienteId?: string
        clienteCode?: number
        clienteNome?: string
      }> = []

      // /companies/ListAll é paginado (20 por página). Loop até array vazio.
      let pagina = 1
      while (true) {
        const res = await this.request<unknown>(`/companies/ListAll?Pagina=${pagina}`)
        if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) break

        for (const raw of res.data as Array<Record<string, unknown>>) {
          const cnpjFmt = String(raw.Identificador ?? '')
          const cnpjKey = this.normCnpj(cnpjFmt)
          const idAcess = Number(raw.ID ?? 0)
          if (!cnpjKey || cnpjKey.length !== 14 || !idAcess) {
            ignoradas++
            continue
          }
          // Match: por idAcessorias OU documento (normalizado)
          const cliente = await prisma.cliente.findFirst({
            where: {
              ...CLIENTE_ATIVO_MENSAL,
              OR: [
                { idAcessorias: idAcess },
                { documento: cnpjKey },
              ],
            },
            select: { id: true, code: true, razaoSocial: true, idAcessorias: true, cnpjAcessorias: true },
          })
          if (!cliente) {
            // Empresa que o Acessórias já encerrou e que não é cliente nosso não
            // tem o que resolver: não entra na fila de vínculo manual. Fica
            // registrada à parte para o número continuar honesto — some da lista
            // de pendências, não do relatório.
            const statusLa = String(raw.Status ?? '')
            const ativaLa = statusLa.trim().toLowerCase().startsWith('ativ')
            detalhes.push({
              situacao: ativaLa ? 'ignorada' : 'inativa',
              idAcessorias: idAcess,
              documento: cnpjKey,
              razaoAcessorias: String(raw.Razao ?? ''),
              statusAcessorias: statusLa,
            })
            if (ativaLa) ignoradas++; else inativas++
            continue
          }
          // Atualiza apenas o que falta
          const patch: Record<string, unknown> = {}
          if (cliente.idAcessorias !== idAcess) patch.idAcessorias = idAcess
          // Se o CNPJ no Acessórias está formatado diferente do nosso (raro), grava
          if (cliente.cnpjAcessorias == null && cnpjFmt && cnpjFmt !== cnpjKey) {
            patch.cnpjAcessorias = cnpjFmt
          }
          if (Object.keys(patch).length > 0) {
            await prisma.cliente.update({ where: { id: cliente.id }, data: patch })
            atualizadas++
            detalhes.push({
              situacao: 'atualizada',
              idAcessorias: idAcess,
              documento: cnpjKey,
              razaoAcessorias: String(raw.Razao ?? ''),
              statusAcessorias: String(raw.Status ?? ''),
              clienteId: cliente.id,
              clienteCode: cliente.code,
              clienteNome: cliente.razaoSocial,
            })
          } else {
            novas++ // já estava sincronizada (vamos contar como "ok-novas")
            detalhes.push({
              situacao: 'casada',
              idAcessorias: idAcess,
              documento: cnpjKey,
              razaoAcessorias: String(raw.Razao ?? ''),
              statusAcessorias: String(raw.Status ?? ''),
              clienteId: cliente.id,
              clienteCode: cliente.code,
              clienteNome: cliente.razaoSocial,
            })
          }
        }
        pagina++
        // Sleep mínimo entre páginas pra respeitar rate (100 req/min = 1 req/600ms)
        await new Promise(r => setTimeout(r, 200))
        if (pagina > 200) break // sanity stop
      }

      await prisma.acessoriasSyncLog.update({
        where: { id: log.id },
        data: {
          status: erros.length > 0 ? 'partial' : 'success',
          finishedAt: new Date(),
          empresasNovas: novas,
          empresasAtualizadas: atualizadas,
          empresasIgnoradas: ignoradas,
          detalhes: detalhes as never,
          progressoMsg: 'Concluída',
          erroMensagem: erros.length > 0 ? erros.join('\n') : null,
        },
      })
      return { ok: true, novas, atualizadas, ignoradas, inativas, logId: log.id }
    } catch (e) {
      await prisma.acessoriasSyncLog.update({
        where: { id: log.id },
        data: {
          status: 'error',
          finishedAt: new Date(),
          empresasNovas: novas,
          empresasAtualizadas: atualizadas,
          empresasIgnoradas: ignoradas,
          erroMensagem: (e as Error).message,
        },
      })
      throw e
    }
  }

  /** Sincroniza deliveries do Acessórias com ServicoExecucao do OneClick.
   *  Match por:
   *   1. Cliente.idAcessorias (resolvido na sync de companies)
   *   2. AcessoriasObligationMap (Nome → Servico)
   *   3. Chave canônica do registro: prefer EntID; fallback (clienteId, nome, comp)
   *
   *  Diff:
   *   - acessoriasLastDH > existente.acessoriasLastDH → UPDATE
   *   - registro novo → CREATE
   *   - mesma DH → SKIP */
  /**
   * Dispara a sincronização de entregas e RETORNA NA HORA, com o id do log.
   *
   * A varredura é cliente a cliente contra a API do Acessórias (não existe
   * /deliveries/ListAll funcional), então a carteira inteira leva minutos —
   * muito além dos 30s em que o proxy derruba a requisição. Quando isso
   * acontecia, o proxy devolvia uma página de texto e o navegador tentava lê-la
   * como JSON ("Unexpected token 'I', \"Internal S\"...").
   *
   * O trabalho segue em segundo plano gravando em `acessorias_sync_logs`, que é
   * o que a tela acompanha. Para um único cliente continua rápido, mas o caminho
   * é o mesmo — um só comportamento para depurar.
   */
  async syncDeliveries(opts: {
    dtInicio: string
    dtFinal: string
    clienteId?: string
    triggeredBy?: string
    empresaId?: string | null
  }) {
    const log = await prisma.acessoriasSyncLog.create({
      data: {
        tipo: 'deliveries',
        status: 'running',
        triggeredBy: opts.triggeredBy ?? null,
        empresaId: opts.empresaId ?? null,
        parametros: { dtInicio: opts.dtInicio, dtFinal: opts.dtFinal, clienteId: opts.clienteId ?? null } as never,
      },
    })

    // Fire-and-forget: o erro é registrado no log, nunca sobe como exceção não
    // tratada do processo.
    void this.executarSyncDeliveries(opts, log.id).catch(async (e: Error) => {
      await prisma.acessoriasSyncLog.update({
        where: { id: log.id },
        data: { status: 'error', finishedAt: new Date(), erroMensagem: e.message },
      }).catch(() => null)
    })

    return {
      ok: true,
      emAndamento: true,
      logId: log.id,
      mensagem: 'Sincronização iniciada. Acompanhe pelo histórico — ela roda em segundo plano.',
    }
  }

  /**
   * Grava o andamento no log para a tela acompanhar em tempo real. Falha aqui
   * nunca interrompe a sincronização — progresso é informação, não trabalho.
   */
  private async marcarProgresso(
    logId: string,
    dados: { atual?: number; total?: number; msg?: string },
  ) {
    await prisma.acessoriasSyncLog.update({
      where: { id: logId },
      data: {
        ...(dados.atual !== undefined ? { progressoAtual: dados.atual } : {}),
        ...(dados.total !== undefined ? { progressoTotal: dados.total } : {}),
        ...(dados.msg !== undefined ? { progressoMsg: dados.msg } : {}),
      },
    }).catch(() => null)
  }

  private async executarSyncDeliveries(opts: {
    dtInicio: string
    dtFinal: string
    clienteId?: string
    triggeredBy?: string
    empresaId?: string | null
  }, logId: string) {
    // O log já foi criado por quem disparou — aqui só atualizamos o progresso.
    const log = { id: logId }

    let novas = 0, atualizadas = 0, ignoradas = 0
    const erros: string[] = []

    try {
      // Carrega o mapping de obrigações UMA vez no início (cache local).
      // Agora M:N — pra cada nome, lista de servicoIds vinculados.
      // null no array = "explicitamente ignorada" (não cria execução).
      const mapsList = await prisma.acessoriasObligationMap.findMany({
        where: { ativo: true, ...(opts.empresaId ? { empresaId: opts.empresaId } : {}) },
        select: { nome: true, servicoId: true },
      })
      const obligationMap = new Map<string, Array<string | null>>()
      for (const m of mapsList) {
        const key = m.nome.toLowerCase()
        if (!obligationMap.has(key)) obligationMap.set(key, [])
        obligationMap.get(key)!.push(m.servicoId)
      }

      // Resolve lista de clientes a sincronizar
      const clientes = await prisma.cliente.findMany({
        where: {
          ...CLIENTE_ATIVO_MENSAL,
          ...(opts.clienteId ? { id: opts.clienteId } : { idAcessorias: { not: null } }),
        },
        select: { id: true, documento: true, idAcessorias: true, cnpjAcessorias: true, empresaId: true, razaoSocial: true },
      })

      if (clientes.length === 0) {
        await prisma.acessoriasSyncLog.update({
          where: { id: log.id },
          data: {
            status: 'partial',
            finishedAt: new Date(),
            erroMensagem: opts.clienteId
              ? 'Cliente não encontrado.'
              : 'Nenhum cliente ativo e mensal com código do Acessórias. Rode "Sincronizar Empresas" primeiro.',
          },
        })
        return { ok: false, novas, atualizadas, ignoradas, logId: log.id, erro: 'Nenhum cliente pra sincronizar' }
      }

      // Índice de regras carregado UMA vez: são milhares de entregas e uma
      // consulta por entrega seria o gargalo da rodada.
      const deveConsiderar = await this.regras.carregarIndice(opts.empresaId ?? null)
      let excluidasPorRegra = 0

      await this.marcarProgresso(log.id, {
        atual: 0, total: clientes.length,
        msg: `${clientes.length} cliente(s) a consultar`,
      })

      // Registro do que aconteceu por cliente — é o que a tela abre ao clicar
      // na linha do histórico. Limitado para o log não crescer sem controle.
      const detalhes: Array<{ clienteId: string; cliente: string; entregas: number; novas: number; atualizadas: number; erro?: string }> = []
      let indice = 0

      for (const cli of clientes) {
        indice++
        const cnpj = this.normCnpj(cli.cnpjAcessorias ?? cli.documento)
        if (!cnpj) continue
        const antesNovas = novas, antesAtual = atualizadas
        let entregasDoCliente = 0

        // /deliveries/{cnpj} paginado (50 por página). Inclui `config` (sem valor)
        // pra trazer Config.RespPrazo / Config.RespEntrega / Config.DptoNome —
        // essenciais pra sincronização de responsáveis. URLSearchParams não
        // suporta param sem valor → concat manual com '&config' no final.
        let pagina = 1
        while (true) {
          const qs = new URLSearchParams({
            DtInitial: opts.dtInicio,
            DtFinal: opts.dtFinal,
            Pagina: String(pagina),
          }).toString()
          const res = await this.request<unknown>(`/deliveries/${cnpj}?${qs}&config`)
          if (!res.ok) break
          // Resposta pode ser objeto único (1 empresa) ou array; deliveries em .Entregas
          const data = res.data
          let entregas: Array<Record<string, unknown>> = []
          if (Array.isArray(data)) {
            for (const co of data) {
              const arr = (co as Record<string, unknown>).Entregas
              if (Array.isArray(arr)) entregas.push(...arr as Array<Record<string, unknown>>)
            }
          } else if (data && typeof data === 'object') {
            const arr = (data as Record<string, unknown>).Entregas
            if (Array.isArray(arr)) entregas = arr as Array<Record<string, unknown>>
          }
          if (entregas.length === 0) break

          for (const e of entregas) {
            // Regra do time vence a lista do Acessórias: obrigação marcada como
            // não devida não entra no espelho nem vira execução.
            if (!deveConsiderar(String(e.Nome ?? ''), cli.id)) {
              excluidasPorRegra++
              continue
            }
            const r = await this.upsertDelivery(cli.id, e, obligationMap, cli.empresaId ?? null)
            novas += r.created
            atualizadas += r.updated
            ignoradas += r.skipped
            entregasDoCliente++
          }
          pagina++
          await new Promise(r => setTimeout(r, 200))
          if (pagina > 50) break
        }

        // Só registra quem teve movimento — uma linha por cliente vazio encheria
        // o detalhe de ruído e esconderia o que importa.
        if (entregasDoCliente > 0 && detalhes.length < 500) {
          detalhes.push({
            clienteId: cli.id,
            cliente: cli.razaoSocial ?? cnpj,
            entregas: entregasDoCliente,
            novas: novas - antesNovas,
            atualizadas: atualizadas - antesAtual,
          })
        }
        // Atualiza a cada cliente: é o que faz a barra andar de verdade.
        await this.marcarProgresso(log.id, {
          atual: indice,
          msg: `${indice}/${clientes.length} · ${cli.razaoSocial ?? cnpj}`,
        })
      }

      await prisma.acessoriasSyncLog.update({
        where: { id: log.id },
        data: {
          status: erros.length > 0 ? 'partial' : 'success',
          finishedAt: new Date(),
          progressoAtual: clientes.length,
          progressoTotal: clientes.length,
          progressoMsg: excluidasPorRegra > 0
            ? `Concluída · ${excluidasPorRegra} entrega(s) fora por regra`
            : 'Concluída',
          detalhes: detalhes as never,
          deliveriesNovas: novas,
          deliveriesAtualizadas: atualizadas,
          deliveriesIgnoradas: ignoradas,
          erroMensagem: erros.length > 0 ? erros.join('\n') : null,
        },
      })
      return { ok: true, novas, atualizadas, ignoradas, logId: log.id }
    } catch (e) {
      await prisma.acessoriasSyncLog.update({
        where: { id: log.id },
        data: {
          status: 'error',
          finishedAt: new Date(),
          deliveriesNovas: novas,
          deliveriesAtualizadas: atualizadas,
          deliveriesIgnoradas: ignoradas,
          erroMensagem: (e as Error).message,
        },
      })
      throw e
    }
  }

  /** Upsert de uma delivery individual.
   *  Como o mapeamento agora é M:N, uma delivery pode gerar **N execuções**
   *  (uma por servicoId vinculado). Retorna contadores agregados. */
  /**
   * Interpreta o campo `EntGuiaLida`. Ele vem como frase ("Guia já acessada/lida",
   * "Guia ainda não acessada/lida") ou vazio quando a entrega não tem guia para
   * o cliente abrir. Vazio NÃO é "não lida" — tratar assim inflaria o painel com
   * obrigações que nunca geraram documento.
   */
  private interpretarGuiaLida(v: unknown): boolean | null {
    const s = String(v ?? '').trim().toLowerCase()
    if (!s) return null
    if (s.includes('não') || s.includes('nao')) return false
    if (s.includes('lida') || s.includes('acessada')) return true
    return null
  }

  /**
   * Guarda a entrega crua em `acessorias_entregas` — o espelho que o painel de
   * prazos e leitura consulta. Independente do mapeamento de obrigações.
   */
  private async espelharEntrega(clienteId: string, delivery: Record<string, unknown>, empresaId: string | null) {
    const config = (delivery.Config ?? {}) as Record<string, unknown>
    const entId = config.EntID ? String(config.EntID).trim() : ''
    // Sem EntID não há chave estável: o mesmo registro entraria duplicado a cada
    // sync. Melhor não espelhar do que poluir o painel.
    if (!entId) return

    const guiaLida = delivery.EntGuiaLida != null ? String(delivery.EntGuiaLida).trim() : null

    const dados = {
      nome: String(delivery.Nome ?? '').trim(),
      competencia: this.parseDate(String(delivery.EntCompetencia ?? '')),
      prazo: this.parseDate(String(delivery.EntDtPrazo ?? '')),
      dtAtraso: this.parseDate(String(delivery.EntDtAtraso ?? '')),
      dtEntrega: this.parseDate(String(delivery.EntDtEntrega ?? '')),
      dtFinalizacao: this.parseDateTime(String(delivery.EntDtFinalizacao ?? '')),
      guiaLida: guiaLida || null,
      lida: this.interpretarGuiaLida(guiaLida),
      status: String(delivery.Status ?? '').trim() || null,
      multa: String(delivery.EntMulta ?? '').trim().toUpperCase() === 'S',
      respPrazo: config.RespPrazo ? String(config.RespPrazo).trim() || null : null,
      respEntrega: config.RespEntrega ? String(config.RespEntrega).trim() || null : null,
      dpto: config.DptoNome ? String(config.DptoNome).trim() || null : null,
      // Os identificadores vinham na resposta e eram descartados. O vínculo com
      // o nosso cadastro se apoia neles: nome muda de grafia entre as bases,
      // ID não.
      respPrazoId: config.RespPrazoID ? String(config.RespPrazoID).trim() || null : null,
      respEntregaId: config.RespEntregaID ? String(config.RespEntregaID).trim() || null : null,
      dptoId: config.DptoID ? String(config.DptoID).trim() || null : null,
      lastDH: this.parseDateTime(String(delivery.EntLastDH ?? '')),
      syncedAt: new Date(),
      empresaId,
    }

    await prisma.acessoriasEntrega.upsert({
      where: { clienteId_entId: { clienteId, entId } },
      create: { clienteId, entId, ...dados },
      update: dados,
    })
  }

  private async upsertDelivery(
    clienteId: string,
    delivery: Record<string, unknown>,
    obligationMap: Map<string, Array<string | null>>,
    empresaId: string | null,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const out = { created: 0, updated: 0, skipped: 0 }
    const nome = String(delivery.Nome ?? '').trim()
    if (!nome) { out.skipped++; return out }

    // Espelha a entrega ANTES do filtro de mapeamento. O que vem abaixo só cria
    // execução para obrigação mapeada; o painel de prazos precisa de todas.
    await this.espelharEntrega(clienteId, delivery, empresaId).catch(() => null)

    // Resolve TODOS os servicoIds vinculados a essa obrigação
    const servicoIds = obligationMap.get(nome.toLowerCase())
    if (!servicoIds || servicoIds.length === 0) {
      // Sem mapping cadastrado → fica em limbo (visível na UI)
      out.skipped++
      return out
    }
    // Filtra apenas os IDs não-null (null = marca de ignorar)
    const idsValidos = servicoIds.filter((id): id is string => id !== null)
    if (idsValidos.length === 0) {
      // Explicitamente ignorada
      out.skipped++
      return out
    }

    const competencia = this.parseDate(String(delivery.EntCompetencia ?? ''))
    const prazo       = this.parseDate(String(delivery.EntDtPrazo ?? ''))
    const entrega     = this.parseDate(String(delivery.EntDtEntrega ?? ''))
    const lastDH      = this.parseDateTime(String(delivery.EntLastDH ?? ''))
    const statusAce   = String(delivery.Status ?? '').trim()
    const config      = (delivery.Config ?? {}) as Record<string, unknown>
    const entId       = config.EntID ? String(config.EntID) : null
    const respPrazo   = config.RespPrazo ? String(config.RespPrazo).trim() || null : null
    const respEntrega = config.RespEntrega ? String(config.RespEntrega).trim() || null : null
    const dptoNome    = config.DptoNome ? String(config.DptoNome).trim() || null : null
    const { status }  = this.mapStatus(statusAce)

    const dataBase = {
      acessoriasEntId: entId,
      acessoriasNome: nome,
      acessoriasComp: competencia,
      acessoriasPrazo: prazo,
      acessoriasStatus: statusAce,
      acessoriasLastDH: lastDH,
      acessoriasSyncedAt: new Date(),
      acessoriasRespPrazo: respPrazo,
      acessoriasRespEntrega: respEntrega,
      acessoriasDpto: dptoNome,
      status,
      concluidoEm: status === 'CONCLUIDO' && entrega ? entrega : null,
    }

    // Cria/atualiza uma execução por serviço vinculado
    for (const servicoId of idsValidos) {
      // Chave: (servicoId, clienteId, acessoriasEntId) ou fallback (servicoId, clienteId, nome, comp)
      const where = entId
        ? { AND: [{ servicoId }, { clienteId }, { acessoriasEntId: entId }] }
        : { AND: [{ servicoId }, { clienteId }, { acessoriasNome: nome }, { acessoriasComp: competencia }] }

      const existing = await prisma.servicoExecucao.findFirst({
        where: where as any,
        select: { id: true, acessoriasLastDH: true },
      })

      if (existing) {
        if (existing.acessoriasLastDH && lastDH && existing.acessoriasLastDH.getTime() === lastDH.getTime()) {
          out.skipped++
          continue
        }
        await prisma.servicoExecucao.update({ where: { id: existing.id }, data: dataBase })
        out.updated++
      } else {
        await prisma.servicoExecucao.create({
          data: {
            ...dataBase,
            servicoId,
            clienteId,
            prioridade: 'MEDIA',
            iniciadoEm: competencia ?? new Date(),
            prazoLimite: prazo,
          },
        })
        out.created++
      }
    }
    return out
  }

  // ── CRUD do mapeamento de obrigações (M:N) ──
  //   Modelo: cada row = 1 vínculo (nome × servicoId). Múltiplos vínculos por
  //   nome são suportados — uma obrigação pode ir pra vários serviços.

  /** Lista todos os vínculos agrupados por nome de obrigação. */
  async listObligationMaps(empresaId?: string | null) {
    const rows = await prisma.acessoriasObligationMap.findMany({
      where: empresaId !== undefined ? { empresaId } : undefined,
      include: { servico: { select: { id: true, nome: true, categoriaServico: true } } },
      orderBy: { nome: 'asc' },
    })
    // Agrupa por nome → lista de serviços vinculados
    const grupos = new Map<string, {
      nome: string
      ignorada: boolean // se há algum row com servicoId=null
      observacoes: string | null
      empresaId: string | null
      servicos: Array<{ id: string; mapId: string; servicoId: string; servicoNome: string; ativo: boolean }>
    }>()
    for (const r of rows) {
      const key = r.nome
      if (!grupos.has(key)) {
        grupos.set(key, {
          nome: r.nome,
          ignorada: false,
          observacoes: r.observacoes,
          empresaId: r.empresaId,
          servicos: [],
        })
      }
      const g = grupos.get(key)!
      if (r.servicoId === null) {
        g.ignorada = true
      } else if (r.servico) {
        g.servicos.push({
          id: r.id,
          mapId: r.id,
          servicoId: r.servico.id,
          servicoNome: r.servico.nome,
          ativo: r.ativo,
        })
      }
    }
    return [...grupos.values()]
  }

  /** Adiciona um vínculo (nome × servicoId). Idempotente. */
  async addObligationServico(input: {
    nome: string
    servicoId: string
    empresaId?: string | null
    /** 'manual' (tela) ou 'auto' (sugestão em lote). Default manual. */
    origem?: 'manual' | 'auto'
  }) {
    const existing = await prisma.acessoriasObligationMap.findFirst({
      where: { empresaId: input.empresaId ?? null, nome: input.nome, servicoId: input.servicoId },
    })
    if (existing) {
      // Reativa se estava desativado
      if (!existing.ativo) {
        await prisma.acessoriasObligationMap.update({ where: { id: existing.id }, data: { ativo: true } })
      }
      return existing
    }
    return prisma.acessoriasObligationMap.create({
      data: {
        origem: input.origem ?? 'manual',
        nome: input.nome,
        servicoId: input.servicoId,
        ativo: true,
        empresaId: input.empresaId ?? null,
      },
    })
  }

  /** Remove um vínculo específico (uma row). */
  async removeObligationServico(mapId: string) {
    return prisma.acessoriasObligationMap.delete({ where: { id: mapId } })
  }

  /** Toggle ativo de um vínculo específico. */
  async setObligationServicoActive(mapId: string, ativo: boolean) {
    return prisma.acessoriasObligationMap.update({ where: { id: mapId }, data: { ativo } })
  }

  /** Marca/desmarca obrigação como "explicitamente ignorada" (row com servicoId=null).
   *  Diferente de "não mapeada ainda" — útil pra obrigações que o usuário não
   *  quer sincronizar (ex: PGDAS Recibo, que já vem do EXTRATO PGDAS). */
  async setObligationIgnored(input: { nome: string; ignored: boolean; empresaId?: string | null }) {
    const empresaId = input.empresaId ?? null
    const existing = await prisma.acessoriasObligationMap.findFirst({
      where: { empresaId, nome: input.nome, servicoId: null },
    })
    if (input.ignored) {
      if (existing) return existing
      return prisma.acessoriasObligationMap.create({
        data: { nome: input.nome, servicoId: null, ativo: true, empresaId },
      })
    } else {
      if (existing) await prisma.acessoriasObligationMap.delete({ where: { id: existing.id } })
      return null
    }
  }

  /** Atualiza observações da obrigação (compartilhadas entre todos os vínculos). */
  async setObligationObservacoes(input: { nome: string; observacoes: string | null; empresaId?: string | null }) {
    return prisma.acessoriasObligationMap.updateMany({
      where: { empresaId: input.empresaId ?? null, nome: input.nome },
      data: { observacoes: input.observacoes },
    })
  }

  /** Lista as obrigações distintas observadas nas empresas — útil pra UI de
   *  mapping mostrar os candidatos sem precisar puxar deliveries individuais.
   *  Usa /companies/ListAll com flag `?obligations` (sem valor — Acessórias
   *  reconhece presença do param, não valor). */
  async listObligationsObserved(empresaId?: string | null): Promise<Array<{ nome: string; ocorrencias: number; departamento: string | null }>> {
    const counter = new Map<string, number>()
    let pagina = 1
    let totalCompanies = 0
    let totalObs = 0
    while (true) {
      // IMPORTANTE: usar `obligations` sem valor (flag-style) — URLSearchParams
      // converteria em `obligations=` que pode não funcionar. Concat manual.
      const path = `/companies/ListAll?obligations&Pagina=${pagina}`
      const res = await this.request<unknown>(path)
      if (!res.ok) {
        console.warn('[listObligationsObserved] req falhou:', res.status, res.error)
        break
      }
      if (!Array.isArray(res.data)) {
        console.warn('[listObligationsObserved] data não é array — tipo:', typeof res.data, 'pagina:', pagina)
        break
      }
      if (res.data.length === 0) {
        console.log('[listObligationsObserved] página vazia em', pagina, '- fim do loop')
        break
      }
      totalCompanies += res.data.length
      for (const co of res.data as Array<Record<string, unknown>>) {
        const obs = (co.Obrigacoes ?? []) as Array<Record<string, unknown>>
        totalObs += obs.length
        for (const ob of obs) {
          const nome = String(ob.Nome ?? '').trim()
          if (!nome) continue
          counter.set(nome, (counter.get(nome) ?? 0) + 1)
        }
      }
      pagina++
      await new Promise(r => setTimeout(r, 200))
      if (pagina > 200) break
    }
    console.log(`[listObligationsObserved] total: ${totalCompanies} empresas, ${totalObs} obrigações brutas, ${counter.size} distintas`)

    // O departamento NÃO vem em /companies/ListAll?obligations — só no bloco
    // Config das entregas. Como o espelho local já guarda isso por entrega,
    // derivamos daqui em vez de gastar mais requisição na API.
    const dptos = await prisma.acessoriasEntrega.groupBy({
      by: ['nome', 'dpto'],
      where: { dpto: { not: null } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ nome: string; dpto: string | null; _count: { _all: number } }>)

    // Uma obrigação pode aparecer em mais de um departamento (configuração por
    // cliente). Vale o predominante — e o rótulo avisa que há mistura.
    const porNome = new Map<string, Array<{ dpto: string; n: number }>>()
    for (const d of dptos) {
      if (!d.dpto) continue
      const arr = porNome.get(d.nome) ?? []
      arr.push({ dpto: d.dpto, n: d._count._all })
      porNome.set(d.nome, arr)
    }
    const departamentoDe = (nome: string): string | null => {
      const arr = porNome.get(nome)
      if (!arr || arr.length === 0) return null
      const ordenado = [...arr].sort((a, b) => b.n - a.n)
      const principal = ordenado[0]!.dpto
      return ordenado.length > 1 ? `${principal} +${ordenado.length - 1}` : principal
    }

    const resultado = [...counter.entries()]
      .map(([nome, ocorrencias]) => ({ nome, ocorrencias, departamento: departamentoDe(nome) }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias)

    // Guarda o resultado: a varredura custa dezenas de requisições e o usuário
    // não deve pagar de novo só por ter saído da tela.
    await this.guardarObservadas(resultado, empresaId ?? null).catch(() => null)

    return resultado
  }

  /** Mapeia regime do OneClick (Cliente.tributacao) pro código numérico do Acessórias.
   *  Códigos do Acessórias:
   *    0=Indefinido · 1=Simples c/ IE · 2=Simples s/ IE · 3=LP c/ IE · 4=LP s/ IE
   *    5=Lucro Real · 6=MEI · 7=Domésticas · 8=Produtor Rural · 9=PF · 10=Imune/Isenta */
  private mapRegimeToAcessorias(tributacao: string | null | undefined, hasIE: boolean): number {
    if (!tributacao) return 0
    switch (tributacao) {
      case 'SIMPLES_NACIONAL':  return hasIE ? 1 : 2
      case 'LUCRO_PRESUMIDO':   return hasIE ? 3 : 4
      case 'LUCRO_REAL':        return 5
      case 'MEI':               return 6
      case 'IMUNE':             return 10
      case 'ISENTA':            return 10
      default:                  return 0
    }
  }

  /** Cadastra (ou atualiza) o cliente no Acessórias via POST /companies.
   *  Após sucesso, grava o ID retornado em Cliente.idAcessorias.
   *
   *  Limitação da API: empresa fica criada com obrigações DEFAULT do template
   *  geral do escritório. Pra customizar quais obrigações estão ativas pra
   *  esse cliente específico, ainda é necessário entrar no portal do Acessórias.
   *  (A API não expõe endpoint pra (des)ativar obrigações por cliente.) */
  async createCompanyInAcessorias(clienteId: string, opts?: { triggeredBy?: string }) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true, razaoSocial: true, nomeFantasia: true, documento: true, tipoDocumento: true,
        tributacao: true, inscricaoEstadual: true, inscricaoMunicipal: true,
        cep: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true,
        telefone: true, dataEntrada: true,
        idAcessorias: true, cnpjAcessorias: true,
      },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')
    if (cliente.tipoDocumento !== 'CNPJ') {
      throw new Error('Apenas clientes PJ (CNPJ) podem ser cadastrados no Acessórias.')
    }
    const cnpjLimpo = (cliente.documento ?? '').replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) throw new Error('CNPJ inválido (esperado 14 dígitos).')

    // Monta payload conforme contrato do POST /companies
    const hasIE = !!(cliente.inscricaoEstadual && cliente.inscricaoEstadual.trim())
    const form = new URLSearchParams()
    form.set('cnpj', cnpjLimpo)
    form.set('nome', cliente.razaoSocial)
    if (cliente.nomeFantasia) form.set('fantasia', cliente.nomeFantasia)
    form.set('getid', 'S') // deixa Acessórias pegar próximo ID se conflito
    form.set('regime', String(this.mapRegimeToAcessorias(cliente.tributacao, hasIE)))
    if (cliente.dataEntrada) form.set('dtclidesde', cliente.dataEntrada.toISOString().slice(0, 10))
    if (cliente.inscricaoMunicipal) form.set('inscmunicipal', cliente.inscricaoMunicipal)
    if (cliente.logradouro) form.set('endlogradouro', cliente.logradouro)
    if (cliente.numero) form.set('endnumero', cliente.numero)
    if (cliente.complemento) form.set('endcomplemento', cliente.complemento)
    if (cliente.cep) form.set('cep', cliente.cep.replace(/\D/g, ''))
    if (cliente.bairro) form.set('bairro', cliente.bairro)
    if (cliente.cidade) form.set('cidade', cliente.cidade)
    if (cliente.uf) form.set('uf', cliente.uf)
    if (cliente.telefone) form.set('fone', cliente.telefone.replace(/\D/g, ''))
    form.set('ativa', 'S')

    // Envia POST com Authorization Bearer + body x-www-form-urlencoded
    let cfg: AcessoriasConfig
    try { cfg = this.getConfig() } catch (e) { throw new Error((e as Error).message) }

    const url = `${cfg.baseUrl}/companies`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const text = await res.text()
    let body: unknown
    try { body = text ? JSON.parse(text) : null } catch { body = text }

    if (!res.ok) {
      const msg = typeof body === 'object' && body && 'Erro' in body
        ? String((body as { Erro: unknown }).Erro)
        : typeof body === 'string' ? body : `HTTP ${res.status}`
      throw new Error(`Acessórias rejeitou: ${msg}`)
    }

    // Resposta esperada: { id: "1", msg: "Empresa 1 criada com sucesso!" }
    const respId = typeof body === 'object' && body && 'id' in body
      ? Number((body as { id: unknown }).id)
      : null
    if (!respId || !Number.isFinite(respId)) {
      throw new Error(`Resposta sem ID válido: ${text.slice(0, 200)}`)
    }

    // Atualiza o cliente local com idAcessorias
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { idAcessorias: respId },
    })

    // Log da operação
    await prisma.acessoriasSyncLog.create({
      data: {
        tipo: 'company-create',
        status: 'success',
        finishedAt: new Date(),
        empresasNovas: cliente.idAcessorias === respId ? 0 : 1,
        empresasAtualizadas: cliente.idAcessorias === respId ? 1 : 0,
        empresasIgnoradas: 0,
        parametros: { clienteId, idAcessorias: respId, cnpj: cnpjLimpo } as any,
        triggeredBy: opts?.triggeredBy ?? null,
      },
    })

    const msg = typeof body === 'object' && body && 'msg' in body
      ? String((body as { msg: unknown }).msg)
      : 'Empresa criada/atualizada.'
    return { ok: true, idAcessorias: respId, mensagem: msg, atualizou: cliente.idAcessorias === respId }
  }

  async listSyncLogs(limit = 50) {
    return prisma.acessoriasSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 200),
    })
  }

  // ── Auto-classificação e sugestão de mapeamento ───────────────
  //   Heurística sobre o nome da obrigação (palavras-chave) pra:
  //    a) deduzir a área (fiscal/contábil/trabalhista)
  //    b) detectar regime quando o próprio nome denuncia (DAS = Simples, etc)
  //    c) escolher o melhor Serviço MENSAL existente como sugestão

  /** Normaliza string pra match case-insensitive sem acentos. */
  private normText(s: string): string {
    return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  }

  private classifyObligation(nome: string): {
    area: 'fiscal' | 'contabil' | 'trabalhista' | 'desconhecida'
    regime?: 'simples' | 'presumido' | 'real'
    confidence: 'alta' | 'media' | 'baixa'
  } {
    const u = this.normText(nome)

    // ── Trabalhista (folha + encargos) — palavras únicas dessa área
    if (/\b(FOLHA|SALARIO|13[ºO ]|FERIAS|FGTS|RAIS|SEFIP|GFIP|ADIANTAMENTO|LIQUIDOS|PRO ?LABORE|PROVIS[OÃ]ES|RECIBO DE PAGAMENTO|SINDIC|TAXA ASSISTENCIAL|TAXA SINDICAL|MENSALIDADE EMPREGADOS|RELA[CÇ][AÃ]O EMPREGADOS|ENCERRAMENTO CONTABILIZA[CÇ][AÃ]O FOLHA|DOMESTICO|DET[EM]?|ESOCIAL|PENSAO ALIMENTICIA)\b/.test(u)) {
      // DCTFWEB INSS-IRRF é trabalhista (folha gera o DARF unificado de INSS+IRRF)
      return { area: 'trabalhista', confidence: 'alta' }
    }
    if (/DCTFWEB.*(INSS|IRRF)|DARF.*DCTFWEB.*INSS/.test(u)) {
      return { area: 'trabalhista', confidence: 'alta' }
    }

    // ── Contábil
    if (/\b(BALANCETE|BALAN[CÇ]O PATRIMONIAL|LIVROS CONTABEIS|DIARIO E RAZAO|DRE|DEMONSTRA[CÇ][AÃ]O.*RESULTADO|SPED ECD|ESCRITURA[CÇ][AÃ]O CONTABIL DIGITAL|DLPA|DFC|RAZAO ANALITICO|RAZAO CONTABIL)\b/.test(u)) {
      return { area: 'contabil', confidence: 'alta' }
    }
    if (/\bSPED ECF|ESCRITURA[CÇ][AÃ]O CONTABIL FISCAL\b/.test(u)) {
      return { area: 'contabil', confidence: 'media' } // ECF anual fica entre fiscal e contábil
    }

    // ── Fiscal — primeiro detecta REGIME via marcadores específicos
    if (/\b(DAS - MENSAL|DAS MENSAL|DASN|PGDAS|EXTRATO PGDAS|DEFIS)\b/.test(u)) {
      return { area: 'fiscal', regime: 'simples', confidence: 'alta' }
    }
    if (/\b(DARF MIT|DCTFWEB ANUAL|DARF IPI|REGISTRO DE APURA[CÇ][AÃ]O DO IPI|EFD-?CONTRIBUI[CÇ][OÕ]ES|RECIBO EFD CONTRIBUI[CÇ][OÕ]ES)\b/.test(u)) {
      return { area: 'fiscal', regime: 'real', confidence: 'alta' }
    }
    if (/\b(RESUMO DE TRIBUTOS.*LUCRO PRESUMIDO|DARF.*CSLL.*TRIMESTRAL|DARF MIT.*IMPOSTOS TRIMESTRAIS)\b/.test(u)) {
      return { area: 'fiscal', regime: 'presumido', confidence: 'media' }
    }

    // Fiscal genérico (qualquer regime — ICMS, ISS, NF-e, retenções federais)
    if (/\b(DARF|DCTF|DCTFWEB|EFD|SPED FISCAL|REINF|ICMS|IPI|ISS|DUA|DAM ISSQN|RELATORIO DE ENTRADAS|RELATORIO DE SAIDAS|LIVRO REGISTRO|RELATORIO DIFAL|GIA|DEISS|DMS|NFS|RPS|TOMADOR|PRESTADO|RETENC[OÕ]ES|DESTDA|CSRF|GNRE|DARE|DARM)\b/.test(u)) {
      return { area: 'fiscal', confidence: 'media' }
    }
    // Última cartada — qualquer "DARF" / "RECIBO" sem regime conhecido
    if (/DARF|RECIBO|RELATORIO/.test(u)) {
      return { area: 'fiscal', confidence: 'baixa' }
    }

    return { area: 'desconhecida', confidence: 'baixa' }
  }

  /** Heurística pra escolher o melhor Serviço Mensal dado a classificação. */
  private pickServico(
    classified: ReturnType<AcessoriasService['classifyObligation']>,
    servicos: Array<{ id: string; nome: string }>,
  ): { id: string; nome: string; razao: string } | null {
    if (classified.area === 'desconhecida' || servicos.length === 0) return null

    const has = (s: string, kw: string) => this.normText(s).includes(this.normText(kw))

    // Filtro por área primeiro
    let candidatos = servicos.filter(s => {
      if (classified.area === 'fiscal') return has(s.nome, 'fiscal')
      if (classified.area === 'contabil') return has(s.nome, 'contabil') || has(s.nome, 'contábil')
      if (classified.area === 'trabalhista') return has(s.nome, 'trabalhista')
      return false
    })
    if (candidatos.length === 0) return null

    // Se tem regime detectado, refina
    if (classified.regime === 'simples') {
      const m = candidatos.find(s => has(s.nome, 'simples'))
      if (m) return { ...m, razao: 'Área fiscal · regime Simples Nacional detectado pelo nome' }
    }
    if (classified.regime === 'presumido') {
      const m = candidatos.find(s => has(s.nome, 'presumido') || has(s.nome, 'presumido/real'))
      if (m) return { ...m, razao: 'Área fiscal · regime Lucro Presumido detectado' }
    }
    if (classified.regime === 'real') {
      const m = candidatos.find(s => has(s.nome, 'real') || has(s.nome, 'presumido/real'))
      if (m) return { ...m, razao: 'Área fiscal · regime Lucro Real detectado' }
    }

    // Sem regime detectado NÃO se chuta. Antes, qualquer obrigação da área caía
    // no serviço "que cobre mais casos" e o resultado foi vincular a carteira
    // inteira num serviço mensal só. Sem casamento pelo nome, a sugestão fica
    // vazia e o vínculo é feito à mão — que é o certo: quem conhece a obrigação
    // é o time, não a heurística.
    return null
  }

  /** Sugere mapeamentos automáticos pra cada obrigação observada.
   *  Retorna lista pronta pra UI mostrar e o usuário aprovar/rejeitar. */
  async suggestMappings(): Promise<Array<{
    nome: string
    ocorrencias: number
    departamento: string | null
    area: string
    regime?: string
    confidence: string
    /** ServicoId sugerido (null se não conseguiu classificar). */
    suggestedServicoId: string | null
    suggestedServicoNome: string | null
    razao: string | null
    /** Já tem mapping cadastrado? (pula no apply automático) */
    alreadyMapped: boolean
    /** Vínculos atuais. A assinatura declarava `currentServicoId` no singular,
     *  mas o retorno sempre foi a lista — o M:N chegou depois e a assinatura
     *  ficou para trás. */
    currentServicoIds: string[]
  }>> {
    const [observedCache, maps, servicos] = await Promise.all([
      this.listObligationsObservedCache(),
      prisma.acessoriasObligationMap.findMany({ select: { nome: true, servicoId: true } }),
      prisma.servico.findMany({
        where: { ativo: true, categoriaServico: 'MENSAL' },
        select: { id: true, nome: true },
      }),
    ])
    // M:N: pra cada nome, lista de servicoIds vinculados (sem null)
    const mappedByNome = new Map<string, string[]>()
    for (const m of maps) {
      if (!m.servicoId) continue
      const key = m.nome.toLowerCase()
      if (!mappedByNome.has(key)) mappedByNome.set(key, [])
      mappedByNome.get(key)!.push(m.servicoId)
    }

    return observedCache.itens.map(o => {
      const classified = this.classifyObligation(o.nome)
      const sug = this.pickServico(classified, servicos)
      const currentIds = mappedByNome.get(o.nome.toLowerCase()) ?? []
      // "alreadyMapped" = sugestão já está nos vínculos atuais
      const already = sug ? currentIds.includes(sug.id) : currentIds.length > 0
      return {
        nome: o.nome,
        ocorrencias: o.ocorrencias,
        departamento: o.departamento ?? null,
        area: classified.area,
        regime: classified.regime,
        confidence: classified.confidence,
        suggestedServicoId: sug?.id ?? null,
        suggestedServicoNome: sug?.nome ?? null,
        razao: sug?.razao ?? null,
        alreadyMapped: already,
        currentServicoIds: currentIds,
      }
    })
  }

  /** Aplica em lote uma lista de mapeamentos sugeridos (após aprovação do usuário).
   *  Cada item vira um VÍNCULO via addObligationServico (idempotente). */
  async applySuggestions(
    items: Array<{ nome: string; servicoId: string }>,
    empresaId?: string | null,
  ) {
    let aplicados = 0
    let erros: string[] = []
    for (const it of items) {
      try {
        await this.addObligationServico({
          nome: it.nome,
          servicoId: it.servicoId,
          empresaId: empresaId ?? null,
          origem: 'auto',
        })
        aplicados++
      } catch (e) {
        erros.push(`${it.nome}: ${(e as Error).message}`)
      }
    }
    return { ok: erros.length === 0, aplicados, erros }
  }

  /**
   * Clientes elegíveis para vincular a uma empresa do Acessórias — ativos e
   * mensais. Alimenta o seletor da tela de empresas ignoradas.
   */
  async clientesElegiveis(empresaId?: string | null) {
    return prisma.cliente.findMany({
      where: { ...CLIENTE_ATIVO_MENSAL, ...(empresaId ? { empresaId } : {}) },
      select: { id: true, code: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
      take: 2000,
    })
  }

  /**
   * Entregas espelhadas de um cliente no período — é o detalhe por trás do
   * "41 entrega(s)" que aparece no resumo da sincronização. Sai do espelho
   * local, não da API: instantâneo e sem gastar requisição.
   */
  async entregasDoCliente(input: { clienteId: string; de?: string; ate?: string }) {
    const rows = await prisma.acessoriasEntrega.findMany({
      where: {
        clienteId: input.clienteId,
        ...(input.de || input.ate
          ? {
              prazo: {
                ...(input.de ? { gte: new Date(`${input.de}T00:00:00`) } : {}),
                ...(input.ate ? { lte: new Date(`${input.ate}T00:00:00`) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ prazo: 'asc' }, { nome: 'asc' }],
      take: 500,
      select: {
        id: true, nome: true, competencia: true, prazo: true, status: true,
        lida: true, guiaLida: true, multa: true, dpto: true, respEntrega: true,
        dtEntrega: true,
      },
    })
    return rows
  }

  /**
   * Lista o desfecho da última sincronização de empresas, por grupo. É o que
   * transforma o número do card ("46 ignoradas") em uma lista sobre a qual dá
   * para agir.
   */
  async empresasDaUltimaSync(
    situacao: 'casada' | 'atualizada' | 'ignorada' | 'inativa',
    empresaId?: string | null,
  ) {
    const log = await prisma.acessoriasSyncLog.findFirst({
      where: { tipo: 'companies', status: { not: 'running' }, ...(empresaId ? { empresaId } : {}) },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true, detalhes: true },
    })
    if (!log?.detalhes) return { logId: null, quando: null, itens: [], totais: {} as Record<string, number> }
    const todos = (Array.isArray(log.detalhes) ? log.detalhes : []) as Array<Record<string, unknown>>
    const totais: Record<string, number> = {}
    for (const d of todos) {
      const k = String(d.situacao ?? '')
      totais[k] = (totais[k] ?? 0) + 1
    }
    return {
      logId: log.id,
      quando: log.startedAt,
      itens: todos.filter(d => d.situacao === situacao),
      totais,
    }
  }

  /**
   * Vincula à mão uma empresa do Acessórias a um cliente do OneClick — o
   * caminho para resolver as "ignoradas", que são as que o CNPJ não casou.
   */
  async vincularEmpresaCliente(input: {
    clienteId: string
    idAcessorias: number
    cnpjAcessorias?: string | null
  }) {
    const alvo = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...CLIENTE_ATIVO_MENSAL },
      select: { id: true },
    })
    if (!alvo) {
      throw new Error('Só é possível vincular a um cliente ativo e de situação mensal.')
    }
    const jaUsado = await prisma.cliente.findFirst({
      where: { idAcessorias: input.idAcessorias, id: { not: input.clienteId } },
      select: { id: true, code: true, razaoSocial: true },
    })
    if (jaUsado) {
      // Dois clientes com o mesmo código do Acessórias fariam as entregas
      // aparecerem no lugar errado — pior que não vincular.
      throw new Error(`Este código do Acessórias já está no cliente #${jaUsado.code} — ${jaUsado.razaoSocial}.`)
    }
    await prisma.cliente.update({
      where: { id: input.clienteId },
      data: {
        idAcessorias: input.idAcessorias,
        ...(input.cnpjAcessorias ? { cnpjAcessorias: input.cnpjAcessorias } : {}),
      },
    })
    return { ok: true }
  }

  /** Grava o resultado da importação, substituindo o anterior da empresa. */
  private async guardarObservadas(
    itens: Array<{ nome: string; ocorrencias: number; departamento: string | null }>,
    empresaId: string | null,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.acessoriasObrigacaoObservada.deleteMany({ where: { empresaId } })
      if (itens.length === 0) return
      await tx.acessoriasObrigacaoObservada.createMany({
        data: itens.map(i => ({
          nome: i.nome,
          ocorrencias: i.ocorrencias,
          departamento: i.departamento,
          empresaId,
        })),
        skipDuplicates: true,
      })
    })
  }

  /**
   * Lista guardada da última importação. É o que a tela carrega ao abrir —
   * instantâneo e sem tocar na API. Vazia significa "nunca importou", e a tela
   * orienta a rodar a importação.
   */
  async listObligationsObservedCache(empresaId?: string | null) {
    const rows = await prisma.acessoriasObrigacaoObservada.findMany({
      where: { empresaId: empresaId ?? null },
      orderBy: [{ ocorrencias: 'desc' }, { nome: 'asc' }],
      select: { nome: true, ocorrencias: true, departamento: true, atualizadoEm: true },
    }).catch(() => [])
    return {
      itens: rows.map(r => ({ nome: r.nome, ocorrencias: r.ocorrencias, departamento: r.departamento })),
      atualizadoEm: rows[0]?.atualizadoEm ?? null,
    }
  }

  /**
   * Vínculos agrupados por serviço — a visão que permite enxergar o estrago
   * quando uma sugestão em lote concentra obrigações demais num serviço só.
   */
  async resumoVinculos(empresaId?: string | null) {
    const maps = await prisma.acessoriasObligationMap.findMany({
      where: { ...(empresaId !== undefined ? { empresaId } : {}), servicoId: { not: null } },
      select: { id: true, nome: true, servicoId: true, origem: true, ativo: true },
    })
    const servicoIds = [...new Set(maps.map(m => m.servicoId).filter(Boolean) as string[])]
    const servicos = await prisma.servico.findMany({
      where: { id: { in: servicoIds } },
      select: { id: true, nome: true },
    })
    const nomePorId = new Map(servicos.map(s => [s.id, s.nome]))

    const porServico = new Map<string, {
      servicoId: string; servicoNome: string
      total: number; auto: number; manual: number; obrigacoes: string[]
    }>()
    for (const m of maps) {
      if (!m.servicoId) continue
      const atual = porServico.get(m.servicoId) ?? {
        servicoId: m.servicoId,
        servicoNome: nomePorId.get(m.servicoId) ?? '(serviço removido)',
        total: 0, auto: 0, manual: 0, obrigacoes: [] as string[],
      }
      atual.total++
      if (m.origem === 'auto') atual.auto++; else atual.manual++
      if (atual.obrigacoes.length < 100) atual.obrigacoes.push(m.nome)
      porServico.set(m.servicoId, atual)
    }
    // Mais vínculos primeiro: é onde a sugestão automática costuma ter exagerado.
    return [...porServico.values()].sort((a, b) => b.total - a.total)
  }

  /**
   * Remove vínculos em lote. Os filtros se somam — sem nenhum, não remove nada
   * (uma limpeza sem alvo apagaria o mapeamento inteiro por engano).
   */
  async removerVinculosEmLote(input: {
    servicoIds?: string[]
    /** Quando true, só remove os que vieram da sugestão automática. */
    apenasAuto?: boolean
    empresaId?: string | null
  }) {
    const temAlvo = (input.servicoIds && input.servicoIds.length > 0) || input.apenasAuto === true
    if (!temAlvo) return { removidos: 0 }

    const res = await prisma.acessoriasObligationMap.deleteMany({
      where: {
        ...(input.empresaId !== undefined ? { empresaId: input.empresaId } : {}),
        ...(input.servicoIds && input.servicoIds.length > 0 ? { servicoId: { in: input.servicoIds } } : {}),
        ...(input.apenasAuto ? { origem: 'auto' } : {}),
      },
    })
    return { removidos: res.count }
  }
}
