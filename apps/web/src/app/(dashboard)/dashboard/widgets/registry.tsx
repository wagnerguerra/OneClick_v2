'use client'

import { ComponentType } from 'react'
import { Mail, Shield, FileLock, ListChecks, Landmark, Calendar, CalendarClock, Phone, FileText, Megaphone, PenLine, UserPlus2, UserMinus2 } from 'lucide-react'
import { TEXT } from '@/lib/color-styles'
import { CaixaPostalWidget } from './caixa-postal-widget'
import { CndFederaisWidget } from './cnd-federais-widget'
import { CertificadosWidget } from './certificados-widget'
import { ServicosWidget } from './servicos-widget'
import { CndMunicipalWidget } from './cnd-municipal-widget'
import { CalendarioWidget } from './calendario-widget'
import { RamaisWidget } from './ramais-widget'
import { OrcamentosWidget } from './orcamentos-widget'
import { NovidadesWidget } from './novidades-widget'
import { HojeWidget } from './hoje-widget'
import { AssinarDocumentoWidget } from './assinar-documento-widget'
import { ClientesEntraramWidget, ClientesSairamWidget } from './movimentacao-clientes-widget'

export type WidgetColor = 'sky' | 'indigo' | 'fuchsia' | 'violet' | 'emerald' | 'amber' | 'rose'

export interface WidgetDef {
  id: string
  label: string
  icon: typeof Mail
  color: WidgetColor
  Component: ComponentType<{ canRead: boolean; title?: string; expanded?: boolean; bloco?: string; compact?: boolean }>
  /** Posição/tamanho default no grid (12 cols). h é em "rows" do grid (~30px cada). */
  defaultLayout: { w: number; h: number; minW: number; minH: number; maxH?: number }
  /** Permission slug exigido (master sempre tem acesso). */
  requiresModule?: string
  /**
   * Widget de AÇÃO: em 1×1 o clique dispara a ação do próprio widget (ele
   * recebe `compact` e desenha o botão), em vez de abrir o modal "ampliado" do
   * grid. Sem isso, um widget cuja única função é abrir um modal ficaria com
   * dois modais empilhados: o do grid e o dele.
   */
  acaoDireta?: boolean
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
  'hoje': {
    id: 'hoje',
    label: 'Eventos e Tarefas do Dia',
    icon: CalendarClock,
    color: 'sky',
    Component: HojeWidget,
    defaultLayout: { w: 4, h: 8, minW: 1, minH: 1 },
    // A visibilidade fina (particular / membro da tarefa) é do backend da
    // agenda; aqui só exigimos o módulo.
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
  'novidades': {
    id: 'novidades',
    label: 'Novidades do sistema',
    icon: Megaphone,
    color: 'sky',
    Component: NovidadesWidget,
    defaultLayout: { w: 4, h: 8, minW: 1, minH: 1 },
    // Sem requiresModule: as novidades são PARA todo mundo. Exigir o módulo de
    // relatórios esconderia o aviso justamente de quem ele informa. O endpoint
    // é protectedProcedure e devolve só o que foi publicado.
    groupHref: '/relatorios-ti', // cor visual do bloco TI
  },
  // Entradas e saídas são o mesmo dado visto dos dois lados: viram dois widgets
  // porque quem acompanha a carteira quer os dois lado a lado para comparar — num
  // widget só, um dos dois números sempre ficaria escondido atrás de uma aba.
  'clientes-entraram': {
    id: 'clientes-entraram',
    label: 'Clientes que entraram (90 dias)',
    icon: UserPlus2,
    color: 'emerald',
    Component: ClientesEntraramWidget,
    defaultLayout: { w: 4, h: 8, minW: 1, minH: 1 },
    requiresModule: 'clientes',
    groupHref: '/clientes',
  },
  'clientes-sairam': {
    id: 'clientes-sairam',
    label: 'Clientes que saíram (90 dias)',
    icon: UserMinus2,
    color: 'rose',
    Component: ClientesSairamWidget,
    defaultLayout: { w: 4, h: 8, minW: 1, minH: 1 },
    requiresModule: 'clientes',
    groupHref: '/clientes',
  },
  'assinar-documento': {
    id: 'assinar-documento',
    label: 'Assinar Documento',
    icon: PenLine,
    color: 'emerald',
    Component: AssinarDocumentoWidget,
    // Nasce 1×1, como os atalhos de Ramais e Certificados: é um botão, não um
    // painel. Cresce se o usuário quiser a versão com texto.
    defaultLayout: { w: 1, h: 1, minW: 1, minH: 1, maxH: 6 },
    acaoDireta: true,
    // O módulo abre a porta; a sub-permissão `assinar` é conferida dentro do
    // componente e no backend — ver o comentário do widget.
    requiresModule: 'ferramentas-gerais',
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
  sky:     { borderLeft: 'border-l-sky-500',     bgIcon: 'bg-sky-50 dark:bg-sky-900/30',         text: TEXT.sky },
  indigo:  { borderLeft: 'border-l-indigo-500',  bgIcon: 'bg-indigo-50 dark:bg-indigo-900/30',   text: TEXT.indigo },
  fuchsia: { borderLeft: 'border-l-fuchsia-500', bgIcon: 'bg-fuchsia-50 dark:bg-fuchsia-900/30', text: TEXT.fuchsia },
  violet:  { borderLeft: 'border-l-violet-500',  bgIcon: 'bg-violet-50 dark:bg-violet-900/30',   text: TEXT.violet },
  emerald: { borderLeft: 'border-l-emerald-500', bgIcon: 'bg-emerald-50 dark:bg-emerald-900/30', text: TEXT.emerald },
  amber:   { borderLeft: 'border-l-amber-500',   bgIcon: 'bg-amber-50 dark:bg-amber-900/30',     text: TEXT.amber },
  rose:    { borderLeft: 'border-l-rose-500',    bgIcon: 'bg-rose-50 dark:bg-rose-900/30',       text: TEXT.rose },
}

/** Layout padrão exibido quando ainda não foi customizado. */
export const DEFAULT_LAYOUT: Array<{ i: string; x: number; y: number; w: number; h: number }> = [
  { i: 'caixa-postal',          x: 0, y: 0,  w: 6,  h: 4 },
  { i: 'cnd-federais',          x: 6, y: 0,  w: 6,  h: 4 },
  { i: 'certificados-digitais', x: 0, y: 4,  w: 6,  h: 4 },
  { i: 'servicos-andamento',    x: 6, y: 4,  w: 6,  h: 4 },
  { i: 'cnd-municipal',         x: 0, y: 8,  w: 12, h: 8 },
  { i: 'calendario',            x: 0, y: 16, w: 12, h: 10 },
  { i: 'novidades',             x: 0, y: 26, w: 4,  h: 8 },
  { i: 'clientes-entraram',     x: 4, y: 26, w: 4,  h: 8 },
  { i: 'clientes-sairam',       x: 8, y: 26, w: 4,  h: 8 },
]
