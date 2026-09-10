import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { hashPassword } from 'better-auth/crypto'
import { randomBytes } from 'node:crypto'

import type { PortalNivel } from '../portal/portal-escopo'

/**
 * Usuários do cliente — o lado INTERNO do Portal do Cliente.
 *
 * Isto é o que o escritório opera na aba "Usuários" do cadastro do cliente.
 * A visão do próprio cliente (o portal em si) vive em `portal.*` e nunca passa
 * por aqui.
 *
 * Duas regras estruturam o serviço inteiro:
 *
 *  1. Usuário externo e colaborador interno são populações separadas. Um e-mail
 *     que já pertence a alguém do escritório NUNCA é convertido em usuário de
 *     portal — seria dar a um colaborador um segundo caminho de acesso, com
 *     outro conjunto de regras, sobre dados de cliente.
 *  2. O mesmo usuário externo pode ser vinculado a VÁRIOS clientes. É o caso do
 *     diretor de grupo com matriz e filiais, e a razão de o vínculo ser tabela.
 *     Vincular alguém que já existe é o caminho normal, não a exceção.
 */

/** Papel que marca o usuário como externo. Já existia no schema, sem uso. */
const ROLE_EXTERNO = 'COLABORADOR_CLIENTE'

export interface VincularInput {
  clienteId: string
  email: string
  nome: string
  nivel: PortalNivel
  /** Ids de `Area`. Validados contra o que o cliente contratou. */
  areas: string[]
  telefone?: string | null
}

@Injectable()
export class ClienteUsuarioService {
  /** Usuários vinculados a um cliente, para a aba do cadastro. */
  async listar(clienteId: string) {
    const vinculos = await prisma.clienteUsuario.findMany({
      where: { clienteId },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'asc' }],
      select: {
        id: true,
        nivel: true,
        areas: true,
        ativo: true,
        criadoEm: true,
        user: {
          select: {
            id: true, name: true, email: true, telefone: true,
            isActive: true, emailVerified: true, lastActivityAt: true,
          },
        },
        criadoPor: { select: { name: true } },
      },
    })

    // Quantos outros clientes cada um enxerga. É o que denuncia, na tela, que
    // aquele usuário é de um grupo — e evita que alguém o exclua achando que
    // está mexendo só neste cliente.
    const ids = vinculos.map(v => v.user.id)
    const contagens = ids.length
      ? await prisma.clienteUsuario.groupBy({
          by: ['userId'],
          where: { userId: { in: ids }, ativo: true },
          _count: { _all: true },
        })
      : []
    const porUsuario = new Map(contagens.map(c => [c.userId, c._count._all]))

    return vinculos.map(v => ({
      ...v,
      outrosClientes: Math.max(0, (porUsuario.get(v.user.id) ?? 0) - 1),
    }))
  }

  /**
   * Áreas que o cliente contrata — o teto do que se pode conceder.
   *
   * A tela precisa disto para não oferecer uma área que não abriria nada:
   * `intersecaoAreas` no portal descartaria a concessão em silêncio, e o
   * escritório ficaria achando que liberou algo que o usuário não vê.
   */
  async areasDisponiveis(clienteId: string) {
    const areas = await prisma.clienteAreaContratada.findMany({
      where: { clienteId, contratado: true },
      select: { areaId: true, area: { select: { name: true } } },
      orderBy: { area: { name: 'asc' } },
    })
    return areas.map(a => ({ id: a.areaId, nome: a.area.name }))
  }

  /**
   * Vincula um usuário ao cliente, criando-o se ainda não existir.
   *
   * Devolve `criouUsuario` para a tela poder dizer a coisa certa: "convite
   * enviado" quando é gente nova, "vinculado" quando a pessoa já acessava outro
   * cliente do grupo e agora enxerga mais um.
   */
  async vincular(input: VincularInput, ctx: { userId: string; tenantId?: string }) {
    const email = input.email.trim().toLowerCase()
    const nome = input.nome.trim()
    if (!email || !nome) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nome e e-mail são obrigatórios.' })
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: input.clienteId },
      select: { id: true, empresaId: true, status: true },
    })
    if (!cliente) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    if (cliente.status !== 'ATIVO') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cliente inativo não recebe acesso ao portal. Reative o cliente primeiro.',
      })
    }

    const areas = await this.validarAreas(input.clienteId, input.areas)

    const existente = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, name: true, isActive: true },
    })

    if (existente && existente.role !== ROLE_EXTERNO) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          `O e-mail ${email} já pertence a um usuário interno do escritório. `
          + 'Use um endereço do próprio cliente — colaborador interno não vira usuário de portal.',
      })
    }

    if (existente) {
      const jaVinculado = await prisma.clienteUsuario.findUnique({
        where: { userId_clienteId: { userId: existente.id, clienteId: input.clienteId } },
        select: { id: true, ativo: true },
      })
      if (jaVinculado?.ativo) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Este usuário já tem acesso a este cliente.' })
      }
      // Vínculo desativado volta como atualização, preservando a trilha.
      const vinculo = jaVinculado
        ? await prisma.clienteUsuario.update({
            where: { id: jaVinculado.id },
            data: { ativo: true, nivel: input.nivel as never, areas },
          })
        : await prisma.clienteUsuario.create({
            data: {
              userId: existente.id,
              clienteId: input.clienteId,
              nivel: input.nivel as never,
              areas,
              criadoPorId: ctx.userId,
            },
          })
      return { vinculoId: vinculo.id, userId: existente.id, criouUsuario: false }
    }

    // Usuário novo. A senha nasce ALEATÓRIA e descartada: o acesso só existe
    // depois que a pessoa define a própria senha pelo convite. Uma senha padrão
    // conhecida (o `Acesso@123` do cadastro interno) é aceitável dentro do
    // escritório e inaceitável para fora dele.
    const senhaDescartavel = await hashPassword(randomBytes(32).toString('hex'))

    const criado = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: nome,
          email,
          role: ROLE_EXTERNO as never,
          profile: 'OPERADOR' as never,
          telefone: input.telefone || null,
          // O cliente não carrega tenant; o vínculo herda o de quem cadastra,
          // que é sempre alguém do escritório dono daquele cliente.
          empresaId: cliente.empresaId,
          tenantId: ctx.tenantId ?? null,
          emailVerified: false,
          // Não aparece no módulo Colaboradores nem na busca interna de pessoas.
          exibirComoColaborador: false,
        },
        select: { id: true },
      })

      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: senhaDescartavel,
        },
      })

      const vinculo = await tx.clienteUsuario.create({
        data: {
          userId: user.id,
          clienteId: input.clienteId,
          nivel: input.nivel as never,
          areas,
          criadoPorId: ctx.userId,
        },
        select: { id: true },
      })

      return { vinculoId: vinculo.id, userId: user.id }
    })

    return { ...criado, criouUsuario: true }
  }

  /** Muda nível, áreas ou liga/desliga o acesso. */
  async atualizar(
    input: { id: string; nivel?: PortalNivel; areas?: string[]; ativo?: boolean },
  ) {
    const atual = await prisma.clienteUsuario.findUnique({
      where: { id: input.id },
      select: { id: true, clienteId: true, nivel: true },
    })
    if (!atual) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado.' })
    }

    const areas = input.areas ? await this.validarAreas(atual.clienteId, input.areas) : undefined

    // Rebaixar ou desligar o ÚLTIMO administrador deixaria o cliente sem quem
    // gerencie os próprios usuários, e a única saída seria pedir ao escritório.
    const perdeAdmin = atual.nivel === 'ADMINISTRADOR'
      && ((input.nivel && input.nivel !== 'ADMINISTRADOR') || input.ativo === false)
    if (perdeAdmin) await this.exigirOutroAdministrador(atual.clienteId, atual.id)

    return prisma.clienteUsuario.update({
      where: { id: input.id },
      data: {
        ...(input.nivel ? { nivel: input.nivel as never } : {}),
        ...(areas ? { areas } : {}),
        ...(input.ativo != null ? { ativo: input.ativo } : {}),
      },
      select: { id: true },
    })
  }

  /**
   * Remove o vínculo com ESTE cliente.
   *
   * O usuário continua existindo: ele pode acessar outros clientes do grupo, e
   * apagá-lo levaria junto a trilha de tudo que ele enviou. Quem quiser encerrar
   * o acesso por completo remove os vínculos um a um — que é o que descreve a
   * realidade.
   */
  async desvincular(id: string) {
    const atual = await prisma.clienteUsuario.findUnique({
      where: { id },
      select: { id: true, clienteId: true, nivel: true },
    })
    if (!atual) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado.' })
    }
    if (atual.nivel === 'ADMINISTRADOR') await this.exigirOutroAdministrador(atual.clienteId, atual.id)

    await prisma.clienteUsuario.delete({ where: { id } })
    return { ok: true }
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /**
   * As áreas concedidas precisam estar entre as CONTRATADAS pelo cliente.
   *
   * Recusar na escrita, e não filtrar em silêncio, é deliberado: filtrar deixaria
   * o escritório convencido de que liberou a folha para alguém que nunca a veria.
   */
  private async validarAreas(clienteId: string, areas: string[]): Promise<string[]> {
    const unicas = [...new Set(areas.filter(Boolean))]
    if (unicas.length === 0) return []

    const contratadas = await prisma.clienteAreaContratada.findMany({
      where: { clienteId, areaId: { in: unicas }, contratado: true },
      select: { areaId: true },
    })
    const validas = new Set(contratadas.map(a => a.areaId))
    const invalidas = unicas.filter(a => !validas.has(a))
    if (invalidas.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Este cliente não contrata ${invalidas.length} das áreas selecionadas. Ajuste os serviços contratados antes de conceder o acesso.`,
      })
    }
    return unicas
  }

  private async exigirOutroAdministrador(clienteId: string, exceto: string) {
    const outros = await prisma.clienteUsuario.count({
      where: { clienteId, ativo: true, nivel: 'ADMINISTRADOR' as never, id: { not: exceto } },
    })
    if (outros === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Este é o último administrador do cliente. Promova outro usuário antes, '
          + 'senão o cliente fica sem quem gerencie os próprios acessos.',
      })
    }
  }
}
