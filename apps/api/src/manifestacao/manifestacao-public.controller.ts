import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { prisma } from '@saas/db'
import { criarManifestacaoPublicaSchema } from '@saas/types'
import { ManifestacaoService } from './manifestacao.service'

/**
 * Portal público das manifestações (fase 5) — a única superfície do módulo
 * exposta na internet, e por isso um controller próprio, fora do tRPC:
 *
 *  - POST /api/manifestacao-publica            → registra (devolve o protocolo)
 *  - GET  /api/manifestacao-publica/:protocolo → acompanha a tratativa
 *
 * Proteções: limite por IP (janela deslizante em memória — 5 registros e 30
 * consultas por hora), campo-isca validado no schema, e o payload de leitura
 * é o MESMO redigido do `porProtocolo` (sem autor, sem notas internas).
 * O registro entra sempre como não triado (status inicial do tipo), origem
 * CLIENTE e canal SITE — a triagem é interna.
 */

const LIMITE_CRIAR_HORA = 5
const LIMITE_CONSULTA_HORA = 30
const JANELA_MS = 60 * 60 * 1000

@Controller('api/manifestacao-publica')
export class ManifestacaoPublicController {
  constructor(private readonly service: ManifestacaoService) {}

  /** ip → timestamps na janela. Memória local basta: uma instância da API. */
  private hits = new Map<string, number[]>()

  private estourou(ip: string, chave: string, limite: number): boolean {
    const k = `${chave}:${ip}`
    const agora = Date.now()
    const lista = (this.hits.get(k) ?? []).filter((t) => agora - t < JANELA_MS)
    if (lista.length >= limite) { this.hits.set(k, lista); return true }
    lista.push(agora)
    this.hits.set(k, lista)
    // Faxina ocasional pra não crescer sem limite.
    if (this.hits.size > 5000) {
      for (const [key, ts] of this.hits) {
        if (!ts.some((t) => agora - t < JANELA_MS)) this.hits.delete(key)
      }
    }
    return false
  }

  private ip(req: Request): string {
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0]!.trim()
    return req.ip || req.socket?.remoteAddress || 'desconhecido'
  }

  /** A empresa do portal: a instalação tem UMA (multi-tenant público viria
   *  por host, como o resto do tenant-resolve — documentado no doc do módulo). */
  private async empresaDoPortal(): Promise<string | null> {
    const e = await prisma.empresa.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
    return e?.id ?? null
  }

  @Post()
  async criar(@Req() req: Request, @Body() body: unknown, @Res() res: Response) {
    if (this.estourou(this.ip(req), 'criar', LIMITE_CRIAR_HORA)) {
      res.status(429).json({ message: 'Muitos registros em pouco tempo. Tente de novo mais tarde.' })
      return
    }
    const parsed = criarManifestacaoPublicaSchema.safeParse(body)
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' })
      return
    }
    const input = parsed.data
    try {
      const empresaId = await this.empresaDoPortal()
      const criado = await this.service.criar({
        tipo: input.tipo,
        origem: 'CLIENTE',
        anonima: input.anonima,
        clienteId: null,
        informanteNome: input.anonima ? null : (input.informanteNome || null),
        informanteEmail: input.anonima ? null : (input.informanteEmail || null),
        informanteTelefone: input.anonima ? null : (input.informanteTelefone || null),
        canal: 'SITE',
        areaId: null,
        elogiadosIds: [],
        titulo: input.titulo || null,
        descricao: input.descricao,
        dataOcorrido: input.dataOcorrido || null,
        publica: false,
      }, null, empresaId)
      // Só o protocolo volta — é a credencial de acompanhamento.
      res.status(201).json({ protocolo: criado.protocolo, tipo: criado.tipo })
    } catch {
      res.status(500).json({ message: 'Não foi possível registrar. Tente de novo.' })
    }
  }

  @Get(':protocolo')
  async consultar(@Req() req: Request, @Param('protocolo') protocolo: string, @Res() res: Response) {
    if (this.estourou(this.ip(req), 'consulta', LIMITE_CONSULTA_HORA)) {
      res.status(429).json({ message: 'Muitas consultas em pouco tempo. Tente de novo mais tarde.' })
      return
    }
    if (!/^[A-Z]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(protocolo.trim())) {
      res.status(400).json({ message: 'Protocolo inválido. Confira o código (ex.: ELO-7K3M-92QF).' })
      return
    }
    try {
      const m = await this.service.porProtocolo(protocolo)
      res.json(m)
    } catch {
      // Mesma resposta para "não existe": não vira oráculo de protocolos.
      res.status(404).json({ message: 'Protocolo não encontrado. Confira o código.' })
    }
  }
}
