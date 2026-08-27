import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { ehCnpjAlfanumerico, limparCnpj } from '@saas/types'
import { DossieService } from './dossie.service'

/**
 * Varredura da base existente.
 *
 * Idempotente por construção: o TTL de 60 dias faz cliente já coletado
 * responder do que está gravado, então rodar de novo não repete consulta. Isso
 * é também o mecanismo de retomada — interromper no meio e recomeçar continua
 * de onde parou, sem precisar guardar cursor.
 *
 * `dryRun` é o padrão. Nada sai para a internet antes de você ver a conta.
 */

export type ProgressoBackfill = {
  rodando: boolean
  total: number
  processados: number
  ok: number
  erros: number
  pulados: number
  clienteAtual: string
  iniciadoEm: string | null
  ultimoErro: string | null
}

/** Respeitar a cota das fontes gratuitas importa mais que terminar rápido. */
const DELAY_PADRAO_MS = 350

@Injectable()
export class DossieBackfillService {
  private progresso: ProgressoBackfill = {
    rodando: false, total: 0, processados: 0, ok: 0, erros: 0, pulados: 0,
    clienteAtual: '', iniciadoEm: null, ultimoErro: null,
  }
  private cancelar = false

  constructor(@Inject(DossieService) private readonly dossie: DossieService) {}

  getProgresso(): ProgressoBackfill { return { ...this.progresso } }

  pedirCancelamento(): void { this.cancelar = true }

  /**
   * `dryRun` conta e classifica sem consultar nada.
   * `limite` fecha o lote — para uma primeira rodada pequena e observada.
   */
  async executar(opts?: { dryRun?: boolean; limite?: number; delayMs?: number; empresaId?: string; usuarioId?: string }) {
    const dryRun = opts?.dryRun !== false
    if (this.progresso.rodando) throw new Error('Já existe uma varredura em andamento.')

    const candidatos = await prisma.cliente.findMany({
      where: {
        tipoDocumento: 'CNPJ',
        status: 'ATIVO',
        ...(opts?.empresaId ? { empresaId: opts.empresaId } : {}),
      },
      select: { id: true, razaoSocial: true, documento: true, cnpjAcessorias: true, cnaePrincipal: true },
      orderBy: { razaoSocial: 'asc' },
      ...(opts?.limite ? { take: opts.limite } : {}),
    })

    // Separa antes de gastar rede: documento torto e alfanumérico não têm
    // consulta possível hoje, e precisam aparecer no relatório como tal — não
    // como "erro" no fim de uma hora de varredura.
    const alfanumericos: string[] = []
    const invalidos: string[] = []
    const consultaveis: typeof candidatos = []
    for (const c of candidatos) {
      const doc = limparCnpj(c.cnpjAcessorias || c.documento)
      if (doc.length !== 14) { invalidos.push(c.razaoSocial); continue }
      if (ehCnpjAlfanumerico(doc)) { alfanumericos.push(c.razaoSocial); continue }
      consultaveis.push(c)
    }

    if (dryRun) {
      const semCnae = consultaveis.filter(c => !c.cnaePrincipal).length
      return {
        dryRun: true,
        total: candidatos.length,
        consultaveis: consultaveis.length,
        semCnae,
        alfanumericos: alfanumericos.length,
        invalidos: invalidos.length,
        exemplosAlfanumericos: alfanumericos.slice(0, 10),
        exemplosInvalidos: invalidos.slice(0, 10),
        estimativaMinutos: Math.ceil((consultaveis.length * (opts?.delayMs ?? DELAY_PADRAO_MS)) / 60000),
      }
    }

    this.cancelar = false
    this.progresso = {
      rodando: true, total: consultaveis.length, processados: 0, ok: 0, erros: 0,
      pulados: alfanumericos.length + invalidos.length,
      clienteAtual: '', iniciadoEm: new Date().toISOString(), ultimoErro: null,
    }

    const delay = opts?.delayMs ?? DELAY_PADRAO_MS
    for (const c of consultaveis) {
      if (this.cancelar) break
      this.progresso.clienteAtual = c.razaoSocial
      try {
        const r = await this.dossie.enriquecer(c.id, { usuarioId: opts?.usuarioId })
        if (r.ok) this.progresso.ok++
        else { this.progresso.erros++; this.progresso.ultimoErro = `${c.razaoSocial}: ${r.motivo ?? 'sem motivo'}` }
      } catch (e) {
        this.progresso.erros++
        this.progresso.ultimoErro = `${c.razaoSocial}: ${(e as Error).message}`
      }
      this.progresso.processados++
      if (delay > 0) await new Promise(r => setTimeout(r, delay))
    }

    this.progresso.rodando = false
    this.progresso.clienteAtual = ''
    return { dryRun: false, ...this.getProgresso(), cancelado: this.cancelar }
  }
}
