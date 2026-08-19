'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Plus, Loader2, Check, X, Pencil } from 'lucide-react'
import { Button, Input, Card, Badge, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Origem { id: string; nome: string; ordem: number; ativo: boolean; legacyId: number | null }

/**
 * Cadastro das **origens** de NC: Auditoria, Reclamação de Cliente, Falha em Processo…
 *
 * No v1 já era tabela (`sgq_nc_ori`) — aqui só ganhou tela de gestão.
 */
export default function ConfiguracoesNaoConformidadesPage() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'nao-conformidades')
  const podeGerenciar = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true

  const [itens, setItens] = useState<Origem[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  const buscar = useCallback(() => {
    setLoading(true)
    ;(trpc.naoConformidade as any).listarOrigens.query({ todas: true })
      .then((d: Origem[]) => setItens(d || []))
      .catch(() => setItens([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { buscar() }, [buscar])

  async function adicionar() {
    if (novo.trim().length < 2) return
    setSalvando(true)
    try {
      // Ordem = fim da lista. Quem quiser reordenar edita o número.
      await (trpc.naoConformidade as any).criarOrigem.mutate({ nome: novo.trim() })
      setNovo(''); buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function salvarNome(id: string) {
    if (editNome.trim().length < 2) return
    try {
      await (trpc.naoConformidade as any).atualizarOrigem.mutate({ id, nome: editNome.trim() })
      setEditandoId(null); buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function alternarAtivo(m: Origem) {
    try {
      await (trpc.naoConformidade as any).atualizarOrigem.mutate({ id: m.id, ativo: !m.ativo })
      buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1>Configurações das Não Conformidades</h1>
            <p className="text-sm text-muted-foreground">Origens disponíveis no registro de não conformidades</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/nao-conformidades" label="Voltar" />
        </div>
      </div>

      <Card className="p-5 max-w-2xl">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Origens</h4>
          <p className="text-[11px] text-muted-foreground">Auditoria, Reclamação de Cliente, Falha em Processo…</p>
        </div>

        {podeGerenciar && (
          <div className="flex items-center gap-2 mb-3">
            <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Adicionar origem..."
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
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon-sm" variant="soft-info" title="Renomear"
                          onClick={() => { setEditandoId(m.id); setEditNome(m.nome) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {/* Desativar, e não excluir: as NCs antigas continuam
                            apontando a origem e o histórico mantém o rótulo. */}
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
