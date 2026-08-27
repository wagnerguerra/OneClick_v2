'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2, EyeOff, Building2, User as UserIcon } from 'lucide-react'
import {
  Button, Input, Label, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
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
export function NovaManifestacaoModal({ config, onClose, onCriado }: {
  config: Config
  onClose: () => void
  onCriado: (protocolo: string) => void
}) {
  const api = (trpc as never as Record<string, any>)[config.router]

  const [origem, setOrigem] = useState<'INTERNA' | 'CLIENTE'>(config.origemPadrao)
  const [anonima, setAnonima] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataOcorrido, setDataOcorrido] = useState(hoje())
  const [areaId, setAreaId] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [informanteNome, setInformanteNome] = useState('')
  const [informanteEmail, setInformanteEmail] = useState('')
  const [informanteTelefone, setInformanteTelefone] = useState('')
  const [canal, setCanal] = useState('')
  const [elogiadosIds, setElogiadosIds] = useState<string[]>([])
  const [publica, setPublica] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])
  const [clientes, setClientes] = useState<Array<{ id: string; razaoSocial: string }>>([])
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
    ;(trpc.orcamento as any).buscarClientes.query({ search: '' })
      .then((r: never[]) => setClientes(r ?? []))
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
      onCriado(r.protocolo)
    } catch (e) {
      await alerts.error('Não foi possível registrar', (e as Error).message)
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
        <DialogHeaderIcon icon={config.icone} color="amber">
          <DialogTitle>{config.rotuloNovo}</DialogTitle>
          <DialogDescription>{config.subtitulo}</DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="max-h-[68vh] space-y-4 overflow-y-auto">
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
                <select value={clienteId} onChange={e => setClienteId(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  <option value="">— não identificado —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
                </select>
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Canal</Label>
                <select value={canal} onChange={e => setCanal(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  <option value="">— não informado —</option>
                  {CANAIS.map(c => <option key={c.v} value={c.v}>{c.t}</option>)}
                </select>
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
            <select value={areaId} onChange={e => setAreaId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— nenhuma —</option>
              {areas.map(ar => <option key={ar.id} value={ar.id}>{ar.name}</option>)}
            </select>
          </div>

          {config.pedeElogiados && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Quem está sendo elogiado *</Label>
              <Input value={buscaPessoa} onChange={e => setBuscaPessoa(e.target.value)}
                placeholder="Buscar colaborador..." className="h-9 text-sm" />
              {elogiadosIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {elogiadosIds.map(id => (
                    <span key={id} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
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
                      <input type="checkbox" checked={marcado} className="h-4 w-4"
                        onChange={() => setElogiadosIds(l => marcado ? l.filter(x => x !== p.id) : [...l, p.id])} />
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
              <input type="checkbox" checked={publica} className="h-4 w-4"
                onChange={e => setPublica(e.target.checked)} />
              Pedir que apareça no mural, visível a todos
            </label>
          )}

          {/* Anonimato — a decisão mais séria do formulário, e por isso a mais
              explicada. Sem autor guardado não há como avisar ninguém depois. */}
          <div className={cn('rounded-lg border p-3 transition-colors',
            anonima ? 'border-slate-400 bg-slate-50 dark:bg-slate-900/40' : 'border-border')}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={anonima} className="mt-0.5 h-4 w-4"
                onChange={e => setAnonima(e.target.checked)} />
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
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variant="success" size="sm" className="gap-1.5" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
