import type { ComponentType } from 'react'
import {
  HelpCircle, Workflow, Target, Handshake, UserCog, CreditCard, Mail, Shield,
  Landmark, MailWarning, ListChecks, BadgeCheck, CircleUser, BarChart2,
  Calculator, FileText, Star, Calendar, Users, Building2, LayoutGrid,
  FileSpreadsheet, Layers, Truck, Factory, Cpu, Store, Briefcase, HardHat,
  Radio, GraduationCap, Headphones, Receipt, CalendarDays, ClipboardCheck,
  Database, FolderKanban, FileSignature, Bell, Wallet, Settings2, Lock, Send,
} from 'lucide-react'

/**
 * Mapa nome→componente de ícone do FAQ. O artigo do banco guarda o `icon` como
 * string; aqui resolvemos pro componente lucide. Inclui todos os ícones usados
 * pelos artigos de sistema + alguns extras pro seletor do editor.
 */
export const iconByName: Record<string, ComponentType<{ className?: string }>> = {
  HelpCircle, Workflow, Target, Handshake, UserCog, CreditCard, Mail, Shield,
  Landmark, MailWarning, ListChecks, BadgeCheck, CircleUser, BarChart2,
  Calculator, FileText, Star, Calendar, Users, Building2, LayoutGrid,
  FileSpreadsheet, Layers, Truck, Factory, Cpu, Store, Briefcase, HardHat,
  Radio, GraduationCap, Headphones, Receipt, CalendarDays, ClipboardCheck,
  Database, FolderKanban, FileSignature, Bell, Wallet, Settings2, Lock, Send,
}

/** Resolve o ícone por nome, com fallback p/ HelpCircle. */
export function resolveFaqIcon(name?: string | null): ComponentType<{ className?: string }> {
  return (name && iconByName[name]) || HelpCircle
}

/** Nomes disponíveis no seletor de ícone do editor. */
export const FAQ_ICON_NAMES = Object.keys(iconByName)
