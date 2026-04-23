'use client'

import { useState } from 'react'
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
  generateTemplate, generateTemplateCsv,
  type ParsedRow, type ColumnMapping, type FileData,
} from '@/lib/parse-import'
import { ColumnMapper } from '@/components/import/column-mapper'
import type { CreateColaboradorInput } from '@saas/types'

const COLABORADOR_COLUMNS: ColumnMapping[] = [
  { fileColumn: 'Nome Completo', fieldName: 'nomeCompleto', label: 'Nome Completo', required: true },
  { fileColumn: 'CPF', fieldName: 'cpf', label: 'CPF', required: true },
  { fileColumn: 'RG', fieldName: 'rg', label: 'RG' },
  { fileColumn: 'Email', fieldName: 'email', label: 'Email' },
  { fileColumn: 'Telefone', fieldName: 'telefone', label: 'Telefone' },
  { fileColumn: 'Celular', fieldName: 'celular', label: 'Celular' },
  { fileColumn: 'Tipo Contrato', fieldName: 'tipoContrato', label: 'Tipo Contrato' },
  { fileColumn: 'Data Admissão', fieldName: 'dataAdmissao', label: 'Data Admissão' },
  { fileColumn: 'Salário', fieldName: 'salario', label: 'Salário' },
  { fileColumn: 'Carga Horária', fieldName: 'cargaHoraria', label: 'Carga Horária' },
  { fileColumn: 'CEP', fieldName: 'cep', label: 'CEP' },
  { fileColumn: 'Logradouro', fieldName: 'logradouro', label: 'Logradouro' },
  { fileColumn: 'Número', fieldName: 'numero', label: 'Número' },
  { fileColumn: 'Bairro', fieldName: 'bairro', label: 'Bairro' },
  { fileColumn: 'Cidade', fieldName: 'cidade', label: 'Cidade' },
  { fileColumn: 'UF', fieldName: 'uf', label: 'UF' },
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
  const requiredsMapped = COLABORADOR_COLUMNS.filter(c => c.required).every(c => mappings.get(c.fieldName))

  function reset() { setStep('upload'); setFileData(null); setMappings(new Map()); setRows([]); setImporting(false) }
  function handleClose() { reset(); onClose() }

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) { alerts.error('Formato inválido', 'Use .xlsx, .xls ou .csv'); return }
    try {
      const data = await extractFileData(file)
      setFileData(data)
      setMappings(autoMapColumns(data.headers, COLABORADOR_COLUMNS))
      setStep('mapping')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function handleMappingConfirm() { if (!fileData) return; setRows(parseWithMappings(fileData.rows, mappings, COLABORADOR_COLUMNS)); setStep('preview') }
  function handleMappingChange(fn: string, fh: string) { setMappings(p => { const n = new Map(p); if (fh) n.set(fn, fh); else n.delete(fn); return n }) }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }

  async function handleImport() {
    setImporting(true)
    try {
      const TIPO_MAP: Record<string, string> = {
        clt: 'CLT', pj: 'PJ', estagiario: 'ESTAGIARIO', 'estagiário': 'ESTAGIARIO',
        temporario: 'TEMPORARIO', 'temporário': 'TEMPORARIO',
        autonomo: 'AUTONOMO', 'autônomo': 'AUTONOMO',
        terceirizado: 'TERCEIRIZADO',
      }

      const items: CreateColaboradorInput[] = validRows.map(r => {
        const tc = (r.data.tipoContrato ?? 'CLT').toLowerCase().trim()
        return {
          nomeCompleto: r.data.nomeCompleto ?? '',
          cpf: r.data.cpf ?? '',
          rg: r.data.rg ?? '',
          email: r.data.email ?? '',
          telefone: r.data.telefone ?? '',
          celular: r.data.celular ?? '',
          tipoContrato: (TIPO_MAP[tc] ?? 'CLT') as CreateColaboradorInput['tipoContrato'],
          dataAdmissao: r.data.dataAdmissao ?? '',
          salario: r.data.salario ? Number(r.data.salario) : null,
          cargaHoraria: r.data.cargaHoraria ? Number(r.data.cargaHoraria) : 44,
          cep: r.data.cep ?? '',
          logradouro: r.data.logradouro ?? '',
          numero: r.data.numero ?? '',
          bairro: r.data.bairro ?? '',
          cidade: r.data.cidade ?? '',
          uf: r.data.uf ?? '',
          isActive: true,
          incluirFerias: true,
        }
      })
      const result = await trpc.colaborador.importBulk.mutate({ items })
      await alerts.success(
        result.errors.length ? 'Importação parcial' : 'Importação concluída',
        `${result.created} colaborador(es) importado(s).`,
      )
      handleClose(); onSuccess()
    } catch { alerts.error('Erro', 'Não foi possível importar.') }
    finally { setImporting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
              <FileUp className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <span>Importar Colaboradores</span>
              <DialogDescription className="mt-0.5">
                {step === 'upload' && 'Faça upload de um arquivo Excel ou CSV.'}
                {step === 'mapping' && 'Mapeie as colunas do arquivo.'}
                {step === 'preview' && `${validRows.length} de ${rows.length} registros válidos.`}
              </DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {step === 'upload' && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplate(COLABORADOR_COLUMNS, 'template-colaboradores')}>
                  <Download className="h-4 w-4" />Template Excel
                </Button>
                <Button type="button" variant="soft" size="sm" onClick={() => generateTemplateCsv(COLABORADOR_COLUMNS, 'template-colaboradores')}>
                  <Download className="h-4 w-4" />Template CSV
                </Button>
              </div>
              <div
                className={cn(
                  'flex flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed px-6 py-10 transition-colors cursor-pointer',
                  dragOver ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border bg-muted/10 hover:border-emerald-400/50',
                )}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => {
                  const i = document.createElement('input')
                  i.type = 'file'; i.accept = '.xlsx,.xls,.csv'
                  i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }
                  i.click()
                }}
              >
                <FileUp className="h-10 w-10 text-muted-foreground/40" />
                <div className="text-center">
                  <p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
                </div>
              </div>
            </div>
          )}

          {step === 'mapping' && fileData && (
            <div className="py-2">
              <ColumnMapper
                fileHeaders={fileData.headers}
                firstRow={fileData.firstRow}
                systemColumns={COLABORADOR_COLUMNS}
                mappings={mappings}
                onMappingChange={handleMappingChange}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle className="h-4 w-4" /><span className="font-medium">{validRows.length} válidos</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <XCircle className="h-4 w-4" /><span className="font-medium">{invalidRows.length} erros</span>
                  </div>
                )}
              </div>
              <div className="rounded-[2px] border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Linha</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden sm:table-cell">CPF</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(row => (
                      <TableRow key={row.rowIndex} className={cn(row.valid ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : 'bg-destructive/5')}>
                        <TableCell className="text-xs font-mono">{row.rowIndex}</TableCell>
                        <TableCell className="text-sm font-medium">{row.data.nomeCompleto || '—'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{row.data.cpf || '—'}</TableCell>
                        <TableCell>
                          {row.valid
                            ? <Badge variant="success" className="text-[10px]">OK</Badge>
                            : <Badge variant="destructive" className="text-[10px]">Erro</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {invalidRows.length > 0 && (
                <div className="flex items-start gap-2 rounded-[2px] bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Registros com erros serão ignorados.</span>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {step === 'mapping' && (
            <>
              <Button variant="success" size="sm" type="button" disabled={!requiredsMapped} onClick={handleMappingConfirm}>
                <ArrowRight className="h-4 w-4" />Continuar
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={reset}>Voltar</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="success" size="sm" type="button" disabled={validRows.length === 0 || importing} onClick={handleImport}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {importing ? 'Importando...' : `Importar ${validRows.length}`}
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={() => setStep('mapping')}>Voltar ao mapeamento</Button>
            </>
          )}
          <DialogClose asChild><Button variant="outline" size="sm" type="button">Fechar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
