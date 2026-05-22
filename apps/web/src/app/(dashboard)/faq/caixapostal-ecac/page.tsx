'use client'

import {
  Mail, Calendar, Search, Star, AlertTriangle, RefreshCw,
  Lightbulb, Info, ArrowRight, Bell, Eye, Archive, Settings,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #0ea5e9)' // sky
const FAQ_COLOR = '#0891b2'

export default function FaqCaixaPostalEcacPage() {
  return (
    <ArticleShell
      modulo="Caixa Postal e-CAC"
      moduloColor={MODULO_COLOR}
      icon={Mail}
      titulo="Caixa Postal e-CAC: agendamento, leitura e alertas"
      descricao="Configurar consulta automática à caixa postal da Receita, ler e classificar mensagens, marcar importantes e priorizar P0/P1."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Caixa Postal e-CAC" texto="Sistema da Receita Federal onde mensagens fiscais oficiais são entregues — intimações, comunicados, decisões." />
          <DefRow termo="Certificado A1" texto="Necessário para o sistema acessar a caixa postal em nome do cliente. Cadastrado em /gestao-certificados." />
          <DefRow termo="Procuração e-CAC" texto="Cliente outorga procuração ao escritório no e-CAC para que o certificado A1 do escritório possa abrir a caixa do cliente." />
          <DefRow termo="Prioridade P0–P3" texto="P0 = urgente (intimação fiscal); P1 = alta (resposta exigida); P2 = média (informativa); P3 = baixa (rotineira)." />
          <DefRow termo="Scheduler" texto="Job que roda diariamente buscando mensagens novas em todos os clientes ativos com certificado válido." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup inicial (master)</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Settings} titulo="Verificar pré-requisitos por cliente" rota="/clientes/[id]">
        <p>Para cada cliente que terá leitura automática, confirme:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Certificado A1 (PFX) cadastrado e <strong>válido</strong> em <code className="text-[11px]">/gestao-certificados</code></li>
          <li>Procuração e-CAC outorgada ao CNPJ/CPF do certificado (verificar no portal e-CAC)</li>
          <li>Cliente <strong>ativo</strong> (situação MENSAL ou EVENTUAL — não desativado)</li>
        </ul>
        <Callout tipo="aviso">
          Sem procuração válida, a leitura retorna erro e a próxima execução é re-tentada.
          Erros consecutivos pausam temporariamente o cliente.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Calendar} titulo="Configurar o agendamento" rota="/caixapostal/configuracoes">
        <p>
          Em <strong>Fiscal → Caixa Postal e-CAC → Configurações</strong>, defina:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Horário de execução</strong> (ex: todo dia às 7h)</li>
          <li><strong>Quantidade de tentativas</strong> em caso de falha (default: 3)</li>
          <li><strong>Notificações</strong> — quem recebe alertas P0/P1 (responsável fiscal, gestor)</li>
          <li><strong>Regras de classificação automática</strong> — palavras-chave que mapeiam para prioridade</li>
        </ul>
        <Callout tipo="dica">
          Rode primeiro <strong>manualmente</strong> em alguns clientes pra calibrar regras
          de classificação antes de ligar a execução agendada para o tenant todo.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação diária</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Bell} titulo="Verificar alertas P0/P1 prioritários" rota="Dashboard widget Caixa Postal">
        <p>
          O widget no Dashboard mostra contadores por prioridade:
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline" className="text-[10px] h-5 bg-red-50 border-red-200 text-red-700">P0 · Urgente</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-orange-50 border-orange-200 text-orange-700">P1 · Alta</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">P2 · Média</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-gray-50 border-gray-200 text-gray-700">P3 · Baixa</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-300 text-amber-700">★ Importantes</Badge>
        </div>
        <Callout tipo="aviso">
          P0 e P1 normalmente exigem <strong>resposta em até 30 dias corridos</strong> sob
          pena de revelia. Trate <em>antes</em> dos demais.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Eye} titulo="Ler e classificar mensagens" rota="/caixapostal">
        <p>
          A listagem mostra mensagens de todos os clientes do tenant. Filtros úteis:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Não lidas</strong> — apenas mensagens ainda não abertas</li>
          <li><strong>Por cliente</strong> — busca por razão social ou CNPJ</li>
          <li><strong>Por prioridade</strong> — focar em P0/P1</li>
          <li><strong>Por período</strong> — janela específica</li>
        </ul>
        <p>Ao clicar em uma mensagem:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Conteúdo completo é exibido + anexos PDF para download</li>
          <li>Status muda automaticamente para <strong>Lida</strong></li>
          <li>Pode <Star className="inline h-3 w-3 text-amber-500" /> <strong>marcar como importante</strong> — fica salva mesmo após arquivar</li>
          <li>Reclassificar prioridade manualmente se a regra automática errou</li>
        </ul>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={RefreshCw} titulo="Forçar consulta manual" rota="/caixapostal → botão Executar">
        <p>
          Além do agendamento, você pode forçar a leitura imediata de:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Todos os clientes</strong> — útil após mudanças de procuração em massa</li>
          <li><strong>Cliente específico</strong> — para diagnosticar erros ou confirmar recebimento</li>
        </ul>
        <Callout tipo="info">
          A execução manual roda em <strong>fila</strong> — não trava a UI.
          Logs ficam disponíveis em uma aba específica para debug.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Archive} titulo="Limpar e arquivar">
        <p>
          Mensagens P3 (baixa prioridade, rotineiras) podem ser <strong>arquivadas em lote</strong>{' '}
          para limpar a visualização. Importantes (★) <em>permanecem visíveis</em> mesmo após arquivar.
        </p>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente não está sendo consultado</p>
            <p className="text-foreground/70">
              1. Verifique se o certificado está válido e ativo. 2. Confirme que existe
              procuração e-CAC outorgada ao CNPJ/CPF do certificado. 3. Veja a aba
              <strong> Logs</strong> para erros recentes. 4. Erros HTTP 401/403 geralmente
              indicam procuração revogada/expirada.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Mensagem urgente não foi classificada como P0</p>
            <p className="text-foreground/70">
              Reclassifique manualmente para P0 e adicione palavras-chave do título nas
              <strong> Regras de classificação</strong> em /caixapostal/configuracoes para
              que mensagens similares no futuro sejam pegas automaticamente.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Quero ser avisado fora do horário</p>
            <p className="text-foreground/70">
              Configure notificações por e-mail para P0/P1 em <code className="text-[11px]">/caixapostal/configuracoes</code>.
              Sino in-app cobre o horário comercial; e-mail garante visibilidade fora dele.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/caixapostal" label="Abrir caixa postal" cor={MODULO_COLOR} />
          <QuickLink href="/caixapostal/configuracoes" label="Configurar agendamento" cor={MODULO_COLOR} />
          <QuickLink href="/gestao-certificados" label="Gerenciar certificados A1" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Ver clientes" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
