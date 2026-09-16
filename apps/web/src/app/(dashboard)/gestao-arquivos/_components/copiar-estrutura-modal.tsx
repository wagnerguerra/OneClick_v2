'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, FolderTree, Loader2, Search } from 'lucide-react'
import {
  Button, Checkbox, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle, Input,
} from '@saas/ui'

import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'

/**
 * Copiar a estrutura de pastas deste cliente para outros.
 *
 * Duas etapas de propósito: SIMULAR e depois copiar. Criar pasta no Drive de
 * vários clientes de uma vez é barulhento e chato de desfazer — ver antes
 * quantas pastas nasceriam em cada um é o que separa "padronizei a estrutura"
 * de "espalhei pastas por engano".
 *
 * A tela não decide nada sobre permissão nem sobre o que copiar: manda origem,
 * destinos e a opção de levar as áreas; o servidor confere alcance, mescla por
 * nome e recusa o que não pode.
 */

interface ClienteDaLista {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string | null
}

interface ResultadoPorCliente {
  clienteId: string
  nome: string
  status: 'ok' | 'sem-pasta' | 'falhou'
  criadas: number
  existentes: number
  areasMapeadas: number
  areasPuladas: number
  erro?: string
}

interface Resposta {
  simulado: boolean
  origem: { id: string; nome: string }
  pastasNaOrigem: number
  resultados: ResultadoPorCliente[]
}

interface ApiCopia {
  gestaoArquivos: {
    listarClientes: { query(): Promise<ClienteDaLista[]> }
    driveCopiarEstrutura: {
      mutate(i: { origemId: string; destinoIds: string[]; comAreas: boolean; simular: boolean }): Promise<Resposta>
    }
  }
}

export function CopiarEstruturaModal({
  aberto, origemId, origemNome, onFechar,
}: {
  aberto: boolean
  origemId: string
  origemNome: string
  onFechar: () => void
}) {
  const [clientes, setClientes] = useState<ClienteDaLista[]>([])
  const [carregandoClientes, setCarregandoClientes] = useState(false)
  const [busca, setBusca] = useState('')
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [comAreas, setComAreas] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [previa, setPrevia] = useState<Resposta | null>(null)
  const [feito, setFeito] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setBusca(''); setEscolhidos(new Set()); setPrevia(null); setFeito(null); setErro(null)
    setCarregandoClientes(true)
    const api = trpc as unknown as ApiCopia
    api.gestaoArquivos.listarClientes.query()
      .then(l => setClientes(l.filter(c => c.id !== origemId)))
      .catch(() => setErro('Não foi possível carregar a lista de clientes.'))
      .finally(() => setCarregandoClientes(false))
  }, [aberto, origemId])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter(c =>
      c.razaoSocial.toLowerCase().includes(termo)
      || (c.nomeFantasia ?? '').toLowerCase().includes(termo)
      || (c.documento ?? '').includes(termo))
  }, [clientes, busca])

  function alternar(id: string) {
    setPrevia(null)
    setEscolhidos(atual => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function executar(simular: boolean) {
    if (escolhidos.size === 0) return
    setProcessando(true)
    setErro(null)
    try {
      const api = trpc as unknown as ApiCopia
      const r = await api.gestaoArquivos.driveCopiarEstrutura.mutate({
        origemId, destinoIds: [...escolhidos], comAreas, simular,
      })
      if (simular) setPrevia(r)
      else { setFeito(r); setPrevia(null) }
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível copiar agora.')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !processando) onFechar() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={Copy} color="sky">
          <DialogTitle>Copiar estrutura de pastas</DialogTitle>
          <DialogDescription>
            As pastas de <b>{origemNome}</b> são recriadas nos clientes escolhidos. Nenhum arquivo é copiado.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {feito ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Estrutura copiada para {feito.resultados.filter(r => r.status === 'ok').length} cliente(s).
              </div>
              <TabelaDeResultados linhas={feito.resultados} />
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente por nome ou documento"
                  className="h-9 pl-9 text-sm"
                  disabled={processando}
                />
              </div>

              <div className="max-h-56 overflow-y-auto nice-scrollbar rounded-lg border border-border">
                {carregandoClientes ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">Carregando clientes…</p>
                ) : filtrados.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {filtrados.map(c => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                          <Checkbox
                            checked={escolhidos.has(c.id)}
                            onCheckedChange={() => alternar(c.id)}
                            disabled={processando}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{c.razaoSocial}</span>
                            {c.nomeFantasia && (
                              <span className="block truncate text-[11px] text-muted-foreground">{c.nomeFantasia}</span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="flex items-center gap-2.5 text-[13px]">
                <Checkbox checked={comAreas} onCheckedChange={v => { setPrevia(null); setComAreas(v === true) }} disabled={processando} />
                Levar também o mapeamento de áreas das pastas
                <span className="text-[11px] text-muted-foreground">(só onde o destino tiver a área contratada)</span>
              </label>

              {previa && (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground">
                    Simulação: {previa.pastasNaOrigem} pasta(s) na origem. Nada foi criado ainda.
                  </p>
                  <TabelaDeResultados linhas={previa.resultados} />
                </div>
              )}
            </>
          )}

          {erro && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {erro}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          {feito ? (
            <Button size="sm" onClick={onFechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onFechar} disabled={processando}>Cancelar</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => executar(true)}
                disabled={escolhidos.size === 0 || processando}
                className="gap-1.5"
              >
                {processando && !previa ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderTree className="h-4 w-4" />}
                Simular
              </Button>
              {/* Copiar não espera pela simulação. A operação não é destrutiva
                  — cria o que falta e reaproveita o que já existe —, então
                  exigir o clique em "Simular" antes cobrava um passo que não
                  protegia de nada, e pior: marcar outro cliente limpava a
                  simulação e travava o botão de novo, sem dizer por quê. */}
              <Button
                size="sm"
                onClick={() => executar(false)}
                disabled={escolhidos.size === 0 || processando}
                className="gap-1.5"
              >
                {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                Copiar para {escolhidos.size} cliente(s)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TabelaDeResultados({ linhas }: { linhas: ResultadoPorCliente[] }) {
  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border">
      {linhas.map(l => (
        <li key={l.clienteId} className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.nome}</span>
          {l.status === 'sem-pasta' ? (
            <span className="flex items-center gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> sem pasta do Drive vinculada
            </span>
          ) : l.status === 'falhou' ? (
            <span className="flex items-center gap-1.5 text-[11.5px] text-rose-700 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {l.erro ?? 'falhou'}
            </span>
          ) : (
            <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
              {l.criadas} nova(s) · {l.existentes} já existia(m)
              {l.areasMapeadas > 0 && ` · ${l.areasMapeadas} área(s)`}
              {l.areasPuladas > 0 && ` · ${l.areasPuladas} área(s) fora do contrato`}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
