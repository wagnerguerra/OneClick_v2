'use client'

import type { ReactNode } from 'react'
import {
  Settings, Shield, Database, Server, Mail, CreditCard, HardDrive,
  Globe, MessageSquare, Bot, Brain, Calendar, FileSearch, Key, Clock,
  Zap, FileSignature, Bell, Headphones, ClipboardCheck, Bookmark, BadgeCheck,
  type LucideIcon,
} from 'lucide-react'

/**
 * Ícone de cada grupo de Configurações — FONTE ÚNICA para a aba lateral e
 * para o título da seção do grupo (os dois sempre batem).
 */
export const GROUP_ICONS: Record<string, LucideIcon> = {
  'Armazenamento (S3)': HardDrive,
  'Autenticação': Shield,
  'Banco de Dados': Database,
  'Carimbo de Tempo (TSA)': Clock,
  'E-mail (SMTP)': Mail,
  'Google': Calendar,
  'Google Calendar': Calendar,
  'gov.br Assinatura': FileSignature,
  'SERPRO Neo iD': FileSignature,
  'Omie ERP': Globe,
  'OpenAI (ChatGPT)': Brain,
  'Certificados': BadgeCheck,
  'SERPRO': Key,
  'Servidor': Server,
  'Stripe': CreditCard,
  'WhatsApp': MessageSquare,
  'Captcha': Bot,
  'Dossiê e Imagens': FileSearch,
  'Abas': Bookmark,
  'Notificações': Bell,
  'HelpDesk': Headphones,
  'Acessórias': Zap,
  'Calendário': Calendar,
  'Relatório de QA': ClipboardCheck,
  'Relatório de Tickets': Headphones,
}

export const iconeDoGrupo = (grupo: string): LucideIcon => GROUP_ICONS[grupo] ?? Settings

/**
 * Título da seção de um grupo de Configurações — o mesmo estilo em todos os
 * grupos, com o ícone da aba lateral à esquerda. `children` sobrescreve o texto
 * (padrão = nome do grupo).
 */
export function TituloGrupo({ grupo, children }: { grupo: string; children?: ReactNode }) {
  const Icon = iconeDoGrupo(grupo)
  return (
    <h4 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      {children ?? grupo}
    </h4>
  )
}
