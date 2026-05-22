'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ShieldCheck, Loader2, Plus, MoreVertical, Eye, Download, Key, Archive, ArchiveRestore,
  Ban, Trash2, AlertTriangle, CheckCircle2, Clock, XCircle, FileLock,
  Upload, Lock, FileText, RefreshCw, History, DatabaseBackup, UploadCloud, X, FileCheck, Bell,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label, cn, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useTabLabel } from '@/hooks/use-tab-label'
import { ClienteCombobox } from '../orcamentos/_components/cliente-combobox'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-legalizacao, #e879f9)' // Legalização (fuchsia)

interface Certificado {
  id: string
  tipo: string
  titular: string
  documento: string
  numeroSerie: string | null
  emissor: string | null
  emitidoEm: string
  expiraEm: string
  status: string
  clienteId: string | null
  empresaId: string | null
  socioId: string | null
  observacoes: string | null
  arquivado: boolean
  createdAt: string
  cliente: { id: string; razaoSocial: string } | null
  empresa: { id: string; razaoSocial: string } | null
  socio: { id: string; nomeCompleto: string } | null
}

interface Stats {
  ativos: number
  vencendo60: number
  vencendo30: number
  vencidos: number
  revogados: number
}

interface Cliente { id: string; razaoSocial: string; documento?: string | null; situacao?: string | null }

const STATUS_LABELS: Record<string, string> = {
  ATIVO: 'Ativo',
  EXPIRADO: 'Expirado',
  REVOGADO: 'Revogado',
  ARQUIVADO: 'Arquivado',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDocumento(doc: string) {
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

/** Dias até expirar (negativo se já expirou). */
function diasParaExpirar(expiraEm: string): number {
  return Math.ceil((new Date(expiraEm).getTime() - Date.now()) / 86400000)
}

function StatusBadge({ status, expiraEm }: { status: string; expiraEm: string }) {
  if (status === 'REVOGADO') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400"><Ban className="h-3 w-3" /> Revogado</span>
  }
  const dias = diasParaExpirar(expiraEm)
  if (dias < 0) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400"><XCircle className="h-3 w-3" /> Vencido</span>
  }
  if (dias <= 30) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> {dias}d</span>
  }
  if (dias <= 60) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> {dias}d</span>
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Vigente</span>
}

// ============================================================
// Page
// ============================================================

export default function GestaoCertificadosPage() {
  useTabLabel('Certificados Digitais')
  const { profile } = useCurrentUserProfile()
  const isAdmin = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const empresaIdAtual = profile?.empresa?.id ?? null
  const [items, setItems] = useState<Certificado[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [legacyImportOpen, setLegacyImportOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluindoLote, setExcluindoLote] = useState(false)
  const [varrendo, setVarrendo] = useState(false)
  const [atualizandoSino, setAtualizandoSino] = useState(false)

  // Modais
  const [novoOpen, setNovoOpen] = useState(false)
  const [detalhesOpen, setDetalhesOpen] = useState(false)
  const [detalhesId, setDetalhesId] = useState<string | null>(null)
  const [renovarTarget, setRenovarTarget] = useState<Certificado | null>(null)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthState, setReauthState] = useState<{
    titulo: string
    descricao: string
    requireMotivo: boolean
    onConfirm: (senha: string, motivo: string) => Promise<void>
  } | null>(null)

  // Dados auxiliares (clientes para vínculo)
  const [clientes, setClientes] = useState<Cliente[]>([])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [list, st] = await Promise.all([
        (trpc.certificadoDigital as any).list.query({ incluirArquivados: false }) as Promise<Certificado[]>,
        (trpc.certificadoDigital as any).getStats.query() as Promise<Stats>,
      ])
      setItems(list)
      setStats(st)
    } catch (e) {
      if (!silent) alerts.error('Erro', 'Falha ao carregar certificados: ' + (e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Carrega clientes só ao abrir modal de cadastro — apenas situação MENSAL
  // (clientes ativos com contrato mensal são quem precisa de cert digital).
  useEffect(() => {
    if (!novoOpen) return
    ;(trpc.cliente as any).listForSelect.query()
      .then((c: Cliente[]) => setClientes((c || []).filter(x => x.situacao === 'MENSAL')))
      .catch(() => setClientes([]))
  }, [novoOpen])

  const filtered = useMemo(() => {
    let out = items
    if (filtroStatus !== '__all__') {
      const agora = Date.now()
      if (filtroStatus === 'ATIVO') out = out.filter(c => c.status === 'ATIVO' && new Date(c.expiraEm).getTime() > agora + 60 * 86400000)
      else if (filtroStatus === 'VENCENDO') out = out.filter(c => c.status === 'ATIVO' && new Date(c.expiraEm).getTime() > agora && new Date(c.expiraEm).getTime() <= agora + 60 * 86400000)
      else if (filtroStatus === 'VENCIDO') out = out.filter(c => new Date(c.expiraEm).getTime() <= agora && c.status !== 'REVOGADO')
      else if (filtroStatus === 'REVOGADO') out = out.filter(c => c.status === 'REVOGADO')
    }
    const q = filtroBusca.trim().toLowerCase()
    if (q) {
      out = out.filter(c =>
        c.titular.toLowerCase().includes(q)
        || c.documento.toLowerCase().includes(q)
        || c.cliente?.razaoSocial?.toLowerCase().includes(q)
        || c.empresa?.razaoSocial?.toLowerCase().includes(q),
      )
    }
    return out
  }, [items, filtroStatus, filtroBusca])

  // ── Ações ───────────────────────────────────────────────

  function abrirReauth(opts: typeof reauthState) {
    setReauthState(opts)
    setReauthOpen(true)
  }

  async function handleDownload(cert: Certificado) {
    abrirReauth({
      titulo: 'Confirmar download',
      descricao: `Vou baixar o arquivo PFX de ${cert.titular}. Confirme sua senha e informe o motivo.`,
      requireMotivo: true,
      onConfirm: async (senhaUser, motivo) => {
        const r = await (trpc.certificadoDigital as any).downloadPfx.mutate({ id: cert.id, senhaUser, motivo })
        // Cria download
        const blob = new Blob([Uint8Array.from(atob(r.pfxBase64), c => c.charCodeAt(0))], { type: 'application/x-pkcs12' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${cert.titular.replace(/\s+/g, '_')}.pfx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        alerts.success('Download iniciado', 'Trilha de auditoria registrada.')
      },
    })
  }

  async function handleVerSenha(cert: Certificado) {
    abrirReauth({
      titulo: 'Visualizar senha',
      descricao: `Vou exibir a senha do certificado de ${cert.titular}. Confirme sua senha e o motivo.`,
      requireMotivo: true,
      onConfirm: async (senhaUser, motivo) => {
        const r = await (trpc.certificadoDigital as any).getSenha.mutate({ id: cert.id, senhaUser, motivo })
        await alerts.custom({
          title: 'Senha do certificado',
          html: `<div style="font-family: ui-monospace, monospace; font-size: 16px; padding: 12px; background: #f3f4f6; border-radius: 6px; user-select: all;">${r.senha}</div><p style="font-size: 11px; color: #6b7280; margin-top: 8px;">Esta visualização foi registrada na trilha de auditoria.</p>`,
          confirmButtonText: 'Fechar',
          showCancelButton: false,
        })
      },
    })
  }

  async function handleRevogar(cert: Certificado) {
    const motivo = await alerts.input({
      title: 'Revogar certificado',
      text: `Revogar ${cert.titular}? Esta ação muda o status para "Revogado" — informe o motivo.`,
      inputLabel: 'Motivo',
      inputType: 'textarea',
      required: true,
      confirmText: 'Revogar',
      icon: 'warning',
    })
    if (motivo === null) return
    try {
      await (trpc.certificadoDigital as any).revogar.mutate({ id: cert.id, motivo })
      await alerts.success('Revogado', 'Certificado revogado.')
      fetchData(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleArquivar(cert: Certificado) {
    if (!await alerts.confirm({ title: 'Arquivar', text: `Arquivar ${cert.titular}? Sai da listagem padrão.`, confirmText: 'Arquivar', icon: 'question' })) return
    try {
      await (trpc.certificadoDigital as any).arquivar.mutate({ id: cert.id })
      await alerts.success('Arquivado', 'Certificado arquivado.')
      fetchData(true)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelecionarTodos(ids: string[]) {
    setSelecionados(prev => {
      const todos = ids.every(id => prev.has(id))
      if (todos) return new Set()
      return new Set(ids)
    })
  }

  async function handleAtualizarSino() {
    setAtualizandoSino(true)
    try {
      const r = await (trpc.certificadoDigital as any).notificarVencimentos.mutate() as { verificados: number; notificados: number; expirados: number }
      const msg = r.notificados === 0 && r.expirados === 0
        ? 'Tudo em dia — nenhuma nova notificação.'
        : `${r.expirados} cert(s) marcado(s) como expirado(s) · ${r.notificados} nova(s) notificação(ões) no sino.`
      await alerts.success('Sino atualizado', msg)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setAtualizandoSino(false)
    }
  }

  async function handleVarrerDuplicatas() {
    const ok = await alerts.confirm({
      title: 'Varrer e excluir duplicatas?',
      text: 'O sistema vai procurar certificados duplicados (mesmo número de série ou mesmo CNPJ + emissor + vencimento) e excluir os redundantes, mantendo o registro mais antigo. Confirma?',
      confirmText: 'Varrer',
      icon: 'warning',
    })
    if (!ok) return
    setVarrendo(true)
    try {
      const r = await (trpc.certificadoDigital as any).excluirDuplicatas.mutate() as { gruposEncontrados: number; duplicadosExcluidos: number; falhou: number }
      const msg = r.gruposEncontrados === 0
        ? 'Nenhuma duplicata encontrada.'
        : `${r.gruposEncontrados} grupo(s) com duplicatas — ${r.duplicadosExcluidos} excluído(s)${r.falhou > 0 ? ` · ${r.falhou} falharam` : ''}.`
      await alerts.success('Varredura concluída', msg)
      fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setVarrendo(false)
    }
  }

  async function handleExcluirEmMassa() {
    if (selecionados.size === 0) return
    const total = selecionados.size
    const ok = await alerts.confirm({
      title: `Excluir ${total} certificado(s)?`,
      text: `Esta ação é IRREVERSÍVEL. Os arquivos PFX e registros selecionados serão apagados permanentemente. Confirma?`,
      confirmText: `Excluir ${total}`,
      icon: 'warning',
    })
    if (!ok) return
    setExcluindoLote(true)
    try {
      const ids = Array.from(selecionados)
      const r = await (trpc.certificadoDigital as any).excluirEmMassa.mutate({ ids }) as { ok: number; falhou: number }
      setSelecionados(new Set())
      await alerts.success('Concluído', `${r.ok} excluído(s)${r.falhou > 0 ? ` · ${r.falhou} falharam` : ''}.`)
      fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setExcluindoLote(false)
    }
  }

  async function handleExcluir(cert: Certificado) {
    // Master/empresa-master: exclusão direta sem reauth nem motivo.
    // Outros: backend bloqueia (forbidden).
    if (isAdmin) {
      const ok = await alerts.confirm({
        title: 'Excluir definitivamente',
        text: `Esta ação é IRREVERSÍVEL. "${cert.titular}" e seu arquivo PFX serão apagados permanentemente. Confirma?`,
        confirmText: 'Excluir',
        icon: 'warning',
      })
      if (!ok) return
      try {
        await (trpc.certificadoDigital as any).excluir.mutate({ id: cert.id })
        await alerts.success('Excluído', 'Certificado removido.')
        fetchData(true)
      } catch (e) {
        alerts.error('Erro', (e as Error).message)
      }
      return
    }
    abrirReauth({
      titulo: 'Excluir definitivamente',
      descricao: `Esta ação é IRREVERSÍVEL. ${cert.titular} e seu arquivo PFX serão apagados permanentemente. Confirme sua senha e o motivo.`,
      requireMotivo: true,
      onConfirm: async (senhaUser, motivo) => {
        await (trpc.certificadoDigital as any).excluir.mutate({ id: cert.id, senhaUser, motivo })
        await alerts.success('Excluído', 'Certificado removido.')
        fetchData(true)
      },
    })
  }

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-90px)]" suppressHydrationWarning>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1>Certificados Digitais</h1>
            <p className="text-sm text-muted-foreground">Cadastro, controle de validade e guarda segura</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkImportOpen(true)}
                className="gap-1.5"
                title="Importar múltiplos PFX de uma vez (drag-and-drop)"
              >
                <UploadCloud className="h-4 w-4" /> Importar PFX em Lote
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLegacyImportOpen(true)}
                className="gap-1.5"
                title="Importar certificados do OneClick V1"
              >
                <DatabaseBackup className="h-4 w-4" /> Importar do Legado
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleVarrerDuplicatas}
                disabled={varrendo}
                className="gap-1.5"
                title="Encontra e exclui certificados duplicados (mesmo número de série)"
              >
                {varrendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {varrendo ? 'Varrendo...' : 'Limpar Duplicatas'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAtualizarSino}
                disabled={atualizandoSino}
                className="gap-1.5"
                title="Atualiza notificações no sino para certs vencidos e próximos do vencimento"
              >
                {atualizandoSino ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                {atualizandoSino ? 'Atualizando...' : 'Atualizar Sino'}
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => setNovoOpen(true)}
            style={{ backgroundColor: MODULE_COLOR }}
            className="text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Novo Certificado
          </Button>
        </div>
      </div>

      {/* KPIs / Filtros */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {[
          { key: '__all__', label: 'Todos', count: items.length, color: '#94a3b8', icon: FileLock },
          { key: 'ATIVO', label: 'Vigentes', count: stats?.ativos ?? 0, color: '#10b981', icon: CheckCircle2 },
          { key: 'VENCENDO', label: 'Vencendo', count: (stats?.vencendo60 ?? 0) + (stats?.vencendo30 ?? 0), color: '#f59e0b', icon: Clock },
          { key: 'VENCIDO', label: 'Vencidos', count: stats?.vencidos ?? 0, color: '#ef4444', icon: XCircle },
          { key: 'REVOGADO', label: 'Revogados', count: stats?.revogados ?? 0, color: '#94a3b8', icon: Ban },
        ].map(f => {
          const Icon = f.icon
          const active = filtroStatus === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltroStatus(f.key)}
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                active
                  ? 'border-foreground/20'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              style={active ? { borderColor: f.color, backgroundColor: `${f.color}10`, color: f.color } : undefined}
            >
              <Icon className="h-3.5 w-3.5" style={!active ? { color: f.color } : undefined} />
              <span>{f.label}</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums"
                style={active ? { backgroundColor: `${f.color}20`, color: f.color } : undefined}
              >
                {f.count}
              </Badge>
            </button>
          )
        })}
        <div className="ml-auto">
          <Input
            placeholder="Buscar por titular, documento, cliente..."
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
            className="h-8 w-[280px] text-xs"
          />
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <Card className="flex-1 flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando certificados...
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex-1 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">Nenhum certificado encontrado neste filtro</p>
        </Card>
      ) : (
        <Card className="flex-1 overflow-hidden flex flex-col">
          {/* Barra de ações em massa — só aparece quando há seleção */}
          {isAdmin && selecionados.size > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-fuchsia-50 dark:bg-fuchsia-950/20 border-b border-fuchsia-200 dark:border-fuchsia-900">
              <div className="text-sm font-medium">
                {selecionados.size} selecionado(s)
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())} disabled={excluindoLote}>
                  Limpar seleção
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleExcluirEmMassa}
                  disabled={excluindoLote}
                  className="gap-1.5"
                >
                  {excluindoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {excluindoLote ? 'Excluindo...' : `Excluir ${selecionados.size}`}
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="whitespace-nowrap">
                  {isAdmin && (
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={filtered.length > 0 && filtered.every(c => selecionados.has(c.id))}
                        onCheckedChange={() => toggleSelecionarTodos(filtered.map(c => c.id))}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                  )}
                  <TableHead>Titular</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Emissor</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[44px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow
                    key={c.id}
                    className={cn(
                      'cursor-pointer whitespace-nowrap hover:bg-muted/50',
                      selecionados.has(c.id) && 'bg-fuchsia-50/50 dark:bg-fuchsia-950/10',
                    )}
                    onClick={() => { setDetalhesId(c.id); setDetalhesOpen(true) }}
                  >
                    {isAdmin && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.has(c.id)}
                          onCheckedChange={() => toggleSelecionado(c.id)}
                          aria-label={`Selecionar ${c.titular}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-sm max-w-[220px] truncate">{c.titular}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{formatDocumento(c.documento)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{c.tipo}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {c.cliente?.razaoSocial || c.empresa?.razaoSocial || c.socio?.nomeCompleto || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{c.emissor || '—'}</TableCell>
                    <TableCell className="text-xs">{formatDate(c.expiraEm)}</TableCell>
                    <TableCell><StatusBadge status={c.status} expiraEm={c.expiraEm} /></TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => { setDetalhesId(c.id); setDetalhesOpen(true) }}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownload(c)}>
                            <Download className="h-3.5 w-3.5 mr-2" /> Baixar PFX
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleVerSenha(c)}>
                            <Key className="h-3.5 w-3.5 mr-2" /> Ver senha
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRenovarTarget(c)}>
                            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Renovar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRevogar(c)}>
                            <Ban className="h-3.5 w-3.5 mr-2" /> Revogar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleArquivar(c)}>
                            <Archive className="h-3.5 w-3.5 mr-2" /> Arquivar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleExcluir(c)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Modais ── */}
      <NovoCertificadoModal
        open={novoOpen}
        onOpenChange={setNovoOpen}
        clientes={clientes}
        onCreated={() => { setNovoOpen(false); fetchData(true) }}
      />
      <RenovarCertificadoModal
        target={renovarTarget}
        onClose={() => setRenovarTarget(null)}
        onRenovado={() => { setRenovarTarget(null); fetchData(true) }}
      />
      <LegacyImportModal
        open={legacyImportOpen}
        onOpenChange={setLegacyImportOpen}
        empresaId={empresaIdAtual}
        onImported={() => { setLegacyImportOpen(false); fetchData(true) }}
      />
      <BulkImportModal
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        empresaId={empresaIdAtual}
        onImported={() => { setBulkImportOpen(false); fetchData(true) }}
      />
      <ReauthModal
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        state={reauthState}
        onClose={() => { setReauthOpen(false); setReauthState(null) }}
      />
      {detalhesId && (
        <DetalhesModal
          open={detalhesOpen}
          onOpenChange={(o) => { setDetalhesOpen(o); if (!o) setDetalhesId(null) }}
          certId={detalhesId}
        />
      )}
    </div>
  )
}

// ============================================================
// Modal: Novo Certificado (upload PFX)
// ============================================================

function NovoCertificadoModal({ open, onOpenChange, clientes, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clientes: Cliente[]
  onCreated: () => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [showSenha, setShowSenha] = useState(false)

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setArquivo(null); setSenha(''); setConfirmaSenha('')
      setClienteId(''); setObservacoes(''); setShowSenha(false)
    }
  }, [open])

  async function handleSalvar() {
    if (!arquivo) { alerts.error('Erro', 'Selecione o arquivo PFX'); return }
    if (!senha) { alerts.error('Erro', 'Informe a senha do certificado'); return }
    if (senha !== confirmaSenha) { alerts.error('Erro', 'As senhas não conferem'); return }
    if (arquivo.size > 5 * 1024 * 1024) { alerts.error('Erro', 'Arquivo maior que 5MB'); return }

    setSalvando(true)
    try {
      // Lê arquivo como base64
      const buffer = await arquivo.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
      const pfxBase64 = btoa(binary)

      await (trpc.certificadoDigital as any).create.mutate({
        pfxBase64,
        senha,
        clienteId: clienteId || null,
        observacoes: observacoes || null,
      })
      await alerts.success('Cadastrado', 'Certificado adicionado com sucesso. Senha cifrada e arquivo armazenado.')
      onCreated()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={ShieldCheck} color="fuchsia">
          <DialogTitle>Novo Certificado Digital</DialogTitle>
          <DialogDescription>
            Envie o arquivo .pfx e informe a senha. O sistema vai extrair os dados (titular, validade, emissor) automaticamente.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {/* Upload */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Arquivo PFX *</Label>
            <label
              className={cn(
                'flex items-center gap-3 px-4 py-3 border border-dashed rounded-md cursor-pointer transition-colors',
                arquivo ? 'border-fuchsia-300 bg-fuchsia-50/50 dark:bg-fuchsia-900/10' : 'border-border hover:bg-muted/30',
              )}
            >
              {arquivo ? <FileLock className="h-5 w-5 text-fuchsia-600" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                {arquivo ? (
                  <>
                    <p className="text-sm font-medium truncate">{arquivo.name}</p>
                    <p className="text-[11px] text-muted-foreground">{Math.round(arquivo.size / 1024)} KB · clique para trocar</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">Selecione o arquivo .pfx ou .p12</p>
                    <p className="text-[11px] text-muted-foreground">Máx 5 MB · será armazenado de forma segura</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>

          {/* Senha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Senha *</Label>
              <div className="relative">
                <Input
                  type={showSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="Senha do PFX"
                  className="h-9 text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Confirmar senha *</Label>
              <Input
                type={showSenha ? 'text' : 'password'}
                value={confirmaSenha}
                onChange={e => setConfirmaSenha(e.target.value)}
                placeholder="Repita a senha"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Vínculo cliente — combobox filtrável (só clientes mensais) */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Cliente vinculado</Label>
            <ClienteCombobox
              clientes={clientes}
              value={clienteId}
              onSelect={setClienteId}
              placeholder="Buscar cliente mensal por razão social ou CNPJ..."
            />
            <p className="text-[10px] text-muted-foreground">
              Apenas clientes com situação <strong>Mensal</strong> são listados. Você poderá vincular sócio/empresa nos detalhes depois.
            </p>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Observações</Label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Notas sobre este certificado..."
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
            />
          </div>

          {/* Aviso de segurança */}
          <div className="flex items-start gap-2 p-3 rounded-md bg-fuchsia-50/50 dark:bg-fuchsia-900/10 border border-fuchsia-200 dark:border-fuchsia-800">
            <Lock className="h-4 w-4 text-fuchsia-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-fuchsia-900 dark:text-fuchsia-300 leading-relaxed">
              A senha será cifrada com AES-256-GCM antes de gravar no banco. O arquivo PFX é armazenado com permissões restritas e SHA-256 para verificação de integridade. Toda operação é registrada na trilha de auditoria.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || !arquivo || !senha || senha !== confirmaSenha}
            style={{ backgroundColor: MODULE_COLOR }}
            className="text-white gap-1.5"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {salvando ? 'Cadastrando...' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Modal: Reauth (confirma senha do user + motivo)
// ============================================================

function ReauthModal({ open, onOpenChange, state, onClose }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  state: {
    titulo: string
    descricao: string
    requireMotivo: boolean
    onConfirm: (senha: string, motivo: string) => Promise<void>
  } | null
  onClose: () => void
}) {
  const [senha, setSenha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [executando, setExecutando] = useState(false)

  useEffect(() => {
    if (!open) { setSenha(''); setMotivo(''); setExecutando(false) }
  }, [open])

  if (!state) return null

  async function handleConfirm() {
    if (!senha) { alerts.error('Erro', 'Informe sua senha'); return }
    if (state!.requireMotivo && motivo.trim().length < 3) { alerts.error('Erro', 'Motivo precisa ter no mínimo 3 caracteres'); return }
    setExecutando(true)
    try {
      await state!.onConfirm(senha, motivo)
      onClose()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setExecutando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeaderIcon icon={Lock} color="fuchsia">
          <DialogTitle className="text-[15px]">{state.titulo}</DialogTitle>
          <DialogDescription>{state.descricao}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Sua senha *</Label>
            <Input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="Digite sua senha de login"
              className="h-9 text-sm"
              autoFocus
            />
          </div>
          {state.requireMotivo && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Motivo *</Label>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ex: assinar contrato cliente XYZ, renovação de procuração, etc."
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
              />
              <p className="text-[10px] text-muted-foreground">Esta justificativa fica gravada na trilha de auditoria.</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={executando}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={executando || !senha}
            style={{ backgroundColor: MODULE_COLOR }}
            className="text-white gap-1.5"
          >
            {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Modal: Detalhes (Geral + Trilha de auditoria)
// ============================================================

interface AcessoLog {
  id: string
  acao: string
  detalhes: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  usuario: { id: string; name: string; email: string } | null
}

const ACAO_LABELS: Record<string, string> = {
  cadastrado: '📝 Cadastrado',
  visualizado: '👁 Visualizado',
  editado: '✏️ Editado',
  download_pfx: '⬇ Download PFX',
  senha_visualizada: '🔑 Senha visualizada',
  usado_assinatura: '✍ Usado para assinar',
  renovado: '🔄 Renovado',
  revogado: '🚫 Revogado',
  arquivado: '📦 Arquivado',
  desarquivado: '📤 Desarquivado',
  excluido: '🗑 Excluído',
  integridade_falhou: '⚠️ Falha de integridade',
}

function DetalhesModal({ open, onOpenChange, certId }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  certId: string
}) {
  const [tab, setTab] = useState<'geral' | 'acessos'>('geral')
  const [cert, setCert] = useState<Certificado | null>(null)
  const [acessos, setAcessos] = useState<AcessoLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setTab('geral')
    ;(trpc.certificadoDigital as any).getById.query({ id: certId })
      .then((data: Certificado) => setCert(data))
      .catch(() => setCert(null))
      .finally(() => setLoading(false))
  }, [open, certId])

  useEffect(() => {
    if (tab !== 'acessos' || !open) return
    ;(trpc.certificadoDigital as any).listAcessos.query({ id: certId })
      .then((data: AcessoLog[]) => setAcessos(data))
      .catch((e: Error) => alerts.error('Erro', e.message))
  }, [tab, certId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={ShieldCheck} color="fuchsia">
          <DialogTitle>{cert?.titular || 'Carregando...'}</DialogTitle>
          {cert && (
            <DialogDescription>
              {cert.tipo} · {formatDocumento(cert.documento)} · Expira em {formatDate(cert.expiraEm)}
            </DialogDescription>
          )}
        </DialogHeaderIcon>
        <div className="px-6 -mb-px flex border-b">
          <button
            type="button"
            onClick={() => setTab('geral')}
            className={cn('px-3 py-2 text-xs font-semibold border-b-2 -mb-px', tab === 'geral' ? 'border-fuchsia-500 text-fuchsia-700' : 'border-transparent text-muted-foreground')}
          >
            Geral
          </button>
          <button
            type="button"
            onClick={() => setTab('acessos')}
            className={cn('px-3 py-2 text-xs font-semibold border-b-2 -mb-px', tab === 'acessos' ? 'border-fuchsia-500 text-fuchsia-700' : 'border-transparent text-muted-foreground')}
          >
            Trilha de auditoria
          </button>
        </div>
        <DialogBody>
          {loading || !cert ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
            </div>
          ) : tab === 'geral' ? (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo" value={cert.tipo} />
                <Field label="Status"><StatusBadge status={cert.status} expiraEm={cert.expiraEm} /></Field>
                <Field label="Titular" value={cert.titular} />
                <Field label="Documento" value={formatDocumento(cert.documento)} mono />
                <Field label="Número de série" value={cert.numeroSerie || '—'} mono />
                <Field label="Emissor" value={cert.emissor || '—'} />
                <Field label="Emitido em" value={formatDate(cert.emitidoEm)} />
                <Field label="Expira em" value={formatDate(cert.expiraEm)} />
              </div>
              <div className="border-t pt-3 space-y-2">
                <Field label="Cliente" value={cert.cliente?.razaoSocial || '—'} />
                <Field label="Empresa" value={cert.empresa?.razaoSocial || '—'} />
                <Field label="Sócio" value={cert.socio?.nomeCompleto || '—'} />
              </div>
              {cert.observacoes && (
                <div className="border-t pt-3">
                  <Field label="Observações" value={cert.observacoes} />
                </div>
              )}

              {/* Histórico de versões anteriores (renovações) */}
              {(cert as any).versoesAnteriores && (cert as any).versoesAnteriores.length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <History className="h-3 w-3" /> Versões anteriores ({(cert as any).versoesAnteriores.length})
                  </p>
                  <div className="space-y-1.5">
                    {(cert as any).versoesAnteriores.map((v: { id: string; numeroSerie: string | null; emitidoEm: string; expiraEm: string; status: string }, idx: number) => (
                      <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-md border bg-muted/20 text-[11px]">
                        <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground font-mono text-[10px]">
                          v{(cert as any).versoesAnteriores.length - idx}
                        </span>
                        <div className="flex-1 min-w-0">
                          {v.numeroSerie && <p className="font-mono text-[10px] text-muted-foreground truncate">{v.numeroSerie}</p>}
                          <p>
                            Emitido em <strong>{formatDate(v.emitidoEm)}</strong>
                            {' '}· Expirou em <strong>{formatDate(v.expiraEm)}</strong>
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[9px]">{v.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2">
              {acessos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">Nenhum acesso registrado.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {acessos.map(a => (
                    <li key={a.id} className="py-2.5 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium">{ACAO_LABELS[a.acao] || a.acao}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {a.usuario?.name ?? 'usuário'} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                          {a.ipAddress && <> · IP {a.ipAddress}</>}
                        </p>
                        {a.detalhes && (
                          <p className="text-[11px] mt-1 italic text-foreground/80">"{a.detalhes}"</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value, children, mono }: { label: string; value?: string; children?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      {children ?? (
        <p className={cn('text-[13px]', mono && 'font-mono')}>{value}</p>
      )}
    </div>
  )
}

// ============================================================
// Modal: Renovar Certificado (cria nova versão vinculada ao antigo)
// ============================================================

function RenovarCertificadoModal({ target, onClose, onRenovado }: {
  target: Certificado | null
  onClose: () => void
  onRenovado: () => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [showSenha, setShowSenha] = useState(false)

  useEffect(() => {
    if (!target) {
      setArquivo(null); setSenha(''); setConfirmaSenha('')
      setObservacoes(''); setShowSenha(false)
    }
  }, [target])

  async function handleSalvar() {
    if (!target) return
    if (!arquivo) { alerts.error('Erro', 'Selecione o novo arquivo PFX'); return }
    if (!senha) { alerts.error('Erro', 'Informe a senha do novo certificado'); return }
    if (senha !== confirmaSenha) { alerts.error('Erro', 'As senhas não conferem'); return }
    if (arquivo.size > 5 * 1024 * 1024) { alerts.error('Erro', 'Arquivo maior que 5MB'); return }

    setSalvando(true)
    try {
      const buffer = await arquivo.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
      const pfxBase64 = btoa(binary)

      await (trpc.certificadoDigital as any).renovar.mutate({
        parentId: target.id,
        pfxBase64,
        senha,
        observacoes: observacoes || null,
      })
      await alerts.success('Renovado', `Versão antiga arquivada como histórico. O novo certificado já está disponível.`)
      onRenovado()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={RefreshCw} color="violet">
          <DialogTitle>Renovar certificado</DialogTitle>
          <DialogDescription>
            {target && (
              <>Substituindo <strong>{target.titular}</strong> · {formatDocumento(target.documento)} · expira em {formatDate(target.expiraEm)}.</>
            )}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <History className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed">
              O certificado atual será marcado como <strong>RENOVADO</strong> e ocultado da listagem padrão. Os vínculos (cliente/empresa/sócio) serão herdados automaticamente. O histórico de versões fica acessível pela tela de detalhes do novo certificado.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Novo arquivo PFX *</Label>
            <label
              className={cn(
                'flex items-center gap-3 px-4 py-3 border border-dashed rounded-md cursor-pointer transition-colors',
                arquivo ? 'border-fuchsia-300 bg-fuchsia-50/50 dark:bg-fuchsia-900/10' : 'border-border hover:bg-muted/30',
              )}
            >
              {arquivo ? <FileLock className="h-5 w-5 text-fuchsia-600" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                {arquivo ? (
                  <>
                    <p className="text-sm font-medium truncate">{arquivo.name}</p>
                    <p className="text-[11px] text-muted-foreground">{Math.round(arquivo.size / 1024)} KB · clique para trocar</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">Selecione o novo .pfx</p>
                    <p className="text-[11px] text-muted-foreground">Máx 5 MB</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Senha *</Label>
              <div className="relative">
                <Input
                  type={showSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="Senha do novo PFX"
                  className="h-9 text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Confirmar senha *</Label>
              <Input
                type={showSenha ? 'text' : 'password'}
                value={confirmaSenha}
                onChange={e => setConfirmaSenha(e.target.value)}
                placeholder="Repita a senha"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Observações da renovação</Label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Ex: renovado em campanha anual, novo emissor..."
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || !arquivo || !senha || senha !== confirmaSenha}
            style={{ backgroundColor: MODULE_COLOR }}
            className="text-white gap-1.5"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {salvando ? 'Renovando...' : 'Renovar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


// ============================================================
// Modal: Importar do Legado (OneClick V1)
// ============================================================

interface PreviewItem {
  legacyId: number
  arquivoNome: string
  cnpjLegado: string | null
  razaoLegado: string | null
  dtVencimento: string | null
  status: 'ok' | 'cliente_nao_encontrado' | 'senha_invalida' | 'arquivo_nao_encontrado' | 'ja_importado' | 'pfx_invalido' | 'vencido'
  vincularA?: 'cliente' | 'empresa' | null
  mensagem: string
  clienteRazao?: string
}

const STATUS_LABELS_IMPORT: Record<string, { label: string; color: string }> = {
  ok: { label: 'Pronto', color: 'emerald' },
  cliente_nao_encontrado: { label: 'Sem cliente', color: 'amber' },
  senha_invalida: { label: 'Senha não funciona', color: 'rose' },
  arquivo_nao_encontrado: { label: 'Arquivo não encontrado', color: 'rose' },
  ja_importado: { label: 'Já importado', color: 'sky' },
  pfx_invalido: { label: 'PFX inválido', color: 'rose' },
  vencido: { label: 'Vencido', color: 'amber' },
}


interface JobState {
  fase: 'conectando' | 'lendo_legado' | 'processando' | 'importando' | 'done' | 'error'
  total: number
  processed: number
  logs: Array<{ ts: number; level: 'info' | 'warn' | 'error' | 'success'; message: string }>
  result?: { items: PreviewItem[]; total: number; ok: number; erros: number }
  importResult?: { total: number; importados: number; pulados: number }
  error?: string
}

const FASE_LABELS: Record<string, string> = {
  conectando: 'Conectando ao MySQL legado',
  lendo_legado: 'Lendo certificados',
  processando: 'Validando arquivos PFX',
  importando: 'Importando certificados',
  done: 'Concluído',
  error: 'Erro',
}

function LegacyImportModal({ open, onOpenChange, empresaId, onImported }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  empresaId: string | null
  onImported: () => void
}) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [importando, setImportando] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [pollErrorCount, setPollErrorCount] = useState(0)
  const [empresas, setEmpresas] = useState<Array<{ id: string; razaoSocial: string }>>([])
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const logsRef = useRef<HTMLDivElement>(null)

  // Carrega lista de empresas quando abre (caso master sem empresa selecionada)
  useEffect(() => {
    if (!open) return
    ;(trpc.empresa as any).listForSelect.query()
      .then((list: Array<{ id: string; razaoSocial: string }>) => setEmpresas(list))
      .catch((e: Error) => console.error('[LegacyImport] listForSelect ERRO:', e))
  }, [open])

  // Define empresa inicial: usa a empresa do header se houver, senão deixa vazio (usuário escolhe)
  useEffect(() => {
    if (!open) {
      setEmpresaSelecionada('')
      return
    }
    if (empresaId) setEmpresaSelecionada(empresaId)
  }, [open, empresaId])

  // Quando usuário escolhe empresa, dispara o startPreview
  useEffect(() => {
    console.log('[LegacyImport] useEffect open=', open, 'empresaSelecionada=', empresaSelecionada)
    if (!open) {
      setJobId(null); setJob(null); setImportando(false); setBootError(null); setPollErrorCount(0)
      return
    }
    if (!empresaSelecionada) return  // espera o usuário escolher
    console.log('[LegacyImport] startPreview empresaId=', empresaSelecionada)
    const procedure = (trpc.certificadoDigital as any)?.legacyImportStartPreview
    console.log('[LegacyImport] procedure existe?', !!procedure, 'tem .mutate?', typeof procedure?.mutate)
    if (!procedure || typeof procedure.mutate !== 'function') {
      const msg = 'Endpoint legacyImportStartPreview não existe no client tRPC. Reinicie a API para registrar os novos procedures.'
      console.error('[LegacyImport]', msg)
      setBootError(msg)
      return
    }
    setBootError(null)
    setJobId(null)
    setJob(null)
    try {
      procedure.mutate({ empresaId: empresaSelecionada })
        .then((r: { jobId: string }) => {
          console.log('[LegacyImport] jobId recebido:', r.jobId)
          setJobId(r.jobId)
        })
        .catch((e: Error) => {
          console.error('[LegacyImport] startPreview ERRO:', e)
          setBootError(`startPreview falhou: ${e.message}`)
        })
    } catch (e) {
      console.error('[LegacyImport] startPreview erro síncrono:', e)
      setBootError(`Erro síncrono: ${(e as Error).message}`)
    }
  }, [open, empresaSelecionada])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      if (cancelled) return
      try {
        const state = await (trpc.certificadoDigital as any).legacyImportProgress.query({ jobId }) as JobState
        if (cancelled) return
        setJob(state)
        setPollErrorCount(0)
        // Continua polling enquanto:
        //   - fase ainda processando (conectando/lendo/processando/importando)
        //   - OU preview-done sem importResult E user já apertou Importar (importando=true)
        const isFinal = state.fase === 'error' || (state.fase === 'done' && state.importResult)
        const isPreviewWaitingUser = state.fase === 'done' && !state.importResult
        if (!isFinal && !isPreviewWaitingUser) {
          timer = setTimeout(tick, 600)
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[LegacyImport] poll ERRO:', e)
          setPollErrorCount(c => c + 1)
          timer = setTimeout(tick, 2000)
        }
      }
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [jobId, importando])

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [job?.logs.length])

  async function handleExecutar() {
    if (!jobId || !job?.result) return
    if (!await alerts.confirm({
      title: 'Confirmar importação',
      text: `${job.result.ok} certificado(s) serão importados. Os demais ficarão no log para revisão. Confirma?`,
      confirmText: 'Importar',
      icon: 'question',
    })) return
    setImportando(true)
    try {
      await (trpc.certificadoDigital as any).legacyImportStartImport.mutate({ jobId })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setImportando(false)
    }
  }

  useEffect(() => {
    if (job?.fase === 'done' && job.importResult && importando) {
      const result = job.importResult
      setImportando(false)
      onImported()
      setTimeout(() => {
        alerts.success('Importação concluída', `${result.importados} de ${result.total} importado(s).`)
      }, 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.fase, job?.importResult])

  const isProcessing = !!job && (job.fase === 'conectando' || job.fase === 'lendo_legado' || job.fase === 'processando' || job.fase === 'importando')
  const previewPronto = job?.fase === 'done' && job.result && !job.importResult

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={DatabaseBackup} color="fuchsia">
          <DialogTitle>Importar do OneClick V1</DialogTitle>
          <DialogDescription>
            {!job
              ? 'Iniciando job de importação...'
              : `${FASE_LABELS[job.fase] || job.fase}${job.total > 0 ? ` — ${job.processed}/${job.total}` : ''}`}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Empresa de destino</Label>
            <Select
              value={empresaSelecionada}
              onValueChange={setEmpresaSelecionada}
              disabled={!!jobId && !job?.importResult}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione a empresa para onde os certificados serão importados" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Os certificados serão associados a clientes desta empresa. O match é por CNPJ + razão social.
            </p>
          </div>

          {job && job.total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{FASE_LABELS[job.fase]}</span>
                <span className="tabular-nums">{job.processed} / {job.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, (job.processed / Math.max(job.total, 1)) * 100)}%`,
                    backgroundColor: job.fase === 'error' ? '#ef4444' : MODULE_COLOR,
                  }}
                />
              </div>
            </div>
          )}

          <div
            ref={logsRef}
            className="rounded border bg-zinc-950 text-zinc-100 px-3 py-2 font-mono text-[11px] leading-relaxed h-[260px] overflow-y-auto"
          >
            {bootError ? (
              <div className="text-rose-400">
                <div>✗ {bootError}</div>
                <div className="text-zinc-500 mt-1">Verifique se a API está rodando e se as credenciais do MySQL legado estão configuradas.</div>
              </div>
            ) : (!job || job.logs.length === 0) ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Aguardando início...
                </div>
                <div className="text-zinc-600 text-[10px]">
                  jobId: {jobId || '(ainda não criado)'}
                  {pollErrorCount > 0 && ` · poll falhou ${pollErrorCount}x`}
                </div>
              </div>
            ) : (
              job.logs.map((entry, i) => {
                const time = new Date(entry.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                const colorMap: Record<string, string> = {
                  info: 'text-zinc-300',
                  success: 'text-emerald-400',
                  warn: 'text-amber-400',
                  error: 'text-rose-400',
                }
                return (
                  <div key={i} className={cn('flex gap-2', colorMap[entry.level])}>
                    <span className="text-zinc-500 shrink-0">{time}</span>
                    <span className="break-words">{entry.message}</span>
                  </div>
                )
              })
            )}
            {isProcessing && (
              <div className="flex items-center gap-2 text-zinc-400 mt-1">
                <Loader2 className="h-3 w-3 animate-spin" /> processando...
              </div>
            )}
          </div>

          {previewPronto && job.result && job.result.items.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] font-semibold">
                Resumo: {job.result.ok} prontos · {job.result.erros} com problemas
              </p>
              <div className="max-h-[200px] overflow-y-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">CNPJ</th>
                      <th className="text-left px-3 py-1.5 font-medium">Razão</th>
                      <th className="text-left px-3 py-1.5 font-medium">Match</th>
                      <th className="text-left px-3 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.result.items.map(item => {
                      const s = STATUS_LABELS_IMPORT[item.status]
                      return (
                        <tr key={item.legacyId} className="border-t" title={item.mensagem}>
                          <td className="px-3 py-1 font-mono text-[10px]">{item.cnpjLegado || '—'}</td>
                          <td className="px-3 py-1 max-w-[160px] truncate">{item.razaoLegado || '—'}</td>
                          <td className="px-3 py-1 max-w-[180px] truncate text-muted-foreground">
                            {item.clienteRazao || '—'}
                            {item.vincularA === 'empresa' && (
                              <span className="ml-1 inline-flex items-center rounded bg-fuchsia-100 px-1 py-0.5 text-[9px] font-bold text-fuchsia-800">EMPRESA</span>
                            )}
                          </td>
                          <td className="px-3 py-1">
                            <span className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              s?.color === 'emerald' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                              s?.color === 'amber' && 'bg-amber-50 text-amber-700 border border-amber-200',
                              s?.color === 'rose' && 'bg-rose-50 text-rose-700 border border-rose-200',
                              s?.color === 'sky' && 'bg-sky-50 text-sky-700 border border-sky-200',
                            )}>
                              {s?.label || item.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>
            {job?.importResult ? 'Fechar' : 'Cancelar'}
          </Button>
          {previewPronto && job?.result && job.result.ok > 0 && (
            <Button
              onClick={handleExecutar}
              disabled={importando}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
              {importando ? 'Importando...' : `Importar ${job.result.ok} certificado(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface BulkResultFile {
  nome: string
  status: 'ok' | 'cliente_nao_encontrado' | 'senha_invalida' | 'pfx_invalido' | 'ja_importado' | 'vencido'
  pfxInfo?: {
    titular: string
    documento: string
    expiraEm: string  // serializado como ISO string via tRPC
    numeroSerie?: string
  }
  vincularA: 'cliente' | 'empresa' | null
  alvoId?: string
  alvoRazao?: string
  mensagem: string
}

interface BulkJobState {
  fase: 'processando' | 'importando' | 'done' | 'error'
  total: number
  processed: number
  logs: Array<{ ts: number; level: 'info' | 'warn' | 'error' | 'success'; message: string }>
  files?: BulkResultFile[]
  importResult?: { total: number; importados: number; pulados: number }
  error?: string
}

const BULK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ok: { label: 'Pronto', color: 'emerald' },
  cliente_nao_encontrado: { label: 'Sem cliente', color: 'amber' },
  senha_invalida: { label: 'Senha errada', color: 'rose' },
  pfx_invalido: { label: 'PFX inválido', color: 'rose' },
  ja_importado: { label: 'Já existe', color: 'sky' },
  vencido: { label: 'Vencido', color: 'amber' },
}

const BULK_FASE_LABELS: Record<string, string> = {
  processando: 'Validando arquivos PFX',
  importando: 'Importando',
  done: 'Concluído',
  error: 'Erro',
}

function BulkImportModal({ open, onOpenChange, empresaId, onImported }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  empresaId: string | null
  onImported: () => void
}) {
  const [empresas, setEmpresas] = useState<Array<{ id: string; razaoSocial: string }>>([])
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [files, setFiles] = useState<File[]>([])
  const [senhaPadrao, setSenhaPadrao] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<BulkJobState | null>(null)
  const [importando, setImportando] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logsRef = useRef<HTMLDivElement>(null)

  // Reset ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setJobId(null); setJob(null); setImportando(false); setBootError(null)
      setFiles([]); setSenhaPadrao(''); setEmpresaSelecionada('')
      return
    }
    if (empresaId) setEmpresaSelecionada(empresaId)
    ;(trpc.empresa as any).listForSelect.query()
      .then((list: Array<{ id: string; razaoSocial: string }>) => setEmpresas(list))
      .catch((e: Error) => console.error('[BulkImport] listForSelect ERRO:', e))
  }, [open, empresaId])

  // Auto-scroll dos logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [job?.logs.length])

  // Polling — continua durante a importação efetiva também
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      if (cancelled) return
      try {
        const state = await (trpc.certificadoDigital as any).bulkImportProgress.query({ jobId }) as BulkJobState
        if (cancelled) return
        setJob(state)
        const isFinal = state.fase === 'error' || (state.fase === 'done' && state.importResult)
        const isPreviewWaitingUser = state.fase === 'done' && !state.importResult
        if (!isFinal && !isPreviewWaitingUser) {
          timer = setTimeout(tick, 600)
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[BulkImport] poll error:', (e as Error).message)
          timer = setTimeout(tick, 2000)
        }
      }
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [jobId, importando])

  // Quando importação termina — fecha modal primeiro, depois alert (evita race no portal)
  useEffect(() => {
    if (job?.fase === 'done' && job.importResult && importando) {
      const result = job.importResult
      setImportando(false)
      onImported()
      setTimeout(() => {
        alerts.success('Importação concluída', `${result.importados} de ${result.total} importado(s).`)
      }, 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.fase, job?.importResult])

  function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list)
    const valid = arr.filter(f => /\.(pfx|p12)$/i.test(f.name))
    const rejected = arr.length - valid.length
    if (rejected > 0) alerts.error('Arquivos inválidos', `${rejected} arquivo(s) ignorado(s) — só .pfx ou .p12.`)
    setFiles(prev => {
      const nomesExistentes = new Set(prev.map(f => f.name))
      const novos = valid.filter(f => !nomesExistentes.has(f.name))
      return [...prev, ...novos]
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  function removeFile(nome: string) {
    setFiles(prev => prev.filter(f => f.name !== nome))
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove "data:...;base64," prefix
        const base64 = result.split(',')[1] || ''
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  async function handleAnalisar() {
    if (!empresaSelecionada) {
      alerts.error('Atenção', 'Selecione a empresa de destino.')
      return
    }
    if (files.length === 0) {
      alerts.error('Atenção', 'Adicione ao menos um arquivo PFX.')
      return
    }
    setBootError(null)
    setJobId(null)
    setJob(null)
    try {
      const filesPayload = await Promise.all(files.map(async f => ({
        nome: f.name,
        base64: await fileToBase64(f),
      })))
      const r = await (trpc.certificadoDigital as any).bulkImportStartPreview.mutate({
        empresaId: empresaSelecionada,
        senhaPadrao: senhaPadrao || undefined,
        files: filesPayload,
      })
      setJobId(r.jobId)
    } catch (e) {
      console.error('[BulkImport] startPreview ERRO:', e)
      setBootError(`Falha ao iniciar análise: ${(e as Error).message}`)
    }
  }

  async function handleImportar() {
    if (!jobId || !job?.files) return
    const ok = job.files.filter(f => f.status === 'ok').length
    if (ok === 0) {
      alerts.error('Sem itens válidos', 'Nenhum arquivo está pronto pra importar.')
      return
    }
    if (!await alerts.confirm({
      title: 'Confirmar importação',
      text: `${ok} certificado(s) válido(s) serão importado(s). Confirma?`,
      confirmText: 'Importar',
      icon: 'question',
    })) return
    setImportando(true)
    try {
      await (trpc.certificadoDigital as any).bulkImportStartImport.mutate({ jobId })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setImportando(false)
    }
  }

  const isPreviewRodando = !!job && (job.fase === 'processando' || job.fase === 'importando')
  const previewPronto = job?.fase === 'done' && job.files && !job.importResult
  const podeAnalisar = !jobId && empresaSelecionada && files.length > 0
  const okCount = job?.files?.filter(f => f.status === 'ok').length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px] max-h-[92vh] overflow-y-auto">
        <DialogHeaderIcon icon={UploadCloud} color="fuchsia">
          <DialogTitle>Importar PFX em Lote</DialogTitle>
          <DialogDescription>
            Arraste múltiplos certificados .pfx/.p12 — o sistema valida cada um e cadastra os válidos automaticamente.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {/* Empresa */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Empresa de destino</Label>
            <Select
              value={empresaSelecionada}
              onValueChange={setEmpresaSelecionada}
              disabled={!!jobId}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Senha padrão */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Senha padrão (opcional)</Label>
            <Input
              type="text"
              placeholder="Tentada antes do CNPJ/nome do arquivo. Deixe em branco para tentar só por padrões."
              value={senhaPadrao}
              onChange={e => setSenhaPadrao(e.target.value)}
              disabled={!!jobId}
              className="h-9 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Se todos os certs têm a mesma senha, informe aqui. Senão, o sistema tenta o CNPJ extraído do nome do arquivo.
            </p>
          </div>

          {/* Drop zone */}
          {!jobId && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                dragOver ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-zinc-300 hover:border-fuchsia-400 hover:bg-zinc-50',
              )}
            >
              <UploadCloud className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
              <div className="text-sm font-medium">
                Arraste arquivos .pfx/.p12 aqui
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ou clique pra selecionar múltiplos arquivos
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pfx,.p12"
                multiple
                hidden
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />
            </div>
          )}

          {/* Lista de arquivos */}
          {!jobId && files.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[12px] font-semibold">{files.length} arquivo(s) selecionado(s)</Label>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="text-[11px] text-rose-600 hover:underline"
                >
                  Limpar tudo
                </button>
              </div>
              <div className="max-h-[150px] overflow-y-auto border rounded">
                {files.map(f => (
                  <div key={f.name} className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0 text-xs">
                    <FileLock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <span className="flex-1 truncate font-mono">{f.name}</span>
                    <span className="text-zinc-500 tabular-nums">{(f.size / 1024).toFixed(1)} KB</span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.name)}
                      className="text-zinc-400 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progresso + logs */}
          {(jobId || bootError) && (
            <>
              {job && job.total > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{BULK_FASE_LABELS[job.fase]}</span>
                    <span className="tabular-nums">{job.processed} / {job.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${Math.min(100, (job.processed / Math.max(job.total, 1)) * 100)}%`,
                        backgroundColor: job.fase === 'error' ? '#ef4444' : MODULE_COLOR,
                      }}
                    />
                  </div>
                </div>
              )}

              <div
                ref={logsRef}
                className="rounded border bg-zinc-950 text-zinc-100 px-3 py-2 font-mono text-[11px] leading-relaxed h-[220px] overflow-y-auto"
              >
                {bootError ? (
                  <div className="text-rose-400">✗ {bootError}</div>
                ) : (!job || job.logs.length === 0) ? (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Iniciando...
                  </div>
                ) : (
                  job.logs.map((entry, i) => {
                    const time = new Date(entry.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    const colorMap: Record<string, string> = {
                      info: 'text-zinc-300',
                      success: 'text-emerald-400',
                      warn: 'text-amber-400',
                      error: 'text-rose-400',
                    }
                    return (
                      <div key={i} className={cn('flex gap-2', colorMap[entry.level])}>
                        <span className="text-zinc-500 shrink-0">{time}</span>
                        <span className="break-words">{entry.message}</span>
                      </div>
                    )
                  })
                )}
                {isPreviewRodando && (
                  <div className="flex items-center gap-2 text-zinc-400 mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> processando...
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tabela de preview */}
          {previewPronto && job.files && job.files.length > 0 && (
            <div className="space-y-1">
              <p className="text-[12px] font-semibold">
                Resumo: {okCount} prontos · {(job.files.length - okCount)} com problemas
              </p>
              <div className="max-h-[220px] overflow-y-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Arquivo</th>
                      <th className="text-left px-3 py-1.5 font-medium">Titular</th>
                      <th className="text-left px-3 py-1.5 font-medium">Match</th>
                      <th className="text-left px-3 py-1.5 font-medium">Vence em</th>
                      <th className="text-left px-3 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.files.map(f => {
                      const s = BULK_STATUS_LABELS[f.status]
                      const venc = f.pfxInfo?.expiraEm ? new Date(f.pfxInfo.expiraEm).toLocaleDateString('pt-BR') : '—'
                      return (
                        <tr key={f.nome} className="border-t" title={f.mensagem}>
                          <td className="px-3 py-1 max-w-[150px] truncate font-mono text-[10px]">{f.nome}</td>
                          <td className="px-3 py-1 max-w-[160px] truncate">{f.pfxInfo?.titular || '—'}</td>
                          <td className="px-3 py-1 max-w-[160px] truncate text-muted-foreground">
                            {f.alvoRazao || '—'}
                            {f.vincularA === 'empresa' && (
                              <span className="ml-1 inline-flex items-center rounded bg-fuchsia-100 px-1 py-0.5 text-[9px] font-bold text-fuchsia-800">EMPRESA</span>
                            )}
                          </td>
                          <td className="px-3 py-1 tabular-nums">{venc}</td>
                          <td className="px-3 py-1">
                            <span className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              s?.color === 'emerald' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                              s?.color === 'amber' && 'bg-amber-50 text-amber-700 border border-amber-200',
                              s?.color === 'rose' && 'bg-rose-50 text-rose-700 border border-rose-200',
                              s?.color === 'sky' && 'bg-sky-50 text-sky-700 border border-sky-200',
                            )}>
                              {s?.label || f.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>
            {job?.importResult ? 'Fechar' : 'Cancelar'}
          </Button>
          {!jobId && (
            <Button
              onClick={handleAnalisar}
              disabled={!podeAnalisar}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              <FileCheck className="h-4 w-4" /> Analisar {files.length > 0 ? `(${files.length})` : ''}
            </Button>
          )}
          {previewPronto && okCount > 0 && (
            <Button
              onClick={handleImportar}
              disabled={importando}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {importando ? 'Importando...' : `Importar ${okCount} certificado(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
