'use client'

import { useState, useEffect } from 'react'
import {
  Search, Loader2, CheckCircle, XCircle, AlertTriangle,
  Users, Building2, UserPlus,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Checkbox,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { TIPO_SOCIO_LABELS } from '@saas/types'

interface ClienteOption { id: string; razaoSocial: string; documento: string }

interface QsaSocio {
  nome: string
  cpfCnpj: string
  qualificacao: string
  codigoQualificacao: number
  dataEntrada: string | null
  percentualCapital: number | null
}

interface CnpjResult {
  cnpj: string
  razaoSocial: string
  qsa: QsaSocio[]
  fonte?: 'serpro' | 'brasilapi'
}

// Mapa local para exibir tipo no preview
const QUALIFICACAO_MAP: Record<number, string> = {
  5: 'SOCIO_ADMINISTRADOR', 8: 'PROCURADOR', 10: 'SOCIO_DIRETOR',
  16: 'REPRESENTANTE_LEGAL', 22: 'SOCIO_QUOTISTA', 49: 'SOCIO_ADMINISTRADOR',
  50: 'SOCIO_QUOTISTA', 52: 'SOCIO_QUOTISTA', 54: 'TITULAR', 55: 'SOCIO_QUOTISTA',
  65: 'TITULAR',
}

interface QsaImportModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  prefilledCnpj?: string
  prefilledClienteId?: string
}

export function QsaImportModal({ open, onClose, onSuccess, prefilledCnpj, prefilledClienteId }: QsaImportModalProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [cnpj, setCnpj] = useState(prefilledCnpj || '')
  const [clienteId, setClienteId] = useState(prefilledClienteId || '')
  const [substituir, setSubstituir] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<CnpjResult | null>(null)
  const [clientes, setClientes] = useState<ClienteOption[]>([])

  useEffect(() => {
    if (open) {
      trpc.cliente.listForSelect.query()
        .then((c) => setClientes(c as ClienteOption[]))
        .catch(() => {})
      if (prefilledCnpj) setCnpj(prefilledCnpj)
      if (prefilledClienteId) setClienteId(prefilledClienteId)
    }
  }, [open, prefilledCnpj, prefilledClienteId])

  function reset() {
    setStep('input')
    setCnpj(prefilledCnpj || '')
    setClienteId(prefilledClienteId || '')
    setSubstituir(false)
    setResultado(null)
    setLoading(false)
    setImporting(false)
  }

  function handleClose() { reset(); onClose() }

  async function handleConsultar() {
    const doc = cnpj.replace(/\D/g, '')
    if (doc.length !== 14) {
      alerts.error('CNPJ inválido', 'Informe um CNPJ com 14 dígitos.')
      return
    }
    setLoading(true)
    try {
      const result = await trpc.socio.consultarCnpj.query({ cnpj: doc }) as CnpjResult
      setResultado(result)
      if (result.qsa.length === 0) {
        alerts.error('QSA vazio', 'Nenhum sócio encontrado no quadro societário deste CNPJ.')
      } else {
        setStep('preview')
      }
    } catch (e) {
      alerts.error('Erro na consulta', (e as Error).message || 'Não foi possível consultar o CNPJ.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImportar() {
    const doc = cnpj.replace(/\D/g, '')
    setImporting(true)
    try {
      const result = await trpc.socio.importarQsa.mutate({
        cnpj: doc,
        clienteId: clienteId || undefined,
        substituir,
      }) as { importados: number; total: number; erros: string[]; message: string }

      if (result.erros.length > 0) {
        await alerts.success('Importação parcial', result.message)
      } else {
        await alerts.success('QSA importado', result.message)
      }
      handleClose()
      onSuccess()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível importar o QSA.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border/60 bg-muted/30">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
              <Users className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <span>Importar QSA do CNPJ</span>
              <DialogDescription className="mt-0.5">
                {step === 'input' && 'Informe o CNPJ para consultar o quadro de sócios na Receita Federal.'}
                {step === 'preview' && resultado && `${resultado.qsa.length} sócio(s) encontrado(s) — ${resultado.razaoSocial}`}
              </DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 max-h-[60vh] overflow-y-auto">
          {step === 'input' && (
            <div className="space-y-4 py-3">
              {/* CNPJ */}
              <div>
                <Label htmlFor="qsa-cnpj">CNPJ da empresa</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    id="qsa-cnpj"
                    placeholder="00.000.000/0000-00"
                    value={masks.cnpj(cnpj)}
                    onChange={(e) => setCnpj(masks.cnpj(e.target.value))}
                    className="flex-1 font-mono"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleConsultar}
                    disabled={loading || cnpj.replace(/\D/g, '').length < 14}
                    className="gap-1.5 shrink-0"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {loading ? 'Consultando...' : 'Consultar'}
                  </Button>
                </div>
              </div>

              {/* Vincular a cliente */}
              <div>
                <Label>Vincular sócios ao cliente (opcional)</Label>
                <Select value={clienteId || '__none__'} onValueChange={(v) => setClienteId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum — cadastrar sem vínculo</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.razaoSocial} ({masks.cnpj(c.documento)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Substituir existentes */}
              {clienteId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={substituir} onCheckedChange={(v) => setSubstituir(v as boolean)} />
                  <span className="text-sm">Substituir sócios existentes deste cliente</span>
                </label>
              )}

              {/* Aviso */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 text-xs text-blue-700 dark:text-blue-400">
                <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Os dados são obtidos da base pública da Receita Federal via BrasilAPI. O CPF dos sócios pode vir parcialmente mascarado (***XXXXXX**).</span>
              </div>
            </div>
          )}

          {step === 'preview' && resultado && (
            <div className="space-y-3 py-3">
              {/* Info da empresa */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/60">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{resultado.razaoSocial}</p>
                    <p className="text-xs text-muted-foreground font-mono">{masks.cnpj(resultado.cnpj)}</p>
                  </div>
                </div>
                {resultado.fonte && (
                  <Badge variant={resultado.fonte === 'serpro' ? 'success' : 'outline'} className="text-[10px] shrink-0">
                    {resultado.fonte === 'serpro' ? 'SERPRO' : 'BrasilAPI'}
                  </Badge>
                )}
              </div>

              {/* Tabela de sócios */}
              <div className="rounded-[2px] border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-[130px]">CPF/CNPJ</TableHead>
                      <TableHead className="hidden sm:table-cell">Qualificação</TableHead>
                      <TableHead className="w-[90px]">Participação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.qsa.map((s, i) => {
                      const tipo = QUALIFICACAO_MAP[s.codigoQualificacao] || 'SOCIO_QUOTISTA'
                      return (
                        <TableRow key={i} className="bg-emerald-50/30 dark:bg-emerald-950/10">
                          <TableCell className="text-sm font-medium">{s.nome}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{s.cpfCnpj}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px]">
                              {TIPO_SOCIO_LABELS[tipo] || s.qualificacao}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.percentualCapital != null ? `${s.percentualCapital}%` : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {substituir && clienteId && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Os sócios existentes deste cliente serão removidos e substituídos pelos do QSA.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/30">
          {step === 'preview' && (
            <>
              <Button
                variant="success"
                size="sm"
                type="button"
                disabled={importing || !resultado?.qsa.length}
                onClick={handleImportar}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {importing ? 'Importando...' : `Importar ${resultado?.qsa.length} sócio(s)`}
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={() => setStep('input')}>Voltar</Button>
            </>
          )}
          <DialogClose asChild>
            <Button variant="outline" size="sm" type="button">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
