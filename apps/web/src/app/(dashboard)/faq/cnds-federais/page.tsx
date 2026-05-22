'use client'

import {
  Shield, Calendar, Search, AlertTriangle, RefreshCw, Download,
  Lightbulb, Info, ArrowRight, Bell, Eye, Settings, Clock, CheckCircle2,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #6366f1)' // indigo (Certidões)
const FAQ_COLOR = 'var(--mod-faq, #0891b2)'

export default function FaqCndsFederaisPage() {
  return (
    <ArticleShell
      modulo="Certidões Federais"
      moduloColor={MODULO_COLOR}
      icon={Shield}
      titulo="CND Federais: consulta automática, expiração e download"
      descricao="Configurar agendamento de consulta de CNDs federais (Receita/PGFN, FGTS, CNDT) e gerenciar vencimentos."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="CND" texto="Certidão Negativa de Débitos. Atesta inexistência de pendências fiscais com determinado órgão." />
          <DefRow termo="CND Federal (RFB/PGFN)" texto="Conjunta da Receita Federal e PGFN. Validade 6 meses. Necessária em licitações, financiamentos, alvarás." />
          <DefRow termo="CRF FGTS" texto="Certificado de Regularidade do FGTS — Caixa Econômica. Validade 30 dias." />
          <DefRow termo="CNDT" texto="Certidão Negativa de Débitos Trabalhistas — TST. Validade 180 dias." />
          <DefRow termo="Status da certidão" texto="Negativa (sem débitos) · Positiva (com débitos) · Positiva c/ Efeitos de Negativa (débitos parcelados) · Não emitida (erro na consulta)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup inicial</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings} titulo="Pré-requisitos" rota="—">
        <p>Antes de configurar o agendamento, garanta:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clientes cadastrados com <strong>CNPJ correto</strong> e situação <strong>MENSAL ou EVENTUAL</strong> (clientes inativos são pulados)</li>
          <li>Para certidões que exigem certificado (caso de algumas estaduais): <strong>Certificado A1</strong> em /gestao-certificados</li>
          <li>Credenciais SERPRO configuradas em /configuracoes/certificado (necessárias para algumas APIs)</li>
        </ul>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Calendar} titulo="Configurar agendamento automático" rota="/certidoes-cnd/configuracoes">
        <p>
          Em <strong>Legalização → Certidões e Alvarás → Configurações</strong>, defina:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Frequência</strong> — geralmente semanal (CND Federal) ou diária (FGTS, vence rápido)</li>
          <li><strong>Horário</strong> — preferencialmente fora do horário comercial</li>
          <li><strong>Tipos a consultar</strong> — Federal, FGTS, CNDT (cada uma pode ter cadência diferente)</li>
          <li><strong>Notificações</strong> — quem recebe alerta de vencendo / vencida</li>
        </ul>
        <Callout tipo="dica">
          Cadência sugerida: <strong>CND Federal</strong> 1×/semana (validade 6 meses);{' '}
          <strong>FGTS</strong> 2×/semana (validade 30 dias, alta rotatividade);{' '}
          <strong>CNDT</strong> 1×/mês (validade 180 dias, raramente muda).
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação diária</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Eye} titulo="Visualizar status no dashboard" rota="Dashboard widget CND Federais">
        <p>O widget de CND Federais mostra contadores por status:</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 border-emerald-200 text-emerald-700">Negativa</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">Positiva c/ Ef.</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-orange-50 border-orange-200 text-orange-700">Vencendo</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-red-50 border-red-200 text-red-700">Não emitida</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-gray-50 border-gray-200 text-gray-700">Vencida</Badge>
        </div>
        <Callout tipo="info">
          <strong>Vencendo</strong> = nos próximos 15 dias. <strong>Não emitida</strong>{' '}
          = falha técnica na consulta (re-tenta automaticamente). <strong>Positiva</strong>{' '}
          = cliente tem débitos — comunique antes que afete licitações ou refinanciamentos.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Search} titulo="Listar e filtrar certidões" rota="/certidoes-cnd → aba Federal">
        <p>A página tem uma aba para cada tipo de certidão. Filtros úteis:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Status</strong> — Negativa, Positiva, Não emitida, Vencendo, Vencida</li>
          <li><strong>Cliente</strong> — busca por razão social ou CNPJ</li>
          <li><strong>Período de emissão</strong> — janela de datas</li>
          <li><strong>Empresa</strong> — em multi-empresa, scope automático</li>
        </ul>
        <Callout tipo="dica">
          Clique em &quot;Vencendo&quot; no widget do dashboard para abrir a lista
          já pré-filtrada — atalho para a ação imediata.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={RefreshCw} titulo="Forçar consulta manual" rota="botão Consultar (linha ou em massa)">
        <p>Além do agendamento, você pode forçar consulta de:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Cliente específico</strong> — botão na linha da tabela</li>
          <li><strong>Em massa</strong> — checkbox múltiplo + ação &quot;Consultar selecionadas&quot;</li>
          <li><strong>Todos da empresa</strong> — botão no topo da página (cuidado em tenants grandes)</li>
        </ul>
        <Callout tipo="info">
          Consultas rodam em <strong>fila</strong> — não trava a UI. Erros vão para os logs;
          retry automático é tentado em horas posteriores.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Download} titulo="Baixar PDF da certidão" rota="ícone na linha">
        <p>
          Para certidões <strong>Negativas</strong> e <strong>Positivas c/ Efeitos</strong>,
          o sistema arquiva o PDF original. Download disponível por:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Linha individual — ícone <Download className="inline h-3 w-3" /></li>
          <li>Em lote — selecionar múltiplas + &quot;Baixar PDFs&quot; (ZIP)</li>
        </ul>
        <Callout tipo="aviso">
          PDFs <strong>vencidos</strong> ainda ficam disponíveis — útil para auditoria,
          mas não para apresentação a órgãos públicos. Sempre confira a data antes de
          enviar a clientes.
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={Bell} titulo="Tratativa para certidões positivas">
        <p>
          Quando o status retorna <strong>Positiva</strong> ou <strong>Positiva c/ Efeitos</strong>,
          o cliente tem débitos:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Sistema cria notificação automática para o responsável fiscal</li>
          <li>Acesse o link da consulta para ver os débitos detalhados (Receita)</li>
          <li>Alinhe parcelamento ou quitação com o cliente</li>
          <li>Ao parcelar, próxima consulta automaticamente atualiza para &quot;Positiva c/ Efeitos&quot; (que vale como negativa)</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Status &quot;Não emitida&quot; persistente</p>
            <p className="text-foreground/70">
              1. Verifique CNPJ do cliente (sem dígito errado). 2. Confira se a Receita está
              fora do ar (status RFB no momento). 3. Para FGTS, confirme que cliente tem
              folha cadastrada (CRF não é emitida sem trabalhadores).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente novo sem CND</p>
            <p className="text-foreground/70">
              Adicione manualmente em <strong>+ Nova consulta</strong> ou aguarde a próxima
              execução agendada — clientes novos entram automaticamente na próxima janela.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Quero ser avisado de vencimentos</p>
            <p className="text-foreground/70">
              Configure notificações em <code className="text-[11px]">/certidoes-cnd/configuracoes</code> —
              alerta dispara <strong>15 dias antes do vencimento</strong> (configurável).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">CNDs estaduais e municipais</p>
            <p className="text-foreground/70">
              Cobertas em outro artigo (em produção) — funcionam de forma similar mas
              com particularidades por estado/município, e algumas exigem certificado A1.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/certidoes-cnd" label="Listar certidões" cor={MODULO_COLOR} />
          <QuickLink href="/certidoes-cnd/configuracoes" label="Configurar agendamento" cor={MODULO_COLOR} />
          <QuickLink href="/gestao-certificados" label="Certificados A1 vinculados" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Cadastros de clientes" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
