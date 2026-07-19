import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { FolhaBiService } from './folha-bi.service'

export function createFolhaBiRouter(folhaBiService: FolhaBiService) {
  return router({
    // Competencias em cache (metadados) — alimenta o seletor da UI.
    list: protectedProcedure.query(() => folhaBiService.list()),

    // Status por cliente.
    status: protectedProcedure
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => folhaBiService.status(input.clienteId)),

    // Snapshot (payload apurado) de uma competencia.
    snapshot: protectedProcedure
      .input(z.object({
        clienteId: z.string(),
        cnpj: z.string(),
        ref: z.number().int(),
        fonte: z.string().default('python-etl'),
      }))
      .query(({ input }) => folhaBiService.snapshot(input.clienteId, input.cnpj, input.ref, input.fonte)),

    // ===== Config de agrupamento de verbas (folha_dash, ao vivo) =====
    classif: protectedProcedure.query(() => folhaBiService.classifSnapshot()),
    verbaLeaf: protectedProcedure
      .input(z.object({ empresa: z.number().int(), esquemaId: z.number().int() }))
      .query(({ input }) => folhaBiService.verbaLeaf(input.empresa, input.esquemaId)),
    buscarClasses: protectedProcedure
      .input(z.object({ termo: z.string() }))
      .query(({ input }) => folhaBiService.buscarClasses(input.termo)),

    // Relatorio SCI detalhado de provisao (ferias/13o), ao vivo do folha_dash.
    provDetalhe: protectedProcedure
      .input(z.object({ empresa: z.number().int(), ref: z.number().int(), tipo: z.enum(['ferias', 'decimo']) }))
      .query(({ input }) => folhaBiService.provDetalhe(input.empresa, input.ref, input.tipo)),

    // Serie multi-mes p/ os graficos do Resumo (ao vivo).
    resumoSerie: protectedProcedure
      .input(z.object({ empresa: z.number().int() }))
      .query(({ input }) => folhaBiService.resumoSerie(input.empresa)),

    // Planilha de Custos (XLSX em base64) p/ download no painel Verbas.
    planilhaCustos: protectedProcedure
      .input(z.object({ empresa: z.number().int(), ref: z.number().int() }))
      .query(({ input }) => folhaBiService.planilhaCustos(input.empresa, input.ref)),

    esquemaCreate: protectedProcedure
      .input(z.object({ nome: z.string().min(1), escopo: z.enum(['proventos', 'descontos', 'todos']).default('todos'), descricao: z.string().optional() }))
      .mutation(({ input }) => folhaBiService.esquemaCreate(input.nome, input.escopo, input.descricao)),
    esquemaDelete: protectedProcedure
      .input(z.object({ id: z.number().int() })).mutation(({ input }) => folhaBiService.esquemaDelete(input.id)),

    grupoCreate: protectedProcedure
      .input(z.object({ esquemaId: z.number().int(), parentId: z.number().int().nullable().optional(), nome: z.string().min(1), cor: z.string().nullable().optional() }))
      .mutation(({ input }) => folhaBiService.grupoCreate(input.esquemaId, input.parentId ?? null, input.nome, input.cor)),
    grupoRename: protectedProcedure
      .input(z.object({ id: z.number().int(), nome: z.string().min(1) })).mutation(({ input }) => folhaBiService.grupoRename(input.id, input.nome)),
    grupoMove: protectedProcedure
      .input(z.object({ id: z.number().int(), dir: z.enum(['up', 'down']) })).mutation(({ input }) => folhaBiService.grupoMove(input.id, input.dir)),
    grupoDelete: protectedProcedure
      .input(z.object({ id: z.number().int() })).mutation(({ input }) => folhaBiService.grupoDelete(input.id)),

    regraAdd: protectedProcedure
      .input(z.object({ grupoId: z.number().int(), prefixo: z.string().min(1), prioridade: z.number().int().default(0) }))
      .mutation(({ input }) => folhaBiService.regraAdd(input.grupoId, input.prefixo, input.prioridade)),
    regraDelete: protectedProcedure
      .input(z.object({ id: z.number().int() })).mutation(({ input }) => folhaBiService.regraDelete(input.id)),

    aplicar: protectedProcedure
      .input(z.object({ esquemaId: z.number().int().optional() }).optional())
      .mutation(({ input }) => folhaBiService.aplicar(input?.esquemaId)),
  })
}
