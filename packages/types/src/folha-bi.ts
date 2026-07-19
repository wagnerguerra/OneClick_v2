import { z } from 'zod'

// Envelope de upload da ETL (Launcher) -> cache do BI de Folha, por competencia.
// Fase 1: `payload` livre (snapshot apurado). Evolui p/ fato/dim relacional depois.
export const folhaBiUploadSchema = z.object({
  clienteId: z.string().min(1), // Cliente do OneClick (resolvido pela ETL via CNPJ)
  cnpj: z.string().min(1), // CNPJ da empresa/filial no SCI
  ref: z.number().int(), // AAAAMM (13o = AAAA13)
  fonte: z.string().default('python-etl'),
  totalLinhas: z.number().int().nonnegative().default(0),
  payload: z.any(), // snapshot apurado (livre na Fase 1)
})
export type FolhaBiUpload = z.infer<typeof folhaBiUploadSchema>
