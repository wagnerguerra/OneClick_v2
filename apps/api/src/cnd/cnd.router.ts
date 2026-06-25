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

const MODULE = 'certidoes-cnd'

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
        compilarService.compilar(input.documento, input.tipos, input.forcarNova, ctx.userId)
        return { message: 'Processamento iniciado' }
      }),

    compilarProgress: readProcedure(MODULE)
      .query(() => {
        if (!compilarService) return { status: 'idle', items: [], current: 0, total: 0 }
        return compilarService.getProgress()
      }),

    compilarRetry: writeProcedure(MODULE)
      .input(z.object({
        documento: z.string().min(11),
        tipo: z.enum(['federal', 'estadual', 'municipal', 'trabalhista', 'fgts', 'cgu', 'alvara_bombeiros', 'alvara_funcionamento']),
        itemIndex: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!compilarService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
        compilarService.reprocessarItem(input.documento, input.tipo, input.itemIndex, ctx.userId)
        return { message: 'Reprocessamento iniciado' }
      }),

    clienteContatos: readProcedure(MODULE)
      .input(z.object({ documento: z.string() }))
      .query(async ({ input, ctx }) => {
        const doc = input.documento.replace(/\D/g, '')
        // Isolamento multi-tenant: só contatos de clientes da empresa do tenant
        // (evita vazar contatos de um cliente homônimo/CNPJ igual de outro tenant).
        const rows = await prisma.$queryRawUnsafe<Array<{ email: string; nome: string | null }>>(
          `SELECT cc.email, cc.nome FROM cliente_contatos cc
           JOIN clientes c ON c.id = cc.cliente_id
           WHERE c.deleted_at IS NULL AND cc.email IS NOT NULL AND cc.email != ''
           AND c.empresa_id = $2
           AND REPLACE(REPLACE(REPLACE(c.documento, '.', ''), '/', ''), '-', '') = $1
           ORDER BY cc.principal DESC, cc.nome ASC`, doc, ctx.empresaId ?? null,
        )
        return rows
      }),

    salvarContato: writeProcedure(MODULE)
      .input(z.object({ documento: z.string(), email: z.string().email(), nome: z.string().optional() }))
      .mutation(async ({ input }) => {
        const doc = input.documento.replace(/\D/g, '')
        const cli = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
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
      .mutation(async ({ input }) => {
        if (!compilarService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
        const ok = await compilarService.enviarEmail(input.email, input.documento, input.razaoSocial)
        if (!ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar e-mail. Verifique as configurações SMTP.' })
        return { message: `E-mail enviado para ${input.email}` }
      }),

    // ── Certidões consolidadas por cliente ─────────────────
    certidoesCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(async ({ input }) => {
        const rows: Array<{ id: string; tipo: string; label: string; situacao: string | null; dataValidade: string | null; dataConsulta: string | null; sucesso: boolean; temPdf: boolean }> = []

        // Federal
        const fed = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cnd WHERE cliente_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (fed[0]) rows.push({ id: fed[0].id as string, tipo: 'federal', label: 'CND Federal (PGFN/RFB)', situacao: fed[0].tipo_certidao as string | null, dataValidade: fed[0].data_validade ? (fed[0].data_validade as Date).toISOString().split('T')[0] : null, dataConsulta: fed[0].created_at ? (fed[0].created_at as Date).toISOString() : null, sucesso: fed[0].sucesso as boolean, temPdf: !!fed[0].tem_pdf })

        // Estadual
        const est = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, sucesso, mensagem, created_at, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cnd_estadual WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (est[0]) rows.push({ id: est[0].id as string, tipo: 'estadual', label: 'CND Estadual (SEFAZ ES)', situacao: est[0].sucesso ? 'Negativa' : (est[0].mensagem as string || 'Não emitida'), dataValidade: null, dataConsulta: est[0].created_at ? (est[0].created_at as Date).toISOString() : null, sucesso: est[0].sucesso as boolean, temPdf: !!est[0].tem_pdf })

        // Municipal
        const mun = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, municipio, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cnd_municipal WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (mun[0]) rows.push({ id: mun[0].id as string, tipo: 'municipal', label: `CND Municipal (${mun[0].municipio || ''})`, situacao: mun[0].tipo_certidao as string | null, dataValidade: mun[0].data_validade ? (mun[0].data_validade as Date).toISOString().split('T')[0] : null, dataConsulta: mun[0].created_at ? (mun[0].created_at as Date).toISOString() : null, sucesso: mun[0].sucesso as boolean, temPdf: !!mun[0].tem_pdf })

        // Trabalhista
        const trb = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cndt WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (trb[0]) rows.push({ id: trb[0].id as string, tipo: 'trabalhista', label: 'CNDT Trabalhista (TST)', situacao: trb[0].tipo_certidao as string | null, dataValidade: trb[0].data_validade ? (trb[0].data_validade as Date).toISOString().split('T')[0] : null, dataConsulta: trb[0].created_at ? (trb[0].created_at as Date).toISOString() : null, sucesso: trb[0].sucesso as boolean, temPdf: !!trb[0].tem_pdf })

        // FGTS
        const fgts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, data_validade, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_crf_fgts WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (fgts[0]) rows.push({ id: fgts[0].id as string, tipo: 'fgts', label: 'CRF/FGTS (Caixa)', situacao: fgts[0].tipo_certidao as string | null, dataValidade: fgts[0].data_validade ? (fgts[0].data_validade as Date).toISOString().split('T')[0] : null, dataConsulta: fgts[0].created_at ? (fgts[0].created_at as Date).toISOString() : null, sucesso: fgts[0].sucesso as boolean, temPdf: !!fgts[0].tem_pdf })

        // CGU
        const cgu = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, tipo_certidao, created_at, sucesso, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM certidoes_cgu WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (cgu[0]) rows.push({ id: cgu[0].id as string, tipo: 'cgu', label: 'CGU (Certidão Correcional)', situacao: cgu[0].tipo_certidao as string | null, dataValidade: null, dataConsulta: cgu[0].created_at ? (cgu[0].created_at as Date).toISOString() : null, sucesso: cgu[0].sucesso as boolean, temPdf: !!cgu[0].tem_pdf })

        // Alvará Bombeiros
        const alv = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, alvara_id, status, data_fim_validade, created_at, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM alvaras_bombeiros WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (alv[0]) rows.push({ id: alv[0].id as string, tipo: 'alvara_bombeiros', label: 'Alvará Bombeiros (CBMES)', situacao: alv[0].status as string | null, dataValidade: alv[0].data_fim_validade ? String(alv[0].data_fim_validade).slice(0, 10) : null, dataConsulta: alv[0].created_at ? (alv[0].created_at as Date).toISOString() : null, sucesso: (alv[0].status as string) === 'Regular', temPdf: !!alv[0].tem_pdf })

        // Alvará Funcionamento
        const alvFunc = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, sucesso, municipio, mensagem, created_at, (pdf_base64 IS NOT NULL AND pdf_base64 != '') as tem_pdf FROM alvaras_funcionamento WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 1`, input.clienteId,
        ).catch(() => [])
        if (alvFunc[0]) rows.push({ id: alvFunc[0].id as string, tipo: 'alvara_func', label: `Alvará Funcionamento (${alvFunc[0].municipio || ''})`, situacao: alvFunc[0].sucesso ? 'Emitido' : (alvFunc[0].mensagem as string || 'Não emitido'), dataValidade: null, dataConsulta: alvFunc[0].created_at ? (alvFunc[0].created_at as Date).toISOString() : null, sucesso: alvFunc[0].sucesso as boolean, temPdf: !!alvFunc[0].tem_pdf })

        return rows
      }),

    certidaoPdf: readProcedure(MODULE)
      .input(z.object({ tipo: z.string(), id: z.string() }))
      .query(async ({ input }) => {
        const tableMap: Record<string, string> = {
          federal: 'certidoes_cnd', estadual: 'certidoes_cnd_estadual', municipal: 'certidoes_cnd_municipal',
          trabalhista: 'certidoes_cndt', fgts: 'certidoes_crf_fgts', cgu: 'certidoes_cgu',
          alvara_bombeiros: 'alvaras_bombeiros', alvara_func: 'alvaras_funcionamento',
        }
        const table = tableMap[input.tipo]
        if (!table) return { pdfBase64: null }
        const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
          `SELECT pdf_base64 FROM ${table} WHERE id = $1`, input.id,
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
      .mutation(({ input, ctx }) => service.consultar(input.documento, input.tipoDocumento, {
        clienteId: input.clienteId,
        empresaId: ctx.empresaId ?? undefined,
        userId: ctx.userId,
        forcarNova: input.forcarNova,
      })),

    consultarLote: writeProcedure(MODULE)
      .input(z.object({ documentos: z.array(z.string()).min(1).max(500) }))
      .mutation(({ input, ctx }) => service.consultarLote(input.documentos, ctx.empresaId ?? null, ctx.userId)),

    verificarCache: readProcedure(MODULE)
      .input(z.object({ documento: z.string().min(11) }))
      .query(({ input }) => service.verificarCache(input.documento)),

    totalizadores: readProcedure(MODULE)
      .query(({ ctx }) => service.totalizadores(ctx.empresaId ?? null)),

    // ── Listagem ─────────────────────────────────────────

    list: readProcedure(MODULE)
      .input(paginationSchema.extend({
        clienteId: z.string().optional(),
        tipoCertidao: z.string().optional(),
        lixeira: z.boolean().optional(),
      }))
      .query(({ input }) => service.list(input)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getById(input.id)),

    getPdf: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getPdf(input.id)),

    // ── Exclusao ─────────────────────────────────────────

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.softDelete(input.id)),

    restore: writeProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.restore(input.id)),

    hardDelete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.hardDelete(input.id)),

    // ── Logs de execucao ──────────────────────────────────

    execLogs: readProcedure(MODULE)
      .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().min(0).default(0) }).optional())
      .query(({ input }) => service.listarExecLogs(input?.limit ?? 20, input?.offset ?? 0)),

    // ── Clientes mensais ─────────────────────────────────

    clientesMensais: readProcedure(MODULE)
      .query(() => service.listarClientesMensais()),

    // ── Agendamento ──────────────────────────────────────

    schedule: router({
      get: readProcedure(MODULE)
        .query(() => scheduler.getStatus()),

      update: writeProcedure(MODULE)
        .input(z.object({
          enabled: z.boolean(),
          cron: z.string().min(1),
          delayMs: z.number().min(1000).max(60000).optional(),
          clienteIds: z.array(z.string()).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode alterar agendamentos' })
          return scheduler.updateConfig(input)
        }),

      runNow: writeProcedure(MODULE)
        .mutation(async ({ ctx }) => {
          if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas perfil MASTER pode executar manualmente' })
          return scheduler.runNow(ctx.userId)
        }),

      progress: readProcedure(MODULE)
        .query(() => scheduler.getProgress()),

      clientes: readProcedure(MODULE)
        .query(() => scheduler.listarClientesDisponiveis()),
    }),

    // ── Inativar cliente (compartilhado entre abas) ────────
    inativarCliente: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .mutation(async ({ input }) => {
        const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: input.clienteId } })
        await prisma.cliente.update({ where: { id: input.clienteId }, data: { situacao: 'PARALIZADO' } })
        return { id: input.clienteId, razaoSocial: cliente.razaoSocial }
      }),

    // ── CND Estadual (SEFAZ ES) ───────────────────────────
    estadual: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.consultar(input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
        }))
        .mutation(({ input, ctx }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.consultarLote(input.documentos, ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(20), search: z.string().optional() }))
        .query(({ input }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.list(input)
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de CND Estadual não disponível' })
          return estadualService.getPdf(input.id)
        }),

      totalizadores: readProcedure(MODULE)
        .query(() => {
          if (!estadualService) return { total: 0, emitidas: 0, naoEmitidas: 0 }
          return estadualService.totalizadores()
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!estadualService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return estadualService.getLoteProgress()
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Estadual não disponível' })
          return estadualService.deleteEstadual(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!estadualService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Estadual não disponível' })
          return estadualService.deleteLote(input.ids)
        }),
    }),

    // ── Alvará Corpo de Bombeiros (SIAT/CBMES) ────────────
    alvara: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ razaoSocial: z.string().min(3), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço de Alvará não disponível' })
          return alvaraService.consultar(input.razaoSocial, input.clienteId, ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(20), search: z.string().optional() }))
        .query(({ input }) => {
          if (!alvaraService) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }
          return alvaraService.list(input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(() => {
          if (!alvaraService) return { total: 0, regulares: 0, irregulares: 0 }
          return alvaraService.totalizadores()
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          clientes: z.array(z.object({ razaoSocial: z.string(), clienteId: z.string().optional() })),
        }))
        .mutation(({ input, ctx }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraService.consultarLote(input.clientes, ctx.userId)
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!alvaraService) return { status: 'idle', total: 0, current: 0, encontrados: 0, naoEncontrados: 0, erros: 0, currentCliente: '', items: [] }
          return alvaraService.getLoteProgress()
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ alvaraId: z.number() }))
        .query(({ input }) => {
          if (!alvaraService) return { pdfBase64: null }
          return alvaraService.getPdf(input.alvaraId)
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Alvará não disponível' })
          return alvaraService.deleteAlvara(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!alvaraService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Alvará não disponível' })
          return alvaraService.deleteLote(input.ids)
        }),
    }),

    // ── CND Municipal ─────────────────────────────────
    municipal: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), municipio: z.string().default('Vitória'), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          const mun = input.municipio.toUpperCase()
          if (mun === 'VITÓRIA' || mun === 'VITORIA') return municipalService.consultarVitoria(input.documento, input.clienteId, ctx.userId)
          if (mun === 'VILA VELHA') return municipalService.consultarVilaVelha(input.documento, input.clienteId, ctx.userId)
          if (mun === 'SERRA') return municipalService.consultarSerra(input.documento, input.clienteId, ctx.userId)
          if (mun === 'CARIACICA') return municipalService.consultarCariacica(input.documento, input.clienteId, ctx.userId)
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Município "${input.municipio}" ainda não suportado` })
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({ municipio: z.string().default('Vitória') }))
        .mutation(async ({ input, ctx }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          const clientes = await municipalService.listarClientesMunicipio(input.municipio)
          if (clientes.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: `Nenhum cliente mensal encontrado no município de ${input.municipio}` })
          return municipalService.consultarLoteMunicipio(
            input.municipio,
            clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })),
            ctx.userId,
          )
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(20), search: z.string().optional(), municipio: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input }) => {
          if (!municipalService) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }
          return municipalService.list(input)
        }),

      totalizadores: readProcedure(MODULE)
        .input(z.object({ municipio: z.string().optional() }).optional())
        .query(({ input }) => {
          if (!municipalService) return { total: 0, negativas: 0, positivas: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 }
          return municipalService.totalizadores(input?.municipio)
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!municipalService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return municipalService.getLoteProgress()
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(() => {
          if (!municipalService) return { etapa: '' }
          return { etapa: municipalService.getConsultaEtapa() }
        }),

      validadeDashboard: readProcedure(MODULE)
        .query(() => {
          if (!municipalService) return []
          return municipalService.listarValidadeDashboard()
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          return municipalService.deleteMunicipal(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!municipalService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço Municipal não disponível' })
          return municipalService.deleteMunicipalLote(input.ids)
        }),

      clientesMunicipio: readProcedure(MODULE)
        .input(z.object({ municipio: z.string() }))
        .query(({ input }) => {
          if (!municipalService) return []
          return municipalService.listarClientesMunicipio(input.municipio)
        }),

      getDetalhes: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
          const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            `SELECT debitos, pdf_base64 FROM certidoes_cnd_municipal WHERE id = $1`, input.id,
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
          return trabalhistaService.consultar(input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
        }))
        .mutation(({ input, ctx }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.consultarLote(input.documentos, ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input }) => {
          if (!trabalhistaService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return trabalhistaService.list(input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(() => {
          if (!trabalhistaService) return { total: 0, negativas: 0, positivas: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 }
          return trabalhistaService.totalizadores()
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
          if (!trabalhistaService) return { pdfBase64: null }
          return trabalhistaService.getPdf(input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!trabalhistaService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return trabalhistaService.getLoteProgress()
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(() => {
          if (!trabalhistaService) return { etapa: '' }
          return { etapa: trabalhistaService.getConsultaEtapa() }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.deleteCndt(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!trabalhistaService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CNDT não disponível' })
          return trabalhistaService.deleteLote(input.ids)
        }),
    }),

    // ── CRF/FGTS (Caixa) ─────────────────────────────────
    fgts: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.consultar(input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
        }))
        .mutation(({ input, ctx }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.consultarLote(input.documentos, ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input }) => {
          if (!fgtsService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return fgtsService.list(input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(() => {
          if (!fgtsService) return { total: 0, regulares: 0, irregulares: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 }
          return fgtsService.totalizadores()
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
          if (!fgtsService) return { pdfBase64: null }
          return fgtsService.getPdf(input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!fgtsService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return fgtsService.getLoteProgress()
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(() => {
          if (!fgtsService) return { etapa: '' }
          return { etapa: fgtsService.getConsultaEtapa() }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.deleteCrf(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!fgtsService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CRF/FGTS não disponível' })
          return fgtsService.deleteLote(input.ids)
        }),
    }),

    // ── CGU (Certidão Negativa Correcional) ───────────────
    cgu: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.consultar(input.documento, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({
          documentos: z.array(z.object({ documento: z.string(), clienteId: z.string().optional(), razaoSocial: z.string().optional() })),
        }))
        .mutation(({ input, ctx }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.consultarLote(input.documentos, ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), filtroStatus: z.string().optional() }))
        .query(({ input }) => {
          if (!cguService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return cguService.list(input)
        }),

      totalizadores: readProcedure(MODULE)
        .query(() => {
          if (!cguService) return { total: 0, nadaConsta: 0, consta: 0, naoEmitidas: 0 }
          return cguService.totalizadores()
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
          if (!cguService) return { pdfBase64: null }
          return cguService.getPdf(input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!cguService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return cguService.getLoteProgress()
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(() => {
          if (!cguService) return { etapa: '' }
          return { etapa: cguService.getConsultaEtapa() }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.deleteCgu(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!cguService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço CGU não disponível' })
          return cguService.deleteLote(input.ids)
        }),
    }),

    // ── Alvará de Funcionamento (Prefeituras) ─────────────
    alvaraFunc: router({
      consultar: writeProcedure(MODULE)
        .input(z.object({ documento: z.string().min(11), municipio: z.string(), clienteId: z.string().optional() }))
        .mutation(({ input, ctx }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraFuncService.consultar(input.documento, input.municipio, input.clienteId, ctx.userId)
        }),

      consultarLote: writeProcedure(MODULE)
        .input(z.object({ municipio: z.string() }))
        .mutation(async ({ input, ctx }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          const clientes = await alvaraFuncService.listarClientesMunicipio(input.municipio)
          if (clientes.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: `Nenhum cliente mensal em ${input.municipio}` })
          return alvaraFuncService.consultarLote(input.municipio, clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })), ctx.userId)
        }),

      list: readProcedure(MODULE)
        .input(z.object({ page: z.number().default(1), limit: z.number().default(10), search: z.string().optional(), municipio: z.string().optional() }))
        .query(({ input }) => {
          if (!alvaraFuncService) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }
          return alvaraFuncService.list(input)
        }),

      totalizadores: readProcedure(MODULE)
        .input(z.object({ municipio: z.string().optional() }).optional())
        .query(({ input }) => {
          if (!alvaraFuncService) return { total: 0, emitidos: 0, naoEmitidos: 0 }
          return alvaraFuncService.totalizadores(input?.municipio)
        }),

      getPdf: readProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
          if (!alvaraFuncService) return { pdfBase64: null }
          return alvaraFuncService.getPdf(input.id)
        }),

      loteProgress: readProcedure(MODULE)
        .query(() => {
          if (!alvaraFuncService) return { status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, currentCliente: '', items: [] }
          return alvaraFuncService.getLoteProgress()
        }),

      consultaEtapa: readProcedure(MODULE)
        .query(() => {
          if (!alvaraFuncService) return { etapa: '' }
          return { etapa: alvaraFuncService.getConsultaEtapa() }
        }),

      delete: deleteProcedure(MODULE)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraFuncService.deleteAlvara(input.id)
        }),

      deleteLote: deleteProcedure(MODULE)
        .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
        .mutation(({ input }) => {
          if (!alvaraFuncService) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não disponível' })
          return alvaraFuncService.deleteLote(input.ids)
        }),
    }),
  })
}
