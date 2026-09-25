'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, Calendar, CheckSquare, Edit2, Loader2, Mail, MoreVertical, Send, Square, Trash2, Users, X } from 'lucide-react'
import {
  Badge, Button, Checkbox, Input, RichContent, RichEditor,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  cn,
} from '@saas/ui'
import { BADGE, TEXT } from '@/lib/color-styles'
import { UserAvatar } from '@/components/ui/user-avatar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  OPCOES_LEMBRETE, formatarPrazo, hojeIso, lembreteJaPassou, rotuloLembrete, situacaoDoPrazo,
} from './acao-prazo'

/**
 * Aba "Ações" do card do CRM — o andamento do atendimento.
 *
 * Nasceu da aba "Tarefas" (25/09/2026): mesma engine por baixo (AgendaTarefa
 * vinculada ao card, com ciência por responsável, lembretes por sino/e-mail e
 * presença na lista de tarefas da Agenda), mas com a cara das Anotações — um
 * campo de texto no topo e a linha do tempo abaixo, cada registro carimbado
 * com autor e data. A diferença para a anotação é o compromisso: prazo, quem
 * faz, e o aviso quando o prazo se aproxima.
 */

export interface AcaoCrm {
  id: string
  titulo: string
  descricao: string | null
  prazo: string
  horaPrazo: string | null
  concluida: boolean
  concluidaEm: string | null
  createdAt: string
  criadorId: string
  criador?: { id: string; name: string; image: string | null }
  lembretes?: Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }>
  membros?: Array<{ usuarioId: string; name: string; image: string | null; ciente: boolean }>
}

interface Usuario { id: string; name: string; image?: string | null }

const SEM_LEMBRETE = 'nenhum'

interface ValoresAcao {
  descricao: string
  prazo: string
  hora: string
  /** Além de quem registra (que é sempre membro). */
  responsaveis: string[]
  lembrete: string
  lembreteEmail: boolean
  realizada: boolean
}

function textoPuro(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function valoresIniciais(acao: AcaoCrm | null, meuId: string | undefined): ValoresAcao {
  if (!acao) {
    return {
      descricao: '', prazo: hojeIso(), hora: '', responsaveis: [],
      lembrete: '1440', lembreteEmail: false, realizada: false,
    }
  }
  const lembretes = acao.lembretes ?? []
  return {
    descricao: acao.descricao || `<p>${acao.titulo}</p>`,
    prazo: acao.prazo.slice(0, 10),
    hora: acao.horaPrazo ?? '',
    responsaveis: (acao.membros ?? []).map(m => m.usuarioId).filter(id => id !== acao.criadorId && id !== meuId),
    lembrete: lembretes[0] ? String(lembretes[0].minutosAntes) : SEM_LEMBRETE,
    lembreteEmail: lembretes.some(l => l.canal === 'EMAIL'),
    realizada: false,
  }
}

// ── Seletor de responsáveis ────────────────────────────────────────────
function SeletorResponsaveis({ usuarios, valor, onChange, excluir }: {
  usuarios: Usuario[]
  valor: string[]
  onChange: (ids: string[]) => void
  /** Quem já é membro de qualquer jeito (quem registra). */
  excluir: string[]
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const disponiveis = usuarios
    .filter(u => !valor.includes(u.id) && !excluir.includes(u.id))
    .filter(u => !busca.trim() || norm(u.name).includes(norm(busca)))

  return (
    <div className="space-y-1.5">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map(id => {
            const u = usuarios.find(x => x.id === id)
            return (
              <span key={id} className="flex items-center gap-1.5 text-[11px] pl-1 pr-2 py-0.5 rounded-full bg-muted">
                <UserAvatar user={u ? { name: u.name, image: u.image } : null} className="h-4 w-4 text-[8px]" bg="bg-sky-500" />
                {u?.name ?? 'Usuário'}
                <button type="button" onClick={() => onChange(valor.filter(x => x !== id))} className="text-muted-foreground hover:text-foreground" title="Remover">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
      {/* Combobox próprio, como no modal de tarefa da Agenda (o @saas/ui não tem). */}
      <div className="relative">
        <Input
          className="h-9 text-sm"
          placeholder="Adicionar responsável…"
          value={busca}
          onChange={e => { setBusca(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
        />
        {aberto && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto nice-scrollbar rounded-md border border-border bg-popover shadow-md">
            {disponiveis.length === 0
              ? <div className="px-3 py-2 text-xs text-muted-foreground">{busca.trim() ? 'Nenhum usuário encontrado' : 'Nenhum usuário disponível'}</div>
              : disponiveis.slice(0, 50).map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); onChange([...valor, u.id]); setBusca('') }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted"
                  >
                    <UserAvatar user={{ name: u.name, image: u.image }} className="h-5 w-5 text-[9px]" bg="bg-sky-500" />
                    <span className="truncate">{u.name}</span>
                  </button>
                ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Formulário (criar e editar) ────────────────────────────────────────
function FormAcao({ inicial, editando, usuarios, meuId, criadorId, salvando, moduleColor, onSalvar, onCancelar }: {
  inicial: ValoresAcao
  editando: boolean
  usuarios: Usuario[]
  meuId?: string
  criadorId?: string
  salvando: boolean
  moduleColor: string
  onSalvar: (v: ValoresAcao, lembreteMexido: boolean) => Promise<boolean>
  onCancelar?: () => void
}) {
  const [v, setV] = useState<ValoresAcao>(inicial)
  const [lembreteMexido, setLembreteMexido] = useState(false)
  const set = <K extends keyof ValoresAcao>(k: K, valor: ValoresAcao[K]) => setV(atual => ({ ...atual, [k]: valor }))
  const vazio = !textoPuro(v.descricao)
  const semLembrete = v.lembrete === SEM_LEMBRETE || v.realizada
  const avisoPassou = !semLembrete && !!v.prazo && lembreteJaPassou(v.prazo, v.hora, Number(v.lembrete))

  // Um lembrete que a Agenda gravou com outro intervalo continua escolhível.
  const opcoes = OPCOES_LEMBRETE.some(o => String(o.minutos) === v.lembrete) || v.lembrete === SEM_LEMBRETE
    ? OPCOES_LEMBRETE
    : [...OPCOES_LEMBRETE, { minutos: Number(v.lembrete), rotulo: rotuloLembrete(Number(v.lembrete)) }]

  const salvar = async () => {
    if (vazio || salvando) return
    const ok = await onSalvar(v, lembreteMexido)
    if (ok && !editando) { setV(valoresIniciais(null, meuId)); setLembreteMexido(false) }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <RichEditor
        placeholder={v.realizada ? 'O que foi feito…' : 'O que precisa ser feito…'}
        value={v.descricao}
        onChange={x => set('descricao', x)}
        toolbar="basico"
        minHeight={80}
        maxHeight={200}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); return true }
          return false
        }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
        <div className="space-y-1.5 sm:col-span-3">
          <label className="text-[13px] font-semibold">{v.realizada ? 'Data' : 'Prazo'}</label>
          <Input type="date" className="h-9 text-sm" value={v.prazo} onChange={e => set('prazo', e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-[13px] font-semibold">Hora</label>
          <Input type="time" className="h-9 text-sm" value={v.hora} onChange={e => set('hora', e.target.value)} />
        </div>
        {!v.realizada && (
          <div className="space-y-1.5 col-span-2 sm:col-span-4">
            <label className="text-[13px] font-semibold flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />Avisar
            </label>
            <Select value={v.lembrete} onValueChange={x => { set('lembrete', x); setLembreteMexido(true) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_LEMBRETE}>Sem lembrete</SelectItem>
                {opcoes.map(o => <SelectItem key={o.minutos} value={String(o.minutos)}>{o.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {!v.realizada && (
          <label className={cn('col-span-2 sm:col-span-3 flex items-center gap-2 text-[13px] sm:pt-7', semLembrete && 'opacity-50')}>
            <Checkbox
              checked={v.lembreteEmail}
              disabled={semLembrete}
              accentColor={moduleColor}
              onCheckedChange={c => { set('lembreteEmail', c === true); setLembreteMexido(true) }}
            />
            Também por e-mail
          </label>
        )}
      </div>
      {avisoPassou && (
        <p className={cn('text-[11px]', TEXT.amber)}>
          Esse aviso já ficou para trás e não vai disparar. Escolha um mais próximo do prazo, ou informe a hora.
        </p>
      )}

      {!v.realizada && (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />Responsáveis
            <span className="text-[11px] font-normal text-muted-foreground">
              (além de {editando ? 'quem registrou' : 'você'}; todos recebem o aviso e a ação conclui quando todos marcarem)
            </span>
          </label>
          <SeletorResponsaveis
            usuarios={usuarios}
            valor={v.responsaveis}
            onChange={ids => set('responsaveis', ids)}
            excluir={[criadorId ?? meuId ?? ''].filter(Boolean)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!editando ? (
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={v.realizada} accentColor={moduleColor} onCheckedChange={c => set('realizada', c === true)} />
            Já foi realizada <span className="text-[11px] text-muted-foreground">(registra como concluída)</span>
          </label>
        ) : <span />}
        <div className="flex gap-2">
          {onCancelar && <Button size="sm" variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>}
          <Button size="sm" style={{ backgroundColor: moduleColor }} className="text-white" onClick={salvar} disabled={salvando || vazio}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {editando ? 'Salvar ação' : 'Registrar ação'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Aba ────────────────────────────────────────────────────────────────
export function AcoesTab({ oportunidadeId, acoes, carregando, meuId, moduleColor, onChanged }: {
  oportunidadeId: string
  acoes: AcaoCrm[]
  carregando: boolean
  meuId?: string
  moduleColor: string
  /** Recarrega a lista e os contadores do board. */
  onChanged: () => void
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const hoje = useMemo(() => new Date(), [acoes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ;(trpc.user as any).listForSelect.query()
      .then((u: Usuario[]) => setUsuarios(u ?? []))
      .catch(() => {})
  }, [])

  const payloadLembrete = (v: ValoresAcao) => ({
    minutosAntes: v.lembrete === SEM_LEMBRETE ? null : Number(v.lembrete),
    email: v.lembreteEmail,
  })

  const criar = async (v: ValoresAcao) => {
    setSalvando(true)
    try {
      await (trpc.crm as any).acoes.create.mutate({
        oportunidadeId,
        descricao: v.descricao,
        prazo: v.prazo,
        horaPrazo: v.hora || null,
        responsaveis: v.responsaveis,
        lembrete: payloadLembrete(v),
        realizada: v.realizada,
      })
      onChanged()
      return true
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      return false
    } finally {
      setSalvando(false)
    }
  }

  const editar = async (id: string, v: ValoresAcao, lembreteMexido: boolean) => {
    setSalvando(true)
    try {
      await (trpc.crm as any).acoes.update.mutate({
        id,
        descricao: v.descricao,
        prazo: v.prazo,
        horaPrazo: v.hora || null,
        responsaveis: v.responsaveis,
        ...(lembreteMexido ? { lembrete: payloadLembrete(v) } : {}),
      })
      setEditandoId(null)
      onChanged()
      return true
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      return false
    } finally {
      setSalvando(false)
    }
  }

  // Marcar = o usuário atual dá ciência. Com vários responsáveis, a ação só
  // conclui quando todos marcarem (regra no backend).
  const alternar = async (a: AcaoCrm) => {
    const minha = a.membros?.find(m => m.usuarioId === meuId)
    const marcar = minha ? !minha.ciente : !a.concluida
    try {
      await (trpc.crm as any).acoes.alternarConclusao.mutate({ id: a.id, concluida: marcar })
      onChanged()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const excluir = async (a: AcaoCrm) => {
    const ok = await alerts.confirm({ title: 'Excluir ação?', text: `"${a.titulo}" será removida.`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.crm as any).acoes.delete.mutate({ id: a.id })
      onChanged()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const abertas = acoes.filter(a => !a.concluida).length

  return (
    <div className="space-y-3">
      <FormAcao
        inicial={valoresIniciais(null, meuId)}
        editando={false}
        usuarios={usuarios}
        meuId={meuId}
        salvando={salvando && !editandoId}
        moduleColor={moduleColor}
        onSalvar={v => criar(v)}
      />

      {acoes.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {abertas === 0 ? 'Nenhuma ação em aberto' : abertas === 1 ? '1 ação em aberto' : `${abertas} ações em aberto`}
          {' · '}também aparecem na lista de tarefas da Agenda de cada responsável.
        </p>
      )}

      {carregando && acoes.length === 0 ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : acoes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma ação registrada</p>
      ) : (
        <div className="space-y-3">
          {acoes.map(a => {
            if (editandoId === a.id) {
              return (
                <FormAcao
                  key={a.id}
                  inicial={valoresIniciais(a, meuId)}
                  editando
                  usuarios={usuarios}
                  meuId={meuId}
                  criadorId={a.criadorId}
                  salvando={salvando}
                  moduleColor={moduleColor}
                  onSalvar={(v, mexido) => editar(a.id, v, mexido)}
                  onCancelar={() => setEditandoId(null)}
                />
              )
            }
            const sit = situacaoDoPrazo(a.prazo, a.concluida, hoje)
            const minha = a.membros?.find(m => m.usuarioId === meuId)
            const marcada = minha ? minha.ciente : a.concluida
            const membros = a.membros ?? []
            const lembrete = a.lembretes?.[0]
            const prazoTxt = `${formatarPrazo(a.prazo)}${a.horaPrazo ? ` às ${a.horaPrazo}` : ''}`
            return (
              <div key={a.id} className={cn('rounded-md bg-muted/40 p-3', a.concluida && 'opacity-70')}>
                <div className="flex items-start gap-2.5">
                  <button type="button" onClick={() => alternar(a)} className="shrink-0 mt-0.5"
                    title={marcada ? 'Desmarcar' : membros.length > 1 ? 'Marcar a minha parte como feita' : 'Concluir'}>
                    {marcada
                      ? <CheckSquare className={cn('h-4 w-4', TEXT.emerald)} />
                      : <Square className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold truncate">{a.criador?.name || 'Sistema'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title="Ações">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditandoId(a.id)}><Edit2 className="h-3.5 w-3.5 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => excluir(a)} className={TEXT.rose}><Trash2 className="h-3.5 w-3.5 mr-2" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <RichContent className={cn('text-sm', a.concluida && 'line-through decoration-muted-foreground/60')} html={a.descricao || `<p>${a.titulo}</p>`} />

                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
                      <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 gap-1 font-medium',
                        sit.tipo === 'concluida' && BADGE.emerald,
                        sit.tipo === 'atrasada' && BADGE.rose,
                        (sit.tipo === 'hoje' || sit.tipo === 'proxima') && BADGE.amber)}>
                        <Calendar className="h-3 w-3" />
                        {sit.tipo === 'concluida' && `Concluída${a.concluidaEm ? ` em ${new Date(a.concluidaEm).toLocaleDateString('pt-BR')}` : ''}`}
                        {sit.tipo === 'atrasada' && `Venceu ${prazoTxt} · há ${sit.dias}d`}
                        {sit.tipo === 'hoje' && `Vence hoje${a.horaPrazo ? ` às ${a.horaPrazo}` : ''}`}
                        {sit.tipo === 'proxima' && `Vence ${prazoTxt} · em ${sit.dias}d`}
                        {sit.tipo === 'futura' && `Prazo ${prazoTxt}`}
                      </Badge>
                      {lembrete && !a.concluida && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground" title="Lembrete">
                          {a.lembretes!.some(l => l.canal === 'EMAIL') ? <Mail className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                          {rotuloLembrete(lembrete.minutosAntes)}
                        </span>
                      )}
                      {membros.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="flex -space-x-1.5">
                            {membros.slice(0, 5).map(m => (
                              <span key={m.usuarioId} title={`${m.name} · ${m.ciente ? 'feito' : 'pendente'}`}
                                className={cn('rounded-full ring-2', m.ciente ? 'ring-emerald-500' : 'ring-background')}>
                                <UserAvatar user={{ name: m.name, image: m.image }} className="h-5 w-5 text-[8px]" bg="bg-sky-500" />
                              </span>
                            ))}
                          </span>
                          <span className="truncate max-w-[260px]">{membros.map(m => m.name.split(' ')[0]).join(', ')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
