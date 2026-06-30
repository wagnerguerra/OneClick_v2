import type { LucideIcon } from 'lucide-react'
import {
  FileSpreadsheet, FileCode, Files, Scale, ArrowLeftRight, Receipt, GitMerge, FileSearch, FileText,
} from 'lucide-react'

// Catálogo de TODAS as ferramentas (job-based + browser-only) para os hubs
// /ferramentas/fiscal e /ferramentas/contabil. Cada card abre a rota da ferramenta.

export type ToolArea = 'fiscal' | 'contabil'

/** Cor (roxo) da identidade das Ferramentas — combina com a box do menu/aba. */
export const FERRAMENTAS_COLOR = '#8b5cf6'

export interface ToolCard {
  tool: string
  area: ToolArea
  href: string
  title: string
  subtitle: string
  icon: LucideIcon
  /** Etiqueta de categoria opcional (ex.: "NFS-e"). */
  badge?: string
}

export const TOOLS_CATALOG: ToolCard[] = [
  // ── Fiscal ──────────────────────────────────────────────────────────────
  { tool: 'nfe', area: 'fiscal', href: '/ferramentas/fiscal/nfe', title: 'NFe XML → XLSX', subtitle: 'Notas fiscais eletrônicas', icon: FileCode, badge: 'NF-e' },
  { tool: 'sped', area: 'fiscal', href: '/ferramentas/fiscal/sped', title: 'SPED → XLSX', subtitle: 'EFD Contribuições · ICMS-IPI', icon: FileSpreadsheet },
  { tool: 'sped-merge', area: 'fiscal', href: '/ferramentas/fiscal/sped-merge', title: 'XLSX → SPED', subtitle: 'Mescla a planilha no .txt', icon: GitMerge },
  { tool: 'sci-consolidado', area: 'fiscal', href: '/ferramentas/fiscal/sci-consolidado', title: 'Consolidado SCI', subtitle: 'Planilha SCI → Excel', icon: Files },
  { tool: 'comparacao-planilhas', area: 'fiscal', href: '/ferramentas/fiscal/comparacao-planilhas', title: 'Comparador SEFAZ × SCI', subtitle: 'Notas faltantes no SCI', icon: Scale },
  { tool: 'comparacao-nfse', area: 'fiscal', href: '/ferramentas/fiscal/comparacao-nfse', title: 'Comparador NFS-e', subtitle: 'PDF/imagem × XML (OCR)', icon: FileSearch, badge: 'NFS-e' },
  { tool: 'sci-portal-nacional', area: 'fiscal', href: '/ferramentas/fiscal/sci-portal-nacional', title: 'Conciliador NFS-e', subtitle: 'Portal Nacional × SCI', icon: ArrowLeftRight, badge: 'NFS-e' },
  { tool: 'nfse-pdf', area: 'fiscal', href: '/ferramentas/fiscal/nfse-pdf', title: 'NFS-e → PDF', subtitle: 'XML → DANFSe (.zip)', icon: FileText, badge: 'NFS-e' },
  // ── Contábil ────────────────────────────────────────────────────────────
  { tool: 'gnre', area: 'contabil', href: '/ferramentas/contabil/gnre', title: 'Extrator GNRE', subtitle: 'Guias GNRE (PDF) → planilha', icon: Receipt },
  { tool: 'extrato-edit', area: 'contabil', href: '/ferramentas/contabil/extrato-edit', title: 'Editor de Extrato', subtitle: 'Extrato bancário (.xlsx)', icon: FileText },
]

export const toolsByArea = (area: ToolArea) => TOOLS_CATALOG.filter((t) => t.area === area)
