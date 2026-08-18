# Migração — Documentos Internos da Qualidade (v1 `sgq_documentos` → v2)

Levantamento feito em 18/08/2026 sobre o módulo vivo em
`https://oneclick.central-rnc.com.br/central/modules/sgq_documentos/`
(código em `\192.168.0.7\wwwroot\central\modules\sgq_documentos\`, banco `db_intranet`,
arquivos em `\192.168.0.7\wwwroot\files\sgq_documentos\`).

Bloco **Qualidade**. Já constava em `docs/MODULOS.md`, sem tela no v2.

---

## 1. O que o v1 faz

Guarda os documentos do sistema da qualidade — procedimentos, formulários e documentos
corporativos — **com histórico de revisões**. Cada revisão tem o seu arquivo, o que mudou,
por que mudou e em que situação está.

Três perfis, escolhidos pelo `SGQ_DOC` na hora de entrar (`index.asp` redireciona):
`usu/` (consulta), `adm/` (administra) e `apr/` (aprova).

### Volumetria

| Tabela | Linhas | Papel |
|---|---:|---|
| `sgq_doc` | 265 | documento **e** revisão na mesma linha — ver §2 |
| `sgq_doc_cod` | 4 | tipo do documento (3 ativos) |
| `sgq_doc_sit` | 7 | situações, com cor |
| `sgq_doc_per` | 4 | níveis de permissão |
| `sgq_doc_log` | 247 | trilha de auditoria |
| arquivos em disco | 320 | 66 MB; **os 265 links do banco têm arquivo** |

Situações: **Novo**, **Em Aprovação**, **Aprovado**, **Substituído**, **Cancelado**,
**Excluído**, **Rejeitado**. Em uso hoje: Aprovado (208), Substituído (40), Novo (12),
Em Aprovação (5).

Tipos: **Procedimento**, **Formulário**, **Doc Corporativo** (+ "Não informado", inativo).

Processos (o `sgq_proc`, mapa de processos da ISO): 13 valores — Sistema de Gestão da
Qualidade (81 documentos), Gestão de Pessoas (52), Fiscal (25), Legalização (22),
Comercial (19), Contábil (17), Recebimento e Triagem (13), Aquisição (11), Trabalhista (11),
TI (10), Financeiro (4).

---

## 2. O ponto central: documento e revisão são a mesma linha

No v1 **não existe registro de documento**. Cada revisão é uma linha nova em `sgq_doc` que
repete nome, tipo e processo, e se amarra às irmãs por `id_mestre`:

- a linha raiz aponta para **si mesma** (`id_mestre = id`) depois da primeira revisão;
- enquanto o documento não é revisado, `id_mestre` fica **0**;
- as revisões apontam todas para o id da raiz.

Logo, a identidade do documento é `id_mestre` quando ≠ 0, senão o próprio `id`. Por esse
critério: **265 linhas = 67 documentos**. A distribuição vai de 15 documentos com uma única
versão até um com 15 revisões (`Gestão de Pessoas`, mestre 4).

Qual é a versão vigente sai de `ativo = 1` — é o filtro que a listagem do `usu/` usa
(35 linhas hoje). As demais ficam `ativo = 0`.

**No v2 isso vira o que sempre foi:** `documentos_internos` (a identidade) +
`documento_interno_versoes` (as revisões), com um ponteiro `versao_atual_id` para a vigente.
Sem o ponteiro, "qual é a versão atual" viraria subconsulta em toda tela.

---

## 3. Campos que o v1 tem e nunca usou

Vale saber antes de desenhar a tela, porque são funções que **parecem existir** e não existem:

- **`responsavel`** — `0` nas **265** linhas. A listagem do `usu/` ainda faz `INNER JOIN`
  nele; só não some da tela porque existe um `ger_cad_usu` com `cad_usu_id = 0` que casa.
- **`usu_aprovacao` e `dt_aprovacao`** — vazios nas **265** linhas, apesar de haver o perfil
  `apr/` e **208 documentos "Aprovado"**. Ou seja: aprova-se, mas não se registra quem
  aprovou nem quando. Para um módulo de ISO isso é justamente o que a auditoria pede.
  No v2 as duas colunas passam a ser preenchidas pelo fluxo.

E um que é usado do jeito errado:

- **`elaborado`** — `varchar` com nomes separados por vírgula
  (`"Lindalva Cavalcanti,Rose Munhão,Ricardo Laia"`), preenchido em 68 das 265. Não responde
  "que documentos o fulano elaborou". Vira vínculo por ID
  (`documento_interno_elaboradores`), com o nome sobrando só para o que não casar.

---

## 4. O que NÃO vem do v1

- **Elaboradores como texto** — vira vínculo por ID.
- **Documento repetido a cada revisão** — vira documento + versões.
- **Log com frase pronta** (`"Fez a revisão do documento #4"`) — vira evento codificado
  + detalhe. De quebra resolve a mojibake: as frases estão gravadas com acento quebrado
  (`"revisÃ£o"`), porque o texto UTF-8 foi escrito numa coluna tratada como latin1.
- **`dt_versao` como `varchar`** em `d/m/aaaa` sem zero à esquerda (`"1/8/2018"`,
  `"10/12/2021"`) — vira coluna `DATE`. A migração parseia os três formatos de comprimento
  (8, 9 e 10 caracteres) que existem hoje.
- **Número de revisão único** — em 7 documentos o v1 gravou duas linhas com o mesmo número
  (ex.: mestre 10, revisão 0, linhas 10 e 24). O número sai impresso no rodapé do documento
  em papel, então renumerar quebraria a correspondência com as cópias que circulam: o índice
  ficou não-único de propósito. Revisão criada pelo v2 nunca repete (numera pela última + 1).
- **`processo` apontando para o `sgq_proc`** — vira `documento_processos`, tabela própria.
  Não usei as **Áreas** do v2: só 7 dos 13 processos casam por nome, e as Áreas se repetem
  por empresa (43 registros, com "Comercial", "Legalização" e "Financeiro" duplicados) — o
  vínculo sairia ambíguo justamente onde precisa ser exato.
- **`sgq_docext*`** — é o módulo de **Documentos Externos**, outro item do catálogo. Fica
  fora deste port.

---

## 5. Fases

### Fase 1 — Schema ✅ (18/08/2026)
5 models (`DocumentoProcesso`, `DocumentoInterno`, `DocumentoInternoVersao`,
`DocumentoInternoElaborador`, `DocumentoInternoLog`) +
`packages/db/prisma/sql/add_documentos_internos.sql`, aditivo e idempotente
(aplicado 2× no dev: 5 tabelas, 5 FKs).

Ids de usuário são **soltos** (sem FK para `User`), como já se faz em `Compra`: são muitos
papéis (registrou, aprovou, elaborou) e puxá-los para dentro de `User` polui um model grande.

### Fase 2 — Backend
Módulo NestJS + router tRPC: CRUD do documento, nova revisão (que substitui a vigente e
marca a anterior como "Substituído"), fluxo de aprovação, download do arquivo e log.
Permissão `documentos-internos` no catálogo.

### Fase 3 — Interface ✅ (18/08/2026)
Listagem no padrão da casa (header inline, tabela server-side, filtros por situação, tipo e
processo, busca com debounce), tela de cadastro — que já nasce com a revisão 0 e o arquivo —
e detalhe com o histórico completo de revisões. Cada revisão traz o seu arquivo para baixar,
o que mudou, a justificativa, quem elaborou e, quando houver, quando foi aprovada. As ações
do fluxo (enviar para aprovação, aprovar, rejeitar com motivo obrigatório) ficam na própria
revisão. À direita, os dados do documento (só o cabeçalho se edita) e a trilha de atividades.
O item saiu de `wip` no menu.

### Fase 4 — Migração dos dados e dos arquivos ✅ (18/08/2026)
67 documentos, 265 revisões e os 265 arquivos (66 MB) de
`wwwroot/files/sgq_documentos` para o storage do v2. Elaboradores casados por nome contra
`ger_cad_usu`, com relatório do que não casar. Só depois disso o v1 é desativado, pelo
procedimento de [[v1-desativacao-sempre-com-alert]].

---

## 6. Decidido com o Wagner (18/08/2026)

1. **Tipo do documento vira cadastro.** Deixou de ser lista fixa no código e virou
   `documento_tipos`, no mesmo formato do mapa de processos. A relação cresce (Instrução de
   Trabalho, Política, Manual) e o pessoal precisa acrescentar sem passar por deploy. Os 4
   valores do `sgq_doc_cod` entram pela migração, com o "Não informado" já inativo.

2. **Responsável sai.** O campo existia no v1 e estava zerado nas 265 linhas — ninguém sentiu
   falta em oito anos. Saiu do modelo em vez de virar mais um campo em branco na tela nova.

3. **Revisão nunca se edita: sempre gera nova versão.** Mudou o documento, publica-se uma
   revisão. Não existe endpoint que reescreva o conteúdo de uma revisão; o que se edita é o
   *cabeçalho* do documento (nome, tipo, processo). É o que a ISO espera — corrigir por baixo
   apagaria a rastreabilidade de quem aprovou o quê. Revisão aprovada também não se cancela.

## 7. Desativação do v1 ✅ (18/08/2026)

Feita depois de a carga estar validada em produção (67 documentos, 265 revisões, 265 arquivos
baixando). Pelo procedimento de [[v1-desativacao-sempre-com-alert]]: aviso na tela, botões
desabilitados e bloqueio server-side.

Foram **sete** pontos de gravação, e não dois: além de `create.asp`/`create-send.asp`, a
**revisão** (`revisar.asp`/`revisar-send.asp`, em `adm/` e `apr/`) também cria registro novo em
`sgq_doc` — é justamente como o v1 versiona. Bloquear só a criação deixaria a porta principal
aberta.

Na interface: o botão "Novo Documento" e o link de revisar de cada linha da tabela, nos dois
perfis. Nenhuma outra raiz do site grava em `sgq_doc`.

> Achado do caminho: **`adm/create.asp` tem 0 bytes**. O botão "Novo Documento" do perfil de
> administração já apontava para uma página em branco — quem criava documento pelo v1 usava o
> perfil `apr/`. Não é dano da desativação; é o estado em que o módulo estava.

## 8. Ainda em aberto

- **Os 7 documentos com número de revisão repetido** (§4). São provavelmente erro de
  lançamento do v1; vale o Wagner olhar e decidir se corrige na origem antes do corte.
