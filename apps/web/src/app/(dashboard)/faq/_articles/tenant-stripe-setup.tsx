'use client'

import {
  CreditCard, Key, Webhook, Building2, Lock, CheckCircle2, Server,
  Lightbulb, Info, ArrowRight, AlertTriangle, Shield,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-configuracoes, #f97316)' // orange (Configurações)
const FAQ_COLOR = 'var(--mod-faq, #0891b2)'

export default function FaqTenantStripeSetupPage() {
  return (
    <ArticleShell
      modulo="Configuração inicial"
      moduloColor={MODULO_COLOR}
      icon={CreditCard}
      titulo="Setup do tenant: certificado digital, SERPRO e Stripe"
      descricao="Passo-a-passo para configurar um novo tenant — certificado A1, credenciais SERPRO e plano de assinatura Stripe."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="Tenant" texto="Cada empresa-cliente do SaaS = 1 tenant. Isolamento de dados via schema PostgreSQL." />
          <DefRow termo="Certificado A1 PJ" texto="Certificado do escritório (CNPJ) usado para acessar e-CAC, FGTS Digital, eSocial em nome dos clientes." />
          <DefRow termo="Credenciais SERPRO" texto="Consumer Key + Secret + CNPJ contratante — habilitam APIs de Caixa Postal, CNDs, DCTFWeb, Situação Fiscal." />
          <DefRow termo="Stripe Billing" texto="Provedor de cobrança recorrente. Webhook do Stripe avisa o sistema de eventos (assinatura criada/cancelada, fatura paga/falhada)." />
          <DefRow termo="Master / EmpresaMaster" texto="Usuário com acesso total ao tenant. Configurações abaixo só visíveis para esse perfil." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">1. Certificado Digital A1</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Lock} titulo="Subir o certificado PJ do escritório" rota="/configuracoes/certificado → aba Certificado PJ">
        <p>O certificado A1 do escritório é a chave de acesso a todos os serviços fiscais:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Faça upload do <strong>arquivo PFX</strong></li>
          <li>Informe a <strong>senha</strong> do certificado</li>
          <li>Sistema valida assinatura, extrai CNPJ e validade automaticamente</li>
        </ul>
        <Callout tipo="aviso">
          A senha fica criptografada no banco — só o sistema descriptografa em runtime
          para uso. Mantenha o PFX original em local seguro fora do servidor.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Certificado PF (opcional)" rota="aba Certificado PF">
        <p>
          Para fluxos que exigem PF (ex: alguns alvarás de bombeiros, DT-e SEFAZ-ES via
          Acesso Cidadão), faça upload de um certificado A1 de PF — geralmente do
          sócio ou contador responsável.
        </p>
        <Callout tipo="info">
          Sem certificado PF, alguns serviços específicos não funcionam mas o restante
          do sistema opera normalmente.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">2. Credenciais SERPRO</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Key} titulo="Configurar credenciais da API SERPRO" rota="/configuracoes/certificado → aba Credenciais SERPRO">
        <p>SERPRO fornece APIs para vários serviços fiscais. Você precisa de:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Consumer Key</strong> — chave pública da aplicação SERPRO</li>
          <li><strong>Consumer Secret</strong> — chave secreta (não compartilhar)</li>
          <li><strong>CNPJ contratante</strong> — CNPJ do escritório que assinou o contrato com SERPRO</li>
        </ul>
        <Callout tipo="info">
          As credenciais habilitam: Caixa Postal e-CAC, consulta de CNDs federais,
          DCTFWeb, Situação Fiscal SERPRO.
        </Callout>
        <Callout tipo="aviso">
          Cada chamada SERPRO consome créditos do contrato — monitore o consumo no portal
          SERPRO. Configure horários de execução fora de pico para distribuir o uso.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={Server} titulo="Verificar checklist de status" rota="/configuracoes/certificado → status">
        <p>O painel mostra um checklist do que está OK e do que falta:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>✔ Certificado PFX enviado</li>
          <li>✔ Senha do certificado configurada</li>
          <li>✔ Consumer Key (SERPRO) configurada</li>
          <li>✔ Consumer Secret (SERPRO) configurada</li>
          <li>✔ CNPJ do contratante informado</li>
        </ul>
        <p>Tudo verde = setup fiscal completo, pronto para automações.</p>
      </Step>

      <h2 className="text-base font-bold pt-2">3. Stripe Billing</h2>

      <Step n={5} cor={MODULO_COLOR} icon={Key} titulo="Cadastrar chaves da API Stripe" rota="/configuracoes/stripe → Chaves de API">
        <p>Obtenha em <strong>dashboard.stripe.com → Developers → API keys</strong>:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><code className="text-[11px]">STRIPE_SECRET_KEY</code> — começa com <code className="text-[11px]">sk_live_</code> (produção) ou <code className="text-[11px]">sk_test_</code></li>
          <li><code className="text-[11px]">STRIPE_PUBLISHABLE_KEY</code> — <code className="text-[11px]">pk_live_</code> ou <code className="text-[11px]">pk_test_</code></li>
        </ul>
        <Callout tipo="dica">
          Use chaves de <strong>teste</strong> (<code className="text-[11px]">sk_test_</code>)
          em desenvolvimento e homologação — Stripe oferece cartões fictícios para teste sem cobrança real.
        </Callout>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={Webhook} titulo="Configurar webhook" rota="/configuracoes/stripe → Webhooks">
        <p>
          Webhook é como o Stripe avisa o sistema sobre eventos (assinatura criada,
          fatura paga, etc). Sem ele, o estado das assinaturas fica desatualizado.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>No dashboard Stripe: <strong>Developers → Webhooks → Add endpoint</strong></li>
          <li>URL do endpoint: <code className="text-[11px]">https://&lt;seu-dominio&gt;/api/stripe/webhook</code></li>
          <li>Eventos a escutar: <code className="text-[11px]">customer.subscription.*</code>, <code className="text-[11px]">invoice.payment_succeeded</code>, <code className="text-[11px]">invoice.payment_failed</code></li>
          <li>Stripe gera um <strong>signing secret</strong> — copie e cole em <code className="text-[11px]">STRIPE_WEBHOOK_SECRET</code></li>
        </ul>
        <Callout tipo="aviso">
          O signing secret valida que webhooks vêm realmente do Stripe.
          Sem ele, webhooks são rejeitados como insegure.
        </Callout>
      </Step>

      <Step n={7} cor={MODULO_COLOR} icon={CreditCard} titulo="Cadastrar produtos e preços" rota="/configuracoes/stripe → Produtos e Preços">
        <p>Para que o tenant possa receber assinaturas, você precisa criar:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Produtos</strong> — &quot;Plano Básico&quot;, &quot;Plano Pro&quot;, &quot;Plano Enterprise&quot;</li>
          <li><strong>Preços</strong> por produto — recorrente mensal/anual, valor em BRL</li>
          <li><strong>Trial</strong> opcional (ex: 14 dias) para conversão</li>
        </ul>
        <Callout tipo="info">
          Produtos e preços ficam sincronizados — alterar no dashboard Stripe reflete
          automaticamente no sistema via webhook.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">4. Validação final</h2>

      <Step n={8} cor={MODULO_COLOR} icon={Building2} titulo="Cadastrar empresa do tenant" rota="/empresas → Nova">
        <p>
          Cadastre os dados da empresa-tenant (escritório de contabilidade):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Razão social, CNPJ, endereço</li>
          <li>Logo (aparece em e-mails, PDFs e dashboard)</li>
          <li>Contatos administrativos e financeiros</li>
        </ul>
        <Callout tipo="info">
          Em multi-empresa (1 tenant, várias empresas filiadas), cada uma tem cadastro
          próprio aqui. Veja <a className="text-orange-600 hover:underline" href="/faq/multi-empresa">Multi-empresa</a>{' '}
          (em produção) para o modelo de scope cruzado.
        </Callout>
      </Step>

      <Step n={9} cor={MODULO_COLOR} icon={CheckCircle2} titulo="Testar fluxo end-to-end">
        <p>Antes de liberar para usuários reais, valide cada peça:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Login</strong> com usuário master + ative MFA em /perfil</li>
          <li><strong>Cadastro de cliente</strong> com busca CNPJ — testa BrasilAPI</li>
          <li><strong>Caixa Postal</strong> — execute consulta manual em 1 cliente para validar SERPRO</li>
          <li><strong>CND federal</strong> — execute consulta manual para validar Certificado + SERPRO juntos</li>
          <li><strong>Stripe</strong> — crie assinatura de teste com cartão <code className="text-[11px]">4242 4242 4242 4242</code></li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Erro ao validar certificado PFX</p>
            <p className="text-foreground/70">
              Senha incorreta é o caso mais comum — valide no Adobe Reader ou similar.
              Se o certificado for ICP-Brasil mas o sistema não aceitar, confira se é A1
              (não A3 / hardware token, que requer integração diferente).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">SERPRO retorna 401 / 403</p>
            <p className="text-foreground/70">
              1. Confira Consumer Key/Secret (espaços em branco quebram). 2. Confirme que
              o contrato SERPRO inclui as APIs que você está usando. 3. Veja créditos restantes
              no portal SERPRO — esgotamento bloqueia chamadas.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Webhook do Stripe não dispara</p>
            <p className="text-foreground/70">
              Use a aba <strong>Webhook attempts</strong> no dashboard Stripe — mostra
              tentativas e respostas. Causas comuns: URL bloqueada por firewall, signing
              secret errado (rejeita), endpoint retornando 5xx.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Trocar de tenant para multi-empresa</p>
            <p className="text-foreground/70">
              Se o escritório expandir para multi-empresa depois do setup inicial,
              basta criar empresas adicionais em /empresas. Os dados existentes ficam
              vinculados à primeira empresa por padrão.
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/configuracoes/certificado" label="Certificado e SERPRO" cor={MODULO_COLOR} />
          <QuickLink href="/configuracoes/stripe" label="Stripe Billing" cor={MODULO_COLOR} />
          <QuickLink href="/empresas" label="Empresas do tenant" cor={MODULO_COLOR} />
          <QuickLink href="/usuarios" label="Usuários e permissões" cor={MODULO_COLOR} />
        </div>
        <Callout tipo="aviso">
          <Shield className="inline h-3 w-3" /> Esta página de configurações é restrita
          a <strong>master</strong> — não delegue acesso. Senhas, signing secrets e
          credenciais SERPRO concentram alto risco.
        </Callout>
      </Section>
    </ArticleShell>
  )
}
