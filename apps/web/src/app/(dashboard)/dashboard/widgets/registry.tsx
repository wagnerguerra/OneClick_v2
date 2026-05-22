'use client'

import { ComponentType } from 'react'
import { Mail, Shield, FileLock, ListChecks, Landmark, Calendar, Phone, FileText } from 'lucide-react'
import { CaixaPostalWidget } from './caixa-postal-widget'
import { CndFederaisWidget } from './cnd-federais-widget'
import { CertificadosWidget } from './certificados-widget'
import { ServicosWidget } from './servicos-widget'
import { CndMunicipalWidget } from './cnd-municipal-widget'
import { CalendarioWidget } from './calendario-widget'
import { RamaisWidget } from './ramais-widget'
import { OrcamentosWidget } from './orcamentos-widget'

export type WidgetColor = 'sky' | 'indigo' | 'fuchsia' | 'violet' | 'emerald' | 'amber'

export interface WidgetDef {
  id: string
  label: string
  icon: typeof Mail
  color: WidgetColor
  Component: ComponentType<{ canRead: boolean; title?: string; expanded?: boolean; bloco?: string }>
  /** Posição/tamanho default no grid (12 cols). h é em "rows" do grid (~30px cada). */
  defaultLayout: { w: number; h: number; minW: number; minH: number; maxH?: number }
  /** Permission slug exigido (master sempre tem acesso). */
  requiresModule?: string
  /** Override do href usado pra derivar a cor do grupo da sidebar. Útil quando
   *  o widget não tem requiresModule (ex: ramais) ou o módulo está em grupo
   *  diferente do desejado visualmente. */
  groupHref?: string
}

export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  'caixa-postal': {
    id: 'caixa-postal',
    label: 'Caixa Postal e-CAC',
    icon: Mail,
    color: 'sky',
    Component: CaixaPostalWidget,
    defaultLayout: { w: 6, h: 4, minW: 1, minH: 1 },
    requiresModule: 'caixapostal',
  },
  'cnd-federais': {
    id: 'cnd-federais',
    label: 'CND\'s Federais',
    icon: Shield,
    color: 'indigo',
    Component: CndFederaisWidget,
    defaultLayout: { w: 6, h: 4, minW: 1, minH: 1 },
    requiresModule: 'certidoes-cnd',
  },
  'certificados-digitais': {
    id: 'certificados-digitais',
    label: 'Certificados Digitais',
    icon: FileLock,
    color: 'fuchsia',
    Component: CertificadosWidget,
    defaultLayout: { w: 6, h: 4, minW: 1, minH: 1 },
    requiresModule: 'gestao-certificados',
  },
  'servicos-andamento': {
    id: 'servicos-andamento',
    label: 'Serviços em Andamento',
    icon: ListChecks,
    color: 'sky',
    Component: ServicosWidget,
    defaultLayout: { w: 6, h: 4, minW: 1, minH: 1 },
    requiresModule: 'meus-servicos',
  },
  'cnd-municipal': {
    id: 'cnd-municipal',
    label: 'CND Municipal — Validade',
    icon: Landmark,
    color: 'violet',
    Component: CndMunicipalWidget,
    defaultLayout: { w: 12, h: 8, minW: 1, minH: 1 },
    requiresModule: 'certidoes-cnd',
  },
  'calendario': {
    id: 'calendario',
    label: 'Calendário',
    icon: Calendar,
    color: 'sky',
    Component: CalendarioWidget,
    defaultLayout: { w: 8, h: 10, minW: 1, minH: 1 },
    requiresModule: 'agenda',
  },
  'ramais': {
    id: 'ramais',
    label: 'Ramais dos Colaboradores',
    icon: Phone,
    color: 'emerald',
    Component: RamaisWidget,
    defaultLayout: { w: 4, h: 8, minW: 1, minH: 1 },
    // Sem requiresModule: lookup público de ramais — qualquer user autenticado
    // do tenant pode consultar. Acesso refinado via modal "Editar widget"
    // (controle por usuários ou áreas). Endpoint backend é protectedProcedure.
    groupHref: '/colaboradores', // Cor visual do bloco Cadastros
  },
  'orcamentos': {
    id: 'orcamentos',
    label: 'Orçamentos',
    icon: FileText,
    color: 'amber',
    Component: OrcamentosWidget,
    defaultLayout: { w: 6, h: 3, minW: 2, minH: 2 },
    // Permissão de módulo + cargo gestor+ (checagem extra dentro do componente
    // via endpoint getDashboardStats, que retorna { permitido: false } pra
    // usuários sem cargo de gestão).
    requiresModule: 'orcamentos',
  },
}

/** Mapeamento de cor → classes Tailwind. Útil pra widgets que precisam estilizar pela cor. */
export const COLOR_CLASSES: Record<WidgetColor, {
  borderLeft: string; bgIcon: string; text: string
}> = {
  sky:     { borderLeft: 'border-l-sky-500',     bgIcon: 'bg-sky-50 dark:bg-sky-900/30',         text: 'text-sky-600 dark:text-sky-400' },
  indigo:  { borderLeft: 'border-l-indigo-500',  bgIcon: 'bg-indigo-50 dark:bg-indigo-900/30',   text: 'text-indigo-600 dark:text-indigo-400' },
  fuchsia: { borderLeft: 'border-l-fuchsia-500', bgIcon: 'bg-fuchsia-50 dark:bg-fuchsia-900/30', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
  violet:  { borderLeft: 'border-l-violet-500',  bgIcon: 'bg-violet-50 dark:bg-violet-900/30',   text: 'text-violet-600 dark:text-violet-400' },
  emerald: { borderLeft: 'border-l-emerald-500', bgIcon: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
  amber:   { borderLeft: 'border-l-amber-500',   bgIcon: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-600 dark:text-amber-400' },
}

/** Layout padrão exibido quando ainda não foi customizado. */
export const DEFAULT_LAYOUT: Array<{ i: string; x: number; y: number; w: number; h: number }> = [
  { i: 'caixa-postal',          x: 0, y: 0,  w: 6,  h: 4 },
  { i: 'cnd-federais',          x: 6, y: 0,  w: 6,  h: 4 },
  { i: 'certificados-digitais', x: 0, y: 4,  w: 6,  h: 4 },
  { i: 'servicos-andamento',    x: 6, y: 4,  w: 6,  h: 4 },
  { i: 'cnd-municipal',         x: 0, y: 8,  w: 12, h: 8 },
  { i: 'calendario',            x: 0, y: 16, w: 12, h: 10 },
]
