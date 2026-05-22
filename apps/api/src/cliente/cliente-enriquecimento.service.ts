import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CnpjService } from '../cnpj/cnpj.service'

/**
 * Service dedicado a enriquecer dados de Cliente a partir de fontes externas
 * (BrasilAPI → SERPRO fallback). Focado em popular `cnaePrincipal`, mas
 * pode evoluir pra atualizar razão social, situação, endereço etc.
 *
 * Separado do ClienteService grande pra evitar circular DI e manter escopo
 * claro: este service só lê do CNPJ externo + grava em Cliente.
 */
@Injectable()
export class ClienteEnriquecimentoService {
  constructor(
    @Inject(CnpjService) private readonly cnpjService: CnpjService,
  ) {}

  /**
   * Enriquece um cliente específico. Atualiza cnaePrincipal e (se ainda
   * vazios) razaoSocial e situação. Retorna o status e o que foi alterado.
   */
  async enriquecerCnae(clienteId: string) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true, documento: true, cnpjAcessorias: true,
        cnaePrincipal: true, razaoSocial: true,
      },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')
    const cnpj = (cliente.cnpjAcessorias ?? cliente.documento).replace(/\D/g, '')
    if (cnpj.length !== 14) {
      return { ok: false, motivo: 'CNPJ inválido (não tem 14 dígitos).', clienteId }
    }

    let dados: Awaited<ReturnType<typeof this.cnpjService.consultarPreferindoBrasilApi>>
    try {
      dados = await this.cnpjService.consultarPreferindoBrasilApi(cnpj)
    } catch (e) {
      return { ok: false, motivo: (e as Error).message, clienteId }
    }

    const atualizar: any = {}
    if (dados.cnaePrincipalCodigo && dados.cnaePrincipalCodigo !== cliente.cnaePrincipal) {
      atualizar.cnaePrincipal = dados.cnaePrincipalCodigo
    }
    if (!cliente.razaoSocial && dados.razaoSocial) {
      atualizar.razaoSocial = dados.razaoSocial
    }

    if (Object.keys(atualizar).length === 0) {
      return { ok: true, atualizado: false, motivo: 'Sem dados novos.', fonte: dados.fonte, clienteId }
    }

    await prisma.cliente.update({ where: { id: clienteId }, data: atualizar })
    return {
      ok: true,
      atualizado: true,
      campos: Object.keys(atualizar),
      cnaePrincipal: dados.cnaePrincipalCodigo,
      atividadePrincipal: dados.atividadePrincipal,
      fonte: dados.fonte,
      clienteId,
    }
  }

  /**
   * Enriquece TODOS os clientes sem cnaePrincipal preenchido. Rate-limited
   * (200ms entre chamadas) pra não saturar BrasilAPI. Retorna estatísticas.
   */
  async enriquecerCnaeBulk(opts?: { limite?: number; apenasSemCnae?: boolean }) {
    const apenasSemCnae = opts?.apenasSemCnae ?? true
    const where: any = {}
    if (apenasSemCnae) where.cnaePrincipal = null

    const clientes = await prisma.cliente.findMany({
      where,
      select: { id: true, documento: true, razaoSocial: true },
      take: opts?.limite ?? 1000,
    })

    const stats = { total: clientes.length, atualizados: 0, semDados: 0, erros: 0, brasilapi: 0, serpro: 0 }
    const detalhes: Array<{ clienteId: string; razao: string; ok: boolean; campos?: string[]; motivo?: string; fonte?: string }> = []

    for (const c of clientes) {
      const cnpj = c.documento.replace(/\D/g, '')
      if (cnpj.length !== 14) {
        stats.semDados++
        detalhes.push({ clienteId: c.id, razao: c.razaoSocial, ok: false, motivo: 'CNPJ inválido' })
        continue
      }
      try {
        const res = await this.enriquecerCnae(c.id)
        if (res.ok && res.atualizado) {
          stats.atualizados++
          if (res.fonte === 'brasilapi') stats.brasilapi++
          else if (res.fonte === 'serpro') stats.serpro++
          detalhes.push({ clienteId: c.id, razao: c.razaoSocial, ok: true, campos: res.campos, fonte: res.fonte })
        } else if (res.ok && !res.atualizado) {
          stats.semDados++
          detalhes.push({ clienteId: c.id, razao: c.razaoSocial, ok: true, motivo: res.motivo })
        } else {
          stats.erros++
          detalhes.push({ clienteId: c.id, razao: c.razaoSocial, ok: false, motivo: res.motivo })
        }
      } catch (e) {
        stats.erros++
        detalhes.push({ clienteId: c.id, razao: c.razaoSocial, ok: false, motivo: (e as Error).message })
      }
      // Rate limit (200ms) — BrasilAPI tolera ~5 req/s pacificamente
      await new Promise((r) => setTimeout(r, 200))
    }

    return { stats, detalhes }
  }
}
