import { Inject, Injectable } from '@nestjs/common'
import { initTRPC, TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import { AreaService } from '../area/area.service'
import { createAreaRouter } from '../area/area.router'
import { EmpresaService } from '../empresa/empresa.service'
import { createEmpresaRouter } from '../empresa/empresa.router'
import { UserService } from '../user/user.service'
import { createUserRouter } from '../user/user.router'
import { CargoService } from '../cargo/cargo.service'
import { createCargoRouter } from '../cargo/cargo.router'
import { OnboardingService } from '../onboarding/onboarding.service'
import { createOnboardingRouter } from '../onboarding/onboarding.router'
import { AdminService } from '../admin/admin.service'
import { createAdminRouter } from '../admin/admin.router'
import { ClienteService } from '../cliente/cliente.service'
import { LegacyImportService } from '../cliente/legacy-import.service'
import { SciService } from '../cliente/sci.service'
import { createClienteRouter } from '../cliente/cliente.router'
import { StripeService } from '../stripe/stripe.service'
import { createBillingRouter } from '../stripe/stripe.router'
import { ColaboradorService } from '../colaborador/colaborador.service'
import { createColaboradorRouter } from '../colaborador/colaborador.router'
import { FornecedorService } from '../fornecedor/fornecedor.service'
import { createFornecedorRouter } from '../fornecedor/fornecedor.router'
import { SocioService } from '../socio/socio.service'
import { createSocioRouter } from '../socio/socio.router'
import { CnpjService } from '../cnpj/cnpj.service'
import { SitfisService } from '../sitfis/sitfis.service'
import { createSitfisRouter } from '../sitfis/sitfis.router'
import { CaixaPostalService } from '../caixapostal/caixapostal.service'
import { CaixaPostalSchedulerService } from '../caixapostal/caixapostal.scheduler'
import { createCaixaPostalRouter } from '../caixapostal/caixapostal.router'
import { IntegrationService } from '../cliente/integration.service'
import { CndService } from '../cnd/cnd.service'
import { DctfwebService } from '../dctfweb/dctfweb.service'
import { createDctfwebRouter } from '../dctfweb/dctfweb.router'
import { CndSchedulerService } from '../cnd/cnd.scheduler'
import { createCndRouter } from '../cnd/cnd.router'
import { BiService } from '../bi/bi.service'
import { createBiRouter, createBiPublicRouter } from '../bi/bi.router'
import { FolhaService } from '../folha/folha.service'
import { createFolhaRouter } from '../folha/folha.router'

export interface TrpcContext {
  tenantId?: string
  tenantSchema?: string
  userId?: string
  empresaId?: string
  isMaster?: boolean
  isEmpresaMaster?: boolean
}

interface UserPermissionRow {
  moduleSlug: string
  canRead: boolean
  canWrite: boolean
  canDelete: boolean
}

// Cache de permissões por userId (TTL 30s — alinhado ao session cache)
const permissionCache = new Map<string, { data: UserPermissionRow[]; expires: number }>()
const PERMISSION_TTL = 30_000

async function getUserPermissions(userId: string): Promise<UserPermissionRow[]> {
  const cached = permissionCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.data

  const perms = await prisma.userPermission.findMany({
    where: { userId },
    select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true },
  })

  permissionCache.set(userId, { data: perms, expires: Date.now() + PERMISSION_TTL })

  // Limpar entradas expiradas periodicamente
  if (permissionCache.size > 200) {
    const now = Date.now()
    for (const [key, val] of permissionCache) {
      if (val.expires < now) permissionCache.delete(key)
    }
  }

  return perms
}

const t = initTRPC.context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new Error('Não autorizado')
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

// ── Permission-based procedures ─────────────────────────────
// isMaster e isEmpresaMaster sempre têm acesso total.
// Outros usuários precisam da permissão correspondente no módulo.

function createPermissionMiddleware(moduleSlug: string, action: 'canRead' | 'canWrite' | 'canDelete') {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Não autorizado' })
    }

    // Master e EmpresaMaster têm acesso total
    if (ctx.isMaster || ctx.isEmpresaMaster) {
      return next({ ctx: { ...ctx, userId: ctx.userId } })
    }

    const permissions = await getUserPermissions(ctx.userId)
    const modulePerm = permissions.find(p => p.moduleSlug === moduleSlug)

    if (!modulePerm || !modulePerm[action]) {
      const actionLabels = { canRead: 'leitura', canWrite: 'escrita', canDelete: 'exclusão' }
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Sem permissão de ${actionLabels[action]} no módulo "${moduleSlug}"`,
      })
    }

    return next({ ctx: { ...ctx, userId: ctx.userId } })
  })
}

/** Procedure que exige permissão de leitura no módulo */
export function readProcedure(moduleSlug: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canRead'))
}

/** Procedure que exige permissão de escrita no módulo */
export function writeProcedure(moduleSlug: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canWrite'))
}

/** Procedure que exige permissão de exclusão no módulo */
export function deleteProcedure(moduleSlug: string) {
  return t.procedure.use(createPermissionMiddleware(moduleSlug, 'canDelete'))
}

@Injectable()
export class TrpcService {
  public readonly appRouter: ReturnType<typeof this.createRouter>

  constructor(
    @Inject(AreaService) private readonly areaService: AreaService,
    @Inject(EmpresaService) private readonly empresaService: EmpresaService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(CargoService) private readonly cargoService: CargoService,
    @Inject(OnboardingService) private readonly onboardingService: OnboardingService,
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(ClienteService) private readonly clienteService: ClienteService,
    @Inject(LegacyImportService) private readonly legacyImportService: LegacyImportService,
    @Inject(SciService) private readonly sciService: SciService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(ColaboradorService) private readonly colaboradorService: ColaboradorService,
    @Inject(FornecedorService) private readonly fornecedorService: FornecedorService,
    @Inject(SocioService) private readonly socioService: SocioService,
    @Inject(CnpjService) private readonly cnpjService: CnpjService,
    @Inject(SitfisService) private readonly sitfisService: SitfisService,
    @Inject(CaixaPostalService) private readonly caixaPostalService: CaixaPostalService,
    @Inject(CaixaPostalSchedulerService) private readonly caixaPostalScheduler: CaixaPostalSchedulerService,
    @Inject(IntegrationService) private readonly integrationService: IntegrationService,
    @Inject(CndService) private readonly cndService: CndService,
    @Inject(CndSchedulerService) private readonly cndScheduler: CndSchedulerService,
    @Inject(DctfwebService) private readonly dctfwebService: DctfwebService,
    @Inject(BiService) private readonly biService: BiService,
    @Inject(FolhaService) private readonly folhaService: FolhaService,
  ) {
    this.appRouter = this.createRouter()
  }

  private createRouter() {
    return router({
      health: publicProcedure.query(() => {
        return { status: 'ok', timestamp: new Date().toISOString() }
      }),
      me: protectedProcedure.query(({ ctx }) => {
        return { userId: ctx.userId, tenantId: ctx.tenantId, empresaId: ctx.empresaId, isMaster: ctx.isMaster }
      }),
      area: createAreaRouter(this.areaService),
      empresa: createEmpresaRouter(this.empresaService),
      user: createUserRouter(this.userService),
      cargo: createCargoRouter(this.cargoService),
      onboarding: createOnboardingRouter(this.onboardingService),
      admin: createAdminRouter(this.adminService),
      cliente: createClienteRouter(this.clienteService, this.legacyImportService, this.sciService, this.integrationService),
      billing: createBillingRouter(this.stripeService),
      colaborador: createColaboradorRouter(this.colaboradorService),
      fornecedor: createFornecedorRouter(this.fornecedorService),
      socio: createSocioRouter(this.socioService, this.cnpjService),
      sitfis: createSitfisRouter(this.sitfisService, this.cnpjService, this.socioService),
      caixaPostal: createCaixaPostalRouter(this.caixaPostalService, this.caixaPostalScheduler),
      cnd: createCndRouter(this.cndService, this.cndScheduler),
      dctfweb: createDctfwebRouter(this.dctfwebService),
      bi: createBiRouter(this.biService),
      biPublic: createBiPublicRouter(this.biService),
      folha: createFolhaRouter(this.folhaService),
    })
  }
}

export type AppRouter = ReturnType<TrpcService['createRouter']>
