'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Monitor, Plus, MoreVertical, Pencil, Trash2, Tv, Loader2,
} from 'lucide-react'
import {
  Button, Input, Card, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter,
} from '@saas/ui'
import { PageHeader } from '@/components/page-header'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MOD_COLOR = '#6366f1' // indigo — Gestão à Vista

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface PainelRow {
  id: string; slug: string; nome: string; accent: string; ativo: boolean; folhasCount: number
}

export default function PaineisPage() {
  const router = useRouter()
  const { profile } = useCurrentUserProfile()
  const isMaster = !!(profile?.isMaster || profile?.isEmpresaMaster)

  const [paineis, setPaineis] = useState<PainelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', slug: '', accent: '#22d3ee', periodoDias: 30 })
  const [slugTocado, setSlugTocado] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.painelTv as any).list.query()
      setPaineis(r ?? [])
    } catch { setPaineis([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  const abrirNovo = () => {
    setForm({ nome: '', slug: '', accent: '#22d3ee', periodoDias: 30 })
    setSlugTocado(false)
    setNovoOpen(true)
  }

  const criar = async () => {
    const slug = (slugTocado ? form.slug : slugify(form.nome)).trim()
    if (!form.nome.trim() || !slug) { alerts.error('Campos obrigatórios', 'Informe nome e slug.'); return }
    setSalvando(true)
    try {
      const p = await (trpc.painelTv as any).createPainel.mutate({ nome: form.nome.trim(), slug, accent: form.accent, periodoDias: form.periodoDias })
      setNovoOpen(false)
      router.push(`/paineis/${p.id}`)
    } catch (e: any) {
      alerts.error('Erro ao criar painel', e?.message ?? 'Tente novamente (slug pode já existir).')
    } finally { setSalvando(false) }
  }

  const excluir = async (p: PainelRow) => {
    const ok = await alerts.confirmDelete(p.nome)
    if (!ok) return
    try {
      await (trpc.painelTv as any).deletePainel.mutate({ id: p.id })
      await alerts.success('Painel excluído', `"${p.nome}" foi removido.`)
      load()
    } catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  if (!isMaster) {
    return (
      <Card className="p-8 text-center">
        <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">Acesso restrito ao administrador (master).</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        color={MOD_COLOR}
        icon={Monitor}
        title="Painéis de Gestão à Vista"
        subtitle="Crie e edite os painéis exibidos nas TVs dos setores"
        actions={<Button onClick={abrirNovo} style={{ backgroundColor: MOD_COLOR }} className="text-white"><Plus className="h-4 w-4 mr-1.5" /> Novo painel</Button>}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" style={{ color: MOD_COLOR }} /></div>
      ) : paineis.length === 0 ? (
        <Card className="p-10 text-center">
          <Tv className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground mb-4">Nenhum painel ainda.</p>
          <Button onClick={abrirNovo} variant="outline"><Plus className="h-4 w-4 mr-1.5" /> Criar o primeiro</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Painel</TableHead>
                <TableHead className="text-xs">Slug (URL)</TableHead>
                <TableHead className="text-xs text-center">Folhas</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paineis.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/paineis/${p.id}`)}>
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />
                      {p.nome}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">/tv/{p.slug}</TableCell>
                  <TableCell className="text-xs text-center">{p.folhasCount}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-[10px]" style={p.ativo ? { backgroundColor: '#d1fae5', color: '#065f46' } : undefined}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/paineis/${p.id}`)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`/tv/${p.slug}`, '_blank')}><Tv className="h-4 w-4 mr-2" /> Abrir na TV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => excluir(p)} className="text-red-600"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modal: novo painel */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent>
          <DialogHeaderIcon icon={Monitor} color={MOD_COLOR} title="Novo painel" description="Defina os dados básicos. Você adiciona folhas e blocos no editor." />
          <DialogBody className="space-y-4">
            <Campo label="Nome">
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value, slug: slugTocado ? f.slug : slugify(e.target.value) }))} placeholder="Ex.: Painel Financeiro" className="h-9 text-sm" />
            </Campo>
            <Campo label="Slug (vira a URL /tv/…)">
              <Input value={slugTocado ? form.slug : slugify(form.nome)} onChange={(e) => { setSlugTocado(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })) }} placeholder="painel-financeiro" className="h-9 text-sm font-mono" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Cor (accent)">
                <div className="flex items-center gap-2">
                  <input type="color" value={form.accent} onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))} className="h-9 w-12 rounded border border-border bg-transparent cursor-pointer" />
                  <Input value={form.accent} onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))} className="h-9 text-sm font-mono" />
                </div>
              </Campo>
              <Campo label="Período (dias)">
                <Input type="number" value={form.periodoDias} onChange={(e) => setForm((f) => ({ ...f, periodoDias: Number(e.target.value) || 30 }))} className="h-9 text-sm" />
              </Campo>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={criar} disabled={salvando} style={{ backgroundColor: MOD_COLOR }} className="text-white">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar e editar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-semibold text-foreground">{label}</label>
      {children}
    </div>
  )
}
