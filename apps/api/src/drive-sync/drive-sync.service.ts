import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { drive_v3 } from 'googleapis'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { DriveClient } from './drive.client'
import { DanfeService } from '../danfe/danfe.service'
import { XmlInvalidoError } from '../danfe/danfe.parser'

interface SyncOptions {
  /** userId do humano que disparou (manual) — usado como uploadedById no Danfe. */
  iniciadoPor?: string
  tipo?: 'manual' | 'automatico'
}

interface ItemLog {
  nome: string
  fileId: string
  status: 'ok' | 'duplicado' | 'erro' | 'ignorado' | 'ja_processado'
  danfeId?: string
  chave?: string
  erro?: string
  /** Pra status='ignorado': tipo detectado (cce, cancelamento, inutilizacao, evento) */
  tipoIgnorado?: string
}

/** Arquivo encontrado na varredura recursiva. */
interface ArquivoEncontrado {
  id: string
  name: string
  mimeType: string | null | undefined
  size: string | null | undefined
  modifiedTime: string | null | undefined
  /** Caminho relativo dentro da pasta raiz (ex: "2026/Janeiro/nota.xml"). */
  path: string
}

interface SyncResult {
  logId: string
  arquivosVistos: number
  arquivosNovos: number
  arquivosOk: number
  arquivosErro: number
  arquivosIgnorados: number
  itens: ItemLog[]
}

/** Detecta XMLs que não são NFe mas são esperados na pasta (CCe, cancelamento,
 *  inutilização, manifestação destinatário). Olha só os primeiros 1500 chars
 *  pra evitar parse XML completo num arquivo que vai ser descartado. */
function detectarTipoNaoNFe(xmlString: string): { ehNaoNfe: true; tipo: string } | { ehNaoNfe: false } {
  const head = xmlString.slice(0, 1500)
  // Eventos da NFe (CCe, cancelamento, manifestação, EPEC, etc)
  if (/<procEventoNFe[\s>]/.test(head)) {
    // Detecta subtipo via tpEvento
    const tp = head.match(/<tpEvento>(\d+)<\/tpEvento>/)?.[1]
    if (tp === '110110') return { ehNaoNfe: true, tipo: 'cce' }
    if (tp === '110111') return { ehNaoNfe: true, tipo: 'cancelamento' }
    if (tp?.startsWith('21')) return { ehNaoNfe: true, tipo: 'manifestacao' }
    return { ehNaoNfe: true, tipo: 'evento' }
  }
  if (/<evento[\s>]/.test(head) && !/<NFe[\s>]/.test(head)) return { ehNaoNfe: true, tipo: 'evento' }
  if (/<envEvento[\s>]/.test(head)) return { ehNaoNfe: true, tipo: 'evento' }
  if (/<procInutNFe[\s>]|<inutNFe[\s>]/.test(head)) return { ehNaoNfe: true, tipo: 'inutilizacao' }
  if (/<retEvento[\s>]/.test(head)) return { ehNaoNfe: true, tipo: 'retorno_evento' }
  // Boletos, contratos, etc — qualquer XML que não tenha <NFe> ou <nfeProc>
  if (!/<NFe[\s>]/.test(head) && !/<nfeProc[\s>]/.test(head)) {
    return { ehNaoNfe: true, tipo: 'nao_nfe' }
  }
  return { ehNaoNfe: false }
}

/**
 * Sincroniza pastas do Google Drive vinculadas a clientes, importando XMLs
 * de NFe automaticamente. Usa o `DanfeService.processarXml` existente — o
 * fluxo de geração de PDF + persistência é o mesmo do upload manual.
 *
 * Varredura: BFS recursivo a partir da pasta vinculada. Subpastas (organização
 * livre que o cliente faz) são descobertas e percorridas.
 *
 * Dedup em 3 camadas:
 *   1) `drive_synced_files` por `(cliente_id, file_id)` — pula sem baixar
 *      (file_id é estável; se o cliente só renomeou ou moveu o arquivo, mesmo id).
 *   2) `drive_synced_files` por `(cliente_id, sha256)` — pega cópias do MESMO
 *      conteúdo em outro file_id (cliente duplicou o arquivo em outra subpasta).
 *   3) `Danfe.chave` unique — última linha de defesa pra NFe que já existe
 *      no sistema (importada por outro caminho, ex: upload manual).
 *
 * Ignorados (CCe, cancelamento, inutilização) também são registrados na tabela
 * — não são reprocessados a cada sync.
 */
@Injectable()
export class DriveSyncService {
  private readonly driveClient = new DriveClient()

  constructor(
    @Inject(DanfeService) private readonly danfeSvc: DanfeService,
  ) {}

  /** Email da conta autenticada. SA: o próprio email da SA. OAuth: conta humana
   *  autorizada (resolvido async via userinfo). UI usa pra orientar o usuário. */
  async getAccountInfo(): Promise<{ email: string; mode: 'oauth' | 'service-account' | null }> {
    const mode = this.driveClient.getMode()
    let email = this.driveClient.getAccountEmail()
    if (mode === 'oauth' && (!email || email === '(não disponível)')) {
      email = (await this.driveClient.resolveOAuthUserEmail()) ?? '(não disponível)'
    }
    return { email, mode }
  }

  // ─── Vinculação ────────────────────────────────────────

  /** Vincula uma pasta do Drive a um cliente. Valida acesso antes de salvar. */
  async vincularPasta(input: { clienteId: string; folderInput: string }): Promise<{
    folderId: string
    folderName: string
  }> {
    const folderId = DriveClient.extractFolderId(input.folderInput)
    const drive = this.driveClient.drive()

    let folder: drive_v3.Schema$File
    try {
      const r = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, trashed',
        supportsAllDrives: true,
      })
      folder = r.data
    } catch (e: unknown) {
      const msg = (e as Error).message
      if (msg.includes('404') || msg.includes('not found')) {
        const mode = this.driveClient.getMode()
        const email = this.driveClient.getAccountEmail()
        const hint = mode === 'oauth'
          ? `Verifique se a conta ${email} tem acesso à pasta.`
          : `Compartilhe a pasta com: ${email}`
        throw new Error(`Pasta não encontrada ou sem acesso. ${hint}`)
      }
      throw new Error(`Falha ao validar pasta: ${msg}`)
    }

    if (folder.trashed) throw new Error('Pasta está na lixeira.')
    if (folder.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('O ID informado não é de uma pasta.')
    }

    await prisma.cliente.update({
      where: { id: input.clienteId },
      data: {
        driveFolderId: folderId,
        driveFolderName: folder.name ?? null,
        driveSyncStatus: 'nunca',
        driveSyncedAt: null,
        driveSyncToken: null,
      },
    })

    return { folderId, folderName: folder.name ?? '(sem nome)' }
  }

  async desvincularPasta(clienteId: string): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        driveFolderId: null,
        driveFolderName: null,
        driveSyncToken: null,
        driveSyncedAt: null,
        driveSyncStatus: null,
      },
    })
  }

  // ─── Pasta Local (monitorada pelo Launcher Electron) ─────────

  /** Salva caminho local + flag de ativação. O daemon Electron lê via listarConfigsLocais. */
  async configurarPastaLocal(input: { clienteId: string; path: string; enabled: boolean }): Promise<void> {
    const path = input.path.trim()
    if (!path && input.enabled) throw new Error('Informe o caminho da pasta.')
    await prisma.cliente.update({
      where: { id: input.clienteId },
      data: {
        localFolderPath: path || null,
        localSyncEnabled: input.enabled,
        localSyncStatus: path && input.enabled ? 'aguardando_daemon' : null,
      },
    })
  }

  /** Lista clientes com pasta local configurada. Consumida pelo daemon Electron. */
  async listarConfigsLocais() {
    return prisma.cliente.findMany({
      where: { localSyncEnabled: true, localFolderPath: { not: null }, deletedAt: null },
      select: {
        id: true,
        razaoSocial: true,
        documento: true,
        empresaId: true,
        localFolderPath: true,
        localSyncedAt: true,
      },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  /** UI solicita varredura completa da pasta local. Daemon detecta no próximo poll. */
  async solicitarSyncLocal(clienteId: string): Promise<void> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { localFolderPath: true, localSyncEnabled: true },
    })
    if (!cliente?.localFolderPath || !cliente.localSyncEnabled) {
      throw new Error('Pasta local não está configurada ou está desativada.')
    }
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { localSyncRequestedAt: new Date() },
    })
  }

  /** Lista clienteIds com sync solicitada — daemon pega no poll. */
  async listarSyncRequests(): Promise<string[]> {
    const rows = await prisma.cliente.findMany({
      where: { localSyncRequestedAt: { not: null }, localSyncEnabled: true, deletedAt: null },
      select: { id: true },
    })
    return rows.map(r => r.id)
  }

  /** Daemon chama após processar a request — limpa o flag. */
  async limparSyncRequest(clienteId: string): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { localSyncRequestedAt: null },
    }).catch(() => { /* ignora */ })
  }

  /** Heartbeat do daemon — atualiza status dos clientes que estão sendo observados.
   *  Aceita lista de { clienteId, watching } pra refletir se o watcher conseguiu
   *  abrir cada pasta (vs path inválido / sem acesso). */
  async heartbeatLocal(items: Array<{ clienteId: string; watching: boolean; ultimoErro?: string | null }>): Promise<void> {
    if (items.length === 0) return
    for (const item of items) {
      const status = item.watching
        ? 'monitorando'
        : (item.ultimoErro ? 'erro' : 'aguardando_daemon')
      await prisma.cliente.update({
        where: { id: item.clienteId },
        data: { localSyncStatus: status },
      }).catch(() => { /* cliente removido — ignora */ })
    }
  }

  /** Processa um batch de arquivos (XML ou ZIP) vindos da pasta local do cliente.
   *  Mesma pipeline do Drive sync: dedup por SHA, classificação CCe, processamento DANFE.
   *  O caller (daemon Electron) já leu os bytes; aqui processamos. */
  async processarBatchLocal(input: {
    clienteId: string
    arquivos: Array<{ nome: string; pathRelativo: string; buffer: Buffer }>
    iniciadoPor?: string
  }): Promise<SyncResult> {
    const t0 = Date.now()
    const cliente = await prisma.cliente.findUnique({
      where: { id: input.clienteId },
      select: { id: true, razaoSocial: true, empresaId: true, localFolderPath: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    const uploadedById = await this.resolveUploadedBy(input.iniciadoPor, cliente.empresaId)
    if (!uploadedById) throw new Error('Sem usuário válido pra atribuir como uploader.')

    // Log da execução — reutiliza DriveSyncLog (campo `tipo` indica origem)
    const log = await prisma.driveSyncLog.create({
      data: {
        clienteId: cliente.id,
        tipo: input.iniciadoPor ? 'local_manual' : 'local_auto',
        iniciadoPor: input.iniciadoPor ?? null,
        status: 'running',
      },
    })
    console.log(`[LocalSync] [${cliente.razaoSocial}] start ${input.arquivos.length} arquivos`)

    const itens: ItemLog[] = []
    let arquivosVistos = input.arquivos.length
    let arquivosNovos = 0
    let arquivosOk = 0
    let arquivosErro = 0
    let arquivosIgnorados = 0

    try {
      for (let idx = 0; idx < input.arquivos.length; idx++) {
        const arq = input.arquivos[idx]!
        await this.atualizarProgresso(log.id, {
          etapa: 'processando',
          atual: idx + 1,
          total: arquivosVistos,
          nome: arq.pathRelativo,
        })

        // Pra arquivos locais, o "fileId" é o sha256 do conteúdo (não temos id estável)
        const sha = createHash('sha256').update(arq.buffer).digest('hex')
        const fileIdLocal = `local:${sha}`

        // Dedup #1 — sha já processado nesse cliente (file_id = sha)
        const jaVisto = await prisma.driveSyncedFile.findFirst({
          where: { clienteId: cliente.id, OR: [{ fileId: fileIdLocal }, { sha256: sha }] },
          select: { id: true, danfeId: true, status: true, tipoIgnorado: true },
        })
        if (jaVisto) {
          itens.push({
            nome: arq.pathRelativo,
            fileId: fileIdLocal,
            status: 'duplicado',
            danfeId: jaVisto.danfeId ?? undefined,
          })
          continue
        }

        try {
          // Processa XML ou ZIP
          const xmlsExtraidos = await this.extrairXmlsDeBuffer(arq.buffer, arq.nome)
          for (const x of xmlsExtraidos) {
            const xSha = createHash('sha256').update(x.conteudo).digest('hex')
            // Dedup por sha do XML interno (caso ZIP tenha cópia)
            const dupXml = await prisma.driveSyncedFile.findFirst({
              where: { clienteId: cliente.id, sha256: xSha },
              select: { id: true, danfeId: true },
            })
            if (dupXml) continue

            const det = detectarTipoNaoNFe(x.conteudo)
            if (det.ehNaoNfe) {
              await this.registrarArquivoProcessado({
                clienteId: cliente.id,
                fileId: `local:${xSha}`,
                sha256: xSha,
                fileName: x.nome,
                pathDrive: `${arq.pathRelativo}::${x.nome}`,
                status: 'ignorado',
                tipoIgnorado: det.tipo,
              })
              arquivosIgnorados++
              continue
            }

            try {
              const r = await this.danfeSvc.processarXml(x.conteudo, {
                uploadedById,
                empresaId: cliente.empresaId,
                clienteId: cliente.id,
              })
              await this.registrarArquivoProcessado({
                clienteId: cliente.id,
                fileId: `local:${xSha}`,
                sha256: xSha,
                fileName: x.nome,
                pathDrive: `${arq.pathRelativo}::${x.nome}`,
                status: 'ok',
                danfeId: r.id,
              })
              arquivosOk++
              arquivosNovos++
            } catch (e: unknown) {
              const err = e as { code?: string; danfeId?: string; message?: string }
              if (err.code === 'DUPLICADO') {
                await this.registrarArquivoProcessado({
                  clienteId: cliente.id,
                  fileId: `local:${xSha}`,
                  sha256: xSha,
                  fileName: x.nome,
                  pathDrive: `${arq.pathRelativo}::${x.nome}`,
                  status: 'duplicado',
                  danfeId: err.danfeId ?? null,
                })
              } else {
                arquivosErro++
                itens.push({ nome: x.nome, fileId: `local:${xSha}`, status: 'erro', erro: err.message ?? 'Erro' })
              }
            }
          }

          // Registra o arquivo "pai" (zip ou xml original) também — dedup do próximo scan
          await this.registrarArquivoProcessado({
            clienteId: cliente.id,
            fileId: fileIdLocal,
            sha256: sha,
            fileName: arq.nome,
            pathDrive: arq.pathRelativo,
            status: 'ok',
          })
        } catch (e: unknown) {
          arquivosErro++
          itens.push({
            nome: arq.pathRelativo,
            fileId: fileIdLocal,
            status: 'erro',
            erro: (e as Error).message,
          })
        }
      }

      await prisma.driveSyncLog.update({
        where: { id: log.id },
        data: {
          finalizadoEm: new Date(),
          status: arquivosErro > 0 && arquivosOk === 0 ? 'error' : 'completed',
          arquivosVistos, arquivosNovos, arquivosOk, arquivosErro, arquivosIgnorados,
          itens: itens as unknown as object,
        },
      })

      await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          localSyncedAt: new Date(),
          localSyncStatus: arquivosErro > 0 ? 'erro' : 'ok',
        },
      })

      console.log(`[LocalSync] [${cliente.razaoSocial}] done +${Date.now() - t0}ms vistos=${arquivosVistos} ok=${arquivosOk} ign=${arquivosIgnorados} err=${arquivosErro}`)
      return { logId: log.id, arquivosVistos, arquivosNovos, arquivosOk, arquivosErro, arquivosIgnorados, itens }
    } catch (e: unknown) {
      await prisma.driveSyncLog.update({
        where: { id: log.id },
        data: {
          finalizadoEm: new Date(),
          status: 'error',
          erroMensagem: (e as Error).message,
          arquivosVistos, arquivosNovos, arquivosOk, arquivosErro, arquivosIgnorados,
          itens: itens as unknown as object,
        },
      })
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { localSyncStatus: 'erro' },
      })
      throw e
    }
  }

  /** Extrai XML(s) de um buffer. Se for XML puro, retorna 1. Se for ZIP, descompacta. */
  private async extrairXmlsDeBuffer(buffer: Buffer, nome: string): Promise<Array<{ nome: string; conteudo: string }>> {
    const lower = nome.toLowerCase()
    if (lower.endsWith('.xml')) {
      return [{ nome, conteudo: buffer.toString('utf8') }]
    }
    if (lower.endsWith('.zip')) {
      // Lazy import pra não carregar em todos os boots
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(buffer)
      const xmls: Array<{ nome: string; conteudo: string }> = []
      for (const entry of zip.getEntries()) {
        if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.xml')) {
          xmls.push({ nome: entry.entryName, conteudo: entry.getData().toString('utf8') })
        }
      }
      return xmls
    }
    return []  // tipo não suportado
  }

  // ─── Sincronização ──────────────────────────────────────

  /** Roda a sync de UM cliente. Retorna stats + popula DriveSyncLog. */
  async sincronizarCliente(clienteId: string, opts: SyncOptions = {}): Promise<SyncResult> {
    const t0 = Date.now()
    console.log(`[DriveSync] [${clienteId}] start tipo=${opts.tipo ?? 'manual'}`)

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        razaoSocial: true,
        empresaId: true,
        driveFolderId: true,
        driveSyncedAt: true,
      },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')
    if (!cliente.driveFolderId) throw new Error('Cliente sem pasta vinculada no Drive.')

    const uploadedById = await this.resolveUploadedBy(opts.iniciadoPor, cliente.empresaId)
    if (!uploadedById) {
      throw new Error('Nenhum usuário válido pra atribuir como uploader. Configure ao menos 1 MASTER ou ADMIN.')
    }

    const tipo = opts.tipo ?? (opts.iniciadoPor ? 'manual' : 'automatico')

    // Cria log inicial (status: running)
    const log = await prisma.driveSyncLog.create({
      data: {
        clienteId: cliente.id,
        tipo,
        iniciadoPor: opts.iniciadoPor ?? null,
        status: 'running',
      },
    })
    console.log(`[DriveSync] [${cliente.razaoSocial}] log=${log.id} +${Date.now() - t0}ms`)

    const itens: ItemLog[] = []
    let arquivosVistos = 0
    let arquivosNovos = 0
    let arquivosOk = 0
    let arquivosErro = 0
    let arquivosIgnorados = 0
    let arquivosJaProcessados = 0

    try {
      await this.atualizarProgresso(log.id, { etapa: 'varrendo', atual: 0, total: 0, nome: 'Listando arquivos...' })
      const arquivosXml = await this.varrerXmlsRecursivo(cliente.driveFolderId)
      arquivosVistos = arquivosXml.length
      console.log(`[DriveSync] [${cliente.razaoSocial}] varreu ${arquivosVistos} XMLs (recursivo) +${Date.now() - t0}ms`)
      await this.atualizarProgresso(log.id, { etapa: 'processando', atual: 0, total: arquivosVistos, nome: '' })

      // 1ª camada de dedup: file_id já visto pra esse cliente → pula sem baixar
      const fileIds = arquivosXml.map(a => a.id)
      const jaVistosPorFileId = await prisma.driveSyncedFile.findMany({
        where: { clienteId: cliente.id, fileId: { in: fileIds } },
        select: { fileId: true },
      })
      const fileIdsJaVistos = new Set(jaVistosPorFileId.map(r => r.fileId))

      for (let idx = 0; idx < arquivosXml.length; idx++) {
        const arq = arquivosXml[idx]!
        // Atualiza progresso ANTES de cada arquivo (mesmo se for pulado por dedup)
        await this.atualizarProgresso(log.id, {
          etapa: 'processando',
          atual: idx + 1,
          total: arquivosVistos,
          nome: arq.path,
        })

        // Dedup #1 — file_id estável
        if (fileIdsJaVistos.has(arq.id)) {
          arquivosJaProcessados++
          continue  // não loga item: ruído desnecessário
        }

        try {
          const tArq = Date.now()
          const xmlString = await this.baixarConteudo(arq.id)
          const sha = createHash('sha256').update(xmlString).digest('hex')
          console.log(`[DriveSync] [${cliente.razaoSocial}]   baixou ${arq.path} (${xmlString.length}b sha=${sha.slice(0, 8)}) em ${Date.now() - tArq}ms`)

          // Dedup #2 — mesmo conteúdo já processado em outro file_id (cliente copiou/moveu)
          const jaVistoPorSha = await prisma.driveSyncedFile.findFirst({
            where: { clienteId: cliente.id, sha256: sha },
            select: { id: true, danfeId: true, status: true, tipoIgnorado: true },
          })
          if (jaVistoPorSha) {
            await this.registrarArquivoProcessado({
              clienteId: cliente.id,
              fileId: arq.id,
              sha256: sha,
              fileName: arq.name,
              pathDrive: arq.path,
              status: 'duplicado',
              danfeId: jaVistoPorSha.danfeId,
              tipoIgnorado: jaVistoPorSha.tipoIgnorado,
            })
            itens.push({
              nome: arq.path,
              fileId: arq.id,
              status: 'duplicado',
              danfeId: jaVistoPorSha.danfeId ?? undefined,
            })
            continue
          }

          // Pré-check: pula CCe, cancelamento, inutilização — registra na tabela pra não baixar de novo
          const det = detectarTipoNaoNFe(xmlString)
          if (det.ehNaoNfe) {
            await this.registrarArquivoProcessado({
              clienteId: cliente.id,
              fileId: arq.id,
              sha256: sha,
              fileName: arq.name,
              pathDrive: arq.path,
              status: 'ignorado',
              tipoIgnorado: det.tipo,
            })
            itens.push({ nome: arq.path, fileId: arq.id, status: 'ignorado', tipoIgnorado: det.tipo })
            arquivosIgnorados++
            continue
          }

          const r = await this.danfeSvc.processarXml(xmlString, {
            uploadedById,
            empresaId: cliente.empresaId,
            clienteId: cliente.id,
          })
          await this.registrarArquivoProcessado({
            clienteId: cliente.id,
            fileId: arq.id,
            sha256: sha,
            fileName: arq.name,
            pathDrive: arq.path,
            status: 'ok',
            danfeId: r.id,
          })
          itens.push({ nome: arq.path, fileId: arq.id, status: 'ok', danfeId: r.id, chave: r.chave })
          arquivosNovos++
          arquivosOk++
        } catch (e: unknown) {
          const err = e as { code?: string; message?: string; danfeId?: string }
          if (err.code === 'DUPLICADO') {
            // NFe.chave já existe (importada por outro caminho, ex: upload manual).
            // Registra ASYNC pra não rebaixar — mas só se tivermos o sha já calculado.
            itens.push({ nome: arq.path, fileId: arq.id, status: 'duplicado', danfeId: err.danfeId })
          } else {
            const msg = e instanceof XmlInvalidoError
              ? `XML inválido: ${e.message}`
              : (err.message ?? 'Erro desconhecido')
            itens.push({ nome: arq.path, fileId: arq.id, status: 'erro', erro: msg })
            arquivosErro++
          }
        }
      }

      if (arquivosJaProcessados > 0) {
        console.log(`[DriveSync] [${cliente.razaoSocial}] pulou ${arquivosJaProcessados} já processados (dedup file_id)`)
      }

      await prisma.driveSyncLog.update({
        where: { id: log.id },
        data: {
          finalizadoEm: new Date(),
          status: arquivosErro > 0 && arquivosOk === 0 ? 'error' : 'completed',
          arquivosVistos,
          arquivosNovos,
          arquivosOk,
          arquivosErro,
          arquivosIgnorados,
          itens: itens as unknown as object,
        },
      })

      await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          driveSyncedAt: new Date(),
          driveSyncStatus: arquivosErro > 0 ? 'erro' : 'ok',
        },
      })

      console.log(`[DriveSync] [${cliente.razaoSocial}] done +${Date.now() - t0}ms vistos=${arquivosVistos} ok=${arquivosOk} ign=${arquivosIgnorados} err=${arquivosErro}`)
      return { logId: log.id, arquivosVistos, arquivosNovos, arquivosOk, arquivosErro, arquivosIgnorados, itens }
    } catch (e: unknown) {
      const msg = (e as Error).message
      console.error(`[DriveSync] [${cliente.razaoSocial}] ERRO +${Date.now() - t0}ms: ${msg}`)
      await prisma.driveSyncLog.update({
        where: { id: log.id },
        data: {
          finalizadoEm: new Date(),
          status: 'error',
          erroMensagem: msg,
          arquivosVistos,
          arquivosNovos,
          arquivosOk,
          arquivosErro,
          arquivosIgnorados,
          itens: itens as unknown as object,
        },
      })
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { driveSyncStatus: 'erro' },
      })
      throw e
    }
  }

  /** Roda a sync de TODOS os clientes com pasta vinculada. Tolerante a falhas individuais. */
  async sincronizarTodos(opts: SyncOptions = {}): Promise<{
    totalClientes: number
    sucesso: number
    falhas: number
    detalhes: Array<{ clienteId: string; razaoSocial: string; resultado?: SyncResult; erro?: string }>
  }> {
    const clientes = await prisma.cliente.findMany({
      where: { driveFolderId: { not: null }, deletedAt: null },
      select: { id: true, razaoSocial: true },
      orderBy: { razaoSocial: 'asc' },
    })

    let sucesso = 0
    let falhas = 0
    const detalhes: Array<{ clienteId: string; razaoSocial: string; resultado?: SyncResult; erro?: string }> = []

    for (const c of clientes) {
      try {
        const r = await this.sincronizarCliente(c.id, opts)
        detalhes.push({ clienteId: c.id, razaoSocial: c.razaoSocial, resultado: r })
        sucesso++
      } catch (e) {
        detalhes.push({ clienteId: c.id, razaoSocial: c.razaoSocial, erro: (e as Error).message })
        falhas++
      }
    }

    return { totalClientes: clientes.length, sucesso, falhas, detalhes }
  }

  // ─── Queries ────────────────────────────────────────────

  async listarLogs(clienteId: string, limit = 20) {
    // Só logs ativos (não arquivados). Antigos viram arquivado=true automaticamente
    // pelo helper `registrarSyncLog` quando o cliente passa de 10 logs ativos.
    return prisma.driveSyncLog.findMany({
      where: { clienteId, arquivado: false },
      orderBy: { iniciadoEm: 'desc' },
      take: Math.min(limit, 100),
    })
  }

  async getLog(id: string) {
    return prisma.driveSyncLog.findUnique({ where: { id } })
  }

  /** Retorna o progresso da sync EM ANDAMENTO para um cliente, se houver.
   *  Usado pela UI pra polling enquanto o botão "Sincronizar agora" tá rodando. */
  async getProgressoAtual(clienteId: string): Promise<{
    logId: string
    iniciadoEm: Date
    progresso: { etapa: string; atual: number; total: number; nome: string } | null
  } | null> {
    const log = await prisma.driveSyncLog.findFirst({
      where: { clienteId, status: 'running' },
      orderBy: { iniciadoEm: 'desc' },
      select: { id: true, iniciadoEm: true, progresso: true },
    })
    if (!log) return null
    return {
      logId: log.id,
      iniciadoEm: log.iniciadoEm,
      progresso: (log.progresso as { etapa: string; atual: number; total: number; nome: string } | null) ?? null,
    }
  }

  // ─── Helpers privados ──────────────────────────────────

  /** Promise.race com timeout pra qualquer chamada Google API. Evita hang infinito
   *  se o servidor da Google ficar pendurado (acontece raro mas devastador). */
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
      p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
    })
  }

  /** Varre BFS toda a pasta vinculada e subpastas, devolvendo APENAS XMLs.
   *  Cada item carrega `path` = caminho relativo dentro da pasta raiz (debug/UI). */
  private async varrerXmlsRecursivo(rootFolderId: string): Promise<ArquivoEncontrado[]> {
    const drive = this.driveClient.drive()
    const arquivos: ArquivoEncontrado[] = []
    const fila: Array<{ folderId: string; pathPrefix: string }> = [{ folderId: rootFolderId, pathPrefix: '' }]
    const visitados = new Set<string>()  // evita loops em estruturas anômalas

    while (fila.length > 0) {
      const { folderId, pathPrefix } = fila.shift()!
      if (visitados.has(folderId)) continue
      visitados.add(folderId)

      let pageToken: string | undefined
      do {
        const r = await this.withTimeout(
          drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            pageSize: 100,
            pageToken,
            fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            orderBy: 'modifiedTime',
          }),
          20_000,
          `drive.files.list folder=${folderId}`,
        )

        for (const f of r.data.files ?? []) {
          if (!f.id || !f.name) continue
          const path = pathPrefix ? `${pathPrefix}/${f.name}` : f.name
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            fila.push({ folderId: f.id, pathPrefix: path })
          } else if (
            f.mimeType === 'text/xml' ||
            f.mimeType === 'application/xml' ||
            f.name.toLowerCase().endsWith('.xml')
          ) {
            arquivos.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
              modifiedTime: f.modifiedTime,
              path,
            })
          }
          // Outros tipos (PDF, imagens, etc) ignorados — pode haver expansão futura.
        }
        pageToken = r.data.nextPageToken ?? undefined
      } while (pageToken)
    }

    return arquivos
  }

  /** Salva snapshot do progresso no log de sync — UI faz polling em getProgressoAtual.
   *  Falha silenciosa (não trava sync se update der erro). */
  private async atualizarProgresso(logId: string, progresso: { etapa: string; atual: number; total: number; nome: string }): Promise<void> {
    try {
      await prisma.driveSyncLog.update({
        where: { id: logId },
        data: { progresso: progresso as unknown as object },
      })
    } catch { /* não trava sync */ }
  }

  /** Registra na tabela `drive_synced_files` que este arquivo foi processado.
   *  Usa upsert pra ser idempotente — se chamado 2x com mesmo (clienteId, fileId), atualiza. */
  private async registrarArquivoProcessado(input: {
    clienteId: string
    fileId: string
    sha256: string
    fileName: string
    pathDrive: string
    status: 'ok' | 'duplicado' | 'ignorado' | 'erro'
    danfeId?: string | null
    tipoIgnorado?: string | null
  }): Promise<void> {
    await prisma.driveSyncedFile.upsert({
      where: { clienteId_fileId: { clienteId: input.clienteId, fileId: input.fileId } },
      create: {
        clienteId: input.clienteId,
        fileId: input.fileId,
        sha256: input.sha256,
        fileName: input.fileName,
        pathDrive: input.pathDrive,
        status: input.status,
        danfeId: input.danfeId ?? null,
        tipoIgnorado: input.tipoIgnorado ?? null,
      },
      update: {
        sha256: input.sha256,
        fileName: input.fileName,
        pathDrive: input.pathDrive,
        status: input.status,
        danfeId: input.danfeId ?? null,
        tipoIgnorado: input.tipoIgnorado ?? null,
        processadoEm: new Date(),
      },
    })
  }

  private async baixarConteudo(fileId: string): Promise<string> {
    const drive = this.driveClient.drive()
    const r = await this.withTimeout(
      drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      ),
      15_000,
      `drive.files.get id=${fileId} (request)`,
    )
    const stream = r.data as Readable
    const chunks: Buffer[] = []
    return this.withTimeout(
      new Promise<string>((resolve, reject) => {
        stream.on('data', (c: Buffer) => chunks.push(c))
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        stream.on('error', reject)
      }),
      30_000,
      `drive.files.get id=${fileId} (stream)`,
    )
  }

  /** Resolve o userId do "user sistema" (primeiro master global ativo). Usado por
   *  callers sem contexto de usuário (Launcher daemon, cron, etc). */
  async resolveSystemUserId(): Promise<string | null> {
    const master = await prisma.user.findFirst({
      where: { isActive: true, isMaster: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return master?.id ?? null
  }

  /** Resolve o userId pra usar como uploadedById no Danfe.
   *  Preferência: usuário que disparou (manual). Fallback: primeiro master ativo
   *  da empresa (isMaster=true) ou empresa-master, depois qualquer master global. */
  private async resolveUploadedBy(iniciadoPor: string | undefined, empresaId: string | null): Promise<string | null> {
    if (iniciadoPor) {
      const u = await prisma.user.findUnique({ where: { id: iniciadoPor }, select: { id: true } })
      if (u) return u.id
    }
    // 1) master da empresa do cliente
    if (empresaId) {
      const empMaster = await prisma.user.findFirst({
        where: { isActive: true, empresaId, OR: [{ isMaster: true }, { isEmpresaMaster: true }] },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (empMaster) return empMaster.id
    }
    // 2) qualquer master global ativo
    const master = await prisma.user.findFirst({
      where: { isActive: true, isMaster: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return master?.id ?? null
  }
}
