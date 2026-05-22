'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Receipt, Save, Loader2 } from 'lucide-react'
import {
  Button, Card, Input, Label,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  OBRIGACAO_CATEGORIAS,
  RECORRENCIA_FREQUENCIA, RECORRENCIA_FREQUENCIA_LABELS,
  RECORRENCIA_ANCORAGEM, RECORRENCIA_ANCORAGEM_LABELS,
  type ObrigacaoCategoria,
  type RecorrenciaFrequencia,
  type RecorrenciaAncoragem,
} from '@saas/types'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

export default function NovaObrigacaoPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState<ObrigacaoCategoria>('Fiscal')
  const [fonteUrl, setFonteUrl] = useState('')
  const [documentacaoUrl, setDocumentacaoUrl] = useState('')

  const [frequencia, setFrequencia] = useState<RecorrenciaFrequencia>('MENSAL')
  const [ancoragem, setAncoragem] = useState<RecorrenciaAncoragem>('DIA_DO_MES')
  const [valorAncoragem, setValorAncoragem] = useState<number>(20)
  const [competenciaOffset, setCompetenciaOffset] = useState<number>(1)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      alerts.error('Nome obrigatório', 'Informe o nome da obrigação.')
      return
    }
    setSaving(true)
    try {
      const novo = await trpc.obrigacao.create.mutate({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        categoria,
        fonteUrl: fonteUrl.trim() || null,
        documentacaoUrl: documentacaoUrl.trim() || null,
        recorrencia: {
          frequencia,
          ancoragem,
          valorAncoragem,
          competenciaOffset,
        },
      })
      await alerts.success('Obrigação criada', `"${nome}" foi adicionada ao catálogo.`)
      router.push(`/servicos/${novo.id}`)
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao criar obrigação.')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/obrigacoes"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[4px] text-white shadow"
              style={{ backgroundColor: MODULE_COLOR }}
            >
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1>Nova Obrigação Acessória</h1>
              <p className="text-xs text-muted-foreground">Catálogo global — disponível para todos os clientes</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="p-5">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-9 space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome <span className="text-red-500">*</span></Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: ICMS — Apuração Mensal"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="col-span-12 sm:col-span-3 space-y-1.5">
              <Label className="text-[13px] font-semibold">Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as ObrigacaoCategoria)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBRIGACAO_CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Resumo da obrigação, base legal, periodicidade..."
                className="min-h-[80px] w-full rounded-[4px] border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label className="text-[13px] font-semibold">Fonte oficial (URL)</Label>
              <Input
                type="url"
                value={fonteUrl}
                onChange={(e) => setFonteUrl(e.target.value)}
                placeholder="https://www.gov.br/..."
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Página onde o vencimento foi confirmado (agenda fiscal, IN, lei).</p>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label className="text-[13px] font-semibold">Documentação (URL)</Label>
              <Input
                type="url"
                value={documentacaoUrl}
                onChange={(e) => setDocumentacaoUrl(e.target.value)}
                placeholder="https://www.gov.br/..."
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Manual, FAQ ou guia oficial.</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] pb-3 -mx-5 px-5">
            <h4 className="text-[13px] font-semibold text-foreground">Recorrência</h4>
            <span className="text-[11px] text-muted-foreground">
              Ajustes finos (modo personalizado, dias específicos) ficam disponíveis no detalhe do serviço.
            </span>
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-3 space-y-1.5">
              <Label className="text-[13px] font-semibold">Frequência</Label>
              <Select value={frequencia} onValueChange={(v) => setFrequencia(v as RecorrenciaFrequencia)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORRENCIA_FREQUENCIA.map((f) => <SelectItem key={f} value={f}>{RECORRENCIA_FREQUENCIA_LABELS[f]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Ancoragem</Label>
              <Select value={ancoragem} onValueChange={(v) => setAncoragem(v as RecorrenciaAncoragem)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORRENCIA_ANCORAGEM.map((a) => <SelectItem key={a} value={a}>{RECORRENCIA_ANCORAGEM_LABELS[a]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-6 sm:col-span-2 space-y-1.5">
              <Label className="text-[13px] font-semibold">Valor</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={valorAncoragem}
                onChange={(e) => setValorAncoragem(Number(e.target.value || 1))}
                className="h-9 text-sm tabular-nums"
              />
            </div>
            <div className="col-span-6 sm:col-span-3 space-y-1.5">
              <Label className="text-[13px] font-semibold">Offset competência (meses)</Label>
              <Input
                type="number"
                min={0}
                max={12}
                value={competenciaOffset}
                onChange={(e) => setCompetenciaOffset(Number(e.target.value || 0))}
                className="h-9 text-sm tabular-nums"
              />
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/obrigacoes">Cancelar</Link>
          </Button>
          <Button
            type="submit"
            disabled={saving}
            style={{ backgroundColor: MODULE_COLOR, color: 'white' }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Criar obrigação
          </Button>
        </div>
      </form>
    </div>
  )
}
