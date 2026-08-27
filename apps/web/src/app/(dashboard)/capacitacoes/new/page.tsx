'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import {
  Button, Input, Label, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { UserMultiPicker } from '@/components/user-multi-picker'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CAPACITACAO_AMBITO_LABEL } from '@saas/types'


interface Opcao { id: string; nome: string }
interface Usuario { id: string; name: string; email: string | null; image: string | null }

/** Prazo de avaliação: o v1 usava um parâmetro de 6 meses a partir da data. */
function prazoPadrao(dataInicio: string): string {
  const d = new Date(`${dataInicio}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCMonth(d.getUTCMonth() + 6)
  return d.toISOString().slice(0, 10)
}

export default function NovaCapacitacaoPage() {
  const router = useRouter()
  const [metodos, setMetodos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const hoje = new Date().toISOString().slice(0, 10)
  const [titulo, setTitulo] = useState('')
  const [ambito, setAmbito] = useState<'INTERNA' | 'EXTERNA'>('INTERNA')
  const [metodoId, setMetodoId] = useState('')
  const [instrutor, setInstrutor] = useState('')
  const [organizacao, setOrganizacao] = useState('')
  const [local, setLocal] = useState('')
  const [dataInicio, setDataInicio] = useState(hoje)
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [carga, setCarga] = useState('')
  const [custo, setCusto] = useState('')
  const [prazo, setPrazo] = useState(prazoPadrao(hoje))
  const [descricao, setDescricao] = useState('')
  const [participantes, setParticipantes] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(trpc.capacitacao as any).listarMetodos.query({}).then(setMetodos).catch(() => setMetodos([]))
    ;(trpc.capacitacao as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  // O prazo acompanha a data enquanto o usuário não mexer nele à mão.
  const [prazoTocado, setPrazoTocado] = useState(false)
  useEffect(() => {
    if (!prazoTocado) setPrazo(prazoPadrao(dataInicio))
  }, [dataInicio, prazoTocado])

  const numero = (v: string) => {
    const t = v.trim().replace(/\./g, '').replace(',', '.')
    if (!t) return undefined
    const n = Number(t)
    return Number.isFinite(n) ? n : undefined
  }

  async function salvar() {
    if (titulo.trim().length < 3) { alerts.error('Falta o título', 'Dê um título à capacitação.'); return }
    setSalvando(true)
    try {
      const c = await (trpc.capacitacao as any).criar.mutate({
        titulo: titulo.trim(),
        ambito,
        metodoId: metodoId || null,
        instrutor: instrutor.trim() || null,
        organizacao: organizacao.trim() || null,
        local: local.trim() || null,
        dataInicio,
        horaInicio: horaInicio || null,
        horaFim: horaFim || null,
        cargaHoraria: numero(carga),
        custo: numero(custo),
        prazoAvaliacao: prazo || null,
        descricao: descricao || null,
        participantesIds: participantes,
      }) as { id: string }
      alerts.success('Capacitação solicitada', 'Registro criado.')
      router.push(`/capacitacoes/${c.id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
          </Button>
          <BackButton href="/capacitacoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Nova Capacitação</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Capacitações</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Nova Capacitação</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Tipo</Label>
            <Select value={ambito} onValueChange={(v) => setAmbito(v as 'INTERNA' | 'EXTERNA')}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['INTERNA', 'EXTERNA'] as const).map((a) => (
                  <SelectItem key={a} value={a}>{CAPACITACAO_AMBITO_LABEL[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-9">
            <Label className="text-[13px] font-semibold">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 text-sm mt-1.5" placeholder="Ex.: Treinamento de eSocial" />
          </div>

          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Método</Label>
            <Select value={metodoId || '__none__'} onValueChange={(v) => setMetodoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem método</SelectItem>
                {metodos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6 md:col-span-4">
            <Label className="text-[13px] font-semibold">Aplicado por</Label>
            <Input value={instrutor} onChange={(e) => setInstrutor(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12 md:col-span-5">
            <Label className="text-[13px] font-semibold">Organização</Label>
            <Input value={organizacao} onChange={(e) => setOrganizacao(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>

          <div className="col-span-12 md:col-span-5">
            <Label className="text-[13px] font-semibold">Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Data</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-3 md:col-span-2">
            <Label className="text-[13px] font-semibold">Início</Label>
            <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-3 md:col-span-2">
            <Label className="text-[13px] font-semibold">Fim</Label>
            <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>

          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Horas por colaborador</Label>
            <Input value={carga} onChange={(e) => setCarga(e.target.value)} className="h-9 text-sm mt-1.5" placeholder="8" />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Investimento (R$)</Label>
            <Input value={custo} onChange={(e) => setCusto(e.target.value)} className="h-9 text-sm mt-1.5" placeholder="0,00" />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Prazo para avaliação</Label>
            <Input type="date" value={prazo} onChange={(e) => { setPrazo(e.target.value); setPrazoTocado(true) }} className="h-9 text-sm mt-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">Sugerido: 6 meses após a data.</p>
          </div>

          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Participantes</Label>
            <div className="mt-1.5">
              <UserMultiPicker users={usuarios} value={participantes} onChange={setParticipantes}
                placeholder="Quem vai participar" accentClass="bg-amber-500 border-amber-500" />
            </div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Detalhamento</Label>
            <div className="mt-1.5"><RichEditor value={descricao} onChange={setDescricao} placeholder="Conteúdo, objetivos, justificativa..." /></div>
          </div>
        </div>
      </Card>
    </div>
  )
}
