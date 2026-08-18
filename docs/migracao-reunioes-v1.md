# Migração — Reuniões (OneClick v1 `sgq_reunioes` → v2)

Levantamento feito em 17/08/2026 sobre o módulo vivo em
`https://oneclick.central-rnc.com.br/central/modules/sgq_reunioes/`
(código em `\\192.168.0.7\wwwroot\central\modules\sgq_reunioes\`, banco `db_intranet`).

O módulo fica no bloco **Qualidade** e já consta em `docs/MODULOS.md`, mas não tinha tela no v2.

---

## 1. O que o v1 faz

Registra a **ata de uma reunião** e o **plano de ação** que sai dela. Não é agenda: a reunião
é lançada depois de acontecer. O menu da Qualidade mostra um badge com a contagem de **ações
vencidas** (`sgq_reu_aca` com `dt_prazo` no passado e situação pendente) — é esse número que dá
utilidade diária ao módulo.

Tela de detalhe com cinco abas: **Geral** (pauta e ata), **Ações**, **Mensagens**, **Arquivos**
e **Atividades** (trilha de auditoria). Pauta e ata são CKEditor → no v2 viram `RichEditor`
para editar e `RichContent` para exibir.

### Tabelas e volumetria

| Tabela | Linhas | Papel |
|---|---:|---|
| `sgq_reu` | 281 | a reunião (tipo, cliente, data, hora, local, pauta, ata) |
| `sgq_reu_aca` | 140 | plano de ação (ação, prazo, responsável, conclusão) |
| `sgq_reu_par` | 241 | participantes **por ID** — ver §2 |
| `sgq_reu_arq` | 14 | anexos |
| `sgq_reu_msg` | 5 | mensagens |
| `sgq_reu_log` | 583 | trilha de auditoria |

Período: **28/08/2015 a 27/11/2025**. Ativas 262; 19 com `ativo = 0` (excluídas) — estas
**não** entram na migração.

`tipo` é um `int` sem tabela de apoio, com os três valores chumbados no `<select>` do
`create.asp`: **1 = Análise Crítica** (17), **2 = Setorial** (59), **3 = Outros** (203).

`cliente` está preenchido em **264 das 281**. Ou seja: apesar de morar na Qualidade, este é na
prática o registro de **reunião com cliente**, e não só de reunião interna. Vale ter isso em
mente ao desenhar filtros e a aba do cliente.

Pauta preenchida em 275; ata em 268.

---

## 2. O problema dos participantes — e por que ele decide o desenho

O v1 tem **dois mecanismos concorrentes** para a mesma informação:

- `sgq_reu_par` — tabela relacional, `ID_REUNIAO` + `PARTICIPANTE` (id do usuário). Cobre
  **47 reuniões**, 237 vínculos.
- `sgq_reu.participantes` — um `longtext` com nomes soltos separados por vírgula, alimentado
  por um `select2-tags`. Cobre **193 reuniões**.

Só **6 reuniões** têm os dois. E, decisivo: **nenhum arquivo do módulo grava em `sgq_reu_par`**
— `details.asp` e `page-print_old.asp` apenas *leem* dela. A tabela por ID é o mecanismo
**antigo**, e o v1 regrediu para texto livre em algum momento.

O que o texto livre guarda (amostra real):

```
#281  Rosimeri Victor,Juliana Ferreira,Octacilio,Ana
#278  Rose Munhão,Gilciane Lecchi,Ludmilla Teodoro,...,Geovana,Sheila,Walace,Val
#277  Fabiana Alves,Gilciane Lecchi,LUCIENE
```

Zero registros só-numéricos: são nomes, e nomes inconsistentes — só primeiro nome, caixa alta,
apelido. Alguns nem são usuários do sistema (é gente do cliente, o que faz sentido dado que
264 reuniões têm cliente).

**Decisão de desenho.** O v2 tem um caminho só, `reuniao_participantes`, que guarda
`usuario_id` **sempre que existir um usuário** e cai para `nome` quando o participante é
externo. Isso respeita a regra da casa (vínculo por ID) sem inventar usuário para convidado
de fora. A migração dos dados terá de casar ~193 listas de nomes contra `ger_cad_usu`, e o que
não casar fica como nome — com relatório do que sobrou, para conferência.

O mesmo padrão aparece nas ações: `sgq_reu_aca.responsavel` é `varchar` preenchido em **133 das
140**, enquanto `id_usuario` só tem **41**. Daí o par `responsavel_id` + `responsavel_nome`.

---

## 3. O que NÃO vem do v1

- **Participantes como texto** — vira vínculo por ID (§2).
- **Responsável da ação como texto** — idem.
- **`sgq_reu_par` órfã** — a tabela morta some; seus 237 vínculos são aproveitados na migração,
  já que ali o dado está por ID e é melhor que o texto.
- **Log com frase pronta** (`"Editou a ação #115"`) — no v2 o evento é um código e o detalhe
  fica em coluna própria, para dar para filtrar.
- **SQL concatenado** — Prisma em tudo.
- **`hlp_usuarios.asp` consultando `SGQ_MEL`** (permissão de *Melhorias*) dentro do módulo de
  Reuniões — copy-paste do v1, não se repete.

---

## 4. Fases

### Fase 1 — Schema ✅ (17/08/2026)
6 models no Prisma (`Reuniao`, `ReuniaoParticipante`, `ReuniaoAcao`, `ReuniaoArquivo`,
`ReuniaoMensagem`, `ReuniaoLog`) + `packages/db/prisma/sql/add_reunioes.sql`, aditivo e
idempotente (aplicado 2× no dev, 6 tabelas e 10 FKs).

### Fase 2 — Backend ✅ (17/08/2026)
Módulo NestJS + router tRPC: CRUD da reunião, participantes, ações (com conclusão), mensagens,
anexos e log. Sub-permissões `registrar` / `ver_todas` / `gerenciar_acoes` / `excluir`.

### Fase 3 — Interface ✅ (19/08/2026)
Listagem (filtro por tipo e "Com ação pendente", com farol de vencidas derivado no backend),
cadastro (participantes por ID + convidados externos por nome), detalhe (pauta/ata em
`RichEditor`, plano de ação com concluir/reabrir, mensagens, anexos, trilha) e o cadastro de
tipos em `/reunioes/configuracoes`. Item saiu de `wip` no menu.

### Fase 4 — Painel de ações ✅ (19/08/2026)
`/reunioes/acoes`: a contagem que o v1 mostrava como número solto no menu, agora respondendo
*de quem* e *de qual reunião*. Por padrão as ações do próprio usuário; `ver_todas` abre para a
equipe; concluir direto da lista.

### Fase 5 — Migração dos dados ✅ (19/08/2026)
262 reuniões, 1.291 participantes (636 por ID, 655 por nome — juntando os DOIS mecanismos do
v1: a tabela `sgq_reu_par` e o longtext, com dedupe por pessoa), 26 ações (as outras 114 do
total estão soft-deletadas no v1 e ficam de fora), 2 anexos com arquivo em disco (10 dos 12
apontam para arquivo que sumiu), 1 mensagem. Cliente casado por CNPJ em 221; área herdada do
setor do autor em todas as 262 — que era exatamente como o v1 derivava a área.

---

## 5. Decisões aplicadas

1. **Área da reunião** — herdada do setor do autor na migração (como o v1 derivava), casando o
   nome do `ger_cad_set` contra as Áreas do v2. Na tela nova o campo é explícito.
2. **Tipos de reunião** — viraram cadastro (`reuniao_tipos`), pela mesma decisão do Wagner nos
   tipos de documento e métodos de capacitação. Os três do v1 entram pela migração.
3. **Ligação com a Agenda** — fora do escopo deste port; fica como evolução futura.

## 6. Achado importante do snapshot de dev

O escopo por empresa nos imports precisa ser `empresaId = EMP **ou nulo**`: no snapshot de dev
parte das linhas da Central (30 usuários, todas as áreas, 761 clientes) ainda está com
`empresa_id` nulo — backfill antigo pela metade — enquanto em produção está tudo etiquetado.
Filtrar só por EMP perdia metade dos casamentos no dev (área ficava 0/262, cliente 90/247) sem
nunca falhar. Vale para os três scripts de import de legado.
