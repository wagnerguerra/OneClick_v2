'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  Loader2, FileText, ShieldCheck, FileSignature, CheckCircle2, AlertTriangle,
  Globe, FileCheck2, Download, Building2,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CONTRATO_STATUS_LABELS, CONTRATO_STATUS_COLORS, CLAUSULA_CATEGORIA_LABELS, type ClausulaCategoria, type ContratoStatus } from '@saas/types'
import { AssinarWebPkiModal } from '../../../../(dashboard)/contratos/_components/assinar-webpki-modal'

interface PublicContrato {
  id: string
  numero: number
  token: string
  status: ContratoStatus
  pdfUrl: string | null
  pdfHash: string | null
  contratanteRazaoSocial: string | null
  contratanteCnpj: string | null
  honorarioMensal: any
  dataInicio: string | null
  cliente: { id: string; razaoSocial: string; documento: string | null }
  template: { nome: string }
  snapshots: Array<{
    id: string
    codigo: string
    versao: number
    titulo: string
    conteudo: string
    categoria: ClausulaCategoria
    ordem: number
  }>
  assinaturas: Array<{ id: string; parte: string; tipo: string; signatarioNome: string; assinadoEm: string }>
}

export default function ContratoPublicoPage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const token = params.token

  const [contrato, setContrato] = useState<PublicContrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string>('')

  // Modal: assinar com Web PKI
  const [webPkiOpen, setWebPkiOpen] = useState(false)

  // Modal: aceite simples
  const [aceiteOpen, setAceiteOpen] = useState(false)
  const [aceiteNome, setAceiteNome] = useState('')
  const [aceiteDoc, setAceiteDoc] = useState('')
  const [aceiteEmail, setAceiteEmail] = useState('')
  const [aceiteSalvando, setAceiteSalvando] = useState(false)

  // gov.br / SerproID
  const [govbrLoading, setGovbrLoading] = useState(false)
  const [serproIdLoading, setSerproIdLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const c = await (trpc.contrato as any).getByToken.query({ token })
      setContrato(c)
    } catch (e) {
      setErro((e as Error).message)
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  // Detecta retorno OAuth (?code=...&state=...) — gov.br e SerproID compartilham o mesmo
  // redirect_uri. O prefixo do state ("govbr_" vs "srpid_") identifica o provedor.
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (code && state) {
      if (state.startsWith('srpid_')) {
        processarCallbackSerproId(code, state)
      } else {
        processarCallbackGovbr(code, state)
      }
    }
  }, [searchParams])

  async function processarCallbackGovbr(code: string, state: string) {
    setGovbrLoading(true)
    try {
      await (trpc.contrato as any).processarCallbackGovbr.mutate({ code, state })
      window.history.replaceState({}, '', window.location.pathname)
      await alerts.success('Assinatura realizada!', 'Contrato assinado com sucesso via gov.br.')
      fetchData()
    } catch (e) {
      alerts.error('Erro na assinatura gov.br', (e as Error).message)
    } finally { setGovbrLoading(false) }
  }

  async function processarCallbackSerproId(code: string, state: string) {
    setSerproIdLoading(true)
    try {
      await (trpc.contrato as any).processarCallbackSerproId.mutate({ code, state })
      window.history.replaceState({}, '', window.location.pathname)
      await alerts.success('Assinatura realizada!', 'Contrato assinado com sucesso via SerproID.')
      fetchData()
    } catch (e) {
      alerts.error('Erro na assinatura SerproID', (e as Error).message)
    } finally { setSerproIdLoading(false) }
  }

  async function handleAssinarGovbr() {
    setGovbrLoading(true)
    try {
      const r = await (trpc.contrato as any).iniciarAssinaturaGovbrPublico.mutate({ contratoToken: token })
      window.location.href = r.authUrl
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setGovbrLoading(false)
    }
  }

  async function handleAssinarSerproId() {
    setSerproIdLoading(true)
    try {
      const r = await (trpc.contrato as any).iniciarAssinaturaSerproIdPublico.mutate({ contratoToken: token })
      window.location.href = r.authUrl
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setSerproIdLoading(false)
    }
  }

  async function handleAceitar() {
    if (!aceiteNome.trim()) return alerts.error('Erro', 'Informe seu nome')
    if (!aceiteDoc.trim()) return alerts.error('Erro', 'Informe seu CPF ou CNPJ')
    setAceiteSalvando(true)
    try {
      await (trpc.contrato as any).aceitarProposta.mutate({
        contratoToken: token,
        signatarioNome: aceiteNome,
        signatarioDoc: aceiteDoc,
        signatarioEmail: aceiteEmail || null,
      })
      await alerts.success('Aceite registrado', 'Sua confirmação foi registrada com sucesso.')
      setAceiteOpen(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setAceiteSalvando(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando contrato...
        </div>
      </div>
    )
  }

  if (erro || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-rose-500 mb-3" />
          <h1 className="text-lg font-semibold mb-2">Contrato não encontrado</h1>
          <p className="text-sm text-muted-foreground">{erro || 'O link pode ter expirado ou ser inválido.'}</p>
        </Card>
      </div>
    )
  }

  const cor = CONTRATO_STATUS_COLORS[contrato.status]
  const jaAssinou = contrato.assinaturas.some(a => a.parte === 'CONTRATANTE')

  // Agrupa snapshots por categoria
  const grupos = new Map<string, typeof contrato.snapshots>()
  for (const s of contrato.snapshots) {
    if (!grupos.has(s.categoria)) grupos.set(s.categoria, [])
    grupos.get(s.categoria)!.push(s)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-md">
            <FileText className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold">Contrato #{String(contrato.numero).padStart(5, '0')}</h1>
              <Badge style={{ backgroundColor: `${cor}22`, color: cor }} className="border-0">
                {CONTRATO_STATUS_LABELS[contrato.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>{contrato.contratanteRazaoSocial || contrato.cliente.razaoSocial}</strong>
              <span className="mx-2">·</span>
              {contrato.template.nome}
            </p>
          </div>
        </div>
      </Card>

      {/* Aviso de status */}
      {jaAssinou && (
        <Card className="p-4 border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Contrato já assinado</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Sua assinatura foi registrada. Você pode baixar o PDF abaixo a qualquer momento.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* PDF download */}
      {contrato.pdfUrl && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={contrato.pdfUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" /> Baixar PDF do contrato
            </a>
          </Button>
        </div>
      )}

      {/* Conteúdo */}
      <Card className="p-6 space-y-5">
        {Array.from(grupos.entries()).map(([cat, items], catIdx) => (
          <section key={cat}>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-2 pb-2 border-b">
              Cláusula {catIdx + 1}ª — {CLAUSULA_CATEGORIA_LABELS[cat as ClausulaCategoria] || cat}
            </h2>
            <div className="space-y-3">
              {items.sort((a, b) => a.ordem - b.ordem).map(s => (
                <div key={s.id}>
                  <h3 className="text-sm font-semibold mb-1">{s.titulo}</h3>
                  <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderPlaceholders(s.conteudo, contrato) }} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </Card>

      {/* Painel de assinatura */}
      {!jaAssinou && (
        <Card className="p-6 space-y-4 border-2 border-rose-200 dark:border-rose-900">
          <div className="text-center">
            <h2 className="text-lg font-bold mb-1">Assinar este contrato</h2>
            <p className="text-sm text-muted-foreground">
              Escolha a forma de assinatura. Todas têm validade legal pela MP 2.200-2/2001.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Opção 1: SerproID — recomendada (sem instalação) */}
            <button
              type="button"
              onClick={handleAssinarSerproId}
              disabled={serproIdLoading}
              className="text-left rounded-lg border-2 border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 p-4 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50 relative"
            >
              <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white">
                Recomendado
              </span>
              {serproIdLoading ? (
                <Loader2 className="h-7 w-7 text-rose-600 mb-2 animate-spin" />
              ) : (
                <Building2 className="h-7 w-7 text-rose-600 mb-2" />
              )}
              <p className="text-sm font-semibold mb-1">SerproID</p>
              <p className="text-xs text-muted-foreground">
                Assina via portal do SERPRO usando seu e-CPF/e-CNPJ na nuvem. Sem instalação.
              </p>
            </button>

            {/* Opção 2: Certificado local (Web PKI) */}
            <button
              type="button"
              onClick={() => setWebPkiOpen(true)}
              disabled={!contrato.pdfHash}
              className="text-left rounded-lg border-2 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="h-7 w-7 text-emerald-600 mb-2" />
              <p className="text-sm font-semibold mb-1">Certificado Digital</p>
              <p className="text-xs text-muted-foreground">
                Use seu e-CNPJ ou e-CPF (A1 ou A3) instalado neste computador.
              </p>
            </button>

            {/* Opção 3: gov.br */}
            <button
              type="button"
              onClick={handleAssinarGovbr}
              disabled={govbrLoading}
              className="text-left rounded-lg border-2 border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 p-4 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors disabled:opacity-50"
            >
              {govbrLoading ? (
                <Loader2 className="h-7 w-7 text-blue-600 mb-2 animate-spin" />
              ) : (
                <Globe className="h-7 w-7 text-blue-600 mb-2" />
              )}
              <p className="text-sm font-semibold mb-1">Conta gov.br</p>
              <p className="text-xs text-muted-foreground">
                Assinatura via portal gov.br. Requer conta nível Prata ou Ouro.
              </p>
            </button>

            {/* Opção 4: Aceite */}
            <button
              type="button"
              onClick={() => setAceiteOpen(true)}
              className="text-left rounded-lg border-2 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 p-4 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
            >
              <FileCheck2 className="h-7 w-7 text-amber-600 mb-2" />
              <p className="text-sm font-semibold mb-1">Aceite Eletrônico</p>
              <p className="text-xs text-muted-foreground">
                Confirmação por nome e CPF/CNPJ. Sem certificado.
              </p>
            </button>
          </div>

          {!contrato.pdfHash && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                O PDF ainda não foi gerado. Solicite à contadora que gere o PDF antes de assinar.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Assinaturas existentes */}
      {contrato.assinaturas.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assinaturas registradas</h3>
          <div className="space-y-1.5">
            {contrato.assinaturas.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="font-semibold">{a.parte}:</span>
                <span>{a.signatarioNome}</span>
                <span className="text-muted-foreground ml-auto">{new Date(a.assinadoEm).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal Web PKI */}
      {contrato.pdfHash && (
        <AssinarWebPkiModal
          open={webPkiOpen}
          onOpenChange={setWebPkiOpen}
          contratoId={contrato.id}
          contratoToken={token}
          parte="CONTRATANTE"
          hashPdf={contrato.pdfHash}
          onSucesso={fetchData}
        />
      )}

      {/* Modal Aceite */}
      <Dialog open={aceiteOpen} onOpenChange={setAceiteOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-amber-600" />
              Aceite Eletrônico
            </DialogTitle>
            <DialogDescription>
              Confirme seus dados. Registraremos data, IP e hash do contrato como evidência da aceitação.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome completo *</Label>
              <Input value={aceiteNome} onChange={e => setAceiteNome(e.target.value)} placeholder="Seu nome completo" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">CPF ou CNPJ *</Label>
              <Input value={aceiteDoc} onChange={e => setAceiteDoc(e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0000-00" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">E-mail (opcional)</Label>
              <Input type="email" value={aceiteEmail} onChange={e => setAceiteEmail(e.target.value)} placeholder="seu@email.com" className="h-9 text-sm" />
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Ao clicar em "Confirmar aceite", você declara que leu e concorda com todos os termos deste contrato. Esta confirmação eletrônica tem validade legal segundo a MP 2.200-2/2001.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAceiteOpen(false)} disabled={aceiteSalvando}>Cancelar</Button>
            <Button
              size="sm"
              onClick={handleAceitar}
              disabled={aceiteSalvando}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {aceiteSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              Confirmar aceite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function renderPlaceholders(html: string, c: PublicContrato): string {
  const map: Record<string, string> = {
    'cliente.razao_social': c.contratanteRazaoSocial || c.cliente.razaoSocial || '',
    'cliente.cnpj': c.contratanteCnpj || c.cliente.documento || '',
    'cliente.endereco': '',
    'cliente.representante': '',
    'cliente.cpf_rep': '',
    'contrato.numero': String(c.numero || '').padStart(5, '0'),
    'contrato.data_inicio': c.dataInicio ? new Date(c.dataInicio).toLocaleDateString('pt-BR') : '___/___/_____',
    'contrato.data_fim': 'prazo indeterminado',
    'honorario.valor': c.honorarioMensal ? Number(c.honorarioMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ____,__',
    'honorario.forma_pagamento': '',
    'honorario.dia_vencimento': '',
  }
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? `{{${k}}}`)
}
