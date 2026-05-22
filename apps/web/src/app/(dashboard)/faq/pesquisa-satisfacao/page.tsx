'use client'

import {
  Star, Send, BarChart3, Globe, MessageSquare, AlertTriangle,
  Lightbulb, Info, ArrowRight, CheckCircle2,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-comercial, #fb7185)'
const FAQ_COLOR = '#0891b2'

export default function FaqPesquisaSatisfacaoPage() {
  return (
    <ArticleShell
      modulo="Pesquisa de Satisfação"
      moduloColor={MODULO_COLOR}
      icon={Star}
      titulo="Pesquisa de Satisfação: NPS e respostas"
      descricao="Disparo automático ao finalizar orçamento, link público para o cliente responder e análise de NPS."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="NPS" texto="Net Promoter Score — pergunta &quot;De 0 a 10, quanto recomendaria nossos serviços?&quot;. Detratores (0-6), Neutros (7-8), Promotores (9-10). NPS = %Promotores − %Detratores." />
          <DefRow termo="Token público" texto="Cada pesquisa tem um link único (ex: /pesquisa/abc123). Cliente responde sem login no app." />
          <DefRow termo="Trigger automático" texto="Quando orçamento atinge status FINALIZADO (vide Fluxo de Processos), uma pesquisa é criada e e-mail enviado ao cliente." />
          <DefRow termo="Comentário aberto" texto="Campo opcional onde cliente justifica nota — fonte rica de feedback qualitativo." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Fluxo de envio</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Send} titulo="Disparo automático" rota="trigger interno">
        <p>
          Quando um orçamento atinge status <strong>FINALIZADO</strong> (ou execução-raiz
          conclui — vide <a className="text-rose-600 hover:underline" href="/faq/processos">Fluxo de Processos</a>),
          o sistema:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cria registro <code className="text-[11px]">PesquisaSatisfacao</code> com token único</li>
          <li>Envia e-mail ao cliente com link <code className="text-[11px]">/pesquisa/[token]</code></li>
          <li>Marca <strong>enviadaEm</strong> com timestamp</li>
        </ul>
        <Callout tipo="info">
          E-mail é único e idempotente — mesmo orçamento não dispara duas pesquisas se o
          status &quot;balançar&quot; entre FINALIZADO e outros.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Globe} titulo="Disparo manual" rota="/pesquisas → + Nova">
        <p>Você também pode criar pesquisas manualmente:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Selecione o cliente</li>
          <li>Adicione observações internas (motivo, contexto)</li>
          <li>Vincule a um orçamento ou execução específica (opcional)</li>
          <li>Clique <strong>Enviar</strong> — token é gerado e e-mail disparado</li>
        </ul>
        <Callout tipo="dica">
          Útil em situações onde o trigger automático não cobre — ex: pesquisa pontual
          após reunião importante, pesquisa anual para clientes mensais.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Resposta do cliente</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Star} titulo="Página pública" rota="/pesquisa/[token]">
        <p>
          Cliente acessa via link no e-mail (ou link copiado pelo gestor). Página pública,
          sem necessidade de login:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Pergunta principal</strong> — &quot;De 0 a 10, quanto recomendaria nossos serviços?&quot;</li>
          <li><strong>Comentário aberto</strong> — &quot;O que mais gostaria de comentar?&quot;</li>
          <li>Botão <strong>Enviar</strong> — registra no banco e mostra agradecimento</li>
        </ul>
        <Callout tipo="info">
          Token só pode ser usado <strong>uma vez</strong>. Após responder, link expira
          e mostra mensagem &quot;Pesquisa já respondida&quot;.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Notificação ao gestor">
        <p>
          Quando cliente responde, sistema:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Marca <strong>respondidaEm</strong> e grava nota + comentário</li>
          <li>Notifica responsável da conta via sino global</li>
          <li>Se nota ≤ 6 (detrator), também notifica gestores/diretores — alerta de cliente em risco</li>
        </ul>
      </Step>

      <h2 className="text-base font-bold pt-2">Análise</h2>

      <Step n={5} cor={MODULO_COLOR} icon={BarChart3} titulo="Dashboard de NPS" rota="/pesquisas">
        <p>
          A página principal tem visão geral:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>NPS atual</strong> — score do mês corrente</li>
          <li><strong>Evolução</strong> — gráfico do NPS mês a mês</li>
          <li><strong>Distribuição</strong> — % de detratores / neutros / promotores</li>
          <li><strong>Taxa de resposta</strong> — quantas pesquisas enviadas tiveram resposta</li>
        </ul>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={MessageSquare} titulo="Ler comentários abertos" rota="aba Respostas">
        <p>
          Lista todas as respostas com nota + comentário. Filtros úteis:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Por <strong>nota</strong> (focar em detratores para ação imediata)</li>
          <li>Por <strong>período</strong></li>
          <li>Por <strong>cliente</strong></li>
        </ul>
        <Callout tipo="dica">
          Atenda <strong>detratores</strong> (notas 0-6) com prioridade alta — uma ligação
          do gestor explicando o caso costuma reverter o score na próxima medição.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Taxa de resposta baixa</p>
            <p className="text-foreground/70">
              Compras automáticas no e-mail muitas vezes ignoram. Tente: 1. Reenvio
              manual após 5 dias sem resposta. 2. Mensagem mais pessoal no e-mail.
              3. WhatsApp do gestor (link via copy + colar).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente respondeu sem comentário</p>
            <p className="text-foreground/70">
              Ligue/escreva pedindo elaboração — comentário aberto é onde está o
              insight real. Boa nota sem detalhe é menos útil que ruim com explicação.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente pediu link mas e-mail não chegou</p>
            <p className="text-foreground/70">
              Em /pesquisas, encontre a pesquisa pendente, clique em &quot;Copiar link&quot; e
              envie por outro canal (WhatsApp, mensagem direta). Token continua válido até
              o cliente responder.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/pesquisas" label="Dashboard NPS" cor={MODULO_COLOR} />
          <QuickLink href="/orcamentos" label="Orçamentos finalizados (trigger)" cor={MODULO_COLOR} />
          <QuickLink href="/faq/processos" label="Fluxo de Processos (origem do trigger)" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
