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
    // Altura fixa = viewport - (Header 56px + TabBar 42px). Sangra até as bordas
    // do <main> (-mx/-mt/-mb). Header + índice ficam fixos; rola só o miolo.
    <div
      className="flex flex-col overflow-hidden -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 -mb-4 sm:-mb-6"
      style={{ height: 'calc(100dvh - 98px)' }}
    >
      {/* Header padrão do sistema (PageHeader) — sem bleed (o container já sangra) */}
      <div className="shrink-0">
        <PageHeader
          bleed={false}
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
      </div>

      {/* 2 colunas: índice lateral (TOC, fixo) + corpo (rola).
          `data-faq-body` é a âncora usada pelo TOC e pela captura de HTML na
          edição (artigos de sistema). Em telas estreitas o TOC fica oculto. */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 pt-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 overflow-hidden">
        <FaqToc cor={moduloColor} className="hidden lg:block self-start max-h-full overflow-y-auto nice-scrollbar" />
        <div data-faq-body className="space-y-6 min-w-0 h-full overflow-y-auto nice-scrollbar pb-10 pr-1">{children}</div>
      </div>
    </div>
  )
}
