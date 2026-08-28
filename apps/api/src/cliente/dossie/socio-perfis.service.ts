import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { extrairPerfis, type PerfilAchado } from './redes-sociais'
import { searxngPaginas } from '../logo-busca-web'

/**
 * Perfis públicos dos sócios nas redes — o que o comercial já procurava à mão
 * antes de uma reunião, agora guardado no lugar certo.
 *
 * Guarda-se o ENDEREÇO do perfil, e só. Nada do que a pessoa publica é lido ou
 * copiado: o perfil é aberto na hora, na rede, por quem vai à reunião. O campo
 * `observacao` é para a impressão de quem olhou — escrita por uma pessoa, não
 * raspada de lugar nenhum.
 *
 * O que a busca acha nasce como SUGESTÃO, nunca como perfil do sócio. Procurar
 * "João Silva" devolve milhares de perfis e o homônimo é a regra: um perfil
 * errado confirmado sozinho faria alguém entrar na sala com a ideia errada
 * sobre a pessoa à sua frente. Confirmar é ato humano.
 */

const REDES_VALIDAS = new Set(['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X', 'YOUTUBE', 'TIKTOK', 'OUTRO'])

@Injectable()
export class SocioPerfisService {
  async listar(socioId: string) {
    return prisma.socioPerfilSocial.findMany({
      where: { socioId },
      orderBy: [{ confirmado: 'desc' }, { rede: 'asc' }, { criadoEm: 'asc' }],
    })
  }

  /** Todos os perfis dos sócios de um cliente, para a tela do dossiê. */
  async listarPorCliente(clienteId: string) {
    const socios = await prisma.socio.findMany({
      where: { clienteId, isActive: true },
      select: {
        id: true, nomeCompleto: true, cpf: true,
        perfisSociais: {
          orderBy: [{ confirmado: 'desc' }, { rede: 'asc' }],
        },
      },
      orderBy: { nomeCompleto: 'asc' },
    })
    return socios
  }

  async adicionar(input: {
    socioId: string; rede: string; url: string; observacao?: string | null
  }, userId: string | null) {
    const rede = input.rede.toUpperCase()
    if (!REDES_VALIDAS.has(rede)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Rede desconhecida: ${input.rede}` })
    }

    const url = input.url.trim()
    if (!/^https:\/\//i.test(url)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'O endereço do perfil precisa começar com https://' })
    }

    // O identificador sai do próprio link — serve para reconhecer o mesmo
    // perfil colado com e sem barra final, com e sem parâmetros de campanha.
    const achado = extrairPerfis(url)[0]

    return prisma.socioPerfilSocial.upsert({
      where: { socioId_url: { socioId: input.socioId, url } },
      create: {
        socioId: input.socioId,
        rede: achado?.rede ?? rede,
        url,
        identificador: achado?.identificador ?? null,
        observacao: input.observacao?.trim() || null,
        // Colado por uma pessoa já nasce conferido: ela viu o perfil.
        origem: 'manual',
        confirmado: true,
        criadoPor: userId,
        confirmadoPor: userId,
        confirmadoEm: new Date(),
      },
      update: {
        ...(input.observacao !== undefined && { observacao: input.observacao?.trim() || null }),
      },
    })
  }

  async confirmar(id: string, userId: string | null) {
    return prisma.socioPerfilSocial.update({
      where: { id },
      data: { confirmado: true, confirmadoPor: userId, confirmadoEm: new Date() },
    })
  }

  async anotar(id: string, observacao: string | null) {
    return prisma.socioPerfilSocial.update({
      where: { id },
      data: { observacao: observacao?.trim() || null },
    })
  }

  async remover(id: string) {
    await prisma.socioPerfilSocial.delete({ where: { id } })
    return { ok: true }
  }

  /**
   * Procura perfis candidatos e grava como sugestão NÃO confirmada.
   *
   * Depende do SearXNG configurado (Configurações → Dossiê e Imagens). Sem ele
   * não há busca possível de graça, e a tela diz isso em vez de fingir que
   * procurou.
   */
  async sugerir(socioId: string): Promise<{ sugeridos: number; aviso?: string }> {
    const socio = await prisma.socio.findUnique({
      where: { id: socioId },
      select: { nomeCompleto: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } } },
    })
    if (!socio) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sócio não encontrado' })

    if (!process.env.SEARXNG_URL) {
      return {
        sugeridos: 0,
        aviso: 'A busca automática precisa do SearXNG configurado em Configurações → Dossiê e Imagens. '
          + 'Enquanto isso, cole o endereço do perfil à mão.',
      }
    }

    // O nome da empresa entra na busca porque é o que separa este João Silva
    // dos outros: quem trabalha nela costuma dizer isso no próprio perfil.
    const empresa = socio.cliente?.nomeFantasia || socio.cliente?.razaoSocial || ''
    const termo = [socio.nomeCompleto, empresa, 'linkedin OR instagram'].filter(Boolean).join(' ')

    const resultados = await searxngPaginas(termo, 20).catch(() => [])
    const candidatos = new Map<string, PerfilAchado>()
    for (const r of resultados) {
      for (const p of extrairPerfis(r.url)) candidatos.set(p.url, p)
    }

    let sugeridos = 0
    for (const p of candidatos.values()) {
      const criado = await prisma.socioPerfilSocial.upsert({
        where: { socioId_url: { socioId, url: p.url } },
        create: {
          socioId, rede: p.rede, url: p.url, identificador: p.identificador,
          origem: 'sugerido', confirmado: false,
        },
        // Sugestão nova não desconfirma o que já foi conferido por alguém.
        update: {},
      }).catch(() => null)
      if (criado) sugeridos++
    }

    return {
      sugeridos,
      ...(sugeridos === 0
        ? { aviso: `Nada encontrado para "${socio.nomeCompleto}". Cole o endereço do perfil à mão.` }
        : {}),
    }
  }
}
