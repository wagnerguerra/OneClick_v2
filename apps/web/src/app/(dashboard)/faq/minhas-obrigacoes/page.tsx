'use client'

import {
  ClipboardCheck, CheckCircle2, AlertCircle, Clock, History,
  Info, Eye, Calendar, FileText,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-corporativo, #0ea5e9)' // sky (Administrativo)
const FAQ_COLOR = '#0891b2'

export default function FaqMinhasObrigacoesPage() {
  return (
    <ArticleShell
      modulo="Minhas Obrigações"
      moduloColor={MODULO_COLOR}
      icon={ClipboardCheck}
      titulo="Minhas Obrigações: painel pessoal de entregas fiscais e acessórias"
      descricao="Visualize, organize e entregue as obrigações sob sua responsabilidade — direta ou por área contratada."
    >
      <Section icon={Info} titulo="Quais obrigações aparecem pra mim?" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow
            termo="Responsabilidade direta"
            texto="Obrigações cujo responsavelId aponta diretamente pro seu usuário. Sempre aparecem."
          />
          <DefRow
            termo="Responsabilidade por área"
            texto="Quando você é responsável pela área (em ClienteAreaContratada) e a obrigação é acessória + da mesma área, ela cai automaticamente no seu painel daquele cliente."
          />
          <DefRow
            termo="Competência"
            texto="Mês de referência da obrigação (acessoriasComp). Diferente do prazo legal de entrega."
          />
          <DefRow
            termo="Prazo efetivo"
            texto="prazoLimite (se calculado pela recorrência) ou acessoriasPrazo (do Acessórias). É a data que dispara a flag 'Atrasada'."
          />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Como usar o painel</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Eye} titulo="Filtrar o escopo" rota="/minhas-obrigacoes">
        <p>O filtro <strong>Status</strong> controla o escopo principal:</p>
        <ul className="space-y-1.5 ml-2">
          <li><Badge variant="outline" className="text-[10px] h-5">Pendentes</Badge> — padrão, ainda não entregue e dentro do prazo</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-red-50 border-red-200 text-red-700">Atrasadas</Badge> — prazo expirou e status segue EM_ANDAMENTO</li>
          <li><Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 border-emerald-200 text-emerald-700">Concluídas</Badge> — já entregues, com log de quem/quando/o quê</li>
          <li><Badge variant="outline" className="text-[10px] h-5">Todos</Badge> — visão consolidada</li>
        </ul>
        <Callout tipo="dica">
          Use o filtro <strong>Área</strong> pra focar apenas em fiscal, trabalhista, contábil etc.
          A busca filtra por nome da obrigação ou razão social do cliente.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Calendar} titulo="Alternar entre Tabela e Calendário" rota="botão no header">
        <p>
          A visão <strong>Tabela</strong> mostra tudo em lista vertical com prazo, status e ações.
          A visão <strong>Calendário</strong> distribui as obrigações pelo mês de vencimento — útil pra
          planejar a carga semanal.
        </p>
        <Callout tipo="info">
          No calendário, clicar num cartão de obrigação abre direto o diálogo de entrega.
          Cores: <span className="text-sky-700">azul (pendente)</span>,{' '}
          <span className="text-red-700">vermelho (atrasada)</span>,{' '}
          <span className="text-emerald-700">verde (concluída)</span>.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Marcar como entregue" rota="ações ⋮ → Marcar como entregue">
        <p>
          Ao concluir uma obrigação, abra o menu <strong>⋮</strong> e selecione <strong>Marcar como entregue</strong>.
          O diálogo pede dois campos opcionais:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Observação</strong> — até 500 caracteres. Use pra registrar nº de protocolo, valor pago, particularidades.</li>
          <li><strong>URL do anexo</strong> — link para o comprovante, recibo ou protocolo em PDF.</li>
        </ul>
        <Callout tipo="aviso">
          A entrega altera o status da execução para <strong>CONCLUIDO</strong>,
          preenche <code className="text-[11px]">entreguePor / entregueEm / entregaObservacao / entregaAnexoUrl</code>{' '}
          e registra um evento <code className="text-[11px]">concluido</code> no log da execução.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={History} titulo="Consultar o histórico" rota="ações ⋮ → Ver histórico">
        <p>
          A timeline mostra todos os eventos da execução (criação, pausas, comentários, anexos, entrega)
          em ordem cronológica decrescente, com autor e timestamp. Útil pra auditoria e pra entender o que
          aconteceu antes da sua intervenção.
        </p>
      </Step>

      <Section icon={AlertCircle} titulo="Permissões e visibilidade" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-1.5 text-sm ml-2">
          <li>O módulo respeita o slug <code className="text-[11px]">minhas-obrigacoes</code> nas permissões do usuário.</li>
          <li>Master e Empresa Master sempre veem todas; outros usuários veem só o que está no escopo deles.</li>
          <li>A entrega exige <strong>permissão de escrita</strong> no módulo e que o usuário seja responsável (direto ou por área).</li>
          <li>O histórico é privado — só quem responde pela obrigação pode abrir.</li>
        </ul>
      </Section>

      <Section icon={Clock} titulo="Boas práticas" cor={FAQ_COLOR}>
        <ul className="list-disc list-inside space-y-1.5 text-sm ml-2">
          <li>Entregue assim que finalizar — o log registra o momento exato, evitando dúvidas depois.</li>
          <li>Sempre anexe o protocolo/comprovante (URL). Facilita auditoria interna e externa.</li>
          <li>Use a observação pra registrar <strong>desvios</strong>: valores diferentes, dispensas legais, particularidades do mês.</li>
          <li>Olhe o painel <strong>diariamente</strong> — atrasadas geram penalidades e ficam destacadas em vermelho.</li>
        </ul>
      </Section>
    </ArticleShell>
  )
}
