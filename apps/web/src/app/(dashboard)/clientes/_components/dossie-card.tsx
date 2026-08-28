'use client'

/**
 * Aba Dossiê — o que as fontes públicas dizem sobre o CNPJ do cliente.
 *
 * Regra que governa a tela: dado oficial e dado do cadastro são coisas
 * separadas. O que vem da Receita aparece aqui com fonte e data; o que
 * diverge do cadastro vira sugestão que alguém aprova. Nada entra no
 * cadastro sozinho.
 *
 * Bloco sem resultado é resultado: "nada encontrado" é diferente de erro, e
 * a falha de um bloco não pode derrubar os outros.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  FileSearch, RefreshCw, Loader2, Check, X, AlertTriangle, ChevronDown,
  Building2, Activity, MapPin, Users, Receipt, ShieldCheck, ExternalLink,
} from 'lucide-react'
import { Button, Card, Badge, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { fmtDateBR } from '@/lib/date'

type Fato = {
  campo: string
  valor: string | null
  valorJson: unknown
  fonte: string
  urlFonte: string | null
  coletadoEm: string
  oficial: boolean
}
type Sugestao = {
  id: string; campo: string; valorAtual: string | null; valorSugerido: string | null
  fonte: string; coletadoEm: string
}
type Dossie = {
  blocos: Record<string, Fato[]>
  sugestoes: Sugestao[]
  ultimaColeta: { fonte: string; urlFonte: string | null; coletadoEm: string } | null
  vazio: boolean
}

type Cnae = { codigo: string; descricao: string; principal: boolean }
type Socio = { nome: string; documento: string; qualificacao: string; dataEntrada: string | null }

const ROTULOS: Record<string, string> = {
  razao_social: 'Razão social', nome_fantasia: 'Nome fantasia',
  situacao_cadastral: 'Situação cadastral', data_situacao_cadastral: 'Desde',
  motivo_situacao_cadastral: 'Motivo', data_abertura: 'Abertura',
  natureza_juridica: 'Natureza jurídica', porte: 'Porte', capital_social: 'Capital social',
  matriz: 'Matriz/Filial', cep: 'CEP', logradouro: 'Logradouro', numero: 'Número',
  complemento: 'Complemento', bairro: 'Bairro', municipio: 'Município',
  municipio_ibge: 'Código IBGE', uf: 'UF', email: 'E-mail',
  optante_simples: 'Simples Nacional', data_opcao_simples: 'Opção pelo Simples',
  optante_mei: 'MEI',
}

const CAMPOS_CADASTRO: Record<string, string> = {
  razaoSocial: 'Razão social', nomeFantasia: 'Nome fantasia', capitalSocial: 'Capital social',
  cep: 'CEP', logradouro: 'Logradouro', numero: 'Número', bairro: 'Bairro',
  cidade: 'Cidade', uf: 'UF',
}

/** A fonte devolve data como 'AAAA-MM-DD'; na tela é sempre dd/mm/aaaa. */
const CAMPOS_DATA = new Set(['data_abertura', 'data_situacao_cadastral', 'data_opcao_simples'])

function valorDoCampo(campo: string, valor: string | null): string | null {
  if (valor == null) return valor
  // Capital social chega como número cru ("20000"); na tela vira dinheiro.
  if (campo === 'capital_social') {
    const n = Number(valor)
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : valor
  }
  // `fmtDateBR` é o helper da casa: extrai o dia em UTC, senão '2020-03-06'
  // vira 05/03 para quem está a oeste de Greenwich.
  if (CAMPOS_DATA.has(campo)) return fmtDateBR(valor) || valor
  return valor
}

/**
 * Momento da coleta — data E hora, no fuso de quem está lendo. Aqui o
 * relevante é "há quanto tempo isto foi buscado", não o dia de calendário.
 */
function momentoBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Verde para ativa; âmbar/vermelho quando a empresa não está regular. */
function corDaSituacao(v: string | null): string {
  const s = (v || '').toLowerCase()
  if (s.includes('ativa')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (s.includes('suspensa') || s.includes('inapta')) return 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300'
  if (s.includes('baixada') || s.includes('nula')) return 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
  return 'bg-muted text-muted-foreground'
}

function Bloco({ titulo, icone: Icone, children, aberto: abertoInicial = true }: {
  titulo: string; icone: typeof Building2; children: React.ReactNode; aberto?: boolean
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Icone className="h-4 w-4 text-muted-foreground" /> {titulo}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !aberto && '-rotate-90')} />
      </button>
      {aberto && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  )
}

function Linhas({ fatos, campos }: { fatos: Fato[]; campos: string[] }) {
  const presentes = campos
    .map(c => fatos.find(f => f.campo === c))
    .filter((f): f is Fato => !!f && (!!f.valor || !!f.valorJson))
  if (presentes.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Nada encontrado nesta consulta.</p>
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {presentes.map(f => (
        <div key={f.campo} className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1">
          <dt className="text-xs text-muted-foreground">{ROTULOS[f.campo] ?? f.campo}</dt>
          <dd className="text-right text-sm font-medium text-foreground">
            {f.campo === 'situacao_cadastral'
              ? <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', corDaSituacao(f.valor))}>{f.valor}</span>
              : valorDoCampo(f.campo, f.valor)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function DossieCard({ clienteId, podeAtualizar, semCartao = false }: {
  clienteId: string
  podeAtualizar: boolean
  /** Dentro de uma pill da aba Comercial já existe um cartão em volta. */
  semCartao?: boolean
}) {
  const [dossie, setDossie] = useState<Dossie | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [decidindo, setDecidindo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const r = await (trpc.cliente as never as {
        getDossie: { query: (i: { clienteId: string }) => Promise<Dossie> }
      }).getDossie.query({ clienteId })
      setDossie(r)
    } catch (e) {
      setErro((e as Error).message)
    } finally { setCarregando(false) }
  }, [clienteId])

  useEffect(() => { void carregar() }, [carregar])

  async function atualizar() {
    setAtualizando(true)
    try {
      const r = await (trpc.cliente as never as {
        atualizarDossie: { mutate: (i: { clienteId: string; forcar: boolean }) => Promise<{ ok: boolean; motivo?: string; fonte?: string; divergencias?: number }> }
      }).atualizarDossie.mutate({ clienteId, forcar: true })
      if (!r.ok) { alerts.error('Não foi possível consultar', r.motivo || 'Sem detalhes.'); return }
      await carregar()
      await alerts.success('Dossiê atualizado', `Fonte: ${r.fonte}${r.divergencias ? ` · ${r.divergencias} divergência(s) para revisar` : ''}`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setAtualizando(false) }
  }

  async function decidir(id: string, decisao: 'aprovada' | 'rejeitada') {
    setDecidindo(id)
    try {
      await (trpc.cliente as never as {
        decidirSugestaoDossie: { mutate: (i: { id: string; decisao: string }) => Promise<unknown> }
      }).decidirSugestaoDossie.mutate({ id, decisao })
      await carregar()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setDecidindo(null) }
  }

  const receita = dossie?.blocos.receita ?? []
  const fiscal = dossie?.blocos.fiscal ?? []
  const cnaes = (receita.find(f => f.campo === 'cnaes')?.valorJson as Cnae[] | undefined) ?? []
  const socios = (receita.find(f => f.campo === 'socios')?.valorJson as Socio[] | undefined) ?? []

  const conteudo = (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Dossiê do cliente</h2>
          <p className="text-xs text-muted-foreground">
            {dossie?.ultimaColeta
              ? <>Última coleta em {momentoBr(dossie.ultimaColeta.coletadoEm)} · fonte: {dossie.ultimaColeta.fonte}</>
              : 'Nenhuma consulta feita ainda.'}
          </p>
        </div>
        {podeAtualizar && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void atualizar()} disabled={atualizando}>
            {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar agora
          </Button>
        )}
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o dossiê…
        </div>
      )}

      {!carregando && erro && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erro}
        </div>
      )}

      {!carregando && !erro && dossie?.vazio && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileSearch className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Este cliente ainda não tem dossiê.{podeAtualizar ? ' Use "Atualizar agora" para consultar as fontes públicas.' : ''}
          </p>
        </div>
      )}

      {!carregando && !erro && dossie && !dossie.vazio && (
        <div className="space-y-3">
          {dossie.sugestoes.length > 0 && (
            <Bloco titulo={`Divergências a revisar (${dossie.sugestoes.length})`} icone={AlertTriangle}>
              <p className="mb-2 text-xs text-muted-foreground">
                O cadastro e a fonte oficial discordam. Nem sempre a fonte está certa — o endereço
                novo pode não ter chegado lá ainda. Aprove só o que fizer sentido.
              </p>
              <ul className="space-y-2">
                {dossie.sugestoes.map(s => (
                  <li key={s.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{CAMPOS_CADASTRO[s.campo] ?? s.campo}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="line-through">{s.valorAtual || '(vazio)'}</span>
                          {' → '}
                          <span className="font-medium text-foreground">{s.valorSugerido}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground/80">fonte: {s.fonte} · {momentoBr(s.coletadoEm)}</p>
                      </div>
                      {podeAtualizar && (
                        <div className="flex items-center gap-1.5">
                          <Button size="icon-sm" variant="soft" onClick={() => void decidir(s.id, 'aprovada')} disabled={decidindo === s.id} title="Aplicar no cadastro">
                            {decidindo === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button size="icon-sm" variant="soft-destructive" onClick={() => void decidir(s.id, 'rejeitada')} disabled={decidindo === s.id} title="Manter o cadastro como está">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          <Bloco titulo="Identificação" icone={Building2}>
            <Linhas fatos={receita} campos={['razao_social', 'nome_fantasia', 'data_abertura', 'natureza_juridica', 'porte', 'capital_social', 'matriz']} />
          </Bloco>

          <Bloco titulo="Situação cadastral" icone={ShieldCheck}>
            <Linhas fatos={receita} campos={['situacao_cadastral', 'data_situacao_cadastral', 'motivo_situacao_cadastral']} />
          </Bloco>

          <Bloco titulo="Atividades" icone={Activity}>
            {cnaes.length === 0
              ? <p className="py-2 text-sm text-muted-foreground">Nada encontrado nesta consulta.</p>
              : (
                <ul className="space-y-1">
                  {cnaes.map(c => (
                    <li key={c.codigo} className="flex items-start gap-2 text-sm">
                      {c.principal && <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">principal</Badge>}
                      <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
                      <span className="text-foreground">{c.descricao || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Bloco>

          <Bloco titulo="Endereço" icone={MapPin} aberto={false}>
            <Linhas fatos={receita} campos={['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'municipio_ibge']} />
          </Bloco>

          <Bloco titulo="Quadro societário" icone={Users} aberto={false}>
            {socios.length === 0
              ? <p className="py-2 text-sm text-muted-foreground">Nada encontrado nesta consulta.</p>
              : (
                <>
                  <ul className="space-y-1">
                    {socios.map((s, i) => (
                      <li key={`${s.nome}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 py-1 text-sm">
                        <span className="font-medium text-foreground">{s.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.qualificacao}{s.documento ? ` · ${s.documento}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted-foreground/80">
                    O documento dos sócios é gravado mascarado — o dossiê identifica quem responde
                    pela empresa, não é base de CPF.
                  </p>
                </>
              )}
          </Bloco>

          <Bloco titulo="Fiscal" icone={Receipt} aberto={false}>
            <Linhas fatos={fiscal} campos={['optante_simples', 'data_opcao_simples', 'optante_mei']} />
          </Bloco>

          {dossie.ultimaColeta?.urlFonte && (
            <p className="text-[11px] text-muted-foreground">
              <a href={dossie.ultimaColeta.urlFonte} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <ExternalLink className="h-3 w-3" /> ver a resposta da fonte
              </a>
            </p>
          )}
        </div>
      )}
    </>
  )

  if (semCartao) return conteudo
  return <Card className="p-5">{conteudo}</Card>
}
