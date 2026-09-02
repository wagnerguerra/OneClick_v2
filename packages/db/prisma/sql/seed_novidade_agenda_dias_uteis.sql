-- Novidade: dias uteis na recorrencia de eventos da agenda.
--
-- Mesmo padrao de seed_novidade_faq_hub.sql: vai por SQL de deploy para a
-- novidade nascer junto com a funcionalidade, e uma linha POR EMPRESA porque
-- `novidadesPublicas` casa `empresa_id` exato (relatorio-ti.service.ts).
--
-- Idempotente pelo titulo: o deploy nao reaplica o arquivo (controla por md5),
-- mas rodar de novo a mao nao duplica.

INSERT INTO novidades (id, empresa_id, titulo, descricao, tipo, modulo_slug, ordem, ativo, publicado_em)
SELECT
  gen_random_uuid()::text,
  e.id,
  'Agenda: eventos repetidos podem pular fins de semana e feriados',
  'Ao criar um evento que se repete, apareceu uma opção nova: "Fins de semana e feriados".

Em repetições diárias, escolher "Contar somente dias úteis" faz o sistema pular sábados, domingos e feriados. Marcar 20 sessões passa a agendar 20 atendimentos de verdade — antes eram 20 dias corridos, e os que caíam no fim de semana se perdiam.

Em repetições semanais, mensais e anuais o comportamento é outro, porque a data importa: quando ela cai num dia não útil, você escolhe se o compromisso é adiado para o próximo dia útil ou antecipado para o anterior. É isso que resolve o "todo dia 01" — se o dia 1º cai num domingo ou feriado, o lembrete vai para o primeiro dia útil em vez de ficar num dia em que ninguém trabalha.

Os feriados considerados são os cadastrados no sistema, incluindo estaduais e municipais.

Quem não quiser mudar nada não precisa fazer nada: a opção padrão mantém a data exata, como sempre foi, e nenhum evento já criado foi alterado.',
  'MELHORIA',
  'agenda',
  0,
  true,
  now()
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM novidades n
   WHERE n.empresa_id = e.id
     AND n.titulo = 'Agenda: eventos repetidos podem pular fins de semana e feriados'
);

INSERT INTO novidades (id, empresa_id, titulo, descricao, tipo, modulo_slug, ordem, ativo, publicado_em)
SELECT
  gen_random_uuid()::text,
  NULL,
  'Agenda: eventos repetidos podem pular fins de semana e feriados',
  'Ao criar um evento que se repete, apareceu uma opção nova: "Fins de semana e feriados".

Em repetições diárias, escolher "Contar somente dias úteis" faz o sistema pular sábados, domingos e feriados. Marcar 20 sessões passa a agendar 20 atendimentos de verdade — antes eram 20 dias corridos, e os que caíam no fim de semana se perdiam.

Em repetições semanais, mensais e anuais o comportamento é outro, porque a data importa: quando ela cai num dia não útil, você escolhe se o compromisso é adiado para o próximo dia útil ou antecipado para o anterior. É isso que resolve o "todo dia 01" — se o dia 1º cai num domingo ou feriado, o lembrete vai para o primeiro dia útil em vez de ficar num dia em que ninguém trabalha.

Os feriados considerados são os cadastrados no sistema, incluindo estaduais e municipais.

Quem não quiser mudar nada não precisa fazer nada: a opção padrão mantém a data exata, como sempre foi, e nenhum evento já criado foi alterado.',
  'MELHORIA',
  'agenda',
  0,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM novidades n
   WHERE n.empresa_id IS NULL
     AND n.titulo = 'Agenda: eventos repetidos podem pular fins de semana e feriados'
);
