'use client'

/**
 * Escolha do cliente que alimenta o simulador.
 *
 * A busca vai ao SERVIDOR a cada digitação (com espera de 350ms), em vez de
 * filtrar uma lista já baixada. O endpoint devolve no máximo 100 clientes; com
 * filtro local, quem estivesse fora dessa fatia simplesmente não apareceria —
 * e o usuário concluiria que o cliente não existe.
 *
 * O recorte é do endpoint e não daqui: `situacao = 'MENSAL'`, status diferente
 * de inativo e `empresa_id` do contexto. Cliente de outro tenant não chega.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Loader2, Check, ChevronDown, X } from 'lucide-react'
import { Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

export interface ClienteSimulador {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string | null
  tributacao: string | null
  cnaePrincipal: string | null
  uf?: string | null
  cidade?: string | null
  faturamento12m: number
  /** Faturamento MENSAL do parâmetro de contrato — a consulta ao SCI que a
   *  Gestão de Contratos usa. Zero quando o cliente não tem parâmetro. */
  faturamentoContrato: number
}

/** 12.345.678/0001-90 */
function documentoBR(v: string | null): string {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length !== 14) return v ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function SeletorCliente({ selecionado, onSelecionar }: {
  selecionado: ClienteSimulador | null
  onSelecionar: (c: ClienteSimulador | null) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<ClienteSimulador[]>([])
  const [carregando, setCarregando] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)

  const buscar = useCallback(async (termo: string) => {
    setCarregando(true)
    try {
      const r = await (trpc.reformaTributaria as never as {
        clientes: { query: (i: { busca?: string; limit?: number }) => Promise<ClienteSimulador[]> }
      }).clientes.query({ busca: termo || undefined, limit: 100 })
      setItens(r)
    } catch { setItens([]) }
    finally { setCarregando(false) }
  }, [])

  // Espera a digitação parar: sem isso, "adria" dispara cinco consultas e a
  // resposta da terceira pode chegar depois da quinta.
  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => { void buscar(busca) }, 350)
    return () => clearTimeout(t)
  }, [aberto, busca, buscar])

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  return (
    <div ref={caixaRef} className="relative w-full sm:w-[300px]">
      {selecionado && !aberto ? (
        <button
          type="button"
          onClick={() => { setAberto(true); setBusca('') }}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-left transition-colors hover:bg-muted/40"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{selecionado.razaoSocial}</p>
            {selecionado.documento && (
              <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                {documentoBR(selecionado.documento)}
              </p>
            )}
          </div>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Limpar seleção"
            onClick={(e) => { e.stopPropagation(); onSelecionar(null) }}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={aberto}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onFocus={() => setAberto(true)}
            placeholder="Buscar cliente por nome ou CNPJ…"
            className="h-10 pl-9 text-sm"
          />
          {carregando && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {aberto && (
        <div className="nice-scrollbar absolute z-50 mt-1 max-h-[320px] w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {carregando && itens.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Buscando…</p>
          ) : itens.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {busca ? 'Nenhum cliente mensal ativo com esse termo.' : 'Digite para buscar.'}
            </p>
          ) : (
            itens.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelecionar(c); setAberto(false); setBusca('') }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50',
                  selecionado?.id === c.id && 'bg-muted/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{c.razaoSocial}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[documentoBR(c.documento), c.cidade && c.uf ? `${c.cidade}/${c.uf}` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                {selecionado?.id === c.id && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
