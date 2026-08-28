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
  Building2, Activity, MapPin, Users, Receipt, ShieldCheck, ExternalLink, Share2, Network,
} from 'lucide-react'
import {
  Button, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { getApiUrl } from '@/lib/api-url'
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
type Socio = {
  nome: string
  documento: string
  qualificacao: string
  dataEntrada: string | null
  /** Veio da Legalização (PDF da Situação Fiscal), então não está mascarado. */
  documentoCompleto?: boolean
  participacao?: number | null
}

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

/** CPF completo ganha máscara; o mascarado da Receita já vem formatado. */
function formatarCpf(doc: string): string {
  const so = doc.replace(/\D/g, '')
  return so.length === 11
    ? so.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : doc
}

type PerfilAchado = { rede: string; url: string; identificador: string }

type PerfilSocio = {
  id: string
  rede: string
  url: string
  identificador: string | null
  observacao: string | null
  origem: string
  confirmado: boolean
}

type Participacao = {
  clienteId: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  status: string
  tipoSocio: string
  participacao: number | null
  /** Casou por CPF (fato) ou só pelo nome (palpite)? */
  porCpf: boolean
}

type SocioParticipacoes = {
  socioId: string
  nomeCompleto: string
  participacoes: Participacao[]
}

type SocioComPerfis = {
  id: string
  nomeCompleto: string
  cpf: string
  perfisSociais: PerfilSocio[]
}

const ROTULO_REDE: Record<string, string> = {
  INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', LINKEDIN: 'LinkedIn',
  X: 'X', YOUTUBE: 'YouTube', TIKTOK: 'TikTok', OUTRO: 'Perfil',
}

type Passo = { chave: string; rotulo: string; status: 'rodando' | 'ok' | 'erro'; detalhe?: string }

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
  // Painel de progresso da coleta. Fica aberto até o usuário fechar — quem
  // acompanhou os passos costuma querer reler o que cada provedor respondeu.
  const [sociosComPerfis, setSociosComPerfis] = useState<SocioComPerfis[]>([])
  const [participacoes, setParticipacoes] = useState<SocioParticipacoes[]>([])
  const [socioAberto, setSocioAberto] = useState<string | null>(null)
  const [urlNova, setUrlNova] = useState('')
  const [ocupadoSocio, setOcupadoSocio] = useState<string | null>(null)
  const [passos, setPassos] = useState<Passo[]>([])
  const [painelAberto, setPainelAberto] = useState(false)
  const [conclusao, setConclusao] = useState<string | null>(null)

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

  // Perfis vêm em chamada própria: são de outra tabela e mudam por ação do
  // usuário, sem precisar recoletar o dossiê inteiro.
  const carregarSocios = useCallback(async () => {
    try {
      const r = await (trpc.cliente as never as {
        listPerfisSocios: { query: (i: { clienteId: string }) => Promise<SocioComPerfis[]> }
      }).listPerfisSocios.query({ clienteId })
      setSociosComPerfis(r)
    } catch { /* sem perfis, o resto do dossiê continua servindo */ }

    try {
      const r = await (trpc.cliente as never as {
        listParticipacoesSocios: { query: (i: { clienteId: string }) => Promise<SocioParticipacoes[]> }
      }).listParticipacoesSocios.query({ clienteId })
      setParticipacoes(r)
    } catch { /* idem */ }
  }, [clienteId])

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { void carregarSocios() }, [carregarSocios])

  /**
   * A coleta é lida como STREAM: o backend narra cada passo (cache, provedor
   * tentado, gravação, comparação) e a tela vai marcando. Sem isso, a espera de
   * dezenas de segundos era um spinner mudo — e três provedores encadeados
   * podem levar mesmo esse tempo.
   */
  async function atualizar() {
    setAtualizando(true)
    setPassos([])
    setConclusao(null)
    setPainelAberto(true)

    // Um passo é identificado pela chave: o mesmo passo volta 'rodando' e
    // depois 'ok', e a linha é atualizada no lugar em vez de duplicar.
    const marcar = (p: Passo) => setPassos(atual => {
      const i = atual.findIndex(x => x.chave === p.chave)
      if (i === -1) return [...atual, p]
      const copia = [...atual]
      copia[i] = p
      return copia
    })

    try {
      const resp = await fetch(`${getApiUrl()}/api/clientes/${clienteId}/dossie/coletar-stream?forcar=1`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!resp.ok || !resp.body) throw new Error(`A coleta não respondeu (HTTP ${resp.status})`)

      const leitor = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Evento SSE termina em linha em branco; o resto fica no buffer para
        // o próximo pedaço.
        const partes = buffer.split('\n\n')
        buffer = partes.pop() ?? ''
        for (const parte of partes) {
          const linha = parte.split('\n').find(l => l.startsWith('data: '))
          if (!linha) continue
          try {
            const ev = JSON.parse(linha.slice(6)) as
              | (Passo & { tipo: 'passo' })
              | { tipo: 'fim'; resultado: { ok: boolean; motivo?: string; fonte?: string; divergencias?: number; doCache?: boolean } }
            if (ev.tipo === 'passo') { marcar(ev); continue }

            const r = ev.resultado
            setConclusao(
              !r.ok ? `Não deu certo: ${r.motivo || 'sem detalhes'}`
                : r.doCache ? 'Já havia coleta recente; nada foi consultado de novo.'
                : `Concluído pela fonte ${r.fonte}.`
                  + (r.divergencias ? ` ${r.divergencias} divergência(s) para você revisar abaixo.` : ' Sem divergências.'),
            )
            if (r.ok) await carregar()
          } catch { /* linha malformada não derruba o acompanhamento */ }
        }
      }
    } catch (e) {
      setConclusao(`Erro: ${(e as Error).message}`)
    } finally { setAtualizando(false) }
  }

  async function adicionarPerfil(socioId: string) {
    const url = urlNova.trim()
    if (!url) return
    setOcupadoSocio(socioId)
    try {
      await (trpc.cliente as never as {
        addPerfilSocio: { mutate: (i: { socioId: string; url: string; rede: string }) => Promise<unknown> }
      }).addPerfilSocio.mutate({ socioId, url, rede: 'OUTRO' })
      setUrlNova('')
      await carregarSocios()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setOcupadoSocio(null) }
  }

  async function sugerirPerfis(socioId: string) {
    setOcupadoSocio(socioId)
    try {
      const r = await (trpc.cliente as never as {
        sugerirPerfisSocio: { mutate: (i: { socioId: string }) => Promise<{ sugeridos: number; aviso?: string }> }
      }).sugerirPerfisSocio.mutate({ socioId })
      await carregarSocios()
      if (r.aviso) alerts.info('Busca de perfis', r.aviso)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setOcupadoSocio(null) }
  }

  async function confirmarPerfil(id: string) {
    try {
      await (trpc.cliente as never as { confirmarPerfilSocio: { mutate: (i: { id: string }) => Promise<unknown> } })
        .confirmarPerfilSocio.mutate({ id })
      await carregarSocios()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function removerPerfil(id: string) {
    try {
      await (trpc.cliente as never as { removerPerfilSocio: { mutate: (i: { id: string }) => Promise<unknown> } })
        .removerPerfilSocio.mutate({ id })
      await carregarSocios()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
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
  const perfisEmpresa = ((dossie?.blocos?.redes ?? [])
    .find(f => f.campo === 'perfis')?.valorJson as PerfilAchado[] | undefined) ?? []

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
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {s.qualificacao}
                          {s.documento && <> · <span className={cn(s.documentoCompleto && 'font-medium text-foreground')}>{formatarCpf(s.documento)}</span></>}
                          {s.participacao != null && <> · {s.participacao}%</>}
                          {s.documentoCompleto && (
                            <span
                              className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              title="CPF completo, obtido da Situação Fiscal na aba Legalização"
                            >
                              completo
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* Dois documentos convivem aqui, e a diferença importa: o
                      que vem da consulta pública é mascarado pela Receita; o
                      completo é o que a Legalização obteve do PDF da Situação
                      Fiscal, como contador da empresa. */}
                  <p className="mt-2 text-[11px] text-muted-foreground/80">
                    {socios.some(s => !s.documentoCompleto)
                      ? 'O CPF mascarado é o que a consulta pública devolve. Para completá-lo, use "Importar QSA" na aba Legalização — ele vem do PDF da Situação Fiscal.'
                      : 'CPF completo, vindo da Situação Fiscal (aba Legalização).'}
                  </p>
                </>
              )}
          </Bloco>

          <Bloco titulo="Participações dos sócios" icone={Network} aberto={false}>
            {/* Só a nossa carteira. Não existe fonte pública gratuita que vá de
                CPF a empresas — a base de QSA da Receita mascara o documento do
                sócio, e quem faz esse caminho cobra. O que temos aqui é exato e
                é nosso. */}
            {participacoes.every(p => p.participacoes.length === 0) ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nenhum sócio deste cliente aparece em outro cliente da carteira.
              </p>
            ) : (
              <div className="space-y-3">
                {participacoes.filter(p => p.participacoes.length > 0).map(p => (
                  <div key={p.socioId}>
                    <p className="mb-1 text-[13px] font-semibold text-foreground">{p.nomeCompleto}</p>
                    <ul className="space-y-1">
                      {p.participacoes.map(x => (
                        <li key={`${p.socioId}-${x.clienteId}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 py-1 text-sm">
                          <a
                            href={`/clientes/${x.clienteId}`}
                            className="min-w-0 truncate font-medium text-foreground hover:underline"
                          >
                            {x.nomeFantasia || x.razaoSocial}
                          </a>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {x.tipoSocio.replace(/_/g, ' ').toLowerCase()}
                            {x.participacao != null && <> · {x.participacao}%</>}
                            {x.status !== 'ATIVO' && (
                              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold">
                                {x.status.toLowerCase()}
                              </span>
                            )}
                            {!x.porCpf && (
                              <span
                                className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                title="Casou pelo nome, não pelo CPF — pode ser homônimo"
                              >
                                por nome
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              Cruzamento com a própria carteira, pelo CPF quando ele é conhecido. O que casa só
              pelo nome vem marcado — homônimo existe.
            </p>
          </Bloco>

          <Bloco titulo="Redes sociais" icone={Share2} aberto={false}>
            {/* Da EMPRESA: o link está publicado no rodapé do próprio site,
                então não há palpite — vem sozinho na coleta. */}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Da empresa
            </p>
            {perfisEmpresa.length === 0 ? (
              <p className="py-1 text-sm text-muted-foreground">
                Nenhum perfil encontrado no site da empresa.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {perfisEmpresa.map(perfil => (
                  <a
                    key={perfil.url}
                    href={perfil.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{ROTULO_REDE[perfil.rede] ?? perfil.rede}</span>
                    <span className="text-muted-foreground">@{perfil.identificador}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Dos SÓCIOS: aqui não há certeza nenhuma. Homônimo é regra, então
                o que a busca acha fica marcado como "a conferir" até alguém
                abrir, olhar e confirmar que é a pessoa certa. */}
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dos sócios
            </p>
            {socios.length === 0 && (
              <p className="py-1 text-sm text-muted-foreground">
                Nenhum sócio cadastrado. Importe o QSA na aba Legalização.
              </p>
            )}
            <div className="space-y-2">
              {sociosComPerfis.map(socio => {
                const aberto = socioAberto === socio.id
                const confirmados = socio.perfisSociais.filter(x => x.confirmado)
                return (
                  <div key={socio.id} className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => { setSocioAberto(aberto ? null : socio.id); setUrlNova('') }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    >
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !aberto && '-rotate-90')} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{socio.nomeCompleto}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {confirmados.length > 0
                          ? `${confirmados.length} perfil(is)`
                          : socio.perfisSociais.length > 0 ? `${socio.perfisSociais.length} a conferir` : 'sem perfil'}
                      </span>
                    </button>

                    {aberto && (
                      <div className="space-y-2 border-t border-border px-3 py-2.5">
                        {socio.perfisSociais.map(perfil => (
                          <div key={perfil.id} className="flex items-center gap-2 text-sm">
                            <a
                              href={perfil.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-foreground hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="shrink-0 font-medium">{ROTULO_REDE[perfil.rede] ?? perfil.rede}</span>
                              <span className="truncate text-muted-foreground">
                                {perfil.identificador ? `@${perfil.identificador}` : perfil.url}
                              </span>
                            </a>
                            {!perfil.confirmado && (
                              <>
                                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                  a conferir
                                </span>
                                {podeAtualizar && (
                                  <Button
                                    variant="soft" size="icon-sm" title="É esta pessoa — confirmar"
                                    onClick={() => void confirmarPerfil(perfil.id)}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                            {podeAtualizar && (
                              <Button
                                variant="soft-destructive" size="icon-sm" title="Remover"
                                onClick={() => void removerPerfil(perfil.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}

                        {socio.perfisSociais.length === 0 && (
                          <p className="text-xs italic text-muted-foreground">
                            Nenhum perfil ainda. Cole o endereço abaixo, ou peça uma busca.
                          </p>
                        )}

                        {podeAtualizar && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <input
                              value={urlNova}
                              onChange={e => setUrlNova(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void adicionarPerfil(socio.id) } }}
                              placeholder="https://instagram.com/perfil"
                              className="h-8 min-w-[220px] flex-1 rounded-md border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <Button
                              size="sm" variant="outline" className="h-8"
                              disabled={!urlNova.trim() || ocupadoSocio === socio.id}
                              onClick={() => void adicionarPerfil(socio.id)}
                            >
                              Adicionar
                            </Button>
                            <Button
                              size="sm" variant="outline" className="h-8 gap-1.5"
                              disabled={ocupadoSocio === socio.id}
                              onClick={() => void sugerirPerfis(socio.id)}
                            >
                              {ocupadoSocio === socio.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <FileSearch className="h-3.5 w-3.5" />}
                              Procurar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground/80">
              Só o endereço do perfil fica guardado — o conteúdo é aberto na rede, na hora.
              O que a busca acha entra como &ldquo;a conferir&rdquo;: nome igual não é a mesma pessoa.
            </p>
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

  const painel = (
    <Dialog open={painelAberto} onOpenChange={setPainelAberto}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={RefreshCw} color="sky">
          <DialogTitle>Coletando o dossiê</DialogTitle>
          <DialogDescription>
            Cada linha é um passo da coleta. A janela fica aberta até você fechar.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          <div className="nice-scrollbar max-h-[320px] space-y-1.5 overflow-y-auto">
            {passos.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Começando…</p>
            )}
            {passos.map(p => (
              <div key={p.chave} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <span className="mt-0.5 shrink-0">
                  {p.status === 'rodando' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {p.status === 'ok' && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                  {p.status === 'erro' && <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{p.rotulo}</p>
                  {p.detalhe && <p className="text-[11px] text-muted-foreground">{p.detalhe}</p>}
                </div>
              </div>
            ))}
          </div>
          {conclusao && (
            <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
              {conclusao}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant={conclusao ? 'success' : 'outline'} size="sm"
            onClick={() => setPainelAberto(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (semCartao) return <>{conteudo}{painel}</>
  return <>
    <Card className="p-5">{conteudo}</Card>
    {painel}
  </>
}
