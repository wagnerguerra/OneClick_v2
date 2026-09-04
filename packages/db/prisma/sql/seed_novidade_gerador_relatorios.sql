-- Novidade: gerador de relatorios do cadastro de clientes.
--
-- Mesmo padrao de seed_novidade_agenda_dias_uteis.sql: vai por SQL de deploy
-- para a novidade nascer junto com a funcionalidade, e uma linha POR EMPRESA
-- porque `novidadesPublicas` casa `empresa_id` exato (relatorio-ti.service.ts),
-- mais uma linha global (empresa_id NULL).
--
-- `modulo_slug = 'clientes'`: o rodape do detalhe diz qual modulo a novidade
-- toca, e quem le precisa saber onde ir.
--
-- Idempotente pelo titulo: o deploy nao reaplica o arquivo (controla por md5),
-- mas rodar de novo a mao nao duplica.

INSERT INTO novidades (id, empresa_id, titulo, descricao, tipo, modulo_slug, ordem, ativo, publicado_em)
SELECT
  gen_random_uuid()::text,
  e.id,
  'Clientes: monte o seu próprio relatório, com os campos que quiser',
  'O cadastro de clientes ganhou um gerador de relatórios. Ele fica em Clientes → menu de três pontos → Relatórios → "Gerador de Relatórios".

COMO FUNCIONA

Você escolhe as colunas numa lista com cerca de 55 campos, agrupados por assunto: identificação, comercial, fiscal, endereço, contato, serviços, contrato, legalização, societário, benefícios e integrações. Marque o que interessa, arraste as etiquetas para definir a ordem das colunas, e a prévia mostra o resultado antes de baixar — com o total real de clientes, não só as 20 linhas exibidas.

O download sai em Excel, CSV ou PDF.

FILTRE POR QUALQUER COLUNA

Clique no nome de uma coluna e pergunte dela: "Situação é um de Mensal", "Tributação é um de Simples Nacional", "Entrada na casa entre duas datas", "Possui funcionários: sim". A etiqueta passa a mostrar o que está filtrando, e a pergunta que cada campo aceita depende do que ele é — texto aceita "contém", data aceita "entre", e assim por diante.

Se você chegar vindo da listagem de clientes com filtros aplicados, eles vêm junto: filtrar a lista e então querer aquilo em planilha não custa um segundo preenchimento.

RELATÓRIOS PRONTOS E RELATÓRIOS SEUS

Já vêm seis relatórios do sistema, disponíveis para todos: carteira mensal por tributação, clientes sem serviço contratado, clientes sem tributação preenchida, clientes com benefício fiscal, contatos da carteira e ex-clientes.

E você pode salvar os seus, escolhendo se ficam só para você ou visíveis para toda a empresa. Um relatório do sistema que você ajustar vira uma cópia sua — o original continua igual para o restante do time. A estrela fixa o que você mais usa no topo da lista.

O QUE CADA UM ENXERGA

O relatório respeita as permissões de quem o executa, campo a campo. Quem não pode ver honorário não encontra esse campo na lista, e um relatório salvo por outra pessoa sai sem essa coluna quando ele abrir. A definição é a mesma; o resultado depende de quem gera.

Montar e salvar relatórios próprios é uma permissão nova, "Montar e salvar relatórios próprios", dentro do módulo Clientes. Os relatórios prontos do sistema ficam abertos a quem já tem acesso ao módulo.',
  'NOVO',
  'clientes',
  0,
  true,
  now()
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM novidades n
   WHERE n.empresa_id = e.id
     AND n.titulo = 'Clientes: monte o seu próprio relatório, com os campos que quiser'
);

INSERT INTO novidades (id, empresa_id, titulo, descricao, tipo, modulo_slug, ordem, ativo, publicado_em)
SELECT
  gen_random_uuid()::text,
  NULL,
  'Clientes: monte o seu próprio relatório, com os campos que quiser',
  'O cadastro de clientes ganhou um gerador de relatórios. Ele fica em Clientes → menu de três pontos → Relatórios → "Gerador de Relatórios".

COMO FUNCIONA

Você escolhe as colunas numa lista com cerca de 55 campos, agrupados por assunto: identificação, comercial, fiscal, endereço, contato, serviços, contrato, legalização, societário, benefícios e integrações. Marque o que interessa, arraste as etiquetas para definir a ordem das colunas, e a prévia mostra o resultado antes de baixar — com o total real de clientes, não só as 20 linhas exibidas.

O download sai em Excel, CSV ou PDF.

FILTRE POR QUALQUER COLUNA

Clique no nome de uma coluna e pergunte dela: "Situação é um de Mensal", "Tributação é um de Simples Nacional", "Entrada na casa entre duas datas", "Possui funcionários: sim". A etiqueta passa a mostrar o que está filtrando, e a pergunta que cada campo aceita depende do que ele é — texto aceita "contém", data aceita "entre", e assim por diante.

Se você chegar vindo da listagem de clientes com filtros aplicados, eles vêm junto: filtrar a lista e então querer aquilo em planilha não custa um segundo preenchimento.

RELATÓRIOS PRONTOS E RELATÓRIOS SEUS

Já vêm seis relatórios do sistema, disponíveis para todos: carteira mensal por tributação, clientes sem serviço contratado, clientes sem tributação preenchida, clientes com benefício fiscal, contatos da carteira e ex-clientes.

E você pode salvar os seus, escolhendo se ficam só para você ou visíveis para toda a empresa. Um relatório do sistema que você ajustar vira uma cópia sua — o original continua igual para o restante do time. A estrela fixa o que você mais usa no topo da lista.

O QUE CADA UM ENXERGA

O relatório respeita as permissões de quem o executa, campo a campo. Quem não pode ver honorário não encontra esse campo na lista, e um relatório salvo por outra pessoa sai sem essa coluna quando ele abrir. A definição é a mesma; o resultado depende de quem gera.

Montar e salvar relatórios próprios é uma permissão nova, "Montar e salvar relatórios próprios", dentro do módulo Clientes. Os relatórios prontos do sistema ficam abertos a quem já tem acesso ao módulo.',
  'NOVO',
  'clientes',
  0,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM novidades n
   WHERE n.empresa_id IS NULL
     AND n.titulo = 'Clientes: monte o seu próprio relatório, com os campos que quiser'
);
