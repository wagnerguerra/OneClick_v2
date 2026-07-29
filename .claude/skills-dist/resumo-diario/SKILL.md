---
name: resumo-diario
description: >
  Gera o relatório resumido do dia da sessão de desenvolvimento — para entregar à
  diretoria ou a qualquer pessoa não-técnica. Produz um HTML datado, em linguagem
  simples, salvo em docs/relatorios/ do próprio projeto. A skill se adapta sozinha ao
  projeto onde está instalada (nome, frentes de trabalho, forma de publicação). Use
  SEMPRE que o usuário pedir "resumo do dia", "relatório da diretoria", "resumo diário",
  "resumo pra diretoria", "fecha o relatório do dia", "o que fizemos hoje", ou algo
  equivalente ao encerrar o expediente — mesmo que ele não diga "skill" nem "relatório".
  Também vale quando pede para resumir o que foi tratado/desenvolvido na sessão para
  alguém que não programa.
---

# Resumo diário para a diretoria

Você produz **um relatório de uma página**, em HTML, contando **em linguagem simples** o que
a sessão de desenvolvimento entregou no dia. Quem lê é a **diretoria** (ou outra pessoa que
**não programa**). O objetivo dela é enxergar valor e andamento, não detalhe técnico.

O arquivo vai em `docs/relatorios/resumo-AAAA-MM-DD.html` **dentro do projeto atual** (datado,
versionado). Se já houver relatórios nessa pasta, abra o mais recente quando tiver dúvida de
formatação — ele é o seu modelo de referência local.

> **Esta skill é portátil.** Ela não sabe, de antemão, em qual projeto está rodando. O Passo 0
> serve justamente para descobrir isso. Nunca presuma nome de sistema, módulos ou forma de
> deploy — levante do projeto atual.

## Passo 0 — Descubra o projeto (faça isto primeiro)

Antes de escrever qualquer coisa, monte um retrato rápido de onde você está:

1. **Nome do projeto** (vira o `{{PROJETO}}` no relatório). Procure, em ordem: um título no
   `CLAUDE.md`/`README.md` da raiz; o campo `name` de `package.json`/`pyproject.toml`; o
   `<name>` de `pom.xml`; senão, o **nome da pasta raiz** do repositório
   (`git rev-parse --show-toplevel`). Prefira um nome que a diretoria reconheceria, não o slug
   técnico.
2. **Do que é o sistema** (para traduzir bem). Leia as primeiras seções do `CLAUDE.md`/`README.md`.
   Isso te diz o vocabulário do negócio (ex.: "apuração fiscal", "orçamentos", "logística") — é
   nessa linguagem que a diretoria pensa.
3. **Frentes de trabalho** (viram os cards e as cores). Não existe lista fixa de módulos. Deduza
   os agrupamentos naturais do dia a partir de **onde os commits mexeram**: rode
   `git show --stat <hash>` nos commits e olhe as **pastas de topo** dos arquivos
   (`api/`, `web/`, `frontend/`, `fiscal/`, `infra/`, `docs/`...). Cada grupo de arquivos afins
   vira uma frente. Se o `CLAUDE.md` já lista módulos/domínios, use-os como nomes.
4. **Como o projeto publica** (para a nota "Situação"). Procure sinais de deploy: alvos no
   `Makefile` (`make deploy-*`), workflows em `.github/workflows/`, um Service Manager, scripts em
   `scripts/`. Se não achar nada claro, descreva a situação de forma neutra ("concluído e
   commitado; aguardando publicação") — não invente um mecanismo.
5. **Onde ficam os transcritos da sessão** (fonte de recuperação, ver Passo 1b). Ficam na pasta de
   projetos do Claude do usuário: em geral `~/.claude/projects/<caminho-do-repo-com-barras-viradas-em-tracos>/`
   (no Windows, `C:\Users\<usuário>\.claude\projects\`). Ex.: um repo em `D:\PROJETOS\centria`
   costuma virar a pasta `D--PROJETOS-centria`. Na dúvida, liste `~/.claude/projects/` e escolha a
   pasta cujo nome corresponde ao caminho deste repositório, ordenando por data de modificação.

Com esse retrato em mãos, siga.

## Princípio central: traduza, não transcreva

Um commit diz *"fix(auth): corrige refresh token expirado no middleware"*. A diretoria não pode
ler isso cru — ela precisa ler: *"Usuários eram deslogados sem motivo; foi corrigido."* Sempre
responda, para cada item: **o que o usuário final ganha ou deixa de sofrer com isso?** É essa
frase que entra no relatório.

Regras de linguagem:
- **Português claro, frases curtas.** Nada de "endpoint", "migration", "deploy", "service",
  "query" no meio do texto (a palavra *deploy* só aparece na nota de Situação, e pode virar
  "publicação em produção"). Um termo do negócio que a diretoria já conhece pode ficar; explique
  o resto em 3 palavras.
- **Foque no efeito, não na implementação.** "Passou a ordenar por nome" e não "adiciona um
  `orderBy` no serviço".
- **Agrupe por frente/assunto**, não por commit. Vários commits do mesmo tema viram um item só,
  com os vários hashes no fim.
- **Seja honesto sobre a natureza:** melhoria nova, correção de bug, investigação (às vezes o
  trabalho do dia foi descobrir que *não* era bug, ou validar um resultado — isso conta e deve
  aparecer).
- **Não invente números nem entregas.** Sem certeza do efeito de um commit, descreva a mudança de
  forma neutra em vez de chutar um benefício.

## Passo a passo

### 1a. Levante os commits do dia

Dão os hashes e a cobertura factual:
```bash
git log --all --since="AAAA-MM-DD 00:00" --until="AAAA-MM-DD 23:59" \
  --format="%h|%ci|%an|%s" --date=iso
```
Troque `AAAA-MM-DD` pela data desejada (veja `currentDate` no contexto; para "ontem", subtraia um
dia). O `--all` pega commits em qualquer branch. Use `git show --stat <hash>` para entender um
commit obscuro e para descobrir a frente (Passo 0.3).

### 1b. Recupere o "porquê" pelo contexto da sessão

O `git log` conta *o quê*, não *por quê*. Como esta skill roda ao fim do dia, na mesma conversa,
você provavelmente já viveu tudo: decisões, investigações, validações, deploys. Isso é ouro para a
nota "Além do código" e para a "Situação".

> Se o seu contexto foi resumido/compactado ou o dia cruzou várias sessões, leia os transcritos do
> dia (Passo 0.5) — os `*.jsonl` da pasta de projetos do Claude, ordenados por data. Use só para
> recuperar o que faltou.

Cruze as duas fontes: todo commit relevante vira um item; todo trabalho sem commit (investigação,
decisão, validação, deploy) vira uma nota ou um item marcado como "investigação".

### 2. Monte o relatório a partir do template

Copie `assets/template.html` (ao lado deste arquivo) e preencha os `{{marcadores}}`. O template já
traz o CSS pronto, tema claro/escuro e uma paleta de cores — **não reescreva o estilo**, só o
conteúdo.

- **`{{PROJETO}}`** = o nome do Passo 0.1 (aparece no título, no topo e no rodapé).
- **Datas:** `{{DATA_BR}}` = `28/07/2026`; `{{DATA_EXTENSO}}` = `28 de julho de 2026`.
- **Stats (3–4 números):** escolha os que contam a história do dia — `commits do dia`,
  `frentes tocadas`, e uma divisão entre `entregas`/`correções`/`investigações`. Ajuste os rótulos
  à realidade; se o dia foi só correção, não force uma coluna de "entregas".
- **Cards (um por frente):** atribua uma cor a cada frente na ordem em que aparecem —
  `var(--c1)`, `var(--c2)`, ... `var(--c8)` — e reutilize a mesma cor se a frente repetir. A `tag`
  combina frente e natureza (`Financeiro · melhoria`, `novo`, `correção`, `investigação`).
  Incremente o `animation-delay` em `.05s` a cada card.
- **Itens (`<li>`):** um por entrega. `<b>título curto</b>`, depois a explicação em linguagem de
  diretoria, e feche com os `<span class="hash mono">` dos commits (quando houver). Itens de
  investigação podem não ter hash.
- **Notas:** `Além do código` para decisões/validações sem commit; a **última** nota é sempre a
  **Situação** (o que já está no ar × o que aguarda publicação, conforme o Passo 0.4). Remova as
  notas que não se aplicarem.

### 3. Salve, confira e ofereça o commit

- Salve em `docs/relatorios/resumo-AAAA-MM-DD.html` **do projeto atual** (crie a pasta se não
  existir). Se já houver um com a data de hoje, **atualize-o** em vez de duplicar.
- Faça o commit do arquivo (`docs(relatorios): resumo do dia AAAA-MM-DD`), **sem push** — respeite
  o fluxo de git do projeto (se o `CLAUDE.md` proíbe commit/push direto em certas branches, apenas
  deixe o arquivo salvo e avise). A publicação é decisão do usuário.
- No chat, entregue o **caminho do arquivo** e um resumo de 2–3 linhas do que ele cobre, para a
  pessoa abrir no navegador e conferir antes de repassar. Não cole o HTML inteiro na conversa.

## Erros a evitar

- **Presumir o projeto.** Sempre rode o Passo 0 — a mesma skill roda em sistemas diferentes.
- **Jargão vazando para o texto do card.** Se um leigo não entenderia a frase sozinho, reescreva.
- **Um card por commit.** Isso fragmenta e infla; agrupe por tema.
- **Inventar impacto.** Um número sem base é pior que nenhum número.
- **Esquecer o trabalho sem commit.** Investigações, validações e decisões são parte do dia — a
  diretoria valoriza saber que foram tratadas.
- **Reescrever o CSS.** O visual é fixo; sua energia vai para a tradução do conteúdo.
