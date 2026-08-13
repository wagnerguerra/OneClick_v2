-- =====================================================================
-- folha_dash — schema completo (idempotente, SEM dados)
-- Gerado por gerar_schema_sql.py a partir de setup_supabase.py + *.sql
--
-- Recria toda a estrutura que o backend do OneClick lê via FOLHA_DASH_URL:
--   schema folha_dash (dim_*/fato_*/classif_*/inss_*), views public.folha_*,
--   e a engine de agrupamento (resolver_todos()/resolver_esquema() + dim_verba_grupo).
--
-- COMO RODAR EM PRODUÇÃO (Postgres dedicado do folha_dash):
--   createdb folha_dash_db            # se ainda não existe
--   psql "<FOLHA_DASH_URL>" -f folha_dash_schema.sql
-- É idempotente: rodar de novo não quebra.
--
-- DEPOIS do schema, os DADOS (não vêm neste arquivo):
--   a) dim_classe (lista mestra de classes)  -> python carregar_classes.py
--      (ou rode tudo de uma vez: SUPABASE_DB_URL=<prod> python setup_supabase.py)
--   b) config de agrupamento (classif_*)      -> scripts/folha-bi/seed-agrupamentos.sql (PR #39)
--   c) dados por empresa (dim_*/fato_*)        -> ETL: importar_empresa.py (launcher)
--   d) materializar a ponte verba->grupo       -> select folha_dash.resolver_todos();
-- =====================================================================


-- ==== 0) Roles (num Postgres dedicado precisam existir p/ os GRANTs) ====
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;


-- ==== 1) Modelo dimensional (supabase_modelo_dimensional.sql) ====
-- =====================================================================
-- Modelo dimensional analítico — Portal de Folha (Supabase / PostgreSQL)
-- Fase 2. Alimentado pela ETL a partir do SCI (BI Connection).
-- Convenção: chaves de negócio do SCI preservadas (cod_emp, cod_col, ref...).
-- =====================================================================

-- ---------- ISOLAMENTO -----------------------------------------------
-- Tudo vive num schema próprio: NÃO altera nenhuma tabela existente do
-- Supabase (que ficam em 'public' ou outros schemas). Para remover o
-- módulo basta um "drop schema folha_dash cascade".
-- No Supabase, expor este schema em Settings → API → Exposed schemas
-- (ou acessar via service role) para o app conseguir ler.
create schema if not exists folha_dash;
set search_path to folha_dash;

-- ---------- DIMENSÕES ------------------------------------------------

create table if not exists dim_empresa (
  cod_emp     integer primary key,
  cnpj        text,
  razao       text,
  apelido     text,
  atualizado_em timestamptz not null default now()
);

create table if not exists dim_competencia (
  ref          integer primary key,            -- AAAAMM
  ano          smallint not null,
  mes          smallint not null,
  primeiro_dia date not null,
  ultimo_dia   date not null
);

create table if not exists dim_colaborador (
  cod_emp        integer not null,
  cod_col        integer not null,
  nome           text,
  data_admissao  date,
  cod_sindicato  integer,
  atualizado_em  timestamptz not null default now(),
  primary key (cod_emp, cod_col)
);

create table if not exists dim_centro_custo (
  cod_emp     integer not null,
  cod_centro  integer not null,
  cod_tpcc    integer not null,
  descricao   text,
  setor       text,
  primary key (cod_emp, cod_centro, cod_tpcc)
);

create table if not exists dim_verba (
  cod_emp          integer not null,
  cod_verba        integer not null,           -- código da verba na empresa
  cod_verba_global integer,                     -- BDCODVER (catálogo)
  descricao        text,
  classe_verba     text,                        -- BDCLAVER ex.: 0.006.0.0.001
  classe_natureza  text,                        -- caminho após a raiz ex.: 006.0.0.001
  nivel            smallint,                    -- BDNIVELVER
  tipo_pdi         smallint,                    -- VW_TVERBAS.BDTIPOCODVER: 0=Provento 1=Desconto 2=Informativa
  natureza_esocial text,                        -- BDNATRUBRICA
  inc_inss         smallint,                    -- BDINCIDENCIAINSS
  inc_fgts         smallint,                    -- BDINCIDENCIAFGTS
  inc_ir           smallint,                    -- BDINCIDENCIAIR
  primary key (cod_emp, cod_verba)
);

create table if not exists dim_causa_desligamento (
  cod_pres         integer primary key,         -- BDCODPRES
  descricao        text,                        -- BDDESCPRES
  perc_multa_fgts  numeric(5,2),                -- 40 / 20 / 0
  guia_rescisoria  boolean,                     -- BDGRRFPRES (recolhe via GRRF)
  mtv_esocial      integer                      -- BDCODMOTESRESC (mtvDeslig)
);

-- Parâmetros patronais por empresa/competência ← VRHF_BASE_TEMPGPS
--   BDEMPEMP (% patronal, ~20), BDFAP, BDPERTERC (% terceiros ~5,8), BDDESONTOMAEMP (CPRB)
--   OBS: BDRAT da TEMPGPS é sempre NULO — o RAT real vem por centro de custo (ver abaixo).
create table if not exists param_encargo_empresa (
  cod_emp        integer not null,
  ref            integer not null,             -- BDREFEMP (AAAAMM)
  perc_patronal  numeric(7,4),                 -- BDEMPEMP (ex.: 20.0000)
  fap            numeric(7,4),                 -- BDFAP
  perc_terceiros numeric(7,4),                 -- BDPERTERC (ex.: 5.8000)
  desonerado     boolean,                      -- BDDESONTOMAEMP (CPRB)
  cod_fpas_terc  integer,                      -- BDCODFPASTERC
  primary key (cod_emp, ref)
);

-- Parâmetros de RAT/FAP por CENTRO DE CUSTO/competência ← VRH_BASE_TCUSTOM_GPS
--   BDRAT (1/2/3%), BDFAPTOM, BDCODCNAE, BDEMPTOM. RAT varia por estabelecimento/setor.
create table if not exists param_encargo_centro (
  cod_centro    integer not null,              -- BDCODCENTRO
  cod_tpcc      integer not null,              -- BDCODTPCC
  ref           integer not null,              -- BDREFCUSTO
  aliq_rat      numeric(7,4),                  -- BDRAT (ex.: 3.0000)
  fap           numeric(7,4),                  -- BDFAPTOM
  perc_patronal numeric(7,4),                  -- BDEMPTOM
  cod_cnae      integer,                       -- BDCODCNAE
  primary key (cod_centro, cod_tpcc, ref)
);

-- ---------- FATOS ----------------------------------------------------

-- Verbas da folha (SP_BI_CONF_FOLHA). Grão: empresa × competência × colab × verba.
create table if not exists fato_folha (
  cod_emp   integer not null,
  ref       integer not null,                   -- BDREF (AAAAMM)
  cod_col   integer,                            -- BDCODCOL
  cod_ter   integer,                            -- BDCODTER (terceiro/contribuinte)
  cod_verba integer not null,
  cod_tpcc  integer,                            -- centro de custo
  ordem     integer,
  descricao text,
  valor     numeric(15,2) not null default 0,
  carga_id  bigint                              -- referência ao lote de carga
);
create index if not exists ix_fato_folha_emp_ref on fato_folha (cod_emp, ref);
create index if not exists ix_fato_folha_col on fato_folha (cod_emp, cod_col);

-- Provisões (SPRH_CALC_FERIAS / SPRH_CALC_13SALARIO). Grão: empresa × ref × colab × tipo.
create table if not exists fato_provisao (
  cod_emp   integer not null,
  ref       integer not null,
  cod_col   integer not null,
  tipo      text not null check (tipo in ('ferias','decimo')),
  base_inss numeric(15,2), base_fgts numeric(15,2), base_ir numeric(15,2),
  inss numeric(15,2), fgts numeric(15,2), irrf numeric(15,2),
  valor numeric(15,2),
  carga_id  bigint,
  primary key (cod_emp, ref, cod_col, tipo)
);

-- Snapshot de ativos por competência (SP_SOMENTE_ATIVOS). Grão: empresa × ref × colab.
create table if not exists fato_ativos (
  cod_emp   integer not null,
  ref       integer not null,
  cod_col   integer not null,
  cod_sit   integer,
  ativo     boolean not null default true,
  data_ini_sit date, data_fim_sit date,
  carga_id  bigint,
  primary key (cod_emp, ref, cod_col)
);

-- Rescisões (VRH_EMP_TRESCISAO) — base da composição da guia de FGTS. Grão: empresa × ref × colab.
create table if not exists fato_rescisao (
  cod_emp           integer not null,
  ref               integer not null,
  cod_col           integer not null,
  data_rescisao     date,
  cod_pres          integer,                    -- causa (FK lógica dim_causa_desligamento)
  val_fgts_resc     numeric(15,2),
  base_multa_fgts   numeric(15,2),
  calc_fgts_mes_ant boolean,                    -- BDCALCFGTSMESANT (antecipa competência na rescisória)
  data_pag_grfc     date,
  carga_id          bigint,
  primary key (cod_emp, ref, cod_col)
);

-- Datas de pagamento / competência de caixa do IRRF, por cálculo.
-- Fonte: cabeçalhos por tipo de cálculo (cada um traz data de pagamento e BDREFIRRFESOCIAL,
-- que o SCI já calcula = competência do IRRF no regime de CAIXA).
--   folha normal  ← VRHF_EMP_TFOLHANORMAL (BDREFFN, BDDATAPGTOFN, BDREFIRRFESOCIAL)
--   adiantamento  ← VRHF_EMP_TADSAL       (BDREFAD,  BDDATAIRRFESOCIAL, BDREFIRRFESOCIAL)
--   férias        ← VRH_EMP_TFERIAS       (BDREFPAGFE, BDDATAPAGFE, BDREFIRRFESOCIAL)
--   13º/adto/compl← VRHF_EMP_T13SAL/TA13SAL/TC13SAL (BDDATAPGTO13…, BDREFIRRFESOCIAL)
--   rescisão      ← VRH_EMP_TRESCISAO     (BDDATAPAGRESCISAO)
--   PLR           ← VRHF_EMP_TFOLHAAVULSA (BDTIPOEVT=11; BDDATAPGTOFA, BDREFIRRFESOCIAL; IRRF PLR=BDIRRFPLRFA, DARF 0588 exclusivo)
create table if not exists fato_pagamento_calc (
  cod_emp        integer not null,
  cod_col        integer not null,
  ref            integer not null,            -- competência da folha (regime de COMPETÊNCIA)
  tipo_calc      text not null,               -- folha_normal|adiantamento|ferias|decimo|adto13|compl13|rescisao|plr
  data_pgto      date,                        -- data de pagamento
  ref_irrf_caixa integer,                     -- BDREFIRRFESOCIAL (competência do IRRF no regime de CAIXA)
  carga_id       bigint,
  primary key (cod_emp, cod_col, ref, tipo_calc)
);

-- ---------- CONTROLE DE CARGA (idempotência / retomada) --------------
create table if not exists controle_carga (
  id         bigint generated always as identity primary key,
  rotina     text    not null,                  -- ex.: 'r06_folha'
  cod_emp    integer,
  ref        integer,                           -- competência (quando aplicável)
  status     text    not null default 'pendente'
             check (status in ('pendente','executando','concluido','erro')),
  registros  integer,
  tentativas smallint not null default 0,
  inicio     timestamptz,
  fim        timestamptz,
  erro       text,
  unique (rotina, cod_emp, ref)
);
create index if not exists ix_controle_status on controle_carga (status, rotina);

comment on table controle_carga is
 'Uma linha por unidade de trabalho (rotina × empresa × competência). O runner processa as pendentes, faz retry e permite retomada.';


-- ==== 2) Delta de tabelas (dim_colaborador, fato_bases, fato_fgts, inss_*, etc.) ====
set search_path to folha_dash;
alter table dim_colaborador add column if not exists cod_centro integer;
alter table dim_colaborador add column if not exists cod_tpcc integer;
alter table dim_colaborador add column if not exists setor text;
alter table dim_colaborador add column if not exists cpf text;            -- p/ planilha de custos
alter table dim_colaborador add column if not exists data_admissao date;  -- p/ planilha de custos
alter table dim_colaborador add column if not exists cargo text;          -- p/ planilha de custos (eSocial)
alter table dim_colaborador add column if not exists autonomo boolean default false;  -- contribuinte individual via RPA (grupo separado nos painéis)
create table if not exists fato_bases (
  cod_emp integer not null, ref integer not null, cod_col integer not null,
  base_inss numeric(15,2), inss_emp numeric(15,2), base_fgts numeric(15,2),
  fgts numeric(15,2), base_irrf numeric(15,2), irrf numeric(15,2),
  primary key (cod_emp, ref, cod_col)
);
-- FGTS detalhado (split eSocial mês/13º/indenizado + adto 13º), por colaborador/competência.
-- aliquota = fgts_mes/base_mes*100 (8,0 geral · 2,0 aprendiz) — flag de conferência.
create table if not exists fato_fgts (
  cod_emp integer not null, ref integer not null, cod_col integer not null,
  base_mes numeric(15,2), fgts_mes numeric(15,2),
  base_13  numeric(15,2), fgts_13  numeric(15,2),
  base_ind numeric(15,2), fgts_ind numeric(15,2),
  base_a13 numeric(15,2), fgts_a13 numeric(15,2),
  aliquota numeric(6,3),
  base_fixo numeric(15,2), base_var numeric(15,2),   -- base mensal cód-11 segregada Fixo×Variável
  resc_antecipada boolean not null default false,    -- rescisão antecipada (FGTS do mês vai p/ rescisória)
  primary key (cod_emp, ref, cod_col)
);
-- Guia rescisória de FGTS por colaborador (sem justa causa / acordo / antecipado).
-- ref = competência da rescisão (mês da BDDATARESCISAO). Total da guia rescisória =
--   antecipado: fgts_mes_ant+fgts_mes_resc+fgts_13 + fgts_ind + multa
--   não-antecipado: fgts_ind + multa  (mês/13 ficam na guia mensal)
create table if not exists fato_rescisao_fgts (
  cod_emp integer not null, ref integer not null, cod_col integer not null,
  data_rescisao date,
  mesant boolean not null default false,             -- antecipado (BDCALCFGTSMESANT='TRUE')
  perc_multa numeric(6,2),                           -- 40 (sem justa causa) · 20 (acordo) · 0
  saldo_fgts numeric(15,2),                          -- base da multa (BDSALDOFGTS)
  multa numeric(15,2),                               -- compensatório = saldo*perc/100
  fgts_mes_ant  numeric(15,2),                       -- FGTS do mês anterior (antecipado)
  fgts_mes_resc numeric(15,2),                       -- FGTS do mês da rescisão (eSocial mês)
  fgts_13       numeric(15,2),                       -- FGTS 13º da rescisão (eSocial 13)
  fgts_ind      numeric(15,2),                       -- FGTS indenizatório (aviso indenizado)
  primary key (cod_emp, ref, cod_col)
);
-- INSS por colaborador/competência. inss_emp = valor descontado do empregado (sem split).
-- base_inss = base patronal (eSocial BDBINSSAP, sem teto); base_fixo/var = split Fixo×Variável (inc_inss=11, ancorado).
create table if not exists fato_inss (
  cod_emp integer not null, ref integer not null, cod_col integer not null,
  inss_emp  numeric(15,2),                            -- INSS descontado do empregado (mês)
  base_inss numeric(15,2),                            -- base patronal (sem teto)
  base_fixo numeric(15,2), base_var numeric(15,2),
  primary key (cod_emp, ref, cod_col)
);
-- Alíquotas patronais de INSS por empresa/competência (RAT vem NULL p/ usuário BI → informado pelo cliente).
create table if not exists inss_param (
  cod_emp integer not null, ref integer not null,
  patronal_pct numeric(7,4), rat_pct numeric(7,4), fap numeric(7,4),
  gilrat_pct numeric(7,4), adic_gilrat_pct numeric(7,4), terc_pct numeric(7,4),
  cod_fpas integer, cod_terc integer,
  simples boolean default false,                     -- optante pelo Simples (BDSIMPLESGPS)
  prop_anexo4 numeric(9,6) default 1,                -- Simples concomitante: receita AnexoIV / total (1 = não-concomitante)
  receita_anexo4 numeric(15,2), receita_demais numeric(15,2),
  primary key (cod_emp, ref)
);
alter table inss_param add column if not exists simples boolean default false;
alter table inss_param add column if not exists prop_anexo4 numeric(9,6) default 1;
alter table inss_param add column if not exists receita_anexo4 numeric(15,2);
alter table inss_param add column if not exists receita_demais numeric(15,2);
-- Detalhe de Terceiros/Outras Entidades por fundo (conforme FPAS): Salário-Educação, INCRA, SENAI, SESI, SEBRAE...
create table if not exists inss_terceiros (
  cod_emp integer not null, ref integer not null, ordem integer not null,
  fundo text not null, pct numeric(7,4),
  primary key (cod_emp, ref, ordem)
);
-- RAT (%) por empresa, da planilha do cliente (BDCNAERATEMP vem NULL p/ usuário BI). Carregada por carregar_rat.py.
create table if not exists inss_rat (
  cod_emp integer primary key, rat_pct numeric(7,4), razao text
);
-- IRRF (DARF 0561) por tipo de cálculo. ref = apuração pela DATA DE PAGAMENTO (não competência).
-- tipo: folha_normal · adiantamento · ferias · decimo · rescisao · decimo_resc · plr. Fonte: views VW_IR_*.
create table if not exists fato_irrf (
  cod_emp integer not null, ref integer not null, cod_col integer not null,
  tipo text not null, base numeric(15,2), valor numeric(15,2),
  primary key (cod_emp, ref, cod_col, tipo)
);
-- Categoria de resumo por classe (p_*/d_*/informativo/excluir). Semeada por carregar_categorias.py, editável.
create table if not exists classe_categoria (
  classe text primary key, categoria text not null
);
-- Serviços de AUTÔNOMOS/RPA consolidados por COMPETÊNCIA (VRHF_BASE_CALC_TERC, mês de BDDATASERV).
-- bruto=BDCREDITOSERV (proventos) · liquido=BDLIQUIDO · bases INSS/IR. cod_col = -BDCODTER (autônomo).
-- Usado na reconciliação de proventos da matriz: total empregados + RPA = total de proventos da folha.
create table if not exists fato_autonomo_serv (
  cod_emp integer not null, ref integer not null, cod_col integer not null,
  bruto numeric(15,2) default 0, liquido numeric(15,2) default 0,
  base_inss numeric(15,2) default 0, base_ir numeric(15,2) default 0,
  entidades numeric(15,2) default 0,   -- SEST/SENAT do transportador autônomo (BDVALOUTENTIDADES), descontado do RPA
  primary key (cod_emp, ref, cod_col)
);
alter table fato_autonomo_serv add column if not exists entidades numeric(15,2) default 0;
alter table fato_folha add column if not exists quantidade numeric(15,2);  -- referência do evento (dias/horas)
alter table fato_folha add column if not exists adto_13 boolean default false;  -- verba da folha de adiantamento do 13º (TVERBAA13): fora da matriz/resumo, fica na planilha e no FGTS
alter table fato_folha add column if not exists origem smallint default 0;  -- 0=folha do mês (normal) · 1=folha complementar do mês (FC). NÃO filtra a matriz (o FC é custo da competência); serve p/ decompor o total na reconciliação da tela de Verbas
-- mapa competência de PAGAMENTO (ref) → mês(es) de REFERÊNCIA do FC (dissídio etc.), p/ rotular a reconciliação da tela de Verbas ("Folha complementar — ref. 05/06/07")
create table if not exists fc_comp_ref (
  cod_emp  integer not null,
  ref_pgto integer not null,   -- competência de pagamento (BDREFCOMP) = ref onde o FC é apresentado
  ref_orig integer not null,   -- mês de referência do FC (BDREFTOMADOR/BDREFFN)
  primary key (cod_emp, ref_pgto, ref_orig)
);
alter table fato_rescisao_fgts add column if not exists fgts_adto_13 numeric(15,2);  -- FGTS do adto 13º estornado do mês p/ a GRRF (demitido no mês do adiantamento)
alter table fato_provisao add column if not exists principal_fixo numeric(15,2);  -- split Fixo×Variável do principal
alter table fato_provisao add column if not exists principal_var numeric(15,2);
alter table fato_provisao add column if not exists prov_mes numeric(15,2);  -- provisão do mês (acréscimo bruto do principal): férias BDLINHAPFER in(4,5) · 13º BDLINHAP13 in(6,7)
alter table fato_inss add column if not exists base_gps numeric(15,2);  -- base patronal da GUIA (planilha): mês+FEFOL+13º−salário-maternidade, todos os demonstrativos
alter table fato_inss add column if not exists deducoes_fpas numeric(15,2);  -- deduções da guia: salário-família + salário-maternidade (reembolso INSS)
alter table fato_inss add column if not exists salario_base numeric(15,2);  -- salário base registrado (BDSALBASE) p/ a planilha
alter table fato_inss add column if not exists contrib_ind boolean default false;  -- contribuinte individual (pró-labore, sem FGTS): só CPP patronal 20%, SEM GILRAT/Terceiros
alter table fato_inss add column if not exists deducao_familia numeric(15,2);  -- dedução FPAS: salário-família (parte de deducoes_fpas)
alter table fato_inss add column if not exists deducao_maternidade numeric(15,2);  -- dedução FPAS: salário-maternidade mês+13º (parte de deducoes_fpas)
alter table fato_inss add column if not exists rat_apo_base numeric(15,2);  -- base do adicional RAT aposentadoria especial (folha: mês+férias+13º)
alter table fato_inss add column if not exists rat_apo numeric(15,2);  -- valor do adicional RAT apo. = base × alíquota individual (BDPERCRATCOL do cadastro)
alter table fato_inss add column if not exists sest_senat numeric(15,2);  -- SEST/SENAT do autônomo transportador (terceiros do contribuinte individual)
-- provisão do mês com breakdown (custo real = 1/12 avos + acerto) — idem migra_prov_mes.py
alter table fato_provisao add column if not exists mes_fixo  numeric(15,2);
alter table fato_provisao add column if not exists mes_var   numeric(15,2);
alter table fato_provisao add column if not exists mes_fgts  numeric(15,2);
alter table fato_provisao add column if not exists mes_inss  numeric(15,2);
alter table fato_provisao add column if not exists mes_total numeric(15,2);


-- ==== 3) Views públicas folha_* (consumidas pelo backend OneClick) ====
drop view if exists public.folha_bases cascade;   -- idempotente: re-run não falha por "cannot drop columns"
create or replace view public.folha_bases as
  select cod_emp, ref, cod_col, base_inss, inss_emp, base_fgts, fgts, base_irrf, irrf
  from folha_dash.fato_bases;
create or replace view public.folha_fgts as
  select cod_emp, ref, cod_col, base_mes, fgts_mes, base_13, fgts_13,
         base_ind, fgts_ind, base_a13, fgts_a13, aliquota, base_fixo, base_var, resc_antecipada
  from folha_dash.fato_fgts;
create or replace view public.folha_fgts_col as
  select f.cod_emp, f.ref, f.cod_col, c.nome as colaborador, c.cod_centro, c.setor,
         f.base_mes, f.fgts_mes, f.base_13, f.fgts_13, f.base_ind, f.fgts_ind,
         f.base_a13, f.fgts_a13, f.aliquota, f.base_fixo, f.base_var, f.resc_antecipada
  from folha_dash.fato_fgts f
  left join folha_dash.dim_colaborador c on c.cod_emp=f.cod_emp and c.cod_col=f.cod_col;
create or replace view public.folha_rescisao_col as
  select r.cod_emp, r.ref, r.cod_col, c.nome as colaborador, c.cod_centro, c.setor,
         r.data_rescisao, r.mesant, r.perc_multa, r.saldo_fgts, r.multa,
         r.fgts_mes_ant, r.fgts_mes_resc, r.fgts_13, r.fgts_ind, coalesce(r.fgts_adto_13,0) as fgts_adto_13
  from folha_dash.fato_rescisao_fgts r
  left join folha_dash.dim_colaborador c on c.cod_emp=r.cod_emp and c.cod_col=r.cod_col;
-- RPA por competência (bruto/líquido dos autônomos), p/ a reconciliação de proventos na matriz.
create or replace view public.folha_autonomo_ref as
  select cod_emp, ref, count(*) as n,
         coalesce(sum(bruto),0) as bruto, coalesce(sum(liquido),0) as liquido,
         coalesce(sum(entidades),0) as entidades
  from folha_dash.fato_autonomo_serv group by cod_emp, ref;
grant usage on schema folha_dash to anon, authenticated;
grant select on public.folha_bases to anon, authenticated;
grant select on public.folha_fgts to anon, authenticated;
grant select on public.folha_fgts_col to anon, authenticated;
grant select on public.folha_rescisao_col to anon, authenticated;
grant select on public.folha_autonomo_ref to anon, authenticated;
create or replace view public.folha_inss_col as
  select i.cod_emp, i.ref, i.cod_col, c.nome as colaborador, c.cod_centro, c.setor,
         i.inss_emp, i.base_inss, i.base_fixo, i.base_var, i.base_gps, i.deducoes_fpas, i.salario_base,
         coalesce(i.contrib_ind, false) as contrib_ind,
         coalesce(i.deducao_familia, 0) as deducao_familia, coalesce(i.deducao_maternidade, 0) as deducao_maternidade,
         coalesce(i.rat_apo_base, 0) as rat_apo_base, coalesce(i.rat_apo, 0) as rat_apo,
         coalesce(i.sest_senat, 0) as sest_senat, coalesce(c.autonomo, false) as autonomo
  from folha_dash.fato_inss i
  left join folha_dash.dim_colaborador c on c.cod_emp=i.cod_emp and c.cod_col=i.cod_col;
create or replace view public.folha_inss_param as
  select cod_emp, ref, patronal_pct, rat_pct, fap, gilrat_pct, adic_gilrat_pct, terc_pct, cod_fpas, cod_terc,
         simples, prop_anexo4, receita_anexo4, receita_demais
  from folha_dash.inss_param;
create or replace view public.folha_inss_terceiros as
  select cod_emp, ref, ordem, fundo, pct from folha_dash.inss_terceiros;
create or replace view public.folha_irrf_col as
  select i.cod_emp, i.ref, i.cod_col, c.nome as colaborador, c.cod_centro, c.setor, i.tipo, i.base, i.valor,
         coalesce(c.autonomo, false) as autonomo
  from folha_dash.fato_irrf i
  left join folha_dash.dim_colaborador c on c.cod_emp=i.cod_emp and c.cod_col=i.cod_col;
-- lista de empresas (carregada por carregar_empresas.py) e empresas COM dados por imposto (p/ os seletores)
create or replace view public.folha_empresa as
  select cod_emp, razao, apelido, cnpj, regime, ult_ref from folha_dash.dim_empresa order by razao;
create or replace view public.folha_emp_fgts as
  select distinct e.cod_emp, e.razao, e.apelido, e.regime from folha_dash.dim_empresa e
  join folha_dash.fato_fgts f on f.cod_emp=e.cod_emp order by e.cod_emp;
create or replace view public.folha_emp_inss as
  select distinct e.cod_emp, e.razao, e.apelido, e.regime from folha_dash.dim_empresa e
  join folha_dash.fato_inss f on f.cod_emp=e.cod_emp order by e.cod_emp;
create or replace view public.folha_emp_irrf as
  select distinct e.cod_emp, e.razao, e.apelido, e.regime from folha_dash.dim_empresa e
  join folha_dash.fato_irrf f on f.cod_emp=e.cod_emp order by e.cod_emp;
create or replace view public.folha_emp_resumo as
  select distinct e.cod_emp, e.razao, e.apelido, e.regime from folha_dash.dim_empresa e
  join folha_dash.fato_folha f on f.cod_emp=e.cod_emp order by e.cod_emp;
grant select on public.folha_inss_col to anon, authenticated;
grant select on public.folha_inss_param to anon, authenticated;
grant select on public.folha_inss_terceiros to anon, authenticated;
grant select on public.folha_irrf_col to anon, authenticated;
grant select on public.folha_empresa, public.folha_emp_fgts, public.folha_emp_inss, public.folha_emp_irrf, public.folha_emp_resumo to anon, authenticated;
-- resumo da folha por competência/categoria (exclui pró-labore e adiantamento, marcados 'excluir')
create or replace view public.folha_classe_categoria as
  select classe, categoria from folha_dash.classe_categoria;
-- NOTA: o passo de classificação (import) recria uma view 'folha_resumo' ANALÍTICA distinta (macro_tipo/classe_sci),
-- usada pelo /analise. Colisão de nome pré-existente → drop explícito p/ o CREATE abaixo ser idempotente.
drop view if exists public.folha_resumo cascade;
create view public.folha_resumo as
  select f.cod_emp, f.ref, cc.categoria, round(sum(f.valor),2) valor
  from folha_dash.fato_folha f
  join folha_dash.dim_verba v on v.cod_emp=f.cod_emp and v.cod_verba=f.cod_verba
  join folha_dash.classe_categoria cc on cc.classe=v.classe_verba
  where cc.categoria<>'excluir' and not coalesce(f.adto_13, false)
  group by f.cod_emp, f.ref, cc.categoria;
create or replace view public.folha_resumo_verba as
  select f.cod_emp, f.ref, cc.categoria, v.cod_verba, v.descricao,
         round(sum(f.valor),2) valor, round(sum(coalesce(f.quantidade,0)),2) quantidade
  from folha_dash.fato_folha f
  join folha_dash.dim_verba v on v.cod_emp=f.cod_emp and v.cod_verba=f.cod_verba
  join folha_dash.classe_categoria cc on cc.classe=v.classe_verba
  where cc.categoria<>'excluir' and not coalesce(f.adto_13, false)
  group by f.cod_emp, f.ref, cc.categoria, v.cod_verba, v.descricao;
create or replace view public.folha_provisao as
  select cod_emp, ref, tipo, round(sum(valor),2) total,
         round(sum(valor-coalesce(fgts,0)-coalesce(inss,0)),2) principal,
         round(sum(fgts),2) fgts, round(sum(inss),2) inss
  from folha_dash.fato_provisao group by cod_emp, ref, tipo;
drop view if exists public.folha_provisao_col cascade;   -- idempotente + colunas mes_* (idem migra_prov_mes.py)
create view public.folha_provisao_col as
  select p.cod_emp, p.ref, p.cod_col, c.nome as colaborador, c.cod_centro, c.setor,
         p.tipo, p.principal_fixo, p.principal_var, p.fgts, p.inss, p.valor, p.prov_mes,
         p.mes_fixo, p.mes_var, p.mes_fgts, p.mes_inss, p.mes_total
  from folha_dash.fato_provisao p
  left join folha_dash.dim_colaborador c on c.cod_emp=p.cod_emp and c.cod_col=p.cod_col;
-- colaborador (cadastro completo) e verbas detalhadas — usadas pelo gerador da planilha de custos
create or replace view public.folha_colaborador as
  select cod_emp, cod_col, nome, cod_centro, setor, cpf, data_admissao, cargo, cod_tpcc
  from folha_dash.dim_colaborador;
create or replace view public.folha_verba_det as
  select f.cod_emp, f.ref, f.cod_col, f.cod_verba, v.descricao, v.tipo_desc, f.ordem, f.valor
  from folha_dash.fato_folha f
  join folha_dash.dim_verba v on v.cod_emp=f.cod_emp and v.cod_verba=f.cod_verba;
-- impostos/encargos da empresa por competência (INSS patronal, FGTS mensal, FGTS rescisório ind+multa40)
drop view if exists public.folha_impostos_empresa cascade;
create view public.folha_impostos_empresa as
select k.cod_emp, k.ref,
  round(coalesce(i.inss_emp,0),2) inss_emp, round(coalesce(i.inss_patronal,0),2) inss_patronal,
  round(coalesce(f.fgts_mensal,0),2) fgts_mensal,
  round(coalesce(r.fgts_ind,0),2) fgts_resc_ind, round(coalesce(r.fgts_multa,0),2) fgts_resc_multa,
  round(coalesce(r.fgts_ind,0)+coalesce(r.fgts_multa,0)+coalesce(r.fgts_mesresc,0),2) fgts_rescisorio,
  coalesce(hc.n_colab,0) n_colab
from (select distinct cod_emp, ref from folha_dash.fato_inss
      union select distinct cod_emp, ref from folha_dash.fato_fgts
      union select distinct cod_emp, ref from folha_dash.fato_rescisao_fgts) k
left join (
  select i.cod_emp, i.ref, sum(i.inss_emp) inss_emp,
    sum(i.base_inss)*((coalesce(p.patronal_pct,0)+coalesce(p.gilrat_pct,0))/100.0*coalesce(p.prop_anexo4,1)+coalesce(p.terc_pct,0)/100.0) inss_patronal
  from folha_dash.fato_inss i left join folha_dash.inss_param p on p.cod_emp=i.cod_emp and p.ref=i.ref
  group by i.cod_emp, i.ref, p.patronal_pct, p.gilrat_pct, p.prop_anexo4, p.terc_pct) i on i.cod_emp=k.cod_emp and i.ref=k.ref
left join (select cod_emp, ref, sum(case when not resc_antecipada then fgts_mes+fgts_a13+fgts_13 else 0 end) fgts_mensal
           from folha_dash.fato_fgts group by cod_emp, ref) f on f.cod_emp=k.cod_emp and f.ref=k.ref
left join (select cod_emp, ref, sum(fgts_ind) fgts_ind, sum(multa) fgts_multa,
             sum(case when mesant then fgts_mes_ant+fgts_mes_resc+fgts_13 else 0 end) fgts_mesresc
           from folha_dash.fato_rescisao_fgts group by cod_emp, ref) r on r.cod_emp=k.cod_emp and r.ref=k.ref
left join (select cod_emp, ref, count(distinct cod_col) n_colab from folha_dash.fato_fgts where base_mes>0 group by cod_emp, ref) hc
  on hc.cod_emp=k.cod_emp and hc.ref=k.ref;
grant select on public.folha_classe_categoria, public.folha_resumo, public.folha_resumo_verba, public.folha_provisao, public.folha_provisao_col, public.folha_impostos_empresa, public.folha_colaborador, public.folha_verba_det to anon, authenticated;


-- ==== 4) Classificação v2 (materializada no import) + views (supabase_classificacao_v2.sql) ====
-- ============================================================================
-- Classificação v2 — materializada no IMPORT (sem motor de regras em runtime).
-- A verba já entra na dim_verba com macro_tipo + classe SCI (nível 1 e 2).
-- As views apenas LEEM o que foi gravado.
-- ============================================================================
set search_path to folha_dash;

-- 1) Colunas materializadas na dim_verba (aditivo, idempotente)
alter table dim_verba add column if not exists tipo_desc    text;  -- Provento/Desconto/Informativa
alter table dim_verba add column if not exists macro_tipo   text;  -- Fixo/Variável/Informativo/Desconto/Informativa/A classificar
alter table dim_verba add column if not exists grupo1_cod   text;  -- nível 1 SCI (0,1,3,5,7...)
alter table dim_verba add column if not exists grupo1_desc  text;  -- FOLHA NORMAL/FÉRIAS/13º/RESCISÃO...
alter table dim_verba add column if not exists classe2_cod  text;  -- nível 2 SCI (0.001, 0.006...)
alter table dim_verba add column if not exists classe2_desc text;  -- SALÁRIO/ADICIONAIS/HORAS EXTRAS...
alter table dim_verba add column if not exists classe_sci   text;  -- rótulo gerencial (nível2 p/ folha normal; nível1 p/ demais)

-- 2) Mestras (caso ainda não existam — carregadas por carregar_classes.py)
create table if not exists dim_classe (
  cod text primary key, nivel smallint not null, descricao text,
  grupo1_cod text, grupo1_desc text, classe2_cod text, classe2_desc text
);
create table if not exists classe_grupo (prefixo text primary key, macro text not null);

-- 3) Views (recria limpando dependências antigas do motor de regras)
drop view if exists public.folha_resumo cascade;
drop view if exists public.folha_vw_classificada cascade;
drop view if exists folha_dash.vw_folha_classificada cascade;

create view folha_dash.vw_folha_classificada as
  select f.cod_emp, f.ref, f.cod_col, f.cod_verba,
         v.descricao, v.classe_verba, v.classe_natureza, v.tipo_pdi,
         v.tipo_desc, v.macro_tipo,
         v.grupo1_cod, v.grupo1_desc, v.classe2_cod, v.classe2_desc, v.classe_sci,
         f.valor, coalesce(f.origem, 0) as origem
  from folha_dash.fato_folha f
  join folha_dash.dim_verba v on v.cod_emp = f.cod_emp and v.cod_verba = f.cod_verba
  where not coalesce(f.adto_13, false);   -- adto 13º (folha de adiantamento) fora da matriz/resumo

create view public.folha_vw_classificada as
  select x.cod_emp, x.ref, x.cod_col, c.nome as colaborador, c.cod_centro, c.setor,
         x.cod_verba, x.descricao, x.classe_verba, x.tipo_pdi,
         x.tipo_desc, x.macro_tipo, x.classe_sci, x.grupo1_desc as grupo_sci,
         x.classe2_desc, x.valor, x.origem
  from folha_dash.vw_folha_classificada x
  left join folha_dash.dim_colaborador c on c.cod_emp = x.cod_emp and c.cod_col = x.cod_col;

create view public.folha_resumo as
  select cod_emp, ref, tipo_desc, macro_tipo, classe_sci,
         count(*) linhas, sum(valor) total
  from public.folha_vw_classificada
  group by cod_emp, ref, tipo_desc, macro_tipo, classe_sci;

-- 4) Lista de classificações possível (para o app exibir)
drop view if exists public.folha_classes cascade;
create view public.folha_classes as
  select c.cod, c.nivel, c.descricao, c.grupo1_cod, c.grupo1_desc,
         c.classe2_cod, c.classe2_desc, g.macro
  from folha_dash.dim_classe c
  left join folha_dash.classe_grupo g on c.cod = g.prefixo;

-- 5) Grants
grant usage on schema folha_dash to anon, authenticated;
grant select on all tables in schema folha_dash to anon, authenticated;
grant select on public.folha_vw_classificada, public.folha_bases,
                public.folha_resumo, public.folha_classes to anon, authenticated;


-- ==== 5) Classificação v3: esquemas configuráveis + dim_verba_grupo + resolver_todos (supabase_classif_v3.sql) ====
-- ============================================================================
-- Classificação v3 — ESQUEMAS DE AGRUPAMENTO CONFIGURÁVEIS (hierárquicos)
-- ----------------------------------------------------------------------------
-- Generaliza o macro fixo (Fixo/Variável/Informativo) para N esquemas, com
-- grupos em árvore (grupo -> subgrupo -> ... -> verba) definidos pelo usuário,
-- usando a classificação do SCI (dim_classe) como base de seleção.
--
-- Resolução é MATERIALIZADA (import-time / botão "Aplicar"), 100% Postgres:
-- como a classe da verba já está em dim_verba.classe_verba, reclassificar não
-- exige tocar no Firebird/SCI.
-- ============================================================================
set search_path to folha_dash;

-- Migração única: dropa as tabelas classif_* LEGADAS (motor de regras runtime
-- abandonado, esquema diferente: classif_regra tinha coluna "valor"). Só dispara
-- quando detecta o formato antigo — não afeta a config nova (sem coluna "valor").
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='folha_dash' and table_name='classif_regra'
               and column_name='valor') then
    drop table if exists folha_dash.classif_regra   cascade;
    drop table if exists folha_dash.classif_grupo   cascade;
    drop table if exists folha_dash.classif_esquema cascade;
  end if;
end $$;

-- Esquema = um eixo de agrupamento (ex.: "Gerencial", "Custo Direto/Indireto")
create table if not exists classif_esquema (
  id         serial primary key,
  nome       text not null unique,
  descricao  text,
  escopo     text not null default 'todos',   -- 'proventos' | 'descontos' | 'todos'
  ativo      boolean not null default true,
  criado_em  timestamptz default now()
);
alter table classif_esquema add column if not exists escopo text not null default 'todos';

-- Grupo = nó da árvore do esquema (Fixo > Adicionais > ...). parent_id = pai.
create table if not exists classif_grupo (
  id         serial primary key,
  esquema_id int  not null references classif_esquema(id) on delete cascade,
  parent_id  int  references classif_grupo(id) on delete cascade,
  nome       text not null,
  ordem      int  default 0,
  cor        text,
  unique (esquema_id, parent_id, nome)
);
create index if not exists ix_grupo_esquema on classif_grupo(esquema_id);
create index if not exists ix_grupo_parent  on classif_grupo(parent_id);

-- Regra = prefixo de classe SCI atribuído a um grupo (folha). Prefixo + longo vence.
create table if not exists classif_regra (
  id         serial primary key,
  grupo_id   int  not null references classif_grupo(id) on delete cascade,
  prefixo    text not null,            -- dim_classe.cod (prefixo de classe_verba)
  prioridade int  default 0
);
create index if not exists ix_regra_grupo   on classif_regra(grupo_id);
create index if not exists ix_regra_prefixo on classif_regra(prefixo);

-- Ponte materializada: verba -> grupo (folha, o mais específico que casou) por esquema
create table if not exists dim_verba_grupo (
  cod_emp    int not null,
  cod_verba  int not null,
  esquema_id int not null references classif_esquema(id) on delete cascade,
  grupo_id   int not null references classif_grupo(id)  on delete cascade,
  primary key (cod_emp, cod_verba, esquema_id)
);
create index if not exists ix_vg_esquema on dim_verba_grupo(esquema_id);
create index if not exists ix_vg_grupo   on dim_verba_grupo(grupo_id);

-- Resolvedor: recalcula a ponte de UM esquema para TODAS as empresas carregadas.
-- Casa a classe da verba ao prefixo mais longo; desempate por prioridade.
create or replace function folha_dash.resolver_esquema(p_esquema int)
returns int language plpgsql
set search_path = folha_dash, public as $$
declare n int; v_escopo text;
begin
  select escopo into v_escopo from classif_esquema where id = p_esquema;
  delete from dim_verba_grupo where esquema_id = p_esquema;
  insert into dim_verba_grupo (cod_emp, cod_verba, esquema_id, grupo_id)
  select v.cod_emp, v.cod_verba, p_esquema, m.grupo_id
  from dim_verba v
  cross join lateral (
    select r.grupo_id
    from classif_regra r
    join classif_grupo g on g.id = r.grupo_id
    where g.esquema_id = p_esquema
      and (v.classe_verba = r.prefixo or v.classe_verba like r.prefixo || '.%')
    order by length(r.prefixo) desc, r.prioridade desc
    limit 1
  ) m
  where (v_escopo = 'todos'
         or (v_escopo = 'proventos' and v.tipo_pdi = 0)
         or (v_escopo = 'descontos' and v.tipo_pdi = 1));
  get diagnostics n = row_count;
  return n;
end $$;

-- Recalcula todos os esquemas ativos de uma vez
create or replace function folha_dash.resolver_todos()
returns int language plpgsql
set search_path = folha_dash, public as $$
declare e int; tot int := 0;
begin
  for e in select id from classif_esquema where ativo loop
    tot := tot + folha_dash.resolver_esquema(e);
  end loop;
  return tot;
end $$;

-- ---- Views públicas para o app (leitura via anon) -------------------------
drop view if exists public.folha_esquemas cascade;
create view public.folha_esquemas as
  select id, nome, descricao, escopo, ativo from folha_dash.classif_esquema;

drop view if exists public.folha_grupos cascade;
create view public.folha_grupos as
  select g.id, g.esquema_id, g.parent_id, g.nome, g.ordem, g.cor,
         (select count(*) from folha_dash.classif_grupo c where c.parent_id = g.id) as n_filhos,
         (select count(*) from folha_dash.classif_regra r where r.grupo_id = g.id) as n_regras
  from folha_dash.classif_grupo g;

drop view if exists public.folha_grupo_regras cascade;
create view public.folha_grupo_regras as
  select r.id, r.grupo_id, g.esquema_id, r.prefixo, r.prioridade,
         c.descricao as classe_desc
  from folha_dash.classif_regra r
  join folha_dash.classif_grupo g on g.id = r.grupo_id
  left join folha_dash.dim_classe c on c.cod = r.prefixo;

drop view if exists public.folha_verba_grupo cascade;
create view public.folha_verba_grupo as
  select cod_emp, cod_verba, esquema_id, grupo_id from folha_dash.dim_verba_grupo;

grant usage on schema folha_dash to anon, authenticated;
grant select on all tables in schema folha_dash to anon, authenticated;
grant select on public.folha_esquemas, public.folha_grupos,
                public.folha_grupo_regras, public.folha_verba_grupo to anon, authenticated;
