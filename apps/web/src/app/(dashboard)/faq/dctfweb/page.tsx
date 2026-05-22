'use client'

import {
  ListChecks, Calendar, RefreshCw, FileText, CheckCircle2, Download,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #0ea5e9)' // sky (Fiscal)
const FAQ_COLOR = '#0891b2'

export default function FaqDctfwebPage() {
  return (
    <ArticleShell
      modulo="DCTFWeb"
      moduloColor={MODULO_COLOR}
      icon={ListChecks}
      titulo="DCTFWeb: sincronização e conferência mensal"
      descricao="Sincronizar débitos da DCTFWeb por competência, baixar relatórios e conferir DARFs gerados."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="DCTFWeb" texto="Declaração de Débitos e Créditos Tributários Federais — substituiu a antiga DCTF e GFIP. Gerada mensalmente a partir de eSocial + EFD-Reinf." />
          <DefRow termo="Competência" texto="Mês de referência (ex: 2026-04). Cada cliente tem 1 DCTFWeb por mês." />
          <DefRow termo="Status" texto="Em andamento (em apuração) · Transmitida (declaração entregue) · Retificada · Sem movimento." />
          <DefRow termo="DARF" texto="Documento de arrecadação federal gerado pela DCTFWeb. Cada código de receita pode ter um DARF próprio." />
          <DefRow termo="Relatório completo" texto="PDF detalhado com todos os débitos da competência — usado para conferência interna e cobrança ao cliente." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Operação mensal</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Calendar} titulo="Selecionar competência" rota="/dctfweb">
        <p>
          A página principal mostra dropdown de <strong>competência</strong> (formato AAAA-MM).
          Selecione a competência atual ou histórica.
        </p>
        <Callout tipo="dica">
          DCTFWeb tem prazo de entrega no <strong>15º dia útil do mês seguinte</strong>.
          Trabalhe com folga: sincronize logo no dia 5-7 do mês para ter tempo de
          conferir e ajustar antes do vencimento.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={RefreshCw} titulo="Sincronizar débitos" rota="botão Sincronizar">
        <p>
          Para a competência selecionada, dispare a sincronização. O sistema:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Conecta na DCTFWeb (via certificado A1 + procuração e-CAC)</li>
          <li>Busca débitos da competência para todos os clientes ativos</li>
          <li>Salva snapshots no banco — totais por código de receita, valor, multa, juros</li>
          <li>Marca status: Transmitida / Em andamento / Sem movimento</li>
        </ul>
        <Callout tipo="info">
          Roda em fila — pode demorar alguns minutos para tenants com muitos clientes.
          Acompanhe progresso no toast/notificação.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={FileText} titulo="Conferir débitos por cliente" rota="tabela do /dctfweb">
        <p>
          A tabela lista cada cliente com colunas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Cliente</strong> — razão social + CNPJ</li>
          <li><strong>Status</strong> — Transmitida / Em andamento / Sem movimento</li>
          <li><strong>Total a pagar</strong> — soma de todos os DARFs da competência</li>
          <li><strong>Vencimentos</strong> — datas dos DARFs (geralmente dia 20)</li>
          <li><strong>Ações</strong> — Relatório Completo, DARF individual, Reabrir</li>
        </ul>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Download} titulo="Baixar relatórios e DARFs" rota="menu de ações por linha">
        <p>Para cada linha:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Relatório Completo</strong> — PDF detalhado com débitos por código
            (101, 1138, 1141, etc), bases de cálculo e composição
          </li>
          <li>
            <strong>DARFs individuais</strong> — um arquivo por código de receita,
            com valor, juros, multa e código de barras para pagamento
          </li>
          <li>
            <strong>Comprovante de transmissão</strong> — recibo da entrega
          </li>
        </ul>
        <Callout tipo="dica">
          Use a ação <strong>&quot;Baixar todos&quot;</strong> em massa para encaminhar a
          múltiplos clientes de uma vez. Sistema agrupa em ZIP por cliente.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Marcar como conferida" rota="botão Conciliar">
        <p>
          Após conferir os débitos com o cliente, marque a linha como <strong>conciliada</strong>.
          A flag é interna (não afeta a Receita) — serve apenas para rastreamento de quais
          competências já foram revisadas pela equipe.
        </p>
        <Callout tipo="info">
          Em períodos de fechamento, o filtro &quot;Não conciliadas&quot; ajuda a focar
          no que ainda precisa de atenção.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">DCTFWeb não sincroniza para um cliente</p>
            <p className="text-foreground/70">
              1. Confirme procuração e-CAC ativa e certificado A1 do escritório válido.
              2. Cliente pode estar &quot;Sem movimento&quot; — não há débito a buscar (situação normal).
              3. Veja log de erros na aba específica para detalhe técnico.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Valor diverge da folha do cliente</p>
            <p className="text-foreground/70">
              DCTFWeb soma <strong>eSocial + Reinf</strong>. Se o cliente envia folha externa,
              pode haver descompasso. Confronte com o relatório completo (códigos por
              competência) e ajuste a apuração antes do dia 15 (transmissão).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente quer DARF antecipado</p>
            <p className="text-foreground/70">
              Após sincronização (mesmo se ainda não transmitida), o DARF preliminar
              pode ser baixado. Atenção: valores podem mudar após retificação — sempre
              entregue ao cliente após transmissão final.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Retificação de competência fechada</p>
            <p className="text-foreground/70">
              Após retificar no e-CAC, dispare nova sincronização da competência —
              o sistema sobrescreve com os valores atualizados. Status muda para
              <strong> &quot;Retificada&quot;</strong>.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/dctfweb" label="DCTFWeb mensal" cor={MODULO_COLOR} />
          <QuickLink href="/folha-pagamento" label="Importação de folha" cor={MODULO_COLOR} />
          <QuickLink href="/configuracoes/certificado" label="Certificado e SERPRO" cor={MODULO_COLOR} />
          <QuickLink href="/faq/situacao-fiscal" label="Situação Fiscal SERPRO" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
