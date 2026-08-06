'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, ChevronDown, Check, Loader2 } from 'lucide-react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'

interface EmpresaOpcao {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
}

/**
 * Qual tenant está carregada — e como trocar.
 *
 * Só aparece para o master global, que é o único que enxerga mais de uma. Para
 * os demais existe uma empresa só, e um seletor de um item é ruído.
 *
 * O motivo de existir: o master via, num mesmo select, as áreas e os usuários
 * de todas as tenants misturados — "Comercial" aparecia duas vezes, sem dizer
 * de qual empresa era cada uma. Agora as listas seguem a empresa ativa, e é
 * aqui que se diz qual é, e se troca.
 *
 * A troca é SERVER-AUTHORITATIVE: `setActiveEmpresa` grava no servidor, que é
 * a mesma fonte que alimenta o contexto e as permissões. Depois recarrega a
 * página inteira — meia dúzia de telas já teriam carregado dados da empresa
 * anterior, e atualizá-las uma a uma deixaria sobras.
 */
export function TenantSwitcher() {
  const { isMaster } = useUserPermissions()
  const { empresa } = useEmpresaAtiva()

  const [aberto, setAberto] = useState(false)
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([])
  const [trocando, setTrocando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) {
        setAberto(false)
        setBusca('')
      }
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  useEffect(() => {
    if (!aberto || empresas.length > 0) return
    ;(trpc.empresa as any).listForSelect.query()
      .then((r: EmpresaOpcao[]) => setEmpresas(r ?? []))
      .catch(() => setEmpresas([]))
  }, [aberto, empresas.length])

  if (!isMaster || !empresa) return null

  async function trocar(id: string) {
    if (id === empresa?.id) { setAberto(false); return }
    setTrocando(id)
    try {
      await (trpc.empresa as any).setActiveEmpresa.mutate({ empresaId: id })
      // Recarrega tudo: o contexto do servidor mudou, e cada tela já carregada
      // está com dados da empresa anterior.
      window.location.reload()
    } catch (e) {
      await alerts.error('Não foi possível trocar', (e as Error).message)
      setTrocando(null)
    }
  }

  const filtradas = busca.trim()
    ? empresas.filter(e => `${e.razaoSocial} ${e.nomeFantasia ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))
    : empresas

  return (
    <div ref={caixaRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        title="Empresa carregada — clique para trocar"
        className="flex max-w-[260px] items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-left transition-colors hover:bg-muted/60"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[12.5px] font-medium">
          {empresa.razaoSocial}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="border-b border-border/60 p-1.5">
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar empresa..."
              className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
            />
          </div>
          <div className="nice-scrollbar max-h-72 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {empresas.length === 0 ? 'Carregando...' : 'Nenhuma empresa encontrada'}
              </p>
            ) : filtradas.map(e => {
              const atual = e.id === empresa.id
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => trocar(e.id)}
                  disabled={!!trocando}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted',
                    atual && 'bg-muted/50',
                  )}
                >
                  {trocando === e.id
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    : atual
                      ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      : <span className="w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.razaoSocial}</span>
                    {e.nomeFantasia && e.nomeFantasia !== e.razaoSocial && (
                      <span className="block truncate text-[11px] text-muted-foreground">{e.nomeFantasia}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
