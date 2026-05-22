import { z } from 'zod'
import { router, protectedProcedure } from '../trpc/trpc.service'
import { SignatureService } from './signature.service'
import { SignatureTemplateService } from './signature-template.service'

/**
 * Router tRPC do signature — mantém SÓ a composição de imagem (composeFromUpload).
 * O CRUD do template (getTemplate, updateTemplate, resetTemplate) foi movido pro
 * controller REST em signature-template.controller.ts porque o Chrome em alguns
 * ambientes trava POST tRPC pra essa rota (preflight CORS sem resposta).
 */
export function createSignatureRouter(svc: SignatureService, _templateSvc: SignatureTemplateService) {
  return router({
    /** Compõe a foto da assinatura a partir de uma URL já enviada via /api/upload. */
    composeFromUpload: protectedProcedure
      .input(z.object({ originalUrl: z.string().min(1) }))
      .mutation(({ input, ctx }) => svc.composeFromUpload(ctx.userId!, input.originalUrl)),
  })
}
