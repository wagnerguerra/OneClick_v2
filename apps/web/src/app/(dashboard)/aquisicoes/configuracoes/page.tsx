'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, ClipboardList, Loader2, Plus, Trash2, Pencil, X, Check,
  AlertTriangle,
} from 'lucide-react'
import { Button, Card, Input, Avatar, AvatarImage, AvatarFallback, Badge, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

const CONFIG_TABS = [
  { key: 'aprovadores', label: 'Aprovadores', icon: ShieldCheck },
  { key: 'criterios', label: 'Critérios', icon: ClipboardList },
] as const

interface Aprovador {
  id: string
  name: string
  email: string
  image: string | null
  role: string
  implicito: boolean
  aprovador: boolean
  temAcesso: boolean
}
interface Criterio { id: string; criterio: string; ordem: number; isActive: boolean }

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')

export default function AquisicoesConfiguracoesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'aquisicoes')?.subPermissions ?? {}) as Record<string, boolean>
  const pode = isMaster || isEmpresaMaster || subs.gerenciar_configuracoes === true

  const [activeTab, setActiveTab] = useState<string>('aprovadores')

  useEffect(() => {
    if (!permsLoading && !pode) {
      alerts.error('Sem permissão', 'Você não tem permissão para gerenciar as configurações de Aquisições.')
      router.replace('/aquisicoes')
    }
  }, [permsLoading, pode, router])

  if (permsLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!pode) return null

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <BackButton href="/aquisicoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Configurações de Aquisições</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Aquisições</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Configurações de Aquisições</span>
        </p>
      </PageHeaderBar>

      <Card className="overflow-hidden">
        <div className="flex min-h-[450px]">
          <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <div className="space-y-1">
              {CONFIG_TABS.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      activeTab === t.key ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                    )}
                    style={activeTab === t.key ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div key={activeTab} className="flex-1 min-w-0 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {activeTab === 'aprovadores' && <AprovadoresTab />}
            {activeTab === 'criterios' && <CriteriosTab />}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── Aprovadores ────────────────────────────────────────────────
function AprovadoresTab() {
  const [users, setUsers] = useState<Aprovador[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).listAprovadores.query()
      .then((d: Aprovador[]) => setUsers(d || []))
      .catch((e: Error) => { alerts.error('Erro', e.message); setUsers([]) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function alternar(u: Aprovador) {
    if (u.implicito) return
    setSalvando(u.id)
    // Otimista: o toggle responde na hora e volta atrás se o servidor recusar.
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, aprovador: !x.aprovador, temAcesso: x.temAcesso || !x.aprovador } : x))
    try {
      await (trpc.compra as any).setAprovador.mutate({ userId: u.id, ativo: !u.aprovador })
    } catch (e) {
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, aprovador: u.aprovador, temAcesso: u.temAcesso } : x))
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(null) }
  }

  const q = busca.trim().toLowerCase()
  const filtrados = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : users
  const totalAprovadores = users.filter((u) => u.aprovador).length

  return (
    <>
      <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border flex items-center justify-between gap-3">
        <h4 className="text-[13px] font-semibold text-foreground">Quem pode aprovar pedidos</h4>
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">{totalAprovadores} aprovador(es)</Badge>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Marcar aqui é o mesmo que marcar <strong className="text-foreground">Aprovar e reprovar pedidos de compra</strong> nas
        permissões do módulo Aquisições, no cadastro do usuário — é a mesma permissão, vista dos dois lados.
        Quem for marcado passa a ver o módulo, mas não ganha o direito de criar ou editar pedidos.
      </p>

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou e-mail..."
        className="h-9 max-w-sm mb-3"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : filtrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border">
          {filtrados.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
              <Avatar className="h-8 w-8 shrink-0">
                {u.image && <AvatarImage src={u.image} alt={u.name} />}
                <AvatarFallback className="text-[11px]">{iniciais(u.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
              </div>
              {u.aprovador && !u.temAcesso && !u.implicito && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500" title="Sem acesso de leitura ao módulo">
                  <AlertTriangle className="h-3.5 w-3.5" /> sem acesso ao módulo
                </span>
              )}
              {u.implicito ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">aprova sempre</Badge>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={u.aprovador}
                  disabled={salvando === u.id}
                  onClick={() => alternar(u)}
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60',
                    u.aprovador ? '' : 'bg-muted-foreground/30',
                  )}
                  style={u.aprovador ? { backgroundColor: MODULE_COLOR } : undefined}
                  title={u.aprovador ? 'Remover como aprovador' : 'Tornar aprovador'}
                >
                  <span className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                    u.aprovador ? 'left-[18px]' : 'left-0.5',
                  )} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Critérios de avaliação ─────────────────────────────────────
function CriteriosTab() {
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).listCriterios.query()
      .then((d: Criterio[]) => setCriterios(d || []))
      .catch(() => setCriterios([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    const texto = novo.trim()
    if (texto.length < 3) return
    setSalvando(true)
    try {
      await (trpc.compra as any).createCriterio.mutate({ criterio: texto, ordem: criterios.length + 1 })
      setNovo(''); carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSalvando(false) }
  }
  async function salvarEdicao(id: string) {
    const texto = editTexto.trim()
    if (texto.length < 3) return
    try { await (trpc.compra as any).updateCriterio.mutate({ id, criterio: texto }); setEditId(null); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function excluir(c: Criterio) {
    const ok = await alerts.confirm({ title: 'Excluir critério?', text: c.criterio, icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try { await (trpc.compra as any).deleteCriterio.mutate({ id: c.id }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <>
      <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border">
        <h4 className="text-[13px] font-semibold text-foreground">Critérios de avaliação de fornecimento</h4>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        São as perguntas do formulário de avaliação, respondidas com <strong className="text-foreground">Atende</strong> ou
        <strong className="text-foreground"> Não</strong> ao avaliar um pedido recebido. A nota do fornecedor sai daí.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
          placeholder="Ex.: Entregou no prazo combinado"
          className="h-9 max-w-md"
        />
        <Button type="button" variant="success" size="sm" disabled={salvando || novo.trim().length < 3} onClick={adicionar}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : criterios.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum critério cadastrado — sem eles o formulário de avaliação fica vazio.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border">
          {criterios.map((c, i) => (
            <div key={c.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
              <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
              {editId === c.id ? (
                <>
                  <Input
                    value={editTexto}
                    onChange={(e) => setEditTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvarEdicao(c.id) } }}
                    className="h-8 flex-1 text-sm"
                    autoFocus
                  />
                  <Button type="button" size="xs" variant="success" onClick={() => salvarEdicao(c.id)}><Check className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <p className="min-w-0 flex-1 truncate text-sm">{c.criterio}</p>
                  <Button type="button" variant="soft-info" size="icon-sm" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => { setEditId(c.id); setEditTexto(c.criterio) }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="soft-destructive" size="icon-sm" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => excluir(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
