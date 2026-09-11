import { Injectable, Logger } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { DriveClient } from '../drive-sync/drive.client'
import {
  resolverEscopo,
  filtroDeCliente,
  alcancaCliente,
  clienteDaEmpresa,
  type ContextoInterno,
} from './gestao-arquivos-escopo'

/**
 * Google Drive dentro da Gestão de Arquivos.
 *
 * O escritório já organiza o Drive numa pasta guarda-chuva com uma subpasta por
 * cliente, e compartilha cada subpasta com o e-mail do cliente. Este serviço
 * traz essa árvore para dentro do sistema: o master aponta a pasta raiz, diz
 * qual subpasta é de qual cliente, e a partir daí quem vê o cliente aqui vê os
 * arquivos dele lá — sem precisar de conta Google e sem compartilhamento que
 * sobreviva ao fim do contrato.
 *
 * O acesso NUNCA vem do Drive: vem do `gestao-arquivos-escopo`, o mesmo que
 * governa os arquivos locais. O Drive é só onde os bytes estão.
 */

/** Mesma conta OAuth já usada pela ingestão de XML (`GOOGLE_DRIVE_OAUTH_*`). */
const drive = new DriveClient()

export interface ItemDrive {
  id: string
  nome: string
  isPasta: boolean
  tamanho: number
  modificadoEm: string
  link: string
}

@Injectable()
export class GestaoArquivosDriveService {
  private readonly logger = new Logger(GestaoArquivosDriveService.name)

  /** Config da empresa, ou null se o master ainda não apontou a pasta raiz. */
  async obterConfig(empresaId: string) {
    return prisma.gestaoArquivosDrive.findUnique({ where: { empresaId } })
  }

  /**
   * Aponta a pasta raiz. Só o master.
   *
   * Valida contra a API ANTES de gravar: um ID que não existe, ou que a nossa
   * conta não enxerga, viraria uma tela vazia sem explicação. Falhando aqui, a
   * pessoa descobre no momento em que cola a URL, que é quando ela ainda sabe
   * de onde tirou.
   */
  async salvarConfig(empresaId: string, entrada: string) {
    let pastaRaizId: string
    try {
      pastaRaizId = DriveClient.extractFolderId(entrada)
    } catch (e) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: e instanceof Error ? e.message : 'URL de pasta inválida.',
      })
    }

    let nome: string | null = null
    try {
      const info = await drive.getFolderInfo(pastaRaizId)
      if (info.mimeType !== 'application/vnd.google-apps.folder') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Esse link aponta para um arquivo, não para uma pasta.',
        })
      }
      nome = info.name
    } catch (e) {
      if (e instanceof TRPCError) throw e
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Não foi possível abrir essa pasta no Drive. Confirme se o link está certo e se a '
          + 'pasta está compartilhada com a conta que o sistema usa.',
      })
    }

    await prisma.gestaoArquivosDrive.upsert({
      where: { empresaId },
      create: { empresaId, pastaRaizId, pastaRaizNome: nome, ativo: true },
      update: { pastaRaizId, pastaRaizNome: nome, ativo: true },
    })
    return { pastaRaizId, pastaRaizNome: nome }
  }

  /**
   * Subpastas da raiz, cada uma já dizendo a que cliente está vinculada.
   *
   * É a tela em que o master faz o de-para. Devolver o vínculo junto evita que
   * a tela precise cruzar duas listas e evita o engano de vincular a mesma
   * pasta a dois clientes sem perceber.
   */
  async listarSubpastas(empresaId: string) {
    const config = await this.obterConfig(empresaId)
    if (!config) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Aponte a pasta raiz do Drive nas configurações do módulo.',
      })
    }

    const [subpastas, vinculados] = await Promise.all([
      drive.listSubfolders(config.pastaRaizId).catch((e: unknown) => {
        this.logger.warn(`Falha ao listar subpastas do Drive: ${String(e)}`)
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: 'Não foi possível falar com o Google Drive agora.',
        })
      }),
      prisma.cliente.findMany({
        where: { empresaId, portalDriveFolderId: { not: null } },
        select: { id: true, razaoSocial: true, portalDriveFolderId: true },
      }),
    ])

    const porPasta = new Map(vinculados.map(c => [c.portalDriveFolderId!, c]))

    return {
      pastaRaizNome: config.pastaRaizNome,
      subpastas: subpastas.map(p => {
        const c = porPasta.get(p.id)
        return {
          id: p.id,
          nome: p.name,
          link: p.webViewLink,
          clienteId: c?.id ?? null,
          clienteNome: c?.razaoSocial ?? null,
        }
      }),
    }
  }

  /**
   * Vincula (ou desvincula, com `folderId` nulo) a pasta de um cliente.
   *
   * Duas travas que valem o custo:
   *  - a pasta tem de ser subpasta DA RAIZ configurada. Sem isso, um id colado
   *    à mão apontaria o módulo para qualquer pasta da conta — inclusive a de
   *    outro cliente, ou a dos backups.
   *  - a mesma pasta não pode servir a dois clientes. O estrago seria mostrar
   *    documento de um cliente dentro da tela do outro.
   */
  async vincularCliente(
    input: { clienteId: string; folderId: string | null },
    ctx: ContextoInterno,
  ) {
    if (!ctx.empresaId && !ctx.isMaster) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário sem empresa vinculada.' })
    }

    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...clienteDaEmpresa(ctx.isMaster, ctx.empresaId) },
      select: { id: true, empresaId: true },
    })
    if (!cliente?.empresaId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }

    if (input.folderId === null) {
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { portalDriveFolderId: null, portalDriveFolderNome: null },
      })
      return { ok: true }
    }

    const config = await this.obterConfig(cliente.empresaId)
    if (!config) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Aponte a pasta raiz do Drive antes de vincular clientes.',
      })
    }

    const subpastas = await drive.listSubfolders(config.pastaRaizId)
    const escolhida = subpastas.find(p => p.id === input.folderId)
    if (!escolhida) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Essa pasta não está dentro da pasta raiz configurada.',
      })
    }

    const jaUsada = await prisma.cliente.findFirst({
      where: {
        portalDriveFolderId: input.folderId,
        empresaId: cliente.empresaId,
        id: { not: cliente.id },
      },
      select: { razaoSocial: true },
    })
    if (jaUsada) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Esta pasta já é do cliente ${jaUsada.razaoSocial}.`,
      })
    }

    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { portalDriveFolderId: escolhida.id, portalDriveFolderNome: escolhida.name },
    })
    return { ok: true, nome: escolhida.name }
  }

  /**
   * Conteúdo da pasta do cliente no Drive.
   *
   * `subPastaId` navega para dentro. A trava está em `dentroDaPastaDoCliente`:
   * sem ela, passar o id de outra pasta qualquer listaria o Drive inteiro
   * através de uma rota que só deveria abrir a pasta de um cliente.
   */
  async listarDoCliente(
    input: { clienteId: string; subPastaId?: string | null },
    ctx: ContextoInterno,
  ): Promise<{ vinculada: boolean; nome: string | null; link: string | null; itens: ItemDrive[] }> {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }

    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...filtroDeCliente(escopo, ctx) },
      select: { portalDriveFolderId: true, portalDriveFolderNome: true },
    })
    if (!cliente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    if (!cliente.portalDriveFolderId) {
      return { vinculada: false, nome: null, link: null, itens: [] }
    }

    const alvo = input.subPastaId ?? cliente.portalDriveFolderId
    if (alvo !== cliente.portalDriveFolderId) {
      const dentro = await this.dentroDaPastaDoCliente(alvo, cliente.portalDriveFolderId)
      if (!dentro) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada.' })
      }
    }

    try {
      const itens = await drive.listFolderContents(alvo)
      return {
        vinculada: true,
        nome: cliente.portalDriveFolderNome,
        link: null,
        itens: itens.map(i => ({
          id: i.id,
          nome: i.name,
          isPasta: i.isFolder,
          tamanho: i.size,
          modificadoEm: i.modifiedTime,
          link: i.webViewLink,
        })),
      }
    } catch (e) {
      this.logger.warn(`Falha ao listar pasta ${alvo} do Drive: ${String(e)}`)
      throw new TRPCError({
        code: 'BAD_GATEWAY',
        message: 'Não foi possível falar com o Google Drive agora.',
      })
    }
  }

  /**
   * A pasta pedida descende da pasta do cliente?
   *
   * Sobe a cadeia de pais pela API. O teto de 10 níveis segura tanto ciclo
   * quanto uma árvore absurda — e, se não confirmar em 10 saltos, a resposta é
   * "não", que é o lado seguro de errar.
   */
  private async dentroDaPastaDoCliente(alvo: string, raizDoCliente: string): Promise<boolean> {
    let atual: string | null = alvo
    for (let i = 0; atual && i < 10; i++) {
      const pais: string[] = await drive.getParents(atual).catch(() => [])
      if (pais.includes(raizDoCliente)) return true
      atual = pais[0] ?? null
    }
    return false
  }
}
