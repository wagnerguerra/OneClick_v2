-- Novidade: o novo hub do FAQ (capa com busca, tópicos e lista).
--
-- Vai por SQL de deploy de propósito. O painel de novidades lê da tabela, então
-- publicar pela tela agora anunciaria uma melhoria que ainda não está no ar —
-- aqui a novidade nasce no mesmo instante em que o código sobe.
--
-- Uma linha POR EMPRESA porque `novidadesPublicas` casa `empresa_id` exato
-- (relatorio-ti.service.ts): não existe "novidade global". A linha com
-- empresa_id NULL atende quem ainda não tem empresa vinculada.
--
-- Idempotente pelo título: o deploy já não reaplica o arquivo (controla por
-- md5), mas rodar de novo à mão não duplica.

INSERT INTO novidades (id, empresa_id, titulo, descricao, tipo, modulo_slug, ordem, ativo, publicado_em)
SELECT
  gen_random_uuid()::text,
  e.id,
  'FAQ: nova busca e navegação por tópico',
  'A página de FAQ''s foi refeita. Ela agora abre com um campo de busca em destaque, que procura ao mesmo tempo no título, na descrição, no módulo e nas palavras-chave de cada artigo.

Logo abaixo, os assuntos aparecem como cartões — Comercial, Fiscal, Operacional, Trabalhista, Cadastros e estrutura e Templates por Segmento — cada um com a quantidade de artigos. Clicar num assunto filtra a lista; clicar de novo mostra tudo outra vez. A contagem acompanha a busca, então dá para ver de relance em que assunto está o que você procurou.

A lista de artigos ficou mais compacta, com o módulo e a descrição na mesma linha, e ganhou uma coluna ao lado com sugestões para quem está começando e um atalho para abrir chamado no HelpDesk quando o artigo não resolver.',
  'MELHORIA',
  'faq',
  0,
  true,
  now()
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM novidades n
   WHERE n.empresa_id = e.id
     AND n.titulo = 'FAQ: nova busca e navegação por tópico'
);

INSERT INTO novidades (id, empresa_id, titulo, descricao, tipo, modulo_slug, ordem, ativo, publicado_em)
SELECT
  gen_random_uuid()::text,
  NULL,
  'FAQ: nova busca e navegação por tópico',
  'A página de FAQ''s foi refeita. Ela agora abre com um campo de busca em destaque, que procura ao mesmo tempo no título, na descrição, no módulo e nas palavras-chave de cada artigo.

Logo abaixo, os assuntos aparecem como cartões — Comercial, Fiscal, Operacional, Trabalhista, Cadastros e estrutura e Templates por Segmento — cada um com a quantidade de artigos. Clicar num assunto filtra a lista; clicar de novo mostra tudo outra vez. A contagem acompanha a busca, então dá para ver de relance em que assunto está o que você procurou.

A lista de artigos ficou mais compacta, com o módulo e a descrição na mesma linha, e ganhou uma coluna ao lado com sugestões para quem está começando e um atalho para abrir chamado no HelpDesk quando o artigo não resolver.',
  'MELHORIA',
  'faq',
  0,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM novidades n
   WHERE n.empresa_id IS NULL
     AND n.titulo = 'FAQ: nova busca e navegação por tópico'
);
