'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { usePainelTv } from '@/hooks/use-painel-tv'
import { TvKiosk, type TvSlide } from '@/components/tv/kiosk'
import { FolhaGrid } from '@/components/tv/bloco-view'

/**
 * Renderer genérico dos Painéis de Gestão à Vista (TV).
 * Lê a config do painel pela slug + os dados resolvidos do catálogo e monta
 * as folhas (slides) com o grid de blocos, sobre o shell TvKiosk.
 */
export default function PainelTvDinamicoPage() {
  const params = useParams()
  const slug = String(params?.slug ?? '')
  const { painel, data, loading, erro, updatedAt } = usePainelTv(slug)

  const slides = useMemo<TvSlide[]>(() => {
    if (!painel) return []
    return [...painel.folhas]
      .sort((a, b) => a.ordem - b.ordem)
      .map((f) => ({ key: f.id, title: f.titulo, node: <FolhaGrid folha={f} data={data} /> }))
  }, [painel, data])

  return (
    <TvKiosk
      accent={painel?.accent ?? '#22d3ee'}
      title={painel?.nome ?? 'Painel'}
      slides={slides}
      loading={loading}
      erro={erro || (!loading && !painel)}
      updatedAt={updatedAt}
      periodLabel={painel ? `período ${painel.periodoDias} dias` : undefined}
      slideMs={painel?.slideMs ?? 18000}
    />
  )
}
