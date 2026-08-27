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
import { ClienteCombobox } from '../../orcamentos/_components/cliente-combobox'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Opcao { id: string; nome?: string; name?: string }
interface ClienteOpt { id: string; razaoSocial: string; documento: string | null }
interface Usuario { id: string; name: string }

/**
 * Registro de nova Não Conformidade — os campos do create do v1. A causa é
 * opcional aqui: sem ela a NC nasce "Aguardando Causa" (fluxo do usu do v1);
 * com ela, já vai para "Aguardando Ações".
 */
export default function NovaNaoConformidadePage() {
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteOpt[]>([])
  const [areas, setAreas] = useState<Opcao[]>([])
  const [processos, setProcessos] = useState<Opcao[]>([])
  const [origens, setOrigens] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const [clienteId, setClienteId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [origemId, setOrigemId] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [prazo, setPrazo] = useState('')
  const [detalhamento, setDetalhamento] = useState('')
  const [causa, setCausa] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(trpc.naoConformidade as any).listarClientes.query().then(setClientes).catch(() => setClientes([]))
    ;(trpc.naoConformidade as any).listarAreas.query().then(setAreas).catch(() => setAreas([]))
    ;(trpc.naoConformidade as any).listarProcessos.query().then(setProcessos).catch(() => setProcessos([]))
    ;(trpc.naoConformidade as any).listarOrigens.query().then(setOrigens).catch(() => setOrigens([]))
    ;(trpc.naoConformidade as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function salvar() {
    const fato = detalhamento.replace(/<[^>]*>/g, '').trim()
    if (fato.length < 3) { alerts.error('Falta o fato gerador', 'Descreva a não conformidade.'); return }
    setSalvando(true)
    try {
      const { id } = await (trpc.naoConformidade as any).criar.mutate({
        clienteId: clienteId || null,
        areaId: areaId || null,
        processoId: processoId || null,
        origemId: origemId || null,
        responsavelId: responsavelId || null,
        prazo: prazo || null,
        detalhamento,
        causa: causa.replace(/<[^>]*>/g, '').trim() ? causa : null,
      })
      alerts.success('Registrada', 'Não conformidade criada.')
      router.push(`/nao-conformidades/${id}`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Registrar
          </Button>
          <BackButton href="/nao-conformidades" label="Voltar" />
      </>}>
        <h1 className="truncate">Nova Não Conformidade</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Não Conformidades</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Nova Não Conformidade</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Cliente</Label>
            <div className="mt-1.5">
              <ClienteCombobox clientes={clientes} value={clienteId} onSelect={setClienteId} placeholder="Selecione o cliente (quando houver)" />
            </div>
          </div>
          <div className="col-span-12 sm:col-span-3">
            <Label className="text-[13px] font-semibold">Área</Label>
            <Select value={areaId || '__none__'} onValueChange={(v) => setAreaId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem área</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-3">
            <Label className="text-[13px] font-semibold">Processo</Label>
            <Select value={processoId || '__none__'} onValueChange={(v) => setProcessoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem processo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem processo</SelectItem>
                {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Label className="text-[13px] font-semibold">Origem</Label>
            <Select value={origemId || '__none__'} onValueChange={(v) => setOrigemId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não informada</SelectItem>
                {origens.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Label className="text-[13px] font-semibold">Responsável</Label>
            <Select value={responsavelId || '__none__'} onValueChange={(v) => setResponsavelId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem responsável</SelectItem>
                {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Label className="text-[13px] font-semibold">Prazo</Label>
            <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Fato gerador <span className="text-rose-500">*</span></Label>
            <div className="mt-1.5">
              <RichEditor value={detalhamento} onChange={setDetalhamento} placeholder="O que aconteceu, onde e quando..." />
            </div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Análise da causa (opcional)</Label>
            <p className="text-[11px] text-muted-foreground">Se já souber a causa raiz, registre agora — a NC pula direto para o plano de ação.</p>
            <div className="mt-1.5">
              <RichEditor value={causa} onChange={setCausa} placeholder="Por que aconteceu..." />
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
