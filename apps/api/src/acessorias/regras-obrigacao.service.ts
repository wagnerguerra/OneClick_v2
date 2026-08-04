import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Regras de aplicabilidade das obrigações do Acessórias.
 *
 * O problema que elas resolvem: o Acessórias lista obrigações que nem sempre
 * são devidas — configuração antiga que ninguém desativou, cliente que mudou de
 * regime, obrigação criada por engano. Elas voltam a cada sincronização e o
 * painel de prazos vira ruído. Quem precisa cobrar o cliente desiste de olhar
 * uma lista cheia de coisa que não interessa.
 *
 * Uma regra diz, para uma obrigação: "não é devida". O escopo pode ser um
 * cliente específico ou todos. A regra com cliente vence a geral, o que permite
 * expressar "não é devida por ninguém, exceto o cliente X" com duas linhas.
 */

export interface RegraInput {
  nome: string
  clienteId?: string | null
  considerar: boolean
  motivo?: string | null
}

@Injectable()
export class RegrasObrigacaoService {
  /**
   * Índice de decisão para a sincronização. Carregado UMA vez por rodada — a
   * alternativa seria uma consulta por entrega, e são milhares.
   */
  async carregarIndice(empresaId?: string | null) {
    const regras = await prisma.acessoriasRegraObrigacao.findMany({
      where: empresaId !== undefined ? { empresaId } : {},
      select: { nome: true, clienteId: true, considerar: true },
    }).catch(() => [])

    const geral = new Map<string, boolean>()
    const porCliente = new Map<string, boolean>()
    for (const r of regras) {
      const chave = r.nome.trim().toLowerCase()
      if (r.clienteId) porCliente.set(`${r.clienteId}::${chave}`, r.considerar)
      else geral.set(chave, r.considerar)
    }

    /**
     * true = a obrigação deve entrar. Sem regra, entra: a lista do Acessórias
     * é a verdade padrão e a regra é a exceção declarada pelo time.
     */
    return (nome: string, clienteId: string): boolean => {
      const chave = String(nome ?? '').trim().toLowerCase()
      const especifica = porCliente.get(`${clienteId}::${chave}`)
      if (especifica !== undefined) return especifica
      const g = geral.get(chave)
      if (g !== undefined) return g
      return true
    }
  }

  async listar(empresaId?: string | null) {
    const regras = await prisma.acessoriasRegraObrigacao.findMany({
      where: empresaId !== undefined ? { empresaId } : {},
      orderBy: [{ nome: 'asc' }, { clienteId: 'asc' }],
      include: { cliente: { select: { id: true, code: true, razaoSocial: true } } },
    })
    return regras.map(r => ({
      id: r.id,
      nome: r.nome,
      considerar: r.considerar,
      motivo: r.motivo,
      criadoEm: r.createdAt,
      cliente: r.cliente ? { id: r.cliente.id, code: r.cliente.code, razaoSocial: r.cliente.razaoSocial } : null,
    }))
  }

  /**
   * Cria ou atualiza a regra e já limpa o espelho do que ela passa a excluir.
   *
   * Sem essa limpeza a regra só faria efeito na próxima sincronização, e o
   * usuário veria a linha continuar no painel logo após tê-la marcado como não
   * devida — parecendo que a regra não funcionou.
   */
  async salvar(input: RegraInput, empresaId?: string | null, userId?: string) {
    const nome = input.nome.trim()
    if (!nome) throw new Error('Informe a obrigação.')

    const existente = await prisma.acessoriasRegraObrigacao.findFirst({
      where: { empresaId: empresaId ?? null, nome, clienteId: input.clienteId ?? null },
      select: { id: true },
    })

    const dados = {
      considerar: input.considerar,
      motivo: input.motivo?.trim() || null,
    }

    const regra = existente
      ? await prisma.acessoriasRegraObrigacao.update({ where: { id: existente.id }, data: dados })
      : await prisma.acessoriasRegraObrigacao.create({
          data: {
            nome,
            clienteId: input.clienteId ?? null,
            empresaId: empresaId ?? null,
            criadoPor: userId ?? null,
            ...dados,
          },
        })

    const removidos = input.considerar ? 0 : await this.limparEspelho(nome, input.clienteId ?? null, empresaId ?? null)
    return { regra: { id: regra.id }, removidos }
  }

  async remover(id: string) {
    await prisma.acessoriasRegraObrigacao.delete({ where: { id } })
    return { ok: true }
  }

  /**
   * Tira do espelho as entregas que a regra passa a excluir. Só mexe no
   * espelho: a execução de serviço, se existir, é trabalho já registrado e não
   * cabe apagar por causa de uma regra de exibição.
   */
  private async limparEspelho(nome: string, clienteId: string | null, empresaId: string | null) {
    const res = await prisma.acessoriasEntrega.deleteMany({
      where: {
        nome,
        ...(clienteId ? { clienteId } : {}),
        ...(empresaId ? { empresaId } : {}),
      },
    }).catch(() => ({ count: 0 }))
    return res.count
  }

  /** Quantas entregas espelhadas cada regra está excluindo hoje — usado na tela. */
  async contarImpacto(empresaId?: string | null) {
    const regras = await prisma.acessoriasRegraObrigacao.findMany({
      where: { considerar: false, ...(empresaId !== undefined ? { empresaId } : {}) },
      select: { nome: true },
    }).catch(() => [])
    return { obrigacoesExcluidas: new Set(regras.map(r => r.nome)).size }
  }
}
