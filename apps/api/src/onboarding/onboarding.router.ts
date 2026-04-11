import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { OnboardingService } from './onboarding.service'

export function createOnboardingRouter(onboardingService: OnboardingService) {
  return router({
    createEmpresa: protectedProcedure
      .input(z.object({
        razaoSocial: z.string().min(2, 'Razão Social é obrigatória'),
        nomeFantasia: z.string().optional(),
        cnpj: z.string().min(14, 'CNPJ é obrigatório'),
      }))
      .mutation(({ input, ctx }) => onboardingService.createEmpresa(ctx.userId, input)),

    needsOnboarding: protectedProcedure
      .query(({ ctx }) => onboardingService.needsOnboarding(ctx.userId)),
  })
}
