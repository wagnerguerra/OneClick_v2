'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, DollarSign, Download, FileOutput, Loader2, RefreshCw, Search, Shield, XCircle } from 'lucide-react'
import {
  Button, Input, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { BADGE, SURFACE, TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { MODULE_COLOR, formatDoc } from '../_lib/ui'

export interface CndRecord {
  id: string
  documento: string
  tipoDocumento: number
  razaoSocial: string | null
  etapa: string
  tipoCertidao: string | null
  codigoControle: string | null
  dataEmissao: string | null
  dataValidade: string | null
  temPdf: boolean
  statusApi: number | null
  mensagemApi: string | null
  sucesso: boolean
  erro: string | null
  clienteId: string | null
  createdAt: string
  deletedAt: string | null
}

type Aba = 'cnd' | 'sitfis' | 'darf'

const DARF_VAZIO = () => ({ codigoReceita: '', dataPA: '', valorImposto: '', dataConsolidacao: new Date().toISOString().slice(0, 10), tipoPA: 'ME', observacao: '' })

/**
 * Visualizador da CND Federal com as abas Situação Fiscal e DARF. Era um
 * overlay `<div fixed>` montado à mão; agora é Dialog (foco, Esc, portal).
 */
export function FederalPdfDialog({ record, abaInicial, onClose }: { record: CndRecord | null; abaInicial: Aba; onClose: () => void }) {
  const [aba, setAba] = useState<Aba>('cnd')
  const [sitfisLoading, setSitfisLoading] = useState(false)
  const [sitfisUrl, setSitfisUrl] = useState<string | null>(null)
  const [sitfisErro, setSitfisErro] = useState<string | null>(null)
  const [sitfisCache, setSitfisCache] = useState(false)
  const [darfLoading, setDarfLoading] = useState(false)
  const [darfPdf, setDarfPdf] = useState<string | null>(null)
  const [darfUrl, setDarfUrl] = useState<string | null>(null)
  const [darfConsolidado, setDarfConsolidado] = useState<Record<string, unknown> | null>(null)
  const [darfErro, setDarfErro] = useState<string | null>(null)
  const [darfForm, setDarfForm] = useState(DARF_VAZIO)

  useEffect(() => {
    if (!record) return
    setAba(abaInicial); setSitfisUrl(null); setSitfisErro(null); setSitfisCache(false)
    setDarfPdf(null); setDarfConsolidado(null); setDarfErro(null); setDarfForm(DARF_VAZIO())
    setDarfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    if (abaInicial === 'sitfis') carregarSitfis(record)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, abaInicial])

  const pdfUrl = record?.temPdf ? `${getApiUrl()}/api/cnd/${record.id}/pdf` : null

  async function carregarSitfis(r: CndRecord | null = record) {
    if (!r) return
    setSitfisLoading(true); setSitfisErro(null); setSitfisUrl(null); setSitfisCache(false)
    try {
      const cache = await trpc.sitfis.verificarCache.query({ documento: r.documento }) as { encontrado: boolean; id?: string }
      if (cache.encontrado && cache.id) {
        setSitfisUrl(`${getApiUrl()}/api/sitfis/${cache.id}/pdf`); setSitfisCache(true); setAba('sitfis')
        return
      }
      const res = await trpc.sitfis.consultar.mutate({ documento: r.documento, clienteId: r.clienteId || undefined }) as { id: string; sucesso: boolean; erro: string | null; consultaRecente?: boolean; consultaRecenteId?: string }
      const id = res.consultaRecenteId || res.id
      if (res.sucesso || res.consultaRecente) {
        setSitfisUrl(`${getApiUrl()}/api/sitfis/${id}/pdf`); setSitfisCache(!!res.consultaRecente); setAba('sitfis')
      } else setSitfisErro(res.erro || 'Não foi possível emitir a situação fiscal')
    } catch (e) { setSitfisErro((e as Error).message) }
    finally { setSitfisLoading(false) }
  }

  async function emitirDarf() {
    if (!record) return
    if (!darfForm.codigoReceita || !darfForm.dataPA || !darfForm.valorImposto) { alerts.error('Atenção', 'Preencha código de receita, período e valor'); return }
    setDarfLoading(true); setDarfErro(null); setDarfPdf(null); setDarfConsolidado(null)
    setDarfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    try {
      const r = await trpc.sitfis.emitirDarf.mutate({
        documento: record.documento,
        tipoDocumento: record.tipoDocumento,
        codigoReceita: darfForm.codigoReceita,
        dataPA: darfForm.dataPA,
        valorImposto: Number(darfForm.valorImposto.replace(',', '.')),
        dataConsolidacao: `${darfForm.dataConsolidacao}T00:00:00`,
        tipoPA: darfForm.tipoPA || undefined,
        observacao: darfForm.observacao || undefined,
      }) as { sucesso: boolean; consolidado: Record<string, unknown> | null; darfPdfBase64: string | null; numeroDocumento: string | null }
      if (r.sucesso && r.darfPdfBase64) {
        setDarfPdf(r.darfPdfBase64); setDarfConsolidado(r.consolidado)
        const bytes = Uint8Array.from(atob(r.darfPdfBase64), c => c.charCodeAt(0))
        setDarfUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
        alerts.success('DARF emitido', r.numeroDocumento ? `Documento: ${r.numeroDocumento}` : '')
      } else setDarfErro('DARF emitido sem PDF')
    } catch (e) { setDarfErro((e as Error).message) }
    finally { setDarfLoading(false) }
  }

  function baixar() {
    const url = aba === 'sitfis' && sitfisUrl ? sitfisUrl.replace('/pdf', '/download-pdf')
      : aba === 'darf' && darfUrl ? darfUrl
      : pdfUrl?.replace('/pdf', '/download-pdf')
    if (!url) return
    const a = document.createElement('a'); a.href = url
    a.download = aba === 'darf' ? `darf_${record?.documento}_${new Date().toISOString().slice(0, 10)}.pdf` : ''
    a.click()
  }

  const abas: Array<{ v: Aba; label: string; Icon: typeof Shield; carregando?: boolean }> = [
    { v: 'cnd', label: 'CND Federal', Icon: FileOutput },
    { v: 'sitfis', label: 'Situação Fiscal', Icon: Shield, carregando: sitfisLoading },
    ...(record?.tipoCertidao && record.tipoCertidao !== 'Negativa' ? [{ v: 'darf' as const, label: 'Emitir DARF', Icon: DollarSign, carregando: darfLoading }] : []),
  ]
  const campo = 'h-9 text-sm'
  const label = 'text-[13px] font-semibold'

  return (
    <Dialog open={!!record} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col">
        <DialogHeaderIcon icon={FileOutput} accentColor={MODULE_COLOR}>
          <DialogTitle className="truncate">{record?.razaoSocial || 'Certidão'}</DialogTitle>
          <DialogDescription>{record ? formatDoc(record.documento) : ''}{record?.tipoCertidao ? ` · ${record.tipoCertidao}` : ''}</DialogDescription>
        </DialogHeaderIcon>

        <div className="nice-scrollbar flex shrink-0 items-center overflow-x-auto border-b px-4">
          {abas.map(({ v, label: l, Icon, carregando }) => (
            <button key={v} type="button"
              onClick={() => { setAba(v); if (v === 'sitfis' && !sitfisUrl && !sitfisLoading && !sitfisErro) carregarSitfis() }}
              className={cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-medium transition-colors',
                aba === v ? 'text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              style={aba === v ? { borderColor: MODULE_COLOR } : undefined}>
              <Icon className="h-3.5 w-3.5" />{l}{carregando && <Loader2 className="h-3 w-3 animate-spin" />}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {aba === 'cnd' && (pdfUrl ? <iframe src={pdfUrl} className="h-full w-full" title="CND Federal" /> : (
            <Vazio icon={XCircle} titulo="Certidão não disponível" texto={record?.mensagemApi || record?.erro || 'A certidão não pôde ser emitida para este contribuinte'} />
          ))}

          {aba === 'sitfis' && (
            sitfisLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" /><p className="text-sm">Consultando situação fiscal via SERPRO...</p><p className="text-xs">Isso pode levar alguns segundos</p>
              </div>
            ) : sitfisErro ? (
              <Vazio icon={AlertTriangle} titulo="Não foi possível carregar" texto={sitfisErro}
                acao={<Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => carregarSitfis()}><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</Button>} />
            ) : sitfisUrl ? (
              <div className="flex h-full flex-col">
                {sitfisCache && (
                  <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs', SURFACE.amber, TEXT.amber)}>
                    <span>Relatório do cache (consulta recente). Para atualizar, acesse o módulo de Situação Fiscal.</span>
                    <a href="/situacao-fiscal" className="shrink-0 font-medium underline hover:no-underline">Ir para Situação Fiscal</a>
                  </div>
                )}
                <iframe src={sitfisUrl} className="w-full flex-1" title="Situação Fiscal" />
              </div>
            ) : (
              <Vazio icon={Shield} titulo="Situação fiscal" texto="Clique para carregar a situação fiscal"
                acao={<Button variant="outline" size="sm" className="gap-1.5" onClick={() => carregarSitfis()}><Search className="h-3.5 w-3.5" />Consultar Situação Fiscal</Button>} />
            )
          )}

          {aba === 'darf' && (
            <div className="flex h-full flex-col md:flex-row">
              <div className="nice-scrollbar shrink-0 space-y-4 overflow-y-auto border-b p-4 md:w-[340px] md:border-b-0 md:border-r">
                <div>
                  <h4 className="mb-1 text-[13px] font-semibold">Emitir DARF</h4>
                  <p className="text-[11px] text-muted-foreground">Informe o código de receita, período e valor para gerar a guia (DARF) via SICALC/SERPRO. Multa e juros são calculados automaticamente.</p>
                </div>
                <div className={cn('rounded-md border p-2.5 text-[11px]', BADGE.amber)}>
                  <strong>Dica:</strong> consulte a aba &quot;Situação Fiscal&quot; para identificar os códigos de receita e valores pendentes.
                </div>
                <div className="space-y-1.5">
                  <label className={label}>Código de Receita *</label>
                  <Input placeholder="Ex: 0220, 6106..." value={darfForm.codigoReceita} onChange={e => setDarfForm(p => ({ ...p, codigoReceita: e.target.value }))} className={cn(campo, 'font-mono')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={label}>Período (PA) *</label>
                    <Input placeholder="MM/AAAA" value={darfForm.dataPA} onChange={e => setDarfForm(p => ({ ...p, dataPA: e.target.value }))} className={cn(campo, 'font-mono')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={label}>Tipo período</label>
                    <Select value={darfForm.tipoPA} onValueChange={v => setDarfForm(p => ({ ...p, tipoPA: v }))}>
                      <SelectTrigger className={cn(campo, 'w-full')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {([['ME', 'Mensal'], ['TR', 'Trimestral'], ['SE', 'Semestral'], ['AN', 'Anual'], ['DE', 'Decendial'], ['QU', 'Quinzenal'], ['SM', 'Semanal']] as const).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={label}>Valor do imposto (R$) *</label>
                  <Input placeholder="0,00" value={darfForm.valorImposto} onChange={e => setDarfForm(p => ({ ...p, valorImposto: e.target.value }))} className={cn(campo, 'font-mono')} />
                </div>
                <div className="space-y-1.5">
                  <label className={label}>Data de consolidação</label>
                  <Input type="date" value={darfForm.dataConsolidacao} onChange={e => setDarfForm(p => ({ ...p, dataConsolidacao: e.target.value }))} className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label className={label}>Observação</label>
                  <Input placeholder="Opcional" value={darfForm.observacao} onChange={e => setDarfForm(p => ({ ...p, observacao: e.target.value }))} className={campo} />
                </div>
                <Button className="w-full gap-1.5" onClick={emitirDarf} disabled={darfLoading}>
                  {darfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}Emitir DARF
                </Button>
                {darfErro && (
                  <div className={cn('rounded-md border p-3 text-xs', BADGE.red)}><p className="mb-1 font-medium">Erro na emissão</p><p>{darfErro}</p></div>
                )}
                {darfConsolidado && (
                  <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs">
                    <p className="mb-2 font-semibold">Valores consolidados</p>
                    {typeof darfConsolidado.valorPrincipalMoedaCorrente === 'number' && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span className="font-mono font-medium">R$ {Number(darfConsolidado.valorPrincipalMoedaCorrente).toFixed(2)}</span></div>
                    )}
                    {typeof darfConsolidado.valorMultaMora === 'number' && Number(darfConsolidado.valorMultaMora) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Multa ({String(darfConsolidado.percentualMultaMora)}%)</span><span className={cn('font-mono font-medium', TEXT.red)}>R$ {Number(darfConsolidado.valorMultaMora).toFixed(2)}</span></div>
                    )}
                    {typeof darfConsolidado.valorJuros === 'number' && Number(darfConsolidado.valorJuros) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Juros ({String(darfConsolidado.percentualJuros)}%)</span><span className={cn('font-mono font-medium', TEXT.amber)}>R$ {Number(darfConsolidado.valorJuros).toFixed(2)}</span></div>
                    )}
                    {typeof darfConsolidado.valorTotalConsolidado === 'number' && (
                      <div className="mt-1.5 flex justify-between border-t pt-1.5"><span className="font-semibold">Total</span><span className="font-mono font-bold">R$ {Number(darfConsolidado.valorTotalConsolidado).toFixed(2)}</span></div>
                    )}
                  </div>
                )}
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                {darfLoading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /><p className="text-sm">Emitindo DARF via SICALC/SERPRO...</p></div>
                ) : darfUrl ? <iframe src={darfUrl} className="h-full w-full" title="DARF" /> : (
                  <Vazio icon={DollarSign} titulo="Preencha os dados e clique em &quot;Emitir DARF&quot;" texto="O documento será gerado via SICALC e exibido aqui" />
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={baixar}
            disabled={aba === 'cnd' ? !pdfUrl : aba === 'sitfis' ? !sitfisUrl : !darfPdf}>
            <Download className="h-3.5 w-3.5" />Baixar
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Vazio({ icon: Icon, titulo, texto, acao }: { icon: typeof Shield; titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
      <Icon className="h-10 w-10 opacity-30" />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      <p className="max-w-md text-center text-xs">{texto}</p>
      {acao}
    </div>
  )
}
