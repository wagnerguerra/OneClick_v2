'use client'

import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'

import { trpc } from '@/lib/trpc'
import { BiClienteDashboard, type FonteBiCliente } from '@/components/bi-cliente/bi-cliente-dashboard'
import { usePortal } from '../../_lib/contexto'
import { PortalPageHeader } from '../../_components/portal-page-header'

/**
 * Dashboard Financeiro, dentro do portal do cliente.
 *
 * A tela é a mesma da versão por link (`BiClienteDashboard`); muda a porta. Aqui
 * a pessoa está logada, e cada busca passa pelo `portalModuloProcedure('bi')`:
 * módulo `bi` ligado para a empresa E `podeVerBi` no vínculo dela. O servidor
 * lê o cliente do VÍNCULO, nunca deste `clienteId` — ele só serve para o
 * portal saber qual vínculo resolver.
 *
 * A checagem aqui na tela é só para não mostrar a casca vazia a quem digitou a
 * URL sem ter o módulo: a recusa de verdade vem das rotas.
 */
export default function PortalBiPage() {
  const { clienteId, vinculo } = usePortal()
  const liberado = !!vinculo?.modulos.includes('bi')

  const fonte = useMemo<FonteBiCliente>(() => ({
    // Trocar de empresa no seletor troca o cliente — e recarrega tudo.
    chave: clienteId,
    anos: () => (trpc.portal as any).bi.anos.query({ clienteId }) as Promise<number[]>,
    kpis: (ano, meses) => (trpc.portal as any).bi.kpis.query({ clienteId, ano, meses }),
    analise: (ano, meses) => (trpc.portal as any).bi.analise.query({ clienteId, ano, meses }),
    matriz: ano => (trpc.portal as any).bi.matriz.query({ clienteId, ano }),
  }), [clienteId])

  return (
    <>
      <PortalPageHeader
        titulo="Dashboard Financeiro"
        subtitulo="Receita, custos, despesas e resultado da sua empresa, mês a mês."
      />
      {!vinculo ? null : !liberado ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-6 py-14 text-center">
          <BarChart3 className="h-9 w-9 text-muted-foreground/60" />
          <p className="text-sm font-semibold text-foreground">Dashboard não disponível</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            O acesso ao Dashboard Financeiro é liberado pelo escritório. Se você precisa dele,
            fale com a sua equipe.
          </p>
        </div>
      ) : (
        <BiClienteDashboard fonte={fonte} />
      )}
    </>
  )
}
