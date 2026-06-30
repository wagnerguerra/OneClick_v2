import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FileSpreadsheet, FileCode, Files, Scale, ArrowLeftRight, Receipt, GitMerge, FileSearch } from 'lucide-react'
import { SpedSheetSelector } from '../_components/sped-sheet-selector'

/** Painel extra opcional por ferramenta (ex.: seleção de abas do SPED). */
export interface ToolExtrasProps {
  files: Record<string, File[]>
  color: string
  /** Reporta campos de texto extras a enviar no multipart (ex.: sheets/presentRegs). */
  onFields: (fields: Record<string, string>) => void
  /** Bloqueia o envio enquanto inválido/carregando. */
  onBlock: (blocked: boolean) => void
}

// Config de UI por ferramenta. O backend já é genérico (proxy → webapp);
// aqui descrevemos só o que muda na tela (entradas, textos, passos).
// Ferramentas com fluxo especial (comparacao-nfse multi-step, sped-merge
// inspect-xlsx) terão páginas próprias.

export interface ToolInput {
  field: string
  label: string
  accept: string
  multiple: boolean
  hint?: string
  /** Entrada opcional — não bloqueia o envio se vazia. */
  optional?: boolean
}

export interface ToolUiConfig {
  tool: string
  area: 'fiscal' | 'contabil'
  icon: LucideIcon
  title: string
  subtitle: string
  inputs: ToolInput[]
  steps: { t: string; d: string }[]
  note?: string
  submitLabel?: string
  /** Painel extra entre o upload e o botão (ex.: seleção de abas no SPED). */
  Extras?: ComponentType<ToolExtrasProps>
}

export const TOOL_UI: Record<string, ToolUiConfig> = {
  sped: {
    tool: 'sped',
    area: 'fiscal',
    icon: FileSpreadsheet,
    title: 'SPED → XLSX',
    subtitle: 'Converta a escrituração fiscal (.txt) em planilha formatada — em segundos.',
    inputs: [{ field: 'file', label: 'Arquivo SPED', accept: '.txt', multiple: false, hint: 'EFD ICMS/IPI · Contribuições' }],
    Extras: SpedSheetSelector,
    submitLabel: 'Gerar planilha',
    steps: [
      { t: 'Selecione o SPED', d: 'Arquivo .txt da escrituração fiscal.' },
      { t: 'Escolha as abas', d: 'Marque os registros que viram abas (0150, C100, …).' },
      { t: 'Baixe a planilha', d: 'XLSX formatado, pronto pra conferência.' },
    ],
    note: 'A planilha inclui a coluna _LINHA com o número da linha no arquivo original.',
  },

  nfe: {
    tool: 'nfe',
    area: 'fiscal',
    icon: FileCode,
    title: 'NFe XML → XLSX',
    subtitle: 'Extraia os itens das notas fiscais eletrônicas para uma planilha consolidada.',
    inputs: [{ field: 'arquivos', label: 'XMLs de NFe', accept: '.xml,.zip', multiple: true, hint: 'Vários .xml ou um .zip com XMLs' }],
    steps: [
      { t: 'Selecione os XMLs', d: 'Um ou vários .xml, ou um .zip.' },
      { t: 'Processamos', d: 'Itens consolidados por emitente.' },
      { t: 'Baixe a planilha', d: 'XLSX com os itens das notas.' },
    ],
  },

  'sci-consolidado': {
    tool: 'sci-consolidado',
    area: 'fiscal',
    icon: Files,
    title: 'Consolidado SCI',
    subtitle: 'Transforme a exportação do SCI em ProdutosSCI.xlsx consolidado.',
    inputs: [{ field: 'file', label: 'Exportação SCI', accept: '.csv,.txt,.xlsx,.xls', multiple: false, hint: 'CSV, TXT ou Excel' }],
    steps: [
      { t: 'Selecione a exportação', d: 'Arquivo exportado do SCI.' },
      { t: 'Processamos', d: 'Consolidação automática em 3 abas.' },
      { t: 'Baixe a planilha', d: 'ProdutosSCI.xlsx pronto.' },
    ],
  },

  'comparacao-planilhas': {
    tool: 'comparacao-planilhas',
    area: 'fiscal',
    icon: Scale,
    title: 'Comparador SEFAZ × SCI',
    subtitle: 'Identifique as notas que estão no SEFAZ mas faltam no SCI.',
    submitLabel: 'Comparar planilhas',
    inputs: [
      { field: 'sefaz', label: 'Planilhas SEFAZ', accept: '.csv,.xlsx,.xls', multiple: true, hint: 'Um ou mais arquivos do SEFAZ' },
      { field: 'sci', label: 'Planilhas SCI', accept: '.csv,.xlsx,.xls', multiple: true, hint: 'Um ou mais arquivos do SCI' },
    ],
    steps: [
      { t: 'Envie SEFAZ e SCI', d: 'Um ou mais arquivos em cada campo.' },
      { t: 'Comparamos', d: 'Cruzamento das notas entre as bases.' },
      { t: 'Baixe o resultado', d: 'Notas Faltantes.xlsx.' },
    ],
  },

  'sci-portal-nacional': {
    tool: 'sci-portal-nacional',
    area: 'fiscal',
    icon: ArrowLeftRight,
    title: 'Conciliador NFS-e',
    subtitle: 'Concilie o SCI com o extrato do Portal Nacional (conciliação multi-aba).',
    submitLabel: 'Conciliar',
    inputs: [
      { field: 'sci', label: 'Planilha SCI', accept: '.csv,.xlsx,.xls', multiple: false },
      { field: 'portal', label: 'Planilha Portal Nacional', accept: '.csv,.xlsx,.xls', multiple: false },
    ],
    steps: [
      { t: 'Envie SCI e Portal', d: 'Uma planilha em cada campo.' },
      { t: 'Conciliamos', d: 'Em ambas, só num lado, canceladas, duplicados.' },
      { t: 'Baixe o resultado', d: 'Conciliação SCI x Portal Nacional.xlsx.' },
    ],
  },

  'sped-merge': {
    tool: 'sped-merge',
    area: 'fiscal',
    icon: GitMerge,
    title: 'XLSX → SPED (merge)',
    subtitle: 'Mescle a planilha editada de volta no arquivo SPED original (.txt).',
    submitLabel: 'Gerar SPED',
    inputs: [
      { field: 'xlsx', label: 'Planilha editada (.xlsx)', accept: '.xlsx,.xlsm', multiple: false, hint: 'A planilha exportada (com a coluna _LINHA)' },
      { field: 'sped', label: 'SPED original (.txt) — opcional', accept: '.txt', multiple: false, optional: true, hint: 'Necessário se a planilha for parcial/dinâmica' },
    ],
    steps: [
      { t: 'Envie a planilha', d: 'O .xlsx exportado e editado.' },
      { t: 'Mesclamos', d: 'As linhas são reaplicadas no SPED, preservando o resto.' },
      { t: 'Baixe o SPED', d: 'SPED_mesclado.txt pronto.' },
    ],
    note: 'Se a planilha for parcial/dinâmica, envie também o SPED original (.txt).',
  },

  'comparacao-nfse': {
    tool: 'comparacao-nfse',
    area: 'fiscal',
    icon: FileSearch,
    title: 'Comparador NFS-e (OCR)',
    subtitle: 'Compare PDFs/imagens de NFS-e com os XMLs, com OCR via IA.',
    submitLabel: 'Comparar',
    inputs: [
      { field: 'pdfs', label: 'PDFs / imagens', accept: '.pdf,.jpg,.jpeg,.png', multiple: true, hint: 'Notas em PDF ou imagem' },
      { field: 'xmls', label: 'XMLs', accept: '.xml', multiple: true, hint: 'XMLs das NFS-e' },
    ],
    steps: [
      { t: 'Envie PDFs e XMLs', d: 'As notas e os XMLs correspondentes.' },
      { t: 'Comparamos', d: 'OCR nos PDFs (IA) e cruzamento com os XMLs.' },
      { t: 'Baixe o resultado', d: 'Planilha com as divergências.' },
    ],
    note: 'PDFs ilegíveis passam por OCR (Gemini). Em pico de uso pode haver espera.',
  },

  gnre: {
    tool: 'gnre',
    area: 'contabil',
    icon: Receipt,
    title: 'Extrator GNRE',
    subtitle: 'Extraia os dados das guias GNRE (PDF) para uma planilha, com dedupe.',
    submitLabel: 'Extrair dados',
    inputs: [{ field: 'pdfs', label: 'Guias GNRE (PDF)', accept: '.pdf', multiple: true, hint: 'Vários PDFs de guias' }],
    steps: [
      { t: 'Selecione os PDFs', d: 'Guias GNRE em PDF.' },
      { t: 'Extraímos', d: 'Valores, datas e números; duplicados são detectados.' },
      { t: 'Baixe a planilha', d: 'GNRE_Extracao.xlsx (Lançamentos + Falhas).' },
    ],
  },
}
