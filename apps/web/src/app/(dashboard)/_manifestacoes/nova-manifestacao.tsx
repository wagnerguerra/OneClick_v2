'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2, EyeOff, Building2, User as UserIcon, X, Pencil, Check } from 'lucide-react'
import { ClienteCombobox } from '../orcamentos/_components/cliente-combobox'
import {
  Button, Input, Label, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { STRONG } from '@/lib/color-styles'
import type { Config } from './tipos'

const CANAIS = [
  { v: 'TELEFONE', t: 'Telefone' },
  { v: 'EMAIL', t: 'E-mail' },
  { v: 'WHATSAPP', t: 'WhatsApp' },
  { v: 'PRESENCIAL', t: 'Presencial' },
  { v: 'SITE', t: 'Site' },
  { v: 'OUTRO', t: 'Outro' },
]

/** AAAA-MM-DD de hoje, no fuso de quem está na tela. */
function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Formulário dos três módulos.
 *
 * A grande novidade em relação ao legado está aqui: a ORIGEM é uma escolha.
 * No v1, reclamação era sempre de cliente e elogio/sugestão sempre internos —
 * cada tipo tinha um lado só, e não havia como registrar o contrário.
 */
/** Registro já existente, para o formulário abrir em modo edição. */
export interface ManifestacaoEditavel {
  id: string
  protocolo: string
  origem: 'INTERNA' | 'CLIENTE'
  anonima: boolean
  titulo: string | null
  descricao: string
  dataOcorrido: string | null
  areaId?: string | null
  area?: { id: string } | null
  clienteId?: string | null
  cliente?: { id: string; razaoSocial: string; documento?: string | null } | null
  informanteNome: string | null
  informanteEmail: string | null
  informanteTelefone: string | null
  canal: string | null
  elogiadosIds?: string[]
  publica: boolean
}

export function NovaManifestacaoModal({ config, onClose, onCriado, editar, onSalvo }: {
  config: Config
  onClose: () => void
  onCriado?: (protocolo: string) => void
  /** Presente = editar este registro (quem registrou ou quem trata — o servidor confere). */
  editar?: ManifestacaoEditavel
  onSalvo?: () => void
}) {
  const api = (trpc as never as Record<string, any>)[config.router]
  const e = editar

  const [origem, setOrigem] = useState<'INTERNA' | 'CLIENTE'>(e?.origem ?? config.origemPadrao)
  const [anonima, setAnonima] = useState(e?.anonima ?? false)
  const [titulo, setTitulo] = useState(e?.titulo ?? '')
  const [descricao, setDescricao] = useState(e?.descricao ?? '')
  const [dataOcorrido, setDataOcorrido] = useState(e ? (e.dataOcorrido ? e.dataOcorrido.slice(0, 10) : '') : hoje())
  const [areaId, setAreaId] = useState(e?.areaId ?? e?.area?.id ?? '')
  const [clienteId, setClienteId] = useState(e?.clienteId ?? e?.cliente?.id ?? '')
  const [informanteNome, setInformanteNome] = useState(e?.informanteNome ?? '')
  const [informanteEmail, setInformanteEmail] = useState(e?.informanteEmail ?? '')
  const [informanteTelefone, setInformanteTelefone] = useState(e?.informanteTelefone ?? '')
  const [canal, setCanal] = useState(e?.canal ?? '')
  const [elogiadosIds, setElogiadosIds] = useState<string[]>(e?.elogiadosIds ?? [])
  const [publica, setPublica] = useState(e?.publica ?? false)
  const [salvando, setSalvando] = useState(false)

  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])
  const [clientes, setClientes] = useState<Array<{ id: string; razaoSocial: string; documento?: string | null }>>([])
  const [pessoas, setPessoas] = useState<Array<{ id: string; name: string }>>([])
  const [buscaPessoa, setBuscaPessoa] = useState('')

  useEffect(() => {
    ;(trpc.area as any).listForSelect.query().then((r: never[]) => setAreas(r ?? [])).catch(() => {})
    if (config.pedeElogiados) {
      ;(trpc.user as any).listForSelect.query().then((r: never[]) => setPessoas(r ?? [])).catch(() => {})
    }
  }, [config.pedeElogiados])

  useEffect(() => {
    if (origem !== 'CLIENTE' || clientes.length > 0) return
    // Clientes mensais ativos da empresa carregada — a carteira. A busca do
    // orçamento (usada antes) cortava em 60 por ordem alfabética: a lista parava
    // no "AC RAUP".
    ;(trpc.cliente as any).listForSelect.query({ somenteMensais: true })
      .then((r: Array<{ id: string; razaoSocial: string; documento?: string | null }>) => {
        const lista = r ?? []
        // Editando: o cliente gravado aparece mesmo que tenha deixado de ser
        // mensal ativo — senão o campo abriria vazio e a edição o apagaria.
        const atual = e?.cliente
        setClientes(atual && !lista.some(c => c.id === atual.id) ? [atual, ...lista] : lista)
      })
      .catch(() => setClientes([]))
  }, [origem, clientes.length])

  async function salvar() {
    const texto = descricao.replace(/<[^>]*>/g, '').trim()
    if (!texto) { await alerts.warning(config.titulo, 'Descreva o que aconteceu.'); return }
    if (config.pedeElogiados && elogiadosIds.length === 0) {
      await alerts.warning('Elogio', 'Escolha quem está sendo elogiado.'); return
    }

    setSalvando(true)
    try {
      if (e) {
        // Anonimato não muda na edição (o servidor também ignora).
        await api.atualizar.mutate({
          id: e.id,
          origem,
          titulo: titulo.trim() || null,
          descricao,
          dataOcorrido: dataOcorrido || null,
          areaId: areaId || null,
          clienteId: origem === 'CLIENTE' ? (clienteId || null) : null,
          informanteNome: informanteNome.trim() || null,
          informanteEmail: informanteEmail.trim() || null,
          informanteTelefone: informanteTelefone.trim() || null,
          canal: canal || null,
          elogiadosIds,
          publica,
        })
        onSalvo?.()
        return
      }
      const r = await api.criar.mutate({
        origem,
        anonima,
        titulo: titulo.trim() || null,
        descricao,
        dataOcorrido: dataOcorrido || null,
        areaId: areaId || null,
        clienteId: origem === 'CLIENTE' ? (clienteId || null) : null,
        informanteNome: informanteNome.trim() || null,
        informanteEmail: informanteEmail.trim() || null,
        informanteTelefone: informanteTelefone.trim() || null,
        canal: canal || null,
        elogiadosIds,
        publica,
      })
      onCriado?.(r.protocolo)
    } catch (err) {
      await alerts.error(e ? 'Não foi possível salvar' : 'Não foi possível registrar', (err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const pessoasFiltradas = buscaPessoa.trim()
    ? pessoas.filter(p => p.name.toLowerCase().includes(buscaPessoa.trim().toLowerCase()))
    : pessoas

  return (
    <Dialog open onOpenChange={o => { if (!o && !salvando) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeaderIcon icon={e ? Pencil : config.icone} color={e ? 'sky' : 'amber'}>
          <DialogTitle>{e ? `Editar — ${e.protocolo}` : config.rotuloNovo}</DialogTitle>
          <DialogDescription>{e ? 'Corrija o registro. Situação e prazo seguem o fluxo de tratativa.' : config.subtitulo}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {/* Origem — a novidade em relação ao legado, onde cada tipo tinha um
              lado só e não havia como registrar o contrário. */}
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { v: 'INTERNA' as const, t: 'De dentro de casa', d: 'Parte de um colaborador.', icone: UserIcon },
              { v: 'CLIENTE' as const, t: 'De um cliente', d: 'Chegou pelo atendimento.', icone: Building2 },
            ]).map(o => {
              const Ico = o.icone
              return (
                <button key={o.v} type="button" onClick={() => setOrigem(o.v)}
                  className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors',
                    origem === o.v ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20' : 'border-border hover:bg-muted/20')}>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <Ico className="h-3.5 w-3.5" />{o.t}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.d}</span>
                </button>
              )
            })}
          </div>

          {origem === 'CLIENTE' && (
            <div className="grid grid-cols-12 gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="col-span-12 space-y-1.5 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Cliente</Label>
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <ClienteCombobox
                      clientes={clientes}
                      value={clienteId}
                      onSelect={setClienteId}
                      placeholder="— não identificado —"
                    />
                  </div>
                  {clienteId && (
                    <button type="button" onClick={() => setClienteId('')} title="Limpar (cliente não identificado)"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Canal</Label>
                <Select value={canal || '__none__'}
                  onValueChange={v => setCanal(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— não informado —</SelectItem>
                    {CANAIS.map(c => <SelectItem key={c.v} value={c.v}>{c.t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label className="text-[13px] font-semibold">Quem falou</Label>
                <Input value={informanteNome} onChange={e => setInformanteNome(e.target.value)}
                  placeholder="Nome da pessoa" className="h-9 text-sm" />
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label className="text-[13px] font-semibold">E-mail</Label>
                <Input type="email" value={informanteEmail} onChange={e => setInformanteEmail(e.target.value)}
                  className="h-9 text-sm" />
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label className="text-[13px] font-semibold">Telefone</Label>
                <Input value={informanteTelefone} onChange={e => setInformanteTelefone(e.target.value)}
                  className="h-9 text-sm" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-1.5 sm:col-span-8">
              <Label className="text-[13px] font-semibold">Assunto</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Resuma em poucas palavras" className="h-9 text-sm" />
            </div>
            <div className="col-span-12 space-y-1.5 sm:col-span-4">
              <Label className="text-[13px] font-semibold">Quando aconteceu</Label>
              <Input type="date" value={dataOcorrido} onChange={e => setDataOcorrido(e.target.value)}
                className="h-9 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Área envolvida</Label>
            <Select value={areaId || '__none__'}
              onValueChange={v => setAreaId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— nenhuma —</SelectItem>
                {areas.map(ar => <SelectItem key={ar.id} value={ar.id}>{ar.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {config.pedeElogiados && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Quem está sendo elogiado *</Label>
              <Input value={buscaPessoa} onChange={e => setBuscaPessoa(e.target.value)}
                placeholder="Buscar colaborador..." className="h-9 text-sm" />
              {elogiadosIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {elogiadosIds.map(id => (
                    <span key={id} className={cn('rounded-full px-2 py-0.5 text-[11px]', STRONG.amber)}>
                      {pessoas.find(p => p.id === id)?.name ?? id}
                    </span>
                  ))}
                </div>
              )}
              {/* Vínculo por ID, e não texto solto como no legado: assim o
                  elogio segue a pessoa mesmo que ela troque de nome. */}
              <div className="nice-scrollbar max-h-[160px] divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
                {pessoasFiltradas.slice(0, 100).map(p => {
                  const marcado = elogiadosIds.includes(p.id)
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted/30">
                      <Checkbox checked={marcado}
                        onCheckedChange={() => setElogiadosIds(l => marcado ? l.filter(x => x !== p.id) : [...l, p.id])} />
                      <span className="text-[13px]">{p.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">O que aconteceu *</Label>
            <RichEditor value={descricao} onChange={setDescricao} placeholder="Conte com suas palavras..." />
          </div>

          {config.temMural && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox checked={publica} onCheckedChange={v => setPublica(v === true)} />
              Pedir que apareça no mural, visível a todos
            </label>
          )}

          {/* Anonimato não se desfaz nem se cria na edição. */}
          {!e && (<>
          {/* Anonimato — a decisão mais séria do formulário, e por isso a mais
              explicada. Sem autor guardado não há como avisar ninguém depois. */}
          <div className={cn('rounded-lg border p-3 transition-colors',
            anonima ? 'border-slate-400 bg-slate-50 dark:bg-slate-900/40' : 'border-border')}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox checked={anonima} className="mt-0.5"
                onCheckedChange={v => setAnonima(v === true)} />
              <span>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <EyeOff className="h-3.5 w-3.5" /> Registrar sem me identificar
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                  {config.avisoAnonimo} O sistema <b>não guarda</b> quem registrou — nem para a
                  Qualidade. Você acompanha pelo protocolo que aparece ao final, e ele é o único
                  caminho de volta.
                </span>
              </span>
            </label>
          </div>
          </>)}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variant="success" size="sm" className="gap-1.5" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : e ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {e ? 'Salvar' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
