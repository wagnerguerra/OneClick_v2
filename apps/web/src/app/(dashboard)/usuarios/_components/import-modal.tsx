'use client'

import { useState, useEffect } from 'react'
import { FileUp, Download, Loader2, CheckCircle, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'
import {
  Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  extractFileData, parseWithMappings, autoMapColumns,
  generateTemplate, generateTemplateCsv, parseBooleanPt,
  type ParsedRow, type ColumnMapping, type FileData,
} from '@/lib/parse-import'
import { ColumnMapper } from '@/components/import/column-mapper'
import type { CreateUserInput } from '@saas/types'

const USER_COLUMNS: ColumnMapping[] = [
  { fileColumn: 'Nome', fieldName: 'name', label: 'Nome', required: true },
  { fileColumn: 'E-mail', fieldName: 'email', label: 'E-mail', required: true },
  { fileColumn: 'Senha', fieldName: 'password', label: 'Senha' },
  { fileColumn: 'Telefone', fieldName: 'telefone', label: 'Telefone' },
  { fileColumn: 'Tipo de Usuário', fieldName: 'role', label: 'Tipo de Usuário' },
  { fileColumn: 'Perfil', fieldName: 'profile', label: 'Perfil' },
  { fileColumn: 'Empresa', fieldName: 'empresaName', label: 'Empresa' },
  { fileColumn: 'Área', fieldName: 'areaName', label: 'Área' },
  { fileColumn: 'Cargo', fieldName: 'cargoName', label: 'Cargo' },
  { fileColumn: 'Salário', fieldName: 'salario', label: 'Salário' },
  { fileColumn: 'Data Admissão', fieldName: 'dataAdmissao', label: 'Data Admissão' },
  { fileColumn: 'ID OneClick', fieldName: 'idOneClick', label: 'ID OneClick' },
  { fileColumn: 'Controle de Férias', fieldName: 'incluirFerias', label: 'Controle de Férias' },
]

const ROLE_MAP: Record<string, string> = {
  'colaborador interno': 'COLABORADOR_INTERNO', 'colaborador_interno': 'COLABORADOR_INTERNO',
  'prestador de servico': 'PRESTADOR_SERVICO', 'prestador de serviço': 'PRESTADOR_SERVICO', 'prestador_servico': 'PRESTADOR_SERVICO',
  'colaborador de cliente': 'COLABORADOR_CLIENTE', 'colaborador_cliente': 'COLABORADOR_CLIENTE',
  'gestor': 'GESTOR', 'coordenador': 'COORDENADOR', 'diretor': 'DIRETOR',
}
const PROFILE_MAP: Record<string, string> = {
  'operador': 'OPERADOR', 'supervisor': 'SUPERVISOR', 'gerente': 'GERENTE', 'admin': 'ADMIN', 'administrador': 'ADMIN',
}

interface SelectOption { id: string; name?: string; razaoSocial?: string; nomeFantasia?: string | null }
interface ImportModalProps { open: boolean; onClose: () => void; onSuccess: () => void }

export function ImportModal({ open, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
  const [fileData, setFileData] = useState<FileData | null>(null)
  const [mappings, setMappings] = useState<Map<string, string>>(new Map())
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [empresas, setEmpresas] = useState<SelectOption[]>([])
  const [areas, setAreas] = useState<SelectOption[]>([])
  const [cargos, setCargos] = useState<SelectOption[]>([])

  useEffect(() => {
    if (open) Promise.all([
      trpc.empresa.listForSelect.query().then(setEmpresas),
      trpc.area.listForSelect.query().then(setAreas),
      trpc.cargo.listForSelect.query().then(setCargos),
    ]).catch(() => {})
  }, [open])

  const validRows = rows.filter(r => r.valid)
  const invalidRows = rows.filter(r => !r.valid)
  const requiredsMapped = USER_COLUMNS.filter(c => c.required).every(c => mappings.get(c.fieldName))

  function reset() { setStep('upload'); setFileData(null); setMappings(new Map()); setRows([]); setImporting(false) }
  function handleClose() { reset(); onClose() }

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) { alerts.error('Formato inválido', 'Use .xlsx, .xls ou .csv'); return }
    try {
      const data = await extractFileData(file)
      setFileData(data)
      setMappings(autoMapColumns(data.headers, USER_COLUMNS))
      setStep('mapping')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function handleMappingConfirm() { if (!fileData) return; setRows(parseWithMappings(fileData.rows, mappings, USER_COLUMNS)); setStep('preview') }
  function handleMappingChange(fn: string, fh: string) { setMappings(p => { const n = new Map(p); if (fh) n.set(fn, fh); else n.delete(fn); return n }) }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }

  function findId(list: SelectOption[], name: string, field: 'name' | 'razaoSocial' = 'name'): string {
    if (!name) return ''
    const n = name.toLowerCase().trim()
    return list.find(item => {
      const val = field === 'razaoSocial' ? ((item as { nomeFantasia?: string | null }).nomeFantasia ?? (item as { razaoSocial?: string }).razaoSocial ?? '') : (item.name ?? '')
      return val.toLowerCase().trim() === n
    })?.id ?? ''
  }

  async function handleImport() {
    setImporting(true)
    try {
      const items: CreateUserInput[] = validRows.map(r => ({
        name: r.data.name ?? '', email: r.data.email ?? '', password: r.data.password || 'Acesso@123',
        telefone: r.data.telefone ?? '',
        role: (ROLE_MAP[(r.data.role ?? '').toLowerCase().trim()] ?? 'COLABORADOR_INTERNO') as CreateUserInput['role'],
        profile: (PROFILE_MAP[(r.data.profile ?? '').toLowerCase().trim()] ?? 'OPERADOR') as CreateUserInput['profile'],
        empresaId: findId(empresas, r.data.empresaName ?? '', 'razaoSocial'),
        areaId: findId(areas, r.data.areaName ?? ''), cargoId: findId(cargos, r.data.cargoName ?? ''),
        salario: r.data.salario ? r.data.salario.replace(/[^\d,.-]/g, '').replace(',', '.') : '',
        dataAdmissao: r.data.dataAdmissao ?? '', idOneClick: r.data.idOneClick ?? '',
        incluirFerias: parseBooleanPt(r.data.incluirFerias ?? 'sim'), isActive: true,
      }))
      const result = await trpc.user.importBulk.mutate({ items })
      await alerts.success(result.errors.length ? 'Importação parcial' : 'Importação concluída', `${result.created} registros importados.`)
      handleClose(); onSuccess()
    } catch (err) {
      console.error('Import error:', err)
      alerts.error('Erro', 'Não foi possível importar.')
    }
    finally { setImporting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10"><FileUp className="h-4.5 w-4.5 text-emerald-600" /></div>
            <div><span>Importar Usuários</span><DialogDescription className="mt-0.5">
              {step === 'upload' && 'Faça upload de um arquivo Excel ou CSV.'}
              {step === 'mapping' && 'Mapeie as colunas do arquivo para os campos do sistema.'}
              {step === 'preview' && `${validRows.length} de ${rows.length} registros válidos.`}
            </DialogDescription></div>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {step === 'upload' && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplate(USER_COLUMNS, 'template-usuarios')}><Download className="h-4 w-4" />Template Excel</Button>
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplateCsv(USER_COLUMNS, 'template-usuarios')}><Download className="h-4 w-4" />Template CSV</Button>
              </div>
              <div className={cn('flex flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed px-6 py-10 transition-colors cursor-pointer', dragOver ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border bg-muted/10 hover:border-emerald-400/50')} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv'; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }; i.click() }}>
                <FileUp className="h-10 w-10 text-muted-foreground/40" /><div className="text-center"><p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p><p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p></div>
              </div>
            </div>
          )}
          {step === 'mapping' && fileData && (<div className="py-2"><ColumnMapper fileHeaders={fileData.headers} firstRow={fileData.firstRow} systemColumns={USER_COLUMNS} mappings={mappings} onMappingChange={handleMappingChange} /></div>)}
          {step === 'preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle className="h-4 w-4" /><span className="font-medium">{validRows.length} válidos</span></div>
                {invalidRows.length > 0 && <div className="flex items-center gap-1.5 text-destructive"><XCircle className="h-4 w-4" /><span className="font-medium">{invalidRows.length} erros</span></div>}
              </div>
              <div className="rounded-[2px] border"><Table><TableHeader><TableRow><TableHead className="w-[50px]">Linha</TableHead><TableHead>Nome</TableHead><TableHead className="hidden sm:table-cell">E-mail</TableHead><TableHead className="hidden md:table-cell">Tipo</TableHead><TableHead className="w-[80px]">Status</TableHead></TableRow></TableHeader><TableBody>
                {rows.map(row => (<TableRow key={row.rowIndex} className={cn(row.valid ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : 'bg-destructive/5')}><TableCell className="text-xs font-mono">{row.rowIndex}</TableCell><TableCell className="text-sm font-medium">{row.data.name || '—'}</TableCell><TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{row.data.email || '—'}</TableCell><TableCell className="hidden md:table-cell text-sm text-muted-foreground">{row.data.role || 'Colaborador Interno'}</TableCell><TableCell>{row.valid ? <Badge variant="success" className="text-[10px]">OK</Badge> : <div><Badge variant="destructive" className="text-[10px]">Erro</Badge><p className="text-[10px] text-destructive mt-0.5">{row.errors[0]}</p></div>}</TableCell></TableRow>))}
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
