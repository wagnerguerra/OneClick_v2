'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@saas/ui'
import type { ComponentType, ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'
import { FaqToc } from './faq-toc'

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
      {/* Header padrão do sistema (PageHeader) */}
      <PageHeader
        color={moduloColor}
        icon={Icon}
        title={titulo}
        subtitle={descricao}
        breadcrumb={(
          <>
            <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 gap-1.5 text-xs" onClick={() => router.push('/faq')}>
              <ArrowLeft className="h-3.5 w-3.5" />FAQ&apos;s
            </Button>
            <span>/</span>
            <span className="font-medium" style={{ color: moduloColor }}>{modulo}</span>
          </>
        )}
      />

      {/* 2 colunas: índice lateral (TOC) sticky à esquerda + corpo do artigo.
          `data-faq-body` é a âncora usada pelo TOC e pela captura de HTML na
          edição (artigos de sistema). Em telas estreitas o TOC fica oculto. */}
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <FaqToc cor={moduloColor} className="hidden lg:block lg:sticky lg:top-4 self-start" />
        <div data-faq-body className="space-y-6 min-w-0">{children}</div>
      </div>
    </div>
  )
}
