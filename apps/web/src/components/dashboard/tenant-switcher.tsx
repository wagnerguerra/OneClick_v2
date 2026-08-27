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
/** "CENTRAL CONTABIL LTDA" → "Central contabil ltda" (pedido do Wagner, 20/08). */
function capitalizarNome(nome: string): string {
  const baixo = nome.toLocaleLowerCase('pt-BR')
  return baixo.charAt(0).toLocaleUpperCase('pt-BR') + baixo.slice(1)
}

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
        className={cn(
          'flex max-w-[140px] items-center gap-1.5 rounded-lg px-2 h-9 text-sm font-medium text-left transition-colors outline-none sm:max-w-[280px] sm:px-2.5',
          aberto ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary',
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        {/* No celular fica só o ícone: o nome da empresa levava 197px de um
            header de 375px. Quem precisa trocar abre e vê a lista inteira. */}
        <span className="hidden truncate sm:inline">
          {capitalizarNome(empresa.razaoSocial)}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
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
