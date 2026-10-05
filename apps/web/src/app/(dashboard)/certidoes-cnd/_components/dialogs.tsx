'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Search, RefreshCw, Play, Download, type LucideIcon } from 'lucide-react'
import {
  Button, Input, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { SURFACE, TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { alerts } from '@/lib/alerts'
import { limparCnpj } from '@/lib/masks'
import { MODULE_COLOR, LoteItemIcon, formatDoc, documentoValido } from '../_lib/ui'

// ============================================================
// Seletor de cliente (lista com busca + escolha única)
// ============================================================

export interface ClienteOpcao { id: string; razaoSocial: string; documento: string }

export function ClientePicker({ clientes, carregando, selecionado, onSelect, vazio = 'Nenhum cliente mensal' }: {
  clientes: ClienteOpcao[]
  carregando?: boolean
  selecionado: string
  onSelect: (c: ClienteOpcao) => void
  vazio?: string
}) {
  const [busca, setBusca] = useState('')
  const t = busca.trim().toLowerCase()
  const tDoc = limparCnpj(busca)
  const lista = clientes.filter(c => !t || c.razaoSocial.toLowerCase().includes(t) || (tDoc.length > 0 && limparCnpj(c.documento).includes(tDoc)))
  return (
    <div className="space-y-1.5">
      <Input placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 text-xs" />
      <div className="nice-scrollbar max-h-[220px] overflow-y-auto rounded-lg border">
        {carregando ? (
          <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">{clientes.length === 0 ? vazio : 'Nenhum cliente encontrado'}</div>
        ) : lista.map(c => (
          <button key={c.id} type="button" onClick={() => onSelect(c)}
            className={cn('flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted/40',
              selecionado === c.id && 'bg-muted/60 font-medium')}>
            <span className={cn('h-3 w-3 shrink-0 rounded-full border', selecionado === c.id ? 'border-[5px]' : 'border-border')}
              style={selecionado === c.id ? { borderColor: MODULE_COLOR } : undefined} />
            <span className="min-w-0 flex-1 truncate">{c.razaoSocial}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDoc(c.documento)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Consulta individual
// ============================================================

export interface ResultadoConsulta { sucesso: boolean; mensagem: string; aviso?: string }

/**
 * Modal único de consulta individual: escolhe um cliente da lista ou informa o
 * documento à mão, acompanha a etapa no portal (quando a rotina publica) e
 * mostra o resultado ali mesmo. Substitui os `prompt()` do navegador e os
 * quatro modais montados à mão com `<div fixed>`.
 */
export function ConsultaDialog({
  open, onOpenChange, titulo, descricao, icon, carregarClientes, modo = 'documento',
  rotuloManual, consultar, pollEtapa, extra, onConcluido,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo: string
  descricao?: string
  icon: LucideIcon
  carregarClientes?: () => Promise<ClienteOpcao[]>
  /** `razaoSocial`: o alvo é o nome (Alvará Bombeiros pesquisa por razão social). */
  modo?: 'documento' | 'razaoSocial'
  rotuloManual?: string
  consultar: (alvo: { documento: string; razaoSocial: string; clienteId?: string }) => Promise<ResultadoConsulta>
  pollEtapa?: () => Promise<string>
  extra?: ReactNode
  onConcluido?: () => void
}) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [selecionado, setSelecionado] = useState('')
  const [manual, setManual] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null)
  const [etapa, setEtapa] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) return
    setSelecionado(''); setManual(''); setStatus('idle'); setResultado(null); setEtapa('')
    if (!carregarClientes) return
    setCarregando(true)
    carregarClientes().then(setClientes).catch(() => setClientes([])).finally(() => setCarregando(false))
  }, [open, carregarClientes])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const cli = clientes.find(c => c.id === selecionado)
  const alvoOk = modo === 'razaoSocial' ? manual.trim().length >= 3 : documentoValido(manual)

  async function executar() {
    if (!alvoOk) return
    setStatus('loading'); setResultado(null); setEtapa('Iniciando consulta...')
    if (pollEtapa) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(() => { pollEtapa().then(e => { if (e) setEtapa(e) }).catch(() => {}) }, 2000)
    }
    try {
      const r = await consultar({
        documento: modo === 'documento' ? limparCnpj(manual) : (cli?.documento ?? ''),
        razaoSocial: modo === 'razaoSocial' ? manual.trim() : (cli?.razaoSocial ?? ''),
        clienteId: cli && (modo === 'razaoSocial' ? cli.razaoSocial === manual.trim() : limparCnpj(cli.documento) === limparCnpj(manual)) ? cli.id : undefined,
      })
      setResultado(r)
      setStatus(r.sucesso ? 'success' : 'error')
      onConcluido?.()
    } catch (e) {
      setResultado({ sucesso: false, mensagem: (e as Error).message })
      setStatus('error')
    } finally {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      setEtapa('')
    }
  }

  const ocupado = status === 'loading'
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && ocupado) return; onOpenChange(o) }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeaderIcon icon={icon} color="sky">
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {status === 'idle' && (<>
            {carregarClientes && (
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold">Cliente mensal</label>
                <ClientePicker clientes={clientes} carregando={carregando} selecionado={selecionado}
                  onSelect={c => { setSelecionado(c.id); setManual(modo === 'razaoSocial' ? c.razaoSocial : formatDoc(c.documento)) }} />
                <p className="text-center text-[11px] text-muted-foreground">ou informe manualmente</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">{rotuloManual ?? (modo === 'razaoSocial' ? 'Razão social' : 'CNPJ / CPF')}</label>
              <Input value={manual} onChange={e => { setManual(e.target.value); setSelecionado('') }}
                placeholder={modo === 'razaoSocial' ? 'Mínimo 3 letras' : '00.000.000/0000-00'}
                className={cn('h-9 text-sm', modo === 'documento' && 'font-mono')}
                onKeyDown={e => { if (e.key === 'Enter') executar() }} />
            </div>
            {extra}
          </>)}
          {status === 'loading' && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium">Consultando {modo === 'razaoSocial' ? manual : formatDoc(manual)}...</p>
                <p className="text-[11px] text-muted-foreground">{etapa || 'Aguarde enquanto o portal responde'}</p>
              </div>
            </div>
          )}
          {(status === 'success' || status === 'error') && resultado && (
            <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', status === 'success' ? SURFACE.emerald : SURFACE.red)}>
              {status === 'success'
                ? <CheckCircle2 className={cn('mt-0.5 h-5 w-5 shrink-0', TEXT.emerald)} />
                : <XCircle className={cn('mt-0.5 h-5 w-5 shrink-0', TEXT.red)} />}
              <div className="min-w-0">
                <p className={cn('text-xs font-semibold', status === 'success' ? TEXT.emerald : TEXT.red)}>{status === 'success' ? 'Consulta concluída' : 'Não foi possível emitir'}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{resultado.mensagem}</p>
              </div>
            </div>
          )}
          {resultado?.aviso && (
            <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px]', SURFACE.amber)}>
              <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TEXT.amber)} />
              <span className={TEXT.amber}>{resultado.aviso}</span>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={ocupado}>Fechar</Button>
          {status === 'idle' ? (
            <Button size="sm" className="gap-1.5" disabled={!alvoOk} onClick={executar}>
              <Search className="h-3.5 w-3.5" />Consultar
            </Button>
          ) : status !== 'loading' && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setStatus('idle'); setResultado(null); setSelecionado(''); setManual('') }}>
              <RefreshCw className="h-3.5 w-3.5" />Nova consulta
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Consulta em lote (confirmação + progresso)
// ============================================================

export interface LoteProgresso {
  status: string
  total: number
  current: number
  /** Emitidas / encontrados. */
  ok: number
  /** Não emitidas / não encontrados. */
  nok: number
  erros: number
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: string; erro?: string }>
}

/** Normaliza os formatos de progresso das rotinas (emitidas × encontrados). */
export function normalizarLote(p: Record<string, unknown> | null | undefined): LoteProgresso | null {
  if (!p) return null
  const n = (k: string) => Number(p[k] ?? 0) || 0
  return {
    status: String(p.status ?? 'idle'),
    total: n('total'), current: n('current'),
    ok: n('emitidas') || n('encontrados'),
    nok: n('naoEmitidas') || n('naoEncontrados'),
    erros: n('erros'), pulados: n('pulados'),
    currentCliente: String(p.currentCliente ?? ''),
    items: Array.isArray(p.items) ? p.items as LoteProgresso['items'] : [],
  }
}

/**
 * Lote de uma rotina: primeiro confirma (com a opção de forçar nova emissão
 * onde o backend aceita), depois acompanha o progresso. Se já houver um lote
 * rodando quando o modal abre, vai direto para o acompanhamento.
 */
export function LoteDialog({
  open, onOpenChange, titulo, icon, descricao, iniciar, progresso, rotulos, permiteForcar, onConcluido,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo: string
  icon: LucideIcon
  descricao: string
  iniciar: (forcarNova: boolean) => Promise<void>
  progresso: () => Promise<LoteProgresso | null>
  rotulos: { ok: string; nok: string }
  permiteForcar?: boolean
  onConcluido?: () => void
}) {
  const [fase, setFase] = useState<'confirmar' | 'progresso'>('confirmar')
  const [forcar, setForcar] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [prog, setProg] = useState<LoteProgresso | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const parar = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  function acompanhar() {
    parar()
    pollRef.current = setInterval(async () => {
      try {
        const p = await progresso()
        setProg(p)
        if (p && p.status !== 'running') { parar(); onConcluido?.() }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 2000)
  }

  useEffect(() => {
    if (!open) { parar(); return }
    setFase('confirmar'); setForcar(false); setProg(null)
    progresso().then(p => { if (p?.status === 'running') { setProg(p); setFase('progresso'); acompanhar() } }).catch(() => {})
    return parar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function comecar() {
    setIniciando(true)
    try {
      await iniciar(forcar)
      setFase('progresso')
      setProg(await progresso().catch(() => null))
      acompanhar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setIniciando(false) }
  }

  const rodando = prog?.status === 'running'
  const pct = prog && prog.total > 0 ? (prog.current / prog.total) * 100 : 0
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && rodando) return; onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={icon} color="sky">
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{fase === 'confirmar' ? 'Consulta em lote' : rodando ? 'Consultando...' : prog?.status === 'done' ? 'Concluído' : 'Iniciando...'}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {fase === 'confirmar' ? (<>
            <p className="text-sm text-muted-foreground">{descricao}</p>
            {permiteForcar && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs">
                <Checkbox checked={forcar} onCheckedChange={v => setForcar(!!v)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Forçar nova emissão</span>
                  <span className="block text-muted-foreground">Sem isso, cliente com certidão ainda válida é pulado (economiza captcha e consulta paga).</span>
                </span>
              </label>
            )}
          </>) : prog && (<>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium tabular-nums">{prog.current} / {prog.total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: MODULE_COLOR }} />
              </div>
            </div>
            {rodando && prog.currentCliente && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 shrink-0 animate-spin" /><span className="truncate">{prog.currentCliente}</span></div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                { v: prog.ok, l: rotulos.ok, c: TEXT.emerald },
                { v: prog.nok, l: rotulos.nok, c: TEXT.amber },
                { v: prog.erros, l: 'Erros', c: TEXT.red },
                { v: prog.pulados, l: 'Já válidas', c: TEXT.sky },
              ]).map(k => (
                <div key={k.l} className="rounded-lg border bg-muted/30 p-2 text-center">
                  <p className={cn('text-lg font-bold tabular-nums', k.c)}>{k.v}</p>
                  <p className="text-[10px] text-muted-foreground">{k.l}</p>
                </div>
              ))}
            </div>
            <div className="nice-scrollbar max-h-[250px] space-y-0.5 overflow-y-auto rounded-lg border p-2">
              {prog.items.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Aguardando...</p>
              ) : [...prog.items].reverse().map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 py-0.5 text-[11px]">
                  <LoteItemIcon status={item.status} />
                  <span className={cn('min-w-0 truncate', item.status === 'pendente' && 'text-muted-foreground', item.status === 'erro' && TEXT.red)}>
                    {item.razaoSocial}{item.erro && <span className="ml-1 text-[10px] text-muted-foreground">({item.erro})</span>}
                  </span>
                </div>
              ))}
            </div>
          </>)}
        </DialogBody>
        <DialogFooter>
          {fase === 'confirmar' ? (<>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" disabled={iniciando} onClick={comecar}>
              {iniciando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Iniciar
            </Button>
          </>) : (
            <Button variant="outline" size="sm" disabled={rodando} onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Visualizar PDF (base64)
// ============================================================

export function PdfDialog({ pdf, onClose, titulo, icon, nomeArquivo, aviso }: {
  pdf: string | null
  onClose: () => void
  titulo: string
  icon: LucideIcon
  nomeArquivo: string
  aviso?: string | null
}) {
  const href = pdf ? `data:application/pdf;base64,${pdf}` : ''
  return (
    <Dialog open={!!pdf} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col">
        <DialogHeaderIcon icon={icon} color="sky"><DialogTitle>{titulo}</DialogTitle></DialogHeaderIcon>
        {aviso && (
          <div className={cn('flex shrink-0 items-start gap-2 border-b px-5 py-2 text-[11px]', SURFACE.amber)}>
            <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TEXT.amber)} /><span className={TEXT.amber}>{aviso}</span>
          </div>
        )}
        <div className="min-h-0 flex-1">{pdf && <iframe src={href} className="h-full w-full" title={titulo} />}</div>
        <DialogFooter>
          <Button variant="outline" size="sm" asChild className="gap-1.5"><a href={href} download={nomeArquivo}><Download className="h-3.5 w-3.5" />Baixar PDF</a></Button>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
