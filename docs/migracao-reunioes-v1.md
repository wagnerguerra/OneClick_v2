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
`ReuniaoMensagem`, `ReuniaoLog`) + `packages/db/migrations/manual_2026_08_17_reunioes.sql`, aditivo e
idempotente (aplicado 2× no dev, 6 tabelas e 10 FKs).

### Fase 2 — Backend
Módulo NestJS + router tRPC: CRUD da reunião, participantes, ações (com conclusão), mensagens,
anexos e log. Permissão `reunioes` no catálogo, no mesmo formato de `elogios`/`reclamacoes`/
`sugestoes`. Listagem paginada server-side pelo helper padrão.

### Fase 3 — Interface
Listagem no padrão dos módulos (header inline de `/orcamentos`, tabela server-side, filtros por
tipo/cliente/período) e detalhe com as abas Geral / Ações / Mensagens / Anexos / Atividades, no
padrão de sub-abas com pills laterais. Pauta e ata em `RichEditor`.

### Fase 4 — Painel de ações
A contagem de ações vencidas que o v1 mostrava no menu, agora como indicador de verdade: ações
por responsável, farol de prazo e a pergunta que o v1 não respondia — *o que ficou pendente das
últimas reuniões*.

### Fase 5 — Migração dos dados
Importa as 262 reuniões ativas, ações, anexos, mensagens e log. Participantes por ID quando der
match; o resto como nome, com relatório de não-casados. Só depois disso o v1 é desativado, pelo
procedimento de [[v1-desativacao-sempre-com-alert]] (aviso na tela + botão desabilitado +
bloqueio server-side em `create.asp`).

---

## 5. Pontos a decidir com o Wagner

1. **Área da reunião.** O v1 derivava do setor de quem registrou (`ger_cad_set` via
   `ger_cad_usu.cad_usu_setor`). Deixei `area_id` explícito no modelo — na migração, herdar do
   autor ou deixar vazio?
2. **Ligação com a Agenda.** O v2 já tem `/agenda` com tipos de evento. Uma reunião registrada
   poderia gerar (ou casar com) um evento da agenda. Não está na Fase 1; é ganho real, mas muda
   o escopo.
3. **Tipos de reunião.** Mantive os três do v1 como valor de texto. Se a ideia é o pessoal
   cadastrar tipos novos, vira tabela de apoio — melhor decidir antes da Fase 3.
