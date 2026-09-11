'use client'

import { cn } from '@saas/ui'

/**
 * Cabeçalho das telas de trabalho do portal.
 *
 * É o `PageHeaderBar` do sistema interno traduzido para a paleta do portal:
 * barra sangrada até as bordas, borda embaixo, título com subtítulo à esquerda
 * e as ações à direita. A tela de Documentos usava um bloco solto no meio do
 * degradê, o que deixava uma faixa azul vazia acima do título e um segundo vão
 * antes do conteúdo — dois espaços que não diziam nada.
 *
 * As margens negativas existem para desfazer o `px-5 sm:px-7 pt-8` do `<main>`
 * do layout: sem elas a barra ficaria recuada das bordas e afastada da navbar,
 * que é justamente o que se quer eliminar. O fundo sólido (o mesmo da navbar)
 * cobre o degradê no trecho da barra, e as duas viram uma peça só.
 *
 * A home do portal NÃO usa isto de propósito: lá a abertura é uma capa, com o
 * nome da empresa em destaque sobre o degradê. São papéis diferentes — uma
 * apresenta, a outra opera.
 */
export function PortalPageHeader({
  titulo, subtitulo, acoes, className,
}: {
  titulo: string
  subtitulo?: string
  acoes?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        '-mx-5 -mt-8 mb-5 sm:-mx-7',
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        'border-b border-[#e6ebf2] bg-white px-5 py-3 sm:px-7',
        'dark:border-[#1b2739] dark:bg-[#0e1726]',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* 18px, o tamanho de h1 do sistema desde a padronização da Jakarta —
            os 24px que estavam aqui eram herança da capa da home. */}
        <h1 className="truncate text-[18px] font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {titulo}
        </h1>
        {subtitulo && (
          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
            {subtitulo}
          </p>
        )}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  )
}
