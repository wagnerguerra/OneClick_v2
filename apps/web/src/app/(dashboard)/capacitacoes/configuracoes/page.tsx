'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Check, X, Pencil } from 'lucide-react'
import { Button, Input, Card, Badge, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'


interface Metodo { id: string; nome: string; ordem: number; ativo: boolean; legacyId: number | null }

/**
 * Cadastro dos **métodos** de capacitação: Curso, Treinamento, Palestra,
 * Workshop, Seminário…
 *
 * No v1 esta lista vinha da tabela `sgq_cap_tip` — "tipo" —, mas o formulário
 * a usava no campo **Método**, enquanto o campo "Tipo" de lá era outra coisa
 * (interna/externa, chumbada no HTML). Aqui o nome segue o rótulo que o
 * usuário vê.
 */
export default function ConfiguracoesCapacitacoesPage() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'capacitacoes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerenciar = isMaster || isEmpresaMaster || subs.gerenciar === true

  const [itens, setItens] = useState<Metodo[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  const buscar = useCallback(() => {
    setLoading(true)
    ;(trpc.capacitacao as any).listarMetodos.query({ incluirInativos: true })
      .then((d: Metodo[]) => setItens(d || []))
      .catch(() => setItens([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { buscar() }, [buscar])

  async function adicionar() {
    if (novo.trim().length < 2) return
    setSalvando(true)
    try {
      // Ordem = fim da lista. Quem quiser reordenar edita o número.
      await (trpc.capacitacao as any).criarMetodo.mutate({ nome: novo.trim(), ordem: itens.length + 1, ativo: true })
      setNovo(''); buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function salvarNome(id: string) {
    if (editNome.trim().length < 2) return
    try {
      await (trpc.capacitacao as any).atualizarMetodo.mutate({ id, nome: editNome.trim() })
      setEditandoId(null); buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function alternarAtivo(m: Metodo) {
    try {
      await (trpc.capacitacao as any).atualizarMetodo.mutate({ id: m.id, ativo: !m.ativo })
      buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <BackButton href="/capacitacoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Configurações das Capacitações</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Capacitações</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Configurações das Capacitações</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5 max-w-2xl">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Métodos</h4>
          <p className="text-[11px] text-muted-foreground">Curso, Treinamento, Palestra, Workshop…</p>
        </div>

        {podeGerenciar && (
          <div className="flex items-center gap-2 mb-3">
            <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Adicionar método..."
              className="h-9 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
            <Button variant="success" size="sm" className="shrink-0" onClick={adicionar} disabled={salvando || novo.trim().length < 2}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nada cadastrado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {itens.map((m) => (
              <div key={m.id} className={cn(
                'flex items-center gap-2 rounded-md border border-border p-2 text-sm',
                m.ativo ? 'bg-muted/20' : 'bg-muted/40 opacity-70',
              )}>
                {editandoId === m.id ? (
                  <>
                    <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 text-sm"
                      autoFocus onKeyDown={(e) => { if (e.key === 'Enter') salvarNome(m.id) }} />
                    <Button size="xs" variant="success" onClick={() => salvarNome(m.id)}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="xs" variant="outline" onClick={() => setEditandoId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate">{m.nome}</span>
                    {!m.ativo && <Badge variant="outline" className="text-[10px] shrink-0">Inativo</Badge>}
                    {m.legacyId != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0" title="Número no sistema antigo">#{m.legacyId}</span>
                    )}
                    {podeGerenciar && (
                      <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                        <Button size="icon-sm" variant="soft-info" title="Renomear"
                          onClick={() => { setEditandoId(m.id); setEditNome(m.nome) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {/* Desativar, e não excluir: as capacitações que já
                            apontam para este método continuam válidas, e o
                            histórico não pode perder o rótulo da época. */}
                        <Button size="xs" variant="outline" onClick={() => alternarAtivo(m)}>
                          {m.ativo ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
