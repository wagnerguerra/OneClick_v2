'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

/**
 * Indicador visual ("flag triangular") no canto superior direito de um widget
 * em modo compacto (botão 1x1 ou 1x2). Mostra alerta quando o widget tem itens
 * vencidos ou vencendo, sem precisar abrir o conteúdo completo.
 *
 * Severidade:
 *   - 'error' (vermelho): há itens VENCIDOS / atrasados
 *   - 'warning' (âmbar): há itens VENCENDO em breve
 *   - null: sem pendência → não renderiza nada
 *
 * Cada widgetId tem sua própria lógica de query/parsing. Widgets sem conceito
 * de vencimento (ramais, calendario) simplesmente não disparam query.
 */

type Severity = 'error' | 'warning'

interface PendingState {
  severity: Severity
  count: number
  label: string
}

async function fetchPending(widgetId: string): Promise<PendingState | null> {
  try {
    switch (widgetId) {
      case 'cnd-federais': {
        const t = await (trpc.cnd as any).totalizadores.query() as { vencidas: number; vencendo: number }
        if (t.vencidas > 0) return { severity: 'error', count: t.vencidas, label: 'vencida' }
        if (t.vencendo > 0) return { severity: 'warning', count: t.vencendo, label: 'vencendo' }
        return null
      }
      case 'cnd-municipal': {
        const t = await (trpc.cnd as any).municipal.totalizadores.query() as { vencidas?: number; vencendo?: number }
        if ((t.vencidas ?? 0) > 0) return { severity: 'error', count: t.vencidas!, label: 'vencida' }
        if ((t.vencendo ?? 0) > 0) return { severity: 'warning', count: t.vencendo!, label: 'vencendo' }
        return null
      }
      case 'certificados-digitais': {
        const s = await (trpc.certificadoDigital as any).getStats.query() as { vencidos: number; vencendo30: number; vencendo60: number }
        if (s.vencidos > 0) return { severity: 'error', count: s.vencidos, label: 'vencido' }
        const vencendo = (s.vencendo30 ?? 0) + (s.vencendo60 ?? 0)
        if (vencendo > 0) return { severity: 'warning', count: vencendo, label: 'vencendo' }
        return null
      }
      case 'servicos-andamento': {
        const s = await (trpc.servico as any).getDashboardStats.query() as { atrasados: number }
        if (s.atrasados > 0) return { severity: 'error', count: s.atrasados, label: 'atrasado' }
        return null
      }
      case 'orcamentos': {
        const s = await (trpc.orcamento as any).getDashboardStats.query() as { permitido: boolean; atrasados?: number; vencendo7d?: number }
        if (!s.permitido) return null
        if ((s.atrasados ?? 0) > 0) return { severity: 'error', count: s.atrasados!, label: 'atrasado' }
        if ((s.vencendo7d ?? 0) > 0) return { severity: 'warning', count: s.vencendo7d!, label: 'vencendo' }
        return null
      }
      case 'caixa-postal': {
        const t = await trpc.caixaPostal.totalizadores.query() as { naoLidasP0?: number; naoLidasP1?: number; naoLidas?: number }
        if ((t.naoLidasP0 ?? 0) > 0) return { severity: 'error', count: t.naoLidasP0!, label: 'P0' }
        if ((t.naoLidasP1 ?? 0) > 0) return { severity: 'warning', count: t.naoLidasP1!, label: 'P1' }
        return null
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

export function CompactPendingFlag({ widgetId }: { widgetId: string }) {
  const [pending, setPending] = useState<PendingState | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPending(widgetId).then((p) => { if (!cancelled) setPending(p) })
    return () => { cancelled = true }
  }, [widgetId])

  if (!pending) return null

  // Cores hex pro SVG (não dá pra usar classes Tailwind em fill direto)
  const corFundo = pending.severity === 'error' ? '#ef4444' : '#f59e0b'
  const corContorno = pending.severity === 'error' ? '#dc2626' : '#d97706'

  return (
    <div
      className="absolute top-0 right-0 z-20 pointer-events-none"
      title={`${pending.count} ${pending.label}${pending.count > 1 ? 's' : ''}`}
      aria-label={`${pending.count} ${pending.label}${pending.count > 1 ? 's' : ''}`}
    >
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        className="drop-shadow-md animate-pulse"
        style={{ animationDuration: '2.5s' }}
      >
        {/* Triângulo no canto superior direito do botão.
            Path: do canto sup-direito, desce 26px e volta 26px à esquerda. */}
        <path
          d="M 8 0 L 34 0 L 34 26 Z"
          fill={corFundo}
          stroke={corContorno}
          strokeWidth="0.5"
        />
        {/* Ícone "!" (exclamação) dentro do triângulo */}
        <text
          x="26"
          y="11"
          textAnchor="middle"
          fontSize="11"
          fontWeight="900"
          fill="white"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          !
        </text>
      </svg>
    </div>
  )
}
