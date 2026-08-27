'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Loader2, Pencil, Trash2, Lock, Phone, Mail, User, X, RotateCcw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search as SearchIcon,
} from 'lucide-react'
import {
  Button, Input, Card, Badge, Checkbox, Textarea, cn,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { masks } from '@/lib/masks'

const PAGE_SIZES = [10, 20, 50]

interface Pessoa { id?: string; nome: string | null; telefone: string | null; email: string | null }
interface Row {
  id: string
  nome: string
  observacoes: string | null
  privado: boolean
  donoId: string | null
  donoNome: string | null
  ativo: boolean
  pessoas: Pessoa[]
}

const vazia = (): Pessoa => ({ nome: '', telefone: '', email: '' })

export default function ContatosPage() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  // A agenda é de consulta para quem tem leitura; incluir/editar/excluir exigem
  // a sub-permissão `gerenciar` (o backend também barra — isto é só a UI).
  const podeGerenciar = isMaster || isEmpresaMaster
    || permissions.find(p => p.moduleSlug === 'contatos')?.subPermissions?.gerenciar === true

  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [soPrivados, setSoPrivados] = useState(false)
  const [verExcluidos, setVerExcluidos] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc as any).contato.listar.query({
        page, limit,
        search: debounced || undefined,
        somentePrivados: soPrivados || undefined,
        incluirInativos: verExcluidos || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, soPrivados, verExcluidos])
  useEffect(() => { fetchData() }, [fetchData])

  // ── Modal (criar/editar) ──
  const [aberta, setAberta] = useState(false)
  const [editando, setEditando] = useState<Row | null>(null)
  const [mNome, setMNome] = useState('')
  const [mObs, setMObs] = useState('')
  const [mPrivado, setMPrivado] = useState(false)
  const [mPessoas, setMPessoas] = useState<Pessoa[]>([vazia()])
  const [salvando, setSalvando] = useState(false)

  function abrirNovo() {
    setEditando(null); setMNome(''); setMObs(''); setMPrivado(false); setMPessoas([vazia()]); setAberta(true)
  }
  function abrirEdicao(r: Row) {
    setEditando(r); setMNome(r.nome); setMObs(r.observacoes ?? ''); setMPrivado(r.privado)
    setMPessoas(r.pessoas.length ? r.pessoas.map(p => ({ ...p })) : [vazia()])
    setAberta(true)
  }

  async function salvar() {
    if (!mNome.trim()) { alerts.error('Falta o nome', 'Informe o nome do contato.'); return }
    setSalvando(true)
    try {
      const pessoas = mPessoas.map(p => ({ nome: p.nome || null, telefone: p.telefone || null, email: p.email || null }))
      if (editando) {
        await (trpc as any).contato.atualizar.mutate({ id: editando.id, nome: mNome.trim(), observacoes: mObs || null, privado: mPrivado, pessoas })
        alerts.success('Salvo', 'Contato atualizado.')
      } else {
        await (trpc as any).contato.criar.mutate({ nome: mNome.trim(), observacoes: mObs || null, privado: mPrivado, pessoas })
        alerts.success('Criado', 'Contato adicionado à agenda.')
      }
      setAberta(false); fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function excluir(r: Row) {
    const ok = await alerts.confirm({ title: 'Excluir contato?', text: `"${r.nome}" sai da agenda. Você pode restaurá-lo depois em "Ver excluídos".`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try { await (trpc as any).contato.excluir.mutate({ id: r.id }); alerts.success('Excluído', 'Contato removido da agenda.'); fetchData() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function restaurar(r: Row) {
    try { await (trpc as any).contato.restaurar.mutate({ id: r.id }); alerts.success('Restaurado', 'Contato de volta à agenda.'); fetchData() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const startRecord = data && data.total > 0 ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  return (
    <div className="space-y-6">
      <PageHeaderBar
        actions={<>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome, telefone, e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64 pl-8 text-sm" />
          </div>
          {podeGerenciar && (
            <Button size="sm" className="gap-1.5" onClick={abrirNovo}>
              <Plus className="h-4 w-4" />Novo Contato
            </Button>
          )}
        </>}
      >
        <h1 className="truncate">Contatos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Contatos</span>
        </p>
      </PageHeaderBar>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={soPrivados} onCheckedChange={(v) => { setSoPrivados(v === true); setPage(1) }} />
              Só os meus privados
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={verExcluidos} onCheckedChange={(v) => { setVerExcluidos(v === true); setPage(1) }} />
              Ver excluídos
            </label>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[70px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">Agenda compartilhada da equipe — marque “privado” para um contato só seu.</p>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="[&_th]:whitespace-nowrap">
              <TableHead>Nome</TableHead>
              <TableHead className="w-[230px]">Telefones</TableHead>
              <TableHead className="hidden lg:table-cell w-[210px]">Contato / e-mail</TableHead>
              <TableHead className="hidden md:table-cell">Observações</TableHead>
              <TableHead className="w-[110px] pr-5 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</TableCell></TableRow>
            ) : data.data.map((r) => {
              const tels = r.pessoas.map(p => p.telefone).filter(Boolean) as string[]
              const nomesEmails = r.pessoas.filter(p => p.nome || p.email)
              return (
                <TableRow key={r.id} className={cn('[&_td]:py-2', !r.ativo && 'opacity-55')}>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {r.privado && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Contato privado" />}
                      <span className="truncate font-medium">{r.nome}</span>
                      {!r.ativo && <Badge variant="outline" className="shrink-0 text-[10px]">excluído</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {tels.length === 0 ? <span className="text-muted-foreground">—</span> : (
                      <div className="flex flex-col gap-0.5">
                        {tels.slice(0, 2).map((t, i) => (
                          <a key={i} href={`tel:${t.replace(/\D/g, '')}`} className="flex items-center gap-1 truncate tabular-nums hover:text-primary" onClick={(e) => e.stopPropagation()}>
                            <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />{t}
                          </a>
                        ))}
                        {tels.length > 2 && <span className="text-[10px] text-muted-foreground">+{tels.length - 2}</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs">
                    {nomesEmails.length === 0 ? <span className="text-muted-foreground">—</span> : (
                      <div className="flex flex-col gap-0.5">
                        {nomesEmails.slice(0, 2).map((p, i) => (
                          <span key={i} className="flex items-center gap-1 truncate">
                            {p.email
                              ? <><Mail className="h-3 w-3 shrink-0 text-muted-foreground" /><a href={`mailto:${p.email}`} className="truncate hover:text-primary">{p.email}</a></>
                              : <><User className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="truncate">{p.nome}</span></>}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    <span className="line-clamp-1" title={r.observacoes ?? undefined}>{r.observacoes || '—'}</span>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex justify-end gap-1">
                      {podeGerenciar && r.ativo && (
                        <>
                          <Button variant="soft-info" size="icon-sm" onClick={() => abrirEdicao(r)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="soft-destructive" size="icon-sm" onClick={() => excluir(r)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                      {podeGerenciar && !r.ativo && (
                        <Button variant="outline" size="icon-sm" onClick={() => restaurar(r)} title="Restaurar"><RotateCcw className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 contatos' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> contatos</>)}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="px-2 text-xs tabular-nums text-muted-foreground">{page} / {Math.max(1, data.totalPages)}</span>
              <Button variant="outline" size="icon-xs" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page >= data.totalPages} onClick={() => setPage(data.totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal criar/editar */}
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={editando ? Pencil : Plus} color={editando ? 'sky' : 'emerald'}>
            <DialogTitle>{editando ? 'Editar contato' : 'Novo contato'}</DialogTitle>
            <DialogDescription>Nome da empresa/pessoa e os telefones e e-mails de quem atende.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <label className="text-[13px] font-semibold text-foreground">Nome <span className="text-rose-500">*</span></label>
              <Input value={mNome} onChange={(e) => setMNome(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={200} placeholder="Ex.: CASA CERTA FILTROS" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-semibold text-foreground">Pessoas / telefones</label>
                <Button type="button" variant="outline" size="xs" className="gap-1" onClick={() => setMPessoas(p => [...p, vazia()])}>
                  <Plus className="h-3.5 w-3.5" />Adicionar
                </Button>
              </div>
              {mPessoas.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-4 h-9 text-sm" placeholder="Nome (opcional)" maxLength={160}
                    value={p.nome ?? ''} onChange={(e) => setMPessoas(a => a.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                  <Input className="col-span-3 h-9 text-sm" placeholder="Telefone" maxLength={60}
                    value={p.telefone ?? ''} onChange={(e) => setMPessoas(a => a.map((x, j) => j === i ? { ...x, telefone: masks.telefone(e.target.value) } : x))} />
                  <Input className="col-span-4 h-9 text-sm" placeholder="E-mail" maxLength={160}
                    value={p.email ?? ''} onChange={(e) => setMPessoas(a => a.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  <div className="col-span-1 flex items-center justify-end">
                    {mPessoas.length > 1 && (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMPessoas(a => a.filter((_, j) => j !== i))} title="Remover">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-[13px] font-semibold text-foreground">Observações</label>
              <Textarea value={mObs} onChange={(e) => setMObs(e.target.value)} className="mt-1.5 text-sm" rows={3} maxLength={4000} placeholder="Ex.: responsável pela manutenção dos ramais" />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox checked={mPrivado} onCheckedChange={(v) => setMPrivado(v === true)} />
              <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-amber-500" />Contato privado (só eu vejo)</span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberta(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
