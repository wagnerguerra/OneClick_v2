import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'
import { randomUUID } from 'crypto'

/**
 * Sincronização de consultas ERP/SCI via Launcher local.
 *
 * Por que existir: o SCI (Firebird) fica na rede local do escritório. Quando a
 * API está deployada na VPS, ela NÃO consegue acessar o Firebird diretamente
 * (NAT/firewall). Solução: o Service Manager (Electron rodando no PC do
 * escritório) mantém uma conexão SSE aberta com a VPS. Quando o usuário clica
 * "Verificar no ERP" no app, a VPS publica um evento via SSE; o Launcher
 * recebe, executa `sci_metrics.py` localmente, e devolve o resultado via
 * callback HTTP autenticado.
 *
 * Fluxo:
 *   1. `requestErpRemote(payload)` cria um requestId, registra promise pendente
 *      e emite evento SSE `'contrato-erp-request'`
 *   2. Launcher (escutando SSE) executa SCI, posta POST /callback/:requestId
 *   3. `resolveRemoteRequest(requestId, dados)` resolve a promise
 *   4. Timeout default 90s — se não responder, rejeita com mensagem clara
 */

export type ContratoSyncEvent =
  | { type: 'ping'; timestamp: number }
  | { type: 'contrato-erp-request'; requestId: string; payload: ContratoErpPayload; timestamp: number }
  // Import do cadastro legado (OneClick v1 / MySQL db_intranet) via Launcher —
  // o SM lê o MySQL local (LAN) e devolve as linhas cruas; a API aplica.
  | { type: 'cliente-import-request'; requestId: string; payload: ClienteImportPayload; timestamp: number }

export interface ContratoErpPayload {
  cnpj: string
  datai: string  // YYYY-MM-DD
  dataf: string  // YYYY-MM-DD
  indicadores?: string[]
}

export interface ClienteImportPayload {
  cnpj: string // só dígitos
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
  startedAt: number
}

const TIMEOUT_DEFAULT_MS = 90_000

@Injectable()
export class ContratoSyncService {
  private readonly subject = new Subject<ContratoSyncEvent>()
  private readonly pending = new Map<string, PendingRequest>()

  get events$() {
    return this.subject.asObservable()
  }

  /**
   * Cria um pedido remoto e devolve uma Promise que resolve quando o Launcher
   * postar o callback. Usado pelo cliente.service.ts em produção quando o SCI
   * local não está acessível.
   */
  async requestErpRemote(payload: ContratoErpPayload, timeoutMs = TIMEOUT_DEFAULT_MS): Promise<Record<string, unknown>> {
    const requestId = randomUUID()

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(
          `Launcher local não respondeu em ${Math.round(timeoutMs / 1000)}s. ` +
          `Verifique se o Service Manager está aberto e conectado.`,
        ))
      }, timeoutMs)

      this.pending.set(requestId, { resolve, reject, timer, startedAt: Date.now() })

      // Publica o pedido no SSE — o Launcher escuta esse stream e executa
      this.subject.next({
        type: 'contrato-erp-request',
        requestId,
        payload,
        timestamp: Date.now(),
      })
    })
  }

  /**
   * Pedido de import do cadastro legado (registros/acessos/vencimentos/sócios)
   * pelo Launcher, que lê o MySQL local e devolve as linhas via callback.
   */
  async requestClienteImport(cnpj: string, timeoutMs = 20_000): Promise<Record<string, unknown>> {
    // Falha rápido e claro se NENHUM Service Manager está escutando o SSE — evita
    // esperar o timeout inteiro (e o proxy estourar em 500) quando o SM está fechado.
    if (this.subject.observers.length === 0) {
      throw new Error('Service Manager não está conectado. Abra o Service Manager no PC do escritório — ele faz a ponte com o cadastro legado (OneClick v1).')
    }
    const requestId = randomUUID()
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(
          `Launcher local não respondeu em ${Math.round(timeoutMs / 1000)}s. ` +
          `Verifique se o Service Manager está aberto e conectado.`,
        ))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer, startedAt: Date.now() })
      this.subject.next({ type: 'cliente-import-request', requestId, payload: { cnpj }, timestamp: Date.now() })
    })
  }

  /**
   * Resolve um pedido pendente — chamado pelo callback REST quando o Launcher
   * termina a consulta SCI local. Idempotente: se o requestId não existe ou
   * já expirou, retorna false.
   */
  resolveRemoteRequest(requestId: string, dados: Record<string, unknown>): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    this.pending.delete(requestId)
    pending.resolve(dados)
    return true
  }

  /** Rejeita um pedido pendente — usado se o Launcher reportar erro */
  rejectRemoteRequest(requestId: string, mensagem: string): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    this.pending.delete(requestId)
    pending.reject(new Error(mensagem))
    return true
  }

  /** Métricas pra UI (badge de status / health) */
  getStatus() {
    return {
      pendingCount: this.pending.size,
      pending: Array.from(this.pending.entries()).map(([id, p]) => ({
        requestId: id,
        ageMs: Date.now() - p.startedAt,
      })),
    }
  }
}
