import { Injectable } from '@nestjs/common'
import { buildPaginatedResponse, getPrismaSkipTake, scoped } from '@saas/db'
import type { Prisma } from '@saas/db'
import {
  JOB_TOOL_IDS,
  TOOL_AREA,
  type JobToolId,
  type ListToolJobsInput,
  type ToolArea,
} from '@saas/types'
import { WebappGatewayService, type GatewayUploadFile } from './webapp-gateway.service'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.ToolJobWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

function toolsOfArea(area: ToolArea): JobToolId[] {
  return JOB_TOOL_IDS.filter((id) => TOOL_AREA[id] === area)
}

export interface CreateToolJobInput {
  tool: JobToolId
  files: GatewayUploadFile[]
  fields?: Record<string, string>
  fileNameIn: string
}

/**
 * Orquestra o ciclo de vida do ToolJob (histórico/auditoria por tenant) e a
 * conversa com o webapp via gateway. Tudo escopado pelo schema do tenant.
 * Padrão espelhado de cliente/area.service. Ver docs/plano-ferramentas.md §Fase 1.
 */
@Injectable()
export class FerramentasService {
  constructor(private readonly gateway: WebappGatewayService) {}

  async create(
    input: CreateToolJobInput,
    _isMaster: boolean,
    empresaId?: string,
    userId?: string,
    tenantSchema?: string,
  ) {
    // 1) registro local em "queued" + evento "created".
    const job = await scoped(tenantSchema, (db) =>
      db.toolJob.create({
        data: {
          tool: input.tool,
          status: 'queued',
          fileNameIn: input.fileNameIn,
          empresaId: empresaId || null,
          userId: userId || null,
          eventos: {
            create: { type: 'created', status: 'queued', version: 1, userId: userId || null },
          },
        },
      }),
    )

    // 2) enfileira no webapp; guarda o id remoto (ou marca failed e propaga).
    try {
      const remote = await this.gateway.createJob(input.tool, input.files, input.fields ?? {})
      return await scoped(tenantSchema, (db) =>
        db.toolJob.update({
          where: { id: job.id },
          data: { webappJobId: remote.id, status: 'queued' },
        }),
      )
    } catch (e) {
      await scoped(tenantSchema, (db) =>
        db.toolJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            errorMessage: (e as Error).message.slice(0, 500),
            eventos: {
              create: { type: 'status-change', status: 'failed', version: job.version, userId: userId || null },
            },
          },
        }),
      )
      throw e
    }
  }

  async list(input: ListToolJobsInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.ToolJobWhereInput = {
        deletedAt: null,
        ...empresaFilter(isMaster, empresaId),
        ...(input.tool ? { tool: input.tool } : {}),
        ...(!input.tool && input.area ? { tool: { in: toolsOfArea(input.area) } } : {}),
        ...(input.status ? { status: input.status } : {}),
      }
      const [data, total] = await Promise.all([
        db.toolJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        db.toolJob.count({ where }),
      ])
      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async listTrash(input: ListToolJobsInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit } = input
    const { skip, take } = getPrismaSkipTake(page, limit)
    return scoped(tenantSchema, async (db) => {
      const where: Prisma.ToolJobWhereInput = {
        deletedAt: { not: null },
        ...empresaFilter(isMaster, empresaId),
      }
      const [data, total] = await Promise.all([
        db.toolJob.findMany({ where, orderBy: { deletedAt: 'desc' }, skip, take }),
        db.toolJob.count({ where }),
      ])
      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return this.getOwned(id, isMaster, empresaId, tenantSchema)
  }

  /** Consulta o status no webapp e reflete no ToolJob; grava evento só se o status mudar. */
  async refreshStatus(
    id: string,
    isMaster: boolean,
    empresaId?: string,
    userId?: string,
    tenantSchema?: string,
  ) {
    const job = await this.getOwned(id, isMaster, empresaId, tenantSchema)
    if (!job.webappJobId) return job

    const remote = await this.gateway.getStatus(job.tool as JobToolId, job.webappJobId)
    const statusChanged = remote.status !== job.status
    const progressChanged = (remote.progress ?? job.progress) !== job.progress
    if (!statusChanged && !progressChanged) return job

    return scoped(tenantSchema, (db) =>
      db.toolJob.update({
        where: { id },
        data: {
          status: remote.status,
          progress: remote.progress ?? job.progress,
          fileNameOut: remote.fileName ?? job.fileNameOut,
          errorMessage: remote.error ?? null,
          ...(statusChanged
            ? {
                eventos: {
                  create: {
                    type: 'status-change',
                    status: remote.status,
                    version: job.version,
                    userId: userId || null,
                  },
                },
              }
            : {}),
        },
      }),
    )
  }

  async delete(id: string, isMaster: boolean, empresaId?: string, userId?: string, tenantSchema?: string) {
    const job = await this.getOwned(id, isMaster, empresaId, tenantSchema)
    return scoped(tenantSchema, (db) =>
      db.toolJob.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          eventos: { create: { type: 'deleted', version: job.version, userId: userId || null } },
        },
      }),
    )
  }

  async restore(id: string, isMaster: boolean, empresaId?: string, userId?: string, tenantSchema?: string) {
    const job = await this.getOwned(id, isMaster, empresaId, tenantSchema)
    return scoped(tenantSchema, (db) =>
      db.toolJob.update({
        where: { id },
        data: {
          deletedAt: null,
          eventos: { create: { type: 'restored', version: job.version, userId: userId || null } },
        },
      }),
    )
  }

  /**
   * Resolve o alvo de download: garante posse + job concluído e busca um
   * downloadToken fresco no webapp. O controller usa isso p/ fazer o stream.
   */
  async getDownloadTarget(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const job = await this.getOwned(id, isMaster, empresaId, tenantSchema)
    if (!job.webappJobId) throw new Error('Job ainda não foi enviado ao processador.')

    const remote = await this.gateway.getStatus(job.tool as JobToolId, job.webappJobId)
    if (remote.status !== 'done' || !remote.downloadToken) {
      throw new Error('Job não concluído — download indisponível.')
    }
    return {
      tool: job.tool as JobToolId,
      webappJobId: job.webappJobId,
      token: remote.downloadToken,
      fileName: remote.fileName ?? job.fileNameOut ?? 'arquivo.xlsx',
    }
  }

  /** Busca o job garantindo isolamento por empresa (a não ser master). */
  private async getOwned(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const job = await db.toolJob.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && job.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return job
    })
  }
}
