/**
 * SignatureTemplateService — CRUD do template de assinatura POR EMPRESA.
 * Edição restrita a usuários `isMaster` global (validação no router).
 *
 * Default: quando não existe linha pra empresa, retornamos os DEFAULTS hardcoded
 * abaixo. A row só é criada no primeiro `update`.
 */

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { prisma } from '@saas/db'

export const SIGNATURE_TEMPLATE_DEFAULTS = {
  backgroundColor: '#3a3a3a',
  backgroundImageUrl: null as string | null,
  accentColor: '#10b981',
  textColor: '#ffffff',
  subtleColor: '#cfd2d4',
  fontFamily: 'Arial, Helvetica, sans-serif',
  showPhoto: true,
  showName: true,
  showArea: true,
  showPhone: true,
  showAddress: true,
  showSite: true,
  showInstagram: true,
  showLogo: true,
  showPhotoBackground: true,
  showIcons: true,
  customHtmlEnabled: false,
  customHtml: null as string | null,
}

export interface SignatureTemplateInput {
  backgroundColor?: string
  backgroundImageUrl?: string | null
  accentColor?: string
  textColor?: string
  subtleColor?: string
  fontFamily?: string
  showPhoto?: boolean
  showName?: boolean
  showArea?: boolean
  showPhone?: boolean
  showAddress?: boolean
  showSite?: boolean
  showInstagram?: boolean
  showLogo?: boolean
  showPhotoBackground?: boolean
  showIcons?: boolean
  customHtmlEnabled?: boolean
  customHtml?: string | null
}

@Injectable()
export class SignatureTemplateService {
  /** Retorna o template salvo ou defaults se não existir. */
  async getTemplate(empresaId: string) {
    const row = await prisma.empresaSignatureTemplate.findUnique({ where: { empresaId } })
    if (!row) {
      return { empresaId, ...SIGNATURE_TEMPLATE_DEFAULTS }
    }
    return row
  }

  /** Atualiza (ou cria) o template — apenas isMaster pode chamar. */
  async updateTemplate(empresaId: string, isMaster: boolean, data: SignatureTemplateInput) {
    if (!isMaster) {
      throw new ForbiddenException('Apenas administradores master podem editar o template de assinatura.')
    }
    // Valida empresa existe
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } })
    if (!empresa) throw new NotFoundException('Empresa não encontrada.')

    // Strings vazias viram null (limpa override)
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      sanitized[key] = typeof value === 'string' && value.trim() === '' ? null : value
    }

    const row = await prisma.empresaSignatureTemplate.upsert({
      where: { empresaId },
      create: { empresaId, ...sanitized } as never,
      update: sanitized,
    })
    return row
  }

  /** Reseta o template (apaga a row — getTemplate volta a retornar defaults). */
  async resetTemplate(empresaId: string, isMaster: boolean) {
    if (!isMaster) {
      throw new ForbiddenException('Apenas administradores master podem resetar o template.')
    }
    await prisma.empresaSignatureTemplate.deleteMany({ where: { empresaId } })
    return { ok: true }
  }
}
