'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, X, Plus } from 'lucide-react'
import {
  Button, Input, Label, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { UserMultiPicker } from '@/components/user-multi-picker'
import { ClienteCombobox } from '@/app/(dashboard)/orcamentos/_components/cliente-combobox'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'


interface Opcao { id: string; nome: string }
interface Usuario { id: string; name: string; email: string | null; image: string | null }
interface ClienteOpt { id: string; razaoSocial: string; documento?: string | null }

/**
 * Registro de reunião — feito DEPOIS de ela acontecer, com pauta, ata e quem
 * participou. Colaboradores entram por ID; convidado externo (gente do
 * cliente) entra pelo nome, porque não há usuário a apontar — e 264 das 281
 * reuniões do v1 tinham cliente, então convidado de fora é rotina.
 */
export default function NovaReuniaoPage() {
  const router = useRouter()
  const [tipos, setTipos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [clientes, setClientes] = useState<ClienteOpt[]>([])

  const [titulo, setTitulo] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [dataReuniao, setDataReuniao] = useState(new Date().toISOString().slice(0, 10))
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [local, setLocal] = useState('')
  const [pauta, setPauta] = useState('')
  const [ata, setAta] = useState('')
  const [participantes, setParticipantes] = useState<string[]>([])
  const [convidados, setConvidados] = useState<string[]>([])
  const [novoConvidado, setNovoConvidado] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(trpc.reuniao as any).listarTipos.query({}).then(setTipos).catch(() => setTipos([]))
    ;(trpc.reuniao as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
    ;(trpc.reuniao as any).listarClientes.query().then(setClientes).catch(() => setClientes([]))
  }, [])

  function addConvidado() {
    const nome = novoConvidado.trim()
    if (!nome) return
    if (!convidados.some((c) => c.toLowerCase() === nome.toLowerCase())) {
      setConvidados((prev) => [...prev, nome])
    }
    setNovoConvidado('')
  }

  async function salvar() {
    if (titulo.trim().length < 3) { alerts.error('Falta o título', 'Dê um título à reunião.'); return }
    setSalvando(true)
    try {
      const r = await (trpc.reuniao as any).criar.mutate({
        titulo: titulo.trim(),
        tipoId: tipoId || null,
        clienteId: clienteId || null,
        data: dataReuniao,
        horaInicio: horaInicio || null,
        horaFim: horaFim || null,
        local: local.trim() || null,
        pauta: pauta || null,
        ata: ata || null,
        participantes: [
          ...participantes.map((id) => ({ usuarioId: id })),
          ...convidados.map((nome) => ({ nome })),
        ],
      }) as { id: string }
      alerts.success('Reunião registrada', 'Registro criado.')
      router.push(`/reunioes/${r.id}`)
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
          <BackButton href="/reunioes" label="Voltar" />
      </>}>
        <h1 className="truncate">Nova Reunião</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Reuniões</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Nova Reunião</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Tipo</Label>
            <Select value={tipoId || '__none__'} onValueChange={(v) => setTipoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem tipo</SelectItem>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-9">
            <Label className="text-[13px] font-semibold">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 text-sm mt-1.5" placeholder="Ex.: Análise crítica do trimestre" />
          </div>

          <div className="col-span-12 md:col-span-5">
            <Label className="text-[13px] font-semibold">Cliente</Label>
            <div className="mt-1.5">
              <ClienteCombobox clientes={clientes} value={clienteId} onSelect={setClienteId} placeholder="Reunião interna (sem cliente)" />
            </div>
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Data</Label>
            <Input type="date" value={dataReuniao} onChange={(e) => setDataReuniao(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-3 md:col-span-2">
            <Label className="text-[13px] font-semibold">Início</Label>
            <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-3 md:col-span-2">
            <Label className="text-[13px] font-semibold">Fim</Label>
            <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>

          <div className="col-span-12 md:col-span-6">
            <Label className="text-[13px] font-semibold">Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} className="h-9 text-sm mt-1.5" placeholder="Sala de reuniões, on-line..." />
          </div>

          <div className="col-span-12 md:col-span-6">
            <Label className="text-[13px] font-semibold">Participantes (colaboradores)</Label>
            <div className="mt-1.5">
              <UserMultiPicker users={usuarios} value={participantes} onChange={setParticipantes}
                placeholder="Quem participou" accentClass="bg-amber-500 border-amber-500" />
            </div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Convidados externos</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input value={novoConvidado} onChange={(e) => setNovoConvidado(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addConvidado() } }}
                className="h-9 text-sm" placeholder="Nome do convidado (gente do cliente, por exemplo) — Enter adiciona" />
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addConvidado} disabled={!novoConvidado.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {convidados.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {convidados.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 bg-muted rounded-full pl-2 pr-1.5 py-0.5 text-[11px]">
                    {c}
                    <button type="button" className="hover:text-destructive" onClick={() => setConvidados((prev) => prev.filter((x) => x !== c))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Pauta</Label>
            <div className="mt-1.5"><RichEditor value={pauta} onChange={setPauta} placeholder="O que foi discutido..." /></div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Ata</Label>
            <div className="mt-1.5"><RichEditor value={ata} onChange={setAta} placeholder="O que foi decidido..." /></div>
          </div>
        </div>
      </Card>
    </div>
  )
}
