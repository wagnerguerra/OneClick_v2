import { z } from 'zod'
import { prisma } from '@saas/db'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { CndService } from './cnd.service'
import { CndSchedulerService } from './cnd.scheduler'
import { CndEstadualService } from './cnd-estadual.service'
import { AlvaraBombeirosService } from './alvara-bombeiros.service'
import { CndMunicipalService } from './cnd-municipal.service'
import { CndtTrabalhistaService } from './cndt-trabalhista.service'
import { CrfFgtsService } from './crf-fgts.service'
import { CguCertidaoService } from './cgu-certidao.service'
import { AlvaraFuncionamentoService } from './alvara-funcionamento.service'
import { CompilarCertidoesService } from './compilar-certidoes.service'
import { TRPCError } from '@trpc/server'
import { paginationSchema } from '@saas/types'
import { exigirEmpresa, limparDoc } from './cnd-comum'

const MODULE = 'certidoes-cnd'

/** Toda rota trabalha para a empresa carregada (tenant) — sem ela, recusa. */
const emp = (ctx: { empresaId?: string | null }) => exigirEmpresa(ctx.empresaId)

export function createCndRouter(service: CndService, scheduler: CndSchedulerService, estadualService?: CndEstadualService, alvaraService?: AlvaraBombeirosService, municipalService?: CndMunicipalService, trabalhistaService?: CndtTrabalhistaService, fgtsService?: CrfFgtsService, cguService?: CguCertidaoService, alvaraFuncService?: AlvaraFuncionamentoService, compilarService?: CompilarCertidoesService) {
  return router({
    // ── Compilar e Enviar ────────────────────────────────

    // Renomeado de 'compilar' pra escapar de filtros de AdBlock que pegam
    // "compilar" como palavra suspeita (parecida com "compiler" usado em
    // scripts maliciosos por adblockers agressivos).
    processarLote: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        tipos: z.array(z.enum(['federal', 'estadual', 'municipal', 'trabalhista', 'fgts', 'cgu', 'alvara_bombeiros', 'alvara_funcionamento'])),
        forcarNova: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!compilarService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
        // `compilar` nunca rejeita (try/catch no corpo inteiro): pode rodar solto.
        void compilarService.compilar(emp(ctx), ctx.userId, input.documento, input.tipos, input.forcarNova)
        return { message: 'Processamento iniciado' }
      }),

    compilarProgress: readProcedure(MODULE)
      .query(({ ctx }) => {
        if (!compilarService) return { status: 'idle', items: [], current: 0, total: 0 }
        return compilarService.getProgress(emp(ctx), ctx.userId)
      }),

    compilarRetry: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        tipo: z.enum(['federal', 'estadual', 'municipal', 'trabalhista', 'fgts', 'cgu', 'alvara_bombeiros', 'alvara_funcionamento']),
        itemIndex: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!compilarService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
        void compilarService.reprocessarItem(emp(ctx), ctx.userId, input.documento, input.tipo, input.itemIndex)
        return { message: 'Reprocessamento iniciado' }
      }),

    clienteContatos: readProcedure(MODULE)
      .input(z.object({ documento: z.string() }))
      .query(async ({ input, ctx }) => {
        const doc = limparDoc(input.documento)
        // Isolamento multi-tenant: só contatos de clientes da empresa do tenant
        // (evita vazar contatos de um cliente homônimo/CNPJ igual de outro tenant).
        const rows = await prisma.$queryRawUnsafe<Array<{ email: string; nome: string | null }>>(
          `SELECT cc.email, cc.nome FROM cliente_contatos cc
           JOIN clientes c ON c.id = cc.cliente_id
           WHERE c.status = 'ATIVO' AND cc.email IS NOT NULL AND cc.email != ''
           AND c.empresa_id = $2
           AND UPPER(REGEXP_REPLACE(c.documento, '[^0-9A-Za-z]', '', 'g')) = $1
           ORDER BY cc.principal DESC, cc.nome ASC`, doc, emp(ctx),
        )
        return rows
      }),

    salvarContato: writeProcedure(MODULE)
      .input(z.object({ documento: z.string(), email: z.string().email(), nome: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const doc = limparDoc(input.documento)
        // Só cliente da empresa carregada — antes gravava contato em cliente de outro tenant.
        const cli = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM clientes WHERE status = 'ATIVO' AND empresa_id = $2
             AND UPPER(REGEXP_REPLACE(documento, '[^0-9A-Za-z]', '', 'g')) = $1 LIMIT 1`, doc, emp(ctx),
        )
        if (!cli[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' })
        // Verificar se já existe
        const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM cliente_contatos WHERE cliente_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`, cli[0].id, input.email,
        )
        if (exists[0]) return { ok: true, message: 'Contato já cadastrado' }
        await prisma.$executeRawUnsafe(
          `INSERT INTO cliente_contatos (id, cliente_id, email, nome, principal, created_at, updated_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3, false, NOW(), NOW())`,
          cli[0].id, input.email, input.nome || 'Contato',
        )
        return { ok: true, message: 'Contato salvo com sucesso' }
      }),

    compilarEnviar: writeProcedure(MODULE)
      .input(z.object({ email: z.string().email(), documento: z.string(), razaoSocial: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!compilarService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
        const ok = await compilarService.enviarEmail(emp(ctx), ctx.userId, input.email, input.documento, input.razaoSocial)
        if (!ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar e-mail. Verifique as configurações SMTP.' })
        return { message: `E-mail enviado para ${input.email}` }
      }),

    // ── Certidões consolidadas por cliente ─────────────────
    certidoesCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input, ctx }) => {
        const empresaId = emp(ctx)
        const rows: Array<{ id: string; tipo: string; label: string; situacao: string | null; dataValidade: string | null; dataConsulta: string | null; sucesso: boolean; temPdf: boolean }> = []

        // Federal
        const fed = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cnd WHERE cliente_id = $1 AND empresa_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (fed[0]) rows.push({ id: fed[0].id as string, tipo: 'federal', label: 'CND Federal (PGFN/RFB)', situacao: fed[0].tipo_certidao as string | null, dataValidade: fed[0].data_validade ? (fed[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, dataConsulta: fed[0].created_at ? (fed[0].created_at as Date).toISOString() : null, sucesso: fed[0].sucesso as boolean, temPdf: !!fed[0].tem_pdf })

        // Estadual
        const est = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, sucesso, mensagem, created_at, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cnd_estadual WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (est[0]) rows.push({ id: est[0].id as string, tipo: 'estadual', label: 'CND Estadual (SEFAZ ES)', situacao: est[0].sucesso ? 'Negativa' : (est[0].mensagem as string || 'Não emitida'), dataValidade: null, dataConsulta: est[0].created_at ? (est[0].created_at as Date).toISOString() : null, sucesso: est[0].sucesso as boolean, temPdf: !!est[0].tem_pdf })

        // Municipal
        const mun = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, municipio, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cnd_municipal WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (mun[0]) rows.push({ id: mun[0].id as string, tipo: 'municipal', label: `CND Municipal (${mun[0].municipio || ''})`, situacao: mun[0].tipo_certidao as string | null, dataValidade: mun[0].data_validade ? (mun[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, dataConsulta: mun[0].created_at ? (mun[0].created_at as Date).toISOString() : null, sucesso: mun[0].sucesso as boolean, temPdf: !!mun[0].tem_pdf })

        // Trabalhista
        const trb = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cndt WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (trb[0]) rows.push({ id: trb[0].id as string, tipo: 'trabalhista', label: 'CNDT Trabalhista (TST)', situacao: trb[0].tipo_certidao as string | null, dataValidade: trb[0].data_validade ? (trb[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, dataConsulta: trb[0].created_at ? (trb[0].created_at as Date).toISOString() : null, sucesso: trb[0].sucesso as boolean, temPdf: !!trb[0].tem_pdf })

        // FGTS
        const fgts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_crf_fgts WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (fgts[0]) rows.push({ id: fgts[0].id as string, tipo: 'fgts', label: 'CRF/FGTS (Caixa)', situacao: fgts[0].tipo_certidao as string | null, dataValidade: fgts[0].data_validade ? (fgts[0].data_validade as Date).toISOString().split('T')[0] ?? null : null, dataConsulta: fgts[0].created_at ? (fgts[0].created_at as Date).toISOString() : null, sucesso: fgts[0].sucesso as boolean, temPdf: !!fgts[0].tem_pdf })

        // CGU
        const cgu = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cgu WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (cgu[0]) rows.push({ id: cgu[0].id as string, tipo: 'cgu', label: 'CGU (Certidão Correcional)', situacao: cgu[0].tipo_certidao as string | null, dataValidade: null, dataConsulta: cgu[0].created_at ? (cgu[0].created_at as Date).toISOString() : null, sucesso: cgu[0].sucesso as boolean, temPdf: !!cgu[0].tem_pdf })

        // Alvará Bombeiros
        const alv = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, alvara_id, status, data_fim_validade, created_at, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM alvaras_bombeiros WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (alv[0]) rows.push({ id: alv[0].id as string, tipo: 'alvara_bombeiros', label: 'Alvará Bombeiros (CBMES)', situacao: alv[0].status as string | null, dataValidade: alv[0].data_fim_validade ? String(alv[0].data_fim_validade).slice(0, 10) : null, dataConsulta: alv[0].created_at ? (alv[0].created_at as Date).toISOString() : null, sucesso: (alv[0].status as string) === 'Regular', temPdf: !!alv[0].tem_pdf })

        // Alvará Funcionamento
        const alvFunc = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, sucesso, municipio, mensagem, created_at, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM alvaras_funcionamento WHERE cliente_id = $1 AND empresa_id = $2 ORDER BY created_at DESC LIMIT 1`, input.clienteId, empresaId,
        ).catch(() => [])
        if (alvFunc[0]) rows.push({ id: alvFunc[0].id as string, tipo: 'alvara_func', label: `Alvará Funcionamento (${alvFunc[0].municipio || ''})`, situacao: alvFunc[0].sucesso ? 'Emitido' : (alvFunc[0].mensagem as string || 'Não emitido'), dataValidade: null, dataConsulta: alvFunc[0].created_at ? (alvFunc[0].created_at as Date).toISOString() : null, sucesso: alvFunc[0].sucesso as boolean, temPdf: !!alvFunc[0].tem_pdf })

        return rows
      }),

    certidaoPdf: readProcedure(MODULE)
      .input(z.object({ tipo: z.string(), id: z.string() }))
      .query(async ({ input, ctx }) => {
        const tableMap: Record<string, string> = {
          federal: 'certidoes_cnd', estadual: 'certidoes_cnd_estadual', municipal: 'certidoes_cnd_municipal',
          trabalhista: 'certidoes_cndt', fgts: 'certidoes_crf_fgts', cgu: 'certidoes_cgu',
          alvara_bombeiros: 'alvaras_bombeiros', alvara_func: 'alvaras_funcionamento',
        }
        const table = tableMap[input.tipo]
        if (!table) return { pdfBase64: null }
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          // `table` vem do mapa fixo acima (nunca do usuário); id e empresa por parâmetro.
          `SELECT pdf_base64 FROM ${table} WHERE id = $1 AND empresa_id = $2`, input.id, emp(ctx),
        ).catch(() => [])
        return { pdfBase64: rows[0]?.pdf_base64 || null }
      }),

    // ── Consulta ─────────────────────────────────────────

    consultar: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        tipoDocumento: z.number().int().min(1).max(3).default(1),
        clienteId: z.string().optional(),
        forcarNova: z.boolean().optional(),
      }))
      .mutation(({ input, ctx }) => service.consultar(emp(ctx), input.documento, input.tipoDocumento, {
        clienteId: input.clienteId,
        userId: ctx.userId,
        forcarNova: input.forcarNova,
      })),

    consultarLote: writeProcedure(MODULE)
      .input(z.object({ documentos: z.array(z.string()).min(1).max(500), forcarNova: z.boolean().optional() }))
      // Roda em segundo plano (antes prendia a requisição por horas); progresso em `progressoLote`.
      .mutation(({ input, ctx }) => service.consultarLote(emp(ctx), input.documentos, ctx.userId, input.forcarNova ?? false)),

    progressoLote: readProcedure(MODULE)
      .query(({ ctx }) => service.progressoLote(emp(ctx))),

    verificarCache: readProcedure(MODULE)
      .input(z.object({ documento: z.string().min(11) }))
      .query(({ input, ctx }) => service.verificarCache(emp(ctx), input.documento)),

    totalizadores: readProcedure(MODULE)
      .query(({ ctx }) => service.totalizadores(emp(ctx))),

    // ── Listagem ─────────────────────────────────────────

    list: readProcedure(MODULE)
      .input(paginationSchema.extend({
        clienteId: z.string().optional(),
        tipoCertidao: z.string().optional(),
        lixeira: z.boolean().optional(),
      }))
      .query(({ input, ctx }) => service.list(emp(ctx), input)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(emp(ctx), input.id)),

    getPdf: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getPdf(emp(ctx), input.id)),

    // ── Exclusao ─────────────────────────────────────────

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.softDelete(emp(ctx), input.id)),

    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.restore(emp(ctx), input.id)),

    hardDelete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.hardDelete(emp(ctx), input.id)),

    // ── Logs de execucao ──────────────────────────────────

    execLogs: readProcedure(MODULE)
      .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().min(0).default(0) }).optional())
      .query(({ input, ctx }) => service.listarExecLogs(emp(ctx), input?.limit ?? 20, input?.offset ?? 0)),

    // ── Clientes mensais ─────────────────────────────────

    clientesMensais: readProcedure(MODULE)
      .query(({ ctx }) => service.listarClientesMensais(emp(ctx))),

    // ── Agendamento ──────────────────────────────────────

    schedule: router({
      get: readProcedure(MODULE)
        .query(({ ctx }) => scheduler.getStatus(ctx.empresaId ?? '')),

      update: writeProcedure(MODULE)
        .input(z.object({
          enabled: z.boolean(),
          cron: z.string().min(1),
          delayMs: z.number().min(1000).max(60000).optional(),
          clienteIds: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode alterar agendamentos' })
          return scheduler.updateConfig(ctx.empresaId ?? '', input)
        }),

      runNow: writeProcedure(MODULE)
        .mutation(async ({ ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode executar manualmente' })
          return scheduler.runNow(ctx.userId, ctx.empresaId ?? '')
        }),

      progress: readProcedure(MODULE)
        .query(({ ctx }) => scheduler.getProgress(ctx.empresaId ?? '')),

      clientes: readProcedure(MODULE)
        .query(({ ctx }) => scheduler.listarClientesDisponiveis(ctx.empresaId ?? '')),
    }),

    // #HLP0209 — inativar cliente pelo CND foi REMOVIDO (não mexe mais no cadastro).
    // Cliente inativado em /clientes já sai dos filtros de monitoramento.

    // ── CND Estadual (SEFAZ ES) ───────────────────────────
    estadual: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.consultar(emp(ctx), input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
          forcarNova: z.boolean().optional(),
        }))
        .mutation(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.consultarLote(emp(ctx), input.documentos, ctx.userId, input.forcarNova ?? false)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(20), search: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.list(emp(ctx), input)
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.getPdf(emp(ctx), input.id)
        }),

      totalizadores: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!estadualService) return { total: 0, emitidas: 0, naoEmitidas: 0 }
          return estadualService.totalizadores(emp(ctx))
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!estadualService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return estadualService.getLoteProgress(emp(ctx))
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Estadual não disponível' })
          return estadualService.deleteEstadual(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Estadual não disponível' })
          return estadualService.deleteLote(emp(ctx), input.ids)
        }),
    }),

    // ── Alvará Corpo de Bombeiros (SIAT/CBMES) ────────────
    alvara: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ razaoSocial: z.string().min(3), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de Alvará não disponível' })
          return alvaraService.consultar(emp(ctx), input.razaoSocial, input.clienteId, ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(20), search: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!alvaraService) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }
          return alvaraService.list(emp(ctx), input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!alvaraService) return { total: 0, regulares: 0, irregulares: 0 }
          return alvaraService.totalizadores(emp(ctx))
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          clientes: z.array(z.object({ razaoSocial: z.string(), clienteId: z.string().optional() })),
        }))
        .mutation(({ input, ctx }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraService.consultarLote(emp(ctx), input.clientes, ctx.userId)
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!alvaraService) return { status: 'idle', total: 0, current: 0, encontrados: 0, naoEncontrados: 0, erros: 0, currentCliente: '', items: [] }
          return alvaraService.getLoteProgress(emp(ctx))
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ alvaraId: z.number() }))
        .query(({ input, ctx }) => {
          if (!alvaraService) return { pdfBase64: null }
          return alvaraService.getPdf(emp(ctx), input.alvaraId)
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Alvará não disponível' })
          return alvaraService.deleteAlvara(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Alvará não disponível' })
          return alvaraService.deleteLote(emp(ctx), input.ids)
        }),
    }),

    // ── CND Municipal ─────────────────────────────────
    municipal: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), municipio: z.string().default('Vitória'), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          const mun = input.municipio.toUpperCase()
          if (mun === 'VITÓRIA' || mun === 'VITORIA') return municipalService.consultarVitoria(emp(ctx), input.documento, input.clienteId, ctx.userId)
          if (mun === 'VILA VELHA') return municipalService.consultarVilaVelha(emp(ctx), input.documento, input.clienteId, ctx.userId)
          if (mun === 'SERRA') return municipalService.consultarSerra(emp(ctx), input.documento, input.clienteId, ctx.userId)
          if (mun === 'CARIACICA') return municipalService.consultarCariacica(emp(ctx), input.documento, input.clienteId, ctx.userId)
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Município "${input.municipio}" ainda não suportado` })
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({ municipio: z.string().default('Vitória') }))
        .mutation(async ({ input, ctx }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          const clientes = await municipalService.listarClientesMunicipio(emp(ctx), input.municipio)
          if (clientes.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: `Nenhum cliente mensal encontrado no município de ${input.municipio}` })
          return municipalService.consultarLoteMunicipio(emp(ctx), 
            input.municipio,
            clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })),
            ctx.userId,
          )
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(20), search: z.string().optional(), municipio: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!municipalService) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }
          return municipalService.list(emp(ctx), input)
        }),

      totalizadores: readProcedure(MODULE)
        .input(z.object({ municipio: z.string().optional() }).optional())
        .query(({ input, ctx }) => {
          if (!municipalService) return { total: 0, negativas: 0, positivas: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 }
          return municipalService.totalizadores(emp(ctx), input?.municipio)
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!municipalService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return municipalService.getLoteProgress(emp(ctx))
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!municipalService) return { etapa: '' }
          return { etapa: municipalService.getConsultaEtapa(emp(ctx)) }
        }),

      validadeDashboard: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!municipalService) return []
          return municipalService.listarValidadeDashboard(emp(ctx))
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          return municipalService.deleteMunicipal(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          return municipalService.deleteMunicipalLote(emp(ctx), input.ids)
        }),

      clientesMunicipio: readProcedure(MODULE)
        .input(z.object({ municipio: z.string() }))
        .query(({ input, ctx }) => {
          if (!municipalService) return []
          return municipalService.listarClientesMunicipio(emp(ctx), input.municipio)
        }),

      getDetalhes: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
          const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            `SELECT debitos, pdf_base64 FROM certidoes_cnd_municipal WHERE id = $1 AND empresa_id = $2`, input.id, emp(ctx),
          )
          if (!rows.length) return { debitos: [], pdfBase64: null }
          return {
            debitos: rows[0]!.debitos ? (typeof rows[0]!.debitos === 'string' ? JSON.parse(rows[0]!.debitos as string) : rows[0]!.debitos) : [],
            pdfBase64: rows[0]!.pdf_base64 as string | null,
          }
        }),
    }),

    // ── CNDT Trabalhista (TST) ────────────────────────────
    trabalhista: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.consultar(emp(ctx), input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
          forcarNova: z.boolean().optional(),
        }))
        .mutation(({ input, ctx }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.consultarLote(emp(ctx), input.documentos, ctx.userId, input.forcarNova ?? false)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!trabalhistaService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return trabalhistaService.list(emp(ctx), input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!trabalhistaService) return { total: 0, negativas: 0, positivas: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 }
          return trabalhistaService.totalizadores(emp(ctx))
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input, ctx }) => {
          if (!trabalhistaService) return { pdfBase64: null }
          return trabalhistaService.getPdf(emp(ctx), input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!trabalhistaService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return trabalhistaService.getLoteProgress(emp(ctx))
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!trabalhistaService) return { etapa: '' }
          return { etapa: trabalhistaService.getConsultaEtapa(emp(ctx)) }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.deleteCndt(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.deleteLote(emp(ctx), input.ids)
        }),
    }),

    // ── CRF/FGTS (Caixa) ─────────────────────────────────
    fgts: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.consultar(emp(ctx), input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
          forcarNova: z.boolean().optional(),
        }))
        .mutation(({ input, ctx }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.consultarLote(emp(ctx), input.documentos, ctx.userId, input.forcarNova ?? false)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!fgtsService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return fgtsService.list(emp(ctx), input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!fgtsService) return { total: 0, regulares: 0, irregulares: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 }
          return fgtsService.totalizadores(emp(ctx))
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input, ctx }) => {
          if (!fgtsService) return { pdfBase64: null }
          return fgtsService.getPdf(emp(ctx), input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!fgtsService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return fgtsService.getLoteProgress(emp(ctx))
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!fgtsService) return { etapa: '' }
          return { etapa: fgtsService.getConsultaEtapa(emp(ctx)) }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.deleteCrf(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.deleteLote(emp(ctx), input.ids)
        }),
    }),

    // ── CGU (Certidão Negativa Correcional) ───────────────
    cgu: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.consultar(emp(ctx), input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
          forcarNova: z.boolean().optional(),
        }))
        .mutation(({ input, ctx }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.consultarLote(emp(ctx), input.documentos, ctx.userId, input.forcarNova ?? false)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!cguService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return cguService.list(emp(ctx), input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!cguService) return { total: 0, nadaConsta: 0, consta: 0, naoEmitidas: 0 }
          return cguService.totalizadores(emp(ctx))
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input, ctx }) => {
          if (!cguService) return { pdfBase64: null }
          return cguService.getPdf(emp(ctx), input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!cguService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return cguService.getLoteProgress(emp(ctx))
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!cguService) return { etapa: '' }
          return { etapa: cguService.getConsultaEtapa(emp(ctx)) }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.deleteCgu(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.deleteLote(emp(ctx), input.ids)
        }),
    }),

    // ── Alvará de Funcionamento (Prefeituras) ─────────────
    alvaraFunc: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), municipio: z.string(), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraFuncService.consultar(emp(ctx), input.documento, input.municipio, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({ municipio: z.string() }))
        .mutation(async ({ input, ctx }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          const clientes = await alvaraFuncService.listarClientesMunicipio(emp(ctx), input.municipio)
          if (clientes.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: `Nenhum cliente mensal em ${input.municipio}` })
          return alvaraFuncService.consultarLote(emp(ctx), input.municipio, clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })), ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), municipio: z.string().optional() }))
        .query(({ input, ctx }) => {
          if (!alvaraFuncService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return alvaraFuncService.list(emp(ctx), input)
        }),

      totalizadores: readProcedure(MODULE)
        .input(z.object({ municipio: z.string().optional() }).optional())
        .query(({ input, ctx }) => {
          if (!alvaraFuncService) return { total: 0, emitidos: 0, naoEmitidos: 0 }
          return alvaraFuncService.totalizadores(emp(ctx), input?.municipio)
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input, ctx }) => {
          if (!alvaraFuncService) return { pdfBase64: null }
          return alvaraFuncService.getPdf(emp(ctx), input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!alvaraFuncService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return alvaraFuncService.getLoteProgress(emp(ctx))
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(({ ctx }) => {
          if (!alvaraFuncService) return { etapa: '' }
          return { etapa: alvaraFuncService.getConsultaEtapa(emp(ctx)) }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input, ctx }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraFuncService.deleteAlvara(emp(ctx), input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input, ctx }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraFuncService.deleteLote(emp(ctx), input.ids)
        }),
    }),
  })
}
