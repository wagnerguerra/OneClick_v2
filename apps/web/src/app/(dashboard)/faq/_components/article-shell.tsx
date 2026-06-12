'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@saas/ui'
import type { ComponentType, ReactNode } from 'react'

export const FAQ_COLOR = '#0891b2' // cyan-600 (cor da seção FAQ)

interface Props {
  modulo: string
  moduloColor: string
  icon: ComponentType<{ className?: string }>
  titulo: string
  descricao: string
  children: ReactNode
}

/**
 * Casca padronizada de artigo do FAQ:
 *  - Breadcrumb: [Voltar] FAQ's / <módulo>
 *  - Header no padrão dos demais módulos (h-12 rounded-[4px] com gradient)
 *  - Container responsivo (largura total)
 */
export function ArticleShell({ modulo, moduloColor, icon: Icon, titulo, descricao, children }: Props) {
  const router = useRouter()
  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          variant="ghost" size="sm"
          className="h-7 px-2 -ml-2 gap-1.5 text-xs"
          onClick={() => router.push('/faq')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />FAQ&apos;s
        </Button>
        <span>/</span>
        <span className="font-medium" style={{ color: FAQ_COLOR }}>{modulo}</span>
      </div>

      {/* Header padrão */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${moduloColor}, color-mix(in srgb, ${moduloColor} 87%, transparent))` }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h1>{titulo}</h1>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>
      </div>

      {/* Corpo do artigo — `data-faq-body` é a âncora usada pelo índice lateral
          (TOC) e pela captura de HTML na edição (artigos de sistema). */}
      <div data-faq-body className="space-y-6">{children}</div>
    </div>
  )
}
