'use client'

// ============================================================
// Importação de Modelos de Tratamento (o caminho de volta do "Exportar") — mesma
// UX do importador de /areas: etapa de upload (clique ou arraste .json/.zip) e
// etapa de conferência. Na conferência, um modelo por linha: nome editável (avisa
// nome já existente), tipo de arquivo (obrigatório — arquivos antigos podem vir
// sem) e o arquivo de origem; arquivo inválido aparece com o motivo e fica de fora.
// Cada modelo vira um modelo NOVO (versão 1, nota "Importado de <arquivo>") pelo
// `create` comum. Leitura/validação dos arquivos: lib/import-modelos.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, FileJson, FileUp, Loader2, XCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, DialogClose,
  Button, Checkbox, Input, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { TIPO_ARQUIVO_MODELO, TIPO_ARQUIVO_MODELO_LABELS, type TipoArquivoModelo, type TreatmentDefinition } from '@saas/types'
import { TEXT } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { esc } from './model-editor/utils'
import { lerArquivosDeModelo, type ModeloLido } from '../lib/import-modelos'

interface Linha {
  arquivo: string
  incluir: boolean
  nome: string
  tipo: TipoArquivoModelo | null
  definition: TreatmentDefinition
}
type Invalido = Extract<ModeloLido, { ok: false }>

const chaveNome = (s: string) => s.trim().toLocaleLowerCase('pt-BR')

export function ImportarModelosDialog({ open, onClose, onSuccess }: {
  open: boolean
  onClose: () => void
  /** Chamado após importar ao menos um modelo (recarregar a lista). */
  onSuccess: () => void
}) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [invalidos, setInvalidos] = useState<Invalido[]>([])
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null)

  // Nomes dos modelos atuais, para avisar duplicidade (não bloqueia — o nome é
  // editável aqui mesmo).
  useEffect(() => {
    if (!open) return
    trpc.tratamentoLancamentos.listForSelect.query()
      .then((ms) => setExistentes(new Set(ms.map((m) => chaveNome(m.nome)))))
      .catch(() => setExistentes(new Set()))
  }, [open])

  function reset() { setStep('upload'); setLinhas([]); setInvalidos([]); setProgresso(null) }
  function handleClose() { if (progresso) return; reset(); onClose() }

  async function handleFiles(files: File[]) {
    if (!files.length) return
    setLendo(true)
    try {
      const lidos = await lerArquivosDeModelo(files)
      setLinhas(lidos.flatMap((l) => (l.ok
        ? [{ arquivo: l.arquivo, incluir: true, nome: l.modelo.nome, tipo: l.modelo.tipoArquivo, definition: l.modelo.definition }]
        : [])))
      setInvalidos(lidos.filter((l): l is Invalido => !l.ok))
      setStep('preview')
    } finally {
      setLendo(false)
    }
  }
  function escolherArquivos() {
    const i = document.createElement('input')
    i.type = 'file'; i.accept = '.json,.zip'; i.multiple = true
    i.onchange = (e) => { void handleFiles([...((e.target as HTMLInputElement).files ?? [])]) }
    i.click()
  }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragOver(false); void handleFiles([...e.dataTransfer.files]) }

  const set = (i: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const incluidas = linhas.filter((l) => l.incluir)
  // Nome repetido dentro da própria leva também vale aviso.
  const contagemNomes = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of linhas) if (l.incluir) m.set(chaveNome(l.nome), (m.get(chaveNome(l.nome)) ?? 0) + 1)
    return m
  }, [linhas])
  const nomeCurto = (l: Linha) => l.nome.trim().length < 2
  const pendentes = incluidas.filter((l) => !l.tipo || nomeCurto(l)).length
  const importando = progresso !== null

  async function importar() {
    const alvo = incluidas
    setProgresso({ feitos: 0, total: alvo.length })
    const falhas: Array<{ nome: string; motivo: string }> = []
    let criados = 0
    for (let i = 0; i < alvo.length; i++) {
      const l = alvo[i]!
      try {
        await trpc.tratamentoLancamentos.create.mutate({
          nome: l.nome.trim(),
          tipoArquivo: l.tipo!,
          definition: l.definition,
          note: `Importado de ${l.arquivo}`,
          isActive: true,
        })
        criados++
      } catch (e) {
        falhas.push({ nome: l.nome.trim(), motivo: (e as Error).message || 'Não foi possível criar o modelo.' })
      }
      setProgresso({ feitos: i + 1, total: alvo.length })
    }
    setProgresso(null)
    if (criados) { reset(); onClose(); onSuccess() }
    const resumo = `${criados} de ${alvo.length} ${alvo.length === 1 ? 'modelo importado' : 'modelos importados'}.`
    if (!falhas.length) {
      await alerts.success('Importação concluída', resumo)
      return
    }
    await alerts.custom({
      title: criados ? 'Importação parcial' : 'Nenhum modelo importado',
      icon: criados ? 'warning' : 'error',
      showCancelButton: false,
      confirmButtonText: 'Entendi',
      html: `<div style="text-align:left"><p style="margin:0 0 8px">${resumo} Não foram importados:</p><ul style="margin:0;padding-left:1.2em;line-height:1.6">${falhas.map((f) => `<li><b>${esc(f.nome)}</b> — ${esc(f.motivo)}</li>`).join('')}</ul></div>`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeaderIcon icon={FileUp} color="emerald">
          <DialogTitle>Importar Modelos</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Envie arquivos exportados de Modelos de Tratamento (.json, ou o .zip com vários).'}
            {step === 'preview' && `${linhas.length} de ${linhas.length + invalidos.length} ${linhas.length + invalidos.length === 1 ? 'arquivo válido' : 'arquivos válidos'}. Cada modelo vira um modelo novo, na versão 1.`}
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody>
          {step === 'upload' && (
            <div className="py-2">
              <div
                className={cn('flex flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed px-6 py-10 transition-colors cursor-pointer', dragOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/10 hover:border-primary/50')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                onClick={() => { if (!lendo) escolherArquivos() }}
              >
                {lendo
                  ? <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/40" />
                  : <FileUp className="h-10 w-10 text-muted-foreground/40" />}
                <div className="text-center">
                  <p className="text-sm font-medium">{lendo ? 'Lendo arquivos...' : 'Clique ou arraste os arquivos aqui'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">.json (um modelo) ou .zip (vários, como o &quot;Exportar&quot; gera)</p>
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <div className={cn('flex items-center gap-1.5', TEXT.emerald)}><CheckCircle className="h-4 w-4" /><span className="font-medium">{linhas.length} {linhas.length === 1 ? 'válido' : 'válidos'}</span></div>
                {invalidos.length > 0 && <div className="flex items-center gap-1.5 text-destructive"><XCircle className="h-4 w-4" /><span className="font-medium">{invalidos.length} {invalidos.length === 1 ? 'erro' : 'erros'}</span></div>}
              </div>

              {linhas.length > 0 && (
                <div className="rounded-[2px] border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[44px]" />
                        <TableHead>Nome do modelo</TableHead>
                        <TableHead className="w-[190px]">Tipo de arquivo</TableHead>
                        <TableHead className="w-[220px]">Arquivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.map((l, i) => {
                        const repetido = l.incluir && (existentes.has(chaveNome(l.nome)) || (contagemNomes.get(chaveNome(l.nome)) ?? 0) > 1)
                        return (
                          <TableRow key={`${i}:${l.arquivo}`} className={cn(!l.incluir && 'opacity-60')}>
                            <TableCell className="align-top pt-4">
                              <Checkbox checked={l.incluir} disabled={importando} onCheckedChange={(v) => set(i, { incluir: !!v })} aria-label="Importar este modelo" />
                            </TableCell>
                            <TableCell className="align-top">
                              <Input
                                className={cn('h-8 text-xs', l.incluir && nomeCurto(l) && 'border-destructive')}
                                value={l.nome} disabled={!l.incluir || importando}
                                onChange={(e) => set(i, { nome: e.target.value })}
                              />
                              {repetido && (
                                <p className={cn('mt-1 flex items-center gap-1 text-[11px]', TEXT.amber)}>
                                  <AlertTriangle className="h-3 w-3 shrink-0" /> Já existe um modelo com este nome.
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="align-top">
                              <Select value={l.tipo ?? ''} disabled={!l.incluir || importando} onValueChange={(v) => set(i, { tipo: v as TipoArquivoModelo })}>
                                <SelectTrigger className={cn('h-8 text-xs', l.incluir && !l.tipo && 'border-destructive')}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent>
                                  {TIPO_ARQUIVO_MODELO.map((t) => <SelectItem key={t} value={t}>{TIPO_ARQUIVO_MODELO_LABELS[t]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="align-top pt-3.5">
                              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={l.arquivo}>
                                <FileJson className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.arquivo}</span>
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {invalidos.length > 0 && (
                <div className="space-y-1.5 rounded-[2px] bg-destructive/5 px-3 py-2">
                  <ul className="space-y-1 text-xs">
                    {invalidos.map((l, i) => (
                      <li key={`${i}:${l.arquivo}`} className="flex items-start gap-1.5">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        <span><b className="font-medium text-foreground">{l.arquivo}</b> <span className="text-muted-foreground">— {l.erro}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pendentes > 0 && (
                <div className={cn('flex items-start gap-2 rounded-[2px] bg-amber-500/10 px-3 py-2 text-xs', TEXT.amber)}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Informe o nome e o tipo de arquivo {pendentes === 1 ? 'do modelo destacado' : `dos ${pendentes} modelos destacados`} para importar.</span>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="success" size="sm" type="button" disabled={!incluidas.length || pendentes > 0 || importando} onClick={importar}>
                {progresso ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {progresso ? `Importando ${progresso.feitos} de ${progresso.total}...` : `Importar ${incluidas.length}`}
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={importando} onClick={reset}>Voltar</Button>
            </>
          )}
          <DialogClose asChild><Button variant="outline" size="sm" type="button" disabled={importando}>Fechar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
