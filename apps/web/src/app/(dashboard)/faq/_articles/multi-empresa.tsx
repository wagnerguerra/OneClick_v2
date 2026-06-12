'use client'

import {
  Building2, Plus, Users, Database, Filter, Globe,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)'
const FAQ_COLOR = '#0891b2'

export default function FaqMultiEmpresaPage() {
  return (
    <ArticleShell
      modulo="Multi-empresa"
      moduloColor={MODULO_COLOR}
      icon={Building2}
      titulo="Multi-empresa: scope e permissões cruzadas"
      descricao="Como o sistema separa dados por empresa dentro do mesmo tenant e quando dados são compartilhados."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Tenant" texto="A entidade SaaS — um cliente do produto. Isolamento total entre tenants (schema PostgreSQL separado)." />
          <DefRow termo="Empresa" texto="Unidade dentro do tenant. Útil quando o mesmo escritório opera marcas/filiais distintas com clientela separada." />
          <DefRow termo="empresaId NULL" texto="Dados &quot;órfãos&quot; — não pertencem a nenhuma empresa específica. Visíveis a todos do tenant. Geralmente legado." />
          <DefRow termo="isEmpresaMaster" texto="Flag no usuário que dá acesso total a uma empresa (mas não às outras dentro do tenant)." />
          <DefRow termo="Scope automático" texto="Queries do backend automaticamente filtram por empresaId do usuário logado, exceto para isMaster." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Quando usar multi-empresa</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Lightbulb} titulo="Cenários típicos" rota="—">
        <p>Faz sentido configurar múltiplas empresas quando:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>O escritório opera com <strong>marcas distintas</strong> (ex: ACME Contábil + ACME Tax)</li>
          <li>Filiais com <strong>clientela e equipe separadas</strong> (matriz + escritório de outra cidade)</li>
          <li><strong>Sócios com clientela própria</strong> que querem isolamento de relatórios e visibilidade</li>
        </ul>
        <Callout tipo="aviso">
          Se o escritório é <strong>uma estrutura única</strong>, mantenha <em>uma empresa só</em>.
          Multi-empresa adiciona complexidade — útil só quando há necessidade real de isolamento.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Configuração</h2>

      <Step n={2} cor={MODULO_COLOR} icon={Plus} titulo="Cadastrar empresas adicionais" rota="/empresas → + Nova">
        <p>Para cada empresa do tenant:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Razão social</strong> e <strong>CNPJ</strong></li>
          <li><strong>Logo</strong> (aparece em e-mails, PDFs e cabeçalho do dashboard)</li>
          <li><strong>Contatos</strong> e endereço</li>
          <li>Em multi-empresa, sócios e dados podem ser distintos</li>
        </ul>
        <Callout tipo="info">
          Usuário <strong>master do tenant</strong> tem acesso a todas as empresas
          configuradas. Operadores ficam scopados por <code className="text-[11px]">empresaId</code> no
          cadastro deles.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Users} titulo="Vincular usuários a empresas" rota="/usuarios/[id]/editar">
        <p>
          No cadastro de cada usuário, defina o campo <strong>Empresa</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Usuários da empresa A só veem dados da A</li>
          <li>Usuários da empresa B só veem dados da B</li>
          <li><strong>isMaster</strong> ou <strong>Diretor</strong> ignora o scope (vê tudo)</li>
          <li><strong>isEmpresaMaster</strong> dá acesso master apenas dentro da empresa vinculada</li>
        </ul>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Database} titulo="Cadastrar clientes vinculados à empresa" rota="/clientes → + Novo">
        <p>
          Ao cadastrar um cliente, escolha a <strong>empresa do tenant</strong> que vai
          atender. Esse vínculo:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Define quais usuários veem o cliente nas listagens</li>
          <li>Direciona faturamento e BI para a empresa correta</li>
          <li>Pode ser alterado depois (transferência de cliente entre empresas do tenant)</li>
        </ul>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={5} cor={MODULO_COLOR} icon={Filter} titulo="Trocar de empresa (alternar contexto)" rota="dropdown no header">
        <p>
          Para usuários com acesso a múltiplas empresas (isMaster, Diretor):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Dropdown no canto superior do header lista as empresas disponíveis</li>
          <li>Selecione uma → todas as listagens, KPIs e dashboards passam a refletir <em>aquela empresa</em></li>
          <li>Selecione &quot;Todas&quot; → visão consolidada do tenant inteiro</li>
        </ul>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Globe} titulo="Dados &quot;órfãos&quot; (empresaId = NULL)" rota="auditoria">
        <p>
          Em sistemas migrados, alguns registros podem estar com{' '}
          <code className="text-[11px]">empresaId = NULL</code>. Esses dados:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>São visíveis a <strong>todos</strong> os usuários do tenant (não estão scopados)</li>
          <li>Geralmente são legado (criados antes da migração para multi-empresa)</li>
          <li>Auditoria periódica recomendada — atribuir empresa correta ou deletar</li>
        </ul>
        <Callout tipo="aviso">
          Verifique queries customizadas do BI — algumas podem ignorar registros órfãos
          e mostrar números menores que o esperado.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente passa de uma empresa para outra</p>
            <p className="text-foreground/70">
              Edite o cliente e mude o campo Empresa. Histórico, execuções e BI continuam
              vinculados — mas a partir desse momento o novo time da empresa B passa a
              ver e atender o cliente.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Usuário precisa de acesso temporário a outra empresa</p>
            <p className="text-foreground/70">
              Não há &quot;empréstimo&quot; — promova temporariamente para isMaster ou
              isEmpresaMaster da empresa-alvo, ou re-vincule o usuário. Reverter quando
              não precisar mais.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Relatório consolidado do tenant inteiro</p>
            <p className="text-foreground/70">
              No dropdown de empresa do header, escolha &quot;Todas&quot; (disponível só para
              isMaster). Isso mostra dados agregados do tenant inteiro, ignorando o scope
              por empresa.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/empresas" label="Gerenciar empresas" cor={MODULO_COLOR} />
          <QuickLink href="/usuarios" label="Vincular usuários" cor={MODULO_COLOR} />
          <QuickLink href="/clientes" label="Vincular clientes" cor={MODULO_COLOR} />
          <QuickLink href="/faq/usuario-mfa-permissoes" label="Permissões e Master" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
