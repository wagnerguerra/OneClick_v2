'use client'

import {
  ListChecks, CheckSquare, Clock, Pause, Archive, MessageSquare,
  Paperclip, Lightbulb, Info, ArrowRight, AlertTriangle, Eye,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-corporativo, #0ea5e9)' // sky
const FAQ_COLOR = '#0891b2'

export default function FaqMeusServicosPage() {
  return (
    <ArticleShell
      modulo="Meus Serviços"
      moduloColor={MODULO_COLOR}
      icon={ListChecks}
      titulo="Meus Serviços: checklist, SLAs, pausa e arquivamento"
      descricao="Painel diário do operador — concluir passos, anexar arquivos, pausar quando aguarda cliente e arquivar concluídos antigos."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Execução" texto="Instância de um serviço-template para um cliente. Tem checklist próprio com passos a marcar." />
          <DefRow termo="SLA" texto="Prazo total da execução em horas — calculado a partir do template e do momento de início." />
          <DefRow termo="Pausa" texto="Estado em que o SLA não corre (aguardando cliente/terceiros). Ao retomar, o prazoLimite é recalculado." />
          <DefRow termo="Passo ignorado" texto="Quando o template permite, o passo pode ser pulado sem concluir — desbloqueia o próximo." />
          <DefRow termo="Arquivamento" texto="Concluídas/canceladas saem da listagem padrão (manual ou automático após N dias)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Operação diária</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Eye} titulo="Ver suas execuções pendentes" rota="/meus-servicos">
        <p>
          Em <strong>Administrativo → Meus Serviços</strong>, a lista mostra apenas o que
          é <strong>visível para você</strong> conforme regras de hierarquia:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Master, Diretor e Coordenador veem <strong>todas as execuções da empresa</strong></li>
          <li>Líder de área vê execuções <strong>dos colaboradores que ele lidera</strong></li>
          <li>Demais usuários veem somente as <strong>próprias</strong> (responsavelId = userId)</li>
          <li>Responsável pelo cliente em uma área herda visibilidade dessas execuções</li>
        </ul>
        <Callout tipo="info">
          Filtros disponíveis: status (Em andamento, Concluído, Cancelado), atrasados (prazo
          vencido), arquivados. Por padrão, concluídas com mais de N dias somem (configurável
          em <code className="text-[11px]">/servicos/configuracoes</code>).
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={CheckSquare} titulo="Marcar passos do checklist" rota="/meus-servicos → expandir execução">
        <p>
          Clique na linha da execução para abrir o checklist. Cada passo pode estar em um destes estados:
        </p>
        <ul className="space-y-1.5 ml-2">
          <li><Badge variant="outline" className="text-[10px] h-5">Pendente</Badge> — não foi tocado ainda</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 border-emerald-200 text-emerald-700">Concluído</Badge> — checkbox marcado, registra usuário e data</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">Ignorado</Badge> — pulado com motivo (só se template permite)</li>
        </ul>
        <Callout tipo="aviso">
          Passos <strong>obrigatórios sequenciais</strong> bloqueiam o próximo. Para pular,
          conclua os anteriores ou use <strong>&quot;Ignorar&quot;</strong> (se habilitado no template).
        </Callout>
        <Callout tipo="dica">
          Quando todos os obrigatórios estão fechados (concluídos ou ignorados), o botão{' '}
          <strong>&quot;Concluir execução&quot;</strong> finaliza tudo de uma vez sem precisar
          marcar passo a passo.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={MessageSquare} titulo="Comentar e anexar arquivos por passo" rota="cada passo → ícones">
        <p>
          Cada passo individual tem dois recursos colaborativos:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <MessageSquare className="inline h-3 w-3" /> <strong>Comentários</strong> —
            histórico cronológico, timestamps, autor. Útil para registrar tratativas.
          </li>
          <li>
            <Paperclip className="inline h-3 w-3" /> <strong>Anexos</strong> —
            upload de arquivos vinculados ao passo (NF, comprovantes, CNDs).
          </li>
        </ul>
        <Callout tipo="info">
          Watchers (espectadores) recebem notificação quando há atividade — útil para o
          gestor acompanhar serviços críticos sem ser responsável direto.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Pause} titulo="Pausar quando aguarda cliente" rota="botão Pausar na execução">
        <p>
          Quando você está bloqueado aguardando cliente ou terceiros, <strong>pause</strong>{' '}
          a execução com motivo. Comportamento:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>SLA <strong>não corre</strong> durante a pausa — não conta como atrasado</li>
          <li>Ao retomar, o <strong>prazoLimite é recalculado</strong> somando o tempo pausado</li>
          <li>Eventos <em>pausado</em> e <em>retomado</em> ficam registrados na timeline</li>
        </ul>
        <Callout tipo="dica">
          Documente o motivo da pausa de forma clara (&quot;Aguardando contrato social
          assinado pelo sócio Y&quot;) — facilita auditoria e cobrança ao cliente.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Clock} titulo="Acompanhar SLA e prazos">
        <p>
          A coluna <strong>Prazo</strong> mostra o tempo restante (verde / amarelo / vermelho):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Verde</strong> — mais de 25% do SLA ainda disponível</li>
          <li><strong>Amarelo</strong> — entre 0% e 25% restante (atenção)</li>
          <li><strong>Vermelho</strong> — prazo estourado (atrasado)</li>
        </ul>
        <Callout tipo="info">
          Filtro <strong>&quot;Atrasados&quot;</strong> destaca rapidamente o que precisa
          de ação imediata. O Dashboard também tem um widget de KPIs (Em andamento,
          Atrasados, Pausados) com a mesma visão.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Archive} titulo="Arquivar execuções antigas">
        <p>
          Após concluir ou cancelar, a execução pode ser arquivada manualmente para sumir
          da listagem padrão. Filtro <strong>&quot;Incluir arquivados&quot;</strong> reexibe
          quando precisar consultar.
        </p>
        <Callout tipo="info">
          Há também <strong>arquivamento automático por dias</strong> — concluídas/canceladas
          mais antigas que N dias somem da listagem (config global em{' '}
          <code className="text-[11px]">/servicos/configuracoes</code>).
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Não vejo uma execução que devia ver</p>
            <p className="text-foreground/70">
              1. Confira o filtro de status no topo. 2. Verifique se você é o responsável (ou
              líder de área do responsável). 3. Master/Diretor podem reatribuir o
              responsável. 4. Se for parte de um Processo, abra <code className="text-[11px]">/processos/[id]</code> →
              aba Execuções para ver a cadeia completa.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Reabrir execução após concluir</p>
            <p className="text-foreground/70">
              Desmarcar um passo concluído reabre automaticamente a execução
              (status volta para <code className="text-[11px]">EM_ANDAMENTO</code>). Um evento{' '}
              <code className="text-[11px]">execucao_reaberta</code> é registrado.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Esta execução faz parte de uma cadeia</p>
            <p className="text-foreground/70">
              Ao concluir a última etapa, o sistema pode criar automaticamente outras
              execuções (sucessoras). Veja{' '}
              <a className="text-violet-600 hover:underline" href="/faq/processos">Fluxo de Processos</a>{' '}
              para o detalhe.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/meus-servicos" label="Abrir meus serviços" cor={MODULO_COLOR} />
          <QuickLink href="/processos" label="Ver cadeias de processos" cor={MODULO_COLOR} />
          <QuickLink href="/dashboard" label="Dashboard com indicadores" cor={MODULO_COLOR} />
          <QuickLink href="/servicos" label="Editar templates (admin)" cor={MODULO_COLOR} />
        </div>
        <Callout tipo="aviso">
          <AlertTriangle className="inline h-3 w-3" /> Não confunda <strong>/meus-servicos</strong>{' '}
          (operacional, lista de execuções suas) com <strong>/servicos</strong> (admin, edita templates).
        </Callout>
      </Section>
    </ArticleShell>
  )
}
