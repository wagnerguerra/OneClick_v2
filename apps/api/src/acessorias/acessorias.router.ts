import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { AcessoriasService } from './acessorias.service'

/**
 * Router tRPC do Acessórias. Endpoints protegidos por auth padrão (qualquer
 * usuário logado pode testar conexão e consultar). Modificações/sincronização
 * (quando implementarmos) usarão writeProcedure com permissão específica.
 *
 * Mapeamento dos endpoints REST do Acessórias documentado em
 * /docs/INTEGRACAO-ACESSORIAS.md.
 */
export function createAcessoriasRouter(svc: AcessoriasService) {
  return router({
    /** Valida que o token configurado funciona — chama /companies?limit=1
     *  e devolve status + count de empresas pra UI mostrar feedback amigável. */
    testConnection: protectedProcedure
      .query(() => svc.testConnection()),

    /** Lista empresas paginadas. Usado no setup pra escolher qual empresa
     *  do Acessórias corresponde a cada Cliente do OneClick. */
    listCompanies: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        page: z.coerce.number().int().min(1).optional(),
      }).optional())
      .query(({ input }) => svc.listCompanies(input)),

    /** Exploratório — chama qualquer endpoint da API e devolve a resposta crua.
     *  Pra inspeção do shape antes de modelarmos o sync. Útil também pra debug. */
    explore: protectedProcedure
      .input(z.object({
        path: z.string().min(1),
        query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      }))
      .query(({ input }) => svc.exploreEndpoint(input.path, input.query)),

    /** Lista entregas (deliveries). Filtros: por CNPJ, situação, período.
     *  Sem CNPJ vai pra /deliveries/ListAll. */
    listDeliveries: protectedProcedure
      .input(z.object({
        cnpj: z.string().optional(),
        situacao: z.enum(['pending', 'read', 'delivered']).optional(),
        dtInicio: z.string().optional(),
        dtFim: z.string().optional(),
        dtLastDH: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        page: z.coerce.number().int().min(1).optional(),
      }).optional())
      .query(({ input }) => svc.listDeliveries(input)),

    // ── Sync engine ──────────────────────────────────────────
    syncCompanies: protectedProcedure
      .mutation(({ ctx }) => svc.syncCompanies({
        triggeredBy: ctx.userId ?? undefined,
        empresaId: ctx.empresaId ?? null,
      })),

    syncDeliveries: protectedProcedure
      .input(z.object({
        dtInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dtFinal:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        clienteId: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => svc.syncDeliveries({
        dtInicio: input.dtInicio,
        dtFinal:  input.dtFinal,
        clienteId: input.clienteId,
        triggeredBy: ctx.userId ?? undefined,
        empresaId: ctx.empresaId ?? null,
      })),

    listObligationsObserved: protectedProcedure
      .query(() => svc.listObligationsObserved()),

    listObligationMaps: protectedProcedure
      .query(({ ctx }) => svc.listObligationMaps(ctx.empresaId ?? null)),

    // ── M:N: add/remove vínculo de servico a obrigação ──
    addObligationServico: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        servicoId: z.string(),
      }))
      .mutation(({ input, ctx }) => svc.addObligationServico({
        nome: input.nome,
        servicoId: input.servicoId,
        empresaId: ctx.empresaId ?? null,
      })),

    removeObligationServico: protectedProcedure
      .input(z.object({ mapId: z.string() }))
      .mutation(({ input }) => svc.removeObligationServico(input.mapId)),

    setObligationServicoActive: protectedProcedure
      .input(z.object({ mapId: z.string(), ativo: z.boolean() }))
      .mutation(({ input }) => svc.setObligationServicoActive(input.mapId, input.ativo)),

    setObligationIgnored: protectedProcedure
      .input(z.object({ nome: z.string(), ignored: z.boolean() }))
      .mutation(({ input, ctx }) => svc.setObligationIgnored({
        ...input,
        empresaId: ctx.empresaId ?? null,
      })),

    setObligationObservacoes: protectedProcedure
      .input(z.object({ nome: z.string(), observacoes: z.string().nullable() }))
      .mutation(({ input, ctx }) => svc.setObligationObservacoes({
        ...input,
        empresaId: ctx.empresaId ?? null,
      })),

    suggestMappings: protectedProcedure
      .query(() => svc.suggestMappings()),

    applySuggestions: protectedProcedure
      .input(z.object({
        items: z.array(z.object({ nome: z.string(), servicoId: z.string() })),
      }))
      .mutation(({ input, ctx }) => svc.applySuggestions(input.items, ctx.empresaId ?? null)),

    listSyncLogs: protectedProcedure
      .input(z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }).optional())
      .query(({ input }) => svc.listSyncLogs(input?.limit)),

    /** Cadastra (ou atualiza) o Cliente no Acessórias via POST /companies.
     *  Lê Cliente local, mapeia tributacao→regime, dispara request e grava
     *  Cliente.idAcessorias com o ID retornado. Apenas PJ (CNPJ válido). */
    createCompanyFromCliente: protectedProcedure
      .input(z.object({ clienteId: z.string() }))
      .mutation(({ input, ctx }) =>
        svc.createCompanyInAcessorias(input.clienteId, {
          triggeredBy: ctx.userId ?? undefined,
        }),
      ),
  })
}
