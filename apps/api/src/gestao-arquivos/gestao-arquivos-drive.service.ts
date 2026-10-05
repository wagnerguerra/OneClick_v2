import { Injectable, Logger } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { prisma } from '@saas/db'
import { DriveClient } from '../drive-sync/drive.client'
import { falhaDriveExigeAdministrador, mensagemDaFalhaDrive, type PublicoDoErro } from '../drive-sync/drive-erro'
import type { VinculoPortal } from '../portal/portal-escopo'
import {
  resolverEscopo,
  filtroDeCliente,
  alcancaCliente,
  clienteDaEmpresa,
  type ContextoInterno,
} from './gestao-arquivos-escopo'
import { GestaoArquivosLoteService } from './gestao-arquivos-lote.service'

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

/** Um nó da árvore de pastas da origem, para a cópia de estrutura. */
interface NoDePasta {
  id: string
  nome: string
  filhas: NoDePasta[]
}

export interface ItemDrive {
  id: string
  nome: string
  isPasta: boolean
  tamanho: number
  modificadoEm: string
  link: string
  /**
   * Quem enviou pelo sistema, e quando.
   *
   * Não vem do Drive: lá o dono de TODO arquivo é a conta do escritório, então
   * a API do Google não sabe — e nunca vai saber — que foi o fulano da empresa
   * do cliente quem mandou. O dado é nosso, gravado no `ArquivoLog` no momento
   * do envio. `null` significa "chegou por fora do sistema" (alguém soltou
   * direto na pasta do Drive), que é uma informação legítima e diferente de
   * "não sabemos".
   */
  enviadoPor: string | null
  enviadoEm: string | null
}

@Injectable()
export class GestaoArquivosDriveService {
  private readonly logger = new Logger(GestaoArquivosDriveService.name)

  // O aviso nao sai daqui: `registrar` acumula a leva e o balde e quem dispara.
  constructor(private readonly lote: GestaoArquivosLoteService) {}

  /**
   * Registra a falha do Drive no nível certo e devolve o erro com a mensagem
   * certa para quem vai ler.
   *
   * Todas as falhas diziam "Não foi possível falar com o Google Drive agora"
   * e iam para o log como aviso. Em 25/09/2026 isso escondeu por dias um
   * refresh token revogado: a frase soava passageira, e o aviso se perdia no
   * meio dos de rede. Agora a falha que só um administrador resolve vai como
   * ERRO, com um marcador fixo para ser achada, e a tela diz o que fazer.
   * Ver `drive-sync/drive-erro.ts`.
   */
  private falhaDrive(
    e: unknown,
    contexto: string,
    publico: PublicoDoErro,
    /**
     * A frase da OPERAÇÃO ("Não foi possível enviar o arquivo ao Drive."), para
     * a falha passageira. Na falha que exige administrador ela é descartada: com
     * a credencial expirada, "não foi possível enviar" faz a pessoa reenviar, e
     * reenviar nunca vai funcionar.
     */
    mensagemDaOperacao?: string,
  ): TRPCError {
    const exigeAdmin = falhaDriveExigeAdministrador(e)
    if (exigeAdmin) {
      this.logger.error(`[DRIVE-EXIGE-ADMIN] ${contexto}: ${String(e)}`)
    } else {
      this.logger.warn(`${contexto}: ${String(e)}`)
    }
    const message = !exigeAdmin && mensagemDaOperacao ? mensagemDaOperacao : mensagemDaFalhaDrive(e, publico)
    return new TRPCError({ code: 'BAD_GATEWAY', message })
  }

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
        throw this.falhaDrive(e, 'Falha ao listar subpastas do Drive', 'escritorio')
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
   * Copia a ESTRUTURA DE PASTAS de um cliente para outros.
   *
   * O que se copia é o esqueleto: pastas, nunca arquivos. Documento de um
   * cliente dentro da pasta de outro é vazamento, e "copiar estrutura" nunca
   * quis dizer isso — o escritório quer a mesma arrumação (ARQUIVO, COMERCIAL,
   * CONTABIL…) repetida na empresa nova.
   *
   * Decisões que valem a pena ler antes de mexer:
   *
   *  - **Mescla por NOME, não duplica.** Pasta que já existe no destino é
   *    reaproveitada (e descemos dentro dela). Rodar duas vezes não cria
   *    "FISCAL" e "FISCAL (1)" — a segunda passada não faz nada, que é o que
   *    se espera de padronizar uma estrutura.
   *  - **Simulação primeiro.** `simular: true` percorre tudo e conta o que
   *    criaria, sem escrever. A tela mostra isso antes de confirmar: criar
   *    pasta no Drive de dezenas de clientes não é coisa que se descobre
   *    depois.
   *  - **Destino sem pasta vinculada é RELATADO, não criado.** Vincular pasta
   *    é ato deliberado (`vincularCliente`), com regra própria sobre estar
   *    dentro da raiz configurada. Criar aqui, de repente, contornaria isso.
   *  - **O mapa de áreas só viaja se o destino contratou a área.** Sem isso, o
   *    portal do destino mostraria pasta recortada por uma área que aquele
   *    cliente não tem — `definirAreaDaPasta` recusa pelo mesmo motivo.
   *
   * Origem e TODOS os destinos passam pelo escopo do módulo: sem isso, trocar
   * ids na requisição escreveria no Drive de um cliente que a pessoa nem vê.
   */
  async copiarEstrutura(
    input: { origemId: string; destinoIds: string[]; comAreas: boolean; simular: boolean },
    ctx: ContextoInterno,
  ) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.origemId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    const origem = await prisma.cliente.findFirst({
      where: { id: input.origemId, ...filtroDeCliente(escopo, ctx) },
      select: { id: true, razaoSocial: true, empresaId: true, portalDriveFolderId: true },
    })
    if (!origem?.empresaId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    if (!origem.portalDriveFolderId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Este cliente ainda não tem uma pasta do Drive vinculada.',
      })
    }

    const destinos = input.destinoIds.filter(id => id !== input.origemId)
    if (destinos.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Escolha ao menos um cliente de destino.' })
    }
    for (const id of destinos) {
      if (!alcancaCliente(escopo, id)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
      }
    }

    const arvore = await this.arvoreDePastas(origem.portalDriveFolderId)
    const mapa = input.comAreas
      ? await prisma.gestaoArquivosPastaArea.findMany({
          where: { clienteId: origem.id },
          select: { pastaId: true, areaId: true },
        })
      : []
    const areaPorPasta = new Map(mapa.map(m => [m.pastaId, m.areaId]))

    const clientesDestino = await prisma.cliente.findMany({
      where: { id: { in: destinos }, ...filtroDeCliente(escopo, ctx) },
      select: { id: true, razaoSocial: true, empresaId: true, portalDriveFolderId: true },
    })

    const resultados: Array<{
      clienteId: string
      nome: string
      status: 'ok' | 'sem-pasta' | 'falhou'
      criadas: number
      existentes: number
      areasMapeadas: number
      areasPuladas: number
      erro?: string
    }> = []

    for (const destino of clientesDestino) {
      if (!destino.portalDriveFolderId) {
        resultados.push({
          clienteId: destino.id, nome: destino.razaoSocial, status: 'sem-pasta',
          criadas: 0, existentes: 0, areasMapeadas: 0, areasPuladas: 0,
        })
        continue
      }
      try {
        const contas = await this.replicarEm({
          destino: { id: destino.id, empresaId: destino.empresaId, raiz: destino.portalDriveFolderId },
          nos: arvore,
          areaPorPasta,
          simular: input.simular,
          userId: ctx.userId,
        })
        resultados.push({ clienteId: destino.id, nome: destino.razaoSocial, status: 'ok', ...contas })
      } catch (e) {
        const falha = this.falhaDrive(e, `Falha ao copiar estrutura para ${destino.id}`, 'escritorio')
        resultados.push({
          clienteId: destino.id, nome: destino.razaoSocial, status: 'falhou',
          criadas: 0, existentes: 0, areasMapeadas: 0, areasPuladas: 0,
          erro: falha.message,
        })
      }
    }

    return {
      simulado: input.simular,
      origem: { id: origem.id, nome: origem.razaoSocial },
      pastasNaOrigem: this.contarNos(arvore),
      resultados,
    }
  }

  /** Teto de profundidade e de nós — árvore torta não pode virar milhares de chamadas ao Google. */
  private static readonly PROFUNDIDADE_MAX = 5
  private static readonly PASTAS_MAX = 300

  /** A árvore de pastas (só pastas) abaixo de uma raiz. */
  private async arvoreDePastas(
    raiz: string,
    nivel = 1,
    orcamento = { restantes: GestaoArquivosDriveService.PASTAS_MAX },
  ): Promise<NoDePasta[]> {
    if (nivel > GestaoArquivosDriveService.PROFUNDIDADE_MAX || orcamento.restantes <= 0) return []
    const filhas = await drive.listSubfolders(raiz)
    const nos: NoDePasta[] = []
    for (const f of filhas) {
      if (orcamento.restantes <= 0) break
      orcamento.restantes -= 1
      nos.push({
        id: f.id,
        nome: f.name,
        filhas: await this.arvoreDePastas(f.id, nivel + 1, orcamento),
      })
    }
    return nos
  }

  private contarNos(nos: NoDePasta[]): number {
    return nos.reduce((total, no) => total + 1 + this.contarNos(no.filhas), 0)
  }

  /** Repete a árvore num destino, reaproveitando o que já existe lá pelo nome. */
  private async replicarEm(p: {
    destino: { id: string; empresaId: string | null; raiz: string }
    nos: NoDePasta[]
    areaPorPasta: Map<string, string>
    simular: boolean
    userId: string
  }): Promise<{ criadas: number; existentes: number; areasMapeadas: number; areasPuladas: number }> {
    const contas = { criadas: 0, existentes: 0, areasMapeadas: 0, areasPuladas: 0 }

    // As áreas que ESTE destino contratou: o mapa só viaja para as que existem
    // aqui, e a consulta é uma só para a árvore inteira.
    const contratadas = new Set(
      p.areaPorPasta.size === 0 ? [] : (await prisma.clienteAreaContratada.findMany({
        where: {
          clienteId: p.destino.id,
          areaId: { in: [...new Set(p.areaPorPasta.values())] },
          contratado: true,
          dataEncerramento: null,
        },
        select: { areaId: true },
      })).map(a => a.areaId),
    )

    const descer = async (nos: NoDePasta[], paiNoDestino: string | null) => {
      // Na simulação não há pasta de destino real abaixo do primeiro nível que
      // não existe: `paiNoDestino` nulo significa "este ramo seria todo novo".
      const existentes = paiNoDestino
        ? await drive.listSubfolders(paiNoDestino)
        : []
      for (const no of nos) {
        const igual = existentes.find(e => e.name.trim().toLowerCase() === no.nome.trim().toLowerCase())
        let idNoDestino: string | null = igual?.id ?? null

        if (igual) {
          contas.existentes += 1
        } else {
          contas.criadas += 1
          if (!p.simular && paiNoDestino) {
            const criada = await drive.createFolder(no.nome, paiNoDestino)
            idNoDestino = criada.id
          } else {
            idNoDestino = null
          }
        }

        const areaId = p.areaPorPasta.get(no.id)
        if (areaId) {
          if (!contratadas.has(areaId)) {
            contas.areasPuladas += 1
          } else {
            contas.areasMapeadas += 1
            if (!p.simular && idNoDestino && p.destino.empresaId) {
              await prisma.gestaoArquivosPastaArea.upsert({
                where: { clienteId_pastaId: { clienteId: p.destino.id, pastaId: idNoDestino } },
                create: {
                  empresaId: p.destino.empresaId,
                  clienteId: p.destino.id,
                  pastaId: idNoDestino,
                  areaId,
                  pastaNome: no.nome,
                  definidoPorId: p.userId,
                },
                update: { areaId, pastaNome: no.nome, definidoPorId: p.userId },
              })
            }
          }
        }

        if (no.filhas.length > 0) await descer(no.filhas, idNoDestino)
      }
    }

    await descer(p.nos, p.destino.raiz)
    return contas
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
      const autoria = await this.autoriaDe(itens.filter(i => !i.isFolder).map(i => i.id))
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
          enviadoPor: autoria.get(i.id)?.nome ?? null,
          enviadoEm: autoria.get(i.id)?.em.toISOString() ?? null,
        })),
      }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao listar pasta ${alvo} do Drive`, 'escritorio')
    }
  }

  /**
   * Entrega o conteúdo de um arquivo do Drive, conferindo o acesso antes.
   *
   * Esta é a peça que faz a permissão ser NOSSA. O `webViewLink` do Drive não
   * serve para exibir dentro do sistema: ele exige que o navegador de quem
   * olha tenha acesso ao arquivo, e quem tem é a conta do escritório. Passando
   * por aqui, o sistema confere o escopo do módulo e a contenção na pasta do
   * cliente, e só então abre o stream.
   */
  async abrirArquivo(
    input: { clienteId: string; fileId: string },
    ctx: ContextoInterno,
  ): Promise<{ stream: NodeJS.ReadableStream; nome: string; mimeType: string; tamanho: number }> {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }

    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...filtroDeCliente(escopo, ctx) },
      select: { portalDriveFolderId: true },
    })
    if (!cliente?.portalDriveFolderId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }

    // O arquivo tem de estar DENTRO da pasta do cliente. Sem esta checagem, um
    // id de arquivo qualquer da conta do escritório — inclusive de outro
    // cliente — seria servido por esta rota.
    const dentro = await this.dentroDaPastaDoCliente(input.fileId, cliente.portalDriveFolderId)
    if (!dentro) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }

    try {
      const meta = await drive.getFileMeta(input.fileId)
      const stream = await drive.downloadStream(input.fileId)
      return { stream, nome: meta.name, mimeType: meta.mimeType, tamanho: meta.size }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao baixar ${input.fileId} do Drive`, 'escritorio',
        'Não foi possível baixar o arquivo do Drive.')
    }
  }

  // ── Lado do CLIENTE (Portal) ──────────────────────────────────────────────

  /**
   * O cliente pode ver a pasta do Drive dele?
   *
   * Permissão explícita do usuário, não o `nivel`. A versão anterior desta
   * regra liberava só o ADMINISTRADOR, porque arquivo do Drive **não tem
   * categoria** e o recorte por área (`CATEGORIA_EXIGE_AREA`) não tem como se
   * aplicar lá. A trava resolvia esse risco e criava outro: com o portal
   * listando só o Drive, quem não fosse admin abria uma tela vazia.
   *
   * A resposta passou a ser o escritório decidir usuário a usuário — que é o
   * que ele já faz hoje ao escolher com quem compartilha a pasta por e-mail. A
   * consequência continua valendo e está registrada no schema: quem tem
   * `podeVer` enxerga a pasta INTEIRA do cliente, sem filtro de área.
   */
  podeVerDriveNoPortal(vinculo: VinculoPortal): boolean {
    return vinculo.podeVer
  }

  /** Conteúdo da pasta do Drive, para o portal do cliente. */
  async listarParaPortal(
    vinculo: VinculoPortal,
    subPastaId?: string | null,
  ): Promise<{ vinculada: boolean; nome: string | null; itens: ItemDrive[]; motivo?: string }> {
    if (!this.podeVerDriveNoPortal(vinculo)) {
      return {
        vinculada: false,
        nome: null,
        itens: [],
        motivo: 'Seu usuário não tem permissão para ver os arquivos. Fale com o escritório contábil.',
      }
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: vinculo.clienteId },
      select: { portalDriveFolderId: true, portalDriveFolderNome: true },
    })
    if (!cliente?.portalDriveFolderId) {
      return { vinculada: false, nome: null, itens: [] }
    }

    const alvo = subPastaId ?? cliente.portalDriveFolderId
    if (alvo !== cliente.portalDriveFolderId) {
      const dentro = await this.dentroDaPastaDoCliente(alvo, cliente.portalDriveFolderId)
      if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada.' })
    }

    try {
      const itens = await drive.listFolderContents(alvo)
      const autoria = await this.autoriaDe(itens.filter(i => !i.isFolder).map(i => i.id))
      return {
        vinculada: true,
        nome: cliente.portalDriveFolderNome,
        itens: itens.map(i => ({
          id: i.id,
          nome: i.name,
          isPasta: i.isFolder,
          tamanho: i.size,
          modificadoEm: i.modifiedTime,
          // O link direto do Drive NÃO vai para o cliente: ele só abriria para
          // quem tem a pasta compartilhada no Google, e o objetivo aqui é
          // justamente que o acesso não dependa disso.
          link: '',
          enviadoPor: autoria.get(i.id)?.nome ?? null,
          enviadoEm: autoria.get(i.id)?.em.toISOString() ?? null,
        })),
      }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao listar pasta ${alvo} para o portal`, 'portal')
    }
  }

  /** Entrega o conteúdo de um arquivo do Drive para o portal do cliente. */
  async abrirArquivoParaPortal(
    vinculo: VinculoPortal,
    fileId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; nome: string; mimeType: string; tamanho: number }> {
    if (!this.podeVerDriveNoPortal(vinculo)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: vinculo.clienteId },
      select: { portalDriveFolderId: true },
    })
    if (!cliente?.portalDriveFolderId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })
    }

    const dentro = await this.dentroDaPastaDoCliente(fileId, cliente.portalDriveFolderId)
    if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado.' })

    try {
      const meta = await drive.getFileMeta(fileId)
      const stream = await drive.downloadStream(fileId)
      return { stream, nome: meta.name, mimeType: meta.mimeType, tamanho: meta.size }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao baixar ${fileId} para o portal`, 'portal',
        'Não foi possível baixar o arquivo.')
    }
  }

  /**
   * Cria uma pasta dentro da pasta do cliente.
   *
   * `paiId` nulo cria na raiz do cliente. Como em todo o resto, o destino é
   * conferido contra a pasta dele antes de qualquer escrita: sem isso, um id
   * trocado na requisição criaria pasta dentro do Drive de outro.
   */
  async criarPastaParaPortal(vinculo: VinculoPortal, nome: string, paiId?: string | null) {
    if (!vinculo.podeEditar) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para criar pastas.' })
    }
    const raiz = await this.raizDoCliente(vinculo.clienteId)
    const destino = paiId ?? raiz
    if (destino !== raiz) {
      const dentro = await this.dentroDaPastaDoCliente(destino, raiz)
      if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada.' })
    }

    const limpo = nome.trim()
    if (!limpo) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe o nome da pasta.' })
    // O Drive aceita barra no nome, e isso confunde qualquer caminho montado
    // depois: "Notas/2026" pareceria dois níveis para quem lê.
    if (limpo.indexOf('/') >= 0 || limpo.indexOf('\\') >= 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'O nome da pasta não pode conter barras.' })
    }

    try {
      const criada = await drive.createFolder(limpo, destino)
      return { id: criada.id, nome: criada.name }
    } catch (e) {
      throw this.falhaDrive(e, 'Falha ao criar pasta no Drive', 'portal',
        'Não foi possível criar a pasta.')
    }
  }

  /**
   * Sobe um arquivo já recebido pelo `/api/upload` para a pasta do cliente.
   *
   * Dois passos porque o upload em si continua sendo o endpoint de sempre: o
   * navegador manda o arquivo, a API grava em `uploads/`, e só então ele é
   * empurrado para o Drive. O arquivo local é apagado depois — mantê-lo
   * duplicaria o acervo e desfaria a razão de usar o Drive.
   */
  async enviarParaPortal(
    vinculo: VinculoPortal,
    input: { fileName: string; fileUrl: string; pastaId?: string | null; mimeType?: string | null },
    userId: string,
  ) {
    if (!vinculo.podeEditar) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para enviar arquivos.' })
    }
    const raiz = await this.raizDoCliente(vinculo.clienteId)
    const destino = input.pastaId ?? raiz
    if (destino !== raiz) {
      const dentro = await this.dentroDaPastaDoCliente(destino, raiz)
      if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada.' })
    }

    // Só o nome do arquivo entra no caminho. `fileUrl` vem do cliente HTTP, e
    // um "../../etc/passwd" ali viraria leitura de arquivo do servidor.
    const base = path.join(process.cwd(), 'uploads')
    const caminho = path.join(base, path.basename(input.fileUrl))
    if (!caminho.startsWith(base)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo inválido.' })
    }
    if (!fs.existsSync(caminho)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'O arquivo enviado não foi encontrado. Tente de novo.' })
    }

    try {
      const enviado = await drive.uploadFile({
        folderId: destino,
        filename: input.fileName,
        filePath: caminho,
        mimeType: input.mimeType ?? undefined,
      })
      // Só remove depois do sucesso: se o Drive falhar, o arquivo continua no
      // disco e a tentativa seguinte não exige reenviar.
      fs.unlink(caminho, () => undefined)

      const enviadoPor = await this.registrarEnvio({
        clienteId: vinculo.clienteId,
        arquivoId: enviado.id,
        arquivoNome: enviado.name,
        pastaId: destino,
        userId,
        lado: 'CLIENTE',
        tamanho: enviado.size,
      })

      // O `.catch` não é decoração: esta chamada está DENTRO do try cujo catch
      // responde "Não foi possível enviar o arquivo ao Drive". Neste ponto o
      // arquivo já está lá. Deixar uma falha de aviso escorrer para aquele
      // catch faria a tela mentir e a pessoa reenviar, duplicando o arquivo.
      await this.avisarEnvioDoCliente({
        clienteId: vinculo.clienteId,
        arquivoNome: enviado.name,
        tamanho: enviado.size,
        enviadoPor,
        pastaId: destino,
        raiz,
      }).catch(() => undefined)

      return { id: enviado.id, nome: enviado.name }
    } catch (e) {
      throw this.falhaDrive(e, 'Falha ao subir arquivo para o Drive', 'portal',
        'Não foi possível enviar o arquivo. Tente de novo em instantes.')
    }
  }

  /**
   * Avisa o escritório de que o cliente mandou um arquivo.
   *
   * Este aviso EXISTIA e não saía. O disparo de `ARQUIVO_ENVIADO` ficou no
   * caminho antigo (`portal-arquivos.service`, o que gravava `ClienteArquivo`)
   * quando o envio do cliente migrou para o Drive; o caminho novo só gravava a
   * auditoria. O efeito era o módulo prometer notificação e nunca notificar —
   * o arquivo só era descoberto quando alguém abria o portal por conta própria.
   *
   * O endereço sai da PASTA: `areaDaPasta` resolve a área mapeada, herdando
   * árvore acima. Com área, avisa quem responde por ela neste cliente. Sem
   * área — pasta que ninguém mapeou — cai no fallback de `destinatarios`,
   * que abre para todos os responsáveis mais a coordenação.
   *
   * O aviso não sai daqui: entra num balde que junta a leva inteira. Arrastar
   * dez arquivos são dez chamadas a este método, e dez e-mails para dizer uma
   * coisa só é pior que um — o responsável arquiva a leva sem ler, e o aviso
   * seguinte vai junto. Ver `gestao-arquivos-lote.service`.
   *
   * Quem chama blinda com `.catch`: o arquivo neste ponto já está no Drive, e
   * transformar um envio bem-sucedido em erro de tela por causa de SMTP seria
   * trocar um problema pequeno por um grande — a pessoa reenviaria.
   */
  private async avisarEnvioDoCliente(e: {
    clienteId: string
    arquivoNome: string
    tamanho?: number | null
    enviadoPor: string | null
    pastaId: string
    raiz: string
  }) {
    // Quem responde por cem clientes precisa saber de QUAL deles, antes de
    // saber o nome do arquivo. Por isso a razão social entra no assunto. A
    // empresa vem na mesma consulta porque é a identidade de quem MANDA o
    // e-mail, e uma segunda ida ao banco por arquivo enviado não se paga.
    const cliente = await prisma.cliente.findUnique({
      where: { id: e.clienteId },
      select: {
        razaoSocial: true,
        empresa: { select: { nomeFantasia: true, razaoSocial: true } },
      },
    }).catch(() => null)

    // Resolver a área nunca derruba o aviso: falhar aqui devolve `null`, que é
    // o fallback — e o fallback avisa gente demais, não gente de menos.
    const areaId = await this.areaDaPasta(e.clienteId, e.pastaId, e.raiz).catch(() => null)

    this.lote.registrar({
      clienteId: e.clienteId,
      clienteNome: cliente?.razaoSocial ?? 'cliente',
      escritorioNome: cliente?.empresa?.nomeFantasia || cliente?.empresa?.razaoSocial || 'OneClick',
      areaId,
      arquivoNome: e.arquivoNome,
      tamanho: e.tamanho ?? null,
      enviadoPor: e.enviadoPor,
      // O sino leva direto à pasta do cliente. Sem o link ele avisaria que
      // chegou algo e deixaria a pessoa procurar pelo menu — custo maior que a
      // informação. `acenderSino` ainda confere quem pode ABRIR esta tela: ser
      // responsável pela área não concede o módulo.
      link: `/gestao-arquivos/${e.clienteId}`,
    })
  }

  /**
   * Manda um item da pasta do cliente para a lixeira do Drive.
   *
   * Lixeira, e não exclusão definitiva: o item volta por 30 dias. Mesma escolha
   * do `excluidoEm` do lado de cá, pelo mesmo motivo — documento fiscal apagado
   * por engano não pode virar perda definitiva.
   */
  async excluirParaPortal(vinculo: VinculoPortal, itemId: string) {
    if (!vinculo.podeExcluir) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para excluir.' })
    }
    const raiz = await this.raizDoCliente(vinculo.clienteId)
    // A própria pasta do cliente não vai para a lixeira pelo portal: seria o
    // cliente apagando a raiz que o escritório configurou.
    if (itemId === raiz) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta pasta não pode ser excluída.' })
    }
    const dentro = await this.dentroDaPastaDoCliente(itemId, raiz)
    if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado.' })

    try {
      await drive.trashFile(itemId)
      return { ok: true }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao excluir ${itemId} no Drive`, 'portal',
        'Não foi possível excluir o item.')
    }
  }

  /**
   * Move um item para outra pasta dentro do Drive do cliente.
   *
   * Quatro recusas, e nenhuma é decorativa:
   *
   *  - o item tem de estar dentro da pasta do cliente. Sem isso, um id colado
   *    na requisição moveria arquivo de outro cliente para cá.
   *  - o destino também. Senão o item sairia do alcance do dono dele — para
   *    dentro da pasta de outro cliente, no pior caso.
   *  - a raiz do cliente não se move: é a pasta que o escritório configurou.
   *  - e o destino não pode ser descendente do próprio item. Mover uma pasta
   *    para dentro de si mesma desliga o ramo inteiro da árvore: no Drive ele
   *    não é apagado, apenas deixa de ter caminho até a raiz, e some da tela
   *    sem nada dizer que sumiu.
   */
  async moverParaPortal(vinculo: VinculoPortal, itemId: string, destinoId: string | null) {
    if (!vinculo.podeEditar) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para mover arquivos.' })
    }
    return this.mover(vinculo.clienteId, itemId, destinoId, 'portal')
  }

  /** Mesmo movimento, pelo lado do escritório. O escopo já foi conferido. */
  async moverParaEscritorio(
    input: { clienteId: string; itemId: string; destinoId: string | null },
    ctx: ContextoInterno,
  ) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...filtroDeCliente(escopo, ctx) },
      select: { id: true },
    })
    if (!cliente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    return this.mover(input.clienteId, input.itemId, input.destinoId, 'escritorio')
  }

  private async mover(clienteId: string, itemId: string, destinoId: string | null, publico: PublicoDoErro) {
    const raiz = await this.raizDoCliente(clienteId)
    const destino = destinoId ?? raiz

    if (itemId === raiz) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta pasta não pode ser movida.' })
    }
    if (itemId === destino) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Uma pasta não pode ser movida para dentro dela mesma.' })
    }

    const dentroItem = await this.dentroDaPastaDoCliente(itemId, raiz)
    if (!dentroItem) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado.' })

    if (destino !== raiz) {
      const dentroDestino = await this.dentroDaPastaDoCliente(destino, raiz)
      if (!dentroDestino) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta de destino não encontrada.' })

      // O destino desce do próprio item? Então o movimento é para dentro de si.
      const cicla = await this.dentroDaPastaDoCliente(destino, itemId)
      if (cicla) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Não dá para mover uma pasta para dentro de uma subpasta dela.',
        })
      }
    }

    let paiAtual: string
    try {
      const pais = await drive.getParents(itemId)
      if (pais.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este item não está em nenhuma pasta.' })
      }
      paiAtual = pais[0]!
    } catch (e) {
      if (e instanceof TRPCError) throw e
      throw this.falhaDrive(e, `Falha ao localizar a pasta de ${itemId}`, publico)
    }

    if (paiAtual === destino) return { ok: true, semMudanca: true }

    try {
      await drive.moveFile(itemId, destino, paiAtual)
      return { ok: true, semMudanca: false }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao mover ${itemId} no Drive`, publico,
        'Não foi possível mover o item.')
    }
  }

  /**
   * Quantos arquivos cada cliente tem no Drive.
   *
   * Chamada à parte da listagem, de propósito. O Drive não tem consulta
   * "descendentes de": só dá para listar os filhos diretos de uma pasta, então
   * contar o acervo exige caminhar a árvore — e os arquivos moram em subpastas
   * (2025, 2026, …), não na raiz. Fazer isso para N clientes durante o
   * carregamento da lista deixaria a tela parada esperando o Google.
   *
   * Então a lista aparece na hora com o que o banco sabe, e estes números
   * chegam depois. Um número que demora é melhor que uma tela que trava, e
   * ambos são melhores que o zero que aparecia antes.
   *
   * Dois limites seguram o custo: `TETO_PASTAS` corta a caminhada em árvores
   * absurdas, e a concorrência limitada evita disparar centenas de chamadas ao
   * Google de uma vez e levar 429. Quando o teto é atingido, o retorno diz
   * `parcial: true` — a tela mostra "200+" em vez de mentir um total exato.
   */
  async contarNoDrive(clienteIds: string[], ctx: ContextoInterno) {
    const escopo = await resolverEscopo(ctx)
    const clientes = await prisma.cliente.findMany({
      where: {
        id: { in: clienteIds.slice(0, 300) },
        ...filtroDeCliente(escopo, ctx),
        portalDriveFolderId: { not: null },
      },
      select: { id: true, portalDriveFolderId: true },
    })
    if (clientes.length === 0) return []

    const LOTE = 4
    const saida: Array<{ clienteId: string; arquivos: number; parcial: boolean }> = []

    for (let i = 0; i < clientes.length; i += LOTE) {
      const fatia = clientes.slice(i, i + LOTE)
      const resultados = await Promise.all(
        fatia.map(async c => {
          try {
            const r = await this.caminharContando(c.portalDriveFolderId!)
            return { clienteId: c.id, ...r }
          } catch {
            // Falha em um cliente não derruba a contagem dos outros: a coluna
            // dele fica sem número, o resto da tela funciona.
            return null
          }
        }),
      )
      for (const r of resultados) if (r) saida.push(r)
    }

    return saida
  }

  /** Percorre a pasta somando arquivos, com teto de pastas visitadas. */
  private async caminharContando(raiz: string): Promise<{ arquivos: number; parcial: boolean }> {
    const TETO_PASTAS = 200
    let arquivos = 0
    let visitadas = 0
    const fila: string[] = [raiz]

    while (fila.length > 0 && visitadas < TETO_PASTAS) {
      const atual = fila.shift()!
      visitadas++
      const itens = await drive.listFolderContents(atual, { limit: 1000 })
      for (const i of itens) {
        if (i.isFolder) fila.push(i.id)
        else arquivos++
      }
    }

    return { arquivos, parcial: fila.length > 0 }
  }

  /**
   * Quem enviou cada um destes arquivos, pelo nosso log.
   *
   * Uma consulta para o lote inteiro, não uma por arquivo: a listagem de uma
   * pasta com 200 itens viraria 200 idas ao banco.
   */
  private async autoriaDe(ids: string[]): Promise<Map<string, { nome: string | null; em: Date }>> {
    if (ids.length === 0) return new Map()
    const logs = await prisma.arquivoLog.findMany({
      where: { arquivoId: { in: ids }, evento: 'ENVIOU' },
      // Mais antigo primeiro: interessa quem ENVIOU, não quem mexeu por último.
      orderBy: { criadoEm: 'asc' },
      select: { arquivoId: true, usuarioNome: true, criadoEm: true },
    })
    const mapa = new Map<string, { nome: string | null; em: Date }>()
    for (const l of logs) {
      if (l.arquivoId && !mapa.has(l.arquivoId)) {
        mapa.set(l.arquivoId, { nome: l.usuarioNome, em: l.criadoEm })
      }
    }
    return mapa
  }

  /**
   * Registra o envio. Sem isto, "quem mandou este arquivo?" não tem resposta.
   *
   * Devolve o nome de quem enviou porque já o consultou — o aviso por e-mail
   * quer o mesmo dado, e uma segunda consulta diria a mesma coisa. `null` tanto
   * para usuário sem nome quanto para falha do registro: em ambos o aviso sai
   * sem a autoria, que é melhor do que não sair.
   */
  private async registrarEnvio(e: {
    clienteId: string
    arquivoId: string
    arquivoNome: string
    pastaId: string
    userId: string
    lado: 'CLIENTE' | 'ESCRITORIO'
    tamanho?: number | null
  }): Promise<string | null> {
    try {
      const usuario = await prisma.user.findUnique({
        where: { id: e.userId },
        select: { name: true },
      })
      await prisma.arquivoLog.create({
        data: {
          clienteId: e.clienteId,
          arquivoId: e.arquivoId,
          arquivoNome: e.arquivoNome,
          pastaId: e.pastaId,
          evento: 'ENVIOU',
          lado: e.lado,
          usuarioId: e.userId,
          usuarioNome: usuario?.name ?? null,
          detalhe: e.tamanho ? `${e.tamanho} bytes` : null,
        },
      })
      return usuario?.name ?? null
    } catch {
      // O arquivo já está no Drive quando isto roda. Perder a linha de
      // auditoria é ruim; devolver erro para quem acabou de enviar com sucesso
      // é pior.
      return null
    }
  }

  // ── Lixeira ───────────────────────────────────────────────────────────────

  /**
   * O que foi para a lixeira, de dentro da pasta deste cliente.
   *
   * A lixeira do Google é UMA SÓ, da conta do escritório, misturando todos os
   * clientes — mostrar aquilo para um cliente seria mostrar o dele junto com o
   * dos outros. O que torna a separação possível é o Drive manter os pais do
   * item excluído: dá para perguntar "o que foi jogado fora de dentro desta
   * pasta".
   *
   * Como a pergunta é por pasta, a árvore precisa ser percorrida — com o mesmo
   * teto da contagem, pela mesma razão.
   */
  private async lixeiraDe(raiz: string) {
    const TETO_PASTAS = 200
    const achados: Array<{
      id: string; nome: string; isPasta: boolean; tamanho: number
      excluidoEm: string; caminho: string
    }> = []

    const fila: Array<{ id: string; caminho: string }> = [{ id: raiz, caminho: '' }]
    let visitadas = 0

    while (fila.length > 0 && visitadas < TETO_PASTAS) {
      const atual = fila.shift()!
      visitadas++

      const [naLixeira, vivas] = await Promise.all([
        drive.listTrashedInFolder(atual.id),
        drive.listSubfolders(atual.id),
      ])

      for (const i of naLixeira) {
        achados.push({
          id: i.id,
          nome: i.name,
          isPasta: i.isFolder,
          tamanho: i.size,
          excluidoEm: i.trashedTime,
          caminho: atual.caminho || 'raiz',
        })
      }
      // Só desce em pastas VIVAS: uma pasta na lixeira já apareceu acima como
      // item, e restaurá-la traz o conteúdo junto. Descer nela listaria os
      // filhos como se tivessem sido excluídos um a um.
      for (const p of vivas) {
        fila.push({ id: p.id, caminho: atual.caminho ? `${atual.caminho} / ${p.name}` : p.name })
      }
    }

    achados.sort((a, b) => (b.excluidoEm ?? '').localeCompare(a.excluidoEm ?? ''))
    return achados
  }

  /** Lixeira para o PORTAL. Quem pode excluir pode ver o que excluiu. */
  async lixeiraParaPortal(vinculo: VinculoPortal) {
    if (!vinculo.podeExcluir) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para ver a lixeira.' })
    }
    const raiz = await this.raizDoCliente(vinculo.clienteId)
    try {
      return await this.lixeiraDe(raiz)
    } catch (e) {
      throw this.falhaDrive(e, 'Falha ao listar a lixeira', 'portal')
    }
  }

  /** Lixeira para o ESCRITÓRIO. O escopo do módulo é conferido antes. */
  async lixeiraParaEscritorio(clienteId: string, ctx: ContextoInterno) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, ...filtroDeCliente(escopo, ctx) },
      select: { portalDriveFolderId: true },
    })
    if (!cliente?.portalDriveFolderId) return []
    try {
      return await this.lixeiraDe(cliente.portalDriveFolderId)
    } catch (e) {
      throw this.falhaDrive(e, 'Falha ao listar a lixeira', 'escritorio')
    }
  }

  /**
   * Tira um item da lixeira.
   *
   * A checagem de contenção usa a cadeia de pais, que o Drive preserva mesmo
   * com o item na lixeira — é o que impede restaurar, por um id colado à mão,
   * algo que nunca foi deste cliente.
   */
  async restaurarDaLixeira(clienteId: string, itemId: string, publico: PublicoDoErro) {
    const raiz = await this.raizDoCliente(clienteId)
    const dentro = await this.dentroDaPastaDoCliente(itemId, raiz)
    if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado na lixeira.' })

    try {
      await drive.untrashFile(itemId)
      return { ok: true }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao restaurar ${itemId}`, publico,
        'Não foi possível restaurar o item.')
    }
  }

  async restaurarParaPortal(vinculo: VinculoPortal, itemId: string) {
    if (!vinculo.podeExcluir) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para restaurar.' })
    }
    return this.restaurarDaLixeira(vinculo.clienteId, itemId, 'portal')
  }

  async restaurarParaEscritorio(
    input: { clienteId: string; itemId: string },
    ctx: ContextoInterno,
  ) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    return this.restaurarDaLixeira(input.clienteId, input.itemId, 'escritorio')
  }

  /**
   * Apaga de vez — SÓ pelo lado do escritório.
   *
   * Não é falta de confiança no cliente: é que o escritório é o guardião do
   * documento fiscal, e a exclusão definitiva não tem volta nem por suporte do
   * Google. Do lado de fora, o pior que acontece é o arquivo ficar na lixeira
   * até o expurgo dos 30 dias; do lado de dentro, alguém responde por isso.
   */
  async excluirDefinitivo(
    input: { clienteId: string; itemId: string },
    ctx: ContextoInterno,
  ) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    const raiz = await this.raizDoCliente(input.clienteId)
    if (input.itemId === raiz) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta pasta não pode ser excluída.' })
    }
    const dentro = await this.dentroDaPastaDoCliente(input.itemId, raiz)
    if (!dentro) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado.' })

    try {
      await drive.deleteFilePermanently(input.itemId)
      return { ok: true }
    } catch (e) {
      throw this.falhaDrive(e, `Falha ao apagar ${input.itemId} de vez`, 'escritorio',
        'Não foi possível apagar o item.')
    }
  }

  /** A pasta do cliente, ou erro quando o escritório ainda não vinculou uma. */
  private async raizDoCliente(clienteId: string): Promise<string> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { portalDriveFolderId: true },
    })
    if (!cliente?.portalDriveFolderId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Esta empresa ainda não tem uma pasta do Drive vinculada.',
      })
    }
    return cliente.portalDriveFolderId
  }

  /**
   * O caminho de uma pasta até a raiz do cliente, de baixo para cima.
   *
   * Devolve `[alvo, pai, avô, …]` terminando na raiz, ou `null` quando o alvo
   * não descende dela. O teto de 10 níveis segura tanto ciclo quanto uma
   * árvore absurda — e não confirmar em 10 saltos devolve `null`, que é o lado
   * seguro de errar.
   *
   * Uma subida só responde às DUAS perguntas que a pasta levanta: "isto é do
   * cliente?" (a trava de contenção) e "de que área isto é?" (a herança do
   * mapa). Cada salto é uma chamada à API do Google, então subir duas vezes
   * dobraria o custo do envio para reencontrar exatamente o mesmo caminho.
   */
  private async cadeiaAteRaiz(alvo: string, raizDoCliente: string): Promise<string[] | null> {
    if (alvo === raizDoCliente) return [raizDoCliente]
    const caminho: string[] = [alvo]
    let atual: string | null = alvo
    for (let i = 0; atual && i < 10; i++) {
      const pais: string[] = await drive.getParents(atual).catch(() => [])
      if (pais.includes(raizDoCliente)) return [...caminho, raizDoCliente]
      atual = pais[0] ?? null
      if (atual) caminho.push(atual)
    }
    return null
  }

  /**
   * A pasta pedida descende da pasta do cliente?
   *
   * Continua sendo a trava de contenção de todas as rotas; só a subida saiu
   * daqui para `cadeiaAteRaiz`, que responde o mesmo e um pouco mais.
   */
  private async dentroDaPastaDoCliente(alvo: string, raizDoCliente: string): Promise<boolean> {
    if (alvo === raizDoCliente) return false
    return (await this.cadeiaAteRaiz(alvo, raizDoCliente)) !== null
  }

  // ── Mapa de pasta → área ──────────────────────────────────────────────────

  /**
   * Tudo que a tela do mapa precisa, numa chamada só.
   *
   * O mapa, as áreas que ESTE cliente contratou (as opções legítimas do
   * seletor) e a raiz dele no Drive. Vêm juntos porque a tela não funciona com
   * um pedaço: sem as opções não há o que escolher, e sem a raiz o explorador
   * não sabe a que pasta o nível de cima corresponde. Três consultas em
   * sequência, do navegador, mostrariam a tela montando aos pedaços.
   *
   * `pastaNome` vem da coluna e não do Drive: a tela lista dezenas de pastas, e
   * uma ida à API por linha a tornaria lenta para exibir algo que muda
   * raramente. Quem renomeia no Drive vê o nome antigo aqui até remapear.
   */
  async listarMapaDeAreas(clienteId: string, ctx: ContextoInterno) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }

    const [cliente, mapa, contratadas] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { portalDriveFolderId: true },
      }),
      prisma.gestaoArquivosPastaArea.findMany({
        where: { clienteId },
        select: { pastaId: true, pastaNome: true, areaId: true },
      }),
      // Só a área CONTRATADA é opção: oferecer as outras produziria um mapa
      // que nunca acha responsável, e o arquivo cairia calado no fallback.
      prisma.clienteAreaContratada.findMany({
        where: { clienteId, contratado: true, dataEncerramento: null },
        select: { areaId: true, area: { select: { name: true } } },
        orderBy: { area: { name: 'asc' } },
      }),
    ])

    return {
      raizId: cliente?.portalDriveFolderId ?? null,
      areas: contratadas.map(c => ({ id: c.areaId, nome: c.area.name })),
      mapa: mapa.map(m => ({ pastaId: m.pastaId, pastaNome: m.pastaNome, areaId: m.areaId })),
    }
  }

  /**
   * Aponta (ou reaponta) a área de uma pasta do cliente.
   *
   * A pasta precisa estar DENTRO da pasta do cliente. Sem essa trava, um id
   * qualquer do Drive entraria no mapa e o aviso de um cliente passaria a ser
   * decidido por uma pasta de outro — ou pela pasta de backup do escritório.
   *
   * A área precisa ser CONTRATADA por este cliente: mapear para uma área que
   * ele não contratou produz um mapa que nunca acha responsável, e o arquivo
   * cairia calado no fallback sem ninguém entender por quê.
   */
  async definirAreaDaPasta(
    input: { clienteId: string; pastaId: string; areaId: string },
    ctx: ContextoInterno,
  ) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }

    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, ...filtroDeCliente(escopo, ctx) },
      select: { id: true, empresaId: true, portalDriveFolderId: true },
    })
    if (!cliente?.empresaId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    const raiz = cliente.portalDriveFolderId
    if (!raiz) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Vincule a pasta do Drive deste cliente antes de mapear áreas.',
      })
    }

    if (input.pastaId !== raiz && !(await this.dentroDaPastaDoCliente(input.pastaId, raiz))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pasta não encontrada.' })
    }

    const contratada = await prisma.clienteAreaContratada.findFirst({
      where: {
        clienteId: input.clienteId, areaId: input.areaId,
        contratado: true, dataEncerramento: null,
      },
      select: { area: { select: { name: true } } },
    })
    if (!contratada) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Este cliente não tem essa área contratada.',
      })
    }

    const info = await drive.getFolderInfo(input.pastaId).catch(() => null)

    return prisma.gestaoArquivosPastaArea.upsert({
      where: { clienteId_pastaId: { clienteId: input.clienteId, pastaId: input.pastaId } },
      create: {
        empresaId: cliente.empresaId,
        clienteId: input.clienteId,
        pastaId: input.pastaId,
        areaId: input.areaId,
        pastaNome: info?.name ?? null,
        definidoPorId: ctx.userId,
      },
      update: {
        areaId: input.areaId,
        pastaNome: info?.name ?? undefined,
        definidoPorId: ctx.userId,
      },
      select: { id: true, pastaId: true, pastaNome: true, areaId: true },
    })
  }

  /**
   * Tira uma pasta do mapa.
   *
   * Não é o mesmo que mapear para "nenhuma": a pasta volta a HERDAR da pasta
   * acima. Só quando nenhum ancestral está mapeado é que ela fica sem área e
   * cai no fallback.
   */
  async removerAreaDaPasta(input: { clienteId: string; pastaId: string }, ctx: ContextoInterno) {
    const escopo = await resolverEscopo(ctx)
    if (!alcancaCliente(escopo, input.clienteId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' })
    }
    // `deleteMany` e não `delete`: a linha pode já não existir (dois cliques,
    // duas abas), e "já não está mapeada" é sucesso, não erro.
    await prisma.gestaoArquivosPastaArea.deleteMany({
      where: { clienteId: input.clienteId, pastaId: input.pastaId },
    })
    return { ok: true }
  }

  /**
   * De que área do escritório é esta pasta.
   *
   * A área não está no arquivo: está na PASTA, e é herdada árvore acima.
   * `Fiscal/2026/Janeiro` é Fiscal sem que ninguém precise mapear cada mês —
   * o mapa cobre o topo, e o resto vem de graça. O mapeamento mais FUNDO vence,
   * porque é o mais específico: quem mapeou `Fiscal/Notas` para outra área quis
   * dizer exatamente isso.
   *
   * `null` significa "não sabemos", e é resposta comum e legítima: é a pasta
   * que o cliente criou por conta ("2026"), num escritório que ainda não
   * mapeou nada. Quem chama trata isso como fallback, nunca como erro.
   *
   * Sem mapa nenhum para o cliente, sai antes de tocar no Drive — o custo de
   * ter a funcionalidade desligada é uma consulta ao banco.
   */
  async areaDaPasta(clienteId: string, pastaId: string, raizDoCliente: string): Promise<string | null> {
    const mapa = await prisma.gestaoArquivosPastaArea.findMany({
      where: { clienteId },
      select: { pastaId: true, areaId: true },
    }).catch(() => [])
    if (mapa.length === 0) return null

    const porPasta = new Map(mapa.map(m => [m.pastaId, m.areaId]))
    if (porPasta.has(pastaId)) return porPasta.get(pastaId) ?? null

    const caminho = await this.cadeiaAteRaiz(pastaId, raizDoCliente)
    if (!caminho) return null
    for (const id of caminho) {
      const area = porPasta.get(id)
      if (area) return area
    }
    return null
  }
}
