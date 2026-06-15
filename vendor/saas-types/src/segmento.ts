// Segmentos de cliente contábil — slugs canônicos e metadados.
// Templates de Servico têm campo `segmentoSlug` que referencia esses slugs.
// null = template genérico/avulso (Abertura de Empresa, certidões, etc).

export const SEGMENTO_SLUGS = [
  'atacadista-lucro-real',
  'industria-lucro-real',
  'tecnologia-presumido',
  'tecnologia-real',
  'comercio-varejo-simples',
  'holding-presumido',
  'construcao-civil-presumido',
  'telecomunicacoes-lucro-real',
  'educacao-presumido',
] as const

export type SegmentoSlug = (typeof SEGMENTO_SLUGS)[number]

export interface SegmentoMeta {
  label: string
  cor: string
  regime: 'Lucro Real' | 'Lucro Presumido' | 'Simples Nacional'
}

export const SEGMENTO_META: Record<SegmentoSlug, SegmentoMeta> = {
  'atacadista-lucro-real':       { label: 'Atacadista LR',     cor: '#0ea5e9', regime: 'Lucro Real' },
  'industria-lucro-real':        { label: 'Indústria LR',      cor: '#fb7185', regime: 'Lucro Real' },
  'tecnologia-presumido':        { label: 'Tech Presumido',    cor: '#8b5cf6', regime: 'Lucro Presumido' },
  'tecnologia-real':             { label: 'Tech Real',         cor: '#7c3aed', regime: 'Lucro Real' },
  'comercio-varejo-simples':     { label: 'Varejo Simples',    cor: '#10b981', regime: 'Simples Nacional' },
  'holding-presumido':           { label: 'Holding',           cor: '#6366f1', regime: 'Lucro Presumido' },
  'construcao-civil-presumido':  { label: 'Construção',        cor: '#f59e0b', regime: 'Lucro Presumido' },
  'telecomunicacoes-lucro-real': { label: 'Telecom',           cor: '#818cf8', regime: 'Lucro Real' },
  'educacao-presumido':          { label: 'Educação',          cor: '#d946ef', regime: 'Lucro Presumido' },
}

export function isSegmentoSlug(s: string): s is SegmentoSlug {
  return (SEGMENTO_SLUGS as readonly string[]).includes(s)
}
