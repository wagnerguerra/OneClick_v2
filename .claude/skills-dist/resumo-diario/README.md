# Skill: Resumo Diário para a Diretoria

Gera, ao fim do dia, um **relatório de uma página em HTML** contando — em **linguagem simples,
para quem não programa** — o que a sessão de desenvolvimento entregou. A skill **se adapta
sozinha ao seu projeto** (descobre o nome do sistema, as frentes de trabalho e a forma de
publicação), então serve para qualquer repositório.

## Como instalar

Copie a pasta `resumo-diario/` inteira para dentro de `.claude/skills/` do **seu projeto**:

```
<seu-projeto>/
└── .claude/
    └── skills/
        └── resumo-diario/
            ├── SKILL.md
            ├── README.md
            └── assets/
                └── template.html
```

Pronto. Na próxima vez que abrir o Claude Code nesse projeto, a skill já estará disponível.

> Dica: a pasta precisa ficar em `.claude/skills/` (não em `skills-dist/` nem outra). É só ali
> que o Claude Code procura skills.

## Como usar

No fim do expediente, dentro do projeto, peça algo como:

- "gera o resumo do dia"
- "fecha o relatório da diretoria"
- "o que fizemos hoje?"
- "resumo de ontem" (ela entende a data)

O relatório é salvo em `docs/relatorios/resumo-AAAA-MM-DD.html` (a pasta é criada se não existir)
e commitado localmente **sem push** — você revisa e publica quando quiser. Abra o arquivo no
navegador para conferir antes de repassar.

## O que ela faz por baixo

1. **Descobre o projeto** — nome, do que se trata, as frentes de trabalho do dia e como o projeto
   publica (Makefile, GitHub Actions, etc.).
2. **Levanta o dia** — cruza os commits do dia (`git log`) com o contexto da própria conversa
   (decisões e investigações que não viraram commit).
3. **Traduz para linguagem de diretoria** — o princípio é sempre "o que o usuário final ganha com
   isso?", nunca copiar a mensagem técnica do commit.
4. **Monta o HTML** a partir do `assets/template.html` (visual pronto, tema claro/escuro) e salva
   datado em `docs/relatorios/`.

## Ajustes

O tom e o nível de detalhe podem ser lapidados editando o `SKILL.md` (as seções "Princípio
central" e "Passo a passo"). O visual do relatório fica no `assets/template.html`.
