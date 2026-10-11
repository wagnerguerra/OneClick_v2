import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma, Prisma } from '@saas/db'
import { router, protectedProcedure, readProcedure } from '../trpc/trpc.service'
import type { DanfeService } from '../danfe/danfe.service'

/**
 * Rotas do OneClick Viewer (app desktop de visualização de documentos fiscais).
 *
 * O Viewer entra pelo handshake desktop (`/api/auth/desktop-*`, com `?app=viewer`)
 * e chama estas rotas com `Authorization: Bearer <sessão>`. Elas existem para:
 *   - reconhecer o cliente do escritório pelo CNPJ do documento aberto e abrir a
 *     pasta dele (`clientes`);
 *   - trazer as NF-e que a distribuição DF-e do ERP já baixou (`notas` + `xmls`),
 *     em vez de o Viewer consultar a Sefaz de novo para o mesmo CNPJ — duas
 *     consultas concorrentes levam a Sefaz a bloquear o CNPJ por 1 hora (656).
 *
 * Isolamento: por empresa, no mesmo padrão de `cliente.listForSelect` — master
 * sem empresa ativa vê tudo; não-master sem empresa não vê nada.
 */

const SEM_EMPRESA = '__none__'

function escopoEmpresa(isMaster: boolean | undefined, empresaId: string | undefined): { empresaId?: string } {
  if (empresaId) return { empresaId }
  return isMaster ? {} : { empresaId: SEM_EMPRESA }
}

const somenteDigitos = (s: string) => s.replace(/\D/g, '')

export function createViewerRouter(danfeService: DanfeService) {
  return router({
    // Quem está conectado (exibido no Viewer).
    me: protectedProcedure.query(async ({ ctx }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { name: true, email: true, empresa: { select: { nomeFantasia: true, razaoSocial: true } } },
      })
      return {
        nome: user?.name ?? '',
        email: user?.email ?? '',
        empresa: user?.empresa?.nomeFantasia || user?.empresa?.razaoSocial || '',
      }
    }),

    // Clientes ativos com CNPJ e pasta na rede, para o Viewer reconhecer o cliente
    // de cada documento. Lista inteira de uma vez (é pequena) — o Viewer guarda em cache.
    clientes: readProcedure('clientes').query(async ({ ctx }) => {
      return prisma.cliente.findMany({
        where: { status: 'ATIVO', ...escopoEmpresa(ctx.isMaster, ctx.empresaId) },
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          documento: true,
          tipoDocumento: true,
          ehMatriz: true,
          localFolderPath: true,
          nfeDistEnabled: true,
          nfeDistSyncedAt: true,
        },
        orderBy: { razaoSocial: 'asc' },
      })
    }),

    // NF-e de um cliente já armazenadas no ERP (distribuição DF-e, pasta, uploads):
    // as vinculadas ao cliente e as que têm o CNPJ dele como emitente ou destinatário.
    notas: readProcedure('danfe')
      .input(z.object({
        clienteId: z.string(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }))
      .query(async ({ input, ctx }) => {
        const escopo = escopoEmpresa(ctx.isMaster, ctx.empresaId)
        const cliente = await prisma.cliente.findFirst({
          where: { id: input.clienteId, ...escopo },
          select: { id: true, documento: true, razaoSocial: true },
        })
        if (!cliente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' })
        const doc = somenteDigitos(cliente.documento ?? '')
        const quem: Prisma.DanfeWhereInput[] = [{ clienteId: cliente.id }]
        if (doc.length === 14 || doc.length === 11) quem.push({ destCnpjCpf: doc }, { emitenteCnpj: doc })
        const where: Prisma.DanfeWhereInput = { ...escopo, OR: quem }
        if (input.dataInicio || input.dataFim) {
          where.dataEmissao = {
            ...(input.dataInicio ? { gte: new Date(input.dataInicio) } : {}),
            ...(input.dataFim ? { lte: new Date(input.dataFim) } : {}),
          }
        }
        const [total, itens] = await Promise.all([
          prisma.danfe.count({ where }),
          prisma.danfe.findMany({
            where,
            select: {
              id: true, chave: true, modelo: true, numero: true, serie: true,
              emitenteCnpj: true, emitenteRazao: true, destCnpjCpf: true, destRazao: true,
              valorTotal: true, dataEmissao: true, status: true, protocolo: true,
            },
            orderBy: { dataEmissao: 'desc' },
            skip: (input.page - 1) * input.limit,
            take: input.limit,
          }),
        ])
        return {
          total,
          cliente: { id: cliente.id, razaoSocial: cliente.razaoSocial, documento: doc },
          itens: itens.map((d) => ({ ...d, valorTotal: d.valorTotal.toString() })),
        }
      }),

    // XML original de até 50 notas por chamada (o Viewer grava e abre como lote).
    xmls: readProcedure('danfe')
      .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
      .query(async ({ input, ctx }) => {
        const docs = await prisma.danfe.findMany({
          where: { id: { in: input.ids }, ...escopoEmpresa(ctx.isMaster, ctx.empresaId) },
          select: { id: true, chave: true, xmlKey: true },
        })
        const storage = danfeService.getStorage()
        return Promise.all(docs.map(async (d) => {
          try {
            return { id: d.id, chave: d.chave, xml: (await storage.readBuffer(d.xmlKey)).toString('utf8') }
          } catch {
            return { id: d.id, chave: d.chave, xml: null, erro: 'XML indisponível no armazenamento' }
          }
        }))
      }),
  })
}
