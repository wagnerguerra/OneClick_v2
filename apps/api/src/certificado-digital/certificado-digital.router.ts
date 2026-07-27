import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure, protectedProcedure, scopedEmpresaId, scopedEmpresaIdOpt } from '../trpc/trpc.service'
import { CertificadoDigitalService } from './certificado-digital.service'
import { LegacyImportCertService } from './legacy-import-cert.service'
import { BulkImportCertService } from './bulk-import-cert.service'
import { AuthService } from '../auth/auth.service'
import type { ContratoSyncService } from '../cliente/contrato-sync.service'

const MODULE = 'gestao-certificados'

/**
 * Autoriza exclusão de certificados: master/empresa-master OU usuário com a
 * sub-permissão `delete_certificados` em gestao-certificados. Joga FORBIDDEN
 * em caso contrário (mensagem consistente entre os 3 endpoints de exclusão).
 */
async function ensurePodeExcluirCertificados(ctx: {
  userId: string | null
  isMaster?: boolean
  isEmpresaMaster?: boolean
}, label: string) {
  if (ctx.isMaster || ctx.isEmpresaMaster) return
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  const perm = await prisma.userPermission.findUnique({
    where: { userId_moduleSlug: { userId: ctx.userId, moduleSlug: MODULE } },
    select: { subPermissions: true },
  })
  const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
  if (subs.delete_certificados === true) return
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Sem permissão para ${label}. Requer "Excluir certificados" ou conta master.`,
  })
}

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

/**
 * Lê a flag de reautenticação obrigatória do tenant (#HLP0301). Default true
 * (mais seguro) quando não há empresa ou registro.
 */
async function isReautObrigatoria(empresaId: string | null | undefined): Promise<boolean> {
  if (!empresaId) return true
  const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { certReautObrigatoria: true } })
  return emp?.certReautObrigatoria ?? true
}

/**
 * Gate unificado de acesso sensível ao certificado (ver senha / baixar PFX):
 * se o tenant DONO do certificado exige reautenticação, valida senha do usuário
 * + justificativa; senão, libera. Retorna o motivo a registrar na auditoria —
 * que é gravada de qualquer forma pelo service, independente desta flag.
 * Usar o empresaId do PRÓPRIO certificado cobre o master cross-tenant.
 */
async function gateAcessoCert(
  authService: AuthService,
  ctx: { userId: string | null },
  certEmpresaId: string | null | undefined,
  senhaUser: string | undefined,
  motivo: string | undefined,
): Promise<string> {
  const exige = await isReautObrigatoria(certEmpresaId)
  if (!exige) return (motivo && motivo.trim()) || 'Liberado sem reautenticação do usuário (desativada nas configurações)'
  if (!senhaUser) throw new TRPCError({ code: 'FORBIDDEN', message: 'Confirme sua senha para continuar.' })
  if (!motivo || motivo.trim().length < 3) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe a justificativa (mínimo 3 caracteres).' })
  }
  await assertReauth(authService, ctx.userId!, senhaUser)
  return motivo.trim()
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
  contratoSyncService: ContratoSyncService,
) {
  return router({

    list: readProcedure(MODULE)
      .input(z.object({
        clienteId: z.string().optional(),
        status: z.string().optional(),
        incluirArquivados: z.boolean().optional(),
        apenasArquivados: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => certService.list({
        empresaId: ctx.empresaId,
        clienteId: input?.clienteId,
        status: input?.status,
        incluirArquivados: input?.incluirArquivados,
        apenasArquivados: input?.apenasArquivados,
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
        // empresaId validado contra a sessão (F-012): não-master não pode
        // vincular cert a empresa de outro tenant; sem empresa usa a do contexto.
        empresaId: scopedEmpresaIdOpt(ctx, input.empresaId),
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

    // ── Config do tenant: reautenticação obrigatória (#HLP0301) ──
    // Gate de senha+justificativa vira flag por tenant. Auditoria NÃO depende
    // dela (ver senha / baixar PFX sempre registram na trilha).
    getReautConfig: readProcedure(MODULE)
      .query(async ({ ctx }) => ({ reautObrigatoria: await isReautObrigatoria(ctx.empresaId) })),

    setReautConfig: writeProcedure(MODULE)
      .input(z.object({ reautObrigatoria: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await assertSubPerm(ctx, 'gerenciar_config', 'Gerenciar configurações de segurança')
        if (!ctx.empresaId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sem empresa no contexto.' })
        await prisma.empresa.update({ where: { id: ctx.empresaId }, data: { certReautObrigatoria: input.reautObrigatoria } })
        return { ok: true }
      }),

    // Acesso unificado ao certificado (arquivo + senha) — #HLP0301. O pessoal
    // sempre usa os dois juntos, então UM evento cobre o acesso. Quando o tenant
    // exige reautenticação, valida senha+justificativa aqui (e bloqueia se
    // incorreta); quando NÃO exige, libera e apenas registra. Dispara SEMPRE,
    // com ou sem confirmação de senha. Substitui o antigo validarSenha e os
    // eventos separados de ver senha / baixar PFX.
    acessar: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), senhaUser: z.string().optional(), motivo: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const cert = await prisma.certificadoDigital.findUnique({ where: { id: input.id }, select: { empresaId: true } })
        const motivo = await gateAcessoCert(authService, ctx, cert?.empresaId ?? ctx.empresaId, input.senhaUser, input.motivo)
        await certService.registrarAcessoArquivoSenha(input.id, motivo, {
          userId: ctx.userId,
          ipAddress: (ctx as any).ipAddress,
          userAgent: (ctx as any).userAgent,
        })
        return { ok: true }
      }),

    // ── Operações sensíveis: gate por tenant (ver senha / baixar PFX) ────
    // Fluxo unificado (#HLP0301): arquivo PFX e senha são sempre acessados
    // juntos, então uma única sub-permissão ('acessar_certificados') cobre os
    // dois. A mesma senha+justificativa (reauth) libera ver e baixar; quando a
    // flag do tenant está desligada, senhaUser/motivo são opcionais e o acesso é
    // liberado — mas SEMPRE auditado (no service).
    //
    // origem='cliente': acesso pelo cadastro do cliente NÃO exige a sub-permissão
    // (o vínculo com o cliente já autoriza). Pela gestão, exige.

    downloadPfx: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), senhaUser: z.string().optional(), motivo: z.string().optional(), origem: z.enum(['gestao', 'cliente']).optional() }))
      .mutation(async ({ input, ctx }) => {
        if (input.origem !== 'cliente') await assertSubPerm(ctx, 'acessar_certificados', 'Acessar certificados (arquivos PFX e senhas)')
        const cert = await prisma.certificadoDigital.findUnique({ where: { id: input.id }, select: { empresaId: true } })
        const motivo = await gateAcessoCert(authService, ctx, cert?.empresaId ?? ctx.empresaId, input.senhaUser, input.motivo)
        const buffer = await certService.downloadPfx(input.id, motivo, { userId: ctx.userId })
        return { pfxBase64: buffer.toString('base64') }
      }),

    getSenha: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), senhaUser: z.string().optional(), motivo: z.string().optional(), origem: z.enum(['gestao', 'cliente']).optional() }))
      .mutation(async ({ input, ctx }) => {
        if (input.origem !== 'cliente') await assertSubPerm(ctx, 'acessar_certificados', 'Acessar certificados (arquivos PFX e senhas)')
        const cert = await prisma.certificadoDigital.findUnique({ where: { id: input.id }, select: { empresaId: true } })
        const motivo = await gateAcessoCert(authService, ctx, cert?.empresaId ?? ctx.empresaId, input.senhaUser, input.motivo)
        const senha = await certService.getSenha(input.id, motivo, { userId: ctx.userId })
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
        await ensurePodeExcluirCertificados(ctx, 'excluir certificado')
        const quem = ctx.isMaster || ctx.isEmpresaMaster ? 'master' : 'usuário com permissão'
        return certService.excluir(input.id, input.motivo || `Excluído por ${quem}`, { userId: ctx.userId })
      }),

    // Exclusão em massa — master OU sub-perm `delete_certificados`
    excluirEmMassa: deleteProcedure(MODULE)
      .input(z.object({
        ids: z.array(z.string()).min(1).max(1000),
        motivo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await ensurePodeExcluirCertificados(ctx, 'excluir em massa')
        const quem = ctx.isMaster || ctx.isEmpresaMaster ? 'master' : 'usuário com permissão'
        return certService.excluirEmMassa(input.ids, input.motivo || `Excluído em massa por ${quem}`, { userId: ctx.userId })
      }),

    // Varredura e exclusão de duplicatas — master OU sub-perm `delete_certificados`
    excluirDuplicatas: deleteProcedure(MODULE)
      .mutation(async ({ ctx }) => {
        await ensurePodeExcluirCertificados(ctx, 'varrer duplicatas')
        // Master global: varre todas as empresas; demais (empresa-master ou sub-perm): só a sua
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
        return legacyImportService.startPreview(scopedEmpresaId(ctx, input.empresaId))
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

    // Backfill: atualiza as observações dos certificados JÁ importados com a
    // descrição/nome do arquivo do legado (pros que vieram antes deste ajuste).
    legacyImportBackfillObservacoes: protectedProcedure
      .input(z.object({ empresaId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!(ctx.isMaster || ctx.isEmpresaMaster)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master/empresa-master' })
        }
        return legacyImportService.backfillObservacoes(scopedEmpresaId(ctx, input.empresaId), contratoSyncService)
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
      .mutation(({ input, ctx }) => bulkImportService.startPreview(scopedEmpresaId(ctx, input.empresaId), input.files, input.senhaPadrao)),

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
