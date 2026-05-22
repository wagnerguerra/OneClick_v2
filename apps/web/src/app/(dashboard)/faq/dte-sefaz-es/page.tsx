'use client'

import {
  MailWarning, Lock, KeyRound, Globe, RefreshCw, Bell,
  Lightbulb, Info, ArrowRight, AlertTriangle, ShieldCheck, UserCheck,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-fiscal, #818cf8)' // indigo (Fiscal)
const FAQ_COLOR = '#0891b2'

export default function FaqDteSefazEsPage() {
  return (
    <ArticleShell
      modulo="DT-e SEFAZ-ES"
      moduloColor={MODULO_COLOR}
      icon={MailWarning}
      titulo="DT-e SEFAZ-ES: setup e monitoramento"
      descricao="Configurar acesso ao Domicílio Tributário Eletrônico do ES e monitorar mensagens da SEFAZ via Agência Virtual."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="DT-e" texto="Domicílio Tributário Eletrônico — equivalente do e-CAC para a SEFAZ-ES. Mensagens fiscais oficiais sobre ICMS." />
          <DefRow termo="Agência Virtual SEFAZ-ES" texto="Portal onde as mensagens DT-e ficam disponíveis. Acesso via Acesso Cidadão (gov.br)." />
          <DefRow termo="Acesso Cidadão" texto="Sistema de SSO do ES — exige login gov.br + hCaptcha + certificado PF." />
          <DefRow termo="Certificado PF" texto="Certificado digital A1 de pessoa física (sócio ou contador responsável). Não é o A1 PJ do escritório." />
          <DefRow termo="Token de sessão" texto="Sistema renova automaticamente ao expirar — sem necessidade de re-login frequente." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Setup inicial</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Lock} titulo="Cadastrar certificado PF" rota="/configuracoes/certificado → Certificado PF">
        <p>
          Diferente do certificado PJ usado em outras integrações, o DT-e exige
          <strong> certificado A1 de pessoa física</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Geralmente do <strong>sócio responsável</strong> da contabilidade ou do contador-chefe</li>
          <li>Faça upload do PFX e informe a senha</li>
          <li>Sistema valida e extrai CPF + validade</li>
        </ul>
        <Callout tipo="aviso">
          Sem certificado PF cadastrado, o login automático não funciona —
          monitoramento DT-e fica disponível apenas via consulta manual.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={UserCheck} titulo="Vincular usuário gov.br" rota="/dte → Configurações">
        <p>
          O Acesso Cidadão usa as credenciais gov.br do mesmo CPF do certificado.
          Configure:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>CPF do titular (mesmo do certificado PF)</li>
          <li>Senha gov.br (criptografada no banco)</li>
          <li>Confirmação de que a conta gov.br tem nível <strong>prata</strong> ou superior</li>
        </ul>
        <Callout tipo="info">
          Conta gov.br nível bronze (apenas e-mail) <strong>não autoriza</strong> entrar
          na Agência Virtual SEFAZ. Verifique o nível em <a className="text-indigo-600 hover:underline" href="https://sso.acesso.gov.br" target="_blank" rel="noreferrer">sso.acesso.gov.br</a>.
        </Callout>
      </Step>

      <Step n={3} cor={MODULO_COLOR} icon={Globe} titulo="Validar fluxo de login" rota="/dte → botão Testar conexão">
        <p>O fluxo automatizado segue:</p>
        <div className="rounded-md border bg-muted/30 p-3 text-[11px] font-mono">
          <p>1. Abre Acesso Cidadão</p>
          <p>2. Redireciona para gov.br</p>
          <p>3. Resolve hCaptcha (com 2captcha-ts integrado)</p>
          <p>4. Login com CPF + senha</p>
          <p>5. Solicita certificado PF + senha</p>
          <p>6. Volta para Acesso Cidadão autenticado</p>
          <p>7. Entra na Agência Virtual SEFAZ-ES</p>
        </div>
        <Callout tipo="aviso">
          Esse fluxo é frágil — qualquer mudança no portal SEFAZ pode quebrar. O sistema
          tem retry automático e alertas em caso de falha persistente.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={4} cor={MODULO_COLOR} icon={Bell} titulo="Monitoramento automático de mensagens" rota="/dte (lista)">
        <p>O scheduler entra na Agência Virtual periodicamente e busca:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Mensagens novas em todos os clientes contribuintes do ES</li>
          <li>Comunicados, intimações, autos de infração</li>
          <li>Status muda automaticamente: <strong>Nova → Lida → Arquivada</strong></li>
        </ul>
        <Callout tipo="info">
          Cadência sugerida: <strong>2×/dia</strong> em dias úteis. SEFAZ não envia
          mensagens em finais de semana — execução nesses dias é desperdício de quota.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={RefreshCw} titulo="Consulta manual" rota="botão Atualizar">
        <p>
          Útil quando cliente avisa que tem alguma mensagem urgente ou em períodos
          de fechamento mensal. Funciona como o automático mas dispara imediatamente.
        </p>
      </Step>

      <Step n={6} cor={MODULO_COLOR} icon={ShieldCheck} titulo="Boas práticas de segurança">
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Certificado PF deve ser <strong>renovado antes de expirar</strong> — automação para sem aviso</li>
          <li>Senha gov.br trocada? <strong>Atualize no /dte → Configurações</strong> imediatamente</li>
          <li>Em caso de bloqueio gov.br, o sistema avisa via notificação — desbloqueie no portal e reative</li>
          <li>Não compartilhe credenciais — apenas master pode ver/editar configurações DT-e</li>
        </ul>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Login falha com &quot;hCaptcha required&quot;</p>
            <p className="text-foreground/70">
              Sistema usa 2captcha-ts para resolver. Se falhar persistentemente:
              1. Confira saldo da conta 2captcha. 2. Verifique se hCaptcha mudou de versão.
              3. Veja logs detalhados em /dte → aba Logs.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Certificado PF expirado</p>
            <p className="text-foreground/70">
              Suba o novo PFX em /configuracoes/certificado → Certificado PF, sobrescrevendo
              o antigo. Próxima execução já usa o novo. Senha pode ser a mesma ou diferente —
              ajuste conforme necessário.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente novo (contribuinte ICMS) não aparece</p>
            <p className="text-foreground/70">
              Em /clientes, confirme: <strong>tributacao = ICMS</strong> ou <strong>regime</strong>{' '}
              compatível, e <strong>UF = ES</strong>. Sem esses, o scheduler ignora o cliente
              (DT-e só vale para contribuintes do ES).
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/dte" label="Mensagens DT-e" cor={MODULO_COLOR} />
          <QuickLink href="/configuracoes/certificado" label="Certificado PF" cor={MODULO_COLOR} />
          <QuickLink href="/faq/caixapostal-ecac" label="Caixa Postal e-CAC (federal)" cor={MODULO_COLOR} />
          <QuickLink href="/faq/gestao-certificados" label="Gestão de certificados" cor={MODULO_COLOR} />
        </div>
        <Callout tipo="aviso">
          <AlertTriangle className="inline h-3 w-3" /> O fluxo de login depende de portais
          externos (gov.br, Acesso Cidadão, SEFAZ). Mudanças neles podem quebrar o
          monitoramento — fique atento a alertas.
        </Callout>
      </Section>
    </ArticleShell>
  )
}
