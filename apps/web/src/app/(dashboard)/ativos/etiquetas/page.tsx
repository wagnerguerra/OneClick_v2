'use client'

/**
 * Página de impressão de etiquetas com QR code dos ativos.
 *
 * Uso: /ativos/etiquetas?ids=id1,id2,id3
 *
 * Renderiza grid 3×N em A4 (12 etiquetas por página) com tag + nome + QR
 * apontando pra URL do ativo. Print-friendly via @media print: esconde header
 * do dashboard, sidebar e toolbar; mostra só a folha.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@saas/ui'
import { Printer, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'

interface AtivoEtiqueta {
  id: string
  tag: string
  nome: string
  fabricante: string | null
  modelo: string | null
}

export default function EtiquetasPage() {
  const params = useSearchParams()
  const idsParam = params.get('ids') ?? ''
  const ids = idsParam.split(',').filter(Boolean)
  const [ativos, setAtivos] = useState<AtivoEtiqueta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      if (ids.length === 0) { setLoading(false); return }
      try {
        // Busca um por vez (simples; pode otimizar pra batch depois)
        const results = await Promise.all(
          ids.map(id => (trpc.ativo as any).getById.query({ id }).catch(() => null)),
        )
        setAtivos(
          results
            .filter(Boolean)
            .map(a => ({
              id: a.id, tag: a.tag, nome: a.nome,
              fabricante: a.fabricante, modelo: a.modelo,
            })),
        )
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <>
      {/* CSS print-friendly — esconde tudo do dashboard, mostra só a folha */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; }
          aside, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .etiquetas-folha { box-shadow: none !important; border: 0 !important; }
        }
        .etiqueta {
          border: 1px dashed #cbd5e1;
          padding: 8px;
          break-inside: avoid;
          height: 70mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
      ` }} />

      <div className="space-y-3">
        {/* Topo — PADRAO_PAGINAS §1.1 */}
        <PageHeaderBar className="no-print" actions={<>
            <Button onClick={() => window.print()} className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <BackButton href="/ativos" />
        </>}>
          <h1 className="truncate">Etiquetas QR Code</h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
            <span className="text-muted-foreground/50">›</span>
            <span>TI</span>
            <span className="text-muted-foreground/50">›</span>
            <span>Gestão de Ativos</span>
            <span className="text-muted-foreground/50">›</span>
            <span>Etiquetas QR Code</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{loading ? 'Carregando...' : `${ativos.length} etiqueta${ativos.length === 1 ? '' : 's'} prontas pra impressão`}</span>
          </div>
        </PageHeaderBar>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando etiquetas...
          </div>
        ) : ativos.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Nenhum ativo encontrado. Volte e selecione ativos pra imprimir.
          </div>
        ) : (
          <div className="etiquetas-folha bg-white p-6 rounded-md shadow-sm border">
            {/* Grid 3 colunas — A4 tem ~180mm úteis, 3×60mm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ativos.map(a => (
                <div key={a.id} className="etiqueta">
                  <div>
                    <div className="font-mono text-xs font-bold text-sky-700">{a.tag}</div>
                    <div className="text-[11px] font-semibold leading-tight mt-1 line-clamp-2">{a.nome}</div>
                    {(a.fabricante || a.modelo) && (
                      <div className="text-[9px] text-slate-500 mt-0.5 line-clamp-1">
                        {[a.fabricante, a.modelo].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-[8px] text-slate-400 leading-tight">
                      Escaneie para ver detalhes do ativo
                    </div>
                    <QRCodeSVG
                      value={`${baseUrl}/ativos/${a.id}`}
                      size={64}
                      level="M"
                      marginSize={0}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
