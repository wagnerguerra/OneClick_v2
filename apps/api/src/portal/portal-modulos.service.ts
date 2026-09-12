import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { MODULOS_DO_PORTAL, resolverLiberados } from './portal-modulos'

/**
 * Liberação dos módulos do Portal do Cliente, por empresa.
 *
 * Quem decide é o master da plataforma, em `/admin/empresas`. É gate de
 * produto: o escritório pode não querer que o cliente veja obrigações
 * atrasadas, ou pode vender o portal em camadas.
 */
@Injectable()
export class PortalModulosService {
  /** O catálogo com a situação de cada módulo numa empresa, para a tela. */
  async listar(empresaId: string) {
    const excecoes = await prisma.portalModuloEmpresa.findMany({
      where: { empresaId },
      select: { modulo: true, liberado: true },
    })
    const liberados = resolverLiberados(excecoes)

    return MODULOS_DO_PORTAL.map(m => ({
      slug: m.slug,
      rotulo: m.rotulo,
      descricao: m.descricao,
      implementado: m.implementado,
      padrao: m.padrao,
      liberado: liberados.has(m.slug),
      /** A empresa tem decisão própria, ou está seguindo o padrão? */
      personalizado: excecoes.some(e => e.modulo === m.slug),
    }))
  }

  /** Só os slugs liberados — o que o gate do portal consulta. */
  async liberados(empresaId: string): Promise<Set<string>> {
    const excecoes = await prisma.portalModuloEmpresa.findMany({
      where: { empresaId },
      select: { modulo: true, liberado: true },
    })
    return resolverLiberados(excecoes)
  }

  /**
   * Liga ou desliga um módulo numa empresa.
   *
   * Grava a exceção mesmo quando o valor coincide com o padrão. Parece
   * redundante e não é: registra que ALGUÉM DECIDIU aquilo, com autor e data.
   * Sem isso, "seguindo o padrão" e "decidido que fique assim" ficariam
   * indistinguíveis, e mudar o padrão no código mudaria empresas em que a
   * escolha já havia sido feita.
   */
  async definir(
    input: { empresaId: string; modulo: string; liberado: boolean },
    autorId: string,
  ) {
    const conhecido = MODULOS_DO_PORTAL.find(m => m.slug === input.modulo)
    if (!conhecido) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Módulo desconhecido.' })
    }

    const empresa = await prisma.empresa.findUnique({
      where: { id: input.empresaId },
      select: { id: true },
    })
    if (!empresa) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Empresa não encontrada.' })
    }

    await prisma.portalModuloEmpresa.upsert({
      where: { empresaId_modulo: { empresaId: input.empresaId, modulo: input.modulo } },
      create: {
        empresaId: input.empresaId,
        modulo: input.modulo,
        liberado: input.liberado,
        alteradoPorId: autorId,
      },
      update: { liberado: input.liberado, alteradoPorId: autorId },
    })
    return { ok: true }
  }

  /** Volta a empresa ao padrão do catálogo, apagando a exceção. */
  async voltarAoPadrao(empresaId: string, modulo: string) {
    await prisma.portalModuloEmpresa.deleteMany({ where: { empresaId, modulo } })
    return { ok: true }
  }

  /**
   * As empresas que a tela do master lista.
   *
   * Traz a contagem de clientes com portal: a decisão de liberar módulo pesa
   * diferente numa empresa com 300 clientes usando o portal e numa que tem
   * zero. Sem o número, o master escolhe no escuro.
   */
  async empresasComPortal() {
    const empresas = await prisma.empresa.findMany({
      orderBy: { nomeFantasia: 'asc' },
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        _count: { select: { clientes: true } },
      },
    })

    const usuarios = await prisma.clienteUsuario.groupBy({
      by: ['clienteId'],
      where: { ativo: true },
      _count: { _all: true },
    })
    const clientesComUsuario = new Set(usuarios.map(u => u.clienteId))

    // Uma consulta só para descobrir a qual empresa cada cliente com portal
    // pertence — evita N consultas, uma por empresa.
    const donos = clientesComUsuario.size > 0
      ? await prisma.cliente.findMany({
        where: { id: { in: [...clientesComUsuario] } },
        select: { empresaId: true },
      })
      : []

    const porEmpresa = new Map<string, number>()
    for (const d of donos) {
      if (!d.empresaId) continue
      porEmpresa.set(d.empresaId, (porEmpresa.get(d.empresaId) ?? 0) + 1)
    }

    return empresas.map(e => ({
      id: e.id,
      nome: e.nomeFantasia || e.razaoSocial || e.id,
      clientes: e._count.clientes,
      clientesComPortal: porEmpresa.get(e.id) ?? 0,
    }))
  }
}
