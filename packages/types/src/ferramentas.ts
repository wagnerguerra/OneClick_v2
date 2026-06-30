import { z } from 'zod'
import { paginationSchema } from './pagination'

// ─────────────────────────────────────────────────────────────────────────────
// Schemas compartilhados do módulo "Ferramentas" (integração webapp → OneClick).
// Ver docs/plano-ferramentas.md. As ferramentas entram no menu por ÁREA (bloco):
// fiscais no bloco Fiscal, contábeis no bloco Contábil.
// ─────────────────────────────────────────────────────────────────────────────

/** Áreas/blocos que hospedam ferramentas (slug RBAC = `ferramentas-<area>`, cor = `--mod-<area>`). */
export const TOOL_AREAS = ['fiscal', 'contabil'] as const
export const toolAreaSchema = z.enum(TOOL_AREAS)
export type ToolArea = (typeof TOOL_AREAS)[number]

/**
 * 8 ferramentas job-based (geram `ToolJob` via gateway/proxy).
 * Espelha o enum `DownloadTool` da API Fastify do webapp (`webapp-01/apps/api/src/tokens.ts`).
 * As 2 browser-only (`nfse-pdf`, `extrato-edit`) NÃO geram job e não entram aqui.
 */
export const JOB_TOOL_IDS = [
  'nfe',
  'sped',
  'sped-merge',
  'sci-consolidado',
  'comparacao-planilhas',
  'comparacao-nfse',
  'sci-portal-nacional',
  'gnre',
] as const
export const jobToolIdSchema = z.enum(JOB_TOOL_IDS)
export type JobToolId = (typeof JOB_TOOL_IDS)[number]

/**
 * Área (bloco do menu + slug de permissão) de cada ferramenta job-based.
 * ⚠️ Categoria (menu) ≠ arquitetura técnica: `gnre` é Contábil porém job-based.
 */
export const TOOL_AREA: Record<JobToolId, ToolArea> = {
  nfe: 'fiscal',
  sped: 'fiscal',
  'sped-merge': 'fiscal',
  'sci-consolidado': 'fiscal',
  'comparacao-planilhas': 'fiscal',
  'comparacao-nfse': 'fiscal',
  'sci-portal-nacional': 'fiscal',
  gnre: 'contabil',
}

/** Deriva o slug do módulo RBAC umbrella da área (ex.: `ferramentas-fiscal`). */
export function ferramentasModuleSlug(area: ToolArea): string {
  return `ferramentas-${area}`
}

/** Estados de um job, alinhados ao que a API do webapp devolve em `GET …/jobs/:id`. */
export const toolJobStatusSchema = z.enum([
  'queued',
  'running',
  'done',
  'failed',
  'not_found',
])
export type ToolJobStatus = z.infer<typeof toolJobStatusSchema>

/** Resposta de uma linha de `ToolJob` (histórico/auditoria por tenant). */
export const toolJobResponseSchema = z.object({
  id: z.string(),
  code: z.number(),
  tool: jobToolIdSchema,
  status: toolJobStatusSchema,
  fileNameIn: z.string(),
  fileNameOut: z.string().nullable().optional(),
  progress: z.number().min(0).max(100).default(0),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
})
export type ToolJobResponse = z.infer<typeof toolJobResponseSchema>

/** Input de listagem do histórico (paginação + filtros opcionais por tool/área/status). */
export const listToolJobsSchema = paginationSchema.extend({
  tool: jobToolIdSchema.optional(),
  area: toolAreaSchema.optional(),
  status: toolJobStatusSchema.optional(),
})
export type ListToolJobsInput = z.infer<typeof listToolJobsSchema>

/** Campos opcionais do multipart de criação do SPED (subset de abas + REGs presentes). */
export const spedCreateFieldsSchema = z.object({
  sheets: z.array(z.string()).optional(),
  presentRegs: z.array(z.string()).optional(),
})
export type SpedCreateFields = z.infer<typeof spedCreateFieldsSchema>
