import { Injectable, Logger } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { prisma } from '@saas/db'
import { DriveClient } from '../drive-sync/drive.client'
import type { VinculoPortal } from '../portal/portal-escopo'
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
      this.logger.warn(`Falha ao baixar ${input.fileId} do Drive: ${String(e)}`)
      throw new TRPCError({
        code: 'BAD_GATEWAY',
        message: 'Não foi possível baixar o arquivo do Drive.',
      })
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
        })),
      }
    } catch (e) {
      this.logger.warn(`Falha ao listar pasta ${alvo} para o portal: ${String(e)}`)
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível falar com o Google Drive agora.' })
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
      this.logger.warn(`Falha ao baixar ${fileId} para o portal: ${String(e)}`)
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível baixar o arquivo.' })
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
      this.logger.warn(`Falha ao criar pasta no Drive: ${String(e)}`)
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível criar a pasta no Drive.' })
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
      return { id: enviado.id, nome: enviado.name }
    } catch (e) {
      this.logger.warn(`Falha ao subir arquivo para o Drive: ${String(e)}`)
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível enviar o arquivo ao Drive.' })
    }
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
      this.logger.warn(`Falha ao excluir ${itemId} no Drive: ${String(e)}`)
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível excluir no Drive.' })
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
