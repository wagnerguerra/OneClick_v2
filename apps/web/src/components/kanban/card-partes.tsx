'use client'

/**
 * Peças do card de kanban compartilhadas pelos quadros de /orcamentos e /crm,
 * para os dois terem o mesmo desenho: cabeçalho com logo + badges, corpo em
 * linhas com ícone e rodapé com contadores e o relógio.
 */

import { useState, type ReactElement, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@saas/ui'
import type { LucideIcon } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api-url'

/** Linha do corpo do card: ícone fixo à esquerda + conteúdo numa linha só. */
export function LinhaCard({ icone: Icone, children }: { icone: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

/** Logo do cliente (cadastro); sem logo (ou se a imagem falhar), a inicial num quadrado neutro. */
export function LogoCliente({ nome, logoUrl }: { nome?: string | null; logoUrl?: string | null }) {
  const [falhou, setFalhou] = useState(false)
  const src = logoUrl && !falhou ? resolveAssetUrl(logoUrl) : ''
  if (src) {
    return <img src={src} alt="" onError={() => setFalhou(true)} className="h-6 w-6 shrink-0 rounded-md border border-border/60 bg-white object-contain" />
  }
  const inicial = (nome || '?').trim().charAt(0).toUpperCase()
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{inicial}</span>
  )
}

/** Avatar pequeno de pessoa na linha do corpo (foto ou iniciais). */
export function AvatarPequeno({ user }: { user: { name?: string | null; image?: string | null } }) {
  const iniciais = (user.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return user.image ? (
    <img src={resolveAssetUrl(user.image)} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground">{iniciais}</span>
  )
}

/**
 * Tooltip dos ícones do card (título em negrito + explicação). Radix em vez de
 * `title`: o nativo demora, tem outro visual e é cortado pelas colunas com
 * rolagem.
 */
export function DicaIcone({ titulo, texto, children }: { titulo: string; texto: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="tooltip-fade text-[11px]">
        <p className="font-semibold">{titulo}</p>
        <p>{texto}</p>
      </TooltipContent>
    </Tooltip>
  )
}
