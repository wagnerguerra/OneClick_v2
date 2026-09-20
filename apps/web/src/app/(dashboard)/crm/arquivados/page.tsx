'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive, Loader2, RotateCcw, MoreVertical, ExternalLink,
  ChevronLeft, ChevronRight, Search as SearchIcon, AlertCircle,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

type Situacao = 'todos' | 'arquivados' | 'declinio'

interface Linha {
  id: string
  numero: number | null
  titulo: string
  isActive: boolean
  situacao: 'ARQUIVADO' | 'DECLINIO'
  updatedAt: string
  createdAt: string
  motivoPerda: string | null
  etapa: { id: string; nome: string; cor: string | null } | null
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null
  responsavel: { id: string; name: string } | null
}

interface Resposta {
  data: Linha[]
  total: number
  page: number
  limit: number
  totalPages: number
  temEtapaDeclinio: boolean
}

const LIMITE = 50

const SITUACAO_META: Record<Linha['situacao'], { label: string; classe: string }> = {
  ARQUIVADO: { label: 'Arquivado', classe: 'bg-slate-500 text-white' },
  DECLINIO: { label: 'Em declínio', classe: 'bg-amber-500 text-white' },
}

export default function CrmArquivadosPage() {
  const router = useRouter()

  // Reativar é escrita no módulo CRM — mesmo portão do writeProcedure que
  // guarda a mutação no backend. Ver o card só precisa de leitura.
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const crmPerm = permissions.find(p => p.moduleSlug === 'crm')
  const podeReativar = isMaster || isEmpresaMaster || crmPerm?.canWrite === true

  const [situacao, setSituacao] = useState<Situacao>('todos')
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [resp, setResp] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [reativando, setReativando] = useState<string | null>(null)

  // Busca com 400ms de espera — padrão das listagens do projeto.
  const primeiraBusca = useRef(true)
  useEffect(() => {
    if (primeiraBusca.current) { primeiraBusca.current = false; return }
    const t = setTimeout(() => { setBuscaDebounced(busca); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [busca])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await trpc.crm.listForaDoFunil.query({
        situacao,
        page,
        limit: LIMITE,
        ...(buscaDebounced.trim() ? { search: buscaDebounced.trim() } : {}),
      })
      setResp(r as unknown as Resposta)
    } catch (e) {
      alerts.error('Erro ao carregar', (e as Error).message)
      setResp(null)
    } finally {
      setLoading(false)
    }
  }, [situacao, page, buscaDebounced])

  useEffect(() => { carregar() }, [carregar])

  async function reativar(linha: Linha) {
    const ok = await alerts.confirm({
      title: 'Reativar esta oportunidade?',
      text: `"${linha.titulo}" volta ao funil na etapa "${linha.etapa?.nome ?? 'sem etapa'}". `
        + 'Se for a etapa de Declínio, o prazo de arquivamento recomeça.',
      confirmText: 'Reativar',
      icon: 'question',
    })
    if (!ok) return
    setReativando(linha.id)
    try {
      await trpc.crm.reativar.mutate({ id: linha.id })
      alerts.success('Oportunidade reativada')
      carregar()
    } catch (e) {
      alerts.error('Erro ao reativar', (e as Error).message)
    } finally {
      setReativando(null)
    }
  }

  const linhas = resp?.data ?? []
  const total = resp?.total ?? 0
  const totalPages = resp?.totalPages ?? 0
  const semEtapaDeclinio = resp != null && !resp.temEtapaDeclinio

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderBar actions={<BackButton href="/crm" label="Voltar" />}>
        <h1 className="truncate">Arquivados e Declinados</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Comercial</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/crm" className="hover:text-foreground transition-colors">CRM</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Arquivados</span>
        </p>
      </PageHeaderBar>

      {/* Etapa de Declínio ausente: a regra que identifica essa etapa procura
          "decl" no nome dela. Sem nenhuma etapa assim, a tela só consegue
          mostrar os arquivados — e é melhor dizer isso do que exibir uma lista
          curta sem explicação. */}
      {semEtapaDeclinio && situacao !== 'arquivados' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Nenhuma etapa de Declínio encontrada no funil (a etapa é reconhecida por ter
            “decl” no nome). Mostrando apenas os cards arquivados.
          </span>
        </div>
      )}

      <Card>
        {/* Barra de filtros */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por título, razão social, contato ou CNPJ…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={situacao} onValueChange={v => { setSituacao(v as Situacao); setPage(1) }}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="arquivados">Só arquivados</SelectItem>
              <SelectItem value="declinio">Só em declínio</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => carregar()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
        </div>

        {loading && linhas.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : linhas.length === 0 ? (
          <div className="py-16 text-center">
            <Archive className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              {buscaDebounced ? 'Nenhum card encontrado para esta busca.' : 'Nenhum card arquivado ou em declínio.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="whitespace-nowrap">
                <TableHead>Título</TableHead>
                <TableHead className="w-[120px]">Situação</TableHead>
                <TableHead className="w-[140px]">Etapa</TableHead>
                <TableHead className="hidden md:table-cell w-[200px]">Cliente</TableHead>
                <TableHead className="hidden lg:table-cell w-[160px]">Responsável</TableHead>
                <TableHead className="hidden lg:table-cell w-[110px]">Atualizado</TableHead>
                <TableHead className="w-[44px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(l => (
                <TableRow
                  key={l.id}
                  className="cursor-pointer whitespace-nowrap hover:bg-muted/50"
                  onClick={() => router.push(`/crm?op=${l.id}`)}
                >
                  <TableCell className="max-w-[320px] truncate text-sm font-medium">
                    {l.numero != null && <span className="mr-1.5 font-bold tabular-nums text-muted-foreground/70">#{l.numero}</span>}
                    {l.titulo}
                    {l.motivoPerda && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">· {l.motivoPerda}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`px-1.5 py-0.5 text-[10px] ${SITUACAO_META[l.situacao].classe}`}>
                      {SITUACAO_META[l.situacao].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {l.etapa && (
                      <Badge className="px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: l.etapa.cor ?? undefined }}>
                        {l.etapa.nome}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell">
                    {l.cliente?.nomeFantasia || l.cliente?.razaoSocial || '—'}
                  </TableCell>
                  <TableCell className="hidden max-w-[160px] truncate text-xs text-muted-foreground lg:table-cell">
                    {l.responsavel?.name || '—'}
                  </TableCell>
                  <TableCell
                    className="hidden text-xs text-muted-foreground lg:table-cell"
                    title={new Date(l.updatedAt).toLocaleString('pt-BR')}
                  >
                    {new Date(l.updatedAt).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs">
                          {reativando === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/crm?op=${l.id}`)}>
                          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir no CRM
                        </DropdownMenuItem>
                        {/* Reativar só faz sentido para quem está fora do funil.
                            Card em Declínio ainda está no quadro — não há o que
                            reativar nele. */}
                        {l.situacao === 'ARQUIVADO' && podeReativar && (
                          <DropdownMenuItem onClick={() => reativar(l)} disabled={reativando === l.id}>
                            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reativar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Rodapé: contagem + paginação. A coluna "Atualizado" é a última
            alteração do card, e não a data do arquivamento — não existe coluna
            de "arquivado em" no modelo, e inventar uma data seria pior do que
            dizer qual é a que temos. */}
        {linhas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              Mostrando <span className="font-medium text-foreground">{linhas.length}</span> de{' '}
              <span className="font-medium text-foreground">{total}</span> card(s) ·{' '}
              <span title="Última alteração do card. O sistema não registra a data do arquivamento.">
                “Atualizado” = última alteração
              </span>
            </span>
            {totalPages > 1 && (
              <span className="flex items-center gap-1.5">
                <Button
                  variant="outline" size="icon-xs"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="tabular-nums">{page} / {totalPages}</span>
                <Button
                  variant="outline" size="icon-xs"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
