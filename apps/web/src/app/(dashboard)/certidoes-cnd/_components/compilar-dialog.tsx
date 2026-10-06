'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Download, ExternalLink, Loader2, Mail, Play, RefreshCw } from 'lucide-react'
import {
  Button, Checkbox, Input, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { limparCnpj } from '@/lib/masks'
import { MODULE_COLOR, LoteItemIcon, formatDoc, documentoValido } from '../_lib/ui'
import { carregarClientesMensais } from '../_lib/api'
import { ClientePicker, type ClienteOpcao } from './dialogs'

const TIPOS = [
  { key: 'federal', label: 'CND Federal (PGFN/RFB)' },
  { key: 'estadual', label: 'CND Estadual (SEFAZ ES)' },
  { key: 'municipal', label: 'CND Municipal' },
  { key: 'trabalhista', label: 'CNDT Trabalhista (TST)' },
  { key: 'fgts', label: 'CRF/FGTS (Caixa)' },
  { key: 'cgu', label: 'CGU (Certidão Correcional)' },
  { key: 'alvara_bombeiros', label: 'Alvará Bombeiros (CBMES)' },
  { key: 'alvara_funcionamento', label: 'Alvará de Funcionamento (Prefeitura)' },
] as const
type TipoCompilar = typeof TIPOS[number]['key']

interface Passo { hora: string; texto: string; nivel: 'info' | 'ok' | 'erro' }
interface ItemProgresso {
  tipo: string; label: string; status: string
  etapa?: string; mensagem?: string; detalhe?: string; situacao?: string | null
  registroId?: string | null; registroTipo?: string; temPdf?: boolean; reaproveitada?: boolean
  urlManual?: string | null
  historico?: Passo[]
}
interface Progresso {
  status: string; items: ItemProgresso[]; current: number; total: number
  razaoSocial?: string; documento?: string
  clientes?: Array<{ id: string; razaoSocial: string }>
  iniciadoEm?: string; concluidoEm?: string
}

const horaCurta = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

/** Linha do tempo de uma certidão: o que aconteceu, passo a passo (é o "log" para o usuário). */
function LinhaDoTempo({ item }: { item: ItemProgresso }) {
  const passos = item.historico ?? []
  return (
    <div className="space-y-1 border-t bg-muted/20 px-3 py-2">
      {passos.length === 0 && <p className="text-[11px] text-muted-foreground">Ainda não começou.</p>}
      {passos.map((p, k) => (
        <div key={k} className="flex gap-2 text-[11px]">
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{p.hora}</span>
          <span className={cn(p.nivel === 'erro' ? TEXT.red : p.nivel === 'ok' ? TEXT.emerald : 'text-foreground')}>{p.texto}</span>
        </div>
      ))}
      {item.detalhe && (
        <p className="break-all pt-1 font-mono text-[10px] text-muted-foreground" title="Erro técnico original">Detalhe técnico: {item.detalhe}</p>
      )}
    </div>
  )
}

/** Tom da situação devolvida por cada rotina (texto livre). */
function tomSituacao(sit: string) {
  const s = sit.toLowerCase()
  if (/positiva.*efeito/.test(s)) return TEXT.amber
  if (/positiva|irregular|^consta/.test(s)) return TEXT.red
  if (/negativa|nada consta|regular|emitid/.test(s)) return TEXT.emerald
  return 'text-muted-foreground'
}

/**
 * Compila as certidões de um cliente e envia por e-mail. O progresso é por
 * usuário no backend; o reprocessamento de um item preserva os demais.
 */
export function CompilarDialog({ open, onOpenChange, onConcluido }: { open: boolean; onOpenChange: (o: boolean) => void; onConcluido: () => void }) {
  const [step, setStep] = useState<'cnpj' | 'opcoes' | 'progresso' | 'resumo'>('cnpj')
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [doc, setDoc] = useState('')
  const [razao, setRazao] = useState('')
  const [tipos, setTipos] = useState<Set<TipoCompilar>>(new Set(TIPOS.map(t => t.key)))
  const [forcar, setForcar] = useState(false)
  const [prog, setProg] = useState<Progresso | null>(null)
  const [email, setEmail] = useState('')
  const [contatos, setContatos] = useState<Array<{ email: string; nome: string | null }>>([])
  const [salvarContato, setSalvarContato] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [aberto, setAberto] = useState<Set<number>>(new Set())
  const [baixando, setBaixando] = useState<number | null>(null)
  const alternar = (i: number) => setAberto(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const parar = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  useEffect(() => {
    if (!open) { parar(); return }
    setStep('cnpj'); setClienteId(''); setDoc(''); setRazao(''); setEmail(''); setMsg(null); setProg(null); setAberto(new Set())
    setTipos(new Set(TIPOS.map(t => t.key))); setForcar(false); setContatos([]); setSalvarContato(false)
    setCarregando(true)
    carregarClientesMensais().then(setClientes).catch(() => setClientes([])).finally(() => setCarregando(false))
    return parar
  }, [open])

  const docLimpo = limparCnpj(doc)

  async function gerar() {
    setStep('progresso')
    try {
      await trpcMutate('cnd.processarLote', { documento: docLimpo, tipos: Array.from(tipos), forcarNova: forcar })
      const tick = async () => {
        const p = await trpc.cnd.compilarProgress.query() as Progresso
        setProg(p)
        if (p?.razaoSocial) setRazao(p.razaoSocial)
        if (p?.status === 'done') {
          parar()
          trpc.cnd.clienteContatos.query({ documento: docLimpo })
            .then(c => setContatos(c as typeof contatos)).catch(() => setContatos([]))
          onConcluido()
          setStep('resumo')
        }
      }
      parar()
      pollRef.current = setInterval(() => { tick().catch(() => {}) }, 2000)
      await tick()
    } catch (e) { alerts.error('Erro', (e as Error).message); setStep('opcoes') }
  }

  async function reprocessar(i: number, item: ItemProgresso) {
    try {
      setProg(prev => prev ? { ...prev, items: prev.items.map((it, k) => k === i ? { ...it, status: 'processando', mensagem: undefined, etapa: 'Iniciando nova tentativa' } : it) } : prev)
      setAberto(prev => new Set(prev).add(i))
      await trpc.cnd.compilarRetry.mutate({ documento: docLimpo, tipo: item.tipo as TipoCompilar, itemIndex: i })
      const poll = setInterval(async () => {
        try {
          const p = await trpc.cnd.compilarProgress.query() as Progresso
          const novo = p?.items[i]
          if (novo) setProg(prev => prev ? { ...prev, items: prev.items.map((it, k) => k === i ? novo : it) } : prev)
          if (p?.status === 'done') { clearInterval(poll); onConcluido() }
        } catch { /* próximo ciclo */ }
      }, 2000)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function baixar(i: number, item: ItemProgresso) {
    if (!item.registroId || !item.registroTipo) return
    setBaixando(i)
    try {
      const r = await trpc.cnd.certidaoPdf.query({ tipo: item.registroTipo, id: item.registroId }) as { pdfBase64: string | null }
      if (!r.pdfBase64) { alerts.error('PDF indisponível', 'O documento não está mais na base.'); return }
      const bytes = Uint8Array.from(atob(r.pdfBase64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.label.replace(/[^\p{L}\p{N}]+/gu, '_')}_${docLimpo}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) { alerts.error('Erro ao baixar', (e as Error).message) }
    finally { setBaixando(null) }
  }

  async function enviar() {
    setEnviando(true); setMsg(null)
    try {
      const r = await trpc.cnd.compilarEnviar.mutate({ email, documento: docLimpo, razaoSocial: razao }) as { message: string }
      let texto = r.message
      if (salvarContato && !contatos.some(c => c.email.toLowerCase() === email.toLowerCase())) {
        try {
          await trpc.cnd.salvarContato.mutate({ documento: docLimpo, email })
          setContatos(prev => [...prev, { email, nome: null }])
          texto += ' | Contato salvo nos cadastros do cliente.'
        } catch { /* o e-mail já foi; o contato é opcional */ }
      }
      setMsg({ ok: true, texto })
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }) }
    finally { setEnviando(false) }
  }

  const anexos = prog?.items.filter(i => i.status === 'sucesso').length ?? 0
  const pct = prog && prog.total > 0 ? (prog.current / prog.total) * 100 : 0
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && step === 'progresso') return; onOpenChange(o) }}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={Mail} color="emerald">
          <DialogTitle>Compilar e enviar certidões</DialogTitle>
          <DialogDescription>
            {step === 'cnpj' && 'Escolha o cliente'}
            {step === 'opcoes' && 'Selecione as certidões e opções'}
            {step === 'progresso' && 'Gerando certidões...'}
            {step === 'resumo' && 'Resumo e envio por e-mail'}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {step === 'cnpj' && (<>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Cliente mensal</label>
              <ClientePicker clientes={clientes} carregando={carregando} selecionado={clienteId}
                onSelect={c => { setClienteId(c.id); setDoc(formatDoc(c.documento)); setRazao(c.razaoSocial) }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">ou CNPJ do cliente</label>
              <Input value={doc} onChange={e => { setDoc(e.target.value); setClienteId(''); setRazao('') }} placeholder="00.000.000/0000-00" className="h-9 font-mono text-sm" />
            </div>
          </>)}

          {step === 'opcoes' && (<>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium">{razao || formatDoc(docLimpo)}</p>
              <p className="font-mono text-xs text-muted-foreground">{formatDoc(docLimpo)}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Certidões a incluir</label>
              <div className="grid gap-1 sm:grid-cols-2">
                {TIPOS.map(t => (
                  <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/30">
                    <Checkbox checked={tipos.has(t.key)} onCheckedChange={c => setTipos(prev => { const n = new Set(prev); if (c) n.add(t.key); else n.delete(t.key); return n })} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs">
              <Checkbox checked={forcar} onCheckedChange={v => setForcar(!!v)} />Forçar novas consultas (ignorar certidões existentes)
            </label>
          </>)}

          {step === 'progresso' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium tabular-nums">{prog?.current ?? 0}/{prog?.total ?? tipos.size}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: MODULE_COLOR }} /></div>
              {prog?.razaoSocial && (
                <p className="text-xs text-muted-foreground">{prog.razaoSocial} · <span className="font-mono">{formatDoc(docLimpo)}</span></p>
              )}
              <div className="nice-scrollbar max-h-[340px] overflow-y-auto rounded-lg border">
                {(prog?.items ?? []).map((item, i) => {
                  // O que mostrar ao lado: a etapa ao vivo enquanto roda; depois, o resultado.
                  const linha = item.status === 'processando' ? (item.etapa || 'Processando...')
                    : item.status === 'pendente' ? 'Aguardando a vez'
                    : item.status === 'falha' ? item.mensagem
                    : (item.situacao || item.mensagem || '')
                  return (
                    <div key={i} className="border-b last:border-b-0">
                      <button type="button" onClick={() => alternar(i)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/30">
                        <LoteItemIcon status={item.status} />
                        <span className="w-[170px] shrink-0 truncate font-medium">{item.label}</span>
                        <span className={cn('min-w-0 flex-1 truncate', item.status === 'falha' ? TEXT.red : item.status === 'processando' ? 'text-foreground' : 'text-muted-foreground')}>{linha}</span>
                        {aberto.has(i) ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      </button>
                      {aberto.has(i) && <LinhaDoTempo item={item} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step === 'resumo' && prog && (<>
            {/* Para quem foi a consulta — entra também no e-mail. */}
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              {(prog.clientes && prog.clientes.length > 0 ? prog.clientes : [{ id: '', razaoSocial: razao || formatDoc(docLimpo) }]).map(c => (
                <div key={c.id || c.razaoSocial} className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.razaoSocial}</p>
                  {c.id && (
                    <Link href={`/clientes/${c.id}`} target="_blank" className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-medium hover:underline', TEXT.sky)}>
                      Abrir cadastro<ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{formatDoc(docLimpo)}</span>
                {prog.concluidoEm && <> · consultado em {horaCurta(prog.concluidoEm)}</>}
              </p>
            </div>
            <div className="nice-scrollbar max-h-[360px] overflow-y-auto rounded-lg border">
              {prog.items.map((item, i) => (
                <div key={i} className="border-b last:border-b-0">
                  <div className="flex items-center gap-2 px-3 py-2 text-xs">
                    <LoteItemIcon status={item.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.label}</p>
                      <p className={cn('text-[11px] leading-snug', item.status === 'falha' ? TEXT.red : tomSituacao(item.situacao || ''))}>
                        {item.status === 'processando' ? (item.etapa || 'Processando...') : item.status === 'falha' ? (item.mensagem || 'Não emitida') : (item.mensagem || item.situacao || '—')}
                        {item.reaproveitada && <span className="text-muted-foreground"> · já estava válida na base</span>}
                      </p>
                    </div>
                    {item.temPdf && item.registroId && (
                      <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[11px]" disabled={baixando === i} onClick={() => baixar(i, item)}>
                        {baixando === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}PDF
                      </Button>
                    )}
                    {/* Plano B: quando a automação não consegue, emite-se à mão no portal. */}
                    {(item.status === 'falha' || item.status === 'sem_pdf') && item.urlManual && (
                      <Button asChild variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[11px]" title="Abre o portal oficial para emitir manualmente">
                        <a href={item.urlManual} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" />Emitir manualmente</a>
                      </Button>
                    )}
                    {(item.status === 'falha' || item.status === 'sem_pdf') && (
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" title="Tentar novamente" onClick={() => reprocessar(i, item)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" title="Ver o que aconteceu" onClick={() => alternar(i)}>
                      {aberto.has(i) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {aberto.has(i) && <LinhaDoTempo item={item} />}
                </div>
              ))}
            </div>
            {prog.clientes && prog.clientes.length > 0 && anexos > 0 && (
              <p className="text-[11px] text-muted-foreground">As certidões emitidas já constam na aba Legalização do cadastro do cliente.</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs font-medium">
              <span className={TEXT.emerald}>{anexos} anexo(s)</span>
              <span className={TEXT.red}>{prog.items.filter(i => i.status === 'falha').length} falha(s)</span>
              <span className={TEXT.amber}>{prog.items.filter(i => i.status === 'sem_pdf').length} sem PDF</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">E-mail do destinatário</label>
              {contatos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contatos.map(c => (
                    <Button key={c.email} type="button" size="sm" variant={email === c.email ? 'soft' : 'outline'} className="h-7 gap-1 text-[11px]" onClick={() => setEmail(c.email)}>
                      <Mail className="h-3 w-3" />{c.nome ? `${c.nome} — ${c.email}` : c.email}
                    </Button>
                  ))}
                </div>
              )}
              <Input value={email} onChange={e => { setEmail(e.target.value); setSalvarContato(false) }} placeholder="email@exemplo.com" className="h-9 text-sm" type="email" />
              {email && !contatos.some(c => c.email.toLowerCase() === email.toLowerCase()) && (
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox checked={salvarContato} onCheckedChange={v => setSalvarContato(!!v)} />Salvar este e-mail nos contatos do cliente
                </label>
              )}
            </div>
            {msg && <p className={cn('flex items-center gap-1.5 text-xs font-medium', msg.ok ? TEXT.emerald : TEXT.red)}>{msg.ok && <CheckCircle2 className="h-3.5 w-3.5" />}{msg.texto}</p>}
          </>)}
        </DialogBody>
        <DialogFooter>
          {step === 'cnpj' && (<>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" disabled={!documentoValido(doc)} onClick={() => setStep('opcoes')}>Avançar<ArrowRight className="h-3.5 w-3.5" /></Button>
          </>)}
          {step === 'opcoes' && (<>
            <Button variant="outline" size="sm" onClick={() => setStep('cnpj')}>Voltar</Button>
            <Button size="sm" className="gap-1.5" disabled={tipos.size === 0} onClick={gerar}><Play className="h-3.5 w-3.5" />Gerar certidões</Button>
          </>)}
          {step === 'resumo' && (<>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button size="sm" className="gap-1.5" disabled={!email || enviando || anexos === 0} onClick={enviar}>
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Enviar e-mail
            </Button>
          </>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
