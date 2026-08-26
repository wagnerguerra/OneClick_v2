'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Plus, Loader2, Check, X, Pencil } from 'lucide-react'
import {
  Button, Input, Card, Badge, cn,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Item { id: string; nome: string; ordem: number; ativo: boolean; legacyId: number | null }

/**
 * Cadastro das duas listas do módulo: **tipos de documento** (Procedimento,
 * Formulário, Doc Corporativo…) e o **mapa de processos** da ISO.
 *
 * Existe porque o tipo deixou de ser lista fixa no código — a relação cresce
 * (Instrução de Trabalho, Política, Manual) e acrescentar não pode depender de
 * deploy. Item em uso não se apaga: desativa-se, e some dos seletores sem
 * quebrar os documentos que já apontam para ele.
 */
export default function ConfiguracoesDocumentosPage() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'documentos-internos')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerenciar = isMaster || isEmpresaMaster || subs.gerenciar === true

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1>Configurações dos Documentos</h1>
            <p className="text-sm text-muted-foreground">Tipos de documento e mapa de processos</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <BackButton href="/documentos-internos" label="Voltar" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListaCadastro
          titulo="Tipos de documento"
          descricao="Aparecem no seletor de tipo do documento."
          carregar={() => (trpc.documentoInterno as any).listarTipos.query({ incluirInativos: true })}
          criar={(nome, ordem) => (trpc.documentoInterno as any).criarTipo.mutate({ nome, ordem, ativo: true })}
          atualizar={(dados) => (trpc.documentoInterno as any).atualizarTipo.mutate(dados)}
          podeGerenciar={podeGerenciar}
        />
        <ListaCadastro
          titulo="Mapa de processos"
          descricao="Os processos da ISO aos quais o documento pertence."
          carregar={() => (trpc.documentoInterno as any).listarProcessos.query({ incluirInativos: true })}
          criar={(nome, ordem) => (trpc.documentoInterno as any).criarProcesso.mutate({ nome, ordem, ativo: true })}
          atualizar={(dados) => (trpc.documentoInterno as any).atualizarProcesso.mutate(dados)}
          podeGerenciar={podeGerenciar}
        />
      </div>
    </div>
  )
}

/** As duas listas têm exatamente o mesmo comportamento — daí um componente só. */
function ListaCadastro({ titulo, descricao, carregar, criar, atualizar, podeGerenciar }: {
  titulo: string
  descricao: string
  carregar: () => Promise<Item[]>
  criar: (nome: string, ordem: number) => Promise<unknown>
  atualizar: (dados: { id: string; nome?: string; ordem?: number; ativo?: boolean }) => Promise<unknown>
  podeGerenciar: boolean
}) {
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  const buscar = useCallback(() => {
    setLoading(true)
    carregar().then((d) => setItens(d || [])).catch(() => setItens([])).finally(() => setLoading(false))
    // `carregar` é uma closure estável na prática (vem do pai, sem estado próprio);
    // incluí-la nas deps recarregaria a lista a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { buscar() }, [buscar])

  async function adicionar() {
    if (novo.trim().length < 2) return
    setSalvando(true)
    try {
      // Ordem = fim da lista. Quem quiser reordenar edita o número.
      await criar(novo.trim(), itens.length + 1)
      setNovo(''); buscar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function salvarNome(id: string) {
    if (editNome.trim().length < 2) return
    try { await atualizar({ id, nome: editNome.trim() }); setEditandoId(null); buscar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function alternarAtivo(it: Item) {
    try { await atualizar({ id: it.id, ativo: !it.ativo }); buscar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold">{titulo}</h4>
        <p className="text-[11px] text-muted-foreground">{descricao}</p>
      </div>

      {podeGerenciar && (
        <div className="flex items-center gap-2 mb-3">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Adicionar..."
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
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto nice-scrollbar">
          {itens.map((it) => (
            <div key={it.id} className={cn(
              'flex items-center gap-2 rounded-md border border-border p-2 text-sm',
              it.ativo ? 'bg-muted/20' : 'bg-muted/40 opacity-70',
            )}>
              {editandoId === it.id ? (
                <>
                  <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 text-sm"
                    autoFocus onKeyDown={(e) => { if (e.key === 'Enter') salvarNome(it.id) }} />
                  <Button size="xs" variant="success" onClick={() => salvarNome(it.id)}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="xs" variant="outline" onClick={() => setEditandoId(null)}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{it.nome}</span>
                  {!it.ativo && <Badge variant="outline" className="text-[10px] shrink-0">Inativo</Badge>}
                  {it.legacyId != null && (
                    <span className="text-[10px] text-muted-foreground shrink-0" title="Número no sistema antigo">#{it.legacyId}</span>
                  )}
                  {podeGerenciar && (
                    <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                      <Button size="icon-sm" variant="soft-info" title="Renomear"
                        onClick={() => { setEditandoId(it.id); setEditNome(it.nome) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {/* Desativar, e não excluir: os documentos que já apontam
                          para este item continuam válidos, e o histórico da ISO
                          não pode perder o rótulo que valia na época. */}
                      <Button size="xs" variant="outline" onClick={() => alternarAtivo(it)}>
                        {it.ativo ? 'Desativar' : 'Ativar'}
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
  )
}
