'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2, Mail, Play, RefreshCw } from 'lucide-react'
import {
  Button, Checkbox, Input, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { FILL, TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { limparCnpj } from '@/lib/masks'
import { LoteItemIcon, formatDoc, documentoValido } from '../_lib/ui'
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

interface ItemProgresso { tipo: string; label: string; status: string; mensagem?: string; situacao?: string }
interface Progresso { status: string; items: ItemProgresso[]; current: number; total: number; razaoSocial?: string }

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const parar = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  useEffect(() => {
    if (!open) { parar(); return }
    setStep('cnpj'); setClienteId(''); setDoc(''); setRazao(''); setEmail(''); setMsg(null); setProg(null)
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
      setProg(prev => prev ? { ...prev, items: prev.items.map((it, k) => k === i ? { ...it, status: 'processando', mensagem: undefined } : it) } : prev)
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
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', FILL.emerald)} style={{ width: `${pct}%` }} /></div>
              <div className="nice-scrollbar max-h-[250px] overflow-y-auto rounded-lg border">
                {(prog?.items ?? []).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                    <LoteItemIcon status={item.status} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.status === 'falha' && <span className={cn('max-w-[180px] truncate', TEXT.red)}>{item.mensagem}</span>}
                    {item.status === 'sem_pdf' && <span className={TEXT.amber}>Sem PDF</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'resumo' && prog && (<>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certidão / Alvará</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-[60px] text-center">PDF</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prog.items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{item.label}</TableCell>
                      <TableCell className={cn('max-w-[220px] truncate text-xs font-medium', item.status === 'falha' ? TEXT.red : tomSituacao(item.situacao || ''))} title={item.mensagem || item.situacao || ''}>
                        {item.status === 'falha' ? (item.mensagem || 'Falha') : (item.situacao || '—')}
                      </TableCell>
                      <TableCell className="text-center"><span className="inline-flex"><LoteItemIcon status={item.status} /></span></TableCell>
                      <TableCell className="px-1">
                        {(item.status === 'falha' || item.status === 'sem_pdf') && (
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Tentar novamente" onClick={() => reprocessar(i, item)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
