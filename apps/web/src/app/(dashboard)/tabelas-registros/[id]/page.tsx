'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Plus, Loader2, Check, History, Info } from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { CAMPOS_CONTROLE, type CampoControle } from '../campos'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Versao {
  id: string; versao: number; dataVersao: string
  armazenamento: string | null; protecao: string | null; recuperacao: string | null
  retencao: string | null; disposicao: string | null
  registradoPorId: string | null; registradoPorNome: string | null; criadoEm: string
}
interface Tabela {
  id: string; legacyId: number | null; nome: string
  processo: { id: string; nome: string } | null
  versaoAtual: { id: string; versao: number } | null
  versoes: Versao[]
  criadoEm: string
}
interface Opcao { id: string; nome: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

const hoje = () => new Date().toISOString().slice(0, 10)
const CAMPOS_VAZIOS: Record<CampoControle, string> = {
  armazenamento: '', protecao: '', recuperacao: '', retencao: '', disposicao: '',
}

export default function TabelaRegistroDetalhePage() {
  const params = useParams<{ id: string }>()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'tabelas-registros')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true

  const [t, setT] = useState<Tabela | null>(null)
  const [loading, setLoading] = useState(true)
  const [processos, setProcessos] = useState<Opcao[]>([])

  // Cabeçalho editável
  const [nome, setNome] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal de nova versão
  const [verAberta, setVerAberta] = useState(false)
  const [verData, setVerData] = useState(hoje())
  const [verCampos, setVerCampos] = useState<Record<CampoControle, string>>(CAMPOS_VAZIOS)
  const [publicando, setPublicando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.tabelaRegistro as any).getById.query({ id: params.id })
      .then((tab: Tabela) => {
        setT(tab)
        setNome(tab.nome)
        setProcessoId(tab.processo?.id ?? '')
      })
      .catch(() => setT(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    ;(trpc.tabelaRegistro as any).listarProcessos.query().then(setProcessos).catch(() => setProcessos([]))
  }, [])

  async function salvarCabecalho() {
    setSalvando(true)
    try {
      await (trpc.tabelaRegistro as any).atualizar.mutate({
        id: t!.id, nome, processoId: processoId || null,
      })
      alerts.success('Salvo', 'Dados do registro atualizados.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  function abrirNovaVersao() {
    // Pré-preenche com a vigente: uma versão nova quase sempre ajusta um
    // campo, não reescreve os cinco — como o details.asp do v1 fazia.
    const vigente = t?.versoes.find((v) => v.id === t.versaoAtual?.id)
    setVerCampos({
      armazenamento: vigente?.armazenamento ?? '',
      protecao: vigente?.protecao ?? '',
      recuperacao: vigente?.recuperacao ?? '',
      retencao: vigente?.retencao ?? '',
      disposicao: vigente?.disposicao ?? '',
    })
    setVerData(hoje())
    setVerAberta(true)
  }

  async function publicarVersao() {
    setPublicando(true)
    try {
      await (trpc.tabelaRegistro as any).novaVersao.mutate({
        tabelaId: t!.id,
        dataVersao: verData,
        armazenamento: verCampos.armazenamento || null,
        protecao: verCampos.protecao || null,
        recuperacao: verCampos.recuperacao || null,
        retencao: verCampos.retencao || null,
        disposicao: verCampos.disposicao || null,
      })
      alerts.success('Versão publicada', 'Ela passou a ser a vigente.')
      setVerAberta(false)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setPublicando(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!t) return <div className="py-12 text-center text-muted-foreground">Registro não encontrado</div>

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {podeEscrever && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={abrirNovaVersao}>
              <Plus className="h-4 w-4" />Nova versão
            </Button>
          )}
          <BackButton href="/tabelas-registros" label="Voltar" />
      </>}>
        <h1 className="truncate">{t.nome}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Tabelas de Registros</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              {t.processo?.nome ?? 'Sem processo'} · Versão {t.versaoAtual?.versao ?? '—'} · {t.versoes.length} no histórico
            </p>
        </div>
      </PageHeaderBar>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── Histórico de versões ── */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
            <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <h4 className="text-[13px] font-semibold text-foreground">Histórico de versões</h4>
          </div>

          <div className="space-y-3">
            {t.versoes.map((v) => {
              const ehVigente = v.id === t.versaoAtual?.id
              return (
                <div key={v.id} className={cn(
                  'rounded-lg border p-3 transition-colors',
                  ehVigente ? 'border-amber-300/70 bg-amber-50/40 dark:border-amber-700/50 dark:bg-amber-950/10' : 'border-border bg-muted/20',
                )}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold tabular-nums">Versão {v.versao}</span>
                    {ehVigente && <Badge variant="secondary" className="text-[10px]">Vigente</Badge>}
                    <span className="text-[11px] text-muted-foreground">{dataBR(v.dataVersao)}</span>
                    {v.registradoPorNome && (
                      <span className="text-[11px] text-muted-foreground">· por {v.registradoPorNome}</span>
                    )}
                  </div>

                  <div className="mt-2 space-y-2">
                    {CAMPOS_CONTROLE.map((c) => {
                      const html = v[c.key]
                      if (!html) return null
                      return (
                        <div key={c.key}>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                          <RichContent className="text-sm [&_p]:my-1" html={html} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Coluna lateral ── */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Dados do registro</h4>
            </div>
            {/* Só o cabeçalho se edita. O conteúdo de uma versão nunca muda:
                mudou o controle, publica-se uma versão nova. */}
            <div className="space-y-3">
              <div>
                <Label className="text-[13px] font-semibold">Nome</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Processo</Label>
                <Select value={processoId || '__none__'} onValueChange={(v) => setProcessoId(v === '__none__' ? '' : v)} disabled={!podeEscrever}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem processo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem processo</SelectItem>
                    {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {podeEscrever && (
                <Button variant="success" size="sm" className="w-full" onClick={salvarCabecalho} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              )}
              {t.legacyId != null && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  Nº {t.legacyId} no sistema antigo
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Modal: nova versão ── */}
      <Dialog open={verAberta} onOpenChange={(o) => { if (!publicando) setVerAberta(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Nova versão do controle</DialogTitle>
            <DialogDescription>
              Os campos vêm preenchidos com a versão vigente — ajuste o que mudou. A nova versão passa a valer e a anterior fica no histórico.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto nice-scrollbar">
            <div>
              <Label className="text-[13px] font-semibold">Data da versão</Label>
              <Input type="date" value={verData} onChange={(e) => setVerData(e.target.value)} className="h-9 text-sm mt-1.5 w-[180px]" />
            </div>
            {CAMPOS_CONTROLE.map((c) => (
              <div key={c.key}>
                <Label className="text-[13px] font-semibold">{c.label}</Label>
                <p className="text-[11px] text-muted-foreground">{c.hint}</p>
                <div className="mt-1.5">
                  <RichEditor value={verCampos[c.key]} onChange={(v) => setVerCampos((prev) => ({ ...prev, [c.key]: v }))}
                    placeholder={`${c.hint}...`} />
                </div>
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setVerAberta(false)} disabled={publicando}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={publicarVersao} disabled={publicando}>
              {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Publicar versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
