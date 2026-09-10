'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users, Plus, Loader2, Pencil, Trash2, ShieldCheck, Building2, MailWarning,
} from 'lucide-react'
import {
  Button, Card, Input, Label, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useClientesPerms } from './use-clientes-perms'

/**
 * Usuários do cliente — Portal do Cliente, Fase 0.
 *
 * Substitui o placeholder que estava na aba desde sempre. Aqui o escritório
 * concede, ajusta e revoga o acesso de gente de FORA aos dados deste cliente.
 *
 * O que a tela precisa deixar claro, e por quê:
 *  - o NÍVEL, porque separa quem só baixa documento de quem vê honorário;
 *  - as ÁREAS, porque é o que impede o RH do cliente de ver faturamento;
 *  - quando a pessoa também acessa OUTROS clientes, porque revogar aqui não a
 *    desliga do grupo — e quem não vê isso na tela acha que desligou.
 */

type PortalNivel = 'ADMINISTRADOR' | 'OPERACIONAL' | 'CONSULTA'

const NIVEIS: Array<{ valor: PortalNivel; rotulo: string; descricao: string }> = [
  { valor: 'ADMINISTRADOR', rotulo: 'Administrador', descricao: 'Sócio ou diretor. Vê tudo do portal, inclusive honorários, e cadastra os próprios usuários.' },
  { valor: 'OPERACIONAL',   rotulo: 'Operacional',   descricao: 'Envia e baixa documentos, abre chamados. Não vê honorário nem contrato.' },
  { valor: 'CONSULTA',      rotulo: 'Consulta',      descricao: 'Somente leitura. Para o contador interno do cliente e auditoria.' },
]

const COR_NIVEL: Record<PortalNivel, string> = {
  ADMINISTRADOR: 'border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-400',
  OPERACIONAL:   'border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-400',
  CONSULTA:      'border-border text-muted-foreground',
}

interface AreaOpcao { id: string; nome: string }

interface UsuarioPortal {
  id: string
  nivel: PortalNivel
  areas: string[]
  ativo: boolean
  criadoEm: string
  user: {
    id: string; name: string; email: string; telefone: string | null
    isActive: boolean; emailVerified: boolean; lastActivityAt: string | null
  }
  criadoPor: { name: string } | null
  outrosClientes: number
}

const formVazio = () => ({
  nome: '', email: '', telefone: '',
  nivel: 'OPERACIONAL' as PortalNivel,
  areas: [] as string[],
})

export function UsuariosPortalCard({ clienteId }: { clienteId?: string }) {
  const { canManageClientUsers } = useClientesPerms()
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([])
  const [areas, setAreas] = useState<AreaOpcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [novoAberto, setNovoAberto] = useState(false)
  const [form, setForm] = useState(formVazio)
  const [editando, setEditando] = useState<UsuarioPortal | null>(null)

  const carregar = useCallback(() => {
    if (!clienteId) { setCarregando(false); return }
    setCarregando(true)
    Promise.all([
      (trpc.cliente as any).listarUsuariosPortal.query({ clienteId }),
      (trpc.cliente as any).areasDisponiveisPortal.query({ clienteId }),
    ])
      .then(([u, a]: [UsuarioPortal[], AreaOpcao[]]) => { setUsuarios(u); setAreas(a) })
      .catch(() => { setUsuarios([]); setAreas([]) })
      .finally(() => setCarregando(false))
  }, [clienteId])

  useEffect(() => { carregar() }, [carregar])

  async function salvarNovo() {
    if (form.nome.trim().length < 3) { alerts.warning('Nome', 'Informe o nome completo.'); return }
    if (!form.email.includes('@')) { alerts.warning('E-mail', 'Informe um e-mail válido.'); return }
    setSalvando(true)
    try {
      const r = await (trpc.cliente as any).vincularUsuarioPortal.mutate({
        clienteId, nome: form.nome.trim(), email: form.email.trim(),
        telefone: form.telefone.trim() || null,
        nivel: form.nivel, areas: form.areas,
      }) as { criouUsuario: boolean }
      setNovoAberto(false)
      setForm(formVazio())
      carregar()
      // A frase muda porque a situação muda: gente nova recebe convite; quem já
      // acessava outro cliente do grupo só passou a enxergar mais um.
      await alerts.success(
        r.criouUsuario ? 'Usuário cadastrado' : 'Acesso concedido',
        r.criouUsuario
          ? 'O acesso vale depois que a pessoa definir a própria senha pelo convite.'
          : 'Esta pessoa já tinha acesso a outro cliente e agora enxerga este também.',
      )
    } catch (e) {
      alerts.error('Não foi possível conceder o acesso', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function salvarEdicao() {
    if (!editando) return
    setSalvando(true)
    try {
      await (trpc.cliente as any).atualizarUsuarioPortal.mutate({
        id: editando.id, nivel: editando.nivel, areas: editando.areas, ativo: editando.ativo,
      })
      setEditando(null)
      carregar()
      alerts.success('Acesso atualizado', 'As mudanças valem no próximo acesso da pessoa.')
    } catch (e) {
      alerts.error('Não foi possível atualizar', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function desvincular(u: UsuarioPortal) {
    const ok = await alerts.confirm({
      title: 'Remover o acesso?',
      text: u.outrosClientes > 0
        ? `${u.user.name} perde o acesso a este cliente, mas continua acessando outros ${u.outrosClientes}.`
        : `${u.user.name} perde o acesso ao portal. O histórico do que já enviou permanece.`,
      confirmText: 'Remover',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.cliente as any).desvincularUsuarioPortal.mutate({ id: u.id })
      carregar()
      alerts.success('Acesso removido', `${u.user.name} não acessa mais este cliente.`)
    } catch (e) {
      alerts.error('Não foi possível remover', (e as Error).message)
    }
  }

  const nomeArea = (id: string) => areas.find(a => a.id === id)?.nome ?? id

  function alternarArea(lista: string[], id: string): string[] {
    return lista.includes(id) ? lista.filter(a => a !== id) : [...lista, id]
  }

  if (!clienteId) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="mb-3 h-12 w-12 text-muted-foreground/20" />
        <h4 className="mb-1 text-sm font-semibold text-muted-foreground">Usuários do portal</h4>
        <p className="max-w-md text-xs text-muted-foreground">
          Salve o cadastro do cliente antes de conceder acesso ao portal.
        </p>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h4 className="text-[13px] font-semibold text-foreground">Usuários do portal</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Quem, do lado do cliente, acessa os dados desta empresa. O nível define o que
            a pessoa faz; as áreas, sobre o que.
          </p>
        </div>
        {canManageClientUsers && (
          <Button
            type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
            onClick={() => { setForm(formVazio()); setNovoAberto(true) }}
          >
            <Plus className="h-3 w-3" /> Novo usuário
          </Button>
        )}
      </div>

      <div className="p-5">
        {carregando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando usuários…
          </div>
        ) : usuarios.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhum usuário deste cliente acessa o portal.</p>
            <p className="mt-1 text-xs">
              {canManageClientUsers
                ? 'Comece pelo sócio ou diretor, como Administrador — a partir dele o próprio cliente cadastra os demais.'
                : 'Você não tem permissão para conceder acesso ao portal.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {usuarios.map(u => (
              <div
                key={u.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5',
                  !u.ativo && 'opacity-55',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {u.user.name}
                    <Badge variant="outline" className={cn('h-4 px-1.5 text-[9px]', COR_NIVEL[u.nivel])}>
                      {NIVEIS.find(n => n.valor === u.nivel)?.rotulo ?? u.nivel}
                    </Badge>
                    {!u.ativo && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[9px]">Desativado</Badge>
                    )}
                    {/* Convite ainda não aceito: a pessoa existe, mas não entra. */}
                    {u.ativo && !u.user.emailVerified && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title="Ainda não definiu a senha">
                        <MailWarning className="h-3 w-3" /> convite pendente
                      </span>
                    )}
                    {/* Sinaliza o caso do grupo antes que alguém remova achando
                        que está encerrando o acesso da pessoa por completo. */}
                    {u.outrosClientes > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Também acessa outros clientes">
                        <Building2 className="h-3 w-3" /> +{u.outrosClientes} cliente(s)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {u.user.email}
                    {u.areas.length > 0
                      ? <> · {u.areas.map(nomeArea).join(', ')}</>
                      : <> · <span className="text-amber-600 dark:text-amber-400">sem área liberada</span></>}
                  </p>
                </div>

                {canManageClientUsers && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando({ ...u })}
                      className="text-muted-foreground hover:text-foreground"
                      title="Editar nível e áreas"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => desvincular(u)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Remover acesso a este cliente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {areas.length === 0 && !carregando && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Este cliente não tem nenhuma área contratada. Sem isso, o usuário entra no portal
            e não enxerga nada — marque os serviços contratados na aba <b>Serviços</b> antes.
          </p>
        )}
      </div>

      {/* ── Novo usuário ────────────────────────────────────────────────── */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Users} color="emerald">
            <DialogTitle>Novo usuário do portal</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[13px] font-semibold">Nome completo *</Label>
                <Input
                  value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="mt-1.5 h-9 text-sm" placeholder="Nome de quem vai acessar"
                />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Telefone</Label>
                <Input
                  value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  className="mt-1.5 h-9 text-sm" placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">E-mail *</Label>
              <Input
                type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="mt-1.5 h-9 text-sm" placeholder="pessoa@empresadocliente.com.br"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                É por ele que o convite chega e o acesso acontece. Precisa ser um endereço do
                cliente — e-mail de colaborador do escritório é recusado.
              </p>
            </div>

            <CampoNivel valor={form.nivel} onChange={v => setForm(f => ({ ...f, nivel: v }))} />
            <CampoAreas
              areas={areas} selecionadas={form.areas}
              onToggle={id => setForm(f => ({ ...f, areas: alternarArea(f.areas, id) }))}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setNovoAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarNovo} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conceder acesso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edição ──────────────────────────────────────────────────────── */}
      <Dialog open={!!editando} onOpenChange={o => { if (!o) setEditando(null) }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={ShieldCheck} color="sky">
            <DialogTitle>Acesso de {editando?.user.name}</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <CampoNivel
              valor={editando?.nivel ?? 'OPERACIONAL'}
              onChange={v => setEditando(u => (u ? { ...u, nivel: v } : u))}
            />
            <CampoAreas
              areas={areas}
              selecionadas={editando?.areas ?? []}
              onToggle={id => setEditando(u => (u ? { ...u, areas: alternarArea(u.areas, id) } : u))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editando?.ativo ?? false}
                onChange={e => setEditando(u => (u ? { ...u, ativo: e.target.checked } : u))}
                className="h-4 w-4 rounded border-border"
              />
              Acesso ativo
            </label>
            <p className="text-[11px] text-muted-foreground">
              Desativar corta o acesso na hora e preserva o histórico. Remover desfaz o
              vínculo com este cliente — e só com ele.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvarEdicao} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/** Nível com a explicação junto — a escolha não é óbvia pelo rótulo. */
function CampoNivel({ valor, onChange }: { valor: PortalNivel; onChange: (v: PortalNivel) => void }) {
  return (
    <div>
      <Label className="text-[13px] font-semibold">Nível de acesso</Label>
      <Select value={valor} onValueChange={v => onChange(v as PortalNivel)}>
        <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {NIVEIS.map(n => <SelectItem key={n.valor} value={n.valor}>{n.rotulo}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {NIVEIS.find(n => n.valor === valor)?.descricao}
      </p>
    </div>
  )
}

/**
 * Áreas — só as CONTRATADAS aparecem.
 *
 * Oferecer uma área não contratada seria oferecer um acesso que não abriria
 * nada: o portal intersecciona a concessão com o contrato, e o escritório
 * ficaria achando que liberou algo que a pessoa nunca veria.
 */
function CampoAreas({ areas, selecionadas, onToggle }: {
  areas: AreaOpcao[]
  selecionadas: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <Label className="text-[13px] font-semibold">Áreas liberadas</Label>
      {areas.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Nenhuma área contratada por este cliente — não há o que liberar ainda.
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {areas.map(a => {
              const on = selecionadas.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onToggle(a.id)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs transition-colors',
                    on ? 'border-foreground/30 bg-muted font-semibold' : 'border-border hover:bg-muted/60',
                  )}
                >
                  {a.nome}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Só as áreas contratadas por este cliente. O RH do cliente não precisa de Fiscal,
            e o Financeiro não precisa de Pessoal.
          </p>
        </>
      )}
    </div>
  )
}
