'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription,
  Button, Badge, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { ShieldCheck, KeyRound, DoorClosed, History, Ban, XCircle, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { masks, limparCnpj } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CertAcessoPanel } from './cert-acesso-panel'

interface Certificado {
  id: string
  tipo: string
  titular: string
  documento: string
  numeroSerie: string | null
  emissor: string | null
  emitidoEm: string
  expiraEm: string
  status: string
  observacoes: string | null
  cliente: { id: string; razaoSocial: string } | null
  empresa: { id: string; razaoSocial: string } | null
  socio: { id: string; nomeCompleto: string } | null
}

interface AcessoLog {
  id: string
  acao: string
  detalhes: string | null
  ipAddress: string | null
  createdAt: string
  usuario: { id: string; name: string; email: string } | null
}

const ACAO_LABELS: Record<string, string> = {
  cadastrado: '📝 Cadastrado',
  visualizado: '👁 Visualizado',
  acessado: '🔓 Arquivo e senha acessados',
  acesso_autorizado: '🔓 Acesso autorizado', // registros antigos (#HLP0301)
  editado: '✏️ Editado',
  download_pfx: '⬇ Download PFX',
  senha_visualizada: '🔑 Senha visualizada',
  usado_assinatura: '✍ Usado para assinar',
  renovado: '🔄 Renovado',
  revogado: '🚫 Revogado',
  arquivado: '📦 Arquivado',
  desarquivado: '📤 Desarquivado',
  excluido: '🗑 Excluído',
  integridade_falhou: '⚠️ Falha de integridade',
}

function formatDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Máscara canônica (alfanumérico-aware). #HLP CNPJ alfanumérico.
function formatDocumento(doc: string) {
  const d = limparCnpj(doc)
  if (d.length === 11) return masks.cpf(d)
  if (d.length === 14) return masks.cnpj(d)
  return doc
}

/** Dias até expirar (negativo se já expirou). */
function diasParaExpirar(expiraEm: string): number {
  return Math.ceil((new Date(expiraEm).getTime() - Date.now()) / 86400000)
}

function StatusBadge({ status, expiraEm }: { status: string; expiraEm: string }) {
  if (status === 'REVOGADO') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400"><Ban className="h-3 w-3" /> Revogado</span>
  }
  const dias = diasParaExpirar(expiraEm)
  if (dias < 0) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400"><XCircle className="h-3 w-3" /> Vencido</span>
  }
  if (dias <= 60) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> {dias}d</span>
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Vigente</span>
}

function Field({ label, value, children, mono }: { label: string; value?: string; children?: ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      {children ?? <p className={cn('text-[13px]', mono && 'font-mono')}>{value}</p>}
    </div>
  )
}

/**
 * Detalhes de um certificado digital + acesso seguro (ver senha / baixar PFX
 * via CertAcessoModal). Fonte única compartilhada (#HLP0301) entre:
 *  - módulo Legalização > Certificados Digitais (com a Trilha de auditoria)
 *  - sidebar de Arquivos do cliente e aba Legalização > Certificado Digital
 *    dentro do cliente (`showAcessosTab={false}` → só o conteúdo da "Geral").
 */
export function CertDetalhesModal({ open, onOpenChange, certId, showAcessosTab = true, canDownload = true, hideClienteSection = false, origem = 'gestao' }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  certId: string | null
  /** Exibe as abas Geral / Trilha de auditoria. Cliente passa `false` → só a Geral. */
  showAcessosTab?: boolean
  /** Libera o botão "Baixar PFX / Ver senha". Quando falso, mostra aviso de permissão. */
  canDownload?: boolean
  /** Oculta o bloco de vínculos (Cliente/Empresa/Sócio). Dentro do cliente é redundante. */
  hideClienteSection?: boolean
  /** 'cliente' = acesso pelo cadastro do cliente (não exige a sub-permissão). */
  origem?: 'gestao' | 'cliente'
}) {
  const [tab, setTab] = useState<'geral' | 'acessos'>('geral')
  const [cert, setCert] = useState<Certificado | null>(null)
  const [acessos, setAcessos] = useState<AcessoLog[]>([])
  const [loading, setLoading] = useState(true)
  // Acesso (senha + download) expandido inline no lugar do botão. #HLP0301
  const [acessoExpandido, setAcessoExpandido] = useState(false)

  useEffect(() => {
    if (!open || !certId) return
    setLoading(true)
    setTab('geral')
    setAcessoExpandido(false)
    ;(trpc.certificadoDigital as any).getById.query({ id: certId })
      .then((data: Certificado) => setCert(data))
      .catch(() => setCert(null))
      .finally(() => setLoading(false))
  }, [open, certId])

  useEffect(() => {
    if (tab !== 'acessos' || !open || !certId) return
    ;(trpc.certificadoDigital as any).listAcessos.query({ id: certId })
      .then((data: AcessoLog[]) => setAcessos(data))
      .catch((e: Error) => alerts.error('Erro', e.message))
  }, [tab, certId, open])

  const emAcessos = showAcessosTab && tab === 'acessos'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
          <DialogHeaderIcon icon={ShieldCheck} color="fuchsia">
            <DialogTitle>{cert?.titular || 'Carregando...'}</DialogTitle>
            {cert && (
              <DialogDescription>
                {cert.tipo} · {formatDocumento(cert.documento)} · Expira em {formatDate(cert.expiraEm)}
              </DialogDescription>
            )}
          </DialogHeaderIcon>

          {showAcessosTab && (
            <div className="px-6 -mb-px flex border-b">
              <button
                type="button"
                onClick={() => setTab('geral')}
                className={cn('px-3 py-2 text-xs font-semibold border-b-2 -mb-px', tab === 'geral' ? 'border-fuchsia-500 text-fuchsia-700' : 'border-transparent text-muted-foreground')}
              >
                Geral
              </button>
              <button
                type="button"
                onClick={() => setTab('acessos')}
                className={cn('px-3 py-2 text-xs font-semibold border-b-2 -mb-px', tab === 'acessos' ? 'border-fuchsia-500 text-fuchsia-700' : 'border-transparent text-muted-foreground')}
              >
                Trilha de auditoria
              </button>
            </div>
          )}

          <DialogBody>
            {loading || !cert ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : emAcessos ? (
              <div className="py-2">
                {acessos.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8 italic">Nenhum acesso registrado.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {acessos.map(a => (
                      <li key={a.id} className="py-2.5 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium">{ACAO_LABELS[a.acao] || a.acao}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {a.usuario?.name ?? 'usuário'} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                            {a.ipAddress && <> · IP {a.ipAddress}</>}
                          </p>
                          {a.detalhes && <p className="text-[11px] mt-1 italic text-foreground/80">"{a.detalhes}"</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tipo" value={cert.tipo} />
                  <Field label="Status"><StatusBadge status={cert.status} expiraEm={cert.expiraEm} /></Field>
                  <Field label="Titular" value={cert.titular} />
                  <Field label="Documento" value={formatDocumento(cert.documento)} mono />
                  <Field label="Número de série" value={cert.numeroSerie || '—'} mono />
                  <Field label="Emissor" value={cert.emissor || '—'} />
                  <Field label="Emitido em" value={formatDate(cert.emitidoEm)} />
                  <Field label="Expira em" value={formatDate(cert.expiraEm)} />
                </div>
                {!hideClienteSection && (
                  <div className="border-t pt-3 space-y-2">
                    <Field label="Cliente" value={cert.cliente?.razaoSocial || '—'} />
                    <Field label="Empresa" value={cert.empresa?.razaoSocial || '—'} />
                    <Field label="Sócio" value={cert.socio?.nomeCompleto || '—'} />
                  </div>
                )}
                {cert.observacoes && (
                  <div className="border-t pt-3">
                    <Field label="Observações" value={cert.observacoes} />
                  </div>
                )}

                {/* Histórico de versões anteriores (renovações) */}
                {(cert as any).versoesAnteriores && (cert as any).versoesAnteriores.length > 0 && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <History className="h-3 w-3" /> Versões anteriores ({(cert as any).versoesAnteriores.length})
                    </p>
                    <div className="space-y-1.5">
                      {(cert as any).versoesAnteriores.map((v: { id: string; numeroSerie: string | null; emitidoEm: string; expiraEm: string; status: string }, idx: number) => (
                        <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-md border bg-muted/20 text-[11px]">
                          <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground font-mono text-[10px]">
                            v{(cert as any).versoesAnteriores.length - idx}
                          </span>
                          <div className="flex-1 min-w-0">
                            {v.numeroSerie && <p className="font-mono text-[10px] text-muted-foreground truncate">{v.numeroSerie}</p>}
                            <p>
                              Emitido em <strong>{formatDate(v.emitidoEm)}</strong>
                              {' '}· Expirou em <strong>{formatDate(v.expiraEm)}</strong>
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[9px]">{v.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Acesso ao arquivo + senha — no rodapé (#HLP0301). O botão vem
                    dentro do mesmo container do painel expandido. */}
                {canDownload ? (
                  acessoExpandido ? (
                    // Painel inline (substitui o botão) — evita abrir um 2º modal
                    // e já inicia o download ao expandir. #HLP0301
                    <CertAcessoPanel
                      certId={cert.id}
                      titular={cert.titular}
                      active
                      origem={origem}
                      onCancel={() => setAcessoExpandido(false)}
                    />
                  ) : (
                    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                      <p className="text-[13px] font-semibold flex items-center gap-1.5">
                        <DoorClosed className="h-3.5 w-3.5" /> Acessar certificado
                      </p>
                      <Button
                        type="button"
                        onClick={() => setAcessoExpandido(true)}
                        className="w-full gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <KeyRound className="h-4 w-4" /> Baixar PFX / Ver senha
                      </Button>
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-muted-foreground">Você não tem permissão para acessar este certificado.</p>
                )}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
