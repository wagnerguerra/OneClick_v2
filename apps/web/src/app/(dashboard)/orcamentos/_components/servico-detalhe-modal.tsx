'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Input, Label, RichEditor, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Pencil, Loader2, ExternalLink, Save } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Props {
  servicoId: string
  open: boolean
  onClose: () => void
}

const PRIORIDADES = [
  { v: 'BAIXA', l: 'Baixa' }, { v: 'MEDIA', l: 'Média' },
  { v: 'ALTA', l: 'Alta' }, { v: 'URGENTE', l: 'Urgente' },
]

export function ServicoDetalheModal({ servicoId, open, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])

  const [nome, setNome] = useState('')
  const [areaId, setAreaId] = useState('') // id da área (era `categoria`, nome)
  const [categoriaServico, setCategoriaServico] = useState<'EXTRA' | 'MENSAL' | 'FLUXO'>('EXTRA')
  const [prioridade, setPrioridade] = useState('MEDIA')
  const [valorPadrao, setValorPadrao] = useState('') // reais
  const [descricao, setDescricao] = useState('')

  useEffect(() => {
    if (!open || !servicoId) return
    setLoading(true); setErro(null)
    ;(trpc.area as unknown as { listForSelect: { query: () => Promise<Array<{ id: string; name: string }>> } })
      .listForSelect.query().then(setAreas).catch(() => setAreas([]))
    ;(trpc.servico as unknown as { getServico: { query: (i: { id: string }) => Promise<Record<string, unknown>> } })
      .getServico.query({ id: servicoId })
      .then(s => {
        setNome((s.nome as string) ?? '')
        setAreaId((s.areaId as string) ?? '')
        setCategoriaServico(((s.categoriaServico as 'EXTRA' | 'MENSAL' | 'FLUXO') ?? (s.recorrenteMensal ? 'MENSAL' : 'EXTRA')))
        setPrioridade((s.prioridadePadrao as string) ?? 'MEDIA')
        setValorPadrao(s.valorPadrao != null ? String(Number(s.valorPadrao)) : '')
        setDescricao((s.descricao as string) ?? '')
      })
      .catch(e => setErro((e as Error).message || 'Falha ao carregar o serviço.'))
      .finally(() => setLoading(false))
  }, [open, servicoId])

  async function salvar() {
    if (!nome.trim()) { alerts.error('Validação', 'Nome é obrigatório.'); return }
    setSaving(true)
    try {
      const valor = valorPadrao.trim() ? Number(valorPadrao.replace(',', '.')) : null
      await (trpc.servico as unknown as { updateServico: { mutate: (i: unknown) => Promise<unknown> } })
        .updateServico.mutate({
          id: servicoId,
          data: {
            nome: nome.trim(),
            descricao: descricao || null,
            areaId: areaId || null,
            categoriaServico,
            recorrenteMensal: categoriaServico === 'MENSAL',
            prioridadePadrao: prioridade,
            valorPadrao: Number.isFinite(valor as number) ? valor : null,
          },
        })
      await alerts.success('Salvo', 'Serviço atualizado com sucesso.')
      onClose()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto nice-scrollbar">
        <DialogHeaderIcon icon={Pencil} color="sky">
          <DialogTitle>Editar serviço</DialogTitle>
          <DialogDescription>Ajuste os detalhes do template do serviço. Alterações valem para todos os orçamentos e execuções que usam este serviço.</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
          ) : erro ? (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{erro}</div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Nome</Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="col-span-12 sm:col-span-6 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Área</Label>
                  <Select value={areaId || '__none__'} onValueChange={v => setAreaId(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 sm:col-span-3 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Tipo</Label>
                  <Select value={categoriaServico} onValueChange={v => setCategoriaServico(v as 'EXTRA' | 'MENSAL' | 'FLUXO')}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXTRA">Extra</SelectItem>
                      <SelectItem value="MENSAL">Mensal</SelectItem>
                      <SelectItem value="FLUXO">Fluxo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 sm:col-span-3 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Prioridade</Label>
                  <Select value={prioridade} onValueChange={setPrioridade}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map(p => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12 sm:col-span-4 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Valor padrão (R$)</Label>
                  <Input value={valorPadrao} onChange={e => setValorPadrao(e.target.value)} placeholder="0,00" inputMode="decimal" className="h-9 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <RichEditor value={descricao} onChange={setDescricao} placeholder="Descrição do serviço..." maxHeight={220} />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Etapas, passos, fluxo e texto padrão são editados na tela completa do serviço.{' '}
                <button type="button" onClick={() => window.open(`/servicos/${servicoId}`, '_blank')} className={cn('inline-flex items-center gap-1 font-medium', TEXT.sky, 'hover:underline')}>
                  Abrir edição completa <ExternalLink className="h-3 w-3" />
                </button>
              </p>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="success" size="sm" className="gap-1.5" onClick={salvar} disabled={loading || saving || !!erro}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
