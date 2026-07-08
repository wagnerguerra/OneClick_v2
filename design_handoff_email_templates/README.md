# Handoff: Padronização dos e-mails transacionais (OneClick_v2)

## Overview
Layout mestre único para **todos os e-mails transacionais** do OneClick_v2, enviados
via Resend/SMTP (`apps/api/src/common/email.service.ts`). Um shell padronizado
(header verde com logo → badge de ícone na cor do template → eyebrow/título/subtítulo
→ corpo → botão CTA → rodapé) com **9 tipos** de mensagem. A única coisa que muda por
tipo é o conteúdo, o **ícone** e a **cor de destaque (eyebrow/badge)**; todo o resto é
padronizado.

## About the Design Files
Os arquivos deste pacote são **referências de design em HTML** — um protótipo do
visual/comportamento pretendido, **não** código de produção para colar direto.

⚠️ **Importante:** o protótipo (`Emails OneClick.dc.html`) usa Flexbox, `box-shadow`,
gradientes CSS e **SVG inline** para ficar bonito no preview. **Isso NÃO é seguro para
clientes de e-mail** (Outlook/Gmail ignoram flex, SVG e muito CSS). A implementação
real deve usar **tabelas + estilos inline** (como o shell atual do projeto já faz) e
**ícones em PNG hospedados**, não SVG. Este pacote já traz uma versão traduzida e
email-safe em `email-shell.enriched.ts`.

O projeto **já tem** um sistema de e-mail. Esta tarefa é **evoluir os arquivos
existentes** para o layout enriquecido — não criar do zero.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamento e estrutura são finais.
Recrie fielmente, respeitando as regras de compatibilidade de e-mail abaixo.

## Arquivos do repositório a alterar (fonte de verdade)
1. **Backend — fonte de verdade real do e-mail enviado:**
   `apps/api/src/orcamento/orcamento.service.ts` → método privado
   `buildEmailLayout` (~linha 954). É ele que gera o HTML de fato.
2. **Front — espelho do shell (preview do simulador):**
   `apps/web/src/app/(dashboard)/admin/email-templates/_lib/email-shell.ts`
   (`renderEmailShell`). Precisa continuar **idêntico** ao backend.
3. **Seeds/params dos templates:**
   `apps/web/src/app/(dashboard)/admin/email-templates/_lib/templates.ts`
   (`SEED_TEMPLATES`, `EmailTemplate`, `EMAIL_VARIABLES`).
4. **Asset do logo (header verde):** `apps/api/assets/email-logo.png` hoje é o logo
   escuro. Para o header verde use uma versão **toda branca** (veja `assets/` neste
   pacote — `logo-oneclick-white.png`). Hospede-a em URL pública (S3/Minio já usado
   no projeto) e referencie por `logoUrl`.
5. **Ícones dos badges:** exporte 1 PNG por ícone (26–28px @2x, na cor de destaque do
   template) e hospede junto do logo. SVG inline **não** funciona em e-mail.

## Passo a passo sugerido (Claude Code)
1. Atualize `buildEmailLayout` no backend com a estrutura de `email-shell.enriched.ts`
   (tabelas, estilos inline). Adicione os novos parâmetros: `iconUrl`, `accent`,
   `accentTint`, `footerLinks`.
2. Replique **exatamente** em `renderEmailShell` (front) — comentário do arquivo já
   avisa que os dois precisam bater.
3. Atualize `EmailTemplate`/`SEED_TEMPLATES` com os campos novos (`icon`/`iconUrl`,
   mantendo `accent`). Use a tabela "Templates" abaixo.
4. Suba logo branco + PNGs de ícone para o storage; preencha as URLs.
5. Teste o envio pelo gate do `docs/error-registry.md` e confira no simulador em
   `/admin/email-templates`.

---

## Estrutura do shell (mestre)

Largura do card: **600px**, centralizado sobre fundo `#f3f4f6`, `padding:24px 12px`.

| Bloco | Especificação |
|---|---|
| **Card** | `background:#fff` · `border-radius:14px` · sombra suave · `overflow:hidden` |
| **Header** | `background:linear-gradient(135deg,#10b981,#059669)` (fallback `bgcolor="#10b981"`) · `padding:30px 32px` · logo branco centralizado `max-height:38px` · barra de brilho 4px na base (opcional) |
| **Badge de ícone** | tile `54×54` · `border-radius:15px` · fundo = tint do accent · ícone PNG 26px na cor do accent · `margin-bottom:18px` |
| **Eyebrow** | nome do tenant · `11px` · `700` · UPPERCASE · `letter-spacing:1.3px` · cor = **accent** |
| **Título (h1)** | `26px` · `700` · `#0f172a` · `line-height:1.25` |
| **Subtítulo** | `14px` · `#6b7280` |
| **Corpo** | `14px` · `line-height:1.6` · `#374151` · `<strong>` em `#111827` |
| **CTA** | `linear-gradient(135deg,#10b981,#059669)` (fallback `bgcolor="#10b981"`) · texto branco `15px/600` · `border-radius:9px` · `padding:14px 32px` · **sempre verde**, independente do accent |
| **Divider** | `1px` · `#e5e7eb` · `margin:0 32px` |
| **Rodapé** | linha de links `#6b7280`, linha extra opcional, aviso automático, assinatura `Tenant · ano` em `#10b981/700` · centralizado · `12px` · `#9ca3af` |

### Card de detalhe (usado no corpo — orçamento, agenda, fatura)
`border:1px solid #e5e7eb` · `border-radius:12px` · linhas `padding:12px 16px`,
`border-bottom:1px solid #f0f1f3`, label `#6b7280`/valor `#111827 600`. Linha de total:
`background:#f0fdf4`, textos `#065f46`.

### Caixa de código (verificação 1b)
`background:#f0fdf4` · `border:1px solid #bbf7d0` · dígitos `36px/700` `#065f46`
`letter-spacing:12px`.

### Caixa de alerta (senha 1c / falha 1h)
Senha: `#fff7ed`/`#fed7aa`/texto `#9a3412`. Falha: `#fff1f2`/`#fecdd3`/texto `#be123c`.

---

## Design tokens

**Cores neutras**
- Fundo página `#f3f4f6` · Card `#ffffff`
- Ink título `#0f172a` · Corpo `#374151` · `<strong>` `#111827`
- Secundário `#6b7280` · Rodapé `#9ca3af` · Divisor `#e5e7eb` / `#f0f1f3`

**Accent por template** (accent · tint do badge · cor do ícone)
- Verde `#10b981` · `#ecfdf5` · `#059669`
- Laranja `#fb923c` · `#fff7ed` · `#f97316`
- Ciano `#22d3ee` · `#ecfeff` · `#06b6d4`
- Índigo `#818cf8` · `#eef2ff` · `#6366f1`
- Rosa `#f43f5e` · `#fff1f2` · `#f43f5e`

**Header/CTA verde** `linear-gradient(135deg,#10b981,#059669)`, fallback sólido `#10b981`.
**Destaque de total/positivo** fundo `#f0fdf4`, texto `#065f46`.

**Tipografia** — stack `'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
- Eyebrow 11/700/UPPERCASE/1.3px · H1 26/700 · Sub 14/400 · Corpo 14/1.6 · CTA 15/600
- Título de update (newsletter) 15/600 · meta rodapé 12/400

**Raios** card 14 · badge 15 · CTA 9 · cards internos 12 · caixas 10–12
**Espaçamento (4pt)** paddings usados: 30/32 header · 32 laterais · 24 CTA-top

---

## Templates (9)

| id | Nome | accent | Ícone (lucide → exportar PNG) | Título hero | CTA |
|---|---|---|---|---|---|
| 1a | Boas-vindas / cadastro | verde | `user-round-check` | Bem-vindo ao OneClick | Acessar o painel |
| 1b | Verificação de e-mail / código | verde | `mail-check` | Confirme seu e-mail | Confirmar e-mail |
| 1c | Redefinição de senha | laranja | `key-round` | Redefinição de senha | Criar nova senha |
| 1d | Orçamento enviado | verde | `file-text` | Seu orçamento está pronto | Visualizar orçamento |
| 1e | Helpdesk — chamado resolvido (CSAT) | ciano | `message-square-heart` | Chamado resolvido | Avaliar atendimento |
| 1f | Agenda — lembrete | índigo | `calendar-clock` | Lembrete de compromisso | Ver na agenda |
| 1g | Fatura / cobrança | verde | `credit-card` | Fatura disponível | Ver fatura |
| 1h | Pagamento recusado (falha) | rosa | `triangle-alert` | Não conseguimos processar seu pagamento | Atualizar pagamento |
| 1i | Newsletter / novidades | verde | `megaphone` | Novidades do OneClick | Explorar novidades |

Cada template define: `assunto`, `preheader`, `accent`, `iconUrl`, `heroTitle`,
`heroSubtitle`, `corpoHtml` (email-safe), `ctaLabel`, `ctaUrl`, `footerLinks`.
Corpo e assunto usam variáveis `{{chave}}` já existentes (`cliente`, `numero`,
`empresa`, `data`, `link`, `usuario`, `valor`). Os valores no protótipo estão
preenchidos com exemplos.

Conteúdo/copy exatos de cada template: ver `templates.enriched.ts` neste pacote e o
protótipo `Emails OneClick.dc.html` (ids `1a`–`1i`).

## Interações & comportamento (e-mail)
- Sem JS. Único elemento interativo é o `<a>` do CTA e os links do rodapé.
- Hover é irrelevante em muitos clientes — não dependa dele.
- `preheader` oculto (texto de preview do inbox) — manter o `<div style="display:none…">`.
- Responsivo: media query `max-width:620px` deixa o card 100% e reduz paddings/H1 (já
  presente no shell atual — manter e reaplicar às novas larguras).

## Regras de compatibilidade de e-mail (obrigatório)
- **Layout em `<table>`**, nunca flexbox/grid. Alinhamento por `align`/`valign`.
- **Estilos inline** em cada elemento. `<style>` no `<head>` só para media query e
  `@media` — clientes descartam boa parte.
- **Ícones = `<img>` PNG hospedado**, não SVG inline.
- **Gradiente sempre com fallback** `bgcolor` sólido na `<td>`.
- Evitar `box-shadow` como estrutura (decorativo apenas; degrada em Outlook).
- Imagens com `alt`, `border:0`, `display:block`. Logo em URL absoluta pública.

## Assets (neste pacote, pasta `assets/`)
- `logo-oneclick-white.png` — logo OneClick recolorido **todo branco** para o header
  verde (derivado de `apps/web/public/logo-light.png` do repo). Hospedar e usar como `logoUrl`.
- Ícones dos badges: **exportar do lucide** (nomes na tabela) em PNG na cor de accent e
  hospedar. Ainda não incluídos — gerar na implementação.

## Módulo de Orçamentos (t4 do protótipo, ids 4a–4i)
O módulo já dispara as notificações abaixo pelo `buildEmailLayout` em
`apps/api/src/orcamento/orcamento.service.ts`. Os `heroAccent`/`heroTitle`/`subject`
são os **reais do código** — não invente novos. O handoff apenas troca a MOLDURA
para o shell enriquecido (badge + rodapé); o roteamento e os destinatários
(comercial/financeiro/cliente/responsável) ficam intactos. Params em
`orcamento-notificacoes.enriched.ts`:

| id | Notificação | accent (hex) | heroTitle |
|---|---|---|---|
| 4a | Novo orçamento (interno) | `#fb7185` | Novo orçamento |
| 4b | Proposta ao cliente | `#10b981` | Sua proposta comercial está pronta |
| 4c | Revisão solicitada | `#f59e0b` | Revisão solicitada pelo cliente |
| 4d | Aprovado | `#10b981` | Orçamento aprovado! |
| 4e | Recusado | `#ef4444` | Orçamento recusado |
| 4f | Liberado p/ execução | `#059669` | Liberado para execução |
| 4g | Finalizado | `#0f766e` | Orçamento finalizado |
| 4h | Nova mensagem / menção | `#10b981` | Nova mensagem |
| 4i | Resposta do cliente | `#0ea5e9` | Resposta do cliente |

Faltam padronizar os avisos de **área** (pedir detalhamento / área em atraso) — hoje
são e-mails simples; sugestão de params no fim de `orcamento-notificacoes.enriched.ts`.

## Agenda do dia (t3 do protótipo, id 3a)
O resumo diário (`AgendaEmailTemplateService`) foi **padronizado** no mesmo shell
(header verde + badge índigo), **mantendo o conteúdo interno**: intro do dia,
seções agrupadas (Corporativos/Pessoais) e cards de evento (barra de cor do tipo,
coluna de horário, pill de categoria, participantes, "agendado por"). Ao aplicar,
troque só o `headerHtml`/`footerHtml` (o "chrome") pelo shell; preserve o builder de
cards e os agrupamentos. Emojis de ícone (📅📌💻🏢📍👥🔗) são os do template atual.

---

## Como aplicar (resumo)
1. **Suba os assets** (logo branco + PNGs de ícone lucide) no storage público (S3/Minio)
   e anote as URLs — SVG inline não funciona em e-mail.
2. **Shell**: leve `renderEmailShell` (de `email-shell.enriched.ts`) para o
   `buildEmailLayout` do backend e replique no espelho do front. Adicione os params
   novos (`accent`, `iconUrl`, `footerLinks`).
3. **Transacionais (1a–1i)**: cadastre/atualize `SEED_TEMPLATES` com os dados de
   `templates.enriched.ts`. Monte os blocos dinâmicos no envio via helpers
   (`codeBox`, `detailCard`, `alertBox`).
4. **Orçamentos (4a–4i)**: nos pontos de envio do `orcamento.service.ts`, troque a
   montagem atual pela chamada ao shell com os params de `orcamento-notificacoes.enriched.ts`.
5. **Agenda (3a)**: atualize `headerHtml`/`footerHtml` do `AgendaEmailTemplateService`.
6. **Teste** pelo gate do `docs/error-registry.md` e confira no simulador
   `/admin/email-templates` (e no preview da agenda). Envie um teste real para
   Gmail + Outlook antes de publicar (via PR — nunca push direto na `main`).

## Prompt para colar no Claude Code
> Padronize os e-mails transacionais do OneClick_v2 usando este pacote de handoff.
> 1) Substitua o `buildEmailLayout` em `apps/api/src/orcamento/orcamento.service.ts`
> pelo shell de `email-shell.enriched.ts` (email-safe, com badge de ícone e rodapé de
> links) e replique igual no `renderEmailShell` do front. 2) Aplique os params de
> `templates.enriched.ts` aos e-mails transacionais e os de
> `orcamento-notificacoes.enriched.ts` às notificações do módulo de orçamentos,
> mantendo os assuntos/accents reais e o roteamento atual. 3) Hospede o logo branco e
> os ícones lucide como PNG e preencha as URLs. 4) Rode o gate de entrega e me mostre o
> preview antes de abrir o PR. Não faça push direto na `main`.

## Files (neste pacote)
- `README.md` — este documento (auto-suficiente).
- `email-shell.enriched.ts` — shell **email-safe** (tabelas + inline) + helpers
  (`detailCard`, `codeBox`, `alertBox`) para `buildEmailLayout`/`renderEmailShell`.
- `templates.enriched.ts` — os 9 transacionais (1a–1i) com `accent`, `icon`, hero, corpo, CTA.
- `orcamento-notificacoes.enriched.ts` — as 9 notificações do módulo de orçamentos (4a–4i).
- `Emails OneClick.dc.html` — protótipo visual de referência (ids `1a`–`1i`, `3a`, `4a`–`4i`).
- `assets/logo-oneclick-white.png` — logo branco para o header verde.
