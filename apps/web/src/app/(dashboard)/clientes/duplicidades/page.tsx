'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, AlertTriangle, ExternalLink, ShieldCheck, Merge, ArrowRight } from 'lucide-react'
import {
  Button, Card, Badge, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

interface Cadastro {
  id: string
  code: number
  razaoSocial: string
  documento: string
  isActive: boolean
  createdAt: string
  idOneclick: string | null
  idAcessorias: string | null
  vinculos: Record<string, number>
  totalVinculos: number
}
interface Grupo {
  documento: string
  cadastros: Cadastro[]
  dadoEmMaisDeUm: boolean
  totalVinculos: number
}
interface Resultado { grupos: Grupo[]; totalGrupos: number; totalExcedentes: number }
interface TipoVinculo { chave: string; label: string }

interface Plano {
  origem: { id: string; code: number; razaoSocial: string }
  destino: { id: string; code: number; razaoSocial: string }
  linhas: Array<{ tabela: string; mover: number; colidem: number }>
  totalMover: number
  totalColidem: number
  camposHerdados: Array<{ campo: string; valor: string }>
}

/** Nome legível das tabelas na pré-visualização — "orcamentos" não diz nada. */
const TABELA_LABEL: Record<string, string> = {
  orcamentos: 'Orçamentos', orcamento_legado: 'Orçamentos (sistema antigo)',
  contratos: 'Contratos', certificados_digitais: 'Certificados digitais',
  cliente_obrigacoes: 'Obrigações', servico_execucoes: 'Serviços executados',
  socios: 'Sócios', cliente_arquivos: 'Arquivos', processos: 'Processos',
  oportunidades: 'Oportunidades', ativos: 'Ativos', cliente_contatos: 'Contatos',
  cliente_inscricoes: 'Inscrições', cliente_acessos: 'Acessos',
  cliente_areas_contratadas: 'Áreas contratadas', cliente_events: 'Histórico de alterações',
  cliente_andamentos: 'Andamentos', cliente_historicos: 'Históricos',
  cliente_vencimentos: 'Vencimentos', cliente_protocolos: 'Protocolos',
  cliente_atividades: 'Atividades', cliente_cnaes: 'CNAEs',
  beneficio_fiscal_cliente: 'Benefícios fiscais', cliente_beneficios: 'Benefícios',
  pesquisas_satisfacao: 'Pesquisas de satisfação', whatsapp_contatos: 'Contatos do WhatsApp',
  lead_sessao: 'Conversas do funil', danfes: 'DANFEs', nfse_importadas: 'NFS-e importadas',
  situacao_fiscal: 'Situação fiscal', cliente_ocorrencias: 'Ocorrências',
}
const nomeTabela = (t: string) => TABELA_LABEL[t] ?? t.replace(/_/g, ' ')

const CAMPO_LABEL: Record<string, string> = {
  id_oneclick: 'Código no OneClick v1', id_acessorias: 'Código na Acessórias',
  cnpj_acessorias: 'CNPJ na Acessórias', id_sistema: 'Código no sistema contábil',
  id_omie: 'Código no Omie', omie_empresa: 'Empresa no Omie',
  drive_folder_id: 'Pasta no Drive', drive_folder_name: 'Nome da pasta no Drive',
  nome_fantasia: 'Nome fantasia', email: 'E-mail', telefone: 'Telefone',
  inscricao_estadual: 'Inscrição estadual', inscricao_municipal: 'Inscrição municipal',
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export default function DuplicidadesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, loading: permsLoading } = useUserPermissions()
  const pode = isMaster || isEmpresaMaster

  const [res, setRes] = useState<Resultado | null>(null)
  const [tipos, setTipos] = useState<TipoVinculo[]>([])
  const [loading, setLoading] = useState(true)
  const [apenasComDado, setApenasComDado] = useState(false)
  /** Cadastro escolhido para FICAR, por grupo. */
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [mesclando, setMesclando] = useState<Grupo | null>(null)

  useEffect(() => {
    if (!permsLoading && !pode) router.replace('/clientes')
  }, [permsLoading, pode, router])

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.cliente as any).duplicidades.query({ apenasComDado })
      .then((d: Resultado) => {
        setRes(d)
        // Sugestão de destino: o cadastro ATIVO tem prioridade absoluta — é o que
        // o time usa hoje e o que aparece nas listagens. Entre ativos, fica o que
        // tem mais histórico; empatou, o mais antigo.
        const sugestao: Record<string, string> = {}
        for (const g of d.grupos) {
          const ativos = g.cadastros.filter((c) => c.isActive)
          const candidatos = ativos.length ? ativos : g.cadastros
          const escolhido = [...candidatos].sort((a, b) =>
            b.totalVinculos - a.totalVinculos
            || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )[0]
          if (escolhido) sugestao[g.documento] = escolhido.id
        }
        setDestinos(sugestao)
      })
      .catch(() => setRes(null))
      .finally(() => setLoading(false))
  }, [apenasComDado])

  useEffect(() => { if (pode) carregar() }, [pode, carregar])
  useEffect(() => {
    ;(trpc.cliente as any).duplicidadesTipos.query()
      .then((d: TipoVinculo[]) => setTipos(d || [])).catch(() => setTipos([]))
  }, [])

  if (permsLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!pode) return null

  const gruposCriticos = res?.grupos.filter((g) => g.dadoEmMaisDeUm).length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Copy className="h-6 w-6" />
          </div>
          <div>
            <h1>Cadastros repetidos</h1>
            <p className="text-sm text-muted-foreground">Clientes com o mesmo CNPJ/CPF em mais de um cadastro</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/clientes" label="Voltar" />
        </div>
      </div>

      <Card className="border-sky-200 bg-sky-50/60 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/20">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Este relatório só lê — nada é alterado aqui.</p>
            <p className="text-muted-foreground">
              Quando o mesmo cliente tem dois cadastros, o histórico fica partido: os orçamentos ficam
              pendurados num deles e somem da aba do outro. Os grupos com <strong className="text-foreground">histórico
              dos dois lados</strong> são os que exigem decisão — nos demais, um dos cadastros está vazio.
            </p>
            <p className="text-muted-foreground">
              Clientes <strong className="text-foreground">em constituição</strong> (ainda sem CNPJ) não entram aqui:
              vários deles convivem legitimamente e não são duplicatas.
            </p>
          </div>
        </div>
      </Card>

      {res && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums">{res.totalGrupos}</p>
            <p className="text-xs text-muted-foreground">documentos repetidos</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums">{res.totalExcedentes}</p>
            <p className="text-xs text-muted-foreground">cadastros excedentes</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-500">{gruposCriticos}</p>
            <p className="text-xs text-muted-foreground">com histórico dos dois lados</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums">{res.grupos.reduce((s, g) => s + g.totalVinculos, 0)}</p>
            <p className="text-xs text-muted-foreground">registros vinculados</p>
          </Card>
        </div>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={apenasComDado} onCheckedChange={(v) => setApenasComDado(!!v)} />
        Mostrar só os grupos com histórico em mais de um cadastro
      </label>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Analisando a base...
        </div>
      ) : !res?.grupos.length ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum cadastro repetido encontrado.
        </Card>
      ) : (
        <div className="space-y-3">
          {res.grupos.map((g) => (
            <Card key={g.documento} className={cn('overflow-hidden', g.dadoEmMaisDeUm && 'border-amber-300 dark:border-amber-800')}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                <span className="font-mono text-sm font-medium">{masks.cpfCnpj(g.documento)}</span>
                <Badge variant="secondary" className="text-[10px]">{g.cadastros.length} cadastros</Badge>
                {g.dadoEmMaisDeUm && (
                  <Badge className="gap-1 bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />histórico dos dois lados
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-auto"
                  disabled={!destinos[g.documento]}
                  title={destinos[g.documento] ? 'Ver o que será movido' : 'Marque antes qual cadastro deve ficar'}
                  onClick={() => setMesclando(g)}
                >
                  <Merge className="h-3.5 w-3.5" />Mesclar
                </Button>
              </div>

              <div className="divide-y divide-border/60">
                {g.cadastros.map((c, idx) => (
                  <div key={c.id} className={cn(
                    'flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between',
                    destinos[g.documento] === c.id && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                  )}>
                    {(() => {
                      // Cadastro inativo não pode ficar quando existe um ativo no
                      // grupo — o ativo é o que o time usa hoje.
                      const temAtivo = g.cadastros.some((x) => x.isActive)
                      const bloqueado = temAtivo && !c.isActive
                      return (
                        <label
                          className={cn('flex items-start gap-2 sm:pt-0.5', bloqueado ? 'cursor-not-allowed opacity-40' : 'cursor-pointer')}
                          title={bloqueado
                            ? 'Há um cadastro ativo neste grupo — é ele que deve ficar'
                            : 'Este cadastro fica; os outros são mesclados nele'}
                        >
                          <input
                            type="radio"
                            name={`destino-${g.documento}`}
                            disabled={bloqueado}
                            checked={destinos[g.documento] === c.id}
                            onChange={() => setDestinos((p) => ({ ...p, [g.documento]: c.id }))}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                          />
                          <span className="sr-only">Manter este cadastro</span>
                        </label>
                      )
                    })()}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/clientes/${c.id}`} target="_blank"
                          className="truncate text-sm font-medium hover:underline">
                          #{c.code} — {c.razaoSocial}
                        </Link>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {idx === 0 && <Badge variant="outline" className="text-[10px]">mais antigo</Badge>}
                        {!c.isActive && <Badge variant="secondary" className="text-[10px]">inativo</Badge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        criado em {fmtData(c.createdAt)}
                        {c.idOneclick ? ` · OneClick v1 #${c.idOneclick}` : ''}
                        {c.idAcessorias ? ` · Acessórias #${c.idAcessorias}` : ''}
                      </p>

                      {c.totalVinculos > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tipos.filter((t) => (c.vinculos[t.chave] ?? 0) > 0).map((t) => (
                            <span key={t.chave}
                              className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                              {t.label}: <strong>{c.vinculos[t.chave]}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] italic text-muted-foreground">
                          sem histórico vinculado — provavelmente o cadastro a descartar
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold tabular-nums" style={{ color: c.totalVinculos > 0 ? MODULE_COLOR : undefined }}>
                        {c.totalVinculos}
                      </p>
                      <p className="text-[10px] text-muted-foreground">registros</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {mesclando && destinos[mesclando.documento] && (
        <MesclarModal
          grupo={mesclando}
          destinoId={destinos[mesclando.documento]!}
          onClose={() => setMesclando(null)}
          onDone={() => { setMesclando(null); carregar() }}
        />
      )}
    </div>
  )
}

// ── Pré-visualização + execução da mesclagem ───────────────────
function MesclarModal({ grupo, destinoId, onClose, onDone }: {
  grupo: Grupo; destinoId: string; onClose: () => void; onDone: () => void
}) {
  const destino = grupo.cadastros.find((c) => c.id === destinoId)!
  const origens = grupo.cadastros.filter((c) => c.id !== destinoId)

  const [planos, setPlanos] = useState<Plano[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [executando, setExecutando] = useState(false)

  useEffect(() => {
    let cancel = false
    Promise.all(origens.map((o) =>
      (trpc.cliente as any).mesclarPreview.query({ origemId: o.id, destinoId }) as Promise<Plano>,
    ))
      .then((ps) => { if (!cancel) setPlanos(ps) })
      .catch((e: Error) => { if (!cancel) setErro(e.message) })
      .finally(() => { if (!cancel) setCarregando(false) })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoId])

  const totalMover = planos.reduce((s, p) => s + p.totalMover, 0)
  const totalColidem = planos.reduce((s, p) => s + p.totalColidem, 0)

  async function executar() {
    const ok = await alerts.confirm({
      title: `Mesclar ${origens.length} cadastro(s) no #${destino.code}?`,
      text: `${totalMover} registro(s) serão movidos. Os cadastros mesclados vão para a lixeira. Não há como desfazer.`,
      icon: 'warning',
      confirmText: 'Mesclar',
    })
    if (!ok) return
    setExecutando(true)
    try {
      for (const o of origens) {
        await (trpc.cliente as any).mesclarExecutar.mutate({ origemId: o.id, destinoId })
      }
      await alerts.success('Cadastros unificados', `${totalMover} registro(s) movidos para o cliente #${destino.code}.`)
      onDone()
    } catch (e) {
      alerts.error('Erro na mesclagem', (e as Error).message)
    } finally { setExecutando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={Merge} color="violet">
          <DialogTitle>Mesclar cadastros — {masks.cpfCnpj(grupo.documento)}</DialogTitle>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">
              {origens.map((o) => `#${o.code}`).join(', ')}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-semibold">#{destino.code} — {destino.razaoSocial}</span>
            {destino.isActive
              ? <Badge className="bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">ativo</Badge>
              : <Badge variant="secondary" className="text-[10px]">inativo</Badge>}
          </div>

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando o que será movido...
            </div>
          ) : erro ? (
            <p className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erro}</p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-[13px] font-semibold">O que será movido</p>
                {totalMover === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    Nada a mover — os outros cadastros estão vazios. Serão apenas descartados.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60 rounded-lg border border-border">
                    {Object.entries(
                      planos.flatMap((p) => p.linhas).reduce((acc, l) => {
                        acc[l.tabela] = (acc[l.tabela] ?? 0) + l.mover
                        return acc
                      }, {} as Record<string, number>),
                    )
                      .filter(([, n]) => n > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([tabela, n]) => (
                        <div key={tabela} className="flex items-center justify-between px-3 py-1.5 text-sm">
                          <span>{nomeTabela(tabela)}</span>
                          <span className="font-medium tabular-nums">{n}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {planos.some((p) => p.camposHerdados.length > 0) && (
                <div>
                  <p className="mb-2 text-[13px] font-semibold">Campos que o cadastro mantido vai herdar</p>
                  <div className="divide-y divide-border/60 rounded-lg border border-border">
                    {planos.flatMap((p) => p.camposHerdados).map((c, i) => (
                      <div key={`${c.campo}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground">{CAMPO_LABEL[c.campo] ?? c.campo}</span>
                        <span className="truncate font-medium">{c.valor}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Só campos que estão vazios no cadastro mantido — nada é sobrescrito.
                  </p>
                </div>
              )}

              {totalColidem > 0 && (
                <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
                  <strong>{totalColidem} registro(s)</strong> já existem no cadastro mantido (mesma área, mesmo mês de
                  cache, etc.) e ficam onde estão — o dado do cadastro mantido prevalece. Nada é apagado: eles seguem
                  recuperáveis no cadastro que vai para a lixeira.
                </p>
              )}

              <p className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Os cadastros mesclados vão para a <strong className="text-foreground">lixeira</strong>, com a anotação de
                para onde o histórico foi. <strong className="text-foreground">Não há como desfazer</strong> pela tela.
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" variant="success" disabled={carregando || !!erro || executando} onClick={executar}>
            {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
            Mesclar {totalMover > 0 ? `(${totalMover} registros)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
