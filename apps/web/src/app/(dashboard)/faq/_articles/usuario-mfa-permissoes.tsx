'use client'

import {
  UserCog, UserPlus, Mail, Shield, KeyRound, ShieldCheck, Copy,
  Lightbulb, Info, ArrowRight, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)
const FAQ_COLOR = '#0891b2'

export default function FaqUsuarioMfaPermissoesPage() {
  return (
    <ArticleShell
      modulo="Usuários · MFA · Permissões"
      moduloColor={MODULO_COLOR}
      icon={UserCog}
      titulo="Usuários: convite, MFA e permissões"
      descricao="Como criar novos usuários, exigir autenticação em dois fatores e configurar permissões granulares por módulo."
    >
      {/* Glossário */}
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Master / EmpresaMaster" texto="Usuários com acesso total — não respeitam matrix de permissões. Use com parcimônia." />
          <DefRow termo="Role" texto={<>Cargo organizacional: <code className="text-[11px]">DIRETOR · COORDENADOR · GESTOR · COLABORADOR_INTERNO · PRESTADOR_SERVICO · COLABORADOR_CLIENTE</code></>} />
          <DefRow termo="Profile" texto={<>Perfil de permissões: <code className="text-[11px]">OPERADOR · SUPERVISOR · GERENTE · ADMIN</code> — usado como atalho para definir um conjunto de permissões.</>} />
          <DefRow termo="MFA / TOTP" texto="Segundo fator via app autenticador (Google Authenticator, Authy, 1Password). Cada usuário ativa o seu próprio em /perfil." />
          <DefRow termo="Permissão por módulo" texto={<>Trinca <code className="text-[11px]">canRead · canWrite · canDelete</code> por slug do módulo (ex: <code className="text-[11px]">clientes</code>, <code className="text-[11px]">orcamentos</code>).</>} />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Passo a passo</h2>

      <Step n={1} cor={MODULO_COLOR} icon={UserPlus} titulo="Criar o usuário" rota="/usuarios → Novo Usuário">
        <p>
          No menu <strong>Cadastros → Usuários</strong>, clique em <strong>Novo Usuário</strong>.
          O form é dividido em abas — apenas <em>Dados básicos</em> é obrigatório:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Nome completo</strong> e <strong>e-mail</strong> (será o login)</li>
          <li><strong>Empresa</strong> — define o tenant em que o usuário opera (multi-empresa)</li>
          <li><strong>Área</strong> — usada para visibilidade de execuções e relatórios por área</li>
          <li><strong>Cargo (Role)</strong> e <strong>Perfil (Profile)</strong> — usados em RBAC</li>
          <li><strong>Senha temporária</strong> — pode usar &quot;Gerar senha aleatória&quot; e enviar ao usuário</li>
        </ul>
        <Callout tipo="info">
          O usuário pode aparecer também em <strong>Colaboradores</strong> — basta marcar
          <strong> &quot;Exibir como colaborador&quot;</strong> nas abas adicionais.
          Modelo unificado: User e Colaborador são a mesma entidade.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Shield} titulo="Configurar permissões granulares" rota="/usuarios/[id]/editar">
        <p>
          Após criar, abra o detalhe do usuário e vá na aba <strong>Permissões</strong>. A
          matriz mostra cada módulo do sistema com 3 toggles:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1"><Badge variant="outline" className="text-[10px] h-4 mr-1">canRead</Badge>Leitura</p>
            <p className="text-foreground/70">Listar e consultar registros do módulo</p>
          </div>
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1"><Badge variant="outline" className="text-[10px] h-4 mr-1">canWrite</Badge>Escrita</p>
            <p className="text-foreground/70">Criar e editar (também exige canRead)</p>
          </div>
          <div className="rounded-md border p-2.5 text-[12px]">
            <p className="font-semibold mb-1"><Badge variant="outline" className="text-[10px] h-4 mr-1">canDelete</Badge>Exclusão</p>
            <p className="text-foreground/70">Soft-delete e exclusão definitiva (também exige canWrite)</p>
          </div>
        </div>
        <Callout tipo="aviso">
          <strong>isMaster</strong> e <strong>isEmpresaMaster</strong> bypass total a matriz de permissões.
          Para usuários sensíveis, mantenha <em>desativado</em> e configure permissões explicitamente.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Copy} titulo="Copiar permissões de outro usuário" rota="/usuarios → Copiar permissões">
        <p>
          Para acelerar a configuração de novos usuários com mesmo perfil de outro:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>No topo de <strong>/usuarios</strong>, clique em <strong>Copiar permissões</strong></li>
          <li>Escolha o usuário <strong>origem</strong> (modelo) e o <strong>destino</strong> (que vai receber)</li>
          <li>Confirma — destino recebe matriz idêntica de permissões (sobrescreve as anteriores)</li>
        </ul>
        <Callout tipo="dica">
          Útil ao integrar um colaborador novo no mesmo cargo de outro existente.
          Ajuste fino fica para uma segunda passagem depois.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={KeyRound} titulo="O usuário ativa o MFA (TOTP)" rota="/perfil (cada usuário)">
        <p>
          MFA é <strong>opt-in por usuário</strong> — admin não ativa pelo outro. Cada usuário
          deve ir em <strong>seu próprio /perfil</strong> e:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Clicar em <strong>Ativar MFA</strong> na seção de Segurança</li>
          <li>Escanear o QR code com Google Authenticator, Authy, 1Password ou similar</li>
          <li>Inserir o código de 6 dígitos para confirmar</li>
          <li>Guardar os <strong>códigos de backup</strong> em local seguro (uso único, recuperação de conta)</li>
        </ul>
        <Callout tipo="info">
          A partir do próximo login, será exigido o código TOTP em <code className="text-[11px]">/login/2fa</code>{' '}
          após e-mail+senha. Cookie de &quot;dispositivo confiável&quot; pode ser ativado para
          não pedir código toda vez no mesmo dispositivo.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={ShieldCheck} titulo="Política recomendada" rota="—">
        <p>Sugestão de política mínima:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Master / Diretor / Coordenador</strong>: MFA <em>obrigatório</em> — alto privilégio</li>
          <li><strong>Operadores e prestadores</strong>: MFA fortemente recomendado</li>
          <li><strong>Colaboradores externos (cliente)</strong>: MFA conforme contrato — pode ser dispensado</li>
          <li>Revisão trimestral de permissões — auditar usuários inativos e elevações desnecessárias</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Usuário não consegue acessar um módulo</p>
            <p className="text-foreground/70">
              1. Confira <strong>canRead</strong> no módulo em <code className="text-[11px]">/usuarios/[id]/editar</code>.
              {' '}2. Verifique se o módulo exige role privilegiada (ex: BI exige Coordenador+).
              {' '}3. Em multi-empresa, confirme que o usuário está vinculado à empresa correta.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Perdi acesso ao app autenticador</p>
            <p className="text-foreground/70">
              1. Use um <strong>código de backup</strong> em <code className="text-[11px]">/login/2fa</code>.
              {' '}2. Se não tiver, peça a um master para acessar <code className="text-[11px]">/usuarios/[id]/editar</code> e
              {' '}<strong>resetar MFA</strong> — depois ative novamente em <code className="text-[11px]">/perfil</code>.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Funcionário desligado</p>
            <p className="text-foreground/70">
              <strong>Não delete</strong> — desative <em>(Active = false)</em>. Histórico de
              autoria (eventos, comentários) preserva o nome. Hard-delete falha em FKs.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/usuarios" label="Listar usuários" cor={MODULO_COLOR} />
          <QuickLink href="/usuarios/new" label="Convidar novo usuário" cor={MODULO_COLOR} />
          <QuickLink href="/perfil" label="Ativar MFA na minha conta" cor={MODULO_COLOR} />
          <QuickLink href="/areas" label="Configurar áreas (afeta visibilidade)" cor={MODULO_COLOR} />
        </div>
        <Callout tipo="aviso">
          <AlertTriangle className="inline h-3 w-3" /> O módulo de Usuários só é visível
          para admins. Se algum colaborador não vê esta página, é o comportamento correto.
        </Callout>
      </Section>

      <Section icon={Mail} titulo="Detalhes técnicos (para admins curiosos)" cor={FAQ_COLOR}>
        <ul className="text-[12px] space-y-1 list-disc list-inside ml-2 text-foreground/70">
          <li>Auth provider: <strong>Better Auth</strong> com TOTP plugin</li>
          <li>JWT carrega <code className="text-[11px]">userId</code>, <code className="text-[11px]">tenantId</code> e <code className="text-[11px]">empresaId</code></li>
          <li>Refresh-token rotation ativado — sessões ficam protegidas contra replay</li>
          <li>Cookie de dispositivo confiável reduz fricção sem comprometer 2FA inicial</li>
          <li>Permissões são consultadas em runtime via <code className="text-[11px]">UserPermission[]</code> + cache curto</li>
        </ul>
      </Section>
    </ArticleShell>
  )
}
