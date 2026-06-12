'use client'

import {
  Handshake, Plus, FileSearch, Users, MapPin, Phone, Network,
  Lightbulb, Info, ArrowRight, FileText, Building2, Briefcase,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)
const FAQ_COLOR = '#0891b2'

export default function FaqClienteOnboardPage() {
  return (
    <ArticleShell
      modulo="Clientes"
      moduloColor={MODULO_COLOR}
      icon={Handshake}
      titulo="Cliente: cadastro completo, áreas contratadas e responsáveis"
      descricao="Do CNPJ ao contrato — cadastrar cliente, definir áreas contratadas, sócios, contatos e integração ERP."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Cliente vs Lead" texto={<>Cliente real (<code className="text-[11px]">isLead=false</code>) tem contrato e atendimento. Lead é prospect em qualificação no CRM.</>} />
          <DefRow termo="Situação" texto="MENSAL (cobrança recorrente) · EVENTUAL (serviços pontuais) · INATIVO (sem operação atual)." />
          <DefRow termo="Áreas contratadas" texto="Quais áreas do escritório atendem o cliente (Contábil, Fiscal, Trabalhista) — cada uma com responsável próprio." />
          <DefRow termo="Sócios" texto="Quadro societário — usado em emissão de documentos, procurações e ECF." />
          <DefRow termo="Integração ERP" texto="Vínculo com SCI / Omie / OneClick V1 — alimenta BI Faturamento, Balancete, Folha." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Cadastro inicial</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Plus} titulo="Criar cliente" rota="/clientes → + Novo Cliente">
        <p>
          Em <strong>Cadastros → Clientes</strong>, clique em <strong>+ Novo Cliente</strong>.
          O form é dividido em abas — começa pelos dados básicos:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>CNPJ ou CPF</strong> — campo principal; pode digitar e clicar em &quot;Buscar&quot; para preencher via BrasilAPI</li>
          <li><strong>Razão social</strong> e <strong>nome fantasia</strong></li>
          <li><strong>Situação</strong> (MENSAL / EVENTUAL) — define padrão de cobrança</li>
          <li><strong>Regime tributário</strong> (Simples / Presumido / Real) e <strong>tributação</strong></li>
          <li><strong>Categoria</strong> (livre — &quot;Comércio&quot;, &quot;Serviços&quot;) e <strong>tipo de cliente</strong></li>
        </ul>
        <Callout tipo="dica">
          Use o botão <strong>&quot;Buscar CNPJ&quot;</strong> ao digitar — preenche
          automaticamente razão social, endereço, CNAE principal e secundários da Receita.
          Economiza tempo e evita erros de digitação.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={MapPin} titulo="Endereço e contato" rota="aba Endereço">
        <p>Campos:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>CEP</strong> — também tem busca automática (preenche logradouro, bairro, cidade, UF)</li>
          <li>Logradouro, número, complemento, bairro</li>
          <li>Telefone e e-mail principal</li>
        </ul>
        <Callout tipo="info">
          Telefone e e-mail aqui são os <strong>oficiais</strong> da empresa. Para múltiplos
          contatos por departamento, use a aba <strong>Contatos</strong> (passo 4).
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Briefcase} titulo="Áreas contratadas e responsáveis" rota="aba Serviços">
        <p>
          Esta aba é <strong>essencial</strong> — define quem atende o cliente em cada área:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Marque as áreas contratadas (Contábil, Fiscal, Trabalhista, Societário, Legalização)</li>
          <li>Para cada uma, defina o <strong>responsável</strong> (usuário/colaborador)</li>
          <li>Opcionalmente registre data de início, observações específicas da área</li>
        </ul>
        <Callout tipo="info">
          A combinação <strong>cliente + área + responsável</strong> alimenta a regra de
          visibilidade de execuções: o responsável vê em <code className="text-[11px]">/meus-servicos</code>
          tudo do cliente naquela área específica. Sem isso, o painel fica vazio.
        </Callout>
        <Callout tipo="aviso">
          Antes de marcar áreas, certifique-se que existem usuários cadastrados com
          <strong> Área</strong> e <strong>Cargo</strong> configurados em /usuarios.
          Sem isso, o select de responsável fica vazio.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Phone} titulo="Contatos por departamento" rota="aba Contatos">
        <p>
          Cada cliente normalmente tem múltiplos contatos — financeiro, RH, sócios.
          Cadastre cada um com:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Nome, cargo, telefone, e-mail</li>
          <li><strong>Tipo</strong> (Financeiro, RH, Comercial, Sócio) — usado para roteamento de e-mails</li>
          <li><strong>Recebe e-mails de:</strong> orçamentos, NFs, holerites, etc — granular por contato</li>
        </ul>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Users} titulo="Quadro societário" rota="aba Sócios">
        <p>
          Cadastre cada sócio com nome, CPF, percentual de participação, qualificação
          e data de entrada. Usado em:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Emissão de documentos legais (procurações, contratos sociais)</li>
          <li>ECF e ECD (escrituração)</li>
          <li>Verificação automática via consulta CNPJ (compara com dados da Receita)</li>
        </ul>
        <Callout tipo="info">
          O botão <strong>&quot;Sincronizar com Receita&quot;</strong> compara o quadro
          local com o oficial da RFB e destaca divergências.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Configurações avançadas</h2>

      <Step n={6} cor={MODULO_COLOR} icon={Network} titulo="Integração com ERP externo" rota="aba Integrações">
        <p>
          Para clientes cujos dados contábeis vêm de ERP externo:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>SCI</strong> (Firebird) — vincule pelo <code className="text-[11px]">idSistema</code> do SCI; alimenta BI Faturamento e Balancete</li>
          <li><strong>Omie</strong> — informe <code className="text-[11px]">idOmie</code> e <code className="text-[11px]">omieEmpresa</code></li>
          <li><strong>OneClick V1</strong> — <code className="text-[11px]">idOneClick</code> para importação histórica</li>
        </ul>
        <Callout tipo="dica">
          Sem o <code className="text-[11px]">idSistema</code> SCI preenchido, o cliente
          não aparece nos gráficos de faturamento e nem importa balancete automaticamente.
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={FileSearch} titulo="Dados fiscais e legalização" rota="aba Legalização">
        <p>Campos relevantes para serviços fiscais e geração de documentos:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>NIRE</strong>, <strong>RG Edificação</strong>, <strong>Código Simples</strong></li>
          <li><strong>CNAE principal</strong> e secundários (preenchidos pela busca CNPJ)</li>
          <li>Inscrição estadual / municipal</li>
          <li>Dados de bombeiros (ocupação, metragem, projeto, capacidade) — para alvará</li>
        </ul>
      </Step>

      <Step n={8} cor={MODULO_COLOR} icon={FileText} titulo="Vincular contrato">
        <p>
          Após cadastro completo, gere o contrato em <strong>/contratos → Novo</strong>{' '}
          escolhendo um modelo e o cliente. Cláusulas e valores se ajustam automaticamente.
        </p>
        <Callout tipo="info">
          Veja <a className="text-emerald-600 hover:underline" href="/faq/contratos">Contratos: cláusulas, modelos e geração</a>{' '}
          (em produção) para o passo-a-passo de geração.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente sem CNPJ (PF / autônomo)</p>
            <p className="text-foreground/70">
              Mude o <strong>tipoDocumento</strong> para CPF e preencha. Várias funcionalidades
              fiscais (CND, e-CAC, etc) ainda funcionam — só não há consulta CNAE/Simples.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente vindo de outra contabilidade</p>
            <p className="text-foreground/70">
              Cadastre normalmente e use o serviço <strong>&quot;Transferência de Contabilidade&quot;</strong>{' '}
              (vide <a className="text-emerald-600 hover:underline" href="/faq/processos">Fluxo de Processos</a>) —
              cobre o ofício, recebimento de arquivos antigos e atualização de contador na Receita.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente desligado</p>
            <p className="text-foreground/70">
              Mude <strong>situação</strong> para INATIVO + preencha <strong>data de saída</strong>.
              <strong>Não delete</strong> — preserva histórico de execuções, faturamento e
              auditoria. Soft-delete via <code className="text-[11px]">isActive=false</code> também
              funciona se preferir tirar da listagem padrão.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/clientes" label="Listar clientes" cor={MODULO_COLOR} />
          <QuickLink href="/clientes/new" label="Novo cliente" cor={MODULO_COLOR} />
          <QuickLink href="/areas" label="Configurar áreas e líderes" cor={MODULO_COLOR} />
          <QuickLink href="/usuarios" label="Cadastrar responsáveis" cor={MODULO_COLOR} />
        </div>
        <Callout tipo="aviso">
          Antes do primeiro cliente: garanta que <strong>Áreas</strong> e <strong>Usuários</strong> estão
          cadastrados — sem isso, áreas contratadas e responsáveis não funcionam.
        </Callout>
      </Section>
    </ArticleShell>
  )
}
