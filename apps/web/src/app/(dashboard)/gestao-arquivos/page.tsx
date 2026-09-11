'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FolderOpen, Loader2, Search as SearchIcon, Settings2, Users, FileText, Inbox,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { NotificacoesModal } from './_components/notificacoes-modal'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'
const MODULE = 'gestao-arquivos'

interface ClienteLinha {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  tipoDocumento: string
  status: string
  usuariosPortal: number
  arquivos: number
  novos: number
}

/** Máscara só para exibir — o dado cru vem do banco sem formatação. */
function formatarDocumento(doc: string, tipo: string): string {
  const limpo = (doc ?? '').replace(/[^\dA-Za-z]/g, '')
  if (tipo === 'CPF' && limpo.length === 11) {
    return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`
  }
  if (limpo.length === 14) {
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`
  }
  return doc
}

export default function GestaoArquivosPage() {
  const router = useRouter()
  const { permissions, isMaster, isEmpresaMaster } = useUserPermissions()

  const [clientes, setClientes] = useState<ClienteLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [soComNovos, setSoComNovos] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const podeConfigurar = useMemo(() => {
    if (isMaster || isEmpresaMaster) return true
    return permissions.some(p => (p as { moduleSlug?: string; canWrite?: boolean }).moduleSlug === MODULE
      && (p as { canWrite?: boolean }).canWrite === true)
  }, [permissions, isMaster, isEmpresaMaster])

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc as any).gestaoArquivos.listarClientes.query()
      .then((d: ClienteLinha[]) => setClientes(d))
      .catch(() => setClientes([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Busca é local de propósito: a lista é o conjunto de clientes com portal, que
  // é pequeno por natureza (um subconjunto da carteira). Paginar no servidor
  // aqui só adicionaria latência a cada tecla.
  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clientes.filter(c => {
      if (soComNovos && c.novos === 0) return false
      if (!q) return true
      return (
        c.razaoSocial.toLowerCase().includes(q)
        || (c.nomeFantasia ?? '').toLowerCase().includes(q)
        || c.documento.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
      )
    })
  }, [clientes, search, soComNovos])

  const totalNovos = useMemo(() => clientes.reduce((s, c) => s + c.novos, 0), [clientes])

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderBar
        actions={<>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar cliente..."
              className="h-9 w-56 pl-8 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setSoComNovos(v => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium border transition-colors shrink-0',
              soComNovos
                ? 'bg-muted border-border text-foreground'
                : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
            )}
            title="Mostrar só clientes com arquivo não lido"
          >
            <Inbox className="h-4 w-4" />
            Não lidos
            {totalNovos > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-semibold leading-none"
                style={{ backgroundColor: MODULE_COLOR }}
              >
                {totalNovos}
              </span>
            )}
          </button>
          {podeConfigurar && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfigOpen(true)} title="Notificações do módulo">
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </>}
      >
        <h1 className="truncate">Gestão de Arquivos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Gestão de Arquivos</span>
        </p>
      </PageHeaderBar>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto nice-scrollbar">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[40%] text-xs font-semibold uppercase tracking-wider">Cliente</TableHead>
                <TableHead className="hidden md:table-cell w-[18%] text-xs font-semibold uppercase tracking-wider">Documento</TableHead>
                <TableHead className="hidden sm:table-cell w-[12%] text-xs font-semibold uppercase tracking-wider text-center">Usuários</TableHead>
                <TableHead className="w-[15%] text-xs font-semibold uppercase tracking-wider text-center">Arquivos</TableHead>
                <TableHead className="w-[15%] text-xs font-semibold uppercase tracking-wider text-center">Não lidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}

              {!loading && filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                    {clientes.length === 0
                      ? 'Nenhum cliente com usuário no portal ainda. O módulo lista apenas quem já tem acesso liberado.'
                      : 'Nenhum cliente corresponde ao filtro.'}
                  </TableCell>
                </TableRow>
              )}

              {!loading && filtrados.map(c => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/gestao-arquivos/${c.id}`)}
                >
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-white"
                        style={{ background: MODULE_COLOR }}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{c.razaoSocial}</p>
                        {c.nomeFantasia && (
                          <p className="truncate text-[11px] text-muted-foreground">{c.nomeFantasia}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                    {formatarDocumento(c.documento, c.tipoDocumento)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> {c.usuariosPortal}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" /> {c.arquivos}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {c.novos > 0 ? (
                      <Badge
                        className="text-white tabular-nums"
                        style={{ backgroundColor: MODULE_COLOR }}
                      >
                        {c.novos}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {configOpen && (
        <NotificacoesModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          podeAdministrar={isMaster || isEmpresaMaster}
        />
      )}
    </div>
  )
}
