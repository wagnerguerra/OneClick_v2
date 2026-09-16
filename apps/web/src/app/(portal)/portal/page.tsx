'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderOpen, Upload, Inbox } from 'lucide-react'

import { trpc } from '@/lib/trpc'
import { usePortal } from '../_lib/contexto'
import {
  AcessoRapido, Alertas, BlocoDocumentos, BlocoEquipe, BlocoObrigacoes, BlocoPendencias,
  BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CartaoAjuda, Saudacao, diasAte,
  type Alerta, type AreaDaEquipe, type Consulta, type Obrigacao, type PastaDrive,
  type Pendencia, type ResumoObrigacoes,
} from '../_components/painel-inicio'
import { ContatoEquipeModal } from '../_components/contato-equipe-modal'
import { CalendarioPortal } from '../_components/calendario-portal'

/**
 * Início do Portal do Cliente — a mesa de trabalho do cliente.
 *
 * Até 15/09/2026 esta página era uma capa de site: hero, título digitando,
 * terminal decorativo, faixa de números e banner de chamada. O dono do produto
 * pediu "cara de portal", e a pesquisa nos portais de cliente contábeis
 * (TaxDome, Canopy, Onvio, Acessórias, Nibo) aponta a mesma ordem:
 *
 *   1. saudação curta com empresa e data — quem tem vários CNPJs precisa saber
 *      de qual está vendo;
 *   2. alerta, só quando há risco;
 *   3. o que o cliente precisa fazer (pendências com prazo e o botão de enviar);
 *   4. o andamento do mês (obrigações);
 *   5. documentos recentes;
 *   6. ao lado: com quem falar, atalhos e ajuda.
 *
 * Saiu o que é conteúdo fixo — a pesquisa é unânime em tirar da home tudo que
 * não muda entre uma visita e outra, e o passo-a-passo de "como funciona" era
 * exatamente isso.
 *
 * Os blocos moram em `painel-inicio.tsx`; esta página só decide o que buscar
 * e o que montar, a partir dos módulos que o escritório liberou.
 */

const ROTULO_NIVEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  OPERACIONAL: 'Operacional',
  CONSULTA: 'Consulta',
}

/**
 * O pedaço da API do portal que a home lê. Tipado aqui, e não com `any`, para
 * que uma mudança de formato quebre a compilação em vez da tela.
 */
interface PortalApiDaHome {
  solicitacoes: { pendentes: { query(i: { clienteId: string }): Promise<Pendencia[]> } }
  obrigacoes: {
    listar: { query(i: { clienteId: string; competencia: string }): Promise<Obrigacao[]> }
    resumo: { query(i: { clienteId: string; competencia: string }): Promise<ResumoObrigacoes> }
  }
  arquivos: { drive: { query(i: { clienteId: string; subPastaId: null }): Promise<PastaDrive> } }
  equipe: { query(i: { clienteId: string }): Promise<AreaDaEquipe[]> }
}

/** Competência corrente, AAAAMM. Sem ela o resumo contaria o histórico inteiro. */
function competenciaDe(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Liga a promessa ao estado: `undefined` enquanto consulta, `null` se falhar. */
function consultar<T>(promessa: Promise<T>, definir: (v: Consulta<T>) => void, vivo: () => boolean) {
  definir(undefined)
  promessa
    .then((v) => { if (vivo()) definir(v) })
    .catch(() => { if (vivo()) definir(null) })
}

export default function PortalInicioPage() {
  const { clienteId, vinculo, usuarioNome } = usePortal()

  const liberados = useMemo(() => new Set(vinculo?.modulos ?? []), [vinculo])
  const temDocumentos = liberados.has('documentos')
  const temObrigacoes = liberados.has('obrigacoes')
  const podeEditar = Boolean(vinculo?.podeEditar)

  // "Hoje" só no cliente: no servidor sairia no fuso e no instante dele.
  const [hoje, setHoje] = useState<Date | null>(null)
  useEffect(() => { setHoje(new Date()) }, [])
  const referencia = hoje ?? new Date()
  const competencia = competenciaDe(referencia)
  const mes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(referencia)

  const [pendencias, setPendencias] = useState<Consulta<Pendencia[]>>(undefined)
  const [obrigacoes, setObrigacoes] = useState<Consulta<Obrigacao[]>>(undefined)
  const [resumo, setResumo] = useState<Consulta<ResumoObrigacoes>>(undefined)
  const [pasta, setPasta] = useState<Consulta<PastaDrive>>(undefined)
  const [equipe, setEquipe] = useState<Consulta<AreaDaEquipe[]>>(undefined)
  const [escrevendoPara, setEscrevendoPara] = useState<AreaDaEquipe | null>(null)

  // Só consulta o que o escritório liberou: a rota de um módulo desligado
  // responde "não encontrado", e isso não é um dado para mostrar.
  useEffect(() => {
    if (!clienteId) return
    let ativo = true
    const vivo = () => ativo
    const api = trpc.portal as unknown as PortalApiDaHome

    consultar(api.equipe.query({ clienteId }), setEquipe, vivo)
    if (temDocumentos) {
      consultar(api.solicitacoes.pendentes.query({ clienteId }), setPendencias, vivo)
      consultar(api.arquivos.drive.query({ clienteId, subPastaId: null }), setPasta, vivo)
    }
    if (temObrigacoes) {
      consultar(api.obrigacoes.listar.query({ clienteId, competencia }), setObrigacoes, vivo)
      consultar(api.obrigacoes.resumo.query({ clienteId, competencia }), setResumo, vivo)
    }
    return () => { ativo = false }
  }, [clienteId, temDocumentos, temObrigacoes, competencia])

  const alertas: Alerta[] = []
  if (hoje && Array.isArray(pendencias)) {
    const vencidas = pendencias.filter((p) => p.prazo && diasAte(p.prazo, hoje) < 0).length
    if (vencidas > 0) {
      alertas.push({
        texto: vencidas === 1 ? '1 pendência passou do prazo.' : `${vencidas} pendências passaram do prazo.`,
        acao: podeEditar ? 'Enviar agora' : 'Ver pendências',
        href: '/portal/documentos',
      })
    }
  }
  if (resumo && resumo.atrasadas > 0) {
    alertas.push({
      texto: resumo.atrasadas === 1
        ? `1 obrigação de ${mes} está com a entrega atrasada.`
        : `${resumo.atrasadas} obrigações de ${mes} estão com a entrega atrasada.`,
      acao: 'Ver obrigações',
      href: '/portal/obrigacoes',
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-4 xl:max-w-[86rem]">
      <Saudacao
        nome={usuarioNome}
        razaoSocial={vinculo?.razaoSocial ?? 'Sua empresa'}
        nivel={ROTULO_NIVEL[vinculo?.nivel ?? ''] ?? '—'}
        acoes={temDocumentos ? (
          <>
            {podeEditar && (
              <Link href="/portal/documentos" className={BOTAO_PRIMARIO}>
                <Upload className="h-4 w-4" />
                Enviar arquivo
              </Link>
            )}
            <Link href="/portal/documentos" className={podeEditar ? BOTAO_SECUNDARIO : BOTAO_PRIMARIO}>
              <FolderOpen className="h-4 w-4" />
              Abrir documentos
            </Link>
          </>
        ) : undefined}
      />

      <Alertas itens={alertas} />

      {/* Três colunas no monitor largo: calendário, o miolo e a coluna de
          contato. Abaixo disso o calendário desce para a coluna da direita
          (tablet) ou para o fim da pilha (celular) — ele é contexto do mês, e
          quem abre o portal no telefone veio resolver pendência. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[19rem_minmax(0,1fr)_20rem]">
        <CalendarioPortal
          clienteId={clienteId}
          className="order-last lg:order-none lg:col-start-2 lg:row-start-1 xl:col-start-1 xl:row-start-1"
        />

        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1 xl:col-start-2 xl:row-span-1">
          {temDocumentos && <BlocoPendencias pendencias={pendencias} podeEditar={podeEditar} hoje={hoje} />}
          {temObrigacoes && <BlocoObrigacoes lista={obrigacoes} resumo={resumo} mes={mes} hoje={hoje} />}
          {temDocumentos && <BlocoDocumentos pasta={pasta} hoje={hoje} />}
          {!temDocumentos && !temObrigacoes && (
            <section className="anim-subir flex flex-col items-center gap-2 rounded-2xl border border-[#e6ebf2] bg-white px-6 py-12 text-center dark:border-[#1b2739] dark:bg-[#0e1726]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-[#16233a] dark:text-slate-400">
                <Inbox className="h-5 w-5" />
              </span>
              <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Nenhuma área liberada ainda</p>
              <p className="max-w-md text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                O escritório libera as áreas do portal em etapas. Assim que uma entrar, o que ela
                traz para a sua empresa aparece aqui.
              </p>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1">
          <BlocoEquipe equipe={equipe} onEscrever={setEscrevendoPara} />
          <AcessoRapido liberados={liberados} />
          <CartaoAjuda />
        </aside>
      </div>

      <ContatoEquipeModal clienteId={clienteId} area={escrevendoPara} onClose={() => setEscrevendoPara(null)} />
    </div>
  )
}
