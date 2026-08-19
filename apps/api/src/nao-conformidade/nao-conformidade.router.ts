import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import {
  criarNaoConformidadeSchema, atualizarNaoConformidadeSchema, registrarCausaNcSchema,
  registrarFormaAvaliacaoNcSchema, avaliarNcSchema, atualizacaoSistemaNcSchema, cancelarNcSchema,
  criarNcAcaoSchema, atualizarNcAcaoSchema, concluirNcAcaoSchema, criarNcMensagemSchema,
  criarNcOrigemSchema, atualizarNcOrigemSchema, listarNaoConformidadesSchema,
} from '@saas/types'
import { NaoConformidadeService } from './nao-conformidade.service'

const MODULE = 'nao-conformidades'

export function createNaoConformidadeRouter(service: NaoConformidadeService) {
  return router({
    listar: readProcedure(MODULE)
      .input(listarNaoConformidadesSchema)
      .query(({ input, ctx }) => service.listar(input, ctx.empresaId)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => service.getById(input.id, ctx.empresaId)),

    criar: writeProcedure(MODULE)
      .input(criarNaoConformidadeSchema)
      .mutation(({ input, ctx }) => service.criar(input, ctx.userId, ctx.empresaId)),

    atualizar: writeProcedure(MODULE)
      .input(atualizarNaoConformidadeSchema)
      .mutation(({ input, ctx }) => service.atualizar(input, ctx.userId, ctx.empresaId)),

    registrarCausa: writeProcedure(MODULE)
      .input(registrarCausaNcSchema)
      .mutation(({ input, ctx }) => service.registrarCausa(input, ctx.userId, ctx.empresaId)),

    registrarFormaAvaliacao: writeProcedure(MODULE)
      .input(registrarFormaAvaliacaoNcSchema)
      .mutation(({ input, ctx }) => service.registrarFormaAvaliacao(input, ctx.userId, ctx.empresaId)),

    avaliar: writeProcedure(MODULE)
      .input(avaliarNcSchema)
      .mutation(({ input, ctx }) => service.avaliar(input, ctx.userId, ctx.empresaId)),

    registrarAtualizacaoSistema: writeProcedure(MODULE)
      .input(atualizacaoSistemaNcSchema)
      .mutation(({ input, ctx }) => service.registrarAtualizacaoSistema(input, ctx.userId, ctx.empresaId)),

    cancelar: writeProcedure(MODULE)
      .input(cancelarNcSchema)
      .mutation(({ input, ctx }) => service.cancelar(input, ctx.userId, ctx.empresaId)),

    excluir: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluir(input.id, ctx.userId, ctx.empresaId)),

    criarAcao: writeProcedure(MODULE)
      .input(criarNcAcaoSchema)
      .mutation(({ input, ctx }) => service.criarAcao(input, ctx.userId, ctx.empresaId)),

    atualizarAcao: writeProcedure(MODULE)
      .input(atualizarNcAcaoSchema)
      .mutation(({ input, ctx }) => service.atualizarAcao(input, ctx.userId)),

    concluirAcao: writeProcedure(MODULE)
      .input(concluirNcAcaoSchema)
      .mutation(({ input, ctx }) => service.concluirAcao(input, ctx.userId)),

    excluirAcao: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => service.excluirAcao(input.id, ctx.userId)),

    criarMensagem: writeProcedure(MODULE)
      .input(criarNcMensagemSchema)
      .mutation(({ input, ctx }) => service.criarMensagem(input, ctx.userId, ctx.empresaId)),

    excluirMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => service.excluirMensagem(input.id)),

    listarOrigens: readProcedure(MODULE)
      .input(z.object({ todas: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => service.listarOrigens(ctx.empresaId, !input?.todas)),

    criarOrigem: writeProcedure(MODULE)
      .input(criarNcOrigemSchema)
      .mutation(({ input, ctx }) => service.criarOrigem(input, ctx.empresaId)),

    atualizarOrigem: writeProcedure(MODULE)
      .input(atualizarNcOrigemSchema)
      .mutation(({ input }) => service.atualizarOrigem(input)),

    listarUsuarios: readProcedure(MODULE)
      .query(({ ctx }) => service.listarUsuarios(ctx.empresaId)),
    listarAreas: readProcedure(MODULE)
      .query(({ ctx }) => service.listarAreas(ctx.empresaId)),
    listarProcessos: readProcedure(MODULE)
      .query(({ ctx }) => service.listarProcessos(ctx.empresaId)),
    listarClientes: readProcedure(MODULE)
      .query(({ ctx }) => service.listarClientes(ctx.empresaId)),
    buscarSimilares: readProcedure(MODULE)
      .input(z.object({ termo: z.string().default('') }))
      .query(({ input, ctx }) => service.buscarSimilares(input.termo, ctx.empresaId)),
  })
}
