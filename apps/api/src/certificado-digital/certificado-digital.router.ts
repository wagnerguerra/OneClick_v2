import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure, protectedProcedure } from '../trpc/trpc.service'
import { CertificadoDigitalService } from './certificado-digital.service'
import { LegacyImportCertService } from './legacy-import-cert.service'
import { BulkImportCertService } from './bulk-import-cert.service'
import { AuthService } from '../auth/auth.service'

const MODULE = 'gestao-certificados'

/**
 * Validação reauth: confirma a senha do user logado antes de ações sensíveis.
 * Lança FORBIDDEN se inválida. Recebe AuthService injetado.
 */
async function assertReauth(authService: AuthService, userId: string, senhaUser: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user?.email) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário inválido' })
  const ok = await authService.verifyPassword(user.email, senhaUser)
  if (!ok) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Senha incorreta. Confirme sua senha para continuar.' })
  }
}

/** Verifica sub-permissão. Master/Empresa-master sempre passam. */
async function assertSubPerm(ctx: any, subKey: string, label: string) {
  if (ctx.isMaster || ctx.isEmpresaMaster) return
  const perm = await prisma.userPermission.findFirst({
    where: { userId: ctx.userId, moduleSlug: MODULE },
    select: { subPermissions: true },
  })
  const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
  if (subs[subKey] !== true) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Sem permissão para: ${label}` })
  }
}

export function createCertificadoDigitalRouter(
  certService: CertificadoDigitalService,
  authService: AuthService,
  legacyImportService: LegacyImportCertService,
  bulkImportService: BulkImportCertService,
) {
  return router({

    list: readProcedure(MODULE)
      .input(z.object({
        clienteId: z.string().optional(),
        status: z.string().optional(),
        incluirArquivados: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => certService.list({
        empresaId: ctx.empresaId,
        clienteId: input?.clienteId,
        status: input?.status,
        incluirArquivados: input?.incluirArquivados,
      })),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => certService.getById(input.id)),

    getStats: readProcedure(MODULE)
      .query(({ ctx }) => certService.getStats(ctx.empresaId)),

    // Cadastro: aceita PFX em base64 + senha. Sistema parseia e valida.
    create: writeProcedure(MODULE)
      .input(z.object({
        pfxBase64: z.string().min(1),
        senha: z.string().min(1),
        clienteId: z.string().nullable().optional(),
        empresaId: z.string().nullable().optional(),
        socioId: z.string().nullable().optional(),
        observacoes: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => certService.create({
        ...input,
        // Se vincular a empresa não veio, usa a do contexto
        empresaId: input.empresaId ?? ctx.empresaId ?? null,
      }, {
        userId: ctx.userId,
        ipAddress: (ctx as any).ipAddress,
        userAgent: (ctx as any).userAgent,
      })),

    update: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        clienteId: z.string().nullable().optional(),
        empresaId: z.string().nullable().optional(),
        socioId: z.string().nullable().optional(),
        observacoes: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => certService.update(input.id, input, { userId: ctx.userId })),

    // Renovação — cria novo certificado vinculado ao antigo (parentId)
    renovar: writeProcedure(MODULE)
      .input(z.object({
        parentId: z.string(),
        pfxBase64: z.string().min(1),
        senha: z.string().min(1),
        observacoes: z.string().nullable().optional(),
        clienteId: z.string().nullable().optional(),
        empresaId: z.string().nullable().optional(),
        socioId: z.string().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => certService.renovar(input, { userId: ctx.userId })),

    // ── Operações sensíveis (requerem reauth) ────────────

    downloadPfx: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), senhaUser: z.string().min(1), motivo: z.string().min(3) }))
      .mutation(async ({ input, ctx }) => {
        await assertSubPerm(ctx, 'download_arquivo', 'Baixar arquivo PFX')
        await assertReauth(authService, ctx.userId!, input.senhaUser)
        const buffer = await certService.downloadPfx(input.id, input.motivo, { userId: ctx.userId })
        return { pfxBase64: buffer.toString('base64') }
      }),

    getSenha: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), senhaUser: z.string().min(1), motivo: z.string().min(3) }))
      .mutation(async ({ input, ctx }) => {
        await assertSubPerm(ctx, 'ver_senha', 'Visualizar senha em claro')
        await assertReauth(authService, ctx.userId!, input.senhaUser)
        const senha = await certService.getSenha(input.id, input.motivo, { userId: ctx.userId })
        return { senha }
      }),

    revogar: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), motivo: z.string().min(3) }))
      .mutation(async ({ input, ctx }) => {
        await assertSubPerm(ctx, 'revogar', 'Revogar certificado')
        return certService.revogar(input.id, input.motivo, { userId: ctx.userId })
      }),

    arquivar: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => certService.arquivar(input.id, { userId: ctx.userId })),

    desarquivar: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => certService.desarquivar(input.id, { userId: ctx.userId })),

    // Exclusão definitiva.
    // - Master/empresa-master: livre, sem reauth nem motivo obrigatório
    // - Outros: bloqueado (master-only)
    excluir: deleteProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        senhaUser: z.string().optional(),
        motivo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master pode excluir definitivamente' })
        }
        return certService.excluir(input.id, input.motivo || 'Excluído por master', { userId: ctx.userId })
      }),

    // Exclusão em massa — apenas master/empresa-master, sem reauth
    excluirEmMassa: deleteProcedure(MODULE)
      .input(z.object({
        ids: z.array(z.string()).min(1).max(1000),
        motivo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master pode excluir em massa' })
        }
        return certService.excluirEmMassa(input.ids, input.motivo || 'Excluído em massa por master', { userId: ctx.userId })
      }),

    // Varredura e exclusão de duplicatas — só master/empresa-master
    excluirDuplicatas: deleteProcedure(MODULE)
      .mutation(async ({ ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master pode varrer duplicatas' })
        }
        // Master global: varre todas as empresas; empresa-master: só a sua
        const empresaId = ctx.isMaster ? undefined : ctx.empresaId
        return certService.excluirDuplicatas(empresaId, { userId: ctx.userId })
      }),

    // Trilha de auditoria — sub-permissão para visão completa
    listAcessos: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        await assertSubPerm(ctx, 'manage_acessos', 'Ver trilha de auditoria')
        return certService.listAcessos(input.id)
      }),

    // Disparo manual da rotina de vencimentos (debug/test).
    // Em produção, o cron diário às 06:00 cuida disso automaticamente.
    notificarVencimentos: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master pode disparar manualmente' })
        }
        return certService.notificarVencimentos()
      }),

    // ── Importação do legado (OneClick V1) ───────────────────
    // Master only. Workflow:
    //   1) legacyImportStartPreview → cria job, retorna jobId, processa em background
    //   2) legacyImportProgress     → polled pra ver logs/progresso em tempo real
    //   3) legacyImportStartImport  → após preview pronto, executa importação

    legacyImportStartPreview: protectedProcedure
      .input(z.object({ empresaId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master' })
        }
        return legacyImportService.startPreview(input.empresaId)
      }),

    legacyImportProgress: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master' })
        }
        const state = legacyImportService.getProgress(input.jobId)
        if (!state) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job não encontrado ou expirado.' })
        return state
      }),

    legacyImportStartImport: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master' })
        }
        return legacyImportService.startImport(input.jobId, ctx.userId)
      }),

    // ── Importação em lote (drop de arquivos PFX) ────────────
    // Workflow:
    //   1) bulkImportStartPreview → recebe arquivos + senha padrão, retorna jobId
    //   2) bulkImportProgress     → polled pra logs/progresso
    //   3) bulkImportStartImport  → após preview, executa importação efetiva

    bulkImportStartPreview: writeProcedure(MODULE)
      .input(z.object({
        empresaId: z.string(),
        senhaPadrao: z.string().optional(),
        files: z.array(z.object({
          nome: z.string().min(1),
          base64: z.string().min(10),
        })).min(1).max(2000),
      }))
      .mutation(({ input }) => bulkImportService.startPreview(input.empresaId, input.files, input.senhaPadrao)),

    bulkImportProgress: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => {
        const state = bulkImportService.getProgress(input.jobId)
        if (!state) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job não encontrado ou expirado.' })
        return state
      }),

    bulkImportStartImport: writeProcedure(MODULE)
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input, ctx }) => bulkImportService.startImport(input.jobId, ctx.userId)),
  })
}
