'use client'

import { useState } from 'react'
import { FileUp, Download, Loader2, CheckCircle, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'
import {
  Button, Badge,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  extractFileData, parseWithMappings, autoMapColumns,
  generateTemplate, generateTemplateCsv,
  type ParsedRow, type ColumnMapping, type FileData,
} from '@/lib/parse-import'
import { ColumnMapper } from '@/components/import/column-mapper'
import type { CreateEmpresaInput } from '@saas/types'

const EMPRESA_COLUMNS: ColumnMapping[] = [
  { fileColumn: 'Razão Social', fieldName: 'razaoSocial', label: 'Razão Social', required: true },
  { fileColumn: 'Nome Fantasia', fieldName: 'nomeFantasia', label: 'Nome Fantasia' },
  { fileColumn: 'CNPJ', fieldName: 'cnpj', label: 'CNPJ', required: true },
  { fileColumn: 'Inscrição Estadual', fieldName: 'inscricaoEstadual', label: 'IE' },
  { fileColumn: 'Inscrição Municipal', fieldName: 'inscricaoMunicipal', label: 'IM' },
  { fileColumn: 'CEP', fieldName: 'cep', label: 'CEP' },
  { fileColumn: 'Logradouro', fieldName: 'logradouro', label: 'Logradouro' },
  { fileColumn: 'Número', fieldName: 'numero', label: 'Número' },
  { fileColumn: 'Bairro', fieldName: 'bairro', label: 'Bairro' },
  { fileColumn: 'Cidade', fieldName: 'cidade', label: 'Cidade' },
  { fileColumn: 'UF', fieldName: 'uf', label: 'UF' },
  { fileColumn: 'Telefone', fieldName: 'telefone', label: 'Telefone' },
  { fileColumn: 'E-mail', fieldName: 'email', label: 'E-mail' },
  { fileColumn: 'Site', fieldName: 'site', label: 'Site' },
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
  const requiredsMapped = EMPRESA_COLUMNS.filter(c => c.required).every(c => mappings.get(c.fieldName))

  function reset() { setStep('upload'); setFileData(null); setMappings(new Map()); setRows([]); setImporting(false) }
  function handleClose() { reset(); onClose() }

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) { alerts.error('Formato inválido', 'Use .xlsx, .xls ou .csv'); return }
    try {
      const data = await extractFileData(file)
      setFileData(data)
      setMappings(autoMapColumns(data.headers, EMPRESA_COLUMNS))
      setStep('mapping')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function handleMappingConfirm() { if (!fileData) return; setRows(parseWithMappings(fileData.rows, mappings, EMPRESA_COLUMNS)); setStep('preview') }
  function handleMappingChange(fn: string, fh: string) { setMappings(p => { const n = new Map(p); if (fh) n.set(fn, fh); else n.delete(fn); return n }) }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }

  async function handleImport() {
    setImporting(true)
    try {
      const items: CreateEmpresaInput[] = validRows.map(r => ({
        razaoSocial: r.data.razaoSocial ?? '', nomeFantasia: r.data.nomeFantasia ?? '',
        cnpj: r.data.cnpj ?? '', inscricaoEstadual: r.data.inscricaoEstadual ?? '',
        inscricaoMunicipal: r.data.inscricaoMunicipal ?? '', isActive: true,
        cep: r.data.cep ?? '', logradouro: r.data.logradouro ?? '', numero: r.data.numero ?? '',
        complemento: '', bairro: r.data.bairro ?? '', cidade: r.data.cidade ?? '', uf: r.data.uf ?? '',
        telefone: r.data.telefone ?? '', email: r.data.email ?? '', site: r.data.site ?? '',
        logoUrl: '', logoDarkUrl: '',
      }))
      const result = await trpc.empresa.importBulk.mutate({ items })
      await alerts.success(result.errors.length ? 'Importação parcial' : 'Importação concluída', `${result.created} registros importados.`)
      handleClose(); onSuccess()
    } catch { alerts.error('Erro', 'Não foi possível importar.') }
    finally { setImporting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={FileUp} color="emerald">
          <DialogTitle>Importar Empresas</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Faça upload de um arquivo Excel ou CSV.'}
            {step === 'mapping' && 'Mapeie as colunas do arquivo.'}
            {step === 'preview' && `${validRows.length} de ${rows.length} registros válidos.`}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          {step === 'upload' && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplate(EMPRESA_COLUMNS, 'template-empresas')}><Download className="h-4 w-4" />Template Excel</Button>
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplateCsv(EMPRESA_COLUMNS, 'template-empresas')}><Download className="h-4 w-4" />Template CSV</Button>
              </div>
              <div className={cn('flex flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed px-6 py-10 transition-colors cursor-pointer', dragOver ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border bg-muted/10 hover:border-emerald-400/50')} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv'; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }; i.click() }}>
                <FileUp className="h-10 w-10 text-muted-foreground/40" /><div className="text-center"><p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p><p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p></div>
              </div>
            </div>
          )}
          {step === 'mapping' && fileData && (<div className="py-2"><ColumnMapper fileHeaders={fileData.headers} firstRow={fileData.firstRow} systemColumns={EMPRESA_COLUMNS} mappings={mappings} onMappingChange={handleMappingChange} /></div>)}
          {step === 'preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle className="h-4 w-4" /><span className="font-medium">{validRows.length} válidos</span></div>
                {invalidRows.length > 0 && <div className="flex items-center gap-1.5 text-destructive"><XCircle className="h-4 w-4" /><span className="font-medium">{invalidRows.length} erros</span></div>}
              </div>
              <div className="rounded-[2px] border"><Table><TableHeader><TableRow><TableHead className="w-[50px]">Linha</TableHead><TableHead>Razão Social</TableHead><TableHead className="hidden sm:table-cell">CNPJ</TableHead><TableHead className="w-[80px]">Status</TableHead></TableRow></TableHeader><TableBody>
                {rows.map(row => (<TableRow key={row.rowIndex} className={cn(row.valid ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : 'bg-destructive/5')}><TableCell className="text-xs font-mono">{row.rowIndex}</TableCell><TableCell className="text-sm font-medium">{row.data.razaoSocial || '—'}</TableCell><TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{row.data.cnpj || '—'}</TableCell><TableCell>{row.valid ? <Badge variant="success" className="text-[10px]">OK</Badge> : <Badge variant="destructive" className="text-[10px]">Erro</Badge>}</TableCell></TableRow>))}
              </TableBody></Table></div>
              {invalidRows.length > 0 && <div className="flex items-start gap-2 rounded-[2px] bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>Registros com erros serão ignorados.</span></div>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {step === 'mapping' && (<><Button variant="success" size="sm" type="button" disabled={!requiredsMapped} onClick={handleMappingConfirm}><ArrowRight className="h-4 w-4" />Continuar</Button><Button variant="outline" size="sm" type="button" onClick={reset}>Voltar</Button></>)}
          {step === 'preview' && (<><Button variant="success" size="sm" type="button" disabled={validRows.length === 0 || importing} onClick={handleImport}>{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{importing ? 'Importando...' : `Importar ${validRows.length}`}</Button><Button variant="outline" size="sm" type="button" onClick={() => setStep('mapping')}>Voltar ao mapeamento</Button></>)}
          <DialogClose asChild><Button variant="outline" size="sm" type="button">Fechar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
