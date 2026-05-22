import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { AgendaService } from './agenda.service'
import { AgendaGoogleService } from './agenda-google.service'

const MODULE = 'agenda'

export function createAgendaRouter(service: AgendaService, googleService: AgendaGoogleService) {
  return router({
    // === TIPOS (Categorias) ===
    listTipos: readProcedure(MODULE)
      .query(() => service.listTipos()),

    createTipo: writeProcedure(MODULE)
      .input(z.object({
        nome: z.string().min(1),
        cor: z.string().optional(),
        corBorda: z.string().optional(),
        corTexto: z.string().optional(),
        bloqueiaAgenda: z.boolean().optional(),
      }))
      .mutation(({ input }) => service.createTipo(input)),

    updateTipo: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        data: z.object({
          nome: z.string().min(1).optional(),
          cor: z.string().optional(),
          corBorda: z.string().optional(),
          corTexto: z.string().optional(),
          bloqueiaAgenda: z.boolean().optional(),
        }),
      }))
      .mutation(({ input }) => service.updateTipo(input.id, input.data)),

    deleteTipo: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.deleteTipo(input.id)),

    importTiposLegado: writeProcedure(MODULE)
      .mutation(() => service.importTiposLegado()),

    importEventosLegado: writeProcedure(MODULE)
      .input(z.object({ apenasAtivos: z.boolean().default(true) }).optional())
      .mutation(({ ctx, input }) => service.importEventosLegado(ctx.userId, input?.apenasAtivos ?? true)),

    importProgress: readProcedure(MODULE)
      .query(() => service.getImportProgress()),

    // === EVENTOS ===
    listEventos: readProcedure(MODULE)
      .input(z.object({
        dataInicio: z.string(),
        dataFim: z.string(),
        tipoId: z.string().optional(),
        criadorId: z.string().optional(),
        empresaId: z.string().optional(),
      }))
      .query(({ input, ctx }) => service.listEventos(input, ctx.userId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => service.getById(input.id)),

    create: writeProcedure(MODULE)
      .input(z.object({
        titulo: z.string().min(1),
        descricao: z.string().nullable().optional(),
        data: z.string(),
        dataFim: z.string().nullable().optional(),
        horaInicio: z.string().nullable().optional(),
        horaFim: z.string().nullable().optional(),
        diaInteiro: z.boolean().optional(),
        local: z.string().nullable().optional(),
        contato: z.string().nullable().optional(),
        link: z.string().nullable().optional(),
        presenca: z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']).optional(),
        particular: z.boolean().optional(),
        editavel: z.boolean().optional(),
        sala: z.string().nullable().optional(),
        garagem: z.boolean().optional(),
        vagas: z.number().nullable().optional(),
        equipamentos: z.string().nullable().optional(),
        isTarefa: z.boolean().optional(),
        tipoId: z.string(),
        empresaId: z.string().nullable().optional(),
        participanteIds: z.array(z.string()).optional(),
        participantesAvulsos: z.array(z.string()).optional(),
        recorrencia: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL']).optional(),
        recorrenciaVezes: z.number().nullable().optional(),
      }))
      .mutation(({ input, ctx }) => service.create(input, ctx.userId)),

    update: writeProcedure(MODULE)
      .input(z.object({
        id: z.string(),
        data: z.object({
          titulo: z.string().min(1).optional(),
          descricao: z.string().nullable().optional(),
          data: z.string().optional(),
          dataFim: z.string().nullable().optional(),
          horaInicio: z.string().nullable().optional(),
          horaFim: z.string().nullable().optional(),
          diaInteiro: z.boolean().optional(),
          local: z.string().nullable().optional(),
          contato: z.string().nullable().optional(),
          link: z.string().nullable().optional(),
          presenca: z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']).optional(),
          particular: z.boolean().optional(),
          editavel: z.boolean().optional(),
          sala: z.string().nullable().optional(),
          garagem: z.boolean().optional(),
          vagas: z.number().nullable().optional(),
          equipamentos: z.string().nullable().optional(),
          isTarefa: z.boolean().optional(),
          tipoId: z.string().optional(),
          empresaId: z.string().nullable().optional(),
          participanteIds: z.array(z.string()).optional(),
          participantesAvulsos: z.array(z.string()).optional(),
        }),
      }))
      .mutation(({ input, ctx }) => service.update(input.id, input.data, ctx.userId)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.delete(input.id, ctx.userId)),

    deleteLote: deleteProcedure(MODULE)
      .input(z.object({ lote: z.string() }))
      .mutation(({ input, ctx }) => service.deleteLote(input.lote, ctx.userId)),

    // === CONFLITOS ===
    verificarConflitos: readProcedure(MODULE)
      .input(z.object({
        data: z.string(),
        horaInicio: z.string(),
        horaFim: z.string(),
        participanteIds: z.array(z.string()).optional(),
        sala: z.string().optional(),
        eventoIdExcluir: z.string().optional(),
      }))
      .query(({ input }) => service.verificarConflitos(input)),

    // === DISPONIBILIDADE ===
    verificarDisponibilidade: readProcedure(MODULE)
      .input(z.object({
        data: z.string(),
        usuarioIds: z.array(z.string()).min(1),
      }))
      .query(({ input }) => service.verificarDisponibilidade(input)),

    // === LOGS ===
    listLogs: readProcedure(MODULE)
      .input(z.object({ eventoId: z.string() }))
      .query(({ input }) => service.listLogs(input.eventoId)),

    // === USUÁRIOS (para select de participantes) ===
    listUsuarios: readProcedure(MODULE)
      .query(() => service.listUsuarios()),

    // === GOOGLE CALENDAR ===
    google: router({
      getAuthUrl: readProcedure(MODULE)
        .query(({ ctx }) => googleService.getAuthUrl(ctx.userId)),

      handleCallback: writeProcedure(MODULE)
        .input(z.object({ code: z.string() }))
        .mutation(({ input, ctx }) => googleService.handleCallback(input.code, ctx.userId)),

      getStatus: readProcedure(MODULE)
        .query(({ ctx }) => googleService.getConnectionStatus(ctx.userId)),

      disconnect: writeProcedure(MODULE)
        .mutation(({ ctx }) => googleService.disconnect(ctx.userId)),

      syncToGoogle: writeProcedure(MODULE)
        .input(z.object({ eventoId: z.string() }))
        .mutation(({ input, ctx }) => googleService.syncToGoogle(input.eventoId, ctx.userId)),

      syncFromGoogle: writeProcedure(MODULE)
        .input(z.object({ daysBack: z.number().default(7), daysForward: z.number().default(30) }).optional())
        .mutation(({ input, ctx }) => googleService.syncFromGoogle(ctx.userId, input?.daysBack, input?.daysForward)),
    }),
  })
}
