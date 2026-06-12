'use client'

import {
  FileText, FileBox, FileCheck, Plus, Send, Download, BarChart3,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-comercial, #fb7185)'
const FAQ_COLOR = '#0891b2'

export default function FaqContratosPage() {
  return (
    <ArticleShell
      modulo="Contratos"
      moduloColor={MODULO_COLOR}
      icon={FileText}
      titulo="Contratos: cláusulas, modelos e geração"
      descricao="Como cadastrar cláusulas reutilizáveis, montar modelos de contrato e gerar contratos prontos para clientes."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Cláusula" texto="Bloco de texto reutilizável (objeto do contrato, prazo, valor, foro). Cadastrada uma vez, usada em vários modelos." />
          <DefRow termo="Modelo de contrato" texto="Conjunto ordenado de cláusulas. Ex: &quot;Contrato Mensal Padrão&quot; pode ter 12 cláusulas em ordem específica." />
          <DefRow termo="Contrato" texto="Documento concreto gerado a partir de um modelo + cliente. Substitui placeholders por dados reais." />
          <DefRow termo="Placeholders" texto={<>Variáveis nas cláusulas como <code className="text-[11px]">{'{{cliente.razaoSocial}}'}</code>, <code className="text-[11px]">{'{{contrato.valor}}'}</code>. Resolvidas na geração.</>} />
          <DefRow termo="Vinculação a serviços" texto="Cada contrato pode ter serviços de catálogo associados — usado em faturamento recorrente e relatórios." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup (uma vez)</h2>

      <Step n={1} cor={MODULO_COLOR} icon={FileCheck} titulo="Cadastrar cláusulas" rota="/clausulas">
        <p>
          Em <strong>Comercial → Contratos → Cláusulas</strong>, cadastre todos os blocos
          de texto recorrentes:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cláusula de objeto (o que o escritório se propõe a fazer)</li>
          <li>Cláusula de prazo e vigência</li>
          <li>Cláusula de valor e reajuste</li>
          <li>Cláusula de obrigações do contratado / contratante</li>
          <li>Foro, rescisão, anexos</li>
        </ul>
        <Callout tipo="dica">
          Use <strong>placeholders</strong> dentro do texto da cláusula:
          <code className="text-[11px]">{'{{cliente.razaoSocial}}'}</code>, <code className="text-[11px]">{'{{contrato.valor}}'}</code>,
          {' '}<code className="text-[11px]">{'{{contrato.dataInicio}}'}</code>. Eles são preenchidos automaticamente na geração.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={FileBox} titulo="Montar modelos de contrato" rota="/contrato-templates">
        <p>
          Combine cláusulas em modelos. Tipos comuns:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Mensal padrão</strong> — para clientes recorrentes do escritório</li>
          <li><strong>Mensal Simples Nacional</strong> — variação com cláusulas adaptadas ao Simples</li>
          <li><strong>Eventual / projetos</strong> — para serviços pontuais</li>
          <li><strong>Constituição</strong> — para clientes em abertura de empresa</li>
        </ul>
        <Callout tipo="info">
          Cada modelo tem <strong>ordem</strong> de cláusulas — drag-and-drop para reordenar.
          Pode incluir cláusulas opcionais que entram só se atendem certa condição na geração
          (futuro: hoje todas entram).
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Plus} titulo="Gerar um contrato" rota="/contratos → + Novo">
        <p>Para cada novo contrato:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Selecione o <strong>cliente</strong></li>
          <li>Escolha o <strong>modelo</strong> apropriado</li>
          <li>Preencha campos específicos (valor, data início, prazo, observações)</li>
          <li>Vincule <strong>serviços de catálogo</strong> que o contrato cobre (faturamento)</li>
          <li>Clique <strong>Gerar</strong> — sistema substitui placeholders e produz o PDF final</li>
        </ul>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Download} titulo="Baixar e enviar ao cliente">
        <p>
          PDF gerado fica armazenado e disponível para download a qualquer momento.
          Boas práticas:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Revisar antes de enviar — placeholders mal preenchidos saem como
            <code className="text-[11px]">{'{{...}}'}</code> no documento final</li>
          <li>Enviar via e-mail (anexo) ou plataforma de assinatura (DocuSign, ClickSign, ZapSign)</li>
          <li>Após assinatura, fazer upload do PDF assinado de volta — fica anexado ao contrato</li>
        </ul>
        <Callout tipo="aviso">
          Integração nativa com plataformas de assinatura digital ainda <strong>não está
          implementada</strong> — fluxo é manual nesta versão.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={BarChart3} titulo="Relatórios e gráficos" rota="/graficos-contrato-erp · /contratos-relatorios">
        <p>Após múltiplos contratos cadastrados:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Gráficos Contrato × ERP</strong> — compara valor contratado com faturamento real (SCI)</li>
          <li><strong>Relatórios de Contratos</strong> — listagem por vigência, cliente, valor, status</li>
          <li><strong>Custeio por Cliente</strong> (em /custeio-clientes) — análise de rentabilidade</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente pede ajuste em uma cláusula específica</p>
            <p className="text-foreground/70">
              Crie uma <strong>variante</strong> da cláusula (ex: &quot;Cláusula de prazo —
              90 dias&quot; vs padrão de 30) e use-a em um modelo customizado para o cliente.
              Não edite a cláusula original.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Reajuste anual coletivo</p>
            <p className="text-foreground/70">
              Use o relatório de contratos por vigência para identificar contratos a
              renovar. Para cada um, gere novo contrato com valor reajustado e o cliente
              assina o aditivo.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Placeholder não foi substituído</p>
            <p className="text-foreground/70">
              Geralmente é nome do placeholder errado (ex: <code className="text-[11px]">{'{{cliente.razao_social}}'}</code>{' '}
              em vez de <code className="text-[11px]">{'{{cliente.razaoSocial}}'}</code>). Verifique convenção camelCase.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/contratos" label="Listar contratos" cor={MODULO_COLOR} />
          <QuickLink href="/clausulas" label="Gerenciar cláusulas" cor={MODULO_COLOR} />
          <QuickLink href="/contrato-templates" label="Modelos de contrato" cor={MODULO_COLOR} />
          <QuickLink href="/graficos-contrato-erp" label="Contrato × ERP" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
