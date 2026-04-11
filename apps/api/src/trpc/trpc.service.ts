import { Inject, Injectable } from '@nestjs/common'
import { initTRPC } from '@trpc/server'
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

export interface TrpcContext {
  tenantId?: string
  userId?: string
  empresaId?: string
  isMaster?: boolean
  isEmpresaMaster?: boolean
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
      cliente: createClienteRouter(this.clienteService, this.legacyImportService, this.sciService),
    })
  }
}

export type AppRouter = ReturnType<TrpcService['createRouter']>
