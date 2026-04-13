'use client'

import { useState } from 'react'
import { FileUp, Download, Loader2, CheckCircle, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'
import {
  Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  extractFileData, parseWithMappings, autoMapColumns,
  generateTemplate, generateTemplateCsv,
  type ParsedRow, type ColumnMapping, type FileData,
} from '@/lib/parse-import'
import { ColumnMapper } from '@/components/import/column-mapper'
import type { CreateSocioInput } from '@saas/types'

const SOCIO_COLUMNS: ColumnMapping[] = [
  { fileColumn: 'Nome Completo', fieldName: 'nomeCompleto', label: 'Nome Completo', required: true },
  { fileColumn: 'CPF', fieldName: 'cpf', label: 'CPF', required: true },
  { fileColumn: 'Tipo Sócio', fieldName: 'tipoSocio', label: 'Tipo Sócio' },
  { fileColumn: 'Participação (%)', fieldName: 'participacao', label: 'Participação' },
  { fileColumn: 'Email', fieldName: 'email', label: 'Email' },
  { fileColumn: 'Telefone', fieldName: 'telefone', label: 'Telefone' },
  { fileColumn: 'Data Entrada', fieldName: 'dataEntrada', label: 'Data Entrada' },
  { fileColumn: 'Profissão', fieldName: 'profissao', label: 'Profissão' },
]

interface ImportModalProps { open: boolean; onClose: () => void; onSuccess: () => void }

export function ImportModal({ open, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
  const [fileData, setFileData] = useState<FileData | null>(null)
  const [mappings, setMappings] = useState<Map<string, string>>(new Map())
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const validRows = rows.filter(r => r.valid)
  const invalidRows = rows.filter(r => !r.valid)
  const requiredsMapped = SOCIO_COLUMNS.filter(c => c.required).every(c => mappings.get(c.fieldName))

  function reset() { setStep('upload'); setFileData(null); setMappings(new Map()); setRows([]); setImporting(false) }
  function handleClose() { reset(); onClose() }

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) { alerts.error('Formato inválido', 'Use .xlsx, .xls ou .csv'); return }
    try { const data = await extractFileData(file); setFileData(data); setMappings(autoMapColumns(data.headers, SOCIO_COLUMNS)); setStep('mapping') }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }

  async function handleImport() {
    setImporting(true)
    try {
      const TIPO_MAP: Record<string, string> = {
        administrador: 'SOCIO_ADMINISTRADOR', quotista: 'SOCIO_QUOTISTA', diretor: 'SOCIO_DIRETOR',
        acionista: 'ACIONISTA', titular: 'TITULAR', procurador: 'PROCURADOR', representante: 'REPRESENTANTE_LEGAL',
      }
      const items: CreateSocioInput[] = validRows.map(r => {
        const t = (r.data.tipoSocio ?? '').toLowerCase().trim()
        return {
          nomeCompleto: r.data.nomeCompleto ?? '', cpf: r.data.cpf ?? '',
          tipoSocio: (TIPO_MAP[t] ?? 'SOCIO_QUOTISTA') as CreateSocioInput['tipoSocio'],
          participacao: r.data.participacao ? Number(r.data.participacao) : null,
          email: r.data.email ?? '', telefone: r.data.telefone ?? '',
          dataEntrada: r.data.dataEntrada ?? '', profissao: r.data.profissao ?? '',
          isActive: true, assinaNaEmpresa: false, responsavelLegal: false,
        }
      })
      const result = await trpc.socio.importBulk.mutate({ items })
      await alerts.success(result.errors.length ? 'Importação parcial' : 'Importação concluída', `${result.created} sócio(s) importado(s).`)
      handleClose(); onSuccess()
    } catch { alerts.error('Erro', 'Não foi possível importar.') }
    finally { setImporting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border/60 bg-muted/30">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10"><FileUp className="h-4.5 w-4.5 text-emerald-600" /></div>
            <div><span>Importar Sócios</span><DialogDescription className="mt-0.5">
              {step === 'upload' && 'Faça upload de um arquivo Excel ou CSV.'}
              {step === 'mapping' && 'Mapeie as colunas do arquivo.'}
              {step === 'preview' && `${validRows.length} de ${rows.length} registros válidos.`}
            </DialogDescription></div>
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 max-h-[60vh] overflow-y-auto">
          {step === 'upload' && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplate(SOCIO_COLUMNS, 'template-socios')}><Download className="h-4 w-4" />Template Excel</Button>
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplateCsv(SOCIO_COLUMNS, 'template-socios')}><Download className="h-4 w-4" />Template CSV</Button>
              </div>
              <div className={cn('flex flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed px-6 py-10 transition-colors cursor-pointer', dragOver ? 'border-emerald-500 bg-emerald-50/50' : 'border-border bg-muted/10 hover:border-emerald-400/50')} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv'; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }; i.click() }}>
                <FileUp className="h-10 w-10 text-muted-foreground/40" /><div className="text-center"><p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p><p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p></div>
              </div>
            </div>
          )}
          {step === 'mapping' && fileData && <div className="py-2"><ColumnMapper fileHeaders={fileData.headers} firstRow={fileData.firstRow} systemColumns={SOCIO_COLUMNS} mappings={mappings} onMappingChange={(fn, fh) => setMappings(p => { const n = new Map(p); if (fh) n.set(fn, fh); else n.delete(fn); return n })} /></div>}
          {step === 'preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle className="h-4 w-4" /><span className="font-medium">{validRows.length} válidos</span></div>
                {invalidRows.length > 0 && <div className="flex items-center gap-1.5 text-destructive"><XCircle className="h-4 w-4" /><span className="font-medium">{invalidRows.length} erros</span></div>}
              </div>
              <div className="rounded-[2px] border"><Table><TableHeader><TableRow><TableHead className="w-[50px]">Linha</TableHead><TableHead>Nome</TableHead><TableHead className="hidden sm:table-cell">CPF</TableHead><TableHead className="w-[80px]">Status</TableHead></TableRow></TableHeader><TableBody>
                {rows.map(r => (<TableRow key={r.rowIndex} className={cn(r.valid ? 'bg-emerald-50/30' : 'bg-destructive/5')}><TableCell className="text-xs font-mono">{r.rowIndex}</TableCell><TableCell className="text-sm font-medium">{r.data.nomeCompleto || '—'}</TableCell><TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{r.data.cpf || '—'}</TableCell><TableCell>{r.valid ? <Badge variant="success" className="text-[10px]">OK</Badge> : <Badge variant="destructive" className="text-[10px]">Erro</Badge>}</TableCell></TableRow>))}
              </TableBody></Table></div>
              {invalidRows.length > 0 && <div className="flex items-start gap-2 rounded-[2px] bg-amber-500/10 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>Registros com erros serão ignorados.</span></div>}
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border/60 bg-muted/30">
          {step === 'mapping' && (<><Button variant="success" size="sm" type="button" disabled={!requiredsMapped} onClick={() => { if (fileData) { setRows(parseWithMappings(fileData.rows, mappings, SOCIO_COLUMNS)); setStep('preview') } }}><ArrowRight className="h-4 w-4" />Continuar</Button><Button variant="outline" size="sm" type="button" onClick={reset}>Voltar</Button></>)}
          {step === 'preview' && (<><Button variant="success" size="sm" type="button" disabled={validRows.length === 0 || importing} onClick={handleImport}>{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{importing ? 'Importando...' : `Importar ${validRows.length}`}</Button><Button variant="outline" size="sm" type="button" onClick={() => setStep('mapping')}>Voltar</Button></>)}
          <DialogClose asChild><Button variant="outline" size="sm" type="button">Fechar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
