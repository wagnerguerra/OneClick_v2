--
-- PostgreSQL database dump
--

\restrict ERSJ2HuAyzIhkbHiWi1bh0ZY1sXwrfLoKuOaeV6fWPCaScuf1UybxbuKjBxIdFi

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE IF EXISTS saas_erp;
--
-- Name: saas_erp; Type: DATABASE; Schema: -; Owner: -
--

CREATE DATABASE saas_erp WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


\unrestrict ERSJ2HuAyzIhkbHiWi1bh0ZY1sXwrfLoKuOaeV6fWPCaScuf1UybxbuKjBxIdFi
\connect saas_erp
\restrict ERSJ2HuAyzIhkbHiWi1bh0ZY1sXwrfLoKuOaeV6fWPCaScuf1UybxbuKjBxIdFi

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ClienteSituacao; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ClienteSituacao" AS ENUM (
    'MENSAL',
    'EM_CONSTITUICAO',
    'POTENCIAL',
    'AVULSO',
    'PARALIZADO',
    'PRE_OPERACIONAL',
    'PROSPECT'
);


--
-- Name: ClienteStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ClienteStatus" AS ENUM (
    'ATIVA',
    'INATIVA',
    'SUSPENSA',
    'BAIXADA',
    'INAPTA',
    'NULA'
);


--
-- Name: CostType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CostType" AS ENUM (
    'DIRECT',
    'INDIRECT'
);


--
-- Name: PlanInterval; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PlanInterval" AS ENUM (
    'MONTHLY',
    'YEARLY'
);


--
-- Name: RegimeContabil; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RegimeContabil" AS ENUM (
    'CAIXA',
    'COMPETENCIA'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'COLABORADOR_INTERNO',
    'PRESTADOR_SERVICO',
    'COLABORADOR_CLIENTE',
    'GESTOR',
    'COORDENADOR',
    'DIRETOR'
);


--
-- Name: SubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'TRIALING',
    'INCOMPLETE'
);


--
-- Name: TaxRegime; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaxRegime" AS ENUM (
    'SIMPLES_NACIONAL',
    'LUCRO_PRESUMIDO',
    'LUCRO_REAL',
    'MEI'
);


--
-- Name: TenantStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenantStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED'
);


--
-- Name: TipoDocumento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TipoDocumento" AS ENUM (
    'CNPJ',
    'CPF'
);


--
-- Name: UserProfile; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserProfile" AS ENUM (
    'OPERADOR',
    'SUPERVISOR',
    'GERENTE',
    'ADMIN'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    user_id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamp(3) without time zone,
    refresh_token_expires_at timestamp(3) without time zone,
    scope text,
    id_token text,
    password text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: api_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_logs (
    id text NOT NULL,
    source text NOT NULL,
    endpoint text NOT NULL,
    method text DEFAULT 'GET'::text NOT NULL,
    status integer,
    duration integer,
    documento text,
    user_id text,
    empresa_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: api_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_pricing (
    id text NOT NULL,
    source text NOT NULL,
    unit_price double precision DEFAULT 0 NOT NULL,
    multiplier double precision DEFAULT 1 NOT NULL,
    currency text DEFAULT 'BRL'::text NOT NULL
);


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id text NOT NULL,
    code integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    available_for_hiring boolean DEFAULT false NOT NULL,
    show_in_org_chart boolean DEFAULT false NOT NULL,
    email text,
    leader_id text,
    parent_id text,
    cost_type public."CostType" DEFAULT 'DIRECT'::public."CostType" NOT NULL,
    cost_weight numeric(10,4) DEFAULT 1 NOT NULL,
    exclude_from_costing boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    empresa_id text
);


--
-- Name: areas_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.areas_code_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: areas_code_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.areas_code_seq OWNED BY public.areas.code;


--
-- Name: cargo_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_events (
    id text NOT NULL,
    cargo_id text NOT NULL,
    user_id text,
    type text NOT NULL,
    version integer NOT NULL,
    changes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cargos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargos (
    id text NOT NULL,
    code integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    area_id text,
    autoridades text,
    descricao_sumaria text,
    educacao text,
    experiencias text,
    habilidades text,
    responsabilidades text,
    show_in_org_chart boolean DEFAULT false NOT NULL,
    treinamentos text,
    version integer DEFAULT 1 NOT NULL,
    empresa_id text
);


--
-- Name: cargos_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cargos_code_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cargos_code_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cargos_code_seq OWNED BY public.cargos.code;


--
-- Name: cliente_arquivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_arquivos (
    id text NOT NULL,
    cliente_id text NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size integer,
    mime_type text,
    vencimento timestamp(3) without time zone,
    user_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cliente_contatos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_contatos (
    id text NOT NULL,
    cliente_id text NOT NULL,
    nome text NOT NULL,
    cargo text,
    telefone text,
    email text,
    observacoes text,
    principal boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    area_id text
);


--
-- Name: cliente_contrato_params; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_contrato_params (
    id text NOT NULL,
    cliente_id text NOT NULL,
    empresa_id text,
    honorario double precision DEFAULT 0 NOT NULL,
    lancamentos integer DEFAULT 0 NOT NULL,
    faturamento double precision DEFAULT 0 NOT NULL,
    nf_entrada integer DEFAULT 0 NOT NULL,
    nf_saida integer DEFAULT 0 NOT NULL,
    nf_prestado integer DEFAULT 0 NOT NULL,
    nf_tomado integer DEFAULT 0 NOT NULL,
    funcionarios integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: cliente_erp_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_erp_snapshots (
    id text NOT NULL,
    cliente_id text NOT NULL,
    empresa_id text,
    mes text NOT NULL,
    indicador text NOT NULL,
    valor double precision DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cliente_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_events (
    id text NOT NULL,
    cliente_id text NOT NULL,
    user_id text,
    type text NOT NULL,
    version integer NOT NULL,
    changes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cliente_historicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_historicos (
    id text NOT NULL,
    cliente_id text NOT NULL,
    user_id text,
    mensagem text NOT NULL,
    tipo text DEFAULT 'equipe'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id text NOT NULL,
    code integer NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    documento text NOT NULL,
    tipo_documento public."TipoDocumento" DEFAULT 'CNPJ'::public."TipoDocumento" NOT NULL,
    tipo_cliente text,
    situacao public."ClienteSituacao" DEFAULT 'MENSAL'::public."ClienteSituacao" NOT NULL,
    status public."ClienteStatus" DEFAULT 'ATIVA'::public."ClienteStatus" NOT NULL,
    grupo text,
    origem text,
    data_entrada timestamp(3) without time zone,
    data_saida timestamp(3) without time zone,
    observacoes text,
    tributacao public."TaxRegime",
    regime public."RegimeContabil",
    inscricao_estadual text,
    inscricao_municipal text,
    areas_contratadas text,
    cep text,
    logradouro text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf character(2),
    telefone text,
    email text,
    empresa_id text,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    categoria text DEFAULT 'NAO_INFORMADO'::text,
    deleted_at timestamp(3) without time zone,
    id_omie text,
    id_sistema text,
    logo_url text,
    omie_empresa text,
    id_oneclick text
);


--
-- Name: clientes_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_code_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_code_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_code_seq OWNED BY public.clientes.code;


--
-- Name: empresa_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_events (
    id text NOT NULL,
    empresa_id text NOT NULL,
    user_id text,
    type text NOT NULL,
    version integer NOT NULL,
    changes jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id text NOT NULL,
    code integer NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    cnpj text NOT NULL,
    inscricao_estadual text,
    inscricao_municipal text,
    tax_regime public."TaxRegime",
    is_active boolean DEFAULT true NOT NULL,
    cep text,
    logradouro text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf character(2),
    telefone text,
    email text,
    site text,
    logo_url text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    logo_dark_url text,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: empresas_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresas_code_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresas_code_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresas_code_seq OWNED BY public.empresas.code;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    stripe_price_id text NOT NULL,
    "interval" public."PlanInterval" DEFAULT 'MONTHLY'::public."PlanInterval" NOT NULL,
    price integer NOT NULL,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    max_users integer DEFAULT 5 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: saved_query; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_query (
    id text NOT NULL,
    name text NOT NULL,
    sql text NOT NULL,
    db_type text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    plan_id text NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'ACTIVE'::public."SubscriptionStatus" NOT NULL,
    current_period_start timestamp(3) without time zone NOT NULL,
    current_period_end timestamp(3) without time zone NOT NULL,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    label text,
    "group" text,
    encrypted boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    schema text NOT NULL,
    status public."TenantStatus" DEFAULT 'ACTIVE'::public."TenantStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id text NOT NULL,
    user_id text NOT NULL,
    module_slug text NOT NULL,
    can_read boolean DEFAULT true NOT NULL,
    can_write boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sub_permissions jsonb DEFAULT '{}'::jsonb
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    role public."Role" DEFAULT 'COLABORADOR_INTERNO'::public."Role" NOT NULL,
    tenant_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    empresa_id text,
    is_active boolean DEFAULT true NOT NULL,
    is_master boolean DEFAULT false NOT NULL,
    area_id text,
    cargo_id text,
    data_admissao timestamp(3) without time zone,
    id_oneclick text,
    incluir_ferias boolean DEFAULT true NOT NULL,
    profile public."UserProfile" DEFAULT 'OPERADOR'::public."UserProfile" NOT NULL,
    salario numeric(10,2),
    telefone text,
    is_empresa_master boolean DEFAULT false NOT NULL
);


--
-- Name: verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: areas code; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas ALTER COLUMN code SET DEFAULT nextval('public.areas_code_seq'::regclass);


--
-- Name: cargos code; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos ALTER COLUMN code SET DEFAULT nextval('public.cargos_code_seq'::regclass);


--
-- Name: clientes code; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN code SET DEFAULT nextval('public.clientes_code_seq'::regclass);


--
-- Name: empresas code; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas ALTER COLUMN code SET DEFAULT nextval('public.empresas_code_seq'::regclass);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
a1012951-019a-46be-9c56-d4363cd26a14	0719c45182c97b4dfed87003fe57d593bb8ccf9647801301d8d0cd1b3960fff7	2026-04-02 19:41:08.196867+00	20260402194108_init	\N	\N	2026-04-02 19:41:08.144294+00	1
bef629d3-dbd2-473b-a412-9298cc9e7634	d9591bc6be10dd3ad57346243c07fb8e648889a4dfbc6d346b89e861146f74f7	2026-04-02 21:20:45.525266+00	20260402212045_add_area_module	\N	\N	2026-04-02 21:20:45.50838+00	1
7cb93898-3453-453f-b61e-c4f73537d2f2	e5f257003537a26e820cca671e3a2a44e7e6ca2d97c5d7f15294671fc97f2fc3	2026-04-06 12:24:19.789239+00	20260406122419_add_empresa_module	\N	\N	2026-04-06 12:24:19.770928+00	1
4d9a5dfa-65db-4f7c-9e64-0bbe970ccf44	cb45a140c38604f71819084f9e937c7ef577aed539583ccc8e0ff418602c7604	2026-04-06 14:37:50.317643+00	20260406143750_add_logo_dark_url	\N	\N	2026-04-06 14:37:50.309435+00	1
d05bd442-ebf3-41bb-af04-3b715371df55	b6fba69e1519a81d0012981c0f67a2f21b88e6d464d1e84552aafeef7b14f862	2026-04-06 15:13:20.106502+00	20260406151320_add_user_permissions	\N	\N	2026-04-06 15:13:20.081878+00	1
10883a4f-0928-4638-a201-7fe4f03d68e7	98876802cfd831c233e19845c12a6c5ff19b1ab228280fa9a39d47bfdc166099	2026-04-06 15:34:39.196462+00	20260406153500_update_role_enum		\N	2026-04-06 15:34:39.196462+00	0
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts (id, user_id, account_id, provider_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, scope, id_token, password, created_at, updated_at) FROM stdin;
cmnncxsb200039gcsblxs8p0p	cmnncxsay00019gcsu69uqo35	cmnncxsay00019gcsu69uqo35	credential	\N	\N	\N	\N	\N	\N	6481a75bbcd087f31bd71adbe053e8fb:7c52586f3f805017577709e6e5bd178b748fd4768846e1e5c979f607425ade5c84b5452a88c20c2d2142aaeb17377d60a9416a3477520df20bdaa48ca6884321	2026-04-06 15:40:57.615	2026-04-06 16:04:41.604
UfEV1OE1EXwh3ftpAFuBks169VDWLScE	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	credential	\N	\N	\N	\N	\N	\N	ad96217e75ac895e4fd4542f33a1826d:215c16cd06e466066049915708c662e7ef321cbf6e7e60b7b22e67c9bfc00619313fbadb91c8a89da2d8e28de6441c412575ab22085a93376c027248a32649ee	2026-04-02 20:44:05.302	2026-04-06 16:21:48.738
cmnornfuu00039gu4ll8gr4ek	cmnornfun00019gu40z1r7nlx	cmnornfun00019gu40z1r7nlx	credential	\N	\N	\N	\N	\N	\N	ab61533f5dcdaf3fbdb5ce67ea169937:4d3b6134ec499a9c4816ccdc1af5f1b866f8607f35308ab2ab884a17bca0740ad99a559b97470f8869688defc50ebf4c6f7588c49814673d338ec07a995f6ec1	2026-04-07 15:20:35.334	2026-04-07 15:20:35.334
cmnornfyc00079gu4zsmga2li	cmnornfya00059gu4abz3khft	cmnornfya00059gu4abz3khft	credential	\N	\N	\N	\N	\N	\N	7b1e3c49378c3cd4fade2196887bbefd:bba220257e11c0f11acf0be3ff292b8d7fcf10ba3248ea083d5b26f47ecdcaabe978c3d73268a553fe5aab79e71242a694125014c4d9407cfe2eec8f74bfaa15	2026-04-07 15:20:35.46	2026-04-07 15:20:35.46
cmnorng1m000b9gu4r6i234mi	cmnorng1k00099gu4xmtdhqz2	cmnorng1k00099gu4xmtdhqz2	credential	\N	\N	\N	\N	\N	\N	c14c12f233677a4e1e3c70a16cd401b2:0e3e0d60226a4ed852032f8a84d209ed583ebedb9d71ac584982c6a0f32719fcb010910c823b70db31c4863b7b054fc830c338b82d55b24d6d6bff2b8150c4f0	2026-04-07 15:20:35.578	2026-04-07 15:20:35.578
cmnorng58000f9gu4f4dwkd29	cmnorng55000d9gu4a5b07fbq	cmnorng55000d9gu4a5b07fbq	credential	\N	\N	\N	\N	\N	\N	22d840cbfcca360d1dcd59884c39498b:19b096bebd9d04bfd22fde6fdf5725c27c9417339afce91fafcfc93a39f4a99242320cef6b503d708e1a757d99df80b20e1d22ff452694782e7f43f2c55eab0c	2026-04-07 15:20:35.708	2026-04-07 15:20:35.708
cmnorng9h000j9gu4ayxb1w5r	cmnorng9f000h9gu49q8b6m5h	cmnorng9f000h9gu49q8b6m5h	credential	\N	\N	\N	\N	\N	\N	2858a5a208fe4e57d79b03961b59e8a3:47d94b7fe647c3814188127d6fdec96bf6f2343395e53dcf8707d58aa554c81b0887b111bdf6e3a69892da4d57626252322ec0eb1e880d23cc2d1a16818cf994	2026-04-07 15:20:35.862	2026-04-07 15:20:35.862
cmnornge2000n9gu4ankxfdc9	cmnornge0000l9gu44m7lvl10	cmnornge0000l9gu44m7lvl10	credential	\N	\N	\N	\N	\N	\N	ac3c5c3754ee6649dee7636e6a419f6c:d3c5ea8834b7165d378ffc66c7398727c4061e0a210d45be966e36a66a0018d8e7254282ecb63efd2ef65c0c61af38ea1101843bfd5137330e5f3f400d79dc83	2026-04-07 15:20:36.027	2026-04-07 15:20:36.027
cmnornghp000r9gu4xpcp58jo	cmnornghn000p9gu4l732j4zm	cmnornghn000p9gu4l732j4zm	credential	\N	\N	\N	\N	\N	\N	767fd8eb3363a40202f7ba2241e61917:fa8389a3234108cd3fc7b6dd54755498f5512686f53e537a2b936c27f2645917f2adf840ae776dbd9049972cdd4fd51c3abc9c2c739060577adea11fa2e95560	2026-04-07 15:20:36.158	2026-04-07 15:20:36.158
cmnornglg000v9gu4mpnsyr23	cmnornglf000t9gu47s6vlg5p	cmnornglf000t9gu47s6vlg5p	credential	\N	\N	\N	\N	\N	\N	97dddb91f07611d74dedf3193401236d:106f631d7d85ab4339db7177abddb0d555717993663d69fae5879ccf2a34e27feec6a5a119c0e3ce37cc6d9b5c0c75146f97d6f5f5f98b640e3b3a03bc6ad177	2026-04-07 15:20:36.293	2026-04-07 15:20:36.293
cmnorngoz000z9gu43wtphqt8	cmnorngow000x9gu42enrv8us	cmnorngow000x9gu42enrv8us	credential	\N	\N	\N	\N	\N	\N	180b3a916a06275a85dcbcb439425edd:0d3333232d1ae464635d94ce2b001f03ebd1cb486ac3f5826fe56b678e3363bc7c097c6d0a45fdcd2b9489050f10d2d230789b22a6da26af691e90aa49b260cc	2026-04-07 15:20:36.419	2026-04-07 15:20:36.419
cmnorngso00139gu430p4eljk	cmnorngsm00119gu4sxqjy3e8	cmnorngsm00119gu4sxqjy3e8	credential	\N	\N	\N	\N	\N	\N	59201018da6cf32d4d9df82f10486196:0d7777d9818225f37ecfe00bb51db0c2e46a458833040f89581150d52641a10797a363fe72ca6214aa8cd5983f0e2fe1a8eff936070d2f7ba2e5eea2e039a3fa	2026-04-07 15:20:36.552	2026-04-07 15:20:36.552
cmnorngw600179gu4w7bq4uiz	cmnorngw400159gu44dv1z5i0	cmnorngw400159gu44dv1z5i0	credential	\N	\N	\N	\N	\N	\N	e00cf1bc93462e0eeafdf6d5baa19eef:db5d55e46caad21884bb23f9989621f3229178833fe7a99bff08c03d8a27fddbff1991072d543eceeff9cfa78c07a27428a4e88de7cdae4ac4749ba86ca74cc3	2026-04-07 15:20:36.679	2026-04-07 15:20:36.679
cmnornh03001b9gu4ke643wgq	cmnornh0000199gu4yck4vfa3	cmnornh0000199gu4yck4vfa3	credential	\N	\N	\N	\N	\N	\N	e97670b97ad64eac5403ad38ba27d288:362a27a0e55173e9bf0baca9b757c7a3def9da9acc02b206d0870bfd5683eaec8830fa2f46375b572f349189249ac641bd2cc9e77de696ac51d70b251173a521	2026-04-07 15:20:36.82	2026-04-07 15:20:36.82
cmnornh4b001f9gu4o8a102f2	cmnornh48001d9gu4jpqraj2r	cmnornh48001d9gu4jpqraj2r	credential	\N	\N	\N	\N	\N	\N	0cc1a3d7be6f8e8b4003d0c5e1c0390b:179960d752a1ed0623ec915c2f6f01d72e2e4703bdf7511192af59f5ad3021cc671e1c9bbfdde149a0c374b8349d1419ff5eb210edb45357e4ac422c584b03d3	2026-04-07 15:20:36.971	2026-04-07 15:20:36.971
cmnornhay001j9gu4jcj9kw1n	cmnornhav001h9gu40wevliy8	cmnornhav001h9gu40wevliy8	credential	\N	\N	\N	\N	\N	\N	b6db068b7c3718c11ca40a1f765e79f7:7cd45c8c455e592c855dd6b8aaf86dc696a724290ee9f7fa6e75080be1b181b868ed6df3303e427fb0c022dcbf379d89033a056a0cbb918ec2d83328a89659b5	2026-04-07 15:20:37.21	2026-04-07 15:20:37.21
cmnornhg8001n9gu40en0pe6t	cmnornhg5001l9gu4q1mj21er	cmnornhg5001l9gu4q1mj21er	credential	\N	\N	\N	\N	\N	\N	8ad4f4427f6d26a0a7b76c9bcc57141f:f7335cfe37312998a60ab20966d696bf7fb206e36eee9dd7875e6d30395146066f121678545d5cbf668761453d6e825e79b3cb8a5ee8d68c830a8908f03fd353	2026-04-07 15:20:37.4	2026-04-07 15:20:37.4
cmnornhk1001r9gu473xzagcm	cmnornhjz001p9gu4qwrkce7n	cmnornhjz001p9gu4qwrkce7n	credential	\N	\N	\N	\N	\N	\N	49387475da4b2bdec245cdea263ea1bf:ed0f2ef235eb30389e2456a895f6383be08b0ccf9b0a4eec25ddb89df5e39decee69d97f72fe7523b276dd0d630b132f586eecfea0e8c66bf4fc3b1d279200a7	2026-04-07 15:20:37.538	2026-04-07 15:20:37.538
cmnornhnh001v9gu4ztt00h0a	cmnornhnf001t9gu4vubzwwj2	cmnornhnf001t9gu4vubzwwj2	credential	\N	\N	\N	\N	\N	\N	19a13536b5a5a2de491e4f916d78c137:4322c719b776bad62e30b795c935a3161c8be33670441147cca2a0fa74d8bb3634f5ce7e415edfddcdb9e990388ab15d74cea9184f7586d4d2e2df6a6c798487	2026-04-07 15:20:37.661	2026-04-07 15:20:37.661
cmnornhr5001z9gu4m0jp5rgn	cmnornhr3001x9gu4ovql0aao	cmnornhr3001x9gu4ovql0aao	credential	\N	\N	\N	\N	\N	\N	b8ce679e93a236d07a63daffa9d1cab0:823530a4e403c44bc0008a3d708726fca55151aecdaa2b7d6daac98198aa06a70def6d6e41b5d14d7bbf21e5c1deacec27f1effb930319cfdeb8eea26200ca94	2026-04-07 15:20:37.793	2026-04-07 15:20:37.793
cmnornhuv00239gu45u1o31kq	cmnornhut00219gu4gukmozxg	cmnornhut00219gu4gukmozxg	credential	\N	\N	\N	\N	\N	\N	cd7ec18fcc2316ec0b9010b51ec10faa:9d8b9cf84d4a7b0972fb4a2efa72db2d36dbd8955e11f96f81638493819f2824cf294b5c503a70d1d8bf9c007b25f5df54b2c3c4336e89d053c85ffa6f1f9ccf	2026-04-07 15:20:37.927	2026-04-07 15:20:37.927
cmnornhyg00279gu4igq9ljj6	cmnornhyd00259gu4ad3db405	cmnornhyd00259gu4ad3db405	credential	\N	\N	\N	\N	\N	\N	244ec0855bf48e11727d295c17c703ca:74ef2e2ecd8d6494511c4155bc2ce244641275770b356db32355768080a94c6d985e19445e716332caace7ccf1feefc37001c9dc34fe386fafc8fb5e808ef095	2026-04-07 15:20:38.056	2026-04-07 15:20:38.056
cmnorni1x002b9gu45txuy96a	cmnorni1u00299gu4xrn89mgl	cmnorni1u00299gu4xrn89mgl	credential	\N	\N	\N	\N	\N	\N	68ee5ed355d1f78b53dd349c5344636d:9b9128e03f95089e27b7a706cd67ddf6ef794e80bb1fb2afd155c200944425da782431766bdb14723b5e98bcc6af3ddd077d9afda41ca96f1ab3d43f398fa815	2026-04-07 15:20:38.181	2026-04-07 15:20:38.181
cmnorni5d002f9gu4e5qrxj06	cmnorni5c002d9gu4cyzf20d0	cmnorni5c002d9gu4cyzf20d0	credential	\N	\N	\N	\N	\N	\N	33c65b0da7db4505acade4771686b69e:0115720fb7ce5588a7a31a8e74a6ef6af146fb5c16d3cf264e0bb624496ba0eff656efc919e5293a60a8814a433e2dbe14e4fb67676e8790de288be7803a49b7	2026-04-07 15:20:38.306	2026-04-07 15:20:38.306
cmnorni8v002j9gu46vt4tpya	cmnorni8t002h9gu4726q80sd	cmnorni8t002h9gu4726q80sd	credential	\N	\N	\N	\N	\N	\N	a4d7a6f8442ddf06a508d211f3c943fb:02e71d3b6c46d6de01b72c2e02aa17d1bf3a64bfe7e9b12d8183d0a35c57f7d1d32fec62ed2f1c581e1c868f28a41b4d824efc6d2a85085de5090e1dd43ad4f4	2026-04-07 15:20:38.432	2026-04-07 15:20:38.432
cmnornic8002n9gu4poube0db	cmnornic6002l9gu4z94vys1i	cmnornic6002l9gu4z94vys1i	credential	\N	\N	\N	\N	\N	\N	89b53a5cc8cbdf2f824dbc3086c8a462:ae75569adffa9b041b3d1d0c824c7453b0b1dba3b1e3dc99cf42f5e4eb27b04cf3c42c1460eeb4186fa75af1be9d5bf12341094251518fc0f90e9a892f4d0f6c	2026-04-07 15:20:38.553	2026-04-07 15:20:38.553
cmnornifi002r9gu49z5lbwte	cmnornifg002p9gu4lvo9sv4u	cmnornifg002p9gu4lvo9sv4u	credential	\N	\N	\N	\N	\N	\N	78b88f1edd97f092394b233079c043d4:db86de1e70f548501e14978c1e49b0fb5f725f517999a6baf4a252152d5fe71839ea20803825e08d8d3cc4544ecd60064b30e6ed2f0eb04fd1f2ccc3ba387003	2026-04-07 15:20:38.67	2026-04-07 15:20:38.67
cmnorniiw002v9gu4qosmtkww	cmnorniiu002t9gu43ttoinen	cmnorniiu002t9gu43ttoinen	credential	\N	\N	\N	\N	\N	\N	55094ea990101e3806210a9ce6134f86:702104a1e7cf036de0aaf89763f66a49b2b807c0d8cefed09d94e84f598814061edc45b13cc2f3bbd2dce8bfbea57f3265f9bc42926b95289bd1f29385e8426c	2026-04-07 15:20:38.792	2026-04-07 15:20:38.792
cmnornimc002z9gu4ns5eanaa	cmnornim9002x9gu4ow9lmtak	cmnornim9002x9gu4ow9lmtak	credential	\N	\N	\N	\N	\N	\N	b34d5cd4f20278f938dcbd89cc6e6391:e453652ba46ae33aacf626aa95f364dc153051540a77e944dd02cb51b6f063466f39c490ab12bb1d74846234a20d040444ed23668a36e75de5427b32103c4e1b	2026-04-07 15:20:38.916	2026-04-07 15:20:38.916
cmnornipr00339gu4egzotnqc	cmnornipp00319gu4wrs0fk8a	cmnornipp00319gu4wrs0fk8a	credential	\N	\N	\N	\N	\N	\N	3cf94ba29e53df6f1072aea6e7c96b43:bdf4f610493296f126a9ef8ed82f8400dadfcaa8b253072b1ee54663308ba628bb8e36be30c90348f1b215532804fcfa66a907013c780cca04fb2cd9d5a8d319	2026-04-07 15:20:39.039	2026-04-07 15:20:39.039
cmnornitl00379gu4kmw0fiem	cmnornitj00359gu4wl51g7hb	cmnornitj00359gu4wl51g7hb	credential	\N	\N	\N	\N	\N	\N	62dd4b1cbd560c398b7889b2e30a3639:c483877fccad3b80705fd21371e709d299e1b21d556d03d45ee62fe3911867d3f46602b4474fc5c26a228f2a39079cc19cbd051ff9cac940e6b1ef0759a7962c	2026-04-07 15:20:39.177	2026-04-07 15:20:39.177
cmnornix4003b9gu49zshkg3l	cmnornix200399gu4uwgqpok2	cmnornix200399gu4uwgqpok2	credential	\N	\N	\N	\N	\N	\N	04086b8727fdd70e73dd4fb18311b96b:2e91fb73832c13ccc4e3c1c5e0475d574c42426708ab9d1844e0015e55128371e086202f94faf929dd3b8360018e8332690b67615d75cc50d40e10f3c5c9b624	2026-04-07 15:20:39.305	2026-04-07 15:20:39.305
cmnornj0p003f9gu43cw90y4o	cmnornj0n003d9gu4zrh1cjdt	cmnornj0n003d9gu4zrh1cjdt	credential	\N	\N	\N	\N	\N	\N	6d5242632cac793cb5eb90c80793c70a:f3c807f4df686330b2e0f6cf56632143bc231137ef035891926f6c4618984443ac9a233a560e7eb30e8d2732ca5890b1d6f8517fc4e1766053b5705bbf74d67d	2026-04-07 15:20:39.434	2026-04-07 15:20:39.434
cmnornj46003j9gu4m58cm3pg	cmnornj45003h9gu4lf2zdamr	cmnornj45003h9gu4lf2zdamr	credential	\N	\N	\N	\N	\N	\N	806ddea328f853d8ef2217761d344435:4904f8a0d74a20a89f447f82ed907a46e115986160d19c05f33afb7f6328f236396c632413f267988babcb15048dab15cc7dd8de38c66a6f29c4b2b7d3ed41e0	2026-04-07 15:20:39.559	2026-04-07 15:20:39.559
cmnornj7t003n9gu40ghh4xqj	cmnornj7r003l9gu4s596tc12	cmnornj7r003l9gu4s596tc12	credential	\N	\N	\N	\N	\N	\N	2667a6cf210fa1fc3f19f74fd76281ea:f6a68f3063141f1b110251c848ed0dd1e60b21840a4efa0c72ca34aebeb1743d71f30f8db96b32a62c89d356dddef3e595f704035d909fbd2442f2a0a5d01f14	2026-04-07 15:20:39.69	2026-04-07 15:20:39.69
cmnornjb8003r9gu4gbk3izwl	cmnornjb7003p9gu4rre7lgpd	cmnornjb7003p9gu4rre7lgpd	credential	\N	\N	\N	\N	\N	\N	21e4902aaaf3bd4765cd88660b0b6c32:6d75f46f897473a53287bc2a489c0dc05e0eeb64bb00176916775b439961c6ae0d11cb436c98e6cd2d078226096c0756a4aa1578763afa022c742c1138440748	2026-04-07 15:20:39.813	2026-04-07 15:20:39.813
cmnornjem003v9gu432n02nnc	cmnornjej003t9gu4x2vujbi6	cmnornjej003t9gu4x2vujbi6	credential	\N	\N	\N	\N	\N	\N	f27c73b2f56550c7cb63ac5ba73ca335:8b10b0cd9c3649cc8ff884b71722de41af76e3efb1c775a19238971e8517e9b19c5bcfcb5bf99e6cd058c397298943724be7187514126edc32518efed68c598d	2026-04-07 15:20:39.934	2026-04-07 15:20:39.934
cmnornji4003z9gu46xx9lktq	cmnornji3003x9gu4kog9tvgj	cmnornji3003x9gu4kog9tvgj	credential	\N	\N	\N	\N	\N	\N	1218c509c5d1cf5d1b8c661fbb41e082:a35bfda3d4c51dde983d8dc11be975897633baea921414a375650556577c64b4c3a37f70863c90f5286a4f3390dc11616861a021d0e1e40b0bde0acf99c29514	2026-04-07 15:20:40.06	2026-04-07 15:20:40.06
cmnornjli00439gu4iq8rulw3	cmnornjlg00419gu465rgnqb1	cmnornjlg00419gu465rgnqb1	credential	\N	\N	\N	\N	\N	\N	73ca78e4fa8670963c565c966a7950a1:d19ccec284f5f3074a7dca18041fb62f38a8f04f5a035b3651756c29cc689993e3ca8adf4277475f061706c55f1429b2538cdf772a1f0197967c4e28f2ec3c10	2026-04-07 15:20:40.183	2026-04-07 15:20:40.183
cmnornjp200479gu4oadylevc	cmnornjp100459gu4mv6tkyhw	cmnornjp100459gu4mv6tkyhw	credential	\N	\N	\N	\N	\N	\N	f30756fcada673fe1f81b476246f76e9:21fd3ab71d1d70ff8f78cad6ad1d07146d7f22e55e81aec762366cf2ed198f399408c2da15145bcc8f5620380e1735f4dd8511dbaa8ecf6210531425f5e3c2f2	2026-04-07 15:20:40.311	2026-04-07 15:20:40.311
cmnornjsj004b9gu4xwdvs76c	cmnornjsh00499gu4jxtjxp4y	cmnornjsh00499gu4jxtjxp4y	credential	\N	\N	\N	\N	\N	\N	1df4ae89bedafe60739ee05613460171:b5426155949ac2f56e141d084d9511b76c4970842ee56d4a0cc21dbe74290b29eef86c732a68b64de2f5219461d51a8e854d8f6ec954f87f90af3f4d477163d6	2026-04-07 15:20:40.436	2026-04-07 15:20:40.436
cmnornjzu004h9gu4tx2yb1cg	cmnornjzr004f9gu4dtpqpeyl	cmnornjzr004f9gu4dtpqpeyl	credential	\N	\N	\N	\N	\N	\N	8d097d76b6b7ea114eed88eeef507215:4641918fbddece456a867b6d7c5dc892821c9ddcf269dd2c993f4701e0ca24c0afa608029352a59ccfce84f9e5275bfee3a523fa3b4a15adc9d4c3b765ef52d8	2026-04-07 15:20:40.698	2026-04-07 15:20:40.698
\.


--
-- Data for Name: api_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.api_logs (id, source, endpoint, method, status, duration, documento, user_id, empresa_id, created_at) FROM stdin;
\.


--
-- Data for Name: api_pricing; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.api_pricing (id, source, unit_price, multiplier, currency) FROM stdin;
\.


--
-- Data for Name: areas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.areas (id, code, name, is_active, available_for_hiring, show_in_org_chart, email, leader_id, parent_id, cost_type, cost_weight, exclude_from_costing, created_at, updated_at, empresa_id) FROM stdin;
cmnoig8dq00019g2w5oa0x1m0	1	Administrativo	t	f	f	\N	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.507	2026-04-07 11:03:02.507	\N
cmnoig8e400039g2wqwz3aiwo	2	CEO / Founder	t	f	t	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.525	2026-04-07 11:03:02.525	\N
cmnoig8e700059g2wnjsp47hn	3	Cliente	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.527	2026-04-07 11:03:02.527	\N
cmnoig8e900079g2wc7kqp3in	4	Comercial	t	f	t	comercial@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.529	2026-04-07 11:03:02.529	\N
cmnoig8eb00099g2w8d9yi0v3	5	Contábil	t	t	t	gilciane@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.531	2026-04-07 11:03:02.531	\N
cmnoig8ee000b9g2wseoaref1	6	Diretor de Operações	t	f	t	fabiana@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.534	2026-04-07 11:03:02.534	\N
cmnoig8eh000d9g2wcfvngr9i	7	DRC	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.538	2026-04-07 11:03:02.538	\N
cmnoig8ek000f9g2w5avft3ci	8	Expedição	t	f	f	\N	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.54	2026-04-07 11:03:02.54	\N
cmnoig8en000h9g2wguatbwh1	9	Financeiro	t	f	t	rose@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.543	2026-04-07 11:03:02.543	\N
cmnoig8eo000j9g2wx0l230oz	10	Fiscal	t	t	t	fiscal@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.545	2026-04-07 11:03:02.545	\N
cmnoig8eq000l9g2wsn5iu8uy	11	Funcionário de Cliente	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.546	2026-04-07 11:03:02.546	\N
cmnoig8er000n9g2w30ux0p45	12	Legalização	t	t	t	leg@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.548	2026-04-07 11:03:02.548	\N
cmnoig8ev000p9g2wqtt03g9r	13	Marketing	t	f	t	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.55	2026-04-07 11:03:02.55	\N
cmnoig8ey000r9g2w42lbtwl2	14	Não Direcionado	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.554	2026-04-07 11:03:02.554	\N
cmnoig8f0000t9g2wr2t5g9eq	15	Outros	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.557	2026-04-07 11:03:02.557	\N
cmnoig8f3000v9g2wezhd1fah	16	Qualidade	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.56	2026-04-07 11:03:02.56	\N
cmnoig8f5000x9g2wuyt5sybw	17	Recebimento e Triagem	t	f	t	\N	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.562	2026-04-07 11:03:02.562	\N
cmnoig8f7000z9g2wbe3q9y4l	18	Recepção	t	f	f	\N	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.564	2026-04-07 11:03:02.564	\N
cmnoig8f900119g2wjggyockv	19	Recursos Humanos	t	f	t	maria.meneses@central-rnc.com.br	\N	\N	DIRECT	1.0000	t	2026-04-07 11:03:02.565	2026-04-07 11:03:02.565	\N
cmnoig8fc00139g2wat180b5g	20	Relacionamento Corporativo	t	f	f	\N	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.568	2026-04-07 11:03:02.568	\N
cmnoig8ff00159g2w5pcdajhu	21	Tecnologia da Informação	t	f	t	ti@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.571	2026-04-07 11:03:02.571	\N
cmnoig8fi00179g2w5ahz45bf	22	Trabalhista	t	t	t	dp@central-rnc.com.br	\N	\N	DIRECT	1.0000	f	2026-04-07 11:03:02.574	2026-04-07 11:03:02.574	\N
\.


--
-- Data for Name: cargo_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_events (id, cargo_id, user_id, type, version, changes, created_at) FROM stdin;
\.


--
-- Data for Name: cargos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargos (id, code, name, is_active, created_at, updated_at, area_id, autoridades, descricao_sumaria, educacao, experiencias, habilidades, responsabilidades, show_in_org_chart, treinamentos, version, empresa_id) FROM stdin;
cmnojsyku000v9gmw4d4jl1ee	32	CARGO TESTE	t	2026-04-07 11:40:55.95	2026-04-07 11:40:55.95	\N	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyit00009gmwyeko4wx6	1	Administrador de Redes	t	2026-04-07 11:40:55.878	2026-04-07 12:19:53.9	cmnoig8ff00159g2w5pcdajhu	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyj000019gmwu0zw2xkg	2	Analista Contábil I	t	2026-04-07 11:40:55.884	2026-04-07 12:19:58.913	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyj400029gmwczy3ll7r	3	Analista Contábil II	t	2026-04-07 11:40:55.888	2026-04-07 12:20:01.284	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyj700039gmwq0juyz2n	4	Analista Contábil III	t	2026-04-07 11:40:55.891	2026-04-07 12:20:04.066	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyja00049gmwthteqttv	5	Analista Contábil IV	t	2026-04-07 11:40:55.894	2026-04-07 12:20:28.677	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjc00059gmwk9allxcn	6	Analista Contábil V	t	2026-04-07 11:40:55.897	2026-04-07 12:20:35.313	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjp000b9gmwwf4dzas7	12	Analista Fiscal I	t	2026-04-07 11:40:55.91	2026-04-07 12:20:38.821	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjs000c9gmw15i3n7s8	13	Analista Fiscal II	t	2026-04-07 11:40:55.912	2026-04-07 12:20:40.924	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjt000d9gmw0wx44kkv	14	Analista Fiscal III	t	2026-04-07 11:40:55.914	2026-04-07 12:20:42.632	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjv000e9gmwymewq8ne	15	Analista Fiscal IV	t	2026-04-07 11:40:55.915	2026-04-07 12:20:46.702	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjw000f9gmw09msn16x	16	Analista Fiscal V	t	2026-04-07 11:40:55.917	2026-04-07 12:22:20.988	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyje00069gmwgpdnvt12	7	Analista de Legalização I	t	2026-04-07 11:40:55.898	2026-04-07 12:23:02.927	cmnoig8er000n9g2w30ux0p45	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjf00079gmwr85z8rz4	8	Analista de Legalização II	t	2026-04-07 11:40:55.9	2026-04-07 12:23:09.703	cmnoig8er000n9g2w30ux0p45	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjg00089gmwue63wxpr	9	Analista de Pessoal I	t	2026-04-07 11:40:55.901	2026-04-07 12:23:12.953	cmnoig8fi00179g2w5ahz45bf	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjj00099gmwug29h9u3	10	Analista de Pessoal II	t	2026-04-07 11:40:55.904	2026-04-07 12:23:20.139	cmnoig8fi00179g2w5ahz45bf	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjy000g9gmwu2qn8me6	17	Arquivista	t	2026-04-07 11:40:55.919	2026-04-07 12:23:23.436	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyk2000h9gmw9z0vyccp	18	Assessor Comercial	t	2026-04-07 11:40:55.922	2026-04-07 12:23:26.776	cmnoig8e900079g2wc7kqp3in	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyk4000i9gmw1z6mda41	19	Assistente Administrativo	t	2026-04-07 11:40:55.925	2026-04-07 12:23:29.306	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyk7000j9gmwzzq3t2mv	20	Assistente Contábil	t	2026-04-07 11:40:55.927	2026-04-07 12:23:32.362	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykc000m9gmwfud3j5gc	23	Assistente Fiscal	t	2026-04-07 11:40:55.932	2026-04-07 12:25:47.401	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyk9000k9gmwg7qwao22	21	Assistente de Legalização	t	2026-04-07 11:40:55.929	2026-04-07 12:25:52.506	cmnoig8er000n9g2w30ux0p45	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyka000l9gmw51v7a3b8	22	Assistente de Pessoal	t	2026-04-07 11:40:55.931	2026-04-07 12:26:02.51	cmnoig8fi00179g2w5ahz45bf	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykd000n9gmwfqr6azdr	24	Aux. Marketing	t	2026-04-07 11:40:55.933	2026-04-07 12:26:06.891	cmnoig8ev000p9g2wqtt03g9r	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykf000o9gmwgsfdg0p4	25	Auxiliar Administrativo	t	2026-04-07 11:40:55.935	2026-04-07 12:26:23.77	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyki000p9gmwu1qy0ydo	26	Auxiliar Comercial	t	2026-04-07 11:40:55.938	2026-04-07 12:26:26.029	cmnoig8e900079g2wc7kqp3in	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykl000q9gmwiqm80u9y	27	Auxiliar Contábil	t	2026-04-07 11:40:55.941	2026-04-07 12:26:28.664	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyks000u9gmwigzn7kaf	31	Auxiliar Fiscal	t	2026-04-07 11:40:55.949	2026-04-07 12:26:30.959	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyko000r9gmwa84jzhp0	28	Auxiliar de Pessoal	t	2026-04-07 11:40:55.944	2026-04-07 12:26:46.592	cmnoig8fi00179g2w5ahz45bf	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykp000s9gmwbce3c8bo	29	Auxiliar de Serviços Gerais	t	2026-04-07 11:40:55.946	2026-04-07 12:27:00.059	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykr000t9gmwwvz7sg8b	30	Auxiliar de T.I	t	2026-04-07 11:40:55.947	2026-04-07 12:27:03.127	cmnoig8ff00159g2w5pcdajhu	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykw000w9gmwiw8dy972	33	Coordenador Contábil	t	2026-04-07 11:40:55.953	2026-04-07 12:27:14.553	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyl2000y9gmwq1dpt9nd	35	Coordenador Fiscal	t	2026-04-07 11:40:55.958	2026-04-07 12:27:17.716	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsykz000x9gmwi327367t	34	Coordenador de Dep Pessoal	t	2026-04-07 11:40:55.956	2026-04-07 12:27:20.772	cmnoig8fi00179g2w5ahz45bf	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyl4000z9gmwmt540yur	36	Diretor Administrativo Financeiro	t	2026-04-07 11:40:55.961	2026-04-07 12:27:26.26	cmnoig8en000h9g2wguatbwh1	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyl600109gmwmzvfudg9	37	Diretor Executivo	t	2026-04-07 11:40:55.963	2026-04-07 12:27:35.026	cmnoig8ee000b9g2wseoaref1	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyl800119gmwu1dts9pa	38	Estagiário	t	2026-04-07 11:40:55.964	2026-04-07 12:27:40.479	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyl900129gmwlq7h80s5	39	Gerente Contábil	t	2026-04-07 11:40:55.966	2026-04-07 12:27:43.091	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsylb00139gmwywzz8lzz	40	Gerente Operacional	t	2026-04-07 11:40:55.967	2026-04-07 12:27:55.843	cmnoig8ee000b9g2wseoaref1	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyld00149gmwa19ytkdf	41	Motoboy	t	2026-04-07 11:40:55.969	2026-04-07 12:28:01.124	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsylg00159gmwzlncei8b	42	Recepcionista	t	2026-04-07 11:40:55.972	2026-04-07 12:28:03.167	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyll00179gmwgmrxy4ev	44	Supervisor Contábil	t	2026-04-07 11:40:55.978	2026-04-07 12:28:05.807	cmnoig8eb00099g2w8d9yi0v3	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsylq001a9gmw7kj0yq64	47	Supervisor Fiscal	t	2026-04-07 11:40:55.982	2026-04-07 12:28:14.942	cmnoig8eo000j9g2wx0l230oz	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyln00189gmw5ie4dygj	45	Supervisor de Legalização	t	2026-04-07 11:40:55.979	2026-04-07 12:28:33.921	cmnoig8er000n9g2w30ux0p45	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsylo00199gmwbyojm180	46	Supervisor de Pessoal	t	2026-04-07 11:40:55.981	2026-04-07 12:28:38.91	cmnoig8fi00179g2w5ahz45bf	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyli00169gmw1xoyt800	43	Sócio Administrador	t	2026-04-07 11:40:55.975	2026-04-07 12:28:41.568	cmnoig8dq00019g2w5oa0x1m0	\N	\N	\N	\N	\N	\N	f	\N	1	\N
cmnojsyjn000a9gmw4u13cubb	11	Analista de Sistemas I	t	2026-04-07 11:40:55.907	2026-04-07 13:02:28.044	cmnoig8ff00159g2w5pcdajhu	\N	\N	\N	\N	\N	\N	f	\N	1	\N
\.


--
-- Data for Name: cliente_arquivos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cliente_arquivos (id, cliente_id, file_name, file_url, file_size, mime_type, vencimento, user_id, created_at) FROM stdin;
cmnrxtlh600059g181objrhy6	cmnq3k9b500099gtk30clc154	Contrato primitivo.pdf	http://localhost:4000/api/upload/a9dcbc44-053b-44cd-94e8-a9329386f149.pdf	5503103	application/pdf	\N	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	2026-04-09 20:36:38.778
\.


--
-- Data for Name: cliente_contatos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cliente_contatos (id, cliente_id, nome, cargo, telefone, email, observacoes, principal, created_at, updated_at, area_id) FROM stdin;
\.


--
-- Data for Name: cliente_contrato_params; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cliente_contrato_params (id, cliente_id, empresa_id, honorario, lancamentos, faturamento, nf_entrada, nf_saida, nf_prestado, nf_tomado, funcionarios, created_at, updated_at) FROM stdin;
cmnruzoku00019g4op93kafu6	cmnq3k9bk000f9gtk2ozho7g6	\N	0	330	0	0	0	0	0	23	2026-04-09 19:17:23.885	2026-04-09 19:17:23.885
cmnrvcgq700019gzsfcifkd1k	cmnq3k9b500099gtk30clc154	\N	7577	300	25534.13	10	10	0	0	8	2026-04-09 19:27:20.24	2026-04-09 19:27:20.24
\.


--
-- Data for Name: cliente_erp_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cliente_erp_snapshots (id, cliente_id, empresa_id, mes, indicador, valor, created_at) FROM stdin;
\.


--
-- Data for Name: cliente_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cliente_events (id, cliente_id, user_id, type, version, changes, created_at) FROM stdin;
cmnpxa9cz00039g3wg9m1bmer	cmnpxa9cp00019g3wvlul3lav	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	created	1	\N	2026-04-08 10:46:04.259
cmnq3k9ae00029gtksrakgbw3	cmnq3k9a000009gtkf4rk98d4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.422
cmnq3k9ap00059gtkeqc102bt	cmnq3k9am00039gtkwbl70nm3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.434
cmnq3k9az00089gtkacp9jihs	cmnq3k9at00069gtkm63fah29	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.444
cmnq3k9b8000b9gtkxejj3s4j	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.452
cmnq3k9bd000e9gtklsuggob0	cmnq3k9bb000c9gtktm72adkq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.458
cmnq3k9bn000h9gtkumd94fbw	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.467
cmnq3k9bs000k9gtkm4b9p7fx	cmnq3k9bq000i9gtkf8xrbo2w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.473
cmnq3k9c0000n9gtkyecdichh	cmnq3k9bx000l9gtkpxjuh0ja	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.48
cmnq3k9c7000q9gtkgghxp827	cmnq3k9c4000o9gtknjrhuv1w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.487
cmnq3k9cd000t9gtkh635nrzf	cmnq3k9ca000r9gtkjvolpa5y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.493
cmnq3k9cj000w9gtkewtim8gr	cmnq3k9ch000u9gtk9q41qehq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.5
cmnq3k9cq000z9gtkau6wtkyo	cmnq3k9co000x9gtkr5nek2cv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.506
cmnq3k9cw00129gtkmyce4dui	cmnq3k9ct00109gtkg34d2lcn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.512
cmnq3k9d100159gtked1jln2m	cmnq3k9cz00139gtkm8gburpr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.518
cmnq3k9d800189gtker1j2mk6	cmnq3k9d600169gtk04efnui4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.524
cmnq3k9df001b9gtkzsjfjahj	cmnq3k9dd00199gtkizr8asna	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.532
cmnq3k9dl001e9gtk6cn5aoul	cmnq3k9dj001c9gtkrxyvg7gj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.538
cmnq3k9dr001h9gtkfidqanrh	cmnq3k9do001f9gtksjs8ueiu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.544
cmnq3k9dy001k9gtkp33utn4i	cmnq3k9dw001i9gtklpbfvlsp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.551
cmnq3k9e3001n9gtksyi49ya1	cmnq3k9e1001l9gtkjm1ybs0j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.556
cmnq3k9eb001q9gtk5v6jwyc1	cmnq3k9e7001o9gtkzdtiunj4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.563
cmnq3k9eg001t9gtknjr8ze98	cmnq3k9ee001r9gtkw7eo2i2h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.568
cmnq3k9el001w9gtkujjwpy3c	cmnq3k9ej001u9gtkf5msysax	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.573
cmnq3k9er001z9gtkr7w7qxol	cmnq3k9ep001x9gtk8pw6jnvc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.58
cmnq3k9ew00229gtkxv0pdhrm	cmnq3k9eu00209gtk146jseq5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.585
cmnq3k9f200259gtkbfskc2s4	cmnq3k9f000239gtk6dsk10h9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.591
cmnq3k9f900289gtkuxvojiro	cmnq3k9f700269gtkf4mfdrtm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.598
cmnq3k9fe002b9gtk75ykbdvk	cmnq3k9fc00299gtkecbz2nfd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.603
cmnq3k9fl002e9gtk80s2qmw0	cmnq3k9fi002c9gtkrg02pxyo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.61
cmnq3k9fr002h9gtktbivslpv	cmnq3k9fp002f9gtk4cw9jc16	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.616
cmnq3k9fx002k9gtk5lbxvlyk	cmnq3k9fv002i9gtkbqxxashz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.621
cmnq3k9g3002n9gtkj39qcsg6	cmnq3k9g0002l9gtkuein4sc4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.628
cmnq3k9g9002q9gtkz0tvmftx	cmnq3k9g7002o9gtkdggsjy4x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.634
cmnq3k9gf002t9gtkf0bh9cyk	cmnq3k9gd002r9gtktofhbv9w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.639
cmnq3k9gm002w9gtkcwucv39t	cmnq3k9gj002u9gtk0lkof33i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.646
cmnq3k9gr002z9gtkq0trd40b	cmnq3k9gp002x9gtkxxlashue	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.652
cmnq3k9gx00329gtkhzs7wmb6	cmnq3k9gv00309gtk9njyi80n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.657
cmnq3k9h400359gtk0g2whx93	cmnq3k9h100339gtkkib0aomb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.664
cmnq3k9h800389gtkgm471qyp	cmnq3k9h700369gtk8hypuq1h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.669
cmnq3k9hf003b9gtkk2oodviw	cmnq3k9hc00399gtk058srcps	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.676
cmnq3k9hm003e9gtkxwzub6r4	cmnq3k9hk003c9gtk3tvlrl2e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.683
cmnq3k9hs003h9gtkxjtcy178	cmnq3k9hq003f9gtk1h1n56vr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.689
cmnq3k9i0003k9gtk3jcfaxpk	cmnq3k9hw003i9gtkx4hay8q8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.696
cmnq3k9i6003n9gtkj9uyl7uy	cmnq3k9i3003l9gtkt5a2nccc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.702
cmnq3k9ib003q9gtka0vakci7	cmnq3k9i9003o9gtkcvougen5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.708
cmnq3k9ii003t9gtkyjbmgtew	cmnq3k9if003r9gtkn5k93woc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.714
cmnq3k9io003w9gtknvau5bl2	cmnq3k9im003u9gtkra1h671w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.721
cmnq3k9iw003z9gtksi7eqecz	cmnq3k9is003x9gtkarb6wm11	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.729
cmnq3k9j300429gtks6tyh1m6	cmnq3k9j000409gtkjwt60al8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.735
cmnq3k9j800459gtkwq859395	cmnq3k9j600439gtkhhltm4td	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.74
cmnq3k9jf00489gtk7msnp153	cmnq3k9jc00469gtk6eev2ot5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.747
cmnq3k9jk004b9gtkh6cssad5	cmnq3k9ji00499gtkrqxo8t6g	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.753
cmnq3k9jq004e9gtkbuf5yqgp	cmnq3k9jo004c9gtkwq2a4d32	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.758
cmnq3k9jx004h9gtk6tawlcgd	cmnq3k9ju004f9gtku4gd3470	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.765
cmnq3k9k2004k9gtkvb14ozpo	cmnq3k9k0004i9gtkvuc6xlwl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.771
cmnq3k9k9004n9gtkn94enpbt	cmnq3k9k6004l9gtk2444l8ek	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.777
cmnq3k9kf004q9gtkmlcwmqqs	cmnq3k9kd004o9gtk5ha7sydc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.783
cmnq3k9kk004t9gtkwhzuifau	cmnq3k9ki004r9gtk2g9f78lb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.789
cmnq3k9ks004w9gtk8qq45fmc	cmnq3k9kp004u9gtkwkmcokii	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.796
cmnq3k9kz004z9gtk010mvb17	cmnq3k9kw004x9gtkb6dqrzi6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.803
cmnq3k9l600529gtkiq12q24u	cmnq3k9l300509gtk9s0lf5tr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.81
cmnq3k9lc00559gtk0r4liwrl	cmnq3k9la00539gtkzuxym3f3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.817
cmnq3k9li00589gtkw09k5rfq	cmnq3k9lg00569gtk3n3uriyc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.822
cmnq3k9lq005b9gtkzgda8q5p	cmnq3k9ln00599gtk9fwt2hvy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.83
cmnq3k9lv005e9gtkaqh9ju0n	cmnq3k9lt005c9gtkzrgsudq2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.836
cmnq3k9m1005h9gtk48xh9rk4	cmnq3k9ly005f9gtk7e66bryv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.842
cmnq3k9m9005k9gtkdluzh5dz	cmnq3k9m6005i9gtkm7wxce18	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.849
cmnq3k9mg005n9gtk713ocydh	cmnq3k9md005l9gtkgxrthe84	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.856
cmnq3k9mm005q9gtk2zy6tji0	cmnq3k9mk005o9gtkzqlwua45	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.863
cmnq3k9mr005t9gtk3cgcfts2	cmnq3k9mp005r9gtkyttc05v6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.868
cmnq3k9mx005w9gtktuamgg9n	cmnq3k9mv005u9gtk3nimxjr6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.873
cmnq3k9n4005z9gtk64f8r5z4	cmnq3k9n1005x9gtk787do8cx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.88
cmnq3k9n900629gtkcla3yvhe	cmnq3k9n700609gtks7u4eq6m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.886
cmnq3k9nf00659gtkheiwkw1v	cmnq3k9nd00639gtkyntwyqu3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.891
cmnq3k9nl00689gtka9dkezt1	cmnq3k9nj00669gtk3oz7tewz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.898
cmnq3k9ns006b9gtkneugqy8d	cmnq3k9np00699gtkpyr4e1jr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.904
cmnq3k9ny006e9gtkl3u0m5so	cmnq3k9nv006c9gtkdwigjhm4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.91
cmnq3k9o3006h9gtkb0vqjvmt	cmnq3k9o1006f9gtklkj56ip3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.916
cmnq3k9o9006k9gtkhtc0ycer	cmnq3k9o7006i9gtkuq462szc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.921
cmnq3k9of006n9gtkx16l468o	cmnq3k9oc006l9gtkgd18hy1x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.927
cmnq3k9ol006q9gtkmsif6n3c	cmnq3k9oj006o9gtkrgs40ni5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.934
cmnq3k9or006t9gtk52xi6s9h	cmnq3k9op006r9gtk9v8rqh6c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.94
cmnq3k9oy006w9gtk6uwiicj9	cmnq3k9ow006u9gtksqgsa2bo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.947
cmnq3k9p4006z9gtkxgy6hfs9	cmnq3k9p1006x9gtk9yu46yb2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.952
cmnq3k9p900729gtk2aaivp7i	cmnq3k9p700709gtkpj0tbzlb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.958
cmnq3k9pg00759gtkvfhdax8q	cmnq3k9pd00739gtk3827w3td	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.964
cmnq3k9pl00789gtkxgn8dnen	cmnq3k9pj00769gtky4lm1vsa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.97
cmnq3k9pr007b9gtkda6ckx5z	cmnq3k9pp00799gtkr21u4zao	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.976
cmnq3k9py007e9gtkpkac0lgh	cmnq3k9pw007c9gtkmvaph9ii	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.982
cmnq3k9q3007h9gtk50er1lon	cmnq3k9q1007f9gtkfz1k8isf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.988
cmnq3k9qa007k9gtkegxppgae	cmnq3k9q7007i9gtkg63wd8vk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:48.994
cmnq3k9qg007n9gtk4w0wjsz1	cmnq3k9qe007l9gtk0llk26g8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49
cmnq3k9ql007q9gtkk8z4hs6s	cmnq3k9qj007o9gtkfeilictn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.006
cmnq3k9qt007t9gtk3qrc07p3	cmnq3k9qp007r9gtkexxa5r7j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.013
cmnq3k9qz007w9gtk1gt3y5q8	cmnq3k9qw007u9gtk8zxqotw1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.02
cmnq3k9r5007z9gtkimxiohsm	cmnq3k9r2007x9gtkzfyj3yip	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.025
cmnq3k9rc00829gtkt6ovuo8f	cmnq3k9r900809gtk51jev7n2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.032
cmnq3k9rh00859gtk9mqsks4v	cmnq3k9rf00839gtkluyayt5o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.038
cmnq3k9ro00889gtkcyzt5ibb	cmnq3k9rl00869gtk33zh03lb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.044
cmnq3k9ru008b9gtk1yrr23m7	cmnq3k9rs00899gtkgs0anbmi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.05
cmnq3k9rz008e9gtksi6j322p	cmnq3k9rx008c9gtk84kpaeee	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.056
cmnq3k9s5008h9gtkin7njct6	cmnq3k9s3008f9gtkhlguuu6w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.062
cmnq3k9sb008k9gtk34oxknml	cmnq3k9s9008i9gtkb8m2k9hl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.067
cmnq3k9sg008n9gtkdeqf2fau	cmnq3k9se008l9gtkbou38vhs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.073
cmnq3k9sn008q9gtkw8ht51fg	cmnq3k9sk008o9gtk7cq3abef	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.079
cmnq3k9ss008t9gtkf2u3axwd	cmnq3k9sq008r9gtk24og21mq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.084
cmnq3k9sx008w9gtkplgl8lch	cmnq3k9sv008u9gtk69ze8o1o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.089
cmnq3k9t3008z9gtkyov8v0cw	cmnq3k9t0008x9gtki0wmkrl7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.096
cmnq3k9t900929gtkqmc2zahd	cmnq3k9t600909gtki88wk67q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.101
cmnq3k9te00959gtk6ltvqakr	cmnq3k9tc00939gtk8u1ku3yx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.106
cmnq3k9tk00989gtk64ssxyys	cmnq3k9th00969gtkb2asoook	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.113
cmnq3k9tq009b9gtkcohdhvvo	cmnq3k9to00999gtkynexud64	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.118
cmnq3k9tv009e9gtkyl51ctbq	cmnq3k9ts009c9gtke3w3xgdj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.123
cmnq3k9u1009h9gtk57i1bfav	cmnq3k9ty009f9gtke0xo8uby	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.129
cmnq3k9u6009k9gtknk5uxoal	cmnq3k9u4009i9gtk8xaw5628	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.135
cmnq3k9ub009n9gtk8xy2i8nz	cmnq3k9u9009l9gtkvfpsge8m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.14
cmnq3k9uj009q9gtkh161vsbm	cmnq3k9ug009o9gtk4a7rji2o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.148
cmnq3k9up009t9gtkksjcukdo	cmnq3k9um009r9gtkw5g0dybm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.153
cmnq3k9uu009w9gtkio8dm5ou	cmnq3k9us009u9gtkmfqig75y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.159
cmnq3k9uz009z9gtkj9mpba04	cmnq3k9uy009x9gtkysnlbfhb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.164
cmnq3k9v400a29gtkjqnzpqi8	cmnq3k9v200a09gtk9so7wlgv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.168
cmnq3k9v900a59gtkaee3qtk2	cmnq3k9v600a39gtkuvfn59gk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.173
cmnq3k9ve00a89gtkvu0b8snn	cmnq3k9vc00a69gtkgm3hjvb2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.178
cmnq3k9vi00ab9gtkcih3gy7d	cmnq3k9vg00a99gtkpb6kjrcs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.183
cmnq3k9vm00ae9gtk7rsl5b6m	cmnq3k9vl00ac9gtknlwfpu8a	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.187
cmnq3k9vr00ah9gtkr0muw25l	cmnq3k9vp00af9gtkb5e8ctmi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.191
cmnq3k9vw00ak9gtkbmt4jfby	cmnq3k9vu00ai9gtkllbrb7i8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.197
cmnq3k9w100an9gtkl5x7m32u	cmnq3k9vz00al9gtkgiq4v5jk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.201
cmnq3k9w600aq9gtkskd9a4gp	cmnq3k9w400ao9gtk25h2at23	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.207
cmnq3k9wc00at9gtk6yjcj8ss	cmnq3k9wa00ar9gtk6u3x4ypi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.212
cmnq3k9wg00aw9gtk7pl29cn3	cmnq3k9wf00au9gtkal5bjx61	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.217
cmnq3k9wl00az9gtkf2xpab8v	cmnq3k9wj00ax9gtklutbbbqn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.221
cmnq3k9wq00b29gtkkk69zmks	cmnq3k9wo00b09gtkjgurtgkt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.226
cmnq3k9wu00b59gtka7y17g5s	cmnq3k9wt00b39gtkbaugdwq3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.231
cmnq3k9wz00b89gtkt3m417s0	cmnq3k9wx00b69gtkzwkc285q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.235
cmnq3k9x300bb9gtk64i61v1o	cmnq3k9x100b99gtkefcn5kpj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.24
cmnq3k9x800be9gtkiepd1joz	cmnq3k9x600bc9gtkhnza339v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.244
cmnq3k9xc00bh9gtkhgfhkde8	cmnq3k9xa00bf9gtkyxf805g0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.249
cmnq3k9xi00bk9gtk4720gys2	cmnq3k9xg00bi9gtk3198wnzi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.254
cmnq3k9xn00bn9gtk2y6hphq8	cmnq3k9xl00bl9gtkz3fj2voc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.259
cmnq3k9xs00bq9gtk1lkf2kwu	cmnq3k9xq00bo9gtk67qnw7le	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.264
cmnq3k9xx00bt9gtk2khjn18g	cmnq3k9xv00br9gtkn9qx2jv5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.269
cmnq3k9y200bw9gtkx22bh6xs	cmnq3k9y000bu9gtkiv1jhbjk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.274
cmnq3k9y600bz9gtk31kddonu	cmnq3k9y500bx9gtksjp0jt5x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.279
cmnq3k9ya00c29gtkjrpjei3r	cmnq3k9y900c09gtkqfv9lc8x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.283
cmnq3k9yf00c59gtk4qnzak4k	cmnq3k9yd00c39gtk2o8enqe7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.287
cmnq3k9yj00c89gtkeeaj7f0u	cmnq3k9yi00c69gtksph76t0q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.292
cmnq3k9yo00cb9gtklh5uf98y	cmnq3k9ym00c99gtk7rtygmkn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.296
cmnq3k9ys00ce9gtkd5vwcahq	cmnq3k9yq00cc9gtks9jpxoxe	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.301
cmnq3k9yy00ch9gtkiaqqkux5	cmnq3k9yw00cf9gtkzodqh1mv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.306
cmnq3k9z300ck9gtkfujg9a37	cmnq3k9z100ci9gtknht5i9bb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.311
cmnq3k9z700cn9gtkb4oxnxd9	cmnq3k9z500cl9gtkqnhysbdb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.316
cmnq3k9zb00cq9gtkcp67wpyl	cmnq3k9za00co9gtkwqdr9d1p	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.32
cmnq3k9zg00ct9gtko4d9ppl4	cmnq3k9ze00cr9gtk6zumliku	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.325
cmnq3k9zl00cw9gtkg5wyb8wz	cmnq3k9zj00cu9gtklgjs7okw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.33
cmnq3k9zq00cz9gtkod3u8yeu	cmnq3k9zo00cx9gtkrn30cpfa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.334
cmnq3k9zu00d29gtk7q31js7i	cmnq3k9zt00d09gtkx81p2hmf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.339
cmnq3k9zz00d59gtk07iad4dn	cmnq3k9zx00d39gtkkblg8xxa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.343
cmnq3ka0300d89gtklifu72ui	cmnq3ka0200d69gtk5f76esn4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.348
cmnq3ka0900db9gtkx3meytzz	cmnq3ka0600d99gtkho0625sw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.353
cmnq3ka0e00de9gtksinpa49h	cmnq3ka0c00dc9gtki9cywl3l	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.358
cmnq3ka0k00dh9gtkcltf13s6	cmnq3ka0i00df9gtkffyne66z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.365
cmnq3ka0p00dk9gtkzf5frmmu	cmnq3ka0n00di9gtksbf63978	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.369
cmnq3ka0t00dn9gtkwkkks4r4	cmnq3ka0r00dl9gtkbch4m0ym	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.374
cmnq3ka0z00dq9gtk5mgl30az	cmnq3ka0w00do9gtk2igt0n9f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.38
cmnq3ka1400dt9gtkiz8ozl8y	cmnq3ka1200dr9gtkyo3rjywb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.385
cmnq3ka1900dw9gtk2jkg7h1p	cmnq3ka1700du9gtkogvdmnyv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.389
cmnq3ka1e00dz9gtk9ewtztkt	cmnq3ka1c00dx9gtke0a7f4qb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.395
cmnq3ka1k00e29gtkgs96wt5m	cmnq3ka1i00e09gtkyy62ueej	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.4
cmnq3ka1o00e59gtka0w0gcuj	cmnq3ka1n00e39gtkvwimrqpx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.405
cmnq3ka1t00e89gtkpp23dh5h	cmnq3ka1r00e69gtkkgnxguet	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.41
cmnq3ka1z00eb9gtkdrpdo59t	cmnq3ka1x00e99gtkhvb9ddvs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.415
cmnq3ka2400ee9gtkwsj238f1	cmnq3ka2200ec9gtkqiz5xx3k	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.42
cmnq3ka2800eh9gtkm8p1i0rp	cmnq3ka2600ef9gtkdzcmv4iy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.424
cmnq3ka2f00ek9gtkiqz76h9h	cmnq3ka2c00ei9gtkkjvhpuh0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.431
cmnq3ka2j00en9gtkzq8av3c6	cmnq3ka2i00el9gtklzhbjw8u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.436
cmnq3ka2o00eq9gtk8l1j3njq	cmnq3ka2m00eo9gtkfc6qoay1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.44
cmnq3ka2u00et9gtk0u27iwmm	cmnq3ka2s00er9gtkgjm9ixtx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.446
cmnq3ka2y00ew9gtksn9k4psp	cmnq3ka2x00eu9gtk6l7dhmfo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.451
cmnq3ka3300ez9gtksswtmhzf	cmnq3ka3100ex9gtksay8e9rj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.455
cmnq3ka3800f29gtkb47mdo1d	cmnq3ka3500f09gtkyau7v3me	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.46
cmnq3ka3e00f59gtkbwl1taxm	cmnq3ka3c00f39gtk5x65xcj7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.466
cmnq3ka3i00f89gtkopu00m9q	cmnq3ka3h00f69gtkqqztboj2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.471
cmnq3ka3n00fb9gtkx2a748fm	cmnq3ka3l00f99gtku9lz76n1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.475
cmnq3ka3t00fe9gtkqkupicvh	cmnq3ka3q00fc9gtkieneves1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.481
cmnq3ka3x00fh9gtku9g4hc59	cmnq3ka3w00ff9gtknwyjzkki	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.486
cmnq3ka4100fk9gtkxdt2a7cl	cmnq3ka4000fi9gtkxguzej61	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.49
cmnq3ka4700fn9gtk4v2aqx5i	cmnq3ka4500fl9gtk8gurszby	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.496
cmnq3ka4c00fq9gtkbvkd20dk	cmnq3ka4a00fo9gtkmfqrb3sh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.5
cmnq3ka4g00ft9gtk61xiptbn	cmnq3ka4f00fr9gtkto5tz8z0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.505
cmnq3ka4l00fw9gtkmub0u3s5	cmnq3ka4j00fu9gtklhnjlrow	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.51
cmnq3ka4s00fz9gtk8kix71k2	cmnq3ka4q00fx9gtkv46t8ved	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.517
cmnq3ka4y00g29gtkzmp3iniw	cmnq3ka4w00g09gtk831qjra2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.522
cmnq3ka5400g59gtk57qujnnd	cmnq3ka5100g39gtkz5y3kqa6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.528
cmnq3ka5900g89gtknzkdfrb0	cmnq3ka5700g69gtkv9o8loso	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.534
cmnq3ka5e00gb9gtky73q6jq7	cmnq3ka5c00g99gtkn4efi59s	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.538
cmnq3ka5j00ge9gtk4w9to2bw	cmnq3ka5h00gc9gtk89z6w2vd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.543
cmnq3ka5o00gh9gtk1rixf5z6	cmnq3ka5n00gf9gtk8hmv1ie2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.549
cmnq3ka5t00gk9gtkjkcxywn7	cmnq3ka5r00gi9gtkmcpij272	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.554
cmnq3ka5y00gn9gtks61p53ij	cmnq3ka5w00gl9gtkufcw513q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.558
cmnq3ka6400gq9gtkft82xhbn	cmnq3ka6200go9gtkn4tge1wl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.564
cmnq3ka6800gt9gtkjcxkvdpj	cmnq3ka6700gr9gtkbifmx2j4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.569
cmnq3ka6d00gw9gtkck8bo68e	cmnq3ka6b00gu9gtk5nuhesjv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.573
cmnq3ka6i00gz9gtkh0reyvp4	cmnq3ka6g00gx9gtkwzcoyxif	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.579
cmnq3ka6n00h29gtkac5ct9dt	cmnq3ka6m00h09gtk09hnyfb2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.584
cmnq3ka6s00h59gtkuhkjp9e5	cmnq3ka6q00h39gtknhmqcedh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.588
cmnq3ka6x00h89gtkjz71ghfe	cmnq3ka6u00h69gtkz2e0wsh0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.594
cmnq3ka7300hb9gtk7u11z6sj	cmnq3ka7100h99gtkuvtfdujn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.599
cmnq3ka7800he9gtkxspxeag1	cmnq3ka7600hc9gtk3luh4dfz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.604
cmnq3ka7c00hh9gtk2ey6bw0b	cmnq3ka7a00hf9gtkdp4mtabd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.609
cmnq3ka7i00hk9gtknkxky3yc	cmnq3ka7g00hi9gtkf8s0on0u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.615
cmnq3ka7n00hn9gtk36k8bl2x	cmnq3ka7l00hl9gtkvfj51mjg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.619
cmnq3ka7r00hq9gtk1hkl8gok	cmnq3ka7p00ho9gtks8qhopuv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.624
cmnq3ka7y00ht9gtkunglzcy0	cmnq3ka7v00hr9gtki20y25ky	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.63
cmnq3ka8300hw9gtk4oaije0q	cmnq3ka8100hu9gtkqx4rnghp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.635
cmnq3ka8700hz9gtk7fuq7o7c	cmnq3ka8600hx9gtk99wrgd7p	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.64
cmnq3ka8d00i29gtkmm2iv8vs	cmnq3ka8b00i09gtkko2zh7jm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.646
cmnq3ka8i00i59gtk4iajg2gs	cmnq3ka8g00i39gtk6v3i070c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.65
cmnq3ka8m00i89gtkhl2nhz58	cmnq3ka8l00i69gtkhsbwixip	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.655
cmnq3ka8r00ib9gtk8iw1d6zn	cmnq3ka8p00i99gtk389edw5i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.659
cmnq3ka8x00ie9gtkr3tg0q5l	cmnq3ka8v00ic9gtkxcinaefk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.665
cmnq3ka9100ih9gtkz21793o5	cmnq3ka8z00if9gtkxbep9q53	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.669
cmnq3ka9500ik9gtksh0nq98v	cmnq3ka9400ii9gtkcqnybpf8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.674
cmnq3ka9c00in9gtkxsojtxge	cmnq3ka9900il9gtk523ze8x1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.68
cmnq3ka9h00iq9gtkznyuqxg3	cmnq3ka9f00io9gtkw1jrirmc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.686
cmnq3ka9m00it9gtk404tqwtw	cmnq3ka9l00ir9gtks53npe5m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.691
cmnq3ka9s00iw9gtk1ix382mi	cmnq3ka9q00iu9gtk8uf1zjxh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.697
cmnq3ka9y00iz9gtkrgb2bjbb	cmnq3ka9w00ix9gtkm2t4gunm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.702
cmnq3kaa300j29gtka96enxuz	cmnq3kaa100j09gtkj79fdfgp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.707
cmnq3kaa900j59gtkn8bkna2b	cmnq3kaa600j39gtkfjuiv5ua	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.713
cmnq3kaae00j89gtktb4z7rp8	cmnq3kaac00j69gtkjpyjb9dc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.718
cmnq3kaai00jb9gtkwemk96cu	cmnq3kaag00j99gtkw51b6mlx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.723
cmnq3kaao00je9gtkehngg6i6	cmnq3kaam00jc9gtkqqqpr7be	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.729
cmnq3kaau00jh9gtkdr56tsag	cmnq3kaas00jf9gtkem0xuwqw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.734
cmnq3kaay00jk9gtkykrifga3	cmnq3kaax00ji9gtkmj3gm5uj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.739
cmnq3kab400jn9gtku7hzjuyz	cmnq3kab100jl9gtkgrxlp02t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.744
cmnq3kaba00jq9gtkby15wou8	cmnq3kab800jo9gtkc59erntj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.75
cmnq3kabe00jt9gtklmi358di	cmnq3kabc00jr9gtk7ts96lv9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.755
cmnq3kabj00jw9gtkowpp3fwc	cmnq3kabh00ju9gtkb62suvpk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.76
cmnq3kabp00jz9gtkc4z5oe9a	cmnq3kabn00jx9gtkds5k34c8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.766
cmnq3kabu00k29gtkkmjttmx0	cmnq3kabs00k09gtky2zrtysj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.77
cmnq3kaby00k59gtkasqgi9c9	cmnq3kabx00k39gtkpknoii0n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.775
cmnq3kac400k89gtk9hf0xa3x	cmnq3kac200k69gtkve7afd2r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.781
cmnq3kac900kb9gtkqzp8hy7z	cmnq3kac700k99gtk94sdf2z6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.786
cmnq3kace00ke9gtkp7s58s8o	cmnq3kacc00kc9gtkyenftl9d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.79
cmnq3kack00kh9gtkwgieg96u	cmnq3kaci00kf9gtkse2j35l5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.797
cmnq3kacp00kk9gtk2tix2ggu	cmnq3kacn00ki9gtkxhb65q87	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.802
cmnq3kacu00kn9gtky48fsbxl	cmnq3kacs00kl9gtk5ltyfs3y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.806
cmnq3kad000kq9gtknyl6yddw	cmnq3kacx00ko9gtkjw763pin	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.812
cmnq3kad500kt9gtkhpdt6nou	cmnq3kad300kr9gtk79xks1cm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.818
cmnq3kada00kw9gtkztl8coyu	cmnq3kad800ku9gtklsvhcgi3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.822
cmnq3kadg00kz9gtk5rdg4x73	cmnq3kadd00kx9gtks2ixwou8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.828
cmnq3kadl00l29gtknp5xn6j4	cmnq3kadj00l09gtk7q87oh1h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.834
cmnq3kadq00l59gtkgq67xhkj	cmnq3kado00l39gtkph6hixor	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.838
cmnq3kadw00l89gtktpue2lcs	cmnq3kadt00l69gtkl40q7yof	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.844
cmnq3kae100lb9gtkfhtjcus2	cmnq3kae000l99gtkwlt3jr0q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.85
cmnq3kae600le9gtkmpkm8qrz	cmnq3kae400lc9gtkqf8dqls6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.854
cmnq3kaeb00lh9gtkrfvpanhd	cmnq3kae900lf9gtkr2tyoxbx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.859
cmnq3kaeh00lk9gtkccshk37n	cmnq3kaef00li9gtk8e1moe22	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.865
cmnq3kael00ln9gtkta77wwvv	cmnq3kaej00ll9gtkaa75b0nt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.869
cmnq3kaeq00lq9gtkmggnav57	cmnq3kaeo00lo9gtkccjkb0ef	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.874
cmnq3kaev00lt9gtkbha62ipk	cmnq3kaet00lr9gtk7nmjfndc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.88
cmnq3kaf000lw9gtko2lqzr27	cmnq3kaey00lu9gtkqnu0m3or	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.885
cmnq3kaf500lz9gtka0zt4u1p	cmnq3kaf300lx9gtkp4zlvtmw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.889
cmnq3kafa00m29gtksn7c9xk1	cmnq3kaf700m09gtkir081fkv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.895
cmnq3kaff00m59gtkhtadfb4p	cmnq3kafd00m39gtk9kfsly0v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.9
cmnq3kafk00m89gtk81rznq1c	cmnq3kafi00m69gtkhrkribyx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.904
cmnq3kafp00mb9gtkg4b8k43k	cmnq3kafm00m99gtkosj21h8n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.91
cmnq3kafv00me9gtkhzxo1kne	cmnq3kaft00mc9gtk0yv3qnkw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.916
cmnq3kag000mh9gtkmkz83cv3	cmnq3kafy00mf9gtkboo4pxo5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.92
cmnq3kag400mk9gtk309imm07	cmnq3kag200mi9gtk433q9jwg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.925
cmnq3kagb00mn9gtk1bly0yuq	cmnq3kag900ml9gtktp7pffb2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.931
cmnq3kagf00mq9gtk8ket7jwo	cmnq3kage00mo9gtkx1efbol7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.936
cmnq3kagk00mt9gtkr315kw30	cmnq3kagi00mr9gtkhb2nqptp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.94
cmnq3kags00mw9gtkp3rz85ev	cmnq3kagq00mu9gtkmfnlbkio	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.948
cmnq3kagx00mz9gtk2g7091mz	cmnq3kagv00mx9gtkcrx98po0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.953
cmnq3kah200n29gtkcn2xofys	cmnq3kah000n09gtk7rxk64n0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.958
cmnq3kah800n59gtkd3g88kqt	cmnq3kah600n39gtklsdmsv41	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.965
cmnq3kahd00n89gtkwq8x7qz4	cmnq3kahb00n69gtkhuuxec93	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.969
cmnq3kahh00nb9gtkxls2jboj	cmnq3kahf00n99gtk0hlwelua	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.974
cmnq3kaho00ne9gtkatljqi0j	cmnq3kahl00nc9gtk3se3alvt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.98
cmnq3kahs00nh9gtkq10w07qn	cmnq3kahr00nf9gtkjw11wgqj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.985
cmnq3kahx00nk9gtk3tiky29r	cmnq3kahv00ni9gtkxqd1dsym	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.989
cmnq3kai300nn9gtk74wk1ked	cmnq3kai000nl9gtk2w4tdbi6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:49.995
cmnq3kai800nq9gtkabhkmq45	cmnq3kai600no9gtk64v2w610	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50
cmnq3kaid00nt9gtkxf09ismi	cmnq3kaib00nr9gtkjgmuvyav	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.005
cmnq3kaii00nw9gtkkwwx5dz0	cmnq3kaif00nu9gtkbs7a7r9r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.01
cmnq3kaio00nz9gtkztpkkmfr	cmnq3kaim00nx9gtkx3pesqrg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.016
cmnq3kais00o29gtkp83aisvu	cmnq3kaiq00o09gtkg6j5ru17	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.021
cmnq3kaix00o59gtkbeqq0fyf	cmnq3kaiv00o39gtkiv77bhvi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.026
cmnq3kaj400o89gtkjccnr5f9	cmnq3kaj200o69gtkulzczgc5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.033
cmnq3kaj900ob9gtks0mcvfrt	cmnq3kaj700o99gtkxqawu7ie	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.037
cmnq3kaje00oe9gtkd5wvc6g7	cmnq3kajc00oc9gtkfatf4ltf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.043
cmnq3kajk00oh9gtkduujpvmx	cmnq3kaji00of9gtk39uctkrk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.048
cmnq3kajo00ok9gtk4f9c11ny	cmnq3kajm00oi9gtkvk0olth8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.053
cmnq3kajs00on9gtkc6jf5mmy	cmnq3kajr00ol9gtk2jv9ac2r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.057
cmnq3kajz00oq9gtk1uagceg9	cmnq3kajx00oo9gtk4uztkved	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.064
cmnq3kak400ot9gtkf82ble71	cmnq3kak200or9gtkb7g1bz5i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.068
cmnq3kak800ow9gtkq715wkwj	cmnq3kak600ou9gtkihja4shk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.072
cmnq3kake00oz9gtkp01iytil	cmnq3kakb00ox9gtkxbtiauc4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.079
cmnq3kakk00p29gtkdgt9gjp8	cmnq3kaki00p09gtkrobikq5v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.084
cmnq3kako00p59gtkhwptdus2	cmnq3kakn00p39gtku7vhgvlw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.089
cmnq3kaku00p89gtkgihbcs2f	cmnq3kakr00p69gtkho36otay	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.095
cmnq3kal000pb9gtk9sjnay5h	cmnq3kaky00p99gtkxmnvkbcw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.1
cmnq3kal400pe9gtkzwwqtbpj	cmnq3kal200pc9gtkesn096gk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.104
cmnq3kal900ph9gtkmi8rumxd	cmnq3kal700pf9gtk1icnp6lf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.109
cmnq3kalf00pk9gtkyaw8wajx	cmnq3kald00pi9gtkztr2yibc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.115
cmnq3kalk00pn9gtk3mk2acbd	cmnq3kali00pl9gtknpox6ixn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.121
cmnq3kalp00pq9gtk7ndopnf8	cmnq3kaln00po9gtk7nkield4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.126
cmnq3kalv00pt9gtknqipibri	cmnq3kalu00pr9gtkhv1hqmi7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.132
cmnq3kam000pw9gtk2wubpdrn	cmnq3kaly00pu9gtkszdlsvd8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.136
cmnq3kam400pz9gtkffryz19m	cmnq3kam300px9gtk1nrv7cph	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.141
cmnq3kama00q29gtkywjc7neh	cmnq3kam800q09gtk0c648cip	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.146
cmnq3kame00q59gtkzxp93fcu	cmnq3kamd00q39gtkv56iq0oi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.151
cmnq3kamj00q89gtkwb2nal6i	cmnq3kamh00q69gtkp4mnv7rx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.155
cmnq3kamo00qb9gtk12yroscs	cmnq3kamm00q99gtkji9x0r7e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.16
cmnq3kams00qe9gtk3exv1dgn	cmnq3kamr00qc9gtko7gszt4u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.165
cmnq3kamx00qh9gtkqjhqbq4p	cmnq3kamv00qf9gtkkji9mzf2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.169
cmnq3kan200qk9gtkx25m5pmy	cmnq3kan000qi9gtkyb42gd3i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.174
cmnq3kan700qn9gtktf73s4bl	cmnq3kan500ql9gtkk310gvp1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.179
cmnq3kane00qq9gtkk3l2zp0j	cmnq3kana00qo9gtkkxmy71hh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.186
cmnq3kank00qt9gtkvtbxgthc	cmnq3kanh00qr9gtkmsyw86yv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.192
cmnq3kano00qw9gtkgrlpu4kx	cmnq3kann00qu9gtkz0w0ctq1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.197
cmnq3kans00qz9gtk6vqz83tf	cmnq3kanr00qx9gtkmdb9ujs5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.201
cmnq3kanw00r29gtklma68v3y	cmnq3kanv00r09gtkngidwdpx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.205
cmnq3kao200r59gtkwcq5k62u	cmnq3kao000r39gtk35f83ggi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.21
cmnq3kao700r89gtk3b3tqj95	cmnq3kao500r69gtktw93t6ds	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.215
cmnq3kaob00rb9gtk021d8z07	cmnq3kaoa00r99gtkdzrsqcwf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.22
cmnq3kaog00re9gtkgewic76p	cmnq3kaoe00rc9gtko5o9q6gm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.225
cmnq3kaol00rh9gtkfe4lqq00	cmnq3kaoj00rf9gtk9s9u3tq4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.23
cmnq3kaop00rk9gtko7grhdev	cmnq3kaoo00ri9gtkizglfk6n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.234
cmnq3kaou00rn9gtkvb946dh8	cmnq3kaos00rl9gtkpatrbbdo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.238
cmnq3kaoz00rq9gtkm090l7p1	cmnq3kaoy00ro9gtkd810o7ua	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.244
cmnq3kap400rt9gtkaojtoqlb	cmnq3kap200rr9gtkwya4zyjf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.248
cmnq3kap800rw9gtk1i4tca3m	cmnq3kap700ru9gtkvxyegm03	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.253
cmnq3kapd00rz9gtk9yjgsiqe	cmnq3kapb00rx9gtkllw5r7vq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.257
cmnq3kaph00s29gtk2zibgp6p	cmnq3kapg00s09gtk68uilebe	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.262
cmnq3kapm00s59gtkyvhj36op	cmnq3kapk00s39gtk8x759ngi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.266
cmnq3kapq00s89gtkalep7yij	cmnq3kapo00s69gtkc0mwsye5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.271
cmnq3kapv00sb9gtkjf465qwe	cmnq3kapt00s99gtkobolwmuq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.275
cmnq3kapz00se9gtkgplbiwon	cmnq3kapy00sc9gtkcfkplqn6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.28
cmnq3kaq400sh9gtkxtah4p8s	cmnq3kaq200sf9gtktam296xk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.284
cmnq3kaq900sk9gtkqmw06keq	cmnq3kaq700si9gtkdi32f89c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.289
cmnq3kaqd00sn9gtknpotb841	cmnq3kaqc00sl9gtk3jm9yqgp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.294
cmnq3kaqi00sq9gtkt3s8qt7q	cmnq3kaqg00so9gtkzr590g0u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.298
cmnq3kaqm00st9gtkdflyqg8i	cmnq3kaqk00sr9gtk3pd81ept	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.303
cmnq3kaqq00sw9gtklavumn1d	cmnq3kaqp00su9gtkiuh9esoq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.307
cmnq3kaqv00sz9gtkndiea59c	cmnq3kaqt00sx9gtk7231nhnj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.312
cmnq3kaqz00t29gtkv38yadde	cmnq3kaqy00t09gtkfcbmy94c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.316
cmnq3kar500t59gtk60iiz1v4	cmnq3kar300t39gtkgmedkwu9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.321
cmnq3kara00t89gtk23wkl9fo	cmnq3kar800t69gtke1mg5nqk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.326
cmnq3kare00tb9gtky4l2cl00	cmnq3kard00t99gtkur9fzjpc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.331
cmnq3karj00te9gtkt7d0gwkv	cmnq3karh00tc9gtk27rndad8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.335
cmnq3karn00th9gtktyi5t1s5	cmnq3karl00tf9gtkslkbgpaq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.339
cmnq3kars00tk9gtks9t80b5p	cmnq3karq00ti9gtk7r8utihb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.344
cmnq3karw00tn9gtktb6oouce	cmnq3karu00tl9gtk6hl0jamx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.348
cmnq3kas000tq9gtkats1fmf6	cmnq3karz00to9gtkiu3lj31q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.353
cmnq3kas500tt9gtk1ox69zzu	cmnq3kas300tr9gtk6ddxkej1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.357
cmnq3kasa00tw9gtksc6eyogi	cmnq3kas800tu9gtk6ayr87ap	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.362
cmnq3kasg00tz9gtkfnl1evq4	cmnq3kasc00tx9gtk3wj37ex8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.369
cmnq3kasl00u29gtk056rlwld	cmnq3kasj00u09gtkvzvvx3ju	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.373
cmnq3kasq00u59gtk3geyjus2	cmnq3kaso00u39gtk0je2by3e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.379
cmnq3kasv00u89gtk5laxk7tv	cmnq3kast00u69gtki5ac1mp4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.384
cmnq3kasz00ub9gtk3j7galo3	cmnq3kasy00u99gtk1m9a55rw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.388
cmnq3kat400ue9gtkf4rwl46j	cmnq3kat200uc9gtkiucdgyjj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.393
cmnq3kata00uh9gtkhgrbftcp	cmnq3kat800uf9gtki4s5ix4k	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.398
cmnq3kate00uk9gtk3u1t71xh	cmnq3katc00ui9gtkv81xahf1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.402
cmnq3kati00un9gtkxbtydu3o	cmnq3kath00ul9gtk2szipgvu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.407
cmnq3kato00uq9gtkdzttwcg9	cmnq3katl00uo9gtkzvwpex3w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.412
cmnq3kats00ut9gtk0ohwvlqw	cmnq3katr00ur9gtkkrdvjmr4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.417
cmnq3katx00uw9gtkeiutql3i	cmnq3katv00uu9gtk5rm63fdt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.421
cmnq3kau100uz9gtkids22zhe	cmnq3katz00ux9gtkvf28h8yq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.425
cmnq3kau800v29gtkizl61fvs	cmnq3kau600v09gtkiz5pvbdu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.432
cmnq3kaue00v59gtkczeva4rd	cmnq3kaub00v39gtk1d5vv7rd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.438
cmnq3kaup00v89gtkzwdlni78	cmnq3kaum00v69gtku2p0bxqk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.45
cmnq3kauw00vb9gtkhb81xs0k	cmnq3kauu00v99gtkk6crg6or	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.456
cmnq3kav100ve9gtkxt3m5utw	cmnq3kauz00vc9gtk7pcn8ptz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.462
cmnq3kav700vh9gtk9dxjzxp7	cmnq3kav500vf9gtk1i4gomvj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.467
cmnq3kavb00vk9gtk9xyhhx5r	cmnq3kava00vi9gtkogg3ak1x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.472
cmnq3kavg00vn9gtkbuh1g8pq	cmnq3kave00vl9gtkxqjrqbyi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.477
cmnq3kavm00vq9gtkkdvhlnsx	cmnq3kavk00vo9gtk98xw306f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.482
cmnq3kavq00vt9gtkzfdxzjc8	cmnq3kavp00vr9gtkky115hie	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.487
cmnq3kavv00vw9gtk1xcuqb7f	cmnq3kavt00vu9gtk1j3oh8w1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.492
cmnq3kaw100vz9gtkvs1brg36	cmnq3kavz00vx9gtkz7bg5pdk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.498
cmnq3kaw600w29gtkp7q6mme5	cmnq3kaw400w09gtkviqg5qrn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.502
cmnq3kawa00w59gtkfph2bcbv	cmnq3kaw900w39gtkj4p10c0i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.507
cmnq3kawg00w89gtk6hu9m4ul	cmnq3kawd00w69gtkr3bn1rbe	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.512
cmnq3kawl00wb9gtkvwcp1d29	cmnq3kawj00w99gtkvbxk0noq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.517
cmnq3kawq00we9gtk5l9sz0m3	cmnq3kawo00wc9gtkxci1dmma	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.522
cmnq3kawv00wh9gtkixcmuucc	cmnq3kawt00wf9gtk8ut4wb2n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.528
cmnq3kax000wk9gtk1l6egxqy	cmnq3kawz00wi9gtkt8enaks1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.533
cmnq3kax500wn9gtkmnjolix8	cmnq3kax300wl9gtkgtaf6ygu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.537
cmnq3kax900wq9gtkuh14kqxv	cmnq3kax700wo9gtkivg1cl3i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.541
cmnq3kaxg00wt9gtkkpyi3ink	cmnq3kaxe00wr9gtkmt2b28u0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.548
cmnq3kaxk00ww9gtkznft811f	cmnq3kaxj00wu9gtkqyovb046	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.553
cmnq3kaxp00wz9gtk5jbwgwz9	cmnq3kaxn00wx9gtk4rp8ourp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.557
cmnq3kaxu00x29gtkuydkxwq0	cmnq3kaxs00x09gtk80k9590t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.563
cmnq3kaxz00x59gtk5wfff11v	cmnq3kaxx00x39gtkjawfutht	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.568
cmnq3kay400x89gtk42zqped0	cmnq3kay200x69gtksbatr03f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.572
cmnq3kay900xb9gtki8y5vb0d	cmnq3kay600x99gtkac1v9q6f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.577
cmnq3kaye00xe9gtkt57za2o0	cmnq3kayc00xc9gtk3sovdgnf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.583
cmnq3kayk00xh9gtk3w56o23t	cmnq3kayi00xf9gtkcc494ns4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.588
cmnq3kayp00xk9gtkhu8erdh8	cmnq3kayn00xi9gtkcepk3b0g	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.593
cmnq3kayu00xn9gtkrae1qxmw	cmnq3kays00xl9gtk5psrc0ck	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.599
cmnq3kayz00xq9gtkpeamz3ju	cmnq3kayx00xo9gtk3owkbqd7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.603
cmnq3kaz300xt9gtkymhlsc6c	cmnq3kaz200xr9gtksfdbbxn5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.608
cmnq3kaza00xw9gtkjnt2tgre	cmnq3kaz700xu9gtkckajyfb3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.614
cmnq3kaze00xz9gtku21wzo58	cmnq3kazc00xx9gtkhhsai6qo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.619
cmnq3kazj00y29gtk2dg4ghuz	cmnq3kazh00y09gtk5vb6sb3b	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.623
cmnq3kazp00y59gtkxlr772wf	cmnq3kazm00y39gtkhs2tlzzq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.629
cmnq3kazu00y89gtkzxp7q0hx	cmnq3kazs00y69gtklwqrg0oc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.634
cmnq3kazy00yb9gtkvh8wfjag	cmnq3kazx00y99gtk2oz2xhpi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.639
cmnq3kb0300ye9gtkipypjvx5	cmnq3kb0100yc9gtkaw4fbc72	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.644
cmnq3kb0900yh9gtkmf6n6wg9	cmnq3kb0700yf9gtkz7hdqppq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.65
cmnq3kb0d00yk9gtknm00gdie	cmnq3kb0c00yi9gtkvhmrr65n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.654
cmnq3kb0i00yn9gtkz1x4x2tn	cmnq3kb0g00yl9gtkfg580cqp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.658
cmnq3kb0o00yq9gtkssztapgk	cmnq3kb0m00yo9gtkhjt8afk9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.664
cmnq3kb0s00yt9gtk8aiojch8	cmnq3kb0r00yr9gtkkk5y7cln	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.669
cmnq3kb0x00yw9gtkuonxwntg	cmnq3kb0v00yu9gtk0n8apyf9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.673
cmnq3kb1300yz9gtk5wff7y47	cmnq3kb1000yx9gtkttrttnuo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.679
cmnq3kb1900z29gtkaj0uc9d0	cmnq3kb1700z09gtkureo0cwi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.685
cmnq3kb1e00z59gtk4cynkcrn	cmnq3kb1c00z39gtknde4ph5j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.69
cmnq3kb1j00z89gtkpb97tm1r	cmnq3kb1h00z69gtk1297u7vk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.696
cmnq3kb1o00zb9gtk7h7mxfw5	cmnq3kb1n00z99gtk33zds3y4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.701
cmnq3kb1u00ze9gtkfa30s79o	cmnq3kb1s00zc9gtkqupxz122	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.706
cmnq3kb1z00zh9gtkowe38q97	cmnq3kb1x00zf9gtk0maozgzr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.712
cmnq3kb2500zk9gtkg9enu03w	cmnq3kb2300zi9gtkzrw9drfv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.717
cmnq3kb2900zn9gtkak90v5tf	cmnq3kb2700zl9gtkf942sa4m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.722
cmnq3kb2f00zq9gtkjxtr74ux	cmnq3kb2c00zo9gtk4kwmvajd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.727
cmnq3kb2k00zt9gtkabbmi3in	cmnq3kb2i00zr9gtk8fc1ackx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.733
cmnq3kb2r00zw9gtk6appessz	cmnq3kb2p00zu9gtk82rj6scl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.739
cmnq3kb2w00zz9gtknoesbw66	cmnq3kb2u00zx9gtkil1vb9vh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.745
cmnq3kb3101029gtkawwgg4rj	cmnq3kb3001009gtkoepz8x80	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.75
cmnq3kb3601059gtkjjknyux2	cmnq3kb3401039gtklgaopeka	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.754
cmnq3kb3b01089gtkd3xp24yt	cmnq3kb3901069gtkv4bvil7f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.76
cmnq3kb3h010b9gtketiw44tx	cmnq3kb3f01099gtkwuo1scbs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.765
cmnq3kb3l010e9gtkkbnyugkj	cmnq3kb3k010c9gtkx0u5jwpn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.77
cmnq3kb3q010h9gtk01aavcgu	cmnq3kb3o010f9gtk8n3cxdg8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.774
cmnq3kb3v010k9gtkz9phmko7	cmnq3kb3t010i9gtkumno9b4d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.78
cmnq3kb40010n9gtkz2u78kl3	cmnq3kb3y010l9gtk1l0sld8r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.785
cmnq3kb45010q9gtkjkuasbzu	cmnq3kb43010o9gtkoge305f8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.789
cmnq3kb4a010t9gtktm30qtfy	cmnq3kb48010r9gtk3iqi7bqv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.795
cmnq3kb4g010w9gtkl1joph4m	cmnq3kb4e010u9gtkk0w4ijqi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.8
cmnq3kb4k010z9gtke8srmiw2	cmnq3kb4j010x9gtkr5t5h6j0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.805
cmnq3kb4q01129gtk32pjn1vh	cmnq3kb4n01109gtkq3cv5hcx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.81
cmnq3kb4v01159gtk24bgn8oh	cmnq3kb4t01139gtkm12xvxbf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.816
cmnq3kb5001189gtk76ue142h	cmnq3kb4y01169gtkcugiarbm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.82
cmnq3kb54011b9gtkrre9m2lu	cmnq3kb5201199gtkrquzx4jx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.825
cmnq3kb5c011e9gtkf73r5n34	cmnq3kb5a011c9gtkp2u9lmk0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.833
cmnq3kb5i011h9gtk5bln3f75	cmnq3kb5g011f9gtk6pkjp13j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.838
cmnq3kb5n011k9gtkfyv8kip7	cmnq3kb5l011i9gtk1quuq4m6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.843
cmnq3kb5t011n9gtk22vo3dko	cmnq3kb5r011l9gtk2wzdsia3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.849
cmnq3kb5x011q9gtk75lie5vu	cmnq3kb5w011o9gtkdbq6s20p	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.854
cmnq3kb62011t9gtk790omf0g	cmnq3kb60011r9gtkddv1nu97	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.858
cmnq3kb68011w9gtkst41pf0j	cmnq3kb66011u9gtk34h86iag	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.864
cmnq3kb6d011z9gtkz6exm6ib	cmnq3kb6b011x9gtk45ivv0xv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.869
cmnq3kb6h01229gtkzpb0ttxp	cmnq3kb6f01209gtke2v04n7r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.874
cmnq3kb6o01259gtkqw18ft5v	cmnq3kb6l01239gtk08sqd9jo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.88
cmnq3kb6s01289gtkve0ldwoz	cmnq3kb6r01269gtkudiwt1fd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.885
cmnq3kb6x012b9gtkstkhqpjc	cmnq3kb6v01299gtkl9za4tc1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.889
cmnq3kb73012e9gtks911ebxn	cmnq3kb71012c9gtkv60sq20y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.896
cmnq3kb78012h9gtk2zyzx2pz	cmnq3kb76012f9gtkuls1xmen	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.9
cmnq3kb7c012k9gtkqybhvd53	cmnq3kb7b012i9gtk3uq1h9fa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.905
cmnq3kb7h012n9gtkw2euphns	cmnq3kb7f012l9gtk4vzcrmvm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.91
cmnq3kb7n012q9gtkep4sfmmv	cmnq3kb7l012o9gtkmsyzptd0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.916
cmnq3kb7s012t9gtko9stdxbj	cmnq3kb7q012r9gtkqyuquwjp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.92
cmnq3kb7w012w9gtkhnp17mwl	cmnq3kb7u012u9gtkye4p8ls8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.925
cmnq3kb83012z9gtktmmifebz	cmnq3kb81012x9gtkm04qb5ov	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.931
cmnq3kb8701329gtkivjv4kgr	cmnq3kb8501309gtkqi1wbmni	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.936
cmnq3kb8b01359gtk3rzz2z59	cmnq3kb8a01339gtkggqnfvli	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.94
cmnq3kb8i01389gtkzikg3hdd	cmnq3kb8f01369gtkjls7kqrx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.946
cmnq3kb8n013b9gtkbhjcxmch	cmnq3kb8l01399gtk8oapbqfs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.951
cmnq3kb8r013e9gtk0ha5p5rg	cmnq3kb8q013c9gtk86wjv9kq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.956
cmnq3kb8x013h9gtk0geav2m7	cmnq3kb8u013f9gtktyyebb98	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.961
cmnq3kb93013k9gtkzgs55luc	cmnq3kb91013i9gtkp09tjwh4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.967
cmnq3kb97013n9gtkuoh35q6r	cmnq3kb95013l9gtko850yuh9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.972
cmnq3kb9c013q9gtkr95aotum	cmnq3kb9a013o9gtkb4zmsnd7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.977
cmnq3kb9i013t9gtkk91gyuxl	cmnq3kb9g013r9gtkuxh40a0t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.982
cmnq3kb9m013w9gtkrbhavob5	cmnq3kb9k013u9gtk4fd2aie5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.987
cmnq3kb9q013z9gtkz4f591dj	cmnq3kb9p013x9gtkzm7jik57	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.991
cmnq3kb9w01429gtkr7rg7vz6	cmnq3kb9u01409gtki5z9gm00	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:50.997
cmnq3kba101459gtk1fg99dm4	cmnq3kb9z01439gtktx6mg2du	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.001
cmnq3kba601489gtk34pmrdsa	cmnq3kba401469gtk8o5m398v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.006
cmnq3kbab014b9gtkg6eavh2i	cmnq3kba901499gtko91kswxi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.012
cmnq3kbah014e9gtkc1a4wwgl	cmnq3kbae014c9gtk2v7gy2xj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.017
cmnq3kbal014h9gtk9j98t1f6	cmnq3kbaj014f9gtk4v06d69e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.022
cmnq3kbar014k9gtk8zmwxn1l	cmnq3kbao014i9gtkfy58b3r8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.027
cmnq3kbaw014n9gtkfbnoo3eb	cmnq3kbau014l9gtkv7cd921z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.033
cmnq3kbb0014q9gtk9eplw14d	cmnq3kbaz014o9gtkdxh9aysj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.037
cmnq3kbb5014t9gtk7tjcvuqq	cmnq3kbb3014r9gtkfef4db9v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.041
cmnq3kbbc014w9gtk8u6qlu1k	cmnq3kbba014u9gtkwhj1h0de	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.048
cmnq3kbbg014z9gtk6cxhcim5	cmnq3kbbe014x9gtkjq26p4z4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.052
cmnq3kbbk01529gtkmx0hota7	cmnq3kbbj01509gtkf6u8jo0t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.057
cmnq3kbbr01559gtku3ewwd1h	cmnq3kbbp01539gtkini3os5m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.063
cmnq3kbbw01589gtkfmqakogr	cmnq3kbbu01569gtkogqezyd9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.069
cmnq3kbc0015b9gtk72e1te9k	cmnq3kbbz01599gtkr5ibwot1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.073
cmnq3kbc7015e9gtkvw1hue0q	cmnq3kbc5015c9gtkjkjo0zrb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.079
cmnq3kbcc015h9gtkmxqbupz9	cmnq3kbca015f9gtk94uug411	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.084
cmnq3kbch015k9gtklgwrak8s	cmnq3kbcf015i9gtkqeh09y4o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.089
cmnq3kbcm015n9gtkcy7oe59j	cmnq3kbck015l9gtkjmn403jv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.095
cmnq3kbcs015q9gtkw0pp0xb0	cmnq3kbcq015o9gtkh4lmfj8p	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.1
cmnq3kbcw015t9gtksv3xslnv	cmnq3kbcv015r9gtkkf1sva6f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.105
cmnq3kbd2015w9gtky3q6okqi	cmnq3kbcz015u9gtkzw8wwb17	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.11
cmnq3kbd7015z9gtkb02ujr72	cmnq3kbd5015x9gtkku6ahuct	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.116
cmnq3kbdc01629gtkrkkhvlgh	cmnq3kbda01609gtk959dluf4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.12
cmnq3kbdh01659gtkr0swfbwo	cmnq3kbdf01639gtkiq5qtczx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.125
cmnq3kbdn01689gtkgw86n4j3	cmnq3kbdl01669gtkwlks9341	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.132
cmnq3kbds016b9gtk44euoxxc	cmnq3kbdq01699gtk4a8e0vqt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.136
cmnq3kbdw016e9gtkwstssdq5	cmnq3kbdv016c9gtktxv2bl9p	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.141
cmnq3kbe2016h9gtkzl45e4sl	cmnq3kbe0016f9gtk4e9c11dn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.147
cmnq3kbe7016k9gtktpwgzgxk	cmnq3kbe5016i9gtk221h7t0o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.151
cmnq3kbec016n9gtkr0lnmgyf	cmnq3kbea016l9gtkrse9pujw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.156
cmnq3kbeh016q9gtkm1bq8aze	cmnq3kbef016o9gtkxbuofw1x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.162
cmnq3kbem016t9gtk6lt9og7p	cmnq3kbek016r9gtkxcuyp3cm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.167
cmnq3kber016w9gtkhzssknon	cmnq3kbep016u9gtkfb79tgud	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.172
cmnq3kbew016z9gtkveabcwk9	cmnq3kbeu016x9gtkjid15d0u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.177
cmnq3kbf201729gtkgr3wpuer	cmnq3kbf001709gtkxcx08ezi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.182
cmnq3kbf701759gtkccgby8hn	cmnq3kbf501739gtkzppcbk72	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.187
cmnq3kbfc01789gtk5ny4d6z5	cmnq3kbf901769gtkyiqszhty	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.192
cmnq3kbfg017b9gtkfth8kmzh	cmnq3kbff01799gtkj8wzsg9b	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.197
cmnq3kbfl017e9gtklcfb2cvv	cmnq3kbfj017c9gtkwzzmobh6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.202
cmnq3kbfq017h9gtk7i5voo7y	cmnq3kbfo017f9gtkvdec0008	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.207
cmnq3kbfw017k9gtk1jgtgwn0	cmnq3kbfu017i9gtklqlw6by8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.212
cmnq3kbg0017n9gtkrilel852	cmnq3kbfy017l9gtkmkwnmqtv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.217
cmnq3kbg5017q9gtke4n4v2a1	cmnq3kbg3017o9gtk3iqvkm03	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.221
cmnq3kbga017t9gtkkpg5kwjm	cmnq3kbg8017r9gtkcz77p4jr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.226
cmnq3kbgf017w9gtko22zt6iy	cmnq3kbgd017u9gtkf0o4h928	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.231
cmnq3kbgj017z9gtkq36d3xiv	cmnq3kbgh017x9gtkqv07y30e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.236
cmnq3kbgo01829gtkvlxsgazw	cmnq3kbgm01809gtkcprmsbpa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.24
cmnq3kbgt01859gtkty9mqwtz	cmnq3kbgr01839gtkjz34npsa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.246
cmnq3kbgy01889gtkbzlsanfp	cmnq3kbgw01869gtkyl1ryzn5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.25
cmnq3kbh3018b9gtkihphklvs	cmnq3kbh001899gtkg4t57g7d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.255
cmnq3kbh8018e9gtkbn2zx9bt	cmnq3kbh5018c9gtkq9xk4u8v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.26
cmnq3kbhc018h9gtklivq19bo	cmnq3kbha018f9gtk0s4ge0f3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.265
cmnq3kbhh018k9gtk48tda9t5	cmnq3kbhf018i9gtk3cbfnlhg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.27
cmnq3kbhr018n9gtkdf2yg1tv	cmnq3kbhm018l9gtkd4cq5jrj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.279
cmnq3kbhx018q9gtk98rbs71i	cmnq3kbhv018o9gtkfu8idphs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.285
cmnq3kbi1018t9gtkbq4uj8ba	cmnq3kbi0018r9gtkpqm0ursg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.29
cmnq3kbi6018w9gtkdr2o117s	cmnq3kbi4018u9gtk3aintd3f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.294
cmnq3kbia018z9gtkxakpqocb	cmnq3kbi9018x9gtkfcpzno8k	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.299
cmnq3kbif01929gtki850bxqt	cmnq3kbid01909gtkleip9hs1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.303
cmnq3kbik01959gtk7x7k65j5	cmnq3kbii01939gtki4jnlmuw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.308
cmnq3kbip01989gtkbnvqfto5	cmnq3kbin01969gtkhquixhe1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.313
cmnq3kbit019b9gtk6uaxnmte	cmnq3kbir01999gtkt4lcl713	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.318
cmnq3kbiy019e9gtk65hpfwkw	cmnq3kbiw019c9gtkntlqo8uy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.322
cmnq3kbj3019h9gtknzayb161	cmnq3kbj1019f9gtkoa7o9dwa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.328
cmnq3kbj8019k9gtkmkfpqjrd	cmnq3kbj6019i9gtkbp4zckwn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.332
cmnq3kbjd019n9gtk8p14qvl4	cmnq3kbjc019l9gtkx0cbuzp5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.338
cmnq3kbji019q9gtkddmf3g1n	cmnq3kbjg019o9gtkf0otwx1t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.343
cmnq3kbjn019t9gtkl8umakgj	cmnq3kbjl019r9gtk68f2ra7z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.347
cmnq3kbjs019w9gtksadx85w7	cmnq3kbjq019u9gtkdeyr6jon	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.352
cmnq3kbjx019z9gtk79cjdozl	cmnq3kbju019x9gtkrfn9zgkx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.357
cmnq3kbk201a29gtkptppm0ls	cmnq3kbk001a09gtkx23iy2jp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.363
cmnq3kbk701a59gtk8rofx8pj	cmnq3kbk501a39gtkwzbd86y3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.368
cmnq3kbkd01a89gtk5e9mywny	cmnq3kbkb01a69gtkzt90zbml	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.374
cmnq3kbkk01ab9gtk5t6pab2m	cmnq3kbkh01a99gtksffbm3ee	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.38
cmnq3kbkp01ae9gtknqnf2qvn	cmnq3kbkn01ac9gtkqt1orgsv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.386
cmnq3kbku01ah9gtkyd85fv5x	cmnq3kbks01af9gtkgav006sz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.391
cmnq3kbl001ak9gtk8sjkgyha	cmnq3kbkx01ai9gtk3i4koa0m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.396
cmnq3kbl501an9gtkknh6py88	cmnq3kbl301al9gtk0m6kqttw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.401
cmnq3kbla01aq9gtknxk2yidd	cmnq3kbl801ao9gtkz03ibbz6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.406
cmnq3kblf01at9gtkf08m1b8r	cmnq3kbld01ar9gtkkgg1nf8t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.412
cmnq3kbll01aw9gtkpteltadx	cmnq3kblj01au9gtkooveborq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.417
cmnq3kblq01az9gtknhoq8vmr	cmnq3kblo01ax9gtkglhwwnun	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.422
cmnq3kblv01b29gtkr7vqm2r1	cmnq3kblt01b09gtki57ppd9i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.427
cmnq3kbm001b59gtktrbw6ddm	cmnq3kbly01b39gtk701drtt1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.433
cmnq3kbm501b89gtkoy7m6ic7	cmnq3kbm301b69gtk6f0urd9m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.437
cmnq3kbm901bb9gtkl0pykmcn	cmnq3kbm801b99gtk38v25s7s	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.442
cmnq3kbmg01be9gtkd4d6asp4	cmnq3kbme01bc9gtk4ylpzur5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.448
cmnq3kbmk01bh9gtkw9ke0w2u	cmnq3kbmj01bf9gtkx9pg8i5j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.453
cmnq3kbmp01bk9gtkeabsb78u	cmnq3kbmn01bi9gtk4ny4si7d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.458
cmnq3kbmv01bn9gtk8wovy8dp	cmnq3kbmt01bl9gtkc903jlw8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.464
cmnq3kbn001bq9gtkl28qgp4c	cmnq3kbmy01bo9gtktwn29xnx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.468
cmnq3kbn501bt9gtkym0cy8hf	cmnq3kbn301br9gtkxckqwzwk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.473
cmnq3kbna01bw9gtkn3zg6no6	cmnq3kbn801bu9gtkttgziksv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.479
cmnq3kbnf01bz9gtkj5ht5xtg	cmnq3kbne01bx9gtkwhn59mto	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.484
cmnq3kbnk01c29gtkqfgut57j	cmnq3kbni01c09gtkpqsb0nug	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.488
cmnq3kbnp01c59gtkj828qo0t	cmnq3kbnm01c39gtkexntrhzi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.493
cmnq3kbnv01c89gtkjfxjlsr8	cmnq3kbnt01c69gtkrz3q7jqt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.499
cmnq3kbnz01cb9gtkkd9f6lu4	cmnq3kbnx01c99gtk6zeahsjy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.503
cmnq3kbo301ce9gtks9jlphdz	cmnq3kbo201cc9gtkshhinxxp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.508
cmnq3kboa01ch9gtkub72vdwx	cmnq3kbo801cf9gtk1fvw4vx1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.514
cmnq3kboe01ck9gtkdzhqlqc0	cmnq3kbod01ci9gtkdklfshec	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.519
cmnq3kboj01cn9gtk4unqmwgd	cmnq3kboh01cl9gtkwo1j3yxn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.523
cmnq3kboo01cq9gtk71fs4ghc	cmnq3kbol01co9gtktii3z42j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.528
cmnq3kbot01ct9gtkligqk70q	cmnq3kbor01cr9gtkrbpzng7k	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.533
cmnq3kbox01cw9gtkpsu55pox	cmnq3kbov01cu9gtky620sdn6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.538
cmnq3kbp201cz9gtkbawcvla1	cmnq3kbp001cx9gtk798kh24e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.542
cmnq3kbp801d29gtkip8iq99i	cmnq3kbp601d09gtkhfhshpty	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.548
cmnq3kbpc01d59gtkpcd3yxrq	cmnq3kbpa01d39gtkvyi37axx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.552
cmnq3kbpg01d89gtkj8ogotic	cmnq3kbpf01d69gtka1b36w1y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.557
cmnq3kbpm01db9gtkmd7la4ue	cmnq3kbpk01d99gtk2wm9cwmo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.563
cmnq3kbpr01de9gtkwex88hs3	cmnq3kbpp01dc9gtkftiil7no	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.568
cmnq3kbpw01dh9gtkgq1evib0	cmnq3kbpu01df9gtkuvpyntyk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.572
cmnq3kbq201dk9gtkz4f6sr2s	cmnq3kbpz01di9gtku11cn1x5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.578
cmnq3kbq701dn9gtkt5u82xkv	cmnq3kbq501dl9gtkptnv9ng4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.583
cmnq3kbqb01dq9gtkgl9ojvtc	cmnq3kbqa01do9gtk9naceid8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.588
cmnq3kbqg01dt9gtk2ezkc7xz	cmnq3kbqe01dr9gtk4gv2x3g3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.593
cmnq3kbqm01dw9gtky5vcmey9	cmnq3kbqk01du9gtkhq8o8y63	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.598
cmnq3kbqr01dz9gtkyqb5a0q9	cmnq3kbqp01dx9gtkyn7acqxl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.603
cmnq3kbqv01e29gtkhd0aspxx	cmnq3kbqu01e09gtkk519b9yr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.608
cmnq3kbr101e59gtk7iktipbw	cmnq3kbqz01e39gtks627mi9u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.614
cmnq3kbr601e89gtk98x0i8er	cmnq3kbr401e69gtkawtovirh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.618
cmnq3kbra01eb9gtk09qbhcjr	cmnq3kbr801e99gtk4oprxo0g	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.623
cmnq3kbrg01ee9gtkudy9f4xi	cmnq3kbrd01ec9gtk0fu05cge	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.628
cmnq3kbrm01eh9gtkkrobvnr3	cmnq3kbrk01ef9gtkh0xtvh0e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.634
cmnq3kbrr01ek9gtk6xeum3ey	cmnq3kbrp01ei9gtkwhepj5m2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.639
cmnq3kbrx01en9gtk2uocxkoe	cmnq3kbru01el9gtkfigv78ei	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.645
cmnq3kbs201eq9gtkznxcqpqf	cmnq3kbs001eo9gtkk6js6okq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.651
cmnq3kbs701et9gtke06y6s2j	cmnq3kbs501er9gtkz82ow5wx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.655
cmnq3kbsc01ew9gtkr0dp09nj	cmnq3kbsa01eu9gtk08l0uiif	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.66
cmnq3kbsi01ez9gtk6fqjpslz	cmnq3kbsg01ex9gtk7s9h2ml0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.666
cmnq3kbsm01f29gtka5m7yky8	cmnq3kbsk01f09gtkcvwmfni9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.67
cmnq3kbsr01f59gtkx45vszs1	cmnq3kbsp01f39gtk9kiwljf1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.676
cmnq3kbsy01f89gtkr1mdt5t2	cmnq3kbsw01f69gtk0fax6nwz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.682
cmnq3kbt601fb9gtk9jvmoymc	cmnq3kbt301f99gtkwsai6p4p	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.69
cmnq3kbtf01fe9gtkgep47pf6	cmnq3kbtc01fc9gtkhthp4ob7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.7
cmnq3kbtm01fh9gtkp2v0edgo	cmnq3kbtk01ff9gtk78cqv1k3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.707
cmnq3kbtv01fk9gtkd3zvhfz7	cmnq3kbtr01fi9gtkwol7oaar	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.715
cmnq3kbu001fn9gtkl3vvupnk	cmnq3kbty01fl9gtkdang2mc8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.72
cmnq3kbu501fq9gtkfdcgxubc	cmnq3kbu301fo9gtk98fdkkdw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.725
cmnq3kbua01ft9gtk4q3cmrod	cmnq3kbu801fr9gtka5lv2fto	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.731
cmnq3kbuf01fw9gtkf9sc1xlh	cmnq3kbue01fu9gtkt02vh6pa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.736
cmnq3kbul01fz9gtkh6gjqeyy	cmnq3kbuj01fx9gtkokxj4ibp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.741
cmnq3kbus01g29gtktmkn1cia	cmnq3kbuq01g09gtknspb8atp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.749
cmnq3kbuy01g59gtkubm5xsdc	cmnq3kbuw01g39gtklnbkto9j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.754
cmnq3kbv401g89gtkiopcnhcy	cmnq3kbv101g69gtkqsgysw7d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.761
cmnq3kbvc01gb9gtkws30eq5o	cmnq3kbva01g99gtky4nk340m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.769
cmnq3kbvh01ge9gtk8r3vx82i	cmnq3kbvf01gc9gtkvb63yqvp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.773
cmnq3kbvn01gh9gtkj7mlz8vq	cmnq3kbvl01gf9gtkhcx3e3pc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.779
cmnq3kbvs01gk9gtkphgdwwor	cmnq3kbvq01gi9gtkpo7t8kvi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.784
cmnq3kbvx01gn9gtkbwkwpm3i	cmnq3kbvv01gl9gtk1pmggek4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.789
cmnq3kbw201gq9gtkg6zffr9e	cmnq3kbw001go9gtklssb5qp7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.794
cmnq3kbw701gt9gtkqlvwtjx9	cmnq3kbw601gr9gtkvitxgb23	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.8
cmnq3kbwc01gw9gtk3bh1q3ro	cmnq3kbwa01gu9gtkjrqyccpq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.804
cmnq3kbwh01gz9gtkwt66ihqf	cmnq3kbwf01gx9gtk7z0wsymk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.81
cmnq3kbwn01h29gtk4udifjwh	cmnq3kbwl01h09gtk8frmnea3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.815
cmnq3kbwr01h59gtktf7mr2hm	cmnq3kbwq01h39gtk7cyx14md	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.82
cmnq3kbww01h89gtkrf9meagw	cmnq3kbwu01h69gtkterq5a5j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.824
cmnq3kbx201hb9gtk7yzq0slh	cmnq3kbx001h99gtk7dzl21fs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.831
cmnq3kbx701he9gtkbylakv13	cmnq3kbx501hc9gtk1llzvhrn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.835
cmnq3kbxb01hh9gtka4jjc5of	cmnq3kbxa01hf9gtkwy1vqgkx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.84
cmnq3kbxi01hk9gtkoo9rzewe	cmnq3kbxg01hi9gtkqjln8a54	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.847
cmnq3kbxn01hn9gtk66dawjuz	cmnq3kbxl01hl9gtkhmb0al1u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.852
cmnq3kbxs01hq9gtk2ib5nz74	cmnq3kbxq01ho9gtku9gg7hqs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.856
cmnq3kbxy01ht9gtkjuga3hg8	cmnq3kbxv01hr9gtkeg20md7t	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.862
cmnq3kby301hw9gtkm19un6tx	cmnq3kby101hu9gtkbks4uolr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.867
cmnq3kby701hz9gtkyzqg18an	cmnq3kby601hx9gtkc6yn3up6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.872
cmnq3kbyd01i29gtkz9nl5acd	cmnq3kbya01i09gtkpgg7q41m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.877
cmnq3kbyj01i59gtkykgj3o8z	cmnq3kbyh01i39gtk6q0t5weu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.883
cmnq3kbyo01i89gtkba96fy62	cmnq3kbym01i69gtkwvp8d0py	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.889
cmnq3kbyu01ib9gtk34lb6hn2	cmnq3kbyr01i99gtkgpt2z8a7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.894
cmnq3kbyz01ie9gtk4bzoarsc	cmnq3kbyx01ic9gtkytx0cqck	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.9
cmnq3kbz401ih9gtkumqi7jos	cmnq3kbz201if9gtkohrfrd9a	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.905
cmnq3kbza01ik9gtk8lhsfsm0	cmnq3kbz701ii9gtkvci40v0a	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.911
cmnq3kbzg01in9gtk0e6v6vzx	cmnq3kbze01il9gtkc2a9feuv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.916
cmnq3kbzl01iq9gtkx3ro807w	cmnq3kbzj01io9gtke3bhzznl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.921
cmnq3kbzs01it9gtko10todmo	cmnq3kbzo01ir9gtky92tv9hy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.928
cmnq3kbzy01iw9gtk60genmd1	cmnq3kbzw01iu9gtkdaus9j96	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.935
cmnq3kc0301iz9gtkl7hzb2mh	cmnq3kc0101ix9gtktafpusmr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.939
cmnq3kc0901j29gtka4a5fax9	cmnq3kc0601j09gtkd7ewyzko	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.946
cmnq3kc0f01j59gtkpcvfv7y9	cmnq3kc0d01j39gtkvbkil530	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.952
cmnq3kc0k01j89gtkzciok1nj	cmnq3kc0i01j69gtkbg94l81w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.956
cmnq3kc0q01jb9gtkp6cf7klf	cmnq3kc0o01j99gtkm22xkf5z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.962
cmnq3kc0v01je9gtkh4efl1b5	cmnq3kc0t01jc9gtk9fdxd82f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.967
cmnq3kc1001jh9gtk52l9grwd	cmnq3kc0y01jf9gtk5fo6k69c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.972
cmnq3kc1601jk9gtk12pyxq1k	cmnq3kc1301ji9gtkyxugq7jm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.978
cmnq3kc1b01jn9gtkelagpxlq	cmnq3kc1901jl9gtkh57dnsug	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.983
cmnq3kc1f01jq9gtkumvkqaib	cmnq3kc1e01jo9gtk5jn1ei57	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.988
cmnq3kc1m01jt9gtkckrhvb9f	cmnq3kc1j01jr9gtk088cv7cq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:51.994
cmnq3kc1r01jw9gtk1lbibrir	cmnq3kc1p01ju9gtkod0zm7mt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52
cmnq3kc1w01jz9gtkrapvu91o	cmnq3kc1u01jx9gtknlzkulqx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.004
cmnq3kc2101k29gtka54aefb6	cmnq3kc1z01k09gtk41xcsa1q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.01
cmnq3kc2701k59gtkriyptu1v	cmnq3kc2501k39gtko8e1eu79	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.015
cmnq3kc2c01k89gtkc1bnhdeq	cmnq3kc2a01k69gtk8jlevm51	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.02
cmnq3kc2g01kb9gtk7eg4rb9h	cmnq3kc2e01k99gtkufbppm32	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.024
cmnq3kc2m01ke9gtkwu0vzcoz	cmnq3kc2k01kc9gtkj32lac0w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.03
cmnq3kc2r01kh9gtk3hmhnpit	cmnq3kc2p01kf9gtkf7w5q9nk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.035
cmnq3kc2w01kk9gtkg9n2o7sg	cmnq3kc2u01ki9gtkfmrlvw2x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.04
cmnq3kc3201kn9gtkeavkcex4	cmnq3kc3001kl9gtkl1nsf1qv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.046
cmnq3kc3701kq9gtktxcoba1v	cmnq3kc3501ko9gtkqjfzj5o6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.051
cmnq3kc3b01kt9gtkh7xy87pe	cmnq3kc3901kr9gtkkl8h087b	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.056
cmnq3kc3i01kw9gtklpfp74r0	cmnq3kc3e01ku9gtk5isnl56g	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.062
cmnq3kc3o01kz9gtkoa72xu1y	cmnq3kc3m01kx9gtkq377ql94	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.069
cmnq3kc3t01l29gtkutildybk	cmnq3kc3r01l09gtkp62mg39e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.074
cmnq3kc3z01l59gtklb3pr6vb	cmnq3kc3x01l39gtkgy5j8jn7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.08
cmnq3kc4401l89gtkupdp0n4j	cmnq3kc4201l69gtk3jo6773h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.085
cmnq3kc4901lb9gtkmw1949a0	cmnq3kc4701l99gtkq2ptaal0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.089
cmnq3kc4f01le9gtkr901rhxu	cmnq3kc4c01lc9gtkdl5b3pw6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.095
cmnq3kc4k01lh9gtk45m59w1c	cmnq3kc4i01lf9gtk98yvnkr0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.1
cmnq3kc4o01lk9gtkmyyoa7n6	cmnq3kc4m01li9gtk1txzypfo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.105
cmnq3kc4u01ln9gtk2h232ny8	cmnq3kc4r01ll9gtkspdtmw1n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.11
cmnq3kc5001lq9gtk8zhw28j5	cmnq3kc4y01lo9gtk4gd7rqme	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.116
cmnq3kc5501lt9gtkk17v5p49	cmnq3kc5301lr9gtkora7q615	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.121
cmnq3kc5a01lw9gtkk32px5al	cmnq3kc5801lu9gtkhpxonpyd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.127
cmnq3kc5g01lz9gtkj47gx7na	cmnq3kc5e01lx9gtktk6ha60e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.132
cmnq3kc5k01m29gtk6qkvahpp	cmnq3kc5j01m09gtkt51e6esf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.137
cmnq3kc5p01m59gtk676g3bqh	cmnq3kc5n01m39gtkp6o6u8bq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.141
cmnq3kc5x01m89gtkcdreogcl	cmnq3kc5u01m69gtkebr0enk7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.15
cmnq3kc6201mb9gtksmp2x3cr	cmnq3kc6001m99gtk7o25n9h1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.155
cmnq3kc6701me9gtk7j7pj5yc	cmnq3kc6501mc9gtkxml75kn6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.16
cmnq3kc6c01mh9gtk08kncwpy	cmnq3kc6a01mf9gtkgd6iprhm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.164
cmnq3kc6h01mk9gtkwj4tkhhf	cmnq3kc6f01mi9gtk2gweyt7a	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.169
cmnq3kc6l01mn9gtkpsi5bei1	cmnq3kc6j01ml9gtkuzma0h1s	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.173
cmnq3kc6r01mq9gtkv7xn3k0v	cmnq3kc6p01mo9gtk2q8c03gj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.179
cmnq3kc6v01mt9gtknwpqf39f	cmnq3kc6t01mr9gtkqgu3z1a1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.184
cmnq3kc7001mw9gtkroxbcn63	cmnq3kc6y01mu9gtkce6l7837	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.188
cmnq3kc7501mz9gtkmaopkork	cmnq3kc7201mx9gtk3c7f0k4y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.193
cmnq3kc7901n29gtk7azq3ucn	cmnq3kc7801n09gtkm7heg5vn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.198
cmnq3kc7e01n59gtk99iigqty	cmnq3kc7c01n39gtkbwei7nzp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.202
cmnq3kc7i01n89gtkcte3z5yv	cmnq3kc7g01n69gtksjcu2ral	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.207
cmnq3kc7o01nb9gtkylnxh1mb	cmnq3kc7m01n99gtkoztri8r3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.212
cmnq3kc7s01ne9gtktmaws5lu	cmnq3kc7q01nc9gtkv0w8vc11	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.217
cmnq3kc7x01nh9gtk043d5kve	cmnq3kc7v01nf9gtk25cffkgv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.221
cmnq3kc8201nk9gtkn2pjja2k	cmnq3kc8001ni9gtko1jtqyk9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.226
cmnq3kc8601nn9gtk9whg7uz2	cmnq3kc8501nl9gtkovwuz5b7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.231
cmnq3kc8a01nq9gtkduk5fgd2	cmnq3kc8901no9gtky4jq2f9q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.235
cmnq3kc8f01nt9gtkg45jrhx9	cmnq3kc8d01nr9gtkssdp5hf9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.24
cmnq3kc8k01nw9gtk9b3yqrll	cmnq3kc8i01nu9gtkd15zxk5x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.244
cmnq3kc8o01nz9gtk1o14i2g6	cmnq3kc8n01nx9gtkk31lqige	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.249
cmnq3kc8s01o29gtkr4rlp1ea	cmnq3kc8r01o09gtkw05zpzu9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.253
cmnq3kc8x01o59gtk5h5kmjvq	cmnq3kc8v01o39gtklfnetavo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.257
cmnq3kc9101o89gtk6clfeq2z	cmnq3kc8z01o69gtktj863039	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.262
cmnq3kc9501ob9gtk5eb0o4q4	cmnq3kc9401o99gtkk9k7i0v2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.266
cmnq3kc9a01oe9gtkteich9dl	cmnq3kc9801oc9gtkh86n546r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.271
cmnq3kc9e01oh9gtkp8meop2k	cmnq3kc9d01of9gtkgqnsw14e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.275
cmnq3kc9j01ok9gtkdks8s7lp	cmnq3kc9h01oi9gtk1s9xo002	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.28
cmnq3kc9n01on9gtkzcrqh7rb	cmnq3kc9m01ol9gtkehhs0bit	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.284
cmnq3kc9r01oq9gtkp6jryh7b	cmnq3kc9q01oo9gtko7tgpqsn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.288
cmnq3kc9w01ot9gtkhbxphdc0	cmnq3kc9u01or9gtk9fe586ly	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.292
cmnq3kca001ow9gtkuf75b8nl	cmnq3kc9z01ou9gtk4q0q8pq8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.297
cmnq3kca501oz9gtkpkn5ux3e	cmnq3kca301ox9gtkqy7alz5u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.302
cmnq3kcab01p29gtkhxzv4qz8	cmnq3kca901p09gtkqv8l7vta	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.307
cmnq3kcag01p59gtknx2xootr	cmnq3kcaf01p39gtk78f6dikj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.313
cmnq3kcal01p89gtkyl597vaz	cmnq3kcaj01p69gtklyf0kflv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.318
cmnq3kcap01pb9gtkn8i6b35z	cmnq3kcao01p99gtkboniljs8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.322
cmnq3kcau01pe9gtk05ljix2a	cmnq3kcas01pc9gtkb2h6i7hz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.326
cmnq3kcay01ph9gtkjmncepmv	cmnq3kcax01pf9gtk2q64gh50	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.331
cmnq3kcb401pk9gtk0s99s4r1	cmnq3kcb101pi9gtktpo2amvz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.336
cmnq3kcb901pn9gtkrwjt8bzx	cmnq3kcb701pl9gtknhazc96i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.341
cmnq3kcbd01pq9gtk8j0xwl8v	cmnq3kcbc01po9gtkf93s0tcc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.346
cmnq3kcbj01pt9gtkb4m6lobj	cmnq3kcbh01pr9gtk2o7wapw3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.352
cmnq3kcbo01pw9gtk8g3kft8l	cmnq3kcbm01pu9gtktyjg471d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.356
cmnq3kcbu01pz9gtkugod2bwk	cmnq3kcbs01px9gtkswtsmsba	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.363
cmnq3kcbz01q29gtkcesxs6jk	cmnq3kcbx01q09gtkt7ime7uw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.368
cmnq3kcc701q59gtkieybbnvd	cmnq3kcc401q39gtkg2yx0mpd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.375
cmnq3kccd01q89gtkr40xm8dh	cmnq3kccb01q69gtkm0d04kgy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.381
cmnq3kcch01qb9gtkorye0rih	cmnq3kccg01q99gtkjyslt8az	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.386
cmnq3kccm01qe9gtkl55vonz6	cmnq3kcck01qc9gtkldte42jx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.39
cmnq3kccs01qh9gtknk12u3nr	cmnq3kccp01qf9gtksxz7nvgu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.396
cmnq3kccx01qk9gtkh0hsp7ek	cmnq3kccv01qi9gtk33eatf1n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.401
cmnq3kcd201qn9gtkg62askof	cmnq3kcd001ql9gtkf4rfzyt5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.406
cmnq3kcd701qq9gtkp51a9qnn	cmnq3kcd501qo9gtkyhkiflxq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.412
cmnq3kcdd01qt9gtkzz12p19s	cmnq3kcdb01qr9gtk2m5u7pgi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.417
cmnq3kcdh01qw9gtkgn6yv2c2	cmnq3kcdf01qu9gtkxuc35opi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.421
cmnq3kcdm01qz9gtk00sw5h7p	cmnq3kcdk01qx9gtk56czihiv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.427
cmnq3kcds01r29gtkl6hfaqoa	cmnq3kcdq01r09gtk0uqwye8y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.433
cmnq3kcdx01r59gtkikgpy69i	cmnq3kcdv01r39gtk8x2ya69w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.437
cmnq3kce201r89gtk0jj1xs64	cmnq3kce001r69gtk2wbgcu9n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.442
cmnq3kce701rb9gtko59iu5o0	cmnq3kce501r99gtkunpwu574	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.448
cmnq3kcec01re9gtkhdav2pl9	cmnq3kcea01rc9gtkg9py1sex	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.452
cmnq3kceg01rh9gtkpvkqi0yc	cmnq3kcef01rf9gtk6bftbrc8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.457
cmnq3kcen01rk9gtkpf3sw28w	cmnq3kcek01ri9gtkcxstjn4d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.463
cmnq3kcet01rn9gtk0fkmog3l	cmnq3kceq01rl9gtkllmqtyni	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.469
cmnq3kcez01rq9gtkhr2s82qs	cmnq3kcew01ro9gtk6i9h3uxr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.476
cmnq3kcf501rt9gtkusvx09du	cmnq3kcf301rr9gtk1pwl0fet	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.482
cmnq3kcfa01rw9gtkrtpk6oi7	cmnq3kcf801ru9gtkbfp2mqk9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.486
cmnq3kcfe01rz9gtkacyfi76z	cmnq3kcfd01rx9gtkhz31yn8c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.491
cmnq3kcfk01s29gtk09xtc048	cmnq3kcfi01s09gtkhokvt83e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.496
cmnq3kcfp01s59gtksrx1pfut	cmnq3kcfn01s39gtkvpo9azlm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.501
cmnq3kcft01s89gtkdfl7vcyy	cmnq3kcfr01s69gtkjrdinn4a	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.506
cmnq3kcfz01sb9gtk5alkwzhj	cmnq3kcfw01s99gtkweo9z8ah	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.511
cmnq3kcg401se9gtkcs9jawtu	cmnq3kcg201sc9gtkxh3o28lx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.517
cmnq3kcg901sh9gtkvjrtedk8	cmnq3kcg701sf9gtkkcty41dn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.521
cmnq3kcgd01sk9gtkb84zksmq	cmnq3kcgb01si9gtk0v1d6ofe	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.526
cmnq3kcgj01sn9gtkda73lqcn	cmnq3kcgh01sl9gtktih8ybb7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.532
cmnq3kcgn01sq9gtkaoq4n3b8	cmnq3kcgm01so9gtktiax4ram	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.536
cmnq3kcgs01st9gtk4kg1vd9y	cmnq3kcgq01sr9gtkcqdpy6o3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.54
cmnq3kcgx01sw9gtkt76ugukh	cmnq3kcgv01su9gtkjejyky0b	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.546
cmnq3kch201sz9gtksmeqk9ha	cmnq3kch001sx9gtkf1jxz62u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.551
cmnq3kch601t29gtk7ft1qspl	cmnq3kch501t09gtk5zfu4xa8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.555
cmnq3kchb01t59gtkmit5gks8	cmnq3kch901t39gtkflscxk6h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.559
cmnq3kchh01t89gtkr93ewqj8	cmnq3kchf01t69gtkqrfmo6se	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.565
cmnq3kchl01tb9gtky7rnbi56	cmnq3kchj01t99gtk35ji40ao	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.569
cmnq3kchp01te9gtk0dsw4qk5	cmnq3kchn01tc9gtkr2znean3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.573
cmnq3kchv01th9gtk18e7o0zf	cmnq3kchs01tf9gtk3n6ikc8n	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.579
cmnq3kci001tk9gtklr5kl2gm	cmnq3kchy01ti9gtkwo1cw20m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.584
cmnq3kci401tn9gtk3b97izaq	cmnq3kci201tl9gtkoxe5gfhg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.588
cmnq3kci901tq9gtkl5npzmci	cmnq3kci601to9gtkjl9gmm14	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.593
cmnq3kcif01tt9gtklp12vmri	cmnq3kcid01tr9gtkly9q6nh9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.599
cmnq3kcij01tw9gtkchavu18u	cmnq3kcih01tu9gtkxtlmxlwf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.604
cmnq3kcio01tz9gtk8jy7ei5h	cmnq3kcim01tx9gtkue75fm92	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.608
cmnq3kcit01u29gtkitbvj3ib	cmnq3kcir01u09gtk64l88bo7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.614
cmnq3kciy01u59gtkb00d9abp	cmnq3kciw01u39gtkl6odtphe	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.618
cmnq3kcj201u89gtkxy4bncqu	cmnq3kcj101u69gtkfop15f0u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.623
cmnq3kcj801ub9gtkilxbcfv5	cmnq3kcj601u99gtkbazc2c3f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.628
cmnq3kcjd01ue9gtklgniq560	cmnq3kcjb01uc9gtk1v70anea	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.633
cmnq3kcjh01uh9gtktiop3kov	cmnq3kcjg01uf9gtkbk0jcv7z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.638
cmnq3kcjo01uk9gtkucjub53u	cmnq3kcjl01ui9gtk2lkwi9ba	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.644
cmnq3kcjt01un9gtksibdxb0a	cmnq3kcjr01ul9gtkx2j5wful	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.65
cmnq3kcjy01uq9gtkmzg2ilgd	cmnq3kcjw01uo9gtkctf5jehy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.654
cmnq3kck301ut9gtkvcthnz9u	cmnq3kck101ur9gtkfcpc9bq1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.659
cmnq3kcka01uw9gtk91xb0hcc	cmnq3kck801uu9gtkogdgczvn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.667
cmnq3kckh01uz9gtk3op0dal3	cmnq3kcke01ux9gtkdg8kwhbw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.673
cmnq3kckq01v29gtk86pvwwp7	cmnq3kckn01v09gtky5cl0c40	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.682
cmnq3kckx01v59gtka0ekjap7	cmnq3kcku01v39gtkpgt70a8e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.69
cmnq3kcl501v89gtkx5ubqslt	cmnq3kcl301v69gtkfe0ucid0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.698
cmnq3kclc01vb9gtk0aa6sk36	cmnq3kcl901v99gtkp854sxnr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.704
cmnq3kcli01ve9gtk5sjt0j9j	cmnq3kclg01vc9gtkfci5uqr2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.711
cmnq3kclp01vh9gtk2db7ludt	cmnq3kcln01vf9gtkc4lq7f21	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.717
cmnq3kclv01vk9gtknqqd6dwk	cmnq3kclt01vi9gtkk41aucj4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.724
cmnq3kcm301vn9gtkqq7gfnzh	cmnq3kcm001vl9gtkyy2bnz35	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.731
cmnq3kcm901vq9gtkob75o2jj	cmnq3kcm701vo9gtkw39csut3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.738
cmnq3kcmh01vt9gtkcwtyn3bh	cmnq3kcme01vr9gtkw43v9cch	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.746
cmnq3kcmp01vw9gtkvdxr7g3w	cmnq3kcmm01vu9gtkuljd5g21	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.753
cmnq3kcmy01vz9gtk78965j3r	cmnq3kcmu01vx9gtkvx20wx2r	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.762
cmnq3kcn601w29gtkxkav0z09	cmnq3kcn301w09gtkixmwvjir	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.77
cmnq3kcne01w59gtke1sfgkvg	cmnq3kcna01w39gtkrfp515t5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.779
cmnq3kcnm01w89gtkbifbc3ul	cmnq3kcnj01w69gtkblm6w9dz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.786
cmnq3kcnv01wb9gtkumvkt7hv	cmnq3kcnr01w99gtki40en94e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.796
cmnq3kco201we9gtkelt27u0f	cmnq3kco001wc9gtk861q2w39	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.803
cmnq3kco701wh9gtklbw6e7is	cmnq3kco501wf9gtk8wpb9lwj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.807
cmnq3kcoe01wk9gtkk5jgeyad	cmnq3kcoc01wi9gtktnzufv4c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.815
cmnq3kcoj01wn9gtkoixpept4	cmnq3kcoh01wl9gtkyynwdg86	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.819
cmnq3kcon01wq9gtk8p8x2re5	cmnq3kcol01wo9gtkt2cnzm6o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.824
cmnq3kcot01wt9gtk562n6jvw	cmnq3kcor01wr9gtk0ocv6rrd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.829
cmnq3kcoy01ww9gtk27190wuo	cmnq3kcow01wu9gtk5vgsr1ko	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.834
cmnq3kcp201wz9gtkot3tpfo4	cmnq3kcp001wx9gtk3gmunscm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.838
cmnq3kcp701x29gtknh7qbydt	cmnq3kcp501x09gtkb7jsy2o6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.843
cmnq3kcpd01x59gtkapu6fvvt	cmnq3kcpb01x39gtka1wd74a2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.849
cmnq3kcph01x89gtkukwv1vfm	cmnq3kcpf01x69gtk7mm40vji	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.853
cmnq3kcpl01xb9gtk4uqc7kl0	cmnq3kcpk01x99gtkh7n6wypb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.858
cmnq3kcps01xe9gtknzhltq3w	cmnq3kcpq01xc9gtkywmwyhpb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.865
cmnq3kcpx01xh9gtk68q867i2	cmnq3kcpv01xf9gtkv29f000y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.869
cmnq3kcq201xk9gtki9ya1sbr	cmnq3kcq001xi9gtkwtzdafsh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.874
cmnq3kcq801xn9gtk03xfhvw1	cmnq3kcq501xl9gtkopucxwck	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.88
cmnq3kcqd01xq9gtkmjxotayr	cmnq3kcqb01xo9gtkgt3lpbh5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.885
cmnq3kcqh01xt9gtku1by3zn4	cmnq3kcqg01xr9gtkzu2rykrg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.89
cmnq3kcqn01xw9gtkveicpgdf	cmnq3kcql01xu9gtkh4gdx827	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.896
cmnq3kcqs01xz9gtkthhv745k	cmnq3kcqq01xx9gtkr12e80jc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.901
cmnq3kcqx01y29gtkk8dhfxz1	cmnq3kcqv01y09gtk869gnfgr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.906
cmnq3kcr301y59gtk0wmm3hph	cmnq3kcr001y39gtkrnypx6cb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.911
cmnq3kcr901y89gtkpudj57ol	cmnq3kcr701y69gtkcb5rcgmx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.917
cmnq3kcrd01yb9gtkza8fai6g	cmnq3kcrc01y99gtke353cn1h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.922
cmnq3kcri01ye9gtkmrmlifa0	cmnq3kcrg01yc9gtksno5pxo1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.927
cmnq3kcro01yh9gtkndqc627o	cmnq3kcrm01yf9gtk27ebiq04	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.932
cmnq3kcrs01yk9gtkq81oky9g	cmnq3kcrr01yi9gtknmpizscn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.937
cmnq3kcrx01yn9gtkk2li8mpg	cmnq3kcrv01yl9gtkdfmteg9x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.941
cmnq3kcs301yq9gtkd52qghcr	cmnq3kcs101yo9gtkf3cjdb5c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.948
cmnq3kcs901yt9gtkk1elt18t	cmnq3kcs701yr9gtk0g5tte40	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.954
cmnq3kcsg01yw9gtke4icxyv5	cmnq3kcsd01yu9gtkm514nx5c	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.961
cmnq3kcsm01yz9gtkcjrn7iy4	cmnq3kcsk01yx9gtkegq6r5ik	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.967
cmnq3kcss01z29gtkqypgmqaf	cmnq3kcsq01z09gtklcnetrud	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.973
cmnq3kcsz01z59gtkw1q8deaw	cmnq3kcsx01z39gtkz13cypx1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.979
cmnq3kct401z89gtk6tak66iz	cmnq3kct201z69gtktitsb98x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.985
cmnq3kct901zb9gtkv7los2uw	cmnq3kct701z99gtksffcz5bc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.989
cmnq3kctf01ze9gtk8tjj7iz4	cmnq3kctc01zc9gtkilwn0d3h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:52.996
cmnq3kctl01zh9gtkzpoprzhf	cmnq3kctj01zf9gtkj8ppo9s7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.001
cmnq3kctx01zk9gtkmw3ztcwe	cmnq3kctp01zi9gtkzrg0knci	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.013
cmnq3kcu401zn9gtkwaqgi8ed	cmnq3kcu101zl9gtk4wlt6g38	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.02
cmnq3kcud01zq9gtk4gbs2dsk	cmnq3kcu801zo9gtk63efig8z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.029
cmnq3kcuk01zt9gtkyocjbg52	cmnq3kcui01zr9gtknds74w9m	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.037
cmnq3kcur01zw9gtku974gbdu	cmnq3kcuo01zu9gtk94y5kyys	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.043
cmnq3kcuy01zz9gtk3zxoje1b	cmnq3kcuv01zx9gtkukf4rn1q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.05
cmnq3kcv302029gtk23dozzth	cmnq3kcv102009gtkpitzaw2v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.055
cmnq3kcv902059gtk4r4tigq8	cmnq3kcv602039gtkzki4zknd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.061
cmnq3kcve02089gtks69implm	cmnq3kcvc02069gtkzm38rxcm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.067
cmnq3kcvj020b9gtkz8z1epzy	cmnq3kcvh02099gtksm6r0b0h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.071
cmnq3kcvo020e9gtknl0h5b9g	cmnq3kcvm020c9gtkkdq98qct	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.077
cmnq3kcvu020h9gtkufxd9edz	cmnq3kcvs020f9gtkqd73t15l	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.083
cmnq3kcvz020k9gtkj1qd3dtw	cmnq3kcvx020i9gtk61h6vvv8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.087
cmnq3kcw3020n9gtk8aj2hhnx	cmnq3kcw2020l9gtkn0wavtai	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.092
cmnq3kcwa020q9gtkz3ulusik	cmnq3kcw8020o9gtkr8p74zsh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.098
cmnq3kcwe020t9gtkiokddbk6	cmnq3kcwc020r9gtktdu320hb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.102
cmnq3kcwi020w9gtka2x60j5u	cmnq3kcwh020u9gtkbirw1qhy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.107
cmnq3kcwo020z9gtk6yrnmtkn	cmnq3kcwm020x9gtkekkm34vm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.113
cmnq3kcwt02129gtkzat8cc52	cmnq3kcwr02109gtktiq41xmv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.118
cmnq3kcwy02159gtk81r3m5ow	cmnq3kcww02139gtkgrwnsp27	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.122
cmnq3kcx402189gtkkcmtgwby	cmnq3kcx002169gtk0pemw4iv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.128
cmnq3kcx9021b9gtkrqxco88r	cmnq3kcx702199gtkwckt2bnd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.133
cmnq3kcxe021e9gtkzerdvy4z	cmnq3kcxc021c9gtk8ciomua3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.138
cmnq3kcxj021h9gtk4gjdsag2	cmnq3kcxh021f9gtkgqp6qv10	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.144
cmnq3kcxq021k9gtkih0sl5cc	cmnq3kcxn021i9gtk4l1ujtrb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.15
cmnq3kcxw021n9gtkcjnkvfgs	cmnq3kcxu021l9gtk63h1jfrs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.157
cmnq3kcy3021q9gtkbp3xvb63	cmnq3kcy1021o9gtkmuqzr197	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.163
cmnq3kcy8021t9gtk5l6ia17b	cmnq3kcy6021r9gtkkgwdam1v	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.169
cmnq3kcye021w9gtkxq5lmjm3	cmnq3kcyb021u9gtkfr5io1w0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.174
cmnq3kcyl021z9gtkvray4r3n	cmnq3kcyi021x9gtkor6t66xb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.182
cmnq3kcys02229gtknrp2492q	cmnq3kcyp02209gtkrrq5qfh8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.188
cmnq3kcyy02259gtkqwxl2648	cmnq3kcyv02239gtk0adb35gk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.194
cmnq3kcz302289gtk78wp4w4p	cmnq3kcz102269gtk3hhb5xix	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.2
cmnq3kcz9022b9gtk72iyahe4	cmnq3kcz702299gtk0bap0tf8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.205
cmnq3kczf022e9gtkda1syyc3	cmnq3kczd022c9gtkxr55s29y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.212
cmnq3kczl022h9gtkvm9bmqvf	cmnq3kczj022f9gtksyc4tvfs	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.218
cmnq3kczt022k9gtk6cdnh4pj	cmnq3kczq022i9gtkh79231au	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.225
cmnq3kd00022n9gtk252h13r9	cmnq3kczy022l9gtkv89hcjxc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.233
cmnq3kd07022q9gtkrqg4ovxw	cmnq3kd05022o9gtkea2h3k3j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.24
cmnq3kd0f022t9gtk70ngafo0	cmnq3kd0c022r9gtklv5db1gz	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.247
cmnq3kd0l022w9gtkrnxpdlwp	cmnq3kd0i022u9gtk0z3h42pv	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.253
cmnq3kd0r022z9gtkc195giat	cmnq3kd0o022x9gtk8et1cgpn	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.259
cmnq3kd0w02329gtk6z654kpw	cmnq3kd0u02309gtk546y1yk6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.264
cmnq3kd1102359gtk2zsqyzq0	cmnq3kd0z02339gtk19cgjo5z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.27
cmnq3kd1602389gtkb9y9pw1i	cmnq3kd1402369gtkneluy1sg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.275
cmnq3kd1c023b9gtkca7cipk2	cmnq3kd1a02399gtk54ovznqb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.281
cmnq3kd1i023e9gtkilsq1omc	cmnq3kd1g023c9gtk0dszz3qg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.287
cmnq3kd1p023h9gtk7oq260cn	cmnq3kd1m023f9gtkuzkfiq0o	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.293
cmnq3kd1u023k9gtkx0wq1ldt	cmnq3kd1s023i9gtkyq6ricox	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.298
cmnq3kd1z023n9gtkn9mnfjk2	cmnq3kd1x023l9gtk5idfrhmt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.304
cmnq3kd25023q9gtkmf2c06p3	cmnq3kd23023o9gtk5olbw7bu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.31
cmnq3kd2b023t9gtkn4z3sv7a	cmnq3kd29023r9gtkuojp9teo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.315
cmnq3kd2h023w9gtk77e7u0tv	cmnq3kd2e023u9gtk8jt7tgs1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.321
cmnq3kd2n023z9gtkgmvokp7b	cmnq3kd2k023x9gtk6xun1gt6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.327
cmnq3kd2s02429gtky8v9ry3s	cmnq3kd2q02409gtk9jzn2zfi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.333
cmnq3kd2z02459gtksxo7wwpu	cmnq3kd2x02439gtk0n9xam39	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.339
cmnq3kd3402489gtk1ol55514	cmnq3kd3202469gtk72fyp9v3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.345
cmnq3kd39024b9gtkgzadgdes	cmnq3kd3702499gtk34fu1txm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.349
cmnq3kd3d024e9gtkg9wigmgw	cmnq3kd3c024c9gtkcak6rd80	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.354
cmnq3kd3i024h9gtkuo5plam7	cmnq3kd3g024f9gtkdusksp0x	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.358
cmnq3kd3o024k9gtkp17pppjx	cmnq3kd3m024i9gtkn5w5ddas	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.364
cmnq3kd3s024n9gtkmxmlotde	cmnq3kd3r024l9gtkm524ckr8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.369
cmnq3kd3x024q9gtkwgax8rn1	cmnq3kd3v024o9gtkmw66hu4e	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.373
cmnq3kd43024t9gtkruak6nlm	cmnq3kd40024r9gtke8ue9v2i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.379
cmnq3kd48024w9gtkm7j6l8vx	cmnq3kd46024u9gtkaq1m3gug	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.384
cmnq3kd4c024z9gtkzzhtdxcb	cmnq3kd4b024x9gtkfnwpgihm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.389
cmnq3kd4j02529gtkmw66ky7n	cmnq3kd4g02509gtk7mujieyi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.395
cmnq3kd4o02559gtkx0ab0mm6	cmnq3kd4m02539gtku7wamwrd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.4
cmnq3kd4s02589gtkaioirsae	cmnq3kd4r02569gtkbkyud4i7	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.405
cmnq3kd4y025b9gtkux1mbvu4	cmnq3kd4v02599gtksp2mvnyq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.41
cmnq3kd53025e9gtky00w83x9	cmnq3kd51025c9gtkatxt6nro	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.416
cmnq3kd58025h9gtk6hyxzfln	cmnq3kd56025f9gtk8k7vpzcw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.42
cmnq3kd5c025k9gtk0rpos9hl	cmnq3kd5b025i9gtk4lsc7co5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.425
cmnq3kd5i025n9gtknpkewgu4	cmnq3kd5g025l9gtkjnpylomm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.431
cmnq3kd5n025q9gtk40g1sg4y	cmnq3kd5l025o9gtkh7uq3hnt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.436
cmnq3kd5s025t9gtk5e7ukf1p	cmnq3kd5q025r9gtk6coknaai	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.44
cmnq3kd5y025w9gtkm9y7iskx	cmnq3kd5v025u9gtk6vwypnox	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.446
cmnq3kd62025z9gtk9vppyov2	cmnq3kd61025x9gtkkh1voucr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.451
cmnq3kd6702629gtkjvmv526w	cmnq3kd6502609gtkp21s2v2l	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.456
cmnq3kd6c02659gtk6qfnh206	cmnq3kd6a02639gtkrngge1wp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.461
cmnq3kd6i02689gtkblo4zwia	cmnq3kd6g02669gtk5kzmpphb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.466
cmnq3kd6m026b9gtk3napcjgy	cmnq3kd6k02699gtkadg858f6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.471
cmnq3kd6r026e9gtkbml2meqt	cmnq3kd6p026c9gtkl66h3d0u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.475
cmnq3kd6x026h9gtkd3ltoqm7	cmnq3kd6u026f9gtkga5rvdcc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.481
cmnq3kd71026k9gtkwdcjvzuh	cmnq3kd6z026i9gtkxvk159r9	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.486
cmnq3kd76026n9gtk6bzujwgh	cmnq3kd74026l9gtk5p6u5l30	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.49
cmnq3kd7c026q9gtkvwhxuzky	cmnq3kd7a026o9gtki7ucmyb8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.497
cmnq3kd7h026t9gtkb27dr1so	cmnq3kd7f026r9gtk489dq92j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.501
cmnq3kd7l026w9gtkeyuuw7s0	cmnq3kd7k026u9gtknc6yj929	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.506
cmnq3kd7r026z9gtkoqac0igx	cmnq3kd7o026x9gtkyb5ic1te	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.511
cmnq3kd7x02729gtkj5t7nugo	cmnq3kd7v02709gtkd302408h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.517
cmnq3kd8102759gtkxrfdbn5g	cmnq3kd8002739gtk7z1ctbdx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.522
cmnq3kd8602789gtknu8jtkc3	cmnq3kd8402769gtkptf9jqj0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.527
cmnq3kd8c027b9gtkoo0m7qv3	cmnq3kd8a02799gtknsxt79cj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.533
cmnq3kd8h027e9gtk7x3jh2lz	cmnq3kd8f027c9gtkm3t1leqp	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.537
cmnq3kd8m027h9gtkxwhbl84i	cmnq3kd8k027f9gtkaco7w59d	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.543
cmnq3kd8s027k9gtkc1rx5ni3	cmnq3kd8q027i9gtkukkk1skh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.548
cmnq3kd8x027n9gtkzzjah006	cmnq3kd8v027l9gtkux3b35ap	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.553
cmnq3kd91027q9gtk8t19d8kw	cmnq3kd8z027o9gtk2tn6a83y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.558
cmnq3kd98027t9gtkis5j9gcw	cmnq3kd95027r9gtkngbojl66	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.564
cmnq3kd9c027w9gtkl58ewrkw	cmnq3kd9a027u9gtky2wy4u77	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.569
cmnq3kd9h027z9gtk9e2b8i5p	cmnq3kd9f027x9gtkj5v9g4dd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.573
cmnq3kd9n02829gtkitl5l74z	cmnq3kd9l02809gtk957oern1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.58
cmnq3kd9s02859gtkqhnrz3ef	cmnq3kd9r02839gtkbqimwhli	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.585
cmnq3kd9x02889gtk0uin6sce	cmnq3kd9v02869gtk9udwjouu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.589
cmnq3kda4028b9gtkjkl4n3gh	cmnq3kda002899gtknp46g139	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.596
cmnq3kda9028e9gtk2y5qnc62	cmnq3kda7028c9gtkegbo8z43	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.601
cmnq3kdad028h9gtky6w00htc	cmnq3kdac028f9gtka3lp485i	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.606
cmnq3kdaj028k9gtkwtzmm5np	cmnq3kdag028i9gtkctm9km9b	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.611
cmnq3kdao028n9gtkzkk4jjzd	cmnq3kdan028l9gtk8li0r4a4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.617
cmnq3kdat028q9gtkl7878lzx	cmnq3kdar028o9gtkrk2s88gk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.621
cmnq3kdaz028t9gtk4e1qipim	cmnq3kdaw028r9gtkn2q8861k	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.627
cmnq3kdb4028w9gtkzq12awzx	cmnq3kdb2028u9gtke6wc36nd	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.633
cmnq3kdb9028z9gtknne9pc56	cmnq3kdb7028x9gtk06n3v6hy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.638
cmnq3kdbe02929gtkx4z8ss5w	cmnq3kdbc02909gtkmsyds6c2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.642
cmnq3kdbk02959gtk0o1uqag2	cmnq3kdbi02939gtkwoy5yzl4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.649
cmnq3kdbq02989gtky8spn784	cmnq3kdbn02969gtkge6lqkht	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.654
cmnq3kdbx029b9gtkg4e8i5ob	cmnq3kdbu02999gtk7pq8e0eo	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.661
cmnq3kdc3029e9gtkwjvj33zn	cmnq3kdc1029c9gtkp1koggry	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.668
cmnq3kdc9029h9gtku76vbgce	cmnq3kdc7029f9gtkuwsbx7l1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.673
cmnq3kdcg029k9gtk3c7q4oj2	cmnq3kdcd029i9gtkfwfn75bh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.68
cmnq3kdcl029n9gtkgg3dziqd	cmnq3kdcj029l9gtktay2a2cx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.686
cmnq3kdcr029q9gtkqivomatb	cmnq3kdcp029o9gtk0tip50jx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.691
cmnq3kdcy029t9gtk75wo17z9	cmnq3kdcw029r9gtkn65sk8kh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.698
cmnq3kdd3029w9gtkb5n2k4ri	cmnq3kdd1029u9gtk27xn9oag	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.704
cmnq3kdd9029z9gtkdbwzp2qj	cmnq3kdd7029x9gtk9bsq37ou	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.71
cmnq3kddg02a29gtk67rs16da	cmnq3kddd02a09gtkdn193grh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.716
cmnq3kddl02a59gtktv6u0xah	cmnq3kddj02a39gtkq2l9h0gq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.722
cmnq3kdds02a89gtkiisa9tjk	cmnq3kddp02a69gtkk1bthrtt	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.728
cmnq3kddy02ab9gtksa5ls5nn	cmnq3kddw02a99gtkivcan6ab	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.735
cmnq3kde402ae9gtk0hu1kdi7	cmnq3kde202ac9gtkcm45geyy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.741
cmnq3kdeb02ah9gtkqr9pwo3t	cmnq3kde902af9gtk2mr98r52	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.748
cmnq3kdeh02ak9gtkesncjonv	cmnq3kdef02ai9gtkrp6wlpep	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.753
cmnq3kden02an9gtk2l18jgys	cmnq3kdek02al9gtke1p93bit	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.759
cmnq3kdeu02aq9gtkwb7o1hd4	cmnq3kder02ao9gtklpe1q70a	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.766
cmnq3kdf002at9gtkvfs13dil	cmnq3kdex02ar9gtknwwr06dy	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.772
cmnq3kdf802aw9gtk6aephsrc	cmnq3kdf402au9gtk5nyh47hr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.78
cmnq3kdff02az9gtki9m0gqvn	cmnq3kdfc02ax9gtkiocu1jfg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.787
cmnq3kdfo02b29gtkkw37i06q	cmnq3kdfj02b09gtkqilv93tu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.796
cmnq3kdfw02b59gtk7jp9m06a	cmnq3kdft02b39gtkngrgf5qf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.804
cmnq3kdg202b89gtkbuszxuuf	cmnq3kdfz02b69gtk231i818z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.81
cmnq3kdg802bb9gtkutlrrbei	cmnq3kdg602b99gtktznv5nru	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.816
cmnq3kdgd02be9gtk1ty5agw0	cmnq3kdgb02bc9gtkao1s8741	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.822
cmnq3kdgi02bh9gtkdzyn5isc	cmnq3kdgg02bf9gtk3qjbjv3j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.827
cmnq3kdgo02bk9gtkxzn78144	cmnq3kdgm02bi9gtk5gcvlto1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.833
cmnq3kdgt02bn9gtkbewg489e	cmnq3kdgr02bl9gtkpgwe0caj	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.837
cmnq3kdgx02bq9gtkatphwvrp	cmnq3kdgv02bo9gtkclipsh1u	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.842
cmnq3kdh402bt9gtkidplsa0x	cmnq3kdh202br9gtkb3gwa9nh	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.849
cmnq3kdhb02bw9gtkybf1en2v	cmnq3kdh802bu9gtk9chqbucw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.855
cmnq3kdhj02bz9gtkr9nh0nyj	cmnq3kdhf02bx9gtkh45em9j5	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.863
cmnq3kdho02c29gtkypzpyskb	cmnq3kdhm02c09gtkz5f7k22w	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.869
cmnq3kdhu02c59gtkwwdcl1jl	cmnq3kdhs02c39gtklrirr5ph	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.874
cmnq3kdi102c89gtkwv284t5c	cmnq3kdhy02c69gtkcbsz68l0	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.881
cmnq3kdi702cb9gtkqc7f5lwv	cmnq3kdi502c99gtk4auima1y	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.887
cmnq3kdig02ce9gtksax1wbhe	cmnq3kdie02cc9gtku2x06bfb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.897
cmnq3kdim02ch9gtkstefcvwo	cmnq3kdik02cf9gtkpvkiqiud	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.902
cmnq3kdir02ck9gtktcuw9k3z	cmnq3kdip02ci9gtk2n7dhg47	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.908
cmnq3kdiy02cn9gtk4heke7m6	cmnq3kdiw02cl9gtkuu9iueb6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.915
cmnq3kdj302cq9gtk3btxk52o	cmnq3kdj102co9gtk6a9t3gfl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.92
cmnq3kdj802ct9gtkiswzc5bg	cmnq3kdj602cr9gtk8bb88mhg	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.925
cmnq3kdjf02cw9gtk0lkg0ukr	cmnq3kdjd02cu9gtk8lqfq50z	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.931
cmnq3kdjk02cz9gtkov4ny063	cmnq3kdji02cx9gtksom5m61k	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.937
cmnq3kdjq02d29gtk7sf6l2dj	cmnq3kdjn02d09gtks93wx68h	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.942
cmnq3kdjw02d59gtkapbbokgz	cmnq3kdju02d39gtk0fkhj1fi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.949
cmnq3kdk202d89gtk0nrd6ag9	cmnq3kdk002d69gtkoop8bko4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.954
cmnq3kdk802db9gtkaultpxs7	cmnq3kdk502d99gtk1vzytd98	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.96
cmnq3kdke02de9gtk30s5wr2x	cmnq3kdkc02dc9gtkcjux62fc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.967
cmnq3kdkk02dh9gtk5yifpx9l	cmnq3kdki02df9gtkawm11aw8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.973
cmnq3kdks02dk9gtkh7ddjsa1	cmnq3kdkp02di9gtkvpjo93td	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.98
cmnq3kdkw02dn9gtk5ossj9o7	cmnq3kdkv02dl9gtkpc5csrsf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.985
cmnq3kdl102dq9gtk7mmhku2h	cmnq3kdkz02do9gtkim88h1gl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.989
cmnq3kdl702dt9gtky3otoyaj	cmnq3kdl402dr9gtkl13ltclc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:53.995
cmnq3kdlc02dw9gtk98j1i6uj	cmnq3kdla02du9gtk214r3dxi	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54
cmnq3kdlg02dz9gtkc3y08s6o	cmnq3kdlf02dx9gtkkl4rgti2	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.005
cmnq3kdll02e29gtkuc2ok75o	cmnq3kdlj02e09gtk9ae5sy9f	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.01
cmnq3kdlr02e59gtkztafn3e8	cmnq3kdlp02e39gtka5z4oxxl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.015
cmnq3kdlw02e89gtkt4cgfstr	cmnq3kdlu02e69gtkdpgy4tfu	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.02
cmnq3kdm002eb9gtk1yok096x	cmnq3kdly02e99gtkb0ztmazw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.024
cmnq3kdm602ee9gtkpqsvtai0	cmnq3kdm302ec9gtk09jl2989	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.03
cmnq3kdma02eh9gtk1khwo8jo	cmnq3kdm902ef9gtkdcxlb1hl	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.035
cmnq3kdmf02ek9gtknqf6c9pv	cmnq3kdmd02ei9gtkzdmgrush	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.039
cmnq3kdml02en9gtkoa8qa5cf	cmnq3kdmi02el9gtkvp07t0dm	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.045
cmnq3kdmq02eq9gtklu3yl570	cmnq3kdmo02eo9gtkdbp0jfjw	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.05
cmnq3kdmu02et9gtk362amo6b	cmnq3kdms02er9gtkx27ffqj3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.055
cmnq3kdn002ew9gtku5v91o9k	cmnq3kdmx02eu9gtkq8zzatqk	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.06
cmnq3kdn502ez9gtkpv5vxaib	cmnq3kdn302ex9gtk5h42ozwq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.066
cmnq3kdnc02f29gtkbf4d757h	cmnq3kdn802f09gtkwmtibtwa	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	imported	1	\N	2026-04-08 13:41:54.072
cmnq49wbb02f49gtk2h21rukp	cmnq3kcgb01si9gtk0v1d6ofe	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 14:01:44.664
cmnq4a21202f69gtkmmv4yulb	cmnq3kd9r02839gtkbqimwhli	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 14:01:52.07
cmnq4a7ul02f89gtkridild56	cmnq3kco001wc9gtk861q2w39	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 14:01:59.613
cmnq4ruir02fa9gtkkat0u0ty	cmnq3kcih01tu9gtkxtlmxlwf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	2	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29160161"}, "email": {"to": null, "from": "vivian@amadeira.com.br"}, "cidade": {"to": null, "from": "Serra"}, "origem": {"to": null, "from": "1"}, "status": {"to": null, "from": "ATIVA"}, "isActive": {"to": null, "from": true}, "situacao": {"to": "MENSAL", "from": "AVULSO"}, "telefone": {"to": null, "from": "3434-5085 / 3434-5051"}, "documento": {"to": null, "from": "28154862000198"}, "idSistema": {"to": null, "from": "818"}, "logradouro": {"to": null, "from": "Avenida João Palácio - 501 - Eurico Salles"}, "tributacao": {"to": null, "from": "LUCRO_PRESUMIDO"}, "razaoSocial": {"to": null, "from": "A MADEIRA INDUSTRIA E COMERCIO LTDA"}, "tipoCliente": {"to": null, "from": "1"}, "tipoDocumento": {"to": null, "from": "CNPJ"}}	2026-04-08 14:15:42.148
cmnq4rz7002fc9gtkbypsr0ht	cmnq3kcih01tu9gtkxtlmxlwf	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	3	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29160161"}, "email": {"to": null, "from": "vivian@amadeira.com.br"}, "cidade": {"to": null, "from": "Serra"}, "origem": {"to": null, "from": "1"}, "status": {"to": null, "from": "ATIVA"}, "isActive": {"to": null, "from": true}, "situacao": {"to": "AVULSO", "from": "MENSAL"}, "telefone": {"to": null, "from": "3434-5085 / 3434-5051"}, "documento": {"to": null, "from": "28154862000198"}, "idSistema": {"to": null, "from": "818"}, "logradouro": {"to": null, "from": "Avenida João Palácio - 501 - Eurico Salles"}, "tributacao": {"to": null, "from": "LUCRO_PRESUMIDO"}, "razaoSocial": {"to": null, "from": "A MADEIRA INDUSTRIA E COMERCIO LTDA"}, "tipoCliente": {"to": null, "from": "1"}, "tipoDocumento": {"to": null, "from": "CNPJ"}}	2026-04-08 14:15:48.205
cmnq5f1ph00019g6c811rufh5	cmnq3kaxj00wu9gtkqyovb046	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 14:33:44.55
cmnq5f1py00039g6cex1vlj9f	cmnq3kann00qu9gtkz0w0ctq1	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 14:33:44.567
cmnq5f1qe00059g6c2dkpbz2h	cmnq3kb60011r9gtkddv1nu97	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 14:33:44.582
cmnq6h1d800019gtw5l09n6rm	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	2	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29165130"}, "email": {"to": null, "from": "FINANCEIRO@CENTRAL-RNC.COM.BR"}, "grupo": {"to": null, "from": "GRUPO CENTRAL CONTÁBIL"}, "cidade": {"to": null, "from": "SERRA"}, "origem": {"to": null, "from": "INDICAÇÃO DE COLABORADOR"}, "regime": {"to": null, "from": "CAIXA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": "http://localhost:4000/api/upload/f7649fe5-6585-42cd-b56e-af2f4beef27f.png", "from": null}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "(27) 2104-8300/ (27) 2104-8308"}, "categoria": {"to": null, "from": "STANDARD"}, "documento": {"to": null, "from": "32401481000133"}, "idSistema": {"to": null, "from": "6"}, "logradouro": {"to": null, "from": "CENTRAL, 1345, PAVMTO3 3 A - PARQUE RESIDENCIAL LARANJEIRAS"}, "tributacao": {"to": null, "from": "SIMPLES_NACIONAL"}, "dataEntrada": {"to": null, "from": "1991-01-18T02:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>teste</p>"}, "razaoSocial": {"to": null, "from": "CENTRAL CONTABIL LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "CENTRAL SOLUCOES EMPRESARIAIS"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-08 15:03:17.036
cmnq6h4r500039gtw668ihenn	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	3	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29165130"}, "email": {"to": null, "from": "FINANCEIRO@CENTRAL-RNC.COM.BR"}, "grupo": {"to": null, "from": "GRUPO CENTRAL CONTÁBIL"}, "cidade": {"to": null, "from": "SERRA"}, "origem": {"to": null, "from": "INDICAÇÃO DE COLABORADOR"}, "regime": {"to": null, "from": "CAIXA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": "http://localhost:4000/api/upload/931bef95-24d5-41c8-8888-c1e60325a46f.png", "from": "http://localhost:4000/api/upload/f7649fe5-6585-42cd-b56e-af2f4beef27f.png"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "(27) 2104-8300/ (27) 2104-8308"}, "categoria": {"to": null, "from": "STANDARD"}, "documento": {"to": null, "from": "32401481000133"}, "idSistema": {"to": null, "from": "6"}, "logradouro": {"to": null, "from": "CENTRAL, 1345, PAVMTO3 3 A - PARQUE RESIDENCIAL LARANJEIRAS"}, "tributacao": {"to": null, "from": "SIMPLES_NACIONAL"}, "dataEntrada": {"to": null, "from": "1991-01-18T02:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>teste</p>"}, "razaoSocial": {"to": null, "from": "CENTRAL CONTABIL LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "CENTRAL SOLUCOES EMPRESARIAIS"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-08 15:03:21.426
cmnq6ua1700059gtws3fbm8mo	cmnpxa9cp00019g3wvlul3lav	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-08 15:13:34.795
cmnq7q14y00079gtw2ztl0hf0	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	4	{"idSistema": {"to": null, "from": "6"}, "dataEntrada": {"to": "1991-01-18T00:00:00.000Z", "from": "1991-01-18T02:00:00.000Z"}}	2026-04-08 15:38:16.258
cmnq7vjkc00019g6w4ai1g7tl	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	5	{"idSistema": {"to": "29", "from": "6"}}	2026-04-08 15:42:33.42
cmnq8j4j100039g6wusb5c2dz	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	7	{"cep": {"to": "29165-130", "from": "29165130"}, "bairro": {"to": "PARQUE RESIDENCIAL LARANJEIRAS", "from": "null"}, "numero": {"to": "1345", "from": "null"}, "logradouro": {"to": "CENTRAL", "from": "CENTRAL, 1345, PAVMTO3 3 A - PARQUE RESIDENCIAL LARANJEIRAS"}, "complemento": {"to": "PAVMTO3 3 A", "from": "null"}}	2026-04-08 16:00:53.678
cmnq8s4oh00059g6wekr50c1p	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	8	{"idOmie": {"to": "622828233", "from": "null"}, "omieEmpresa": {"to": "CENTRAL", "from": "null"}}	2026-04-08 16:07:53.777
cmnros7ag00019gr4yyoe446t	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	10	{"observacoes": {"to": "<p></p>", "from": "<p>teste</p>"}}	2026-04-09 16:23:37.192
cmnqdpa4z00019gtkhpatimfy	cmnq3k9nv006c9gtkdwigjhm4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	2	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29164510"}, "email": {"to": null, "from": "administrativo@acaibrasilmix.com.br"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "origem": {"to": null, "from": "INTERNET"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "(27) 3281-3375"}, "documento": {"to": null, "from": "11318082000133"}, "idSistema": {"to": "2", "from": "78"}, "logradouro": {"to": null, "from": "RUA GILSEPPI VERDI, 349"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2020-01-01T03:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>O sócio Alencar Duarte é conhecido do Marcelo Munhão</p><p>O leonardo gerente financeiro da empresa ligou e pediu agendamento de visita na central</p><p>Virá com ele o consultor&nbsp;da empresa que mora em belo Horizonte&nbsp;</p><p>Dia 26/08 vieram na central os socios&nbsp;Alencar, Edvânia, o gerente Leonardo e Márcio (consultor)</p><p><br></p>"}, "razaoSocial": {"to": null, "from": "ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ACAI BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Trabalhista"}}	2026-04-08 18:25:38.963
cmnqdphp900039gtkfw7dumt6	cmnq3k9nv006c9gtkdwigjhm4	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	3	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29164510"}, "email": {"to": null, "from": "administrativo@acaibrasilmix.com.br"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "origem": {"to": null, "from": "INTERNET"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "(27) 3281-3375"}, "documento": {"to": null, "from": "11318082000133"}, "logradouro": {"to": null, "from": "RUA GILSEPPI VERDI, 349"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2020-01-01T03:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>O sócio Alencar Duarte é conhecido do Marcelo Munhão</p><p>O leonardo gerente financeiro da empresa ligou e pediu agendamento de visita na central</p><p>Virá com ele o consultor&nbsp;da empresa que mora em belo Horizonte&nbsp;</p><p>Dia 26/08 vieram na central os socios&nbsp;Alencar, Edvânia, o gerente Leonardo e Márcio (consultor)</p><p><br></p>"}, "razaoSocial": {"to": null, "from": "ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ACAI BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Trabalhista"}}	2026-04-08 18:25:48.765
cmnqdu0us00059gtkvm0gglrb	cmnq3k9bk000f9gtk2ozho7g6	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	9	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29165-130"}, "email": {"to": null, "from": "FINANCEIRO@CENTRAL-RNC.COM.BR"}, "grupo": {"to": null, "from": "GRUPO CENTRAL CONTÁBIL"}, "bairro": {"to": null, "from": "PARQUE RESIDENCIAL LARANJEIRAS"}, "cidade": {"to": null, "from": "SERRA"}, "idOmie": {"to": null, "from": "622828233"}, "numero": {"to": null, "from": "1345"}, "origem": {"to": null, "from": "INDICAÇÃO DE COLABORADOR"}, "regime": {"to": null, "from": "CAIXA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": null, "from": "http://localhost:4000/api/upload/931bef95-24d5-41c8-8888-c1e60325a46f.png"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "(27) 2104-8300/ (27) 2104-8308"}, "categoria": {"to": null, "from": "STANDARD"}, "documento": {"to": null, "from": "32401481000133"}, "logradouro": {"to": null, "from": "CENTRAL"}, "tributacao": {"to": null, "from": "SIMPLES_NACIONAL"}, "complemento": {"to": null, "from": "PAVMTO3 3 A"}, "dataEntrada": {"to": null, "from": "1991-01-18T00:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>teste</p>"}, "omieEmpresa": {"to": null, "from": "CENTRAL"}, "razaoSocial": {"to": null, "from": "CENTRAL CONTABIL LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "CENTRAL SOLUCOES EMPRESARIAIS"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-08 18:29:20.213
cmnruc6mm00019g58xcxga9e3	cmnq3k9la00539gtkzuxym3f3	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-09 18:59:07.534
cmnruc6na00039g58w2xgp5lb	cmnq3kanv00r09gtkngidwdpx	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	deleted	1	\N	2026-04-09 18:59:07.558
cmnrx431100019gw4cj99qz97	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	2	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29167015"}, "email": {"to": null, "from": "NFE@ADRIABRASIL.COM.BR"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "3218-5558"}, "categoria": {"to": null, "from": "ADVANCED"}, "documento": {"to": null, "from": "07799121000194"}, "idSistema": {"to": "3", "from": "4"}, "logradouro": {"to": null, "from": "TALMA RODRIGUES RIBEIRO, 5341 - ALTEROSAS"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2007-09-01T03:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>Empresa Fundapiana</p>"}, "razaoSocial": {"to": null, "from": "ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ADRIA BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-09 20:16:48.469
cmnrx5am300039gw4487mpqr7	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	3	{"dataEntrada": {"to": "2007-09-01T00:00:00.000Z", "from": "2007-09-01T03:00:00.000Z"}}	2026-04-09 20:17:44.955
cmnrxoss500019gv4iy8hglc6	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	4	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29167015"}, "email": {"to": null, "from": "NFE@ADRIABRASIL.COM.BR"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": "http://localhost:4000/api/upload/515e0459-5dc1-4914-8e03-b9a68d42a365.jpg", "from": "null"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "3218-5558"}, "categoria": {"to": null, "from": "ADVANCED"}, "documento": {"to": null, "from": "07799121000194"}, "idSistema": {"to": null, "from": "3"}, "logradouro": {"to": null, "from": "TALMA RODRIGUES RIBEIRO, 5341 - ALTEROSAS"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2007-09-01T00:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>Empresa Fundapiana</p>"}, "razaoSocial": {"to": null, "from": "ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ADRIA BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-09 20:32:54.965
cmnrxov1s00039gv4do72sfm3	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	5	{"logoUrl": {"to": "null", "from": "http://localhost:4000/api/upload/515e0459-5dc1-4914-8e03-b9a68d42a365.jpg"}}	2026-04-09 20:32:57.905
cmnrxtbo600019g18div7nfq8	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	6	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29167015"}, "email": {"to": null, "from": "NFE@ADRIABRASIL.COM.BR"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": "http://localhost:4000/api/upload/29e9e1d9-85b7-4f78-bb1a-b9e005a36077.jpg", "from": "null"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "3218-5558"}, "categoria": {"to": null, "from": "ADVANCED"}, "documento": {"to": null, "from": "07799121000194"}, "idSistema": {"to": null, "from": "3"}, "logradouro": {"to": null, "from": "TALMA RODRIGUES RIBEIRO, 5341 - ALTEROSAS"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2007-09-01T00:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>Empresa Fundapiana</p>"}, "razaoSocial": {"to": null, "from": "ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ADRIA BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-09 20:36:26.07
cmnrxtcot00039g18r1g5lo8g	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	7	{"logoUrl": {"to": "null", "from": "http://localhost:4000/api/upload/29e9e1d9-85b7-4f78-bb1a-b9e005a36077.jpg"}}	2026-04-09 20:36:27.389
cmnryf46p00019g28d5xw167e	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	8	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29167015"}, "email": {"to": null, "from": "NFE@ADRIABRASIL.COM.BR"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": "http://localhost:4000/api/upload/5079779c-5180-436e-9029-d1edd380e5ab.jpg", "from": "null"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "3218-5558"}, "categoria": {"to": null, "from": "ADVANCED"}, "documento": {"to": null, "from": "07799121000194"}, "idSistema": {"to": null, "from": "3"}, "logradouro": {"to": null, "from": "TALMA RODRIGUES RIBEIRO, 5341 - ALTEROSAS"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2007-09-01T00:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>Empresa Fundapiana</p>"}, "razaoSocial": {"to": null, "from": "ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ADRIA BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-09 20:53:22.801
cmnryfecj00039g28rh8m8tfq	cmnq3k9b500099gtk30clc154	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	updated	9	{"uf": {"to": null, "from": "ES"}, "cep": {"to": null, "from": "29167015"}, "email": {"to": null, "from": "NFE@ADRIABRASIL.COM.BR"}, "grupo": {"to": null, "from": "EMPRESA ÚNICA"}, "cidade": {"to": null, "from": "SERRA"}, "regime": {"to": null, "from": "COMPETENCIA"}, "status": {"to": null, "from": "ATIVA"}, "logoUrl": {"to": "http://localhost:4000/api/upload/c722a908-a018-4a38-b101-781ba29d66e2.jpg", "from": "http://localhost:4000/api/upload/5079779c-5180-436e-9029-d1edd380e5ab.jpg"}, "isActive": {"to": null, "from": true}, "situacao": {"to": null, "from": "MENSAL"}, "telefone": {"to": null, "from": "3218-5558"}, "categoria": {"to": null, "from": "ADVANCED"}, "documento": {"to": null, "from": "07799121000194"}, "idSistema": {"to": null, "from": "3"}, "logradouro": {"to": null, "from": "TALMA RODRIGUES RIBEIRO, 5341 - ALTEROSAS"}, "tributacao": {"to": null, "from": "LUCRO_REAL"}, "dataEntrada": {"to": null, "from": "2007-09-01T00:00:00.000Z"}, "observacoes": {"to": null, "from": "<p>Empresa Fundapiana</p>"}, "razaoSocial": {"to": null, "from": "ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA"}, "tipoCliente": {"to": null, "from": "MATRIZ"}, "nomeFantasia": {"to": null, "from": "ADRIA BRASIL"}, "tipoDocumento": {"to": null, "from": "CNPJ"}, "areasContratadas": {"to": null, "from": "Contábil;Fiscal;Legalização;Trabalhista"}}	2026-04-09 20:53:35.971
\.


--
-- Data for Name: cliente_historicos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cliente_historicos (id, cliente_id, user_id, mensagem, tipo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clientes (id, code, razao_social, nome_fantasia, documento, tipo_documento, tipo_cliente, situacao, status, grupo, origem, data_entrada, data_saida, observacoes, tributacao, regime, inscricao_estadual, inscricao_municipal, areas_contratadas, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, email, empresa_id, version, is_active, created_at, updated_at, categoria, deleted_at, id_omie, id_sistema, logo_url, omie_empresa, id_oneclick) FROM stdin;
cmnq3k9a000009gtkf4rk98d4	2	BELA VISTA INDUSTRIA E COMERCIO DE PRE-MOLDADOS LTDA	BELA VISTA INDUSTRIA E COMERCIO DE PRE-MOLDADOS LTDA - EPP	01031119000194	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO BELA VISTA	\N	1998-09-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29171242	R RODRIGO TAVARES, 170	\N	\N	\N	SERRA	ES	(27) 3338-9000/ (27) 3341-2516	financeiro@belavistapremoldados.com.br	\N	1	t	2026-04-08 13:41:48.408	2026-04-08 13:41:48.408	\N	\N	\N	1	\N	\N	\N
cmnq3k9am00039gtkwbl70nm3	3	AJ PORT CONSULTORIA LTDA	AJ PORT CONSULTORIA LTDA	47306185000120	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	INDICAÇÃO DE COLABORADOR	2022-07-27 03:00:00	\N	<p>Indicação de Giovana (irmão dela)</p>	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29055620	R JOÃO DA CRUZ	\N	\N	\N	VITORIA (ES)	ES	999029836	julio.castiglioni@gmail.com,jobrotas@hotmail.com	\N	1	t	2026-04-08 13:41:48.431	2026-04-08 13:41:48.431	\N	\N	\N	2	\N	\N	\N
cmnq3k9at00069gtkm63fah29	4	ACBL INFORMACOES LTDA	\N	43340265000141	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2022-02-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29010490	RUA HENRIQUE NOVAES, 88	\N	\N	\N	VITORIA	ES	(27) 9852-2768 / (27) 2124-3419	aleite@es360.com.br	\N	1	t	2026-04-08 13:41:48.438	2026-04-08 13:41:48.438	\N	\N	\N	3	\N	\N	\N
cmnq3k9bb000c9gtktm72adkq	6	ARAME NOBRE INDUSTRIA E COMERCIO LTDA	ARAME NOBRE	36578434000110	CNPJ	A DEFINIR	MENSAL	ATIVA	GRUPO TELAMBRADO	\N	2024-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29111160	AVENIDA PRIMEIRA, 1371	\N	\N	\N	VILA VELHA	ES	(27) 3229-9298	contato@telambrado.com.br	\N	1	t	2026-04-08 13:41:48.456	2026-04-08 13:41:48.456	\N	\N	\N	5	\N	\N	\N
cmnq3k9bq000i9gtkf8xrbo2w	8	BLUEVIX COMERCIO E SERVICO LTDA	\N	39272778000195	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO KERNEL	\N	2018-01-23 02:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29104491	DARLY SANTOS, 800, GALPAO02-A - JARDIM ASTECA	\N	\N	\N	VILA VELHA	ES	(27) 2125-0337 / (27) 3185-7557	ADMINISTRATIVO@BLUEVIX.COM.BR	\N	1	t	2026-04-08 13:41:48.471	2026-04-08 13:41:48.471	\N	\N	\N	7	\N	\N	\N
cmnq3k9bx000l9gtkpxjuh0ja	9	ARCANA DESIGN LTDA	\N	63231837000161	CNPJ	A DEFINIR	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2025-10-16 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345 - PARQUE RESIDENCIAL LARANJEIRAS - PAVMTO2 SALA 3 E	\N	\N	\N	SERRA	ES	(27) 9909-7194 / (0000) 0000-0000	michellysugui@gmail.com	\N	1	t	2026-04-08 13:41:48.477	2026-04-08 13:41:48.477	\N	\N	\N	8	\N	\N	\N
cmnq3k9c4000o9gtknjrhuv1w	10	ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE LTDA	ATENTO . GESTAO EM RISCOS E PRODUTIVIDADE	31332375000182	CNPJ	1	MENSAL	ATIVA	GRUPO GLOBALSYS	2	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29102035	AV SATURNINO RANGEL MAURO, 400	\N	\N	\N	VILA VELHA	ES	(27) 3062-2230	faturamento@sistemaatento.com.br	\N	1	t	2026-04-08 13:41:48.485	2026-04-08 13:41:48.485	\N	\N	\N	9	\N	\N	\N
cmnq3k9ca000r9gtkjvolpa5y	11	AURORA INFORMATICA COMERCIO IMPORTACAO E EXPORTACAO LTDA	AURORA INFORMATICA LTDA	59160869000146	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164153	RUA FRANCISCO SOUSA DOS SANTOS, 03	\N	\N	\N	SERRA	ES	(27) 8180-0037	diretoria@aurorainformatica.com.br	\N	1	t	2026-04-08 13:41:48.491	2026-04-08 13:41:48.491	\N	\N	\N	10	\N	\N	\N
cmnq3k9ch000u9gtk9q41qehq	12	BESSA OFFSHORE FABRICACAO, MANUTENCAO & INSPECAO INDUSTRIAL LTDA	BESSA OFFSHORE	36920281000148	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2020-04-13 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161250	AVENIDA PIRACEMA, 680	\N	\N	\N	SERRA	ES	(27) 8832-4098	isaias.bessa@yahoo.com.br	\N	1	t	2026-04-08 13:41:48.498	2026-04-08 13:41:48.498	\N	\N	\N	11	\N	\N	\N
cmnq3k9co000x9gtkr5nek2cv	13	BIOMUNDO SERRA LTDA	BIOMUNDO	33521689000159	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2019-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	CENTRAL, 1345, PAVMTO2 SALA 3 D - PARQUE RESIDENCIAL LARANJEIRAS	\N	\N	\N	SERRA	ES	(27) 3010-3397	KATIAMARAMIRANDA@GMAIL.COM	\N	1	t	2026-04-08 13:41:48.504	2026-04-08 13:41:48.504	\N	\N	\N	12	\N	\N	\N
cmnq3k9ct00109gtkg34d2lcn	14	BLR REPRESENTACOES LTDA	\N	07790078000104	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	INDICAÇÃO DE PARCEIRO	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29010002	AVENIDA JERONIMO MONTEIRO, 126 - CENTRO - SALA 608 ED BANCO COMERCIO E INDUSTRIA	\N	\N	\N	VITORIA	ES	(27) 9929-0345	beatrizleite@globo.com	\N	1	t	2026-04-08 13:41:48.509	2026-04-08 13:41:48.509	STANDARD	\N	\N	13	\N	\N	\N
cmnq3k9cz00139gtkm8gburpr	15	BORSOINETTO COMERCIO DE ARTEFATOS EM METAL LTDA	BORSOI & BORSOI	35994425000148	CNPJ	1	MENSAL	ATIVA	GRUPO BORSOINETTO	1	1991-01-18 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164044	AVENIDA DESEMBARGADOR MARIO DA SILVA NUNES, 717	\N	\N	\N	SERRA	ES	(27) 3228-1209	borsoinetto@hotmail.com	\N	1	t	2026-04-08 13:41:48.516	2026-04-08 13:41:48.516	\N	\N	\N	14	\N	\N	\N
cmnq3k9d600169gtk04efnui4	16	BRUMAN COMERCIO E SERVICOS DE MAQUINAS E EQUIPAMENTOS LTDA	BRUMAN	09471676000138	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO BRUMAN	INTERNET	2021-07-01 03:00:00	\N	<p>Insc.Estadual: 082.536.52-0 | Insc.Municipal: 3557200</p>	LUCRO_PRESUMIDO	\N	\N	\N	Trabalhista;Contábil;Fiscal;Legalização	29167638	MANOEL LOPES, 01 - TAQUARA II, 01, TAQUARA II, LOTE 0 PLTIS 0 - LOTE 0 PLTIS 0	\N	\N	\N	SERRA	ES	(27) 3328-1772	FABRICIO.BERGAMINI@BRUMAN.COM.BR	\N	1	t	2026-04-08 13:41:48.522	2026-04-08 13:41:48.522	ADVANCED	\N	\N	15	\N	\N	\N
cmnq3k9dd00199gtkizr8asna	17	BOX 027 VAREJO DIGITAL LTDA	BOX 027	41697567000146	CNPJ	1	MENSAL	ATIVA	GRUPO GLOBALSYS	2	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29100652	RUA ONAIR DE FREITAS, 33	\N	\N	\N	VILA VELHA	ES	(27) 3062-2230	willian.lovato@globalsys.com.br	\N	1	t	2026-04-08 13:41:48.529	2026-04-08 13:41:48.529	\N	\N	\N	16	\N	\N	\N
cmnq3k9dj001c9gtkrxyvg7gj	18	BR MAQUIL DISTRIBUIDORA DE MAQUINAS E FERRAMENTAS LTDA	BR MAQUIL	07615692000121	CNPJ	7	MENSAL	ATIVA	GRUPO MAQUIL	2	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Fiscal;Trabalhista	29145711	RODOVIA BR-262, 4991	\N	\N	\N	CARIACICA	ES	(27) 3336-1254 / (27) 3185-7557	luciana@maquil.com.br	\N	1	t	2026-04-08 13:41:48.535	2026-04-08 13:41:48.535	\N	\N	\N	17	\N	\N	\N
cmnq3k9do001f9gtksjs8ueiu	19	A.C RAUPP SERVICOS ADMINISTRATIVOS	A.C RAUPP	13845695000154	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2017-04-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29168625	DO FAISAO, 12, : PARTE; - PORTO CANOA	\N	\N	\N	SERRA	ES	(27) 2104-8300	francisca@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.541	2026-04-08 13:41:48.541	\N	\N	\N	18	\N	\N	\N
cmnq3k9dw001i9gtklpbfvlsp	20	BELA VISTA INDUSTRIA E COMERCIO DE PRE-MOLDADOS LTDA	\N	01031119000275	CNPJ	FILIAL	MENSAL	ATIVA	GRUPO BELA VISTA	\N	2011-10-14 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29171242	RUA RODRIGO TAVARES, 170 - SERRA DOURADA II - GALPAO02	\N	\N	\N	SERRA	ES	(27) 3338-9000	financeiro@belavistapremoldados.com.br	\N	1	t	2026-04-08 13:41:48.549	2026-04-08 13:41:48.549	\N	\N	\N	19	\N	\N	\N
cmnq3k9e1001l9gtkjm1ybs0j	21	COMERCIAL LONDRINA LTDA	\N	31791726000113	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	1996-03-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29166045	RUA TOLEDO, S/N	\N	\N	\N	SERRA	ES	(27) 3341-1008 / (27) 2104-8300	comerciallondrina@hotmail.com	\N	1	t	2026-04-08 13:41:48.553	2026-04-08 13:41:48.553	\N	\N	\N	20	\N	\N	\N
cmnq3kana00qo9gtkkxmy71hh	322	CAPIXABA DE PRODUTOS QUIMICOS LTDA	\N	03104497000186	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	01136443060	jomarcontabil@uol.com.br	\N	1	t	2026-04-08 13:41:50.183	2026-04-08 13:41:50.183	\N	\N	\N	344	\N	\N	\N
cmnpxa9cp00019g3wvlul3lav	1	CENTRAL CONTABIL LTDA	CENTRAL SOLUCOES EMPRESARIAIS	32.401.481/0001-33	CNPJ	\N	MENSAL	ATIVA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	29165-130	CENTRAL	1345	PAVMTO3 3 A	PARQUE RESIDENCIAL LARANJEIRAS	SERRA	ES	\N	\N	\N	1	t	2026-04-08 10:46:04.249	2026-04-08 15:13:34.798	NAO_INFORMADO	2026-04-08 15:13:34.797	\N	\N	\N	\N	\N
cmnq3k9e7001o9gtkzdtiunj4	22	COMERCIAL LUF LTDA	DOCE SABER	00212745000114	CNPJ	1	MENSAL	ATIVA	GRUPO LUF	1	1999-11-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AV CENTRAL, 811	\N	\N	\N	SERRA	ES	(27) 3237-2968/ (27) 9222-3624	papelaria@docesaber.com	\N	1	t	2026-04-08 13:41:48.559	2026-04-08 13:41:48.559	\N	\N	\N	21	\N	\N	\N
cmnq3k9ee001r9gtkw7eo2i2h	23	ESTACIONE ESTACIONAMENTOS LTDA	\N	00956216000125	CNPJ	1	MENSAL	ATIVA	GRUPO ROTSEN 	1	2006-01-02 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29025023	RUA DOUTOR JOAO DOS SANTOS NEVES, 99	\N	\N	\N	VITORIA	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.566	2026-04-08 13:41:48.566	\N	\N	\N	22	\N	\N	\N
cmnq3k9ej001u9gtkf5msysax	24	FAVORITA DO BRASIL MARMORES E GRANITOS LTDA	FAVORITA DO BRASIL	02611161000147	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2014-01-01 02:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29161388	AVENIDA QUINHENTOS, 374	\N	\N	\N	SERRA	ES	(27) 3328-2195 / (27) 3328-9301 / (27) 3338-7551	favoritadobrasil@favoritadobrasil.com.br	\N	1	t	2026-04-08 13:41:48.571	2026-04-08 13:41:48.571	\N	\N	\N	23	\N	\N	\N
cmnq3k9ep001x9gtk8pw6jnvc	25	INTEC INTEGRACAO NACIONAL DE TRANSPORTES DE ENCOMENDAS E CARGAS LTDA	\N	52134798001300	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2007-03-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29173795	TALMA RODRIGUES RIBEIRO, 147, GALPAO1 MODULO C - PORTAL DE JACARAIPE	\N	\N	\N	SERRA	ES	(11) 4772-4200 / (27	paralegal.corporativo@luft.com.br	\N	1	t	2026-04-08 13:41:48.577	2026-04-08 13:41:48.577	\N	\N	\N	24	\N	\N	\N
cmnq3k9eu00209gtk146jseq5	26	L & L SERVICOS CONTABEIS LTDA	CENTRAL GESTAO E CONTABILIDADE	14877030000195	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL CONTÁBIL	1	2012-01-05 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 2104-8300 / (27) 2104-8308 / (27) 2104-8311	financeiro@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.583	2026-04-08 13:41:48.583	\N	\N	\N	25	\N	\N	\N
cmnq3k9f000239gtk6dsk10h9	27	MILANEZ & FALQUETO LTDA	\N	39377403000190	CNPJ	A DEFINIR	MENSAL	ATIVA	EMPRESA ÚNICA	\N	1992-09-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29166200	AV REGIAO SUDESTE, 960	\N	\N	\N	SERRA	ES	(27) 3434-0600	falquetofinanceiro@gmail.com	\N	1	t	2026-04-08 13:41:48.588	2026-04-08 13:41:48.588	\N	\N	\N	26	\N	\N	\N
cmnq3k9f700269gtkf4mfdrtm	28	ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA	OTIMA ATACADO	07550459000108	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO ORIONES	\N	2005-09-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164140	ES-010, 4321, SALA 03 - KM 4.29 QUADRACHA LOTE 272 - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	3089-3888	SAC@OTIMAATACADO.COM.BR	\N	1	t	2026-04-08 13:41:48.595	2026-04-08 13:41:48.595	\N	\N	\N	27	\N	\N	\N
cmnq3k9fc00299gtkecbz2nfd	29	PARANA GRANITOS LTDA	STONE GALLERY	05595540000189	CNPJ	1	MENSAL	ATIVA	GRUPO PARANÁ 	1	2010-05-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29313162	AVENIDA MAURO MIRANDA MADUREIRA, 1504	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(27) 3328-8523	mara@paranagranitos.com.br	\N	1	t	2026-04-08 13:41:48.601	2026-04-08 13:41:48.601	\N	\N	\N	28	\N	\N	\N
cmnq3k9fi002c9gtkrg02pxyo	30	POLYDOMUS- INDUSTRIA E COMERCIO DE EMBALAGENS LTDA	POLYDOMUS	27226935000147	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	1995-10-24 02:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29168022	RUA COMENDADOR ROBERTO UGOLINI, 1/3	\N	\N	\N	SERRA	ES	(27) 3341-1444 / (27) 3341-1489 / (27) 3341-1444	nfe@polydomus.com.br	\N	1	t	2026-04-08 13:41:48.607	2026-04-08 13:41:48.607	\N	\N	\N	29	\N	\N	\N
cmnq3k9fp002f9gtk4cw9jc16	31	PRE-MOLDADOS UNIDOS INDUSTRIA E COMERCIO LTDA	BELA VISTA	04635570000109	CNPJ	1	MENSAL	ATIVA	GRUPO BELA VISTA	1	1998-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29171242	RUA RODRIGO TAVARES, 170	\N	\N	\N	SERRA	ES	(27) 3338-9000	financeiro@belavistapremoldados.com.br	\N	1	t	2026-04-08 13:41:48.614	2026-04-08 13:41:48.614	\N	\N	\N	30	\N	\N	\N
cmnq3k9fv002i9gtkbqxxashz	32	RHEEM DO BRASIL COMERCIO E DISTRIBUICAO DE AR CONDICIONADO E AQUECIMENTO LTDA	\N	10755792000320	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2010-01-01 02:00:00	2026-03-30 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal	29168345	PORTO CANOA, S/N, SALA 10 LOTE A3C2 - PORTO CANOA	\N	\N	\N	SERRA	ES	(27) 2104-8300	francisca@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.619	2026-04-08 13:41:48.619	STANDARD	\N	\N	31	\N	\N	\N
cmnq3k9g0002l9gtkuein4sc4	33	ROTSEN COMERCIO DE COUROS E PLASTICOS LTDA	VALERIA COUROS	35972470000100	CNPJ	2	MENSAL	ATIVA	GRUPO ROTSEN 	1	1990-09-27 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29025023	R DOUTOR JOAO DOS SANTOS NEVES, 85	\N	\N	\N	VITORIA	ES	(27) 3222-7605	rotsenccpl@terra.com.br	\N	1	t	2026-04-08 13:41:48.624	2026-04-08 13:41:48.624	\N	\N	\N	32	\N	\N	\N
cmnq3k9g7002o9gtkdggsjy4x	34	ROTSEN COMERCIO DE COUROS E PLASTICOS LTDA	\N	35972470000363	CNPJ	2	MENSAL	ATIVA	GRUPO ROTSEN 	1	2006-07-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29055570	RUA DOUTOR JOAO DOS SANTOS NEVES, 78	\N	\N	\N	VITORIA	ES	(27) 3222-7605 / (27) 3225-4249	marcelo@centralcontabil.com.br	\N	1	t	2026-04-08 13:41:48.632	2026-04-08 13:41:48.632	\N	\N	\N	33	\N	\N	\N
cmnq3k9gd002r9gtktofhbv9w	35	TRANSEGURO ES CORRETORA DE SEGUROS LTDA	\N	16750366000118	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	1999-05-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29100390	RUA MARIA CATARINA, 66	\N	\N	\N	VILA VELHA	ES	(27) 3320-5959	financeiro@transeguroes.com.br	\N	1	t	2026-04-08 13:41:48.637	2026-04-08 13:41:48.637	\N	\N	\N	34	\N	\N	\N
cmnq3k9gj002u9gtk0lkof33i	36	AYKO TECHNOLOGY LTDA	AYKO TECHNOLOGY	05805349000114	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO VIP REDE	\N	2013-12-01 02:00:00	\N	<p>SUPORTE TECNICO, MANUTEÇÃO E OUTROS SERVIÇOS EM TECNOLOGIA DA INFORMAÇÃO</p>	LUCRO_REAL	COMPETENCIA	\N	\N	Contábil;Fiscal;Legalização	29101430	R INACIO HIGINO, 994	\N	\N	\N	VILA VELHA	ES	(27) 4009-4802	financeiro@viprede.com	\N	1	t	2026-04-08 13:41:48.643	2026-04-08 13:41:48.643	\N	\N	\N	35	\N	\N	\N
cmnq3k9gp002x9gtkxxlashue	37	VITORIA ON-LINE SERVICOS DE INTERNET LTDA	\N	10338682000109	CNPJ	1	MENSAL	ATIVA	GRUPO VIP REDE	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29050909	RUA ABIAIL DO AMARAL CARNEIRO, 191	\N	\N	\N	VITORIA	ES	(27) 4009-4802	financeiro@viprede.com	\N	1	t	2026-04-08 13:41:48.65	2026-04-08 13:41:48.65	\N	\N	\N	36	\N	\N	\N
cmnq3k9gv00309gtk9njyi80n	38	ZORZAL TECNOLOGIA E GESTAO LTDA	ZORZAL TECNOLOGIA E GESTAO	07452963000175	CNPJ	1	MENSAL	ATIVA	GRUPO ZORZAL	1	2008-05-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29055620	RUA JOAO DA CRUZ, 25	\N	\N	\N	VITORIA	ES	(27) 3227-9001 / (27) 8868-0246 / (27) 2104-8300	financeiro@zorzal.com.br	\N	1	t	2026-04-08 13:41:48.655	2026-04-08 13:41:48.655	\N	\N	\N	37	\N	\N	\N
cmnq3k9h100339gtkkib0aomb	39	LANGUAGE IDIOMAS LTDA	\N	10203600000100	CNPJ	1	MENSAL	ATIVA	GRUPO WIZARD	1	2014-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29102035	AV SATURNINO RANGEL MAURO, 101	\N	\N	\N	VILA VELHA	ES	(27) 3328-5858	financeiro@wizardes.com.br	\N	1	t	2026-04-08 13:41:48.662	2026-04-08 13:41:48.662	\N	\N	\N	38	\N	\N	\N
cmnq3k9h700369gtk8hypuq1h	40	SEA IDIOMAS LTDA	\N	14103512000198	CNPJ	1	MENSAL	ATIVA	GRUPO WIZARD	1	2014-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29175269	AV ABIDO SAADI, 4227	\N	\N	\N	SERRA	ES	(27) 3328-5858	financeiro@wizardes.com.br	\N	1	t	2026-04-08 13:41:48.667	2026-04-08 13:41:48.667	\N	\N	\N	39	\N	\N	\N
cmnq3k9hc00399gtk058srcps	41	KNOW HOW IDIOMAS LTDA	\N	07720801000170	CNPJ	1	MENSAL	ATIVA	GRUPO WIZARD	1	2013-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29165155	AV PRIMEIRA AVENIDA, 148	\N	\N	\N	SERRA	ES	(27) 3328-5858	financeiro@wizardes.com.br	\N	1	t	2026-04-08 13:41:48.672	2026-04-08 13:41:48.672	\N	\N	\N	40	\N	\N	\N
cmnq3k9hk003c9gtk3tvlrl2e	42	MUNDI IDIOMAS LTDA	\N	10198105000150	CNPJ	1	MENSAL	ATIVA	GRUPO WIZARD	1	2014-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29050662	AVENIDA CEZAR HILAL, 570	\N	\N	\N	VITORIA	ES	(27) 3328-5858 / (27) 3328-5858	financeiro@wizardes.com.br	\N	1	t	2026-04-08 13:41:48.68	2026-04-08 13:41:48.68	\N	\N	\N	41	\N	\N	\N
cmnq3k9hq003f9gtk1h1n56vr	43	LEAO SCHMIDT CURSOS DE IDIOMAS LTDA	\N	08248961000121	CNPJ	1	MENSAL	ATIVA	GRUPO WIZARD	1	2014-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29090060	RUA CARLOS MARTINS, 838	\N	\N	\N	VITORIA	ES	(27) 3328-5858 / (27) 3237-0825	financeiro@wizardes.com.br	\N	1	t	2026-04-08 13:41:48.686	2026-04-08 13:41:48.686	\N	\N	\N	42	\N	\N	\N
cmnq3k9hw003i9gtkx4hay8q8	44	LUF EMPREENDIMENTOS LTDA	\N	14661519000125	CNPJ	1	MENSAL	ATIVA	GRUPO LUF	1	2019-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 811	\N	\N	\N	SERRA	ES	(27) 2104-8300 / (27) 2104-8311	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.693	2026-04-08 13:41:48.693	\N	\N	\N	43	\N	\N	\N
cmnq3k9i3003l9gtkt5a2nccc	45	FORMASET PROMOCIONAIS COMERCIO E INDUSTRIA LTDA	\N	13257776000133	CNPJ	1	MENSAL	ATIVA	GRUPO FORMASET	\N	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168080	AVENIDA TALMA RODRIGUES RIBEIRO, SN	\N	\N	\N	SERRA	ES	(27) 3398-4100 / (27) 3066-6829	tadeu@formaset.com.br	\N	1	t	2026-04-08 13:41:48.7	2026-04-08 13:41:48.7	\N	\N	\N	44	\N	\N	\N
cmnq3k9i9003o9gtkcvougen5	46	KERNEL IMPORTACAO E EXPORTACAO LTDA	KERNEL IMPORT E EXPORT	39311386000198	CNPJ	1	MENSAL	ATIVA	GRUPO KERNEL	1	2015-01-05 02:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29104491	RODOVIA DARLY SANTOS, 800	\N	\N	\N	VILA VELHA	ES	(27) 8142-5268 / (0027) 3336-1016	contabil@kernel.com.br	\N	1	t	2026-04-08 13:41:48.705	2026-04-08 13:41:48.705	\N	\N	\N	45	\N	\N	\N
cmnq3k9if003r9gtkn5k93woc	47	CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA	\N	03597050000196	CNPJ	1	MENSAL	ATIVA	GRUPO DARWIN	1	2015-03-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29305470	RUA AMANCIO SILVA, 40	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(027) 3521-8042 / (027) 3521-8042	contab.cdi@terra.com.br	\N	1	t	2026-04-08 13:41:48.712	2026-04-08 13:41:48.712	\N	\N	\N	46	\N	\N	\N
cmnq3k9im003u9gtkra1h671w	48	CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA	CENTRO DE ENSINO COLATINENSE DARWIN	03597050000277	CNPJ	2	MENSAL	ATIVA	GRUPO DARWIN	1	2015-03-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29702230	RUA ALEGRE, 22	\N	\N	\N	COLATINA	ES	(027) 5225-555 / (027) 5225-555	lorenacentraldarwin@hotmail.com	\N	1	t	2026-04-08 13:41:48.718	2026-04-08 13:41:48.718	\N	\N	\N	47	\N	\N	\N
cmnq3k9is003x9gtkarb6wm11	49	CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA	CENTRO DE ENSINO LINHARENSE DARWIN	03597050000358	CNPJ	2	MENSAL	ATIVA	GRUPO DARWIN	1	2015-03-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29900070	AVENIDA RUI BARBOSA, 94	\N	\N	\N	LINHARES	ES	(27) 3371-2333 / (27) 3371-2333	poliana@darwin.com.br	\N	1	t	2026-04-08 13:41:48.724	2026-04-08 13:41:48.724	\N	\N	\N	48	\N	\N	\N
cmnq3k9j000409gtkjwt60al8	50	CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA	CENTRAL ADMINISTRATIVA DARWIN	03597050000439	CNPJ	2	MENSAL	ATIVA	GRUPO DARWIN	1	2015-03-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29055170	PRACA SAN MARTIN, 84	\N	\N	\N	VITORIA	ES	(27) 3325-9504 / (27) 3082-6605 / (27) 3325-9504	contabilidade@soaresvargas.com.br	\N	1	t	2026-04-08 13:41:48.733	2026-04-08 13:41:48.733	\N	\N	\N	49	\N	\N	\N
cmnq3k9j600439gtkhhltm4td	51	PEREIRA & AVILA ADVOGADOS ASSOCIADOS	\N	22796449000140	CNPJ	1	MENSAL	ATIVA	GRUPO PEREIRA & AVILA (GISELE)	1	2015-07-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29101350	RUA CONSTRUTOR SEBASTIAO SOARES DE SOUZA, 40	\N	\N	\N	VILA VELHA	ES	(27) 3072-5166	gisele@pereiraeavila.com.br	\N	1	t	2026-04-08 13:41:48.738	2026-04-08 13:41:48.738	\N	\N	\N	51	\N	\N	\N
cmnq3k9jc00469gtk6eev2ot5	52	PREMIUM IDIOMAS LTDA	\N	23361130000155	CNPJ	1	MENSAL	ATIVA	GRUPO WIZARD	1	2016-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29065340	AVENIDA DESEMBARGADOR DERMEVAL LYRIO, 510	\N	\N	\N	VITORIA	ES	(27) 3328-5858 / (27) 2104-8300	financeiro@wizardes.com.br	\N	1	t	2026-04-08 13:41:48.745	2026-04-08 13:41:48.745	\N	\N	\N	52	\N	\N	\N
cmnq3k9ji00499gtkrqxo8t6g	53	L GERING ELETRICA E AR CONDICIONADO	ELETRICLIMA ELETRICA E AR CONDICIONADO	17250123000183	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2015-11-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29112560	RUA VILA VERDE, 15	\N	\N	\N	VILA VELHA	ES	(27) 3225-5118	contato@eletriclima.com.br	\N	1	t	2026-04-08 13:41:48.75	2026-04-08 13:41:48.75	\N	\N	\N	53	\N	\N	\N
cmnq3k9jo004c9gtkwq2a4d32	54	ZORZAL GESTAO E TECNOLOGIA LTDA	ZORZAL GESTAO E TECNOLOGIA	24203997000145	CNPJ	1	MENSAL	ATIVA	GRUPO ZORZAL	1	2016-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29055620	RUA JOAO DA CRUZ, 25	\N	\N	\N	VITORIA	ES	(27) 3227-9001 / (27) 8868-0426	financeiro@zorzal.com.br	\N	1	t	2026-04-08 13:41:48.756	2026-04-08 13:41:48.756	\N	\N	\N	54	\N	\N	\N
cmnq3k9ju004f9gtku4gd3470	55	CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA	DARWIN COLATINA	03597050000510	CNPJ	2	MENSAL	ATIVA	GRUPO DARWIN	1	2015-03-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29702210	AVENIDA PRESIDENTE KENNEDY, 480	\N	\N	\N	COLATINA	ES	(27) 3315-8072 / (27) 3315-8072	flaviacentraldarwin@hotmail.com	\N	1	t	2026-04-08 13:41:48.763	2026-04-08 13:41:48.763	\N	\N	\N	55	\N	\N	\N
cmnq3k9k0004i9gtkvuc6xlwl	56	ALPHADIGI BRASIL LTDA	ALPHADIGI BRASIL LTDA	05218070000304	CNPJ	FILIAL	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2016-11-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29147030	RODOVIA GOVERNADOR MARIO COVAS, 10600 - SERRA DO ANIL - LOTE TABAJARA SALA 61	\N	\N	\N	CARIACICA	ES	(11) 3805-3213	silvia@alphadigi.com.br	\N	1	t	2026-04-08 13:41:48.768	2026-04-08 13:41:48.768	\N	\N	\N	56	\N	\N	\N
cmnq3k9k6004l9gtk2444l8ek	57	RAIO SOLDAS INSPECOES S/S	RAIO SOLDAS	39785589000116	CNPJ	1	MENSAL	ATIVA	GRUPO RAIO SOLDAS	1	2016-10-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29010935	AVENIDA JERONIMO MONTEIRO, 1000	\N	\N	\N	VITORIA	ES	(27) 3322-6686 / (27) 3339-4167	financeiro@raiosoldas.com.br	\N	1	t	2026-04-08 13:41:48.774	2026-04-08 13:41:48.774	\N	\N	\N	57	\N	\N	\N
cmnq3k9kd004o9gtk5ha7sydc	58	BELL TEC TELECOMUNICACOES LTDA	\N	16632622000253	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2023-02-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Fiscal	29162703	GOVERNADOR MARIO COVAS, 3.979, KM 268 SALA CONTANIER 11E - PLANALTO DE CARAPINA	\N	\N	\N	SERRA	ES	(31) 3379-7500/ (31) 3379-7505	adm@belltec.com.br	\N	1	t	2026-04-08 13:41:48.781	2026-04-08 13:41:48.781	\N	\N	\N	58	\N	\N	\N
cmnq3k9ki004r9gtk2g9f78lb	59	HARDBALL LTDA EM RECUPERACAO JUDICIAL	VALDAC	45842622018495	CNPJ	2	MENSAL	ATIVA	GRUPO VALDAC	1	2016-12-08 02:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	29168088	ADAUCTO MORAIS DA SILVA, 200, LOTE 008 QUADRACSI NIVEL PARTE A - CIVIT II	\N	\N	\N	SERRA	ES	(21) 2104-8300	tributario@valdac.com.br	\N	1	t	2026-04-08 13:41:48.787	2026-04-08 13:41:48.787	\N	\N	\N	59	\N	\N	\N
cmnq3k9kp004u9gtkwkmcokii	60	BROTHERS MARMORES E GRANITOS LTDA	BROTHERS IN GRANITE	11863124000117	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2023-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168040	R E, 842	\N	\N	\N	SERRA	ES	(27) 3026-3257/ (27) 9994-4003	stella@brotherssurfaces.com	\N	1	t	2026-04-08 13:41:48.794	2026-04-08 13:41:48.794	\N	\N	\N	60	\N	\N	\N
cmnq3k9kw004x9gtkb6dqrzi6	61	BLUEVIX COMERCIO E SERVICO LTDA	\N	39272778000357	CNPJ	FILIAL	MENSAL	ATIVA	GRUPO KERNEL	\N	2015-01-05 02:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29104491	RODOVIA DARLY SANTOS, 800	\N	\N	\N	VILA VELHA	ES	(27) 2125-0337	administrativo@bluevix.com.br	\N	1	t	2026-04-08 13:41:48.801	2026-04-08 13:41:48.801	\N	\N	\N	61	\N	\N	\N
cmnq3k9l300509gtk9s0lf5tr	62	CLOSET COLLECTION CONFECCOES LTDA	CLOSET COLLECTION	22180979000160	CNPJ	1	MENSAL	ATIVA	GRUPO CLOSET	2	2018-10-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29140040	R AMAZONAS, 533	\N	\N	\N	CARIACICA	ES	(27) 3325-4915	closetcollectionfabrica@outlook.com	\N	1	t	2026-04-08 13:41:48.807	2026-04-08 13:41:48.807	\N	\N	\N	62	\N	\N	\N
cmnq3k9lg00569gtk3n3uriyc	64	M5 GESTAO LTDA	M5 GESTAO	26270543000112	CNPJ	1	MENSAL	ATIVA	GRUPO VIP REDE	1	2018-06-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29050545	RUA JOSE ALEXANDRE BUAIZ, 300	\N	\N	\N	VITORIA	ES	(27) 9944-7794	tatiana.martin@globo.com	\N	1	t	2026-04-08 13:41:48.82	2026-04-08 13:41:48.82	\N	\N	\N	64	\N	\N	\N
cmnq3k9ln00599gtk9fwt2hvy	65	UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA	UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA	30691293000161	CNPJ	1	MENSAL	ATIVA	GRUPO UP LOG	6	2018-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164252	R JOSE LUIZ DA ROCHA, 281	\N	\N	\N	SERRA	ES	(27) 3338-5287	marcelo.silva@grupouplog.com.br	\N	1	t	2026-04-08 13:41:48.828	2026-04-08 13:41:48.828	\N	\N	\N	65	\N	\N	\N
cmnq3k9lt005c9gtkzrgsudq2	66	LORENA GASPARINO LTDA	LOREN	29948844000140	CNPJ	7	MENSAL	ATIVA	GRUPO CLOSET	1	2018-10-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29140040	TRAVESSA AMAZONAS, 533	\N	\N	\N	CARIACICA	ES	(27) 3091-1816	financeiro@closetcollection.com.br	\N	1	t	2026-04-08 13:41:48.834	2026-04-08 13:41:48.834	\N	\N	\N	66	\N	\N	\N
cmnq3k9ly005f9gtk7e66bryv	67	MARCIA SANTOS	CLOSET COLLECTION	10788657000380	CNPJ	1	MENSAL	ATIVA	GRUPO CLOSET	1	2018-10-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29055410	RUA CHAPOT PRESVOT, 333	\N	\N	\N	VITORIA	ES	(27) 3325-4915 / (27) 3298-1900	contato@closetcollection.com.br	\N	1	t	2026-04-08 13:41:48.839	2026-04-08 13:41:48.839	\N	\N	\N	67	\N	\N	\N
cmnq3k9m6005i9gtkm7wxce18	68	GELDEN EQUIPAMENTOS DE SEGURANCA LTDA	\N	05125726000174	CNPJ	1	MENSAL	ATIVA	GRUPO GELDEN	1	2019-02-01 02:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164050	AV LOURIVAL NUNES, 404	\N	\N	\N	SERRA	ES	(27) 3243-2450	recursos.humanos@gelden.com.br	\N	1	t	2026-04-08 13:41:48.846	2026-04-08 13:41:48.846	\N	\N	\N	68	\N	\N	\N
cmnq3k9md005l9gtkgxrthe84	69	POWER PRINT COMERCIO E SERVICOS LTDA	\N	23234705000179	CNPJ	1	MENSAL	ATIVA	GRUPO GELDEN	1	2019-02-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164050	AV LOURIVAL NUNES, 404	\N	\N	\N	SERRA	ES	(27) 3328-7879	contratos3@contservice-es.com.br	\N	1	t	2026-04-08 13:41:48.854	2026-04-08 13:41:48.854	\N	\N	\N	69	\N	\N	\N
cmnq3k9mk005o9gtkzqlwua45	70	GELDEN EQUIPAMENTOS DE SEGURANCA LTDA	\N	05125726000255	CNPJ	1	MENSAL	ATIVA	GRUPO GELDEN	1	2019-02-01 02:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29192154	AVENIDA FLORESTAL, 499	\N	\N	\N	ARACRUZ	ES	(27) 3256-1217	contratos@contservice-es.com.br	\N	1	t	2026-04-08 13:41:48.86	2026-04-08 13:41:48.86	\N	\N	\N	70	\N	\N	\N
cmnq3k9mp005r9gtkyttc05v6	71	COMUNICA ES LTDA	\N	32747025000140	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	6	2020-07-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29102035	AVENIDA SATURNINO RANGEL MAURO, 1955	\N	\N	\N	VILA VELHA	ES	(27) 2104-8300	ducaliman@gmail.com	\N	1	t	2026-04-08 13:41:48.866	2026-04-08 13:41:48.866	\N	\N	\N	71	\N	\N	\N
cmnq3k9mv005u9gtk3nimxjr6	72	LOGFLOW LTDA	LOGFLOW LOGISTICA	34232956000130	CNPJ	1	MENSAL	ATIVA	GRUPO DH HOME	2	2020-12-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29163321	RUA FLAMINGO, S/N	\N	\N	\N	SERRA	ES	(11) 7852-0234	estefania@genesecontabil.com.br	\N	1	t	2026-04-08 13:41:48.871	2026-04-08 13:41:48.871	\N	\N	\N	72	\N	\N	\N
cmnq3k9n1005x9gtk787do8cx	73	SOMA SERVICOS ADMINISTRATIVOS LTDA	SOMA SERVICOS	32663680000110	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-02-05 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29066040	AVENIDA CARLOS GOMES DE SA, 335	\N	\N	\N	VITORIA	ES	(27) 8188-2670	somaservicos.jm@gmail.com	\N	1	t	2026-04-08 13:41:48.877	2026-04-08 13:41:48.877	\N	\N	\N	73	\N	\N	\N
cmnq3k9n700609gtks7u4eq6m	74	CEGONHA TRANSPORTES E SERVICOS LTDA	CEGONHA TRANSPORTES E SERVICOS	12376888000140	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-04-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29680000	RUA GILVAN FAVARO, 458	\N	\N	\N	JOAO NEIVA	ES	(27) 2151-9228 / (27) 9901-3594 / (27) 3276-1125	cegonha@outlook.com	\N	1	t	2026-04-08 13:41:48.883	2026-04-08 13:41:48.883	\N	\N	\N	74	\N	\N	\N
cmnq3k9nd00639gtkyntwyqu3	75	MEMA ACESSORIOS E BIJUTERIAS LTDA	MORANA	33024708000131	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-04-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29050420	AVENIDA AMERICO BUAIZ, 200	\N	\N	\N	VITORIA	ES	(11) 2110-3300	financeiro07@grupoornatus.com	\N	1	t	2026-04-08 13:41:48.889	2026-04-08 13:41:48.889	\N	\N	\N	75	\N	\N	\N
cmnq3k9nj00669gtk3oz7tewz	76	LOGFLOW LTDA	LOGFLOW E-COMMERCE	34232956000211	CNPJ	2	MENSAL	ATIVA	GRUPO DH HOME	1	2020-12-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29163321	RUA FLAMINGO, S/N	\N	\N	\N	SERRA	ES	(11) 7852-0234	estefania@genesecontabil.com.br	\N	1	t	2026-04-08 13:41:48.896	2026-04-08 13:41:48.896	\N	\N	\N	76	\N	\N	\N
cmnq3k9np00699gtkpyr4e1jr	77	PRADO DISTRIBUIDORA DE UTILIDADE DOMESTICA LTDA	FOGO AZUL	34647606000135	CNPJ	1	MENSAL	ATIVA	GRUPO DH HOME	1	2019-08-26 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29163321	RUA FLAMINGO, S/N	\N	\N	\N	SERRA	ES	(11) 2106-6565	jr@fogoazul.com.br	\N	1	t	2026-04-08 13:41:48.901	2026-04-08 13:41:48.901	\N	\N	\N	77	\N	\N	\N
cmnq3k9o1006f9gtklkj56ip3	79	HARDBALL LTDA EM RECUPERACAO JUDICIAL	\N	45842622019033	CNPJ	1	MENSAL	ATIVA	GRUPO VALDAC	6	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	29168088	ADAUCTO MORAIS DA SILVA, 200, LOTE 008 QUADRACSI - CIVIT II	\N	\N	\N	SERRA	ES	(21) 2104-8300	tributario@valdac.com.br	\N	1	t	2026-04-08 13:41:48.914	2026-04-08 13:41:48.914	\N	\N	\N	79	\N	\N	\N
cmnq3k9o7006i9gtkuq462szc	80	HARDBALL LTDA EM RECUPERACAO JUDICIAL	\N	45842622019114	CNPJ	1	MENSAL	ATIVA	GRUPO VALDAC	6	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	29168088	ADAUCTO MORAIS DA SILVA, 200, LOTE 008 QUADRACSI NIVEL PARTE B - CIVIT II	\N	\N	\N	SERRA	ES	(11) 3799-1000	tributario@valdac.com.br	\N	1	t	2026-04-08 13:41:48.919	2026-04-08 13:41:48.919	\N	\N	\N	80	\N	\N	\N
cmnq3k9oc006l9gtkgd18hy1x	81	ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA	OTIMA PERFORMANCE	07550459000299	CNPJ	2	MENSAL	ATIVA	GRUPO ORIONES	1	2018-06-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164140	RODOVIA ES-010, 4321	\N	\N	\N	SERRA	ES	(27) 3089-3888	sac@otimaatacado.com.br	\N	1	t	2026-04-08 13:41:48.925	2026-04-08 13:41:48.925	\N	\N	\N	81	\N	\N	\N
cmnq3k9oj006o9gtkrgs40ni5	82	DRIVE A INFORMATICA LTDA	DRIVE A INFORMATICA	00677870000523	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-10-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29164252	JOSE LUIZ DA ROCHA, 281, SALA 06 - CAMARA	\N	\N	\N	SERRA	ES	(31) 2105-0370	fabio.silva@drivea.com.br	\N	1	t	2026-04-08 13:41:48.932	2026-04-08 13:41:48.932	\N	\N	\N	82	\N	\N	\N
cmnq3k9op006r9gtk9v8rqh6c	83	MUSSO & DO VALE LTDA	REDESHOW CASTELANDIA	27185211000100	CNPJ	1	MENSAL	ATIVA	GRUPO DENISE MUNHÃO	1	2019-11-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal	29172643	R RAIMUNDO DE OLIVEIRA, 70	\N	\N	\N	SERRA	ES	(27) 3209-2905/ (27) 3252-5597	deniseciuffi@hotmail.com	\N	1	t	2026-04-08 13:41:48.937	2026-04-08 13:41:48.937	\N	\N	\N	83	\N	\N	\N
cmnq3k9ow006u9gtksqgsa2bo	84	ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA	ZUKKI	07550459000370	CNPJ	2	MENSAL	ATIVA	GRUPO ORIONES	1	2019-12-03 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164140	RODOVIA ES-010, 4321	\N	\N	\N	SERRA	ES	(27) 3089-3888	sac@otimaatacado.com.br	\N	1	t	2026-04-08 13:41:48.944	2026-04-08 13:41:48.944	\N	\N	\N	84	\N	\N	\N
cmnq3k9p1006x9gtk9yu46yb2	85	CURTUME SILVESTRE LTDA.	\N	39811708000168	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	6	2020-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29160970	ROD BR 101 NORTE KM 264, S/N	\N	\N	\N	SERRA	ES	(27) 3228-1565	buzatovitorio@igcom.br	\N	1	t	2026-04-08 13:41:48.95	2026-04-08 13:41:48.95	\N	\N	\N	85	\N	\N	\N
cmnq3k9p700709gtkpj0tbzlb	86	V. L. B. SERVICOS MEDICOS LTDA	\N	36243022000120	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	3	2020-02-05 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 9900-1361	belloti10@gmail.com	\N	1	t	2026-04-08 13:41:48.955	2026-04-08 13:41:48.955	\N	\N	\N	86	\N	\N	\N
cmnq3k9pd00739gtk3827w3td	87	TRACTORBEL EQUIPAMENTOS LTDA	\N	22873238000407	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2021-02-26 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29163278	RUA MANOEL BANDEIRA, 1482	\N	\N	\N	SERRA	ES	(31) 2105-1437	contabil@tractorbel.com.br	\N	1	t	2026-04-08 13:41:48.962	2026-04-08 13:41:48.962	\N	\N	\N	87	\N	\N	\N
cmnq3k9pj00769gtky4lm1vsa	88	R. VIEIRA - NEGOCIOS IMOBILIARIOS, RURAIS E URBANOS LTDA	\N	05755778000124	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2020-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29066370	AVENIDA ADALBERTO SIMAO NADER, 425	\N	\N	\N	VITORIA	ES	(27) 9849-1080	hrv.vix@terra.com.br	\N	1	t	2026-04-08 13:41:48.968	2026-04-08 13:41:48.968	\N	\N	\N	88	\N	\N	\N
cmnq3k9pp00799gtkr21u4zao	89	TMT CONSTRUTORA LTDA	TAVOLARO CONSTRUTORA	13415341000170	CNPJ	1	MENSAL	ATIVA	GRUPO ADISTEC 	1	2020-10-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29167080	AVENIDA ELDES SCHERRER SOUZA, 2162	\N	\N	\N	SERRA	ES	(27) 3080-4990 / (27) 3228-1460	financeiro@tavolaroconstrutora.com.br	\N	1	t	2026-04-08 13:41:48.973	2026-04-08 13:41:48.973	\N	\N	\N	89	\N	\N	\N
cmnq3k9pw007c9gtkmvaph9ii	90	VIXSELL COMERCIO E SERVICO LTDA	\N	37297680000167	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2020-06-02 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29104491	RODOVIA DARLY SANTOS, 800	\N	\N	\N	VILA VELHA	ES	(27) 2125-0001	administrativo@vixsell.com.br	\N	1	t	2026-04-08 13:41:48.98	2026-04-08 13:41:48.98	\N	\N	\N	90	\N	\N	\N
cmnq3k9q1007f9gtkfz1k8isf	91	GS VIEIRA ADMINISTRACAO DE IMOVEIS LTDA	\N	27595407000165	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2020-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29066370	AVENIDA ADALBERTO SIMAO NADER, 425	\N	\N	\N	VITORIA	ES	(27) 9849-1080	henriquerommel@gmail.com	\N	1	t	2026-04-08 13:41:48.986	2026-04-08 13:41:48.986	\N	\N	\N	91	\N	\N	\N
cmnq3k9q7007i9gtkg63wd8vk	92	DLM SERVICOS LTDA	\N	41496504000121	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	6	2021-04-08 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29172643	R RAIMUNDO DE OLIVEIRA, 70	\N	\N	\N	SERRA	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.991	2026-04-08 13:41:48.991	\N	\N	\N	92	\N	\N	\N
cmnq3k9qe007l9gtk0llk26g8	93	GERING CLIMATIZACOES LTDA	\N	37093638000124	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2020-05-08 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29112560	R VILA VERDE, 15	\N	\N	\N	VILA VELHA	ES	(27) 3225-5118	contato@eletriclima.com.br	\N	1	t	2026-04-08 13:41:48.998	2026-04-08 13:41:48.998	\N	\N	\N	93	\N	\N	\N
cmnq3k9qj007o9gtkfeilictn	94	AYKO HOLDING E PARTICIPACOES LTDA	AYKO HOLDING E PARTICIPACOES	41004473000144	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO VIP REDE	\N	2021-06-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29101430	RUA INACIO HIGINO, 996 - PRAIA DA COSTA - ANDAR 2O	\N	\N	\N	VILA VELHA	ES	(27) 4009-4800 / (27) 4009-4860	rodrigo.chaves@viprede.com	\N	1	t	2026-04-08 13:41:49.004	2026-04-08 13:41:49.004	PREMIUM	\N	\N	94	\N	\N	\N
cmnq3k9qp007r9gtkexxa5r7j	95	CARDPACK COMERCIO E SERVICO LTDA	\N	39247001000170	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29167080	AVENIDA ELDES SCHERRER SOUZA, 2162	\N	\N	\N	SERRA	ES	(27) 8182-0063	vinicius@formaset.com.br	\N	1	t	2026-04-08 13:41:49.01	2026-04-08 13:41:49.01	\N	\N	\N	95	\N	\N	\N
cmnq3k9qw007u9gtk8zxqotw1	96	ELETRO MAQUINAS ATACADISTA LTDA	ELETRO MAQUINAS	37092170000153	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2020-05-08 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	29164140	RODOVIA ES-010, 2594	\N	\N	\N	SERRA	ES	(21) 2688-2496	corporativo@emf-rj.com.br	\N	1	t	2026-04-08 13:41:49.017	2026-04-08 13:41:49.017	\N	\N	\N	96	\N	\N	\N
cmnq3k9r2007x9gtkzfyj3yip	97	LALA KIDS ALUGUEL E VENDA DE PRODUTOS INFANTIS LTDA	LALA KIDS	42452781000103	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	1	2021-06-24 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29167080	AVENIDA ELDES SCHERRER SOUZA, 2162	\N	\N	\N	SERRA	ES	(27) 8143-1511	kelymatassinari@hotmail.com	\N	1	t	2026-04-08 13:41:49.023	2026-04-08 13:41:49.023	\N	\N	\N	97	\N	\N	\N
cmnq3k9r900809gtk51jev7n2	98	BRUCON CONSTRUCAO COMERCIO VAREJISTA DE MATERIAL DE CONSTRUCAO LTDA	BRUCON COMERCIO VAREJISTA DE MATERIAIS DE CONSTRUCAO	40891182000152	CNPJ	7	MENSAL	ATIVA	GRUPO BRUMAN	6	2021-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29166820	AVENIDA COPACABANA, SN	\N	\N	\N	SERRA	ES	(27) 3328-1772	sandro.igreja@bruman.com.br	\N	1	t	2026-04-08 13:41:49.03	2026-04-08 13:41:49.03	\N	\N	\N	98	\N	\N	\N
cmnq3k9rf00839gtkluyayt5o	99	ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA	\N	07550459000450	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2018-06-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	45988074	AVENIDA PRESIDENTE GETULIO VARGAS, 630	\N	\N	\N	TEIXEIRA DE FREITAS	BA	(71) 3901-1380	legalizacao1@hjorge-rnc.com.br	\N	1	t	2026-04-08 13:41:49.035	2026-04-08 13:41:49.035	\N	\N	\N	99	\N	\N	\N
cmnq3k9rl00869gtk33zh03lb	100	ADISTEC BRASIL INFORMATICA LTDA	\N	15457043000259	CNPJ	2	MENSAL	ATIVA	GRUPO ADISTEC 	1	2021-09-09 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29147030	RODOVIA GOVERNADOR MARIO COVAS, 10600	\N	\N	\N	CARIACICA	ES	(11) 3504-0600	foliveira@adistec.com	\N	1	t	2026-04-08 13:41:49.041	2026-04-08 13:41:49.041	\N	\N	\N	100	\N	\N	\N
cmnq3k9rs00899gtkgs0anbmi	101	ADISTEC BRASIL INFORMATICA LTDA	\N	15457043000330	CNPJ	A DEFINIR	MENSAL	ATIVA	GRUPO ADISTEC 	\N	2021-09-09 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29147030	GOVERNADOR MARIO COVAS, 10600, SALA 83 PAVMTO01 - SERRA DO ANIL	\N	\N	\N	CARIACICA	ES	(11) 3504-0600	foliveira@adistec.com	\N	1	t	2026-04-08 13:41:49.048	2026-04-08 13:41:49.048	\N	\N	\N	101	\N	\N	\N
cmnq3k9rx008c9gtk84kpaeee	102	PRADO DISTRIBUIDORA DE UTILIDADE DOMESTICA LTDA	FOGO AZUL SP	34647606000216	CNPJ	2	MENSAL	ATIVA	GRUPO DH HOME	6	2021-09-24 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	03032020	RUA CONS DANTAS, 139	\N	\N	\N	SAO PAULO	SP	(11) 2106-6565	jr@fogoazul.com.br	\N	1	t	2026-04-08 13:41:49.054	2026-04-08 13:41:49.054	\N	\N	\N	102	\N	\N	\N
cmnq3k9s3008f9gtkhlguuu6w	103	WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA	WP COMPANY	30393954000172	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	2	2022-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161230	ROD GOVERNADOR MARIO COVAS, S/N	\N	\N	\N	SERRA	ES	(27) 3100-0207	comercial@wpcompany.com.br	\N	1	t	2026-04-08 13:41:49.059	2026-04-08 13:41:49.059	\N	\N	\N	103	\N	\N	\N
cmnq3k9s9008i9gtkb8m2k9hl	104	SELF TECNOLOGIA COMERCIO E SERVICOS LTDA	SELF TECNOLOGIA	21181115000108	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	2	2022-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29160161	AVENIDA JOAO PALACIO, 300	\N	\N	\N	SERRA	ES	(27) 3100-5880	comercial@selftecnologia.com.br	\N	1	t	2026-04-08 13:41:49.065	2026-04-08 13:41:49.065	\N	\N	\N	104	\N	\N	\N
cmnq3k9se008l9gtkbou38vhs	105	SEBASTIAO PEDRO DE FREITAS	SALSA PIZZA E CHOPERIA	28397677000124	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2022-02-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29056240	RUA ELESBAO LINHARES, 20	\N	\N	\N	VITORIA	ES	(27) 3315-7511 / (27) 3395-0190 / (27) 3395-0190	contass@terra.com.br	\N	1	t	2026-04-08 13:41:49.071	2026-04-08 13:41:49.071	\N	\N	\N	105	\N	\N	\N
cmnq3k9sk008o9gtk7cq3abef	106	OPUS IMPORTACAO E COMERCIO DE EQUIPAMENTOS PARA MINERACAO LTDA	OPUS - SOLUCOES DIAMANTADAS	33672362000188	CNPJ	1	MENSAL	ATIVA	GRUPO OPUS	\N	2022-02-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29092170	AVENIDA EUGENIO PACHECO DE QUEIROZ, 472	\N	\N	\N	VITORIA	ES	(27) 3533-9007 / (27) 9277-1301 / (27) 3376-5203	administrativo@opusdiamantados.com.br	\N	1	t	2026-04-08 13:41:49.076	2026-04-08 13:41:49.076	\N	\N	\N	106	\N	\N	\N
cmnq3k9sq008r9gtk24og21mq	107	UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA	\N	30691293000404	CNPJ	2	MENSAL	ATIVA	GRUPO UP LOG	2	2025-05-22 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168090	RUA COMENDADOR ALCIDES SIMAO HELOU, 1030	\N	\N	\N	SERRA	ES	(27) 3338-5287	marcelo.silva@grupouplog.com.br	\N	1	t	2026-04-08 13:41:49.083	2026-04-08 13:41:49.083	\N	\N	\N	107	\N	\N	\N
cmnq3k9sv008u9gtk69ze8o1o	108	CENTRAL DE AVIAMENTOS SAO PAULO LTDA	CENTRAL DE AVIAMENTOS SAO PAULO	32424350000171	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL DE AVIAMENTOS	1	2020-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Legalização	29050810	AV VITORIA, 2826	\N	\N	\N	VITORIA	ES	(27) 3357-8888/ (27) 3357-8855	financeiro@centraldeaviamentos.com.br	\N	1	t	2026-04-08 13:41:49.087	2026-04-08 13:41:49.087	\N	\N	\N	108	\N	\N	\N
cmnq3k9t0008x9gtki0wmkrl7	109	VIB COMERCIAL IMPORTADORA E EXPORTADORA LTDA	VITORIA INTERNATIONAL BUSINESS	06305291000102	CNPJ	1	MENSAL	ATIVA	GRUPO VIB	1	2007-09-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal	29160790	JOSE MOREIRA MARTINS RATO, 1354, SALA 910 EDIF CRISTAL TOWER - DE FATIMA	\N	\N	\N	SERRA	ES	(27) 3345-5292 / (27) 3207-9442 / (27) 9992-1567	cristine@vib.com.br	\N	1	t	2026-04-08 13:41:49.093	2026-04-08 13:41:49.093	\N	\N	\N	109	\N	\N	\N
cmnq3k9t600909gtki88wk67q	110	COMERCIAL CT DISTRIBUIDORA LTDA	COMERCIAL CT	08843636000298	CNPJ	2	MENSAL	ATIVA	GRUPO COMERCIAL CT 	7	2022-09-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Fiscal;Trabalhista	29301015	RUA WALTER SCHWAN, 23	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(28) 3511-1767	comercialctdistribuidora@gmail.com	\N	1	t	2026-04-08 13:41:49.099	2026-04-08 13:41:49.099	\N	\N	\N	110	\N	\N	\N
cmnq3k9tc00939gtk8u1ku3yx	111	ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA	OTIMA ATACADO	07550459000531	CNPJ	2	MENSAL	ATIVA	GRUPO ORIONES	2	2022-11-17 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal;Trabalhista	29164140	RODOVIA ES-010, 4321	\N	\N	\N	SERRA	ES	(27) 3089-3888	sac@otimaatacado.com.br	\N	1	t	2026-04-08 13:41:49.104	2026-04-08 13:41:49.104	\N	\N	\N	111	\N	\N	\N
cmnq3k9th00969gtkb2asoook	112	BRIZZ VIX LTDA	\N	49329645000161	CNPJ	1	MENSAL	ATIVA	GRUPO BRIZZ VIX	2	2023-01-25 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29050360	RUA JUDITH MARIA TOVAR VAREJÃO, 411	\N	\N	\N	VITORIA	ES	(27) 9720-0098 / (0000) 0000-0000	brizzvix@gmail.com	\N	1	t	2026-04-08 13:41:49.11	2026-04-08 13:41:49.11	\N	\N	\N	112	\N	\N	\N
cmnq3k9to00999gtkynexud64	113	SOMAR EMPREENDIMENTOS LTDA	\N	49413110000174	CNPJ	1	MENSAL	ATIVA	GRUPO BELA VISTA	2	2023-01-31 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29050545	RUA JOSÉ ALEXANDRE BUAIZ, 300	\N	\N	\N	VITORIA	ES	(27) 9944-2738 / (0000) 0000-0000	somarempreendimentos.imob@gmail.com	\N	1	t	2026-04-08 13:41:49.116	2026-04-08 13:41:49.116	\N	\N	\N	113	\N	\N	\N
cmnq3k9ts009c9gtke3w3xgdj	114	CUSTOM BOX LTDA	CUSTOM BOX	30064795000162	CNPJ	1	MENSAL	ATIVA	GRUPO CUSTOM BOX	3	2024-11-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29102020	ROD DO SOL, 27	\N	\N	\N	VILA VELHA	ES	(27) 3072-3042	financeiro@custombox.com.br	\N	1	t	2026-04-08 13:41:49.121	2026-04-08 13:41:49.121	\N	\N	\N	114	\N	\N	\N
cmnq3k9ty009f9gtke0xo8uby	115	DARWIN CAPIXABA EDITORA LTDA	\N	50599076000153	CNPJ	7	MENSAL	ATIVA	GRUPO DARWIN	2	2023-05-09 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29702210	RUA PRESIDENTE KENNEDY, 480	\N	\N	\N	COLATINA	ES	(27) 2104-8300 / (0000) 0000-0000	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:49.126	2026-04-08 13:41:49.126	\N	\N	\N	115	\N	\N	\N
cmnq3k9u4009i9gtk8xaw5628	116	RESTAURANTE SALSA LTDA	SALSA SELF SERVICE	50116869000174	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2023-03-28 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29055320	RUA MADEIRA DE FREITAS, 76	\N	\N	\N	VITORIA	ES	(27) 3315-7511	contato@gruposalsa.com.br	\N	1	t	2026-04-08 13:41:49.133	2026-04-08 13:41:49.133	\N	\N	\N	116	\N	\N	\N
cmnq3k9u9009l9gtkvfpsge8m	117	WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA	WP COMPANY	30393954000253	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2023-03-23 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161230	RODOVIA GOVERNADOR MARIO COVAS, S/N	\N	\N	\N	SERRA	ES	(27) 3100-0207	comercial@wpcompany.com.br	\N	1	t	2026-04-08 13:41:49.138	2026-04-08 13:41:49.138	\N	\N	\N	117	\N	\N	\N
cmnq3k9ug009o9gtk4a7rji2o	118	PALACE PARTICIPACOES LTDA	\N	46528859000179	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2023-05-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29045402	AVENIDA NOSSA SENHORA DA PENHA, 2796	\N	\N	\N	VITORIA	ES	(27) 9982-1112	palacevix@gmail.com	\N	1	t	2026-04-08 13:41:49.144	2026-04-08 13:41:49.144	\N	\N	\N	118	\N	\N	\N
cmnq3k9um009r9gtkw5g0dybm	119	UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA	\N	30691293000323	CNPJ	2	MENSAL	ATIVA	GRUPO UP LOG	\N	2023-05-08 03:00:00	\N	\N	LUCRO_PRESUMIDO	COMPETENCIA	\N	\N	Contábil;Fiscal;Trabalhista	29168085	RUA 6 B, 80	\N	\N	\N	SERRA	ES	(27) 3338-5287	marcelo.silva@grupouplog.com.br	\N	1	t	2026-04-08 13:41:49.151	2026-04-08 13:41:49.151	\N	\N	\N	119	\N	\N	\N
cmnq3k9us009u9gtkmfqig75y	120	WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA	WP COMPANY	30393954000334	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2023-05-29 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29056245	AVENIDA NOSSA SENHORA DA PENHA, 595	\N	\N	\N	VITORIA	ES	(27) 3100-0207	comercial@wpcompany.com.br	\N	1	t	2026-04-08 13:41:49.156	2026-04-08 13:41:49.156	\N	\N	\N	120	\N	\N	\N
cmnq3k9uy009x9gtkysnlbfhb	121	RIZZO COMERCIO DE ROUPAS E ACESSORIOS DE PESCA LTDA	YELLOWFIN	40142610000144	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2023-07-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29055620	RUA JOAO DA CRUZ, 200	\N	\N	\N	VITORIA	ES	(27) 8802-4259	yellowfinbr@hotmail.com	\N	1	t	2026-04-08 13:41:49.162	2026-04-08 13:41:49.162	\N	\N	\N	121	\N	\N	\N
cmnq3k9v200a09gtk9so7wlgv	122	RECICLABEM METAIS LTDA	RECICLABEM	27930220000170	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2025-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29175709	RUA NATAL, 10	\N	\N	\N	SERRA	ES	(27) 3328-6726	financeiro@reciclabem.com.br	\N	1	t	2026-04-08 13:41:49.166	2026-04-08 13:41:49.166	\N	\N	\N	122	\N	\N	\N
cmnq3k9v600a39gtkuvfn59gk	123	BROTHERS MARMORES E GRANITOS LTDA	BROTHERS IN GRANITE	11863124000389	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2023-07-07 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161236	R PIRAGUACU, 324	\N	\N	\N	SERRA	ES	(27) 3026-3257/ (27) 9994-4003	stella@brotherssurfaces.com	\N	1	t	2026-04-08 13:41:49.171	2026-04-08 13:41:49.171	\N	\N	\N	123	\N	\N	\N
cmnq3k9vc00a69gtkgm3hjvb2	124	GLOBALSYS SOLUCOES EMPRESARIAIS LTDA	GLOBALSYS SOLUCOES EM TI	09389871000113	CNPJ	1	MENSAL	ATIVA	GRUPO GLOBALSYS	2	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29010080	PC COSTA PEREIRA, 52	\N	\N	\N	VITORIA	ES	(27) 3062-2230	financeiro@globalsys.com.br	\N	1	t	2026-04-08 13:41:49.176	2026-04-08 13:41:49.176	\N	\N	\N	124	\N	\N	\N
cmnq3k9vg00a99gtkpb6kjrcs	125	PONTUAL MEDIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	NEO HUB MEDICAMENTOS ESPECIAIS	44612586000200	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-04-03 03:00:00	\N	\N	\N	\N	\N	\N	Fiscal	29164252	RUA JOSE LUIZ DA ROCHA, 281	\N	\N	\N	SERRA	ES	(61) 3033-4040	financeiro@pontualmedic.com.br	\N	1	t	2026-04-08 13:41:49.181	2026-04-08 13:41:49.181	\N	\N	\N	125	\N	\N	\N
cmnq3k9vl00ac9gtknlwfpu8a	126	LMD PARTICIPACOES LTDA	LMD PARTICIPACOES	46080536000165	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2023-08-22 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29172643	RUA RAIMUNDO DE OLIVEIRA, S/N	\N	\N	\N	SERRA	ES	(27) 9849-3481	leomunhao@gmail.com	\N	1	t	2026-04-08 13:41:49.185	2026-04-08 13:41:49.185	\N	\N	\N	126	\N	\N	\N
cmnq3k9vp00af9gtkb5e8ctmi	127	N J W DUNFORD CONSULTORIA	DUNFORD	51888058000154	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	3	2023-08-21 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 9911-8692 / (0000) 0000-0000	njwdunford@gmail.com	\N	1	t	2026-04-08 13:41:49.189	2026-04-08 13:41:49.189	\N	\N	\N	127	\N	\N	\N
cmnq3k9vu00ai9gtkllbrb7i8	128	ZEGBOX INDUSTRIA E COMERCIO DE EMBALAGENS LTDA	\N	52945020000139	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2023-11-21 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168080	AVENIDA TALMA RODRIGUES RIBEIRO, S/N	\N	\N	\N	SERRA	ES	(27) 8182-0063 / (0000) 0000-0000	viniciusmbertolo@gmail.com	\N	1	t	2026-04-08 13:41:49.195	2026-04-08 13:41:49.195	\N	\N	\N	128	\N	\N	\N
cmnq3k9vz00al9gtkgiq4v5jk	129	FORMASET INDUSTRIAL LTDA	FORMASET INDUSTRIAL LTDA	35957760000176	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO FORMASET	INDICAÇÃO DE CLIENTE	2024-01-01 03:00:00	\N	<p>Vinicius Bertollo (amigo de Lucas Munhão)</p>	\N	\N	\N	\N	Contábil;Fiscal;Legalização;Trabalhista	29168089	AV TALMA RODRIGUES RIBEIRO	\N	\N	\N	SERRA (ES)	ES	3398-4100	financeiro@formaset.com.br,cristiano@formaset.com.br	\N	1	t	2026-04-08 13:41:49.199	2026-04-08 13:41:49.199	\N	\N	\N	129	\N	\N	\N
cmnq3k9w400ao9gtk25h2at23	130	TELAMBRADO INDUSTRIA E COMERCIO DE TELAS LTDA	\N	31487853000123	CNPJ	1	MENSAL	ATIVA	GRUPO TELAMBRADO	2	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29111165	RODOVIA CARLOS LINDENBERG, 1036	\N	\N	\N	VILA VELHA	ES	(27) 3326-2276	contato@telambrado.com.br	\N	1	t	2026-04-08 13:41:49.204	2026-04-08 13:41:49.204	\N	\N	\N	130	\N	\N	\N
cmnq3k9wa00ar9gtk6u3x4ypi	131	GLOBALSYS IT SERVICES LTDA	GLOBALSYS SOLUCOES EMPRESARIAIS	20357765000190	CNPJ	1	MENSAL	ATIVA	GRUPO GLOBALSYS	2	2024-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29010918	PRACA COSTA PEREIRA, 52	\N	\N	\N	VITORIA	ES	(27) 3062-2230	administrativo@globalsys.com.br	\N	1	t	2026-04-08 13:41:49.211	2026-04-08 13:41:49.211	\N	\N	\N	131	\N	\N	\N
cmnq3k9wf00au9gtkal5bjx61	132	MAXPARTNER OUTSOURCING E SERVICOS EM TECNOLOGIA DA INFORMACAO LTDA	\N	33902626000142	CNPJ	1	MENSAL	ATIVA	GRUPO GLOBALSYS	2	\N	2026-03-27 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29010918	PRACA COSTA PEREIRA, 52	\N	\N	\N	VITORIA	ES	(27) 3062-2230	adm@maxpartner.com.br	\N	1	t	2026-04-08 13:41:49.215	2026-04-08 13:41:49.215	\N	\N	\N	132	\N	\N	\N
cmnq3k9wj00ax9gtklutbbbqn	133	HOUSE027 INNOVATIVE TECHNOLOGY LTDA	\N	38711960000132	CNPJ	1	MENSAL	ATIVA	GRUPO GLOBALSYS	2	2024-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29010918	PC COSTA PEREIRA, 52	\N	\N	\N	VITORIA	ES	(27) 3062-2230	financeiro@globalsys.com.br	\N	1	t	2026-04-08 13:41:49.219	2026-04-08 13:41:49.219	\N	\N	\N	133	\N	\N	\N
cmnq3k9wo00b09gtkjgurtgkt	134	HQUIMICA EQUIPAMENTOS E PRODUTOS QUIMICOS LTDA	HIDROQUIMICA SOLUCOES AMBIENTAIS	05671199000101	CNPJ	1	MENSAL	ATIVA	GRUPO HQUIMICA E HIDROQUIMICA	2	2024-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161124	RUA Q, 303	\N	\N	\N	SERRA	ES	(27) 3328-2800 / (27) 3324-1561	hquimica@hquimica.com.br	\N	1	t	2026-04-08 13:41:49.224	2026-04-08 13:41:49.224	\N	\N	\N	134	\N	\N	\N
cmnq3k9wt00b39gtkbaugdwq3	135	HIDROQUIMICA TRATAMENTO DE AGUA LTDA	HIDROQUIMICA TRATAMENTO DE AGUA	03395868000126	CNPJ	1	MENSAL	ATIVA	GRUPO HQUIMICA E HIDROQUIMICA	2	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161124	RUA Q, 303	\N	\N	\N	SERRA	ES	(27) 3315-1599 / (27) 3315-1599	hquimica@hquimica.com.br	\N	1	t	2026-04-08 13:41:49.229	2026-04-08 13:41:49.229	\N	\N	\N	135	\N	\N	\N
cmnq3k9wx00b69gtkzwkc285q	136	SERRAFER SERRA FERRAMENTAS LTDA	SERRAFER	04223906000126	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2024-04-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164042	R SAO PEDRO, 157	\N	\N	\N	SERRA	ES	(27) 3089-6666	financeiro@serrafer.com.br	\N	1	t	2026-04-08 13:41:49.233	2026-04-08 13:41:49.233	\N	\N	\N	136	\N	\N	\N
cmnq3k9x100b99gtkefcn5kpj	137	K&K IDIOMAS LTDA	\N	50960727000199	CNPJ	7	MENSAL	ATIVA	GRUPO WIZARD	2	2024-02-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29146300	AVENIDA CAMPO GRANDE, 450	\N	\N	\N	CARIACICA	ES	(27) 9249-0607 / (0000) 0000-0000	kleber@wizardes.com.br	\N	1	t	2026-04-08 13:41:49.237	2026-04-08 13:41:49.237	\N	\N	\N	137	\N	\N	\N
cmnq3k9x600bc9gtkhnza339v	138	JERLAU TECNOLOGIA LTDA	\N	29080304000198	CNPJ	7	MENSAL	ATIVA	GRUPO FORMASET	2	2024-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168080	AVENIDA TALMA RODRIGUES RIBEIRO, SN	\N	\N	\N	SERRA	ES	(27) 3398-4100 / (27) 3066-6829	tadeu@formaset.com.br	\N	1	t	2026-04-08 13:41:49.242	2026-04-08 13:41:49.242	\N	\N	\N	138	\N	\N	\N
cmnq3k9xa00bf9gtkyxf805g0	139	BOX 027 VAREJO DIGITAL LTDA	BOX 027	41697567000227	CNPJ	2	MENSAL	ATIVA	GRUPO GLOBALSYS	7	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	COMPETENCIA	\N	\N	Contábil;Fiscal	29075140	AVENIDA JERONIMO VERVLOET, 345	\N	\N	\N	VITORIA	ES	(27) 3062-2230	willian.lovato@globalsys.com.br	\N	1	t	2026-04-08 13:41:49.247	2026-04-08 13:41:49.247	\N	\N	\N	139	\N	\N	\N
cmnq3k9xg00bi9gtk3198wnzi	140	BOX 027 VAREJO DIGITAL LTDA	\N	41697567000308	CNPJ	2	MENSAL	ATIVA	GRUPO GLOBALSYS	7	2024-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	COMPETENCIA	\N	\N	Contábil;Fiscal	29050400	RUA MANOEL FEU SUBTIL, 60	\N	\N	\N	VITORIA	ES	(27) 3062-2230	willian.lovato@globalsys.com.br	\N	1	t	2026-04-08 13:41:49.252	2026-04-08 13:41:49.252	\N	\N	\N	140	\N	\N	\N
cmnq3k9xl00bl9gtkz3fj2voc	141	PREST SERV EMPREENDIMENTOS E PARTICIPACOES LTDA	PREST SERV EMPREENDIMENTOS E PARTICIPACOES	55402354000154	CNPJ	1	MENSAL	ATIVA	GRUPO COMERCIAL CT 	2	2024-06-05 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29301085	AVENIDA NOSSA SENHORA DA CONSOLACAO, 332	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(27) 9885-0384	prestservempreendimentos@gmail.com	\N	1	t	2026-04-08 13:41:49.257	2026-04-08 13:41:49.257	\N	\N	\N	141	\N	\N	\N
cmnq3k9xq00bo9gtk67qnw7le	142	FINANCIAL CONTABILIDADE LTDA	\N	13604523000199	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2011-04-29 03:00:00	\N	\N	SIMPLES_NACIONAL	COMPETENCIA	\N	\N	Contábil;Fiscal	29056020	FORTUNATO RAMOS, 245, SALA: 1301 A 1305; - SANTA LUCIA	\N	\N	\N	VITORIA	ES	(27) 3337-1410 / (27) 3347-0246 / (27) 3337-1410	adm@financialnet.com.br	\N	1	t	2026-04-08 13:41:49.263	2026-04-08 13:41:49.263	\N	\N	\N	142	\N	\N	\N
cmnq3k9xv00br9gtkn9qx2jv5	143	SUPER RADIO DM LTDA	RADIO FM SUPER	01755011000144	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	1997-03-26 03:00:00	\N	\N	\N	COMPETENCIA	\N	\N	\N	29260000	PRESIDENTE VARGAS, 590, SL 304 CC WERNERSBACH - CENTRO	\N	\N	\N	DOMINGOS MARTINS	ES	(27) 3282-3323	mery.fmsuper@gmail.com	\N	1	t	2026-04-08 13:41:49.267	2026-04-08 13:41:49.267	\N	\N	\N	143	\N	\N	\N
cmnq3k9y000bu9gtkiv1jhbjk	144	H PASSOS LTDA	H PASSOS	55371144000146	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-06-03 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 9911-8698 / (0000) 0000-0000	hpianissolla@gmail.com	\N	1	t	2026-04-08 13:41:49.272	2026-04-08 13:41:49.272	\N	\N	\N	144	\N	\N	\N
cmnq3k9y500bx9gtksjp0jt5x	145	LINHARES EPI LTDA	GELDEN EPI	56158080000162	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-07-30 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29901130	AVENIDA PREFEITO SAMUEL BATISTA CRUZ, 104	\N	\N	\N	LINHARES	ES	(27) 3256-1217 / (0000) 0000-0000	thiago@gelden.com.br	\N	1	t	2026-04-08 13:41:49.277	2026-04-08 13:41:49.277	\N	\N	\N	145	\N	\N	\N
cmnq3k9y900c09gtkqfv9lc8x	146	RAIO SOLDAS INSPECOES S/S	RAIO SOLDAS	39785589000388	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	Trabalhista	29161250	PIRACEMA, 680, SALA A - JACUHY	\N	\N	\N	SERRA	ES	(27) 3322-6686	financeiro@raiosoldas.com.br	\N	1	t	2026-04-08 13:41:49.281	2026-04-08 13:41:49.281	\N	\N	\N	146	\N	\N	\N
cmnq3k9yd00c39gtk2o8enqe7	147	H.G. RAUPP COMERCIAL S.A	\N	00490732000530	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-07-17 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Fiscal	29164252	RUA JOSE LUIZ DA ROCHA, 281	\N	\N	\N	SERRA	ES	(41) 3093-3915	financeiro@hgraupp.com	\N	1	t	2026-04-08 13:41:49.286	2026-04-08 13:41:49.286	\N	\N	\N	147	\N	\N	\N
cmnq3k9yi00c69gtksph76t0q	148	OPUS IMPORTACAO E COMERCIO DE EQUIPAMENTOS PARA MINERACAO LTDA	OPUS - SOLUCOES DIAMANTADAS	33672362000269	CNPJ	2	MENSAL	ATIVA	GRUPO OPUS	\N	2024-07-10 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Trabalhista	30550110	RUA CARMELITA PRATES DA SILVA, 511	\N	\N	\N	BELO HORIZONTE	MG	(27) 3533-9007 / (27) 9277-1301	administrativo@opusdiamantados.com.br	\N	1	t	2026-04-08 13:41:49.29	2026-04-08 13:41:49.29	\N	\N	\N	148	\N	\N	\N
cmnq3k9ym00c99gtk7rtygmkn	149	JULIA MUNHAO LTDA	JULIA MUNHAO	56938284000116	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2024-08-20 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 8111-1376 / (0000) 0000-0000	juliabmunhao@gmail.com	\N	1	t	2026-04-08 13:41:49.295	2026-04-08 13:41:49.295	\N	\N	\N	149	\N	\N	\N
cmnq3k9yq00cc9gtks9jpxoxe	150	ILHA DAS FERRAMENTAS COMERCIO VAREJISTA LTDA	ILHA DAS FERRAMENTAS	41424561000103	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2024-08-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Legalização;Trabalhista	29101720	RUA PITANGUEIRA	\N	\N	\N	VILA VELHA (ES)	ES	98112-7413	comineliguilherme@gmail.com	\N	1	t	2026-04-08 13:41:49.299	2026-04-08 13:41:49.299	\N	\N	\N	150	\N	\N	\N
cmnq3k9yw00cf9gtkzodqh1mv	151	LOGFLOW LTDA	LOGFLOW E-COMMERCE	34232956000300	CNPJ	2	MENSAL	ATIVA	GRUPO DH HOME	\N	2024-09-12 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Trabalhista	03032030	RUA CARNOT, 654	\N	\N	\N	SAO PAULO	SP	(11) 7852-0234	estefania@genesecontabil.com.br	\N	1	t	2026-04-08 13:41:49.305	2026-04-08 13:41:49.305	\N	\N	\N	151	\N	\N	\N
cmnq3k9z100ci9gtknht5i9bb	152	COLABORAR COMERCIO DE PRODUTOS ELETRONICOS LTDA	\N	08758638000289	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	6	2025-03-20 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal;Trabalhista	29161414	AVENIDA SETECENTOS, 76	\N	\N	\N	SERRA	ES	(11) 4085-2100	administrativo@colaborar.com.br	\N	1	t	2026-04-08 13:41:49.309	2026-04-08 13:41:49.309	\N	\N	\N	152	\N	\N	\N
cmnq3k9z500cl9gtkqnhysbdb	153	TELABRASIL INDUSTRIA E COMERCIO LTDA	TELABRASIL	21572757000120	CNPJ	1	MENSAL	ATIVA	GRUPO TELAMBRADO	2	2024-10-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29111160	AVENIDA PRIMEIRA AVENIDA, 1371	\N	\N	\N	VILA VELHA	ES	(27) 3246-8910 / (27) 3246-8911 / (27) 3246-8911	contato@telambrado.com.br	\N	1	t	2026-04-08 13:41:49.314	2026-04-08 13:41:49.314	\N	\N	\N	153	\N	\N	\N
cmnq3k9za00co9gtkwqdr9d1p	154	VIX LONAS LTDA	ARMAZEM DO TOLDEIRO	61215139000147	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2025-06-09 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29168707	AVENIDA DISTRITO FEDERAL, S/N	\N	\N	\N	SERRA	ES	(27) 3281-7007 / (0000) 0000-0000	financeiro@a3toldosecoberturas.com.br	\N	1	t	2026-04-08 13:41:49.318	2026-04-08 13:41:49.318	\N	\N	\N	154	\N	\N	\N
cmnq3k9ze00cr9gtk6zumliku	155	DRAGON ALVES ENGENHARIA LTDA	\N	57887103000132	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-10-29 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 2104-8308 / (0000) 0000-0000	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:49.323	2026-04-08 13:41:49.323	\N	\N	\N	155	\N	\N	\N
cmnq3k9zj00cu9gtklgjs7okw	156	METALTELAS INDUSTRIA LTDA	METALTELAS	13841087000171	CNPJ	1	MENSAL	ATIVA	GRUPO TELAMBRADO	3	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29111160	AV PRIMEIRA AVENIDA, 450	\N	\N	\N	VILA VELHA	ES	(27) 3289-4364	contato@telambrado.com.br	\N	1	t	2026-04-08 13:41:49.328	2026-04-08 13:41:49.328	\N	\N	\N	156	\N	\N	\N
cmnq3k9zo00cx9gtkrn30cpfa	157	ZENA LRF TRADING LTDA	\N	59580750000122	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2025-02-20 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29168085	RUA 6 B, 80	\N	\N	\N	SERRA	ES	(11) 8102-9092 / (0000) 0000-0000	rafael@fontani.co	\N	1	t	2026-04-08 13:41:49.332	2026-04-08 13:41:49.332	\N	\N	\N	157	\N	\N	\N
cmnq3k9zt00d09gtkx81p2hmf	158	BRILUZ.ON COMERCIO LTDA	BRILUZ.ON	55675547000189	CNPJ	1	MENSAL	ATIVA	GRUPO BRILUZ.ON	6	2025-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	24933585	RUA GEORGILEI RODRIGUES, 1681	\N	\N	\N	MARICA	RJ	(21) 9647-7427	priregiscontabilidade@gmail.com	\N	1	t	2026-04-08 13:41:49.337	2026-04-08 13:41:49.337	\N	\N	\N	158	\N	\N	\N
cmnq3k9zx00d39gtkkblg8xxa	159	PRIMETEK LTDA	PRIMETEK	59000165000106	CNPJ	1	MENSAL	ATIVA	GRUPO PRIMETEK 	2	2025-01-21 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168345	AVENIDA PORTO CANOA, S/N	\N	\N	\N	SERRA	ES	(62) 3095-6985 / (0000) 0000-0000	contabilidade@primetek.com.br	\N	1	t	2026-04-08 13:41:49.341	2026-04-08 13:41:49.341	\N	\N	\N	159	\N	\N	\N
cmnq3ka0200d69gtk5f76esn4	160	CUSTOM BOX LTDA	\N	30064795000324	CNPJ	2	MENSAL	ATIVA	GRUPO CUSTOM BOX	\N	2024-11-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29102020	RODOVIA DO SOL, 27	\N	\N	\N	VILA VELHA	ES	(27) 9812-4348	adm@custombox.com.br	\N	1	t	2026-04-08 13:41:49.346	2026-04-08 13:41:49.346	\N	\N	\N	160	\N	\N	\N
cmnq3ka0600d99gtkho0625sw	161	FOKUS BRASIL SINALIZACAO VIARIA LTDA	\N	05534501000252	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-12-18 03:00:00	\N	\N	\N	\N	\N	\N	Fiscal	29168085	RUA 6 B, 80	\N	\N	\N	SERRA	ES	(11) 4707-3777	marcio.dale@daleassociados.com.br	\N	1	t	2026-04-08 13:41:49.351	2026-04-08 13:41:49.351	\N	\N	\N	161	\N	\N	\N
cmnq3kcjl01ui9gtk2lkwi9ba	800	MEDSEMPRE GESTAO DE BENEFICIOS LTDA	\N	28620198000134	CNPJ	8	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.642	2026-04-08 13:41:52.642	\N	\N	\N	830	\N	\N	\N
cmnq3ka0c00dc9gtki9cywl3l	162	LUCIENE TECIDOS E CONFECCOES LTDA	\N	10999030000107	CNPJ	1	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	2	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165390	AVENIDA SEGUNDA AVENIDA, 485	\N	\N	\N	SERRA	ES	(27) 3064-0161	guina.vargas@hotmail.com	\N	1	t	2026-04-08 13:41:49.356	2026-04-08 13:41:49.356	\N	\N	\N	162	\N	\N	\N
cmnq3ka0i00df9gtkffyne66z	163	INTERATELL INTEGRACOES E TELECOMUNICACOES LTDA	\N	03969530000211	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	2	2025-11-01 03:00:00	\N	\N	\N	\N	\N	\N	Fiscal	29175706	RUA PORTO ALEGRE, 307	\N	\N	\N	SERRA	ES	(11) 3303-3300	financeiro@interatell.com.br	\N	1	t	2026-04-08 13:41:49.363	2026-04-08 13:41:49.363	\N	\N	\N	163	\N	\N	\N
cmnq3ka0n00di9gtksbf63978	164	FULL SOLUTIONS COMERCIO EQUIPAMENTOS INDUSTRIAIS LTDA	FULL SOLUTIONS EQUIPAMENTOS LTDA	33249391000131	CNPJ	1	MENSAL	ATIVA	GRUPO FULL SOLUTIONS	6	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29168085	RUA 6 B, 80	\N	\N	\N	SERRA	ES	(21) 4042-6595 / (21) 3269-1126 / (21) 4042-6595	contato@fullsolutionsequip.com	\N	1	t	2026-04-08 13:41:49.367	2026-04-08 13:41:49.367	\N	\N	\N	164	\N	\N	\N
cmnq3ka0r00dl9gtkbch4m0ym	165	OURO PRETO EXPLOSIVOS LTDA	OPEX SERVICOS E MINERACAO	02184341000270	CNPJ	1	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	3	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29325000	PTE LOCALIDADE PONTE DE DUAS BARRAS X ITAOCA, SN	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(28) 3539-1526/ (28) 3539-1357	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.372	2026-04-08 13:41:49.372	\N	\N	\N	165	\N	\N	\N
cmnq3ka0w00do9gtk2igt0n9f	166	TELAMBRADO INDUSTRIA E COMERCIO DE TELAS LTDA	TELAMBRADO	31487853000395	CNPJ	2	MENSAL	ATIVA	GRUPO TELAMBRADO	3	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29111180	RUA MONTE CARLO, 160	\N	\N	\N	VILA VELHA	ES	(27) 9923-9298	contato@telambrado.com.br	\N	1	t	2026-04-08 13:41:49.377	2026-04-08 13:41:49.377	\N	\N	\N	166	\N	\N	\N
cmnq3ka1200dr9gtkyo3rjywb	167	ZENITH GESTAO EMPRESARIAL LTDA	\N	59267356000139	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2025-02-04 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29090130	RUA RUY PINTO BANDEIRA, 342	\N	\N	\N	VITORIA	ES	(27) 9277-1301 / (0000) 0000-0000	zenith.gestao@gmail.com	\N	1	t	2026-04-08 13:41:49.383	2026-04-08 13:41:49.383	\N	\N	\N	167	\N	\N	\N
cmnq3ka1700du9gtkogvdmnyv	168	BRIZZ BAR LTDA	\N	58458127000139	CNPJ	1	MENSAL	ATIVA	GRUPO BRIZZ VIX	2	2024-12-13 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29050360	RUA JUDITH MARIA TOVAR VAREJÃO, 411	\N	\N	\N	VITORIA	ES	(27) 9901-9492 / (0000) 0000-0000	brizzvix@gmail.com	\N	1	t	2026-04-08 13:41:49.387	2026-04-08 13:41:49.387	\N	\N	\N	168	\N	\N	\N
cmnq3ka1c00dx9gtke0a7f4qb	169	FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA	FULL SERVICE ECON COMERCIO E LOGISTICA LTDA	33247450000647	CNPJ	2	MENSAL	ATIVA	GRUPO GSHIELD	3	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	03050000	RUA GOMES CARDIM, 521	\N	\N	\N	SAO PAULO	SP	(31) 9168-8340	contabil@gorilashield.com.br	\N	1	t	2026-04-08 13:41:49.392	2026-04-08 13:41:49.392	\N	\N	\N	169	\N	\N	\N
cmnq3ka1i00e09gtkyy62ueej	170	FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA	FULL SERVICE ECOM	33247450000132	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	2025-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	30150190	MUCURI, 255 - FLORESTA	\N	\N	\N	BELO HORIZONTE	MG	(31) 9910-4981	contabil@gorilashield.com.br	\N	1	t	2026-04-08 13:41:49.398	2026-04-08 13:41:49.398	\N	\N	\N	170	\N	\N	\N
cmnq3ka1n00e39gtkvwimrqpx	171	FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA	FULL SERVICE ECOM	33247450000302	CNPJ	2	MENSAL	ATIVA	GRUPO GSHIELD	3	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161389	AVENIDA OITOCENTOS, SN	\N	\N	\N	SERRA	ES	(27) 9514-1925	contato@gorilashield.com.br	\N	1	t	2026-04-08 13:41:49.403	2026-04-08 13:41:49.403	\N	\N	\N	171	\N	\N	\N
cmnq3ka1r00e69gtkkgnxguet	172	FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA	FULL SERVICE ECOM	33247450000213	CNPJ	2	MENSAL	ATIVA	GRUPO GSHIELD	\N	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161389	AV OITOCENTOS, SN	\N	\N	\N	SERRA	ES	(27) 9514-1925	contato@gorilashield.com.br	\N	1	t	2026-04-08 13:41:49.408	2026-04-08 13:41:49.408	\N	\N	\N	172	\N	\N	\N
cmnq3ka1x00e99gtkhvb9ddvs	173	DOCE DOCE COMO MEL SORVETES LTDA	\N	47420673000164	CNPJ	1	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	3	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29043405	AV CORONEL JOSÉ MARTINS DE FIGUEIREDO, 1085	\N	\N	\N	VITORIA	ES	(27) 9773-7005/ (0000) 0000-0000	guina.vargas@gmail.com	\N	1	t	2026-04-08 13:41:49.413	2026-04-08 13:41:49.413	\N	\N	\N	173	\N	\N	\N
cmnq3ka2200ec9gtkqiz5xx3k	174	G DISTRIBUICAO E COMERCIO DE PRODUTOS LTDA	G DISTRIBUICAO	39336716000108	CNPJ	1	MENSAL	ATIVA	GRUPO GSHIELD	7	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161389	AV OITOCENTOS, SN	\N	\N	\N	SERRA	ES	(31) 9910-4981	gdistribuidora10@gmail.com	\N	1	t	2026-04-08 13:41:49.418	2026-04-08 13:41:49.418	\N	\N	\N	174	\N	\N	\N
cmnq3ka2600ef9gtkdzcmv4iy	175	G DISTRIBUICAO E COMERCIO DE PRODUTOS LTDA	\N	39336716000280	CNPJ	2	MENSAL	ATIVA	GRUPO GSHIELD	3	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161389	AVENIDA OITOCENTOS, SN	\N	\N	\N	SERRA	ES	(31) 9123-9728 / (31) 9910-4981	gdistribuidora10@gmail.com	\N	1	t	2026-04-08 13:41:49.423	2026-04-08 13:41:49.423	\N	\N	\N	175	\N	\N	\N
cmnq3ka2c00ei9gtkkjvhpuh0	176	G DISTRIBUICAO E COMERCIO DE PRODUTOS LTDA	\N	39336716000361	CNPJ	2	MENSAL	ATIVA	GRUPO GSHIELD	7	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	03050000	RUA GOMES CARDIM, 521	\N	\N	\N	SAO PAULO	SP	(31) 9910-4981	gdistribuidora10@gmail.com	\N	1	t	2026-04-08 13:41:49.429	2026-04-08 13:41:49.429	\N	\N	\N	176	\N	\N	\N
cmnq3ka2i00el9gtklzhbjw8u	177	JR ATACADO DE ACESSORIOS LTDA	ATACADO DE ACESSORIOS	49994344000152	CNPJ	1	MENSAL	ATIVA	GRUPO GSHIELD	7	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29161389	AVENIDA OITOCENTOS, SN	\N	\N	\N	SERRA	ES	(31) 9123-9728 / (0000) 0000-0000	frederico@gorilashield.com.br	\N	1	t	2026-04-08 13:41:49.434	2026-04-08 13:41:49.434	\N	\N	\N	177	\N	\N	\N
cmnq3ka2m00eo9gtkfc6qoay1	178	FRANCA COMERCIO DE TECIDOS E CONFECCOES LTDA	LUCIENE TECIDOS	16858996000100	CNPJ	1	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	3	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29010004	AVENIDA JERONIMO MONTEIRO, 846	\N	\N	\N	VITORIA	ES	(27) 3024-0806 / (27) 3722-4657	guina.vargas@hotmail.com	\N	1	t	2026-04-08 13:41:49.439	2026-04-08 13:41:49.439	\N	\N	\N	178	\N	\N	\N
cmnq3ka2s00er9gtkgjm9ixtx	179	FRANCA COMERCIO DE TECIDOS E CONFECCOES LTDA	CENTRAL DOS TECIDOS	16858996000291	CNPJ	2	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	3	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29010240	AVENIDA PRESIDENTE FLORENTINO AVIDOS, 411	\N	\N	\N	VITORIA	ES	(27) 3024-0806	guina.vargas@gmail.com	\N	1	t	2026-04-08 13:41:49.444	2026-04-08 13:41:49.444	\N	\N	\N	179	\N	\N	\N
cmnq3ka2x00eu9gtk6l7dhmfo	180	FAZENDA BOA SORTE COMERCIO DE TECIDOS LTDA	LUCIENE TECIDOS	35112700000152	CNPJ	1	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	3	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29146470	RUA VICENTE SANTORIO FANTINI, 235	\N	\N	\N	CARIACICA	ES	(27) 9636-1514	guina.vargas@hotmail.com	\N	1	t	2026-04-08 13:41:49.449	2026-04-08 13:41:49.449	\N	\N	\N	180	\N	\N	\N
cmnq3ka3100ex9gtksay8e9rj	181	LUIGI SERRA DOURADA 2 LTDA	MESTRE ALVARO SORVETES E GELADOS	50485794000107	CNPJ	1	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	3	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29171237	AVENIDA BRASÍLIA, 67	\N	\N	\N	SERRA	ES	(27) 9773-7005 / (0000) 0000-0000	guina.vargas@hotmail.com	\N	1	t	2026-04-08 13:41:49.453	2026-04-08 13:41:49.453	\N	\N	\N	181	\N	\N	\N
cmnq3ka3500f09gtkyau7v3me	182	LECAPE COMERCIO DE TECIDOS E CONFECCOES LTDA	LUCIENE TECIDOS	18715515000133	CNPJ	1	MENSAL	ATIVA	GRUPO LUCIENE TECIDOS 	3	2025-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29043405	AVENIDA CORONEL JOSE MARTINS DE FIGUEIREDO, 1085	\N	\N	\N	VITORIA	ES	(27) 3024-0806 / (27) 3024-0806	guina.vargas@hotmail.com	\N	1	t	2026-04-08 13:41:49.458	2026-04-08 13:41:49.458	\N	\N	\N	182	\N	\N	\N
cmnq3ka3c00f39gtk5x65xcj7	183	OURO PRETO EXPLOSIVOS LTDA	\N	02184341000432	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29815000	CORREGO PAULISTA, SN	\N	\N	\N	BARRA DE SAO FRANCISCO	ES	(28) 3539-1526 / (28) 3539-1357 / (28) 3539-1208	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.464	2026-04-08 13:41:49.464	\N	\N	\N	183	\N	\N	\N
cmnq3ka6q00h39gtknhmqcedh	207	OPT OPERACOES TELECOM LTDA	OPT OPERACOES TELECOM	17333994000160	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29164030	RUA CASTELO, 747	\N	\N	\N	SERRA	ES	(27) 2233-8181	financeiro@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:49.586	2026-04-08 13:41:49.586	\N	\N	\N	207	\N	\N	\N
cmnq3ka3h00f69gtkqqztboj2	184	OURO PRETO EXPLOSIVOS LTDA	OURO PRETO SERVICO E MINERACAO	02184341000866	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	56260000	SITIO SITIO BAIXA FRIA 14,5 IPUBI RURAL, SN	\N	\N	\N	IPUBI	PE	(28) 3539-1526 / (28) 3839-1357 / (28) 3539-1526	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.469	2026-04-08 13:41:49.469	\N	\N	\N	184	\N	\N	\N
cmnq3ka3l00f99gtku9lz76n1	185	OURO PRETO EXPLOSIVOS LTDA	\N	02184341001080	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	58326000	FAZENDA SANTA LUZIA, SN	\N	\N	\N	CAAPORA	PB	(28) 3539-1357 / (28) 3539-1525 / (28) 3539-1357	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.473	2026-04-08 13:41:49.473	\N	\N	\N	185	\N	\N	\N
cmnq3ka3q00fc9gtkieneves1	186	OURO PRETO EXPLOSIVOS LTDA	OPEX SERVICOS E MINERACAO	02184341001161	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	62900000	SITIO MELANCIAS, SN	\N	\N	\N	RUSSAS	CE	(28) 3539-1526 / (28) 3539-1357	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.479	2026-04-08 13:41:49.479	\N	\N	\N	186	\N	\N	\N
cmnq3ka3w00ff9gtknwyjzkki	187	OURO PRETO EXPLOSIVOS LTDA	\N	02184341001242	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	44110000	RODOVIA SANTOS DUMOND, S/N	\N	\N	\N	FEIRA DE SANTANA	BA	(28) 3539-1526 / (28) 3539-1357	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.484	2026-04-08 13:41:49.484	\N	\N	\N	187	\N	\N	\N
cmnq3ka4000fi9gtkxguzej61	188	OURO PRETO EXPLOSIVOS LTDA	\N	02184341001323	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	44150000	FAZENDA JUAZEIRO GRANDE, S/N	\N	\N	\N	SANTA BARBARA	BA	(28) 3539-1526 / (28) 3539-1357	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.488	2026-04-08 13:41:49.488	\N	\N	\N	188	\N	\N	\N
cmnq3ka4500fl9gtk8gurszby	189	OURO PRETO EXPLOSIVOS LTDA	OPEX SERVICOS E MINERACAO	02184341001404	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	68190000	RODOVIA TRANSAMAZONICA, S/N	\N	\N	\N	ITAITUBA	PA	(28) 3539-1526	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.493	2026-04-08 13:41:49.493	\N	\N	\N	189	\N	\N	\N
cmnq3ka4a00fo9gtkmfqrb3sh	190	OURO PRETO EXPLOSIVOS LTDA	OURO PRETO EXPLOSIVOS	02184341001595	CNPJ	2	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	25935310	RUA E, 135	\N	\N	\N	MAGE	RJ	(21) 9957-2475	comercial@opexltda.com	\N	1	t	2026-04-08 13:41:49.499	2026-04-08 13:41:49.499	\N	\N	\N	190	\N	\N	\N
cmnq3ka4f00fr9gtkto5tz8z0	191	OPEX TRANSPORTES LTDA	\N	13792474000165	CNPJ	1	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	7	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29306460	R ARY LIMA, 09	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(28) 9907-2468	gabibragaa@hotmail.com	\N	1	t	2026-04-08 13:41:49.503	2026-04-08 13:41:49.503	\N	\N	\N	191	\N	\N	\N
cmnq3ka4j00fu9gtklhnjlrow	192	ARAUCARIA SERVICOS LTDA	ARAUCARIA SERVICOS	42532281000173	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO OPEX (OURO PRETO EXPLOSIVOS)	\N	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29306460	RUA ARY LIMA, 09 - INDEPENDENCIA - ANDAR TERCEIRO	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	(28) 9907-2468	gabibragaa@hotmail.com	\N	1	t	2026-04-08 13:41:49.507	2026-04-08 13:41:49.507	\N	\N	\N	192	\N	\N	\N
cmnq3ka4q00fx9gtkv46t8ved	193	FULL SOLUTIONS COMERCIO EQUIPAMENTOS INDUSTRIAIS LTDA	\N	33249391000212	CNPJ	2	MENSAL	ATIVA	GRUPO FULL SOLUTIONS	6	2025-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Trabalhista	22410001	RUA VISCONDE DE PIRAJA, 00142	\N	\N	\N	RIO DE JANEIRO	RJ	(21) 3269-1126	fullsolutions@fullsolutionsequip.com	\N	1	t	2026-04-08 13:41:49.515	2026-04-08 13:41:49.515	\N	\N	\N	193	\N	\N	\N
cmnq3ka4w00g09gtk831qjra2	194	FULL SOLUTIONS COMERCIO EQUIPAMENTOS INDUSTRIAIS LTDA	\N	33249391000301	CNPJ	2	MENSAL	ATIVA	GRUPO FULL SOLUTIONS	6	2025-02-19 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168085	RUA 6 B, 80	\N	\N	\N	SERRA	ES	(21) 4042-6595 / (21) 3269-1126	contato@fullsolutionsequip.com	\N	1	t	2026-04-08 13:41:49.52	2026-04-08 13:41:49.52	\N	\N	\N	194	\N	\N	\N
cmnq3ka5100g39gtkz5y3kqa6	195	ELETRO MAQUINAS ATACADISTA LTDA	ELETRO MAQUINAS	37092170000234	CNPJ	2	MENSAL	ATIVA	GRUPO ELETRO MAQUINAS	2	2024-12-11 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Trabalhista	23810460	RUA EVELYN CIUFFO CICARINO ROCHA, 0	\N	\N	\N	ITAGUAI	RJ	(27) 2688-2496	financeirorj@emf-rj.com.br	\N	1	t	2026-04-08 13:41:49.525	2026-04-08 13:41:49.525	\N	\N	\N	195	\N	\N	\N
cmnq3ka5700g69gtkv9o8loso	196	ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA	\N	07550459000612	CNPJ	2	MENSAL	ATIVA	GRUPO ORIONES	2	2024-12-05 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	28020010	AVENIDA PRESIDENTE KENNEDY, 35	\N	\N	\N	CAMPOS DOS GOYTACAZES	RJ	(27) 3089-3888	sac@otimaatacado.com.br	\N	1	t	2026-04-08 13:41:49.532	2026-04-08 13:41:49.532	\N	\N	\N	196	\N	\N	\N
cmnq3ka5c00g99gtkn4efi59s	197	BRILUZ.ON COMERCIO LTDA	BRILUZ.ON	55675547000260	CNPJ	2	MENSAL	ATIVA	GRUPO BRILUZ.ON	\N	2025-01-10 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29164140	ES-010, 2594, KM 2.60 QUADRACHA LOTE 343 SALA B30 - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	(27) 9647-7427	priregiscontabilidade@gmail.com	\N	1	t	2026-04-08 13:41:49.536	2026-04-08 13:41:49.536	\N	\N	\N	197	\N	\N	\N
cmnq3ka5h00gc9gtk89z6w2vd	198	MAQUIL MAQUINAS E FERRAMENTAS LTDA	MAQUIL MAQUINAS E EQUIPAMENTOS	01561647000155	CNPJ	1	MENSAL	ATIVA	GRUPO MAQUIL	2	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29145711	AVENIDA MARIO GURGEL, 4953	\N	\N	\N	CARIACICA	ES	(27) 3343-5700 / (27) 3336-1016	luciana@maquil.com.br	\N	1	t	2026-04-08 13:41:49.541	2026-04-08 13:41:49.541	\N	\N	\N	198	\N	\N	\N
cmnq3ka5n00gf9gtk8hmv1ie2	199	LETFER MAQUINAS E FERRAMENTAS LTDA	\N	48093989000151	CNPJ	7	MENSAL	ATIVA	GRUPO MAQUIL	2	2025-01-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29145711	AVENIDA MÁRIO GURGEL, 5011	\N	\N	\N	CARIACICA	ES	(27) 9755-1385 / (0000) 0000-0000	luciana@maquil.com.br	\N	1	t	2026-04-08 13:41:49.547	2026-04-08 13:41:49.547	\N	\N	\N	199	\N	\N	\N
cmnq3ka5r00gi9gtkmcpij272	200	PRIMETEK LTDA	\N	59000165000297	CNPJ	2	MENSAL	ATIVA	GRUPO PRIMETEK 	\N	2025-01-22 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168345	PORTO CANOA, S/N, SALA 22 BOX MODULO 1 E 2 LOTE A3C2 - PORTO CANOA	\N	\N	\N	SERRA	ES	(62) 3095-6902	contabilidade@primetek.com.br	\N	1	t	2026-04-08 13:41:49.552	2026-04-08 13:41:49.552	\N	\N	\N	200	\N	\N	\N
cmnq3ka5w00gl9gtkufcw513q	201	OSI PARTICIPACOES LTDA	OSI PARTICIPACOES	05285270000100	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29175496	RUA FLORIANOPOLIS, 205	\N	\N	\N	SERRA	ES	(27) 3011-1090 / (21) 2643-2906	financeiro@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:49.556	2026-04-08 13:41:49.556	\N	\N	\N	201	\N	\N	\N
cmnq3ka6200go9gtkn4tge1wl	202	INTERPRIME TELECOMUNICACOES LTDA	INTERPRIME TELECOMUNICACOES LTDA ME	08988238000189	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	\N	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Fiscal	29102571	R SEBASTIAO SILVEIRA, 24	\N	\N	\N	VILA VELHA	ES	(27) 3223-9105	financeiro@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:49.562	2026-04-08 13:41:49.562	\N	\N	\N	202	\N	\N	\N
cmnq3ka6700gr9gtkbifmx2j4	203	LMS - LAST MILE SERVICES LTDA	LMS - LAST MILE SERVICES LTDA	11095146000184	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29175496	RUA FLORIANOPOLIS, 205	\N	\N	\N	SERRA	ES	(27) 9961-6380	financeiro@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:49.567	2026-04-08 13:41:49.567	\N	\N	\N	203	\N	\N	\N
cmnq3ka6b00gu9gtk5nuhesjv	204	MP INFORMATICA TELECOM LTDA	MP INFORMATICA TELECOM	07793479000100	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29177271	R CONGONHAS, 26	\N	\N	\N	SERRA	ES	(27) 3251-0492	financeiro@mpinformatica.net	\N	1	t	2026-04-08 13:41:49.572	2026-04-08 13:41:49.572	\N	\N	\N	204	\N	\N	\N
cmnq3ka6g00gx9gtkwzcoyxif	205	NUV REDE NEUTRA DE TELECOMUNICACOES LTDA	NUV BRASIL	15386439000171	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29160855	RUA FIORAVANTE CASSINI, 28	\N	\N	\N	SERRA	ES	(27) 2233-2274 / (27) 3025-1991	financeiro@grupoosi.com.br	\N	1	t	2026-04-08 13:41:49.577	2026-04-08 13:41:49.577	\N	\N	\N	205	\N	\N	\N
cmnq3ka6m00h09gtk09hnyfb2	206	ON SERVICOS DE INTERNET TELECON LTDA	ON TELECON	43556334000159	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29062140	HELIO SOARES, 40, LOJA 02 - PONTAL DE CAMBURI	\N	\N	\N	VITORIA	ES	(27) 2142-2411	jacksci@outlook.com	\N	1	t	2026-04-08 13:41:49.582	2026-04-08 13:41:49.582	\N	\N	\N	206	\N	\N	\N
cmnq3ka6u00h69gtkz2e0wsh0	208	VLA TELECOMUNICACOES LTDA	\N	09104418000113	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165680	AVENIDA ELDES SCHERRER SOUZA, 975	\N	\N	\N	SERRA	ES	(27) 2233-0002	financeiro@vlatelecom.com.br	\N	1	t	2026-04-08 13:41:49.591	2026-04-08 13:41:49.591	\N	\N	\N	208	\N	\N	\N
cmnq3ka7100h99gtkuvtfdujn	209	VOE TELECOMUNICACOES LTDA	VOE TELECOM	22542368000114	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29175496	FLORIANOPOLIS, 205, QUADRA50 MZNINOMEZANINO - PARQUE JACARAIPE	\N	\N	\N	SERRA	ES	(27) 9616-3809	aline.rocha@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:49.597	2026-04-08 13:41:49.597	\N	\N	\N	209	\N	\N	\N
cmnq3ka7600hc9gtk3luh4dfz	210	ZAD COMUNICA LTDA	ZAD	34263516000140	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29175496	RUA FLORIANOPOLIS, 205	\N	\N	\N	SERRA	ES	(27) 9616-3809 / (27) 3180-0853	aline.rocha@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:49.602	2026-04-08 13:41:49.602	\N	\N	\N	210	\N	\N	\N
cmnq3ka7a00hf9gtkdp4mtabd	211	SIFRA CONSULTORIA E REPRESENTACAO LTDA	SIFRA CONSULTORIA E REPRESENTACAO	13785672000100	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	0	2025-03-01 03:00:00	\N	\N	\N	\N	\N	\N	Fiscal	29167095	RUA MONTE HOREBE, SN	\N	\N	\N	SERRA	ES	(27) 3062-6230 / (27) 3215-5140	sifra.marcelo@gmail.com	\N	1	t	2026-04-08 13:41:49.607	2026-04-08 13:41:49.607	\N	\N	\N	211	\N	\N	\N
cmnq3ka7g00hi9gtkf8s0on0u	212	NY RESTAURANTES LTDA	NY RESTAURANTES	36082397000155	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29090210	JULIA LACOURT PENNA, 700, LOJA 1 LOJA 2 LOJA 3 - JARDIM CAMBURI	\N	\N	\N	VITORIA	ES	(27) 3080-1969	processo@metareal-es.com.br	\N	1	t	2026-04-08 13:41:49.612	2026-04-08 13:41:49.612	\N	\N	\N	212	\N	\N	\N
cmnq3ka7l00hl9gtkvfj51mjg	213	A G A P LTDA	BRAND2GO REGISTRO DE MARCAS	42081159000128	CNPJ	A DEFINIR	MENSAL	ATIVA	EMPRESA ÚNICA	INDICAÇÃO DE PARCEIRO	2025-04-01 03:00:00	\N	<p>Parceiro&nbsp;jurídicos da Central&nbsp;</p><p>A Drª Anna é amiga da Julia Munhão, filha de Rose.&nbsp;</p><p>Os serviços são em permuta.</p><p>Grupo Paris Guerzet Jurídico</p>	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29050460	AMERICO BUAIZ, 501, SALA 803 E 805 - ENSEADA DO SUA	\N	\N	\N	VITORIA	ES	(27) 9773-7081	ANNA.CGUERZET@GMAIL.COM	\N	1	t	2026-04-08 13:41:49.617	2026-04-08 13:41:49.617	\N	\N	\N	213	\N	\N	\N
cmnq3ka7p00ho9gtks8qhopuv	214	PARIS, GUERZET E AZEVEDO ADVOGADOS	\N	29236102000192	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2025-04-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29052120	AV JOAO BAPTISTA PARRA, 633	\N	\N	\N	VITORIA	ES	(27) 9773-7081	andrehparis@hotmail.com	\N	1	t	2026-04-08 13:41:49.622	2026-04-08 13:41:49.622	\N	\N	\N	214	\N	\N	\N
cmnq3ka7v00hr9gtki20y25ky	215	NY RESTAURANTES LTDA	\N	36082397000236	CNPJ	2	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	\N	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29167137	RUA ANJICO, 19	\N	\N	\N	SERRA	ES	(27) 3080-1969	enredobotequim@gmail.com	\N	1	t	2026-04-08 13:41:49.628	2026-04-08 13:41:49.628	\N	\N	\N	215	\N	\N	\N
cmnq3ka8100hu9gtkqx4rnghp	216	CENTRO VETERINARIO LUA & FREDDO LTDA	ANIMALLIS	21706378000185	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2025-04-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29055320	MADEIRA DE FREITAS, 90 - PRAIA DO CANTO	\N	\N	\N	VITORIA	ES	(27) 3024-2020 / (27) 3248-0020	admanimallis@gmail.com	\N	1	t	2026-04-08 13:41:49.633	2026-04-08 13:41:49.633	\N	\N	\N	216	\N	\N	\N
cmnq3ka8600hx9gtk99wrgd7p	217	LEVANTI MAQUINAS E FERRAMENTAS LTDA	LEVANTI MAQUINAS	35060827000175	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2025-08-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29075060	R ANTONIO LISBOA DO NASCIMENTO, 230	\N	\N	\N	VITORIA	ES	(27) 2180-0245	levanti@levantimaquinas.com.br	\N	1	t	2026-04-08 13:41:49.638	2026-04-08 13:41:49.638	\N	\N	\N	217	\N	\N	\N
cmnq3ka8b00i09gtkko2zh7jm	218	VITAVET-ES DISTRIBUIDORA LTDA	VITAVET-ES	62771089000147	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2025-09-17 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29111300	AVENIDA JOÃO FRANCISCO GONÇALVES, 100	\N	\N	\N	VILA VELHA	ES	(24) 9974-2626 / (0000) 0000-0000	adriana@vitavetrj.com.br	\N	1	t	2026-04-08 13:41:49.643	2026-04-08 13:41:49.643	\N	\N	\N	218	\N	\N	\N
cmnq3ka8g00i39gtk6v3i070c	219	EDLOC LOCACOES E COMERCIO LTDA	\N	31007558000556	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	6	2025-06-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	29167092	MONTE EVEREST, S/N, QUADRA8 LOTE 2 - COLINA DE LARANJEIRAS	\N	\N	\N	SERRA	ES	(31) 3826-6461	financeiro@edloc.com.br	\N	1	t	2026-04-08 13:41:49.649	2026-04-08 13:41:49.649	\N	\N	\N	219	\N	\N	\N
cmnq3ka8l00i69gtkhsbwixip	220	CEMA HOLDING E PARTICIPACOES LTDA	\N	58277834000129	CNPJ	7	MENSAL	ATIVA	GRUPO BELA VISTA	2	2025-07-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29090090	RUA DESEMBARGADOR EURÍPDES QUEIROZ DO VALLE, 660	\N	\N	\N	VITORIA	ES	(27) 9246-2230 / (0000) 0000-0000	impacto@impacto-es.com.br	\N	1	t	2026-04-08 13:41:49.653	2026-04-08 13:41:49.653	\N	\N	\N	220	\N	\N	\N
cmnq3ka8p00i99gtk389edw5i	221	FRATTA HOLDING E PARTICIPACOES LTDA	\N	58050244000169	CNPJ	7	MENSAL	ATIVA	GRUPO BELA VISTA	2	2025-07-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29090090	RUA DESEMBARGADOR EURÍPDES QUEIROZ DO VALLE, 660	\N	\N	\N	VITORIA	ES	(27) 9246-2230 / (0000) 0000-0000	impacto@impacto-es.com.br	\N	1	t	2026-04-08 13:41:49.657	2026-04-08 13:41:49.657	\N	\N	\N	221	\N	\N	\N
cmnq3ka8v00ic9gtkxcinaefk	222	HEBROM HOLDING E PARTICIPACOES LTDA	\N	59161203000102	CNPJ	7	MENSAL	ATIVA	GRUPO BELA VISTA	2	2025-07-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29090090	DESEMBARGADOR EURÍPDES QUEIROZ DO VALLE, 660, EDIF FENIX SALA 303 - JARDIM CAMBURI	\N	\N	\N	VITORIA	ES	(27) 9246-2230 / (0000) 0000-0000	impacto@impacto-es.com.br	\N	1	t	2026-04-08 13:41:49.663	2026-04-08 13:41:49.663	\N	\N	\N	222	\N	\N	\N
cmnq3ka8z00if9gtkxbep9q53	223	LIDERANCA HOLDING E PARTICIPACOES LTDA	\N	58071976000135	CNPJ	7	MENSAL	ATIVA	GRUPO BELA VISTA	2	2025-07-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29090090	RUA DESEMBARGADOR EURÍPDES QUEIROZ DO VALLE, 660	\N	\N	\N	VITORIA	ES	(27) 9246-2230 / (0000) 0000-0000	impacto@impacto-es.com.br	\N	1	t	2026-04-08 13:41:49.668	2026-04-08 13:41:49.668	\N	\N	\N	223	\N	\N	\N
cmnq3ka9400ii9gtkcqnybpf8	224	NUV REDE NEUTRA DE TELECOMUNICACOES LTDA	NUV BRASIL	15386439000252	CNPJ	2	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	2	2025-07-22 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29050565	R PROFESSOR ALMEIDA COUSIN, 125	\N	\N	\N	VITORIA	ES	(27) 2233-2274	financeiro@grupoosi.com.br	\N	1	t	2026-04-08 13:41:49.672	2026-04-08 13:41:49.672	\N	\N	\N	224	\N	\N	\N
cmnq3ka9900il9gtk523ze8x1	225	PRIMETEK LTDA	PRIMETEK	59000165000378	CNPJ	2	MENSAL	ATIVA	GRUPO PRIMETEK 	2	2025-07-31 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29168345	PORTO CANOA, S/N, LOTE A3C2 SALA 33 BOX MODULO 1 E 2 - PORTO CANOA	\N	\N	\N	SERRA	ES	(62) 3095-6985	contabilidade@primetek.com.br	\N	1	t	2026-04-08 13:41:49.677	2026-04-08 13:41:49.677	\N	\N	\N	225	\N	\N	\N
cmnq3ka9f00io9gtkw1jrirmc	226	CERDTECH DESENVOLVIMENTO LTDA	CERDTECH	63119645000168	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	3	2025-10-09 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29052280	RUA NEVES ARMOND, 210	\N	\N	\N	VITORIA	ES	(27) 2104-8300 / (0000) 0000-0000	pedro.hcerdeira@gmail.com	\N	1	t	2026-04-08 13:41:49.683	2026-04-08 13:41:49.683	\N	\N	\N	226	\N	\N	\N
cmnq3ka9l00ir9gtks53npe5m	227	CINCO ESTRELAS CONSTRUTORA E INCORPORADORA LTDA	\N	30686869000100	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2025-11-01 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	29056210	RUA DAS PALMEIRAS, 685	\N	\N	\N	VITORIA	ES	(27) 3089-9239	cincoestrelas@cincoestrelasconstrutora.com.br	\N	1	t	2026-04-08 13:41:49.689	2026-04-08 13:41:49.689	\N	\N	\N	227	\N	\N	\N
cmnq3ka9q00iu9gtk8uf1zjxh	228	FLORESTAL CONSULTORIA LTDA	VITORIA FLORESTAL	43093465000147	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2025-11-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29090410	JOSE CELSO CLAUDIO, 320 - JARDIM CAMBURI	\N	\N	\N	VITORIA	ES	(27) 9782-3382 / (27) 3337-3194	FINANCEIRO@VITORIAFLORESTAL.COM.BR	\N	1	t	2026-04-08 13:41:49.694	2026-04-08 13:41:49.694	\N	\N	\N	228	\N	\N	\N
cmnq3ka9w00ix9gtkm2t4gunm	229	CONSORCIO CONSERVA-VITORIA	CONSORCIO CONSERVA-VITORIA	48401933000117	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	2025-11-01 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	29056210	R DAS PALMEIRAS, 685	\N	\N	\N	VITORIA	ES	(27) 3089-9239/ (27) 3089-9228	cincoestrelas@cincoestrelasconstrutora.com.br	\N	1	t	2026-04-08 13:41:49.7	2026-04-08 13:41:49.7	\N	\N	\N	229	\N	\N	\N
cmnq3kan500ql9gtkk310gvp1	321	TENAX DO BRASIL LTDA	\N	03080722000191	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	2026-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.177	2026-04-08 13:41:50.177	\N	\N	\N	343	\N	\N	\N
cmnq3kaa100j09gtkj79fdfgp	230	FLORESTAL CONSULTORIA LTDA	VITORIA FLORESTAL	43093465000228	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	7	2025-11-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	57057330	RUA JOSE EZEQUIEL DA SILVA, 38	\N	\N	\N	MACEIO	AL	(27) 9782-3382 / (27) 3337-3194	financeiro@vitoriaflorestal.com.br	\N	1	t	2026-04-08 13:41:49.705	2026-04-08 13:41:49.705	\N	\N	\N	230	\N	\N	\N
cmnq3kaa600j39gtkfjuiv5ua	231	UP LOG SOLUCOES EM ARMAZENS E  LOGISTICA LTDA	\N	30691293000595	CNPJ	2	MENSAL	ATIVA	GRUPO UP LOG	1	2025-11-14 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29164252	JOSE LUIZ DA ROCHA, 281, QUADRACHA LOTE 249 SALA 01 - CAMARA	\N	\N	\N	SERRA	ES	(27) 3338-5287	marcelo.silva@grupouplog.com.br	\N	1	t	2026-04-08 13:41:49.711	2026-04-08 13:41:49.711	\N	\N	\N	231	\N	\N	\N
cmnq3kaac00j69gtkjpyjb9dc	232	JL INVESTIMENTOS E PARTICIPACOES LTDA	JL INVESTIMENTOS E PARTICIPACOES LTDA	63849438000169	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2025-11-27 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(21) 2104-8300 / (0000) 0000-0000	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:49.716	2026-04-08 13:41:49.716	\N	\N	\N	232	\N	\N	\N
cmnq3kaag00j99gtkw51b6mlx	233	GLEISON NUNES	\N	00000000000100	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 00000000	gleisonn@gmail.com	\N	1	t	2026-04-08 13:41:49.721	2026-04-08 13:41:49.721	\N	\N	\N	255	\N	\N	\N
cmnq3kaam00jc9gtkqqqpr7be	234	MINEXCO COMERCIO, IMPORTACAO E EXPORTACAO LTDA.	\N	00011512000234	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29168068	R 2 B - 270 - CIVIT II - ARMZ ENG LO 05 E 06	\N	\N	\N	SERRA	ES	(11) 2412-4422	sueli@minexco.com.br	\N	1	t	2026-04-08 13:41:49.726	2026-04-08 13:41:49.726	\N	\N	\N	256	\N	\N	\N
cmnq3kaas00jf9gtkem0xuwqw	235	MWA CONTABILIDADE E AUDITORIA LTDA - EPP	\N	00108414000139	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1122275353	gilberto@mwa.com.br	\N	1	t	2026-04-08 13:41:49.732	2026-04-08 13:41:49.732	\N	\N	\N	257	\N	\N	\N
cmnq3kaax00ji9gtkmj3gm5uj	236	NET SERVIÇOS DE COMUNICAÇÃO S/A	\N	00108786000165	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	01121113073	roberto.jung@orsitec-rnc.com.br	\N	1	t	2026-04-08 13:41:49.737	2026-04-08 13:41:49.737	\N	\N	\N	258	\N	\N	\N
cmnq3kab100jl9gtkgrxlp02t	237	TEBAS EQUIPAMENTOS INDUSTRIAIS E SERVIÇOS LTDA	\N	00183472000127	CNPJ	1	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	2019-05-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164153	Rua Francisco Sousa dos Santos - 456A - Jardim Limoeiro - SALA 23 E 24 QUADRACHA LOTE 74	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:49.742	2026-04-08 13:41:49.742	\N	\N	\N	259	\N	\N	\N
cmnq3kab800jo9gtkc59erntj	238	TEBAS EQUIPAMENTOS INDUSTRIAIS E SERVIÇOS LTDA	\N	00183472000208	CNPJ	2	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	95043581	Rua Professora Honorina Soares Dutra - 284 - São José - TERREOSALA 01	\N	\N	\N	Caxias do Sul	RS	\N	\N	\N	1	t	2026-04-08 13:41:49.748	2026-04-08 13:41:49.748	\N	\N	\N	260	\N	\N	\N
cmnq3kabc00jr9gtk7ts96lv9	239	TEBAS EQUIPAMENTOS INDUSTRIAIS E SERVIÇOS LTDA	\N	00183472000399	CNPJ	2	PARALIZADO	ATIVA	EMPRESA ÚNICA	2	2019-05-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29164153	Rua Francisco Sousa dos Santos - 456A - Jardim Limoeiro - SALA 23-A QUADRACHA LOTE 74	\N	\N	\N	Serra	ES	21 99949-6642	\N	\N	1	t	2026-04-08 13:41:49.753	2026-04-08 13:41:49.753	\N	\N	\N	261	\N	\N	\N
cmnq3kabh00ju9gtkb62suvpk	240	Teste 2	\N	00225000000154	CNPJ	2	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(23)4324-2423	wfasagsg@gap.copm	\N	1	t	2026-04-08 13:41:49.757	2026-04-08 13:41:49.757	\N	\N	\N	262	\N	\N	\N
cmnq3kabn00jx9gtkds5k34c8	241	GUIDONI	\N	00264528002383	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2020-01-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	29745000	RODOVIA GETHER LOPES DE FARIAS - S/N - ZONA RURAL	\N	\N	\N	São Domingos do Norte	ES	\N	\N	\N	1	t	2026-04-08 13:41:49.764	2026-04-08 13:41:49.764	\N	\N	\N	263	\N	\N	\N
cmnq3kabs00k09gtky2zrtysj	242	ROTEC EQUIPAMENTOS INDUSTRIAIS LTDA	\N	00277282000179	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3298 4444	roberto.castiglioni@rotec-es.com.br	\N	1	t	2026-04-08 13:41:49.768	2026-04-08 13:41:49.768	\N	\N	\N	264	\N	\N	\N
cmnq3kabx00k39gtkpknoii0n	243	COMERCIAL DE GAS MORAES LTDA	\N	00282999000109	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3341-6914	comercial.paivagas@gmail.com	\N	1	t	2026-04-08 13:41:49.773	2026-04-08 13:41:49.773	\N	\N	\N	265	\N	\N	\N
cmnq3kac200k69gtkve7afd2r	244	TELECOMUNICACÕES BRASILEIRAS SA TELEBRAS	\N	00336701000104	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	61 34269000	comercial@vector-rnc.com.br	\N	1	t	2026-04-08 13:41:49.779	2026-04-08 13:41:49.779	\N	\N	\N	266	\N	\N	\N
cmnq3kac700k99gtk94sdf2z6	245	VITORIA STONE INDUSTRIA E COMERCIO S/A	\N	00338678000189	CNPJ	1	MENSAL	ATIVA	GRUPO VITORIA STONE	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	R ATALYDES MOREIRA DE SOUZA - S/N - CIVIT I - LOTES 11/12	\N	\N	\N	SERRA	ES	\N	\N	\N	1	t	2026-04-08 13:41:49.784	2026-04-08 13:41:49.784	\N	\N	\N	267	\N	\N	\N
cmnq3kacc00kc9gtkyenftl9d	246	VITORIA STONE INDUSTRIA E COMERCIO S/A	\N	00338678000260	CNPJ	2	MENSAL	ATIVA	GRUPO VITORIA STONE	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	ROD ENGENHEIRO FABIANO VIVACQUA - 2436 - ALVARO TAVARES	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	\N	\N	\N	1	t	2026-04-08 13:41:49.788	2026-04-08 13:41:49.788	\N	\N	\N	268	\N	\N	\N
cmnq3kaci00kf9gtkse2j35l5	247	PETRA ENGENHARIA LTDA	\N	00364709000176	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	2018-08-02 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.794	2026-04-08 13:41:49.794	\N	\N	\N	269	\N	\N	\N
cmnq3kacn00ki9gtkxhb65q87	248	LELLO PRINT BRASIL COMERCIAL LTDA	\N	00382254000200	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168055	RUA ATALYDES MOREIRA DE SOUZA - 1472 - CIVIT I	\N	\N	\N	SERRA	ES	(27) 3858-9725	alexandre.zacharias@lelloprint.com.br	\N	1	t	2026-04-08 13:41:49.8	2026-04-08 13:41:49.8	\N	\N	\N	270	\N	\N	\N
cmnq3kacs00kl9gtk5ltyfs3y	249	EMBALI INDUSTRIAS PLASTICAS LTDA	\N	00412880000103	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29148635	R DAS HORTENCIAS - 3 - VILA INDEPENDENCIA	\N	\N	\N	CARIACICA	ES	(27) 4009-3800	joseane.pirola@embali.com.br	\N	1	t	2026-04-08 13:41:49.805	2026-04-08 13:41:49.805	\N	\N	\N	271	\N	\N	\N
cmnq3kacx00ko9gtkjw763pin	250	CINTYA IMPORTAÇÃO E EXPORTAÇÃO LTDA	\N	00412966000136	CNPJ	1	AVULSO	ATIVA	GRUPO CINTYA 	1	2018-02-19 03:00:00	\N	\N	\N	\N	\N	\N	\N	29164140	Rodovia ES-010 - 40 - Jardim Limoeiro	\N	\N	\N	Serra	ES	2732058383	jean.lacerda@grupocintya.com.br	\N	1	t	2026-04-08 13:41:49.81	2026-04-08 13:41:49.81	\N	\N	\N	272	\N	\N	\N
cmnq3kad300kr9gtk79xks1cm	251	CINTYA IMPORTACAO E EXPORTACAO LTDA	\N	00412966000217	CNPJ	2	AVULSO	ATIVA	GRUPO CINTYA 	2	\N	\N	\N	\N	\N	\N	\N	\N	29101350	R CONSTRUTOR SEBASTIAO SOARES DE SOUZA - 40 - PRAIA DA COSTA - SALA 404 E 405	\N	\N	\N	VILA VELHA	ES	(27) 3300-9000	societario@controltech.com.br	\N	1	t	2026-04-08 13:41:49.816	2026-04-08 13:41:49.816	\N	\N	\N	273	\N	\N	\N
cmnq3kad800ku9gtklsvhcgi3	252	CHAMA COMERCIO INSTALACOES E SERVICOS LTDA	\N	00599750000121	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Trabalhista	29101700	R DOUTOR JAIR ANDRADE - 98 - ITAPUA - PAVMTOTERREO LOJA 02	\N	\N	\N	Vila Velha	ES	(27) 3219-4349	contato@chamaaquecedores.com.br	\N	1	t	2026-04-08 13:41:49.82	2026-04-08 13:41:49.82	\N	\N	\N	274	\N	\N	\N
cmnq3kadd00kx9gtks2ixwou8	253	AMBITEC SOLUCOES AMBIENTAIS LTDA	\N	00679427000249	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(19) 3467-4800	b.campos@zaniniauditoria.com.br	\N	1	t	2026-04-08 13:41:49.825	2026-04-08 13:41:49.825	\N	\N	\N	275	\N	\N	\N
cmnq3kadj00l09gtk7q87oh1h	254	AMBITEC SOLUCOES AMBIENTAIS LTDA	\N	00679427000672	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(19) 3516-7115	b.campos@zaniniauditoria.com.br	\N	1	t	2026-04-08 13:41:49.832	2026-04-08 13:41:49.832	\N	\N	\N	276	\N	\N	\N
cmnq3kado00l39gtkph6hixor	255	AMBITEC S/A	\N	00679427000753	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	19 34674800	thiago.silva@grupoambipar.com.br	\N	1	t	2026-04-08 13:41:49.837	2026-04-08 13:41:49.837	\N	\N	\N	277	\N	\N	\N
cmnq3kadt00l69gtkl40q7yof	256	AUTO POSTO DA ILHA LTDA	\N	00690555000102	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29052110	AVENIDA LEITAO DA SILVA - 420 - PRAIA DO SUA	\N	\N	\N	VITORIA	ES	(27) 3134-7100 / (27) 3325-7177	expedicao05@tecnicontabil.com.br	\N	1	t	2026-04-08 13:41:49.841	2026-04-08 13:41:49.841	\N	\N	\N	278	\N	\N	\N
cmnq3kae000l99gtkwlt3jr0q	257	J R P ASSESSORIA DE INFORMATICA LTDA	\N	00763617000169	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS BA	1	2013-12-01 02:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	71 3270-5000	tais.mota@totvs.com.br	\N	1	t	2026-04-08 13:41:49.848	2026-04-08 13:41:49.848	\N	\N	\N	279	\N	\N	\N
cmnq3kae400lc9gtkqf8dqls6	258	POLICARD SYSTEMS E SERVICOS S/A	\N	00904951000195	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	34 3233-3467	bruno.rodrigues@upbrasil.com	\N	1	t	2026-04-08 13:41:49.853	2026-04-08 13:41:49.853	\N	\N	\N	280	\N	\N	\N
cmnq3kae900lf9gtkr2tyoxbx	259	LUCIANA MILANESI CONFECCOES DE ROUPAS LTDA	\N	00916698000190	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29060040	AV LUIZ MANOE VELLOZO - 415 - JARDIM DA PENHA	\N	\N	\N	VITORIA	ES	27 3225-0161	\N	\N	1	t	2026-04-08 13:41:49.857	2026-04-08 13:41:49.857	\N	\N	\N	281	\N	\N	\N
cmnq3kaef00li9gtk8e1moe22	260	ALVATEC INDUSTRIA E COMERCIO LTDA	\N	00993021000155	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	R 1B, S/N, LOTE 04, QUADRA 3 - CIVIT II	\N	\N	\N	Serra	ES	27 33981300	dcgv@alvatec.com.br, jggv@alvatec.com.br,  alvatec@alvatec.com.br	\N	1	t	2026-04-08 13:41:49.863	2026-04-08 13:41:49.863	\N	\N	\N	282	\N	\N	\N
cmnq3kaej00ll9gtkaa75b0nt	261	BRASIL SEAFOOD INDUSTRIA E COMERCIO DE ALIMENTOS LTDA	\N	01050703000197	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	4	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.868	2026-04-08 13:41:49.868	\N	\N	\N	283	\N	\N	\N
cmnq3kaeo00lo9gtkccjkb0ef	262	SEI SERVICOS ENGENHARIA E INTALAÇÕES LTDA	\N	01069382000172	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	equimaq@terra.com.br	\N	1	t	2026-04-08 13:41:49.872	2026-04-08 13:41:49.872	\N	\N	\N	284	\N	\N	\N
cmnq3kaet00lr9gtk7nmjfndc	263	UNIVERSO ONLINE SA	\N	01109184000195	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 30921709	desilva@uolinc.com	\N	1	t	2026-04-08 13:41:49.878	2026-04-08 13:41:49.878	\N	\N	\N	285	\N	\N	\N
cmnq3kaey00lu9gtkqnu0m3or	264	CAPIXABA PARTICIPACOES E SERVICOS LTDA	\N	01120141000100	CNPJ	1	MENSAL	ATIVA	GRUPO CAPIXABA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Trabalhista	29165130	AV CENTRAL - 1345 - LARANJEIRAS	\N	\N	\N	Serra	ES	27 3315-5955 27-99951-1627	c.nounis@hotmail.com, aliciap19b@gmail.com	\N	1	t	2026-04-08 13:41:49.883	2026-04-08 13:41:49.883	\N	\N	\N	286	\N	\N	\N
cmnq3kaf300lx9gtkp4zlvtmw	265	JOCELIA BARBARA SCARDUA NOLASCO FERREIRA - EPP	\N	01120814000122	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 3328-4001	\N	\N	1	t	2026-04-08 13:41:49.887	2026-04-08 13:41:49.887	\N	\N	\N	287	\N	\N	\N
cmnq3kaf700m09gtkir081fkv	266	JOCELIA BARBARA SCARDUA NOLASCO FERREIRA - EPP	\N	01120814000203	CNPJ	2	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 3341-1693	\N	\N	1	t	2026-04-08 13:41:49.892	2026-04-08 13:41:49.892	\N	\N	\N	288	\N	\N	\N
cmnq3kafd00m39gtk9kfsly0v	267	TIME NOW ENGENHARIA S/A	\N	01208413000129	CNPJ	1	AVULSO	ATIVA	GRUPO ATACADO SÃO PAULO	6	2020-01-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	29055643	Avenida Rio Branco - 1383 - Praia do Canto	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:49.898	2026-04-08 13:41:49.898	\N	\N	\N	289	\N	\N	\N
cmnq3kafi00m69gtkhrkribyx	268	SOUZA PASSOS SERVICOS E ASSESSORIA LTDA.	\N	01228341000181	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29185000	R MINAS GERAIS - 243 - PRAIA GRANDE - CASA	\N	\N	\N	FUNDAO	ES	(27) 3227-1475	\N	\N	1	t	2026-04-08 13:41:49.902	2026-04-08 13:41:49.902	\N	\N	\N	290	\N	\N	\N
cmnq3kafm00m99gtkosj21h8n	269	BRASIL TELECOMUNICACOES S/A	\N	01236881001855	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	7	2017-04-26 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.907	2026-04-08 13:41:49.907	\N	\N	\N	291	\N	\N	\N
cmnq3kaft00mc9gtk0yv3qnkw	270	BRASIL TELECOMUNICACOES S/A	\N	01236881001936	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	7	2017-04-26 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.914	2026-04-08 13:41:49.914	\N	\N	\N	292	\N	\N	\N
cmnq3kafy00mf9gtkboo4pxo5	271	BRASIL TELECOMUNICAÇÕES S/A	\N	01236881003807	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	7	2017-04-26 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.918	2026-04-08 13:41:49.918	\N	\N	\N	293	\N	\N	\N
cmnq3kag200mi9gtk433q9jwg	272	BILDEN TECNOLOGIA EM PROCESSOS CONSTRUTIVOS LTDA	\N	01266841001260	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	11 2171-8595	\N	\N	1	t	2026-04-08 13:41:49.923	2026-04-08 13:41:49.923	\N	\N	\N	294	\N	\N	\N
cmnq3kag900ml9gtktp7pffb2	273	HALLEN INSTALACOES DE EQUIPAMENTOS DE TELECOMUNICACOES LTDA	\N	01307399000110	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	maria.souza@hallen.com.br	\N	1	t	2026-04-08 13:41:49.929	2026-04-08 13:41:49.929	\N	\N	\N	295	\N	\N	\N
cmnq3kage00mo9gtkx1efbol7	274	COMERCIAL SHANGAY LTDA-ME	\N	01381103000101	CNPJ	1	MENSAL	ATIVA	GRUPO LUF	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29165130	Avenida Central - 1537 - Laranjeiras	\N	\N	\N	Serra	ES	(27)3328-6638	financeiro@comercialshangay.com.br	\N	1	t	2026-04-08 13:41:49.934	2026-04-08 13:41:49.934	\N	\N	\N	296	\N	\N	\N
cmnq3kagi00mr9gtkhb2nqptp	275	COMERCIAL SHANGAY LTDA ME	\N	01381103000292	CNPJ	2	MENSAL	ATIVA	GRUPO COMERCIAL LUF	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27)3328-6638	financeiro@comercialshangay.com.br	\N	1	t	2026-04-08 13:41:49.939	2026-04-08 13:41:49.939	\N	\N	\N	297	\N	\N	\N
cmnq3kagq00mu9gtkmfnlbkio	276	CENTRAL OFTALMICA COMERCIO INDUSTRIA E SERVICOS LTDA - EPP	\N	01452056000573	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	(27) 3025-7444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:49.946	2026-04-08 13:41:49.946	\N	\N	\N	298	\N	\N	\N
cmnq3kagv00mx9gtkcrx98po0	277	CENTRAL OFTALMICA COMERCIO INDUSTRIA E SERVICOS LTDA - EPP	\N	01452056000654	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	AV SETE DE SETEMBRO - 4214 - BATEL	\N	\N	\N	CURITBA	PR	(27) 3025-7444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:49.951	2026-04-08 13:41:49.951	\N	\N	\N	299	\N	\N	\N
cmnq3kah000n09gtk7rxk64n0	278	CENTRAL OFTALMICA COMERCIO INDUSTRIA E SERVICOS LTDA - EPP	\N	01452056000735	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	RUA MISAEL PEDREIRA DA SILVA - 98 - SANTA LUCIA	\N	\N	\N	VITORIA	ES	(27) 3025-7444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:49.956	2026-04-08 13:41:49.956	\N	\N	\N	300	\N	\N	\N
cmnq3kah600n39gtklsdmsv41	279	TRADING POST COMERCIO EXTERIOR LTDA	\N	01453408000262	CNPJ	2	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	2013-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.963	2026-04-08 13:41:49.963	\N	\N	\N	301	\N	\N	\N
cmnq3kahb00n69gtkhuuxec93	280	NC GAMES E ARCADES, IMPORTAÇÃO, EXPORTAÇÃO E LOCAÇÃO DE FITAS E MAQUINAS LTDA	\N	01455929000259	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	2013-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 4095-3101	gsilva@ncgames.com.br	\N	1	t	2026-04-08 13:41:49.968	2026-04-08 13:41:49.968	\N	\N	\N	302	\N	\N	\N
cmnq3kahf00n99gtk0hlwelua	281	Teste 1	\N	01539000000100	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(29)0000-0000	ehrnqirequ8@hotmaiçl.com	\N	1	t	2026-04-08 13:41:49.972	2026-04-08 13:41:49.972	\N	\N	\N	303	\N	\N	\N
cmnq3kahl00nc9gtk3se3alvt	282	SAO FRANCISCO ESCOLA DE CONDUTORES LTDA - ME	\N	01539164000154	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	Avenida Eldes Scherrer Souza - 1345 - Parque Residencial Laranjeiras	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:49.978	2026-04-08 13:41:49.978	\N	\N	\N	304	\N	\N	\N
cmnq3kahr00nf9gtkjw11wgqj	283	COMERCIAL COMAG LTDA	\N	01542005000451	CNPJ	2	MENSAL	ATIVA	GRUPO COMAG	2	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	\N	29168085	Rua 6 B - 80 - CIVIT II - LOTE 11 SALA BOX 064	\N	\N	\N	Serra	ES	(31) 3025-4183	AMFP2005@GMAIL.COM	\N	1	t	2026-04-08 13:41:49.983	2026-04-08 13:41:49.983	\N	\N	\N	305	\N	\N	\N
cmnq3kahv00ni9gtkxqd1dsym	284	KAMIDE & KAMIDE LTDA (SR. TIKO)	\N	01566337000123	CNPJ	A DEFINIR	MENSAL	ATIVA	EMPRESA ÚNICA	1	2018-10-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:49.988	2026-04-08 13:41:49.988	\N	\N	\N	306	\N	\N	\N
cmnq3kai000nl9gtk2w4tdbi6	285	CENTER FERRAMENTAS R J LTDA - ME	\N	01583730000125	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 32283843	marcos.moreira@newrocktrade.com.br	\N	1	t	2026-04-08 13:41:49.992	2026-04-08 13:41:49.992	\N	\N	\N	307	\N	\N	\N
cmnq3kai600no9gtk64v2w610	286	PHD CONSTRUCOES E PAVIMENTACOES LTDA	\N	01727683000146	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29045402	AV NOSSA SENHORA DA PENHA - 2796 - SANTA LUIZA - EDIF IMPACTO EMPRESARIAL SALA 804	\N	\N	\N	VITORIA	ES	(27) 3235-2225	contato@phdes.com.br	\N	1	t	2026-04-08 13:41:49.999	2026-04-08 13:41:49.999	\N	\N	\N	308	\N	\N	\N
cmnq3kaib00nr9gtkjgmuvyav	287	TKS SERVICE LTDA	\N	01737012000166	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29160831	RUA VITORIA - 57 - DE FATIMA	\N	\N	\N	SERRA	ES	2227735452	\N	\N	1	t	2026-04-08 13:41:50.003	2026-04-08 13:41:50.003	\N	\N	\N	309	\N	\N	\N
cmnq3kaif00nu9gtkbs7a7r9r	288	POSTO NOVO HORIZONTE	\N	01766076000195	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29163331	AV BRASIL - 675 - NOVO HORIZONTE	\N	\N	\N	SERRA	ES	(027) 3328-1932	pnovohorizonte@outlook.com	\N	1	t	2026-04-08 13:41:50.008	2026-04-08 13:41:50.008	\N	\N	\N	310	\N	\N	\N
cmnq3kaim00nx9gtkx3pesqrg	289	AGTOP ENGENHARIA E TOPOGRAFIA LTDA	\N	01924552000159	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168695	R CAMACUA - 41 - PORTO CANOA - PAVMTO2	\N	\N	\N	SERRA	ES	(27) 3241-0892/ (27) 3241-0892	agtop@uol.com.br	\N	1	t	2026-04-08 13:41:50.014	2026-04-08 13:41:50.014	\N	\N	\N	311	\N	\N	\N
cmnq3kaiq00o09gtkg6j5ru17	290	PAES E CONGELADOS MUXUARA EIRELI EPP	\N	01978924000120	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	5	2017-08-21 03:00:00	\N	\N	\N	\N	\N	\N	\N	29156035	Rua João Rodrigues Filho - 536 - Cariacica Sede	\N	\N	\N	Cariacica	ES	3254-1463	jose.áilo@congeladosmoxuara.com.br	\N	1	t	2026-04-08 13:41:50.019	2026-04-08 13:41:50.019	\N	\N	\N	312	\N	\N	\N
cmnq3kaiv00o39gtkiv77bhvi	291	BIANCOGRES CERAMICA S/A	\N	02077546000176	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168080	AV TALMA RODRIGUES RIBEIRO - 1145 - CIVIT II	\N	\N	\N	SERRA	ES	(27) 3421-9117/ (27) 3421-9100	contabilidade@biancogres.com.br	\N	1	t	2026-04-08 13:41:50.024	2026-04-08 13:41:50.024	\N	\N	\N	313	\N	\N	\N
cmnq3kaj200o69gtkulzczgc5	292	INTERVIP TELECOM LTDA - EPP	\N	02169819000102	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	7	2017-07-24 03:00:00	\N	\N	\N	\N	\N	\N	\N	29166770	Avenida dos Colibris - S/N - Morada de Laranjeiras	\N	\N	\N	Serra	ES	27-4009-9146	baeta@intervip.net.br	\N	1	t	2026-04-08 13:41:50.031	2026-04-08 13:41:50.031	\N	\N	\N	314	\N	\N	\N
cmnq3kaj700o99gtkxqawu7ie	293	GRANITOS DESTAK LTDA-ME	\N	02401997000117	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil	29168071	Av Central B - 273 - Civit II	\N	\N	\N	Serra	ES	27 3328-5833	\N	\N	1	t	2026-04-08 13:41:50.035	2026-04-08 13:41:50.035	\N	\N	\N	315	\N	\N	\N
cmnq3kajc00oc9gtkfatf4ltf	294	BIOMEDICAL DISTRIBUTION MERCOSUR LTDA	\N	02426290000408	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29173795	Avenida Talma Rodrigues Ribeiro - 147 - Portal de Jacaraípe - GALPAO01 - MODULO C1	\N	\N	\N	Serra	ES	11 98738-4740	cgsouza@ups.com	\N	1	t	2026-04-08 13:41:50.04	2026-04-08 13:41:50.04	\N	\N	\N	316	\N	\N	\N
cmnq3kaji00of9gtk39uctkrk	295	GP UNIVERSAL IMPORTADORA E EXPORTADORA LTDA	\N	02431819000139	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.046	2026-04-08 13:41:50.046	\N	\N	\N	317	\N	\N	\N
cmnq3kajm00oi9gtkvk0olth8	296	ATL - TELECOM LESTE S.A	\N	02445817001251	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	0	2018-08-07 03:00:00	\N	\N	\N	\N	\N	\N	\N	29050420	Avenida Américo Buaiz - 495 - Enseada do Suá	\N	\N	\N	Vitória	ES	(27) 2122-9918	Wendell.Gracelli@net.com.br	\N	1	t	2026-04-08 13:41:50.051	2026-04-08 13:41:50.051	\N	\N	\N	318	\N	\N	\N
cmnq3kajr00ol9gtk2jv9ac2r	297	SHRK - COMERCIAL LTDA EPP	\N	02450638000150	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30663434	comptel@comptelinfo.com.br	\N	1	t	2026-04-08 13:41:50.055	2026-04-08 13:41:50.055	\N	\N	\N	319	\N	\N	\N
cmnq3kajx00oo9gtk4uztkved	298	M. LOG TRANSPORTES E LOGISTICAS LTDA	\N	02460404000517	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(31) 21279000	daniela.araujo@magnun.com.br	\N	1	t	2026-04-08 13:41:50.061	2026-04-08 13:41:50.061	\N	\N	\N	320	\N	\N	\N
cmnq3kak200or9gtkb7g1bz5i	299	VIESA ALIMENTACAO LTDA	\N	02467085000148	CNPJ	1	AVULSO	ATIVA	GRUPO REAL FOOD	5	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29010490	Rua Henrique Novaes - 88 - Centro - EDIF CHAMBOARD,SALA 808	\N	\N	\N	Vitória	ES	11 44227777	contabilidade@realfood.com.br	\N	1	t	2026-04-08 13:41:50.067	2026-04-08 13:41:50.067	\N	\N	\N	321	\N	\N	\N
cmnq3kak600ou9gtkihja4shk	300	VIESA ALIMENTACAO LTDA	\N	02467085000229	CNPJ	2	AVULSO	ATIVA	REDE NORTE SUL 	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	01144227777	andrew@realfood.com.br	\N	1	t	2026-04-08 13:41:50.071	2026-04-08 13:41:50.071	\N	\N	\N	322	\N	\N	\N
cmnq3kakb00ox9gtkxbtiauc4	301	VIESA ALIMENTACAO LTDA	\N	02467085000300	CNPJ	1	AVULSO	ATIVA	REDE NORTE SUL 	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	04144227777	andrew@realfood.com.br	\N	1	t	2026-04-08 13:41:50.075	2026-04-08 13:41:50.075	\N	\N	\N	323	\N	\N	\N
cmnq3kaki00p09gtkrobikq5v	302	AXON OLEO & GAS COMERCIO DE PECAS SOBRESSALENTES LTDA	\N	02492851000124	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-06-05 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	22 2105 0270	naiara.vieira@adailcosta.com	\N	1	t	2026-04-08 13:41:50.083	2026-04-08 13:41:50.083	\N	\N	\N	324	\N	\N	\N
cmnq3kakn00p39gtku7vhgvlw	303	PERFIL COMPUTACIONAL LTDA	\N	02543216001109	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	29162702	ROD GOVERNADOR MARIO COVAS - 4462 - PLANALTO DE CARAPINA	\N	\N	\N	SERRA	ES	(54) 2628-8321	\N	\N	1	t	2026-04-08 13:41:50.087	2026-04-08 13:41:50.087	\N	\N	\N	325	\N	\N	\N
cmnq3kakr00p69gtkho36otay	304	MR TEL TELECOMUNICACOES LTDA	\N	02637000000122	CNPJ	1	MENSAL	ATIVA	GRUPO MR TEL	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27 33455443	financeira@mrtel.com.br	\N	1	t	2026-04-08 13:41:50.092	2026-04-08 13:41:50.092	\N	\N	\N	326	\N	\N	\N
cmnq3kaky00p99gtkxmnvkbcw	305	TELMEX DO BRASIL LTDA (GRUPO CLARO S.A)	\N	02667694004219	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2019-01-01 02:00:00	\N	\N	\N	\N	\N	\N	\N	29010002	Avenida Jerônimo Monteiro - 174 - Centro - PAVMTO: 5; : PARTE;	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.098	2026-04-08 13:41:50.098	\N	\N	\N	327	\N	\N	\N
cmnq3kal200pc9gtkesn096gk	306	RNG GONCALVES LTDA	\N	02669348002226	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29160855	RUA FIORAVANTE CASSINI - 28 - DIAMANTINA - LOJA 05 E 06 PAVMTOSEGUNDO QUADRA000 LOTE 3A/3C	\N	\N	\N	\N	ES	(18) 3909-5711	nonatomgm@hotmail.com	\N	1	t	2026-04-08 13:41:50.103	2026-04-08 13:41:50.103	\N	\N	\N	328	\N	\N	\N
cmnq3kal700pf9gtk1icnp6lf	307	VESPER S.A.	\N	02730101000143	CNPJ	1	AVULSO	ATIVA	GRUPO CLARO	1	2017-10-23 02:00:00	\N	\N	\N	\N	\N	\N	\N	20071002	Avenida Presidente Vargas - 1012 - Centro	\N	\N	\N	Rio de Janeiro	RJ	2125289155	mauro.costa-net@claro.com.br	\N	1	t	2026-04-08 13:41:50.107	2026-04-08 13:41:50.107	\N	\N	\N	329	\N	\N	\N
cmnq3kald00pi9gtkztr2yibc	308	VESPER S.A.	\N	02730101001115	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.113	2026-04-08 13:41:50.113	\N	\N	\N	330	\N	\N	\N
cmnq3kali00pl9gtknpox6ixn	309	VESPER S.A.	\N	02730101002782	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	272104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.119	2026-04-08 13:41:50.119	\N	\N	\N	331	\N	\N	\N
cmnq3kaln00po9gtk7nkield4	310	SANEVIX ENGENHARIA INDUSTRIAL LTDA	\N	02776035000142	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.124	2026-04-08 13:41:50.124	\N	\N	\N	332	\N	\N	\N
cmnq3kalu00pr9gtkhv1hqmi7	311	SANEVIX ENGENHARIA INDUSTRIAL LTDA	\N	02776035000223	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3038-4122	leonardo@sanevix.com.br	\N	1	t	2026-04-08 13:41:50.13	2026-04-08 13:41:50.13	\N	\N	\N	333	\N	\N	\N
cmnq3kaly00pu9gtkszdlsvd8	312	UBS BB CORRETORA DE CAMBIO, TITULOS E VALORES MOBILIARIOS S.A	\N	02819125000173	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	04538132	AV BRIG FARIA LIMA - 4440 - ITAIM BIBI - ANDAR 4 PARTE	\N	\N	\N	SAO PAULO	SP	(11) 2767-6500	\N	\N	1	t	2026-04-08 13:41:50.135	2026-04-08 13:41:50.135	\N	\N	\N	334	\N	\N	\N
cmnq3kam300px9gtk1nrv7cph	313	AMARA BRASIL LTDA	\N	02857954001384	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29136013	Rua Santa Helena - 127 - Vila Bethânia - VILA BETHANIA	\N	\N	\N	Viana	ES	2721048300	ltaboada@amarabrasil.com.br ; izuanny@amarabrasil.com.br	\N	1	t	2026-04-08 13:41:50.139	2026-04-08 13:41:50.139	\N	\N	\N	335	\N	\N	\N
cmnq3kam800q09gtk0c648cip	314	BRASILCENTER COMUNICAÇÕES LTDA	\N	02917443000410	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	2019-11-06 03:00:00	\N	\N	\N	\N	\N	\N	\N	29102020	Rodovia do Sol - 3700 - Praia de Itaparica	\N	\N	\N	Vila Velha	ES	(011) 9.9861-2691	fabricio@ativagestao.com.br	\N	1	t	2026-04-08 13:41:50.144	2026-04-08 13:41:50.144	\N	\N	\N	336	\N	\N	\N
cmnq3kamd00q39gtkv56iq0oi	315	MBS TECNOLOGIA MARINHA LTDA	\N	02930870000195	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	(27) 4102-3256	massamiy@hkm.ind.br	\N	1	t	2026-04-08 13:41:50.149	2026-04-08 13:41:50.149	\N	\N	\N	337	\N	\N	\N
cmnq3kamh00q69gtkp4mnv7rx	316	ADVOCACIA DAL PIAZ	\N	02940208000116	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	1	2019-07-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.153	2026-04-08 13:41:50.153	\N	\N	\N	338	\N	\N	\N
cmnq3kamm00q99gtkji9x0r7e	317	UP BRASIL - PLANINVESTI ADMINISTRACAO E SERVICOS LTDA.	\N	02959392000146	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2018-10-16 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	3432333497	viviane.terra@upbrasil.com	\N	1	t	2026-04-08 13:41:50.158	2026-04-08 13:41:50.158	\N	\N	\N	339	\N	\N	\N
cmnq3kamr00qc9gtko7gszt4u	318	UP BRASIL ADMINISTRACAO E SERVICOS LTDA.	\N	02959392000499	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.163	2026-04-08 13:41:50.163	\N	\N	\N	340	\N	\N	\N
cmnq3kamv00qf9gtkkji9mzf2	319	FRANCO CONTABILIDADE LTDA.	\N	03013093000187	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.168	2026-04-08 13:41:50.168	\N	\N	\N	341	\N	\N	\N
cmnq3kan000qi9gtkyb42gd3i	320	J.B.L REPRESENTAÇÕES LTDA - ME	\N	03055197000154	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	central@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.172	2026-04-08 13:41:50.172	\N	\N	\N	342	\N	\N	\N
cmnq3kanh00qr9gtkmsyw86yv	323	MASH INDUSTRIA E COMERCIO LTDA	\N	03125730000107	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	7	2017-05-17 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 4950-7641	silvia.lima@mash.com.br	\N	1	t	2026-04-08 13:41:50.19	2026-04-08 13:41:50.19	\N	\N	\N	345	\N	\N	\N
cmnq3kanr00qx9gtkmdb9ujs5	325	SOLUPACK SISTEMAS DE EMBALAGENS LTDA	\N	03266643000170	CNPJ	9	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	06713280	VIA DAS SAMAMBAIAS - 161 - JARDIM COLIBRI	\N	\N	\N	COTIA	SP	(11) 2093-9552 / (11) 2033-1301	legalizacao@equilibriocontabil.net	\N	1	t	2026-04-08 13:41:50.199	2026-04-08 13:41:50.199	\N	\N	\N	347	\N	\N	\N
cmnq3kao000r39gtk35f83ggi	327	CENTER AVIAMENTOS LTDA	CENTER AVIAMENTOS	03531331000146	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL DE AVIAMENTOS	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29122290	RUA SANTA ROSA, 279	\N	\N	\N	VILA VELHA	ES	(27) 3239-3600 / (27) 3311-4895	center@centeraviamentos.com.br	\N	1	t	2026-04-08 13:41:50.208	2026-04-08 13:41:50.208	\N	\N	\N	349	\N	\N	\N
cmnq3kao500r69gtktw93t6ds	328	ELEVADORES MILENIO LTDA	\N	03539398000127	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-11-30 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	30431089	Rua Catete - 128 - Barroca	\N	\N	\N	Belo Horizonte	MG	\N	carlosjose@previsa.com.br	\N	1	t	2026-04-08 13:41:50.213	2026-04-08 13:41:50.213	\N	\N	\N	350	\N	\N	\N
cmnq3kaoa00r99gtkdzrsqcwf	329	VALISERE E-COMMERCE LTDA	\N	03650266000178	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	63 32159400	carolina@planej-rnc.com.br	\N	1	t	2026-04-08 13:41:50.218	2026-04-08 13:41:50.218	\N	\N	\N	351	\N	\N	\N
cmnq3kaoe00rc9gtko5o9q6gm	330	DIGITAL WORK COMPUTER SERVICE COMERCIAL EIRELI	\N	03688545000120	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-05-03 03:00:00	\N	\N	\N	\N	\N	\N	\N	06455020	Alameda Tocantins - Alphaville Centro Industrial e Empresarial/Alphaville.	\N	\N	\N	Barueri	SP	11 2997-1500 Bonini Contabilidade - Valdirene	val@bonini.com.br	\N	1	t	2026-04-08 13:41:50.223	2026-04-08 13:41:50.223	\N	\N	\N	352	\N	\N	\N
cmnq3kaoj00rf9gtk9s9u3tq4	331	ENGENHARIA E CONSULTORIA VITORIA LTDA	\N	03725445000127	CNPJ	1	MENSAL	ATIVA	GRUPO VITORIA ENGENHARIA	1	\N	2026-03-27 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29066040	AV CARLOS GOMES DE SA - 335 - MATA DA PRAIA - SALA 101	\N	\N	\N	Vitória	ES	(27) 3237-0259	romulo@vitoriaengenharia.com.br	\N	1	t	2026-04-08 13:41:50.228	2026-04-08 13:41:50.228	\N	\N	\N	353	\N	\N	\N
cmnq3kaoo00ri9gtkizglfk6n	332	ENGENHARIA E CONSULTORIA VITORIA LTDA - EPP	\N	03725445000208	CNPJ	2	MENSAL	ATIVA	GRUPO VITORIA ENGENHARIA	1	2018-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29160752	Avenida Miramar - 343 - de Fátima	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.232	2026-04-08 13:41:50.232	\N	\N	\N	354	\N	\N	\N
cmnq3kaos00rl9gtkpatrbbdo	333	RALPHE NOLASCO FERREIRA JUNIOR - ME	\N	03756360000106	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29168061	AV. ELDES SCHERRER SOUZA - S/N - CIVIT II - LOJA: 26 TERM ROD LARANJE ;	\N	\N	\N	SERRA	ES	(27) 3328-7244	\N	\N	1	t	2026-04-08 13:41:50.236	2026-04-08 13:41:50.236	\N	\N	\N	355	\N	\N	\N
cmnq3kaoy00ro9gtkd810o7ua	334	RALPHE NOLASCO FERREIRA JUNIOR - ME	\N	03756360000297	CNPJ	2	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29160161	Avenida João Palácio - 300 - Eurico Salles - LOJA 302 AB PISO L3	\N	\N	\N	Serra	ES	27 3211-0150	\N	\N	1	t	2026-04-08 13:41:50.242	2026-04-08 13:41:50.242	\N	\N	\N	356	\N	\N	\N
cmnq3kap200rr9gtkwya4zyjf	335	RALPHE NOLASCO FERREIRA JUNIOR - ME	\N	03756360000378	CNPJ	2	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29163165	Avenida Brasil - 2703 - São Diogo II - LOJA: 10;	\N	\N	\N	Serra	ES	27 3067-5063	\N	\N	1	t	2026-04-08 13:41:50.247	2026-04-08 13:41:50.247	\N	\N	\N	357	\N	\N	\N
cmnq3kap700ru9gtkvxyegm03	336	PRE-MOLDADOS DE CONCRETO LTDA EPP	\N	03780702000123	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.251	2026-04-08 13:41:50.251	\N	\N	\N	358	\N	\N	\N
cmnq3kapb00rx9gtkllw5r7vq	337	RCL MANGUEIRAS E CONEXÕES LTDA	\N	03782267000257	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-06-25 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.255	2026-04-08 13:41:50.255	\N	\N	\N	359	\N	\N	\N
cmnq3kapg00s09gtk68uilebe	338	COSTA GRANITOS LTDA	\N	03881492000160	CNPJ	1	MENSAL	ATIVA	GRUPO ADISTEC 	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29168055	Rua Atalydes Moreira de Souza - 502 - Civit I	\N	\N	\N	Serra	ES	27 3341-8338	claudia@costagranitos.com.br	\N	1	t	2026-04-08 13:41:50.26	2026-04-08 13:41:50.26	\N	\N	\N	360	\N	\N	\N
cmnq3kapk00s39gtk8x759ngi	339	HOME TECH COMERCIO E INDUSTRIA LTDA	\N	03919188000326	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	peterhuangbr@gmail.com, wanglubr@hotmail.com	\N	1	t	2026-04-08 13:41:50.264	2026-04-08 13:41:50.264	\N	\N	\N	361	\N	\N	\N
cmnq3kapo00s69gtkc0mwsye5	340	CONSTREMAC CONSTRUÇÕES LTDA	\N	03998869000750	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	2012-10-01 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 37416651	adriana.oliveira@grupocopabo.com.br	\N	1	t	2026-04-08 13:41:50.269	2026-04-08 13:41:50.269	\N	\N	\N	362	\N	\N	\N
cmnq3kapt00s99gtkobolwmuq	341	ICATEL TELEMATICA SERVICOS E COMERCIO LTDA	\N	04163433000542	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 92805710	paulotourinho@uol.com.br	\N	1	t	2026-04-08 13:41:50.274	2026-04-08 13:41:50.274	\N	\N	\N	363	\N	\N	\N
cmnq3kapy00sc9gtkcfkplqn6	342	ADRIANA VELOSO RIBEIRO	\N	04173425000153	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2733228090	darocha@gmail.com	\N	1	t	2026-04-08 13:41:50.278	2026-04-08 13:41:50.278	\N	\N	\N	364	\N	\N	\N
cmnq3kaq200sf9gtktam296xk	343	RNC - REDE NACIONAL DE CONTABILIDADE	\N	04188293000133	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2020-03-16 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.282	2026-04-08 13:41:50.282	\N	\N	\N	365	\N	\N	\N
cmnq3kaq700si9gtkdi32f89c	344	SULMINAS FIOS E CABOS LTDA	\N	04210938000197	CNPJ	8	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.287	2026-04-08 13:41:50.287	\N	\N	\N	366	\N	\N	\N
cmnq3kaqc00sl9gtk3jm9yqgp	345	AUTO POSTO MARLIN LTDA	\N	04228463000166	CNPJ	1	AVULSO	ATIVA	GRUPO REDE NORTE SUL	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	272104-8300	comercial@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.292	2026-04-08 13:41:50.292	\N	\N	\N	367	\N	\N	\N
cmnq3kaqg00so9gtkzr590g0u	346	VITORIA MINING - MINERACAO IMPORTACAO E EXPORTACAO LTDA	\N	04257245000150	CNPJ	1	MENSAL	ATIVA	GRUPO VITORIA STONE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3091-9368	natalia@pedreirasdobrasil.com.br	\N	1	t	2026-04-08 13:41:50.296	2026-04-08 13:41:50.296	\N	\N	\N	368	\N	\N	\N
cmnq3kaqk00sr9gtk3pd81ept	347	VITORIA MINING - MINERACAO IMPORTACAO E EXPORTACAO LTDA	\N	04257245000311	CNPJ	2	MENSAL	ATIVA	GRUPO VITORIA STONE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3091-9368	natalia@pedreirasdobrasil.com.br	\N	1	t	2026-04-08 13:41:50.301	2026-04-08 13:41:50.301	\N	\N	\N	369	\N	\N	\N
cmnq3kaqp00su9gtkiuh9esoq	348	SENAR - SERVIÇO NACIONAL DE APRENDIZAGEM - AR/ES	\N	04297257000108	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	4	2018-02-06 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29056243	Avenida Nossa Senhora da Penha - Torre A - 11º Andar - 1495 - Santa Lúcia	\N	\N	\N	Vitória	ES	31859223	wglei@faes.org.br	\N	1	t	2026-04-08 13:41:50.305	2026-04-08 13:41:50.305	\N	\N	\N	370	\N	\N	\N
cmnq3kaqt00sx9gtk7231nhnj	349	ENERGILETRICA COMERCIO E MANUTENCAO DE QUADROS ELETRICOS EIRELI	\N	04336936000149	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	2019-02-07 02:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.31	2026-04-08 13:41:50.31	\N	\N	\N	371	\N	\N	\N
cmnq3kaqy00t09gtkfcbmy94c	350	MUNDIVISAS SERVICOS LTDA - EPP	\N	04343644000303	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	22 27723681	thiago.fontes@br.gt.com	\N	1	t	2026-04-08 13:41:50.314	2026-04-08 13:41:50.314	\N	\N	\N	372	\N	\N	\N
cmnq3kar300t39gtkgmedkwu9	351	BG SERVICOS E LOGISTICA LTDA	\N	04375214000101	CNPJ	1	MENSAL	ATIVA	GRUPO STILE	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 2121-5622	elania.busato@stilecomercial.com.br	\N	1	t	2026-04-08 13:41:50.319	2026-04-08 13:41:50.319	\N	\N	\N	373	\N	\N	\N
cmnq3kar800t69gtke1mg5nqk	352	ID DO BRASIL LOGISTCA LTDA	\N	04416849001092	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.324	2026-04-08 13:41:50.324	\N	\N	\N	374	\N	\N	\N
cmnq3kanv00r09gtkngidwdpx	326	MR-9 PRESTAÇÃO DE SERVIÇOS LTDA - ME	\N	03460381000180	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL CONTÁBIL	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29165130	Avenida Central - 1345 - Parque Residencial Laranjeiras - 2 PAVIMENTO 2 B	\N	\N	\N	Serra	ES	27 2104-8300	\N	\N	1	t	2026-04-08 13:41:50.203	2026-04-09 18:59:07.56	\N	2026-04-09 18:59:07.535	\N	348	\N	\N	\N
cmnq3kard00t99gtkur9fzjpc	353	EMPORIO CARD LTDA - EPP	\N	04432048000120	CNPJ	1	MENSAL	ATIVA	GRUPO EMPORIO CARD	1	2012-08-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27 3345-6299	karisten.xavier@cartaovalemais.com.br	\N	1	t	2026-04-08 13:41:50.329	2026-04-08 13:41:50.329	\N	\N	\N	375	\N	\N	\N
cmnq3karh00tc9gtk27rndad8	354	EMPORIO CARD LTDA - EPP	\N	04432048000472	CNPJ	2	MENSAL	ATIVA	GRUPO EMPORIO CARD	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29090820	R VICTORINO CARDOSO - SALA: 201 202 203 204 E; : 205; - 235 - JARDIM CAMBURI	\N	\N	\N	VITORIA	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.334	2026-04-08 13:41:50.334	\N	\N	\N	376	\N	\N	\N
cmnq3karl00tf9gtkslkbgpaq	355	INTERATIVA NUTRICAO CLINICA LTDA	\N	04550922000123	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	3219-9957 e 3020-6007	leobenjamin@yaroo.com.br, direcao@interativanutricao.com.br	\N	1	t	2026-04-08 13:41:50.338	2026-04-08 13:41:50.338	\N	\N	\N	377	\N	\N	\N
cmnq3karq00ti9gtk7r8utihb	356	JOMAGA PARTICIPACOES LTDA	\N	04606250000120	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.342	2026-04-08 13:41:50.342	\N	\N	\N	378	\N	\N	\N
cmnq3karu00tl9gtk6hl0jamx	357	MR. PAO PANIFICADORA LTDA	\N	04635376000123	CNPJ	7	AVULSO	ATIVA	GRUPO DENISE MUNHÃO	0	\N	\N	\N	\N	\N	\N	\N	\N	29175851	Rua D - Conjunto Jacaraípe	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.347	2026-04-08 13:41:50.347	\N	\N	\N	379	\N	\N	\N
cmnq3karz00to9gtkiu3lj31q	358	HI IMOVEIS LTDA	\N	04639347000130	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	2019-05-13 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.351	2026-04-08 13:41:50.351	\N	\N	\N	380	\N	\N	\N
cmnq3kas300tr9gtk6ddxkej1	359	MR COM INFORMATICA LTDA	\N	04643712000180	CNPJ	1	MENSAL	ATIVA	GRUPO MR TEL	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27 33455443	financeira@mrtel.com.br	\N	1	t	2026-04-08 13:41:50.356	2026-04-08 13:41:50.356	\N	\N	\N	381	\N	\N	\N
cmnq3kas800tu9gtk6ayr87ap	360	INDUSTRIA E COMERCIO DE AGUARDENTE SANTA BARBARA LTDA - ME	\N	04659927000199	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29199548	Rodovia ES-010 - S/N - Santa Cruz	\N	\N	\N	Aracruz	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.36	2026-04-08 13:41:50.36	\N	\N	\N	382	\N	\N	\N
cmnq3kasc00tx9gtk3wj37ex8	361	GBJ METALMECANICA LTDA	\N	04663056000187	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29168062	Rua 7 - 243 - Civit II	\N	\N	\N	Serra	ES	27 3218-5461	\N	\N	1	t	2026-04-08 13:41:50.365	2026-04-08 13:41:50.365	\N	\N	\N	383	\N	\N	\N
cmnq3kasj00u09gtkvzvvx3ju	362	MADOMI LAVIX CONSTRUTORA E SERVICOS LTDA - ME	\N	04681721000165	CNPJ	1	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	AVENIDA FERNANDO FERRARI - 2913 - SOLON BORGES	\N	\N	\N	VITORIA	ES	27 21215684	FISCAL@ELETROSOLDA.COM.BR	\N	1	t	2026-04-08 13:41:50.372	2026-04-08 13:41:50.372	\N	\N	\N	384	\N	\N	\N
cmnq3kaso00u39gtk0je2by3e	363	BIG BELLE COMERCIO DE ALIMENTOS LTDA EPP	\N	04712174000138	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	pizza@parlor.com.br	\N	1	t	2026-04-08 13:41:50.377	2026-04-08 13:41:50.377	\N	\N	\N	385	\N	\N	\N
cmnq3kast00u69gtki5ac1mp4	364	LEVANTINA NATURAL STONE BRASIL LTDA	\N	04746729000162	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048327	lindalva@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.382	2026-04-08 13:41:50.382	\N	\N	\N	386	\N	\N	\N
cmnq3kasy00u99gtk1m9a55rw	365	ASBRASP - ASSOCIACAO BRASILEIRA DE AUXILIO AOS SERVIDORES PUBLICOS	\N	04747160000150	CNPJ	1	MENSAL	ATIVA	GRUPO ABRASP	0	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	2730248282	contato@asbrasp.com.br	\N	1	t	2026-04-08 13:41:50.386	2026-04-08 13:41:50.386	\N	\N	\N	387	\N	\N	\N
cmnq3kat200uc9gtkiucdgyjj	366	CELSO LEONARDO FIGUEIRA - ME	\N	04765695000153	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29162122	Rod Br 101 Norte - 286 - Laranjeiras Velha	\N	\N	\N	Serra	ES	27 3064-8800	leonardo@figeletro.com.br	\N	1	t	2026-04-08 13:41:50.39	2026-04-08 13:41:50.39	\N	\N	\N	388	\N	\N	\N
cmnq3kat800uf9gtki4s5ix4k	367	ON TIME SERVICOS E TRANSPORTES LTDA - ME	\N	04887439000139	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 55240534	alessandra@onwaysolutions.com.br	\N	1	t	2026-04-08 13:41:50.396	2026-04-08 13:41:50.396	\N	\N	\N	389	\N	\N	\N
cmnq3katc00ui9gtkv81xahf1	368	CONFIDENCE CORRETORA DE CAMBIO S/A	\N	04913129024598	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.401	2026-04-08 13:41:50.401	\N	\N	\N	390	\N	\N	\N
cmnq3kath00ul9gtk2szipgvu	369	CONFIDENCE CORRETORA DE CAMBIO S/A	\N	04913129024679	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.405	2026-04-08 13:41:50.405	\N	\N	\N	391	\N	\N	\N
cmnq3katl00uo9gtkzvwpex3w	370	LR INDUSTRIA E COMERCIO LTDA	\N	04935064000135	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2009-02-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29164153	Rua Francisco Sousa dos Santos - 3 - Jardim Limoeiro - Sala 211	\N	\N	\N	Serra	ES	27 2141-7649	\N	\N	1	t	2026-04-08 13:41:50.41	2026-04-08 13:41:50.41	\N	\N	\N	392	\N	\N	\N
cmnq3katr00ur9gtkkrdvjmr4	371	LR INDUSTRIA E COMERCIO LTDA	\N	04935064000216	CNPJ	2	MENSAL	ATIVA	GRUPO LANDI RENZO 	1	2017-03-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	21235180	Rua Ferreira Cantão - 711 - Irajá	\N	\N	\N	Rio de Janeiro	RJ	27 2125-0514	sfranco@landirenzo.com.br	\N	1	t	2026-04-08 13:41:50.415	2026-04-08 13:41:50.415	\N	\N	\N	393	\N	\N	\N
cmnq3katv00uu9gtk5rm63fdt	372	ASSOCIACAO NACIONAL DO MINISTERIO PUBLICO DO CONSUMIDOR	\N	04963860000181	CNPJ	1	MENSAL	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	\N	CAIXA	\N	\N	Contábil;Fiscal	40050001	Avenida Joana Angélica - 902 - Nazaré - SALA 104	\N	\N	\N	Salvador	BA	(27)3145-5000	assessoria@mpcon.org.br	\N	1	t	2026-04-08 13:41:50.419	2026-04-08 13:41:50.419	\N	\N	\N	394	\N	\N	\N
cmnq3katz00ux9gtkvf28h8yq	373	VEPAR PARTICIPACOES LTDA	\N	05159639000138	CNPJ	1	AVULSO	ATIVA	GRUPO VITORIA STONE	1	2005-07-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.424	2026-04-08 13:41:50.424	\N	\N	\N	395	\N	\N	\N
cmnq3kau600v09gtkiz5pvbdu	374	RODOLOG TRANSPORTES MULTIMODAIS LTDA	\N	05214772000301	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29168055	R ATALYDES MOREIRA DE SOUZA - 964 - CIVIT I - QUADRA A, LOTE 010	\N	\N	\N	SERRA	ES	(27) 3089-1450	\N	\N	1	t	2026-04-08 13:41:50.43	2026-04-08 13:41:50.43	\N	\N	\N	396	\N	\N	\N
cmnq3kaub00v39gtk1d5vv7rd	375	TECNOSERV SERVICOS DE TELECOMUNICACOES LTDA	\N	05286799000148	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(027) 3064-0368	divulgueaqui2006@gmail.com	\N	1	t	2026-04-08 13:41:50.436	2026-04-08 13:41:50.436	\N	\N	\N	397	\N	\N	\N
cmnq3kaum00v69gtku2p0bxqk	376	MEDLEVENSOHN COMERCIO E REPRESENTACOES DE PRODUTOS HOSPITALARES LTDA	\N	05343029000190	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	21 25700749	comercial@medlevensohn.com.br	\N	1	t	2026-04-08 13:41:50.446	2026-04-08 13:41:50.446	\N	\N	\N	398	\N	\N	\N
cmnq3kauu00v99gtkk6crg6or	377	MARMI OROBICI DO BRASIL LTDA	\N	05360514000171	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2010-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3298-9250	\N	\N	1	t	2026-04-08 13:41:50.454	2026-04-08 13:41:50.454	\N	\N	\N	399	\N	\N	\N
cmnq3kauz00vc9gtk7pcn8ptz	378	MARMI OROBICI DO BRASIL LTDA  FILIAL	\N	05360514000414	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.459	2026-04-08 13:41:50.459	\N	\N	\N	400	\N	\N	\N
cmnq3kav500vf9gtk1i4gomvj	379	AUTO POSTO FUNDAO LTDA.	\N	05382597000108	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29185000	AV JOSE AGOSTINI - 204 - CENTRO	\N	\N	\N	FUNDAO	ES	(027) 3267-1131	\N	\N	1	t	2026-04-08 13:41:50.465	2026-04-08 13:41:50.465	\N	\N	\N	401	\N	\N	\N
cmnq3kava00vi9gtkogg3ak1x	380	MTS DISTRIBUIDORA LTDA - ME	\N	05428539000160	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.47	2026-04-08 13:41:50.47	\N	\N	\N	402	\N	\N	\N
cmnq3kave00vl9gtkxqjrqbyi	381	COSTANOX AÇOS INOXIDÁVEIS EIRELI	\N	05455609000179	CNPJ	1	MENSAL	ATIVA	GRUPO COSTANOX	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29110172	Rua Quartzo - 7 - Nossa Senhora da Penha	\N	\N	\N	Vila Velha	ES	27 3319-0305	jjanox@jjanox.com.br	\N	1	t	2026-04-08 13:41:50.474	2026-04-08 13:41:50.474	\N	\N	\N	403	\N	\N	\N
cmnq3kavk00vo9gtk98xw306f	382	COSTANOX AÇOS INOXIDÁVEIS EIRELI	\N	05455609000411	CNPJ	2	MENSAL	ATIVA	GRUPO COSTANOX	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29108060	Rua Mahatma Gandhi - 277 - Santa Inês - GALPAO;	\N	\N	\N	Vila Velha	ES	27 3319-0305	FISCAL@COSTANOX.COM.BR	\N	1	t	2026-04-08 13:41:50.48	2026-04-08 13:41:50.48	\N	\N	\N	404	\N	\N	\N
cmnq3kavp00vr9gtkky115hie	383	COSTANOX AÇOS INOXIDÁVEIS EIRELI	\N	05455609000500	CNPJ	2	MENSAL	ATIVA	GRUPO COSTANOX	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29110060	Rua Pedro Sperandio - 130 - Nossa Senhora da Penha	\N	\N	\N	Vila Velha	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.485	2026-04-08 13:41:50.485	\N	\N	\N	405	\N	\N	\N
cmnq3kb48010r9gtk3iqi7bqv	443	FORMAX COMERCIO DE EMBALAGENS E DISTRIBUIÇÃO EIRELI	\N	07565496000190	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	0	2019-04-24 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.793	2026-04-08 13:41:50.793	\N	\N	\N	465	\N	\N	\N
cmnq3kavt00vu9gtk1j3oh8w1	384	COSTANOX ACOS INOXIDAVEIS EIRELI	\N	05455609000683	CNPJ	2	MENSAL	ATIVA	GRUPO COSTANOX	6	2021-09-14 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29927000	AV AV ANGELO SUZANO - 235 - VALE DO SOL	\N	\N	\N	SOORETAMA	ES	(27) 8107-6580	contador@costanox.com.br	\N	1	t	2026-04-08 13:41:50.49	2026-04-08 13:41:50.49	\N	\N	\N	406	\N	\N	\N
cmnq3kavz00vx9gtkz7bg5pdk	385	GRAFITUSA S/A	\N	05461408000184	CNPJ	1	MENSAL	ATIVA	GRUPO GRAFITUSA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	29168068	R 2 B - 190 - CIVIT II - SETOR 2	\N	\N	\N	SERRA	ES	(27) 3434-2200	gestao@grafitusa.com.br	\N	1	t	2026-04-08 13:41:50.496	2026-04-08 13:41:50.496	\N	\N	\N	407	\N	\N	\N
cmnq3kaw400w09gtkviqg5qrn	386	AUTO POSTO SAO PEDRO LTDA	\N	05463954000154	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29123136	AV CARLOS LINDEMBERG - 66 - JABURUNA	\N	\N	\N	VILA VELHA	ES	(27) 3329-9789	posto.saopedro@hotmail.com	\N	1	t	2026-04-08 13:41:50.501	2026-04-08 13:41:50.501	\N	\N	\N	408	\N	\N	\N
cmnq3kaw900w39gtkj4p10c0i	387	BACCO SAPORE D ITALIA CANTINA - EIRELI - EPP	\N	05538808000140	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30260596	cantinadobacco@gmail.com	\N	1	t	2026-04-08 13:41:50.505	2026-04-08 13:41:50.505	\N	\N	\N	409	\N	\N	\N
cmnq3kawd00w69gtkr3bn1rbe	388	PARANA GRANITOS LTDA	\N	05595540000260	CNPJ	2	MENSAL	ATIVA	GRUPO PARANÁ 	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29165680	AVENIDA ELDES SCHERRER SOUZA, 1025	\N	\N	\N	SERRA	ES	(27) 3328-8523	mara@paranagranitos.com.br	\N	1	t	2026-04-08 13:41:50.51	2026-04-08 13:41:50.51	\N	\N	\N	410	\N	\N	\N
cmnq3kawj00w99gtkvbxk0noq	389	SCANSOURCE BRASIL DISTRIBUIDORA DE TECNOLOGIAS LTDA	\N	05607657000216	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29175706	R PORTO ALEGRE - 307 - NOVA ZELANDIA - GALPAO2 - PARTE B ARMZ 2 - MODULO 1	\N	\N	\N	SERRA	ES	(41) 3079-3089	tax@scansource.com	\N	1	t	2026-04-08 13:41:50.516	2026-04-08 13:41:50.516	\N	\N	\N	411	\N	\N	\N
cmnq3kawo00wc9gtkxci1dmma	390	SCANSOURCE BRASIL DISTRIBUIDORA DE TECNOLOGIAS LTDA	\N	05607657001026	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	2017-12-05 02:00:00	\N	\N	\N	\N	\N	\N	\N	29173795	Avenida Talma Rodrigues Ribeiro, Galpão 1, Mod. D - 147 - Portal de Jacaraípe	\N	\N	\N	Serra	ES	\N	delba.batista@scansource.com	\N	1	t	2026-04-08 13:41:50.52	2026-04-08 13:41:50.52	\N	\N	\N	412	\N	\N	\N
cmnq3kawt00wf9gtk8ut4wb2n	391	SCANSOURCE BRASIL DISTRIBUIDORA DE TECNOLOGIAS LTDA	\N	05607657001379	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Fiscal	29173795	Avenida Talma Rodrigues Ribeiro - GALPAO02 - 1765 - Portal de Jacaraípe	\N	\N	\N	Serra	ES	+55 (41) 2169-6526 | Cel.: +55 (41) 9143-4056	delba.batista@scansource.com	\N	1	t	2026-04-08 13:41:50.525	2026-04-08 13:41:50.525	\N	\N	\N	413	\N	\N	\N
cmnq3kawz00wi9gtkt8enaks1	392	SCANSOURCE BRASIL DISTRIBUIDORA DE TECNOLOGIAS LTDA	\N	05607657001450	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29175706	R PORTO ALEGRE - 307 - NOVA ZELANDIA - GALPAO2; ARMZ 2 - MODULO 1	\N	\N	\N	serra	ES	(41) 3079-3089	tax@scansource.com	\N	1	t	2026-04-08 13:41:50.531	2026-04-08 13:41:50.531	\N	\N	\N	414	\N	\N	\N
cmnq3kax300wl9gtkgtaf6ygu	393	RELAXMEDIC IMPORTACAO EXPORTACAO LTDA	\N	05638557000338	CNPJ	2	MENSAL	ATIVA	GRUPO RELAXMEDIC	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 8690 0085	cassio.mussupapo@relaxmedic.com.br	\N	1	t	2026-04-08 13:41:50.536	2026-04-08 13:41:50.536	\N	\N	\N	415	\N	\N	\N
cmnq3kax700wo9gtkivg1cl3i	394	RELAXMEDIC IMPORTACAO EXPORTACAO LTDA	\N	05638557000508	CNPJ	2	MENSAL	ATIVA	GRUPO RELAXMEDIC	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3393 3688	cassio.mussupapo@relaxmedic.com.br	\N	1	t	2026-04-08 13:41:50.54	2026-04-08 13:41:50.54	\N	\N	\N	416	\N	\N	\N
cmnq3kaxe00wr9gtkmt2b28u0	395	CICLOMETAL COMÉRCIO DE RECICLAVEIS EIRELI	\N	05649513000141	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	4	2018-07-10 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	29143694	Rodovia Leste-Oeste - 1119 - Morada de Santa Fé	\N	\N	\N	Cariacica	ES	27 99713-6468	allan@ciclometal.eco.br, allan.freguete@reciclavitoria.com.br	\N	1	t	2026-04-08 13:41:50.546	2026-04-08 13:41:50.546	\N	\N	\N	417	\N	\N	\N
cmnq3kaxn00wx9gtk4rp8ourp	397	AUTO POSTO SAO BENEDITO LTDA.	\N	05757150000168	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29177008	R FLORIANO PEIXOTO - 104 - SAO JUDAS TADEU	\N	\N	\N	SERRA	ES	(27) 3251-1293	apsaobenedito@hotmail.com	\N	1	t	2026-04-08 13:41:50.555	2026-04-08 13:41:50.555	\N	\N	\N	419	\N	\N	\N
cmnq3kaxs00x09gtk80k9590t	398	STILE COMERCIAL LTDA	\N	05758306000125	CNPJ	1	AVULSO	ATIVA	GRUPO STILE	1	2012-01-01 02:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 2121-5622	rh@stilecomercial.com.br	\N	1	t	2026-04-08 13:41:50.561	2026-04-08 13:41:50.561	\N	\N	\N	420	\N	\N	\N
cmnq3kaxx00x39gtkjawfutht	399	DIOR DE AZEVEDO TRANSPORTES LTDA	\N	05777666000174	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2019-02-18 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.566	2026-04-08 13:41:50.566	\N	\N	\N	421	\N	\N	\N
cmnq3kay200x69gtksbatr03f	400	ANTOLINI DO BRASIL PEDRAS NATURAIS LTDA	\N	05778327000102	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29173320	Rodovia ES-010 - KM 8.6 - 8605 - Ourimar	\N	\N	\N	Serra	ES	(27) 3434-1300	magno@bozzi@antolinidobrasil.com.br	\N	1	t	2026-04-08 13:41:50.57	2026-04-08 13:41:50.57	\N	\N	\N	422	\N	\N	\N
cmnq3kay600x99gtkac1v9q6f	401	CONTATO ACESSORIOS INDUSTRIAIS EIRELI	\N	05806978000169	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2019-07-04 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.575	2026-04-08 13:41:50.575	\N	\N	\N	423	\N	\N	\N
cmnq3kayc00xc9gtk3sovdgnf	402	MINERAÇÃO SÃO ROQUE LTDA ME	\N	05809325000133	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29690000	CORREGO BOA SORTE - SN - DISTRITO DE SOBREIRO	\N	\N	\N	itaguacu	ES	\N	?joceliabarbara@terra.com.br	\N	1	t	2026-04-08 13:41:50.581	2026-04-08 13:41:50.581	\N	\N	\N	424	\N	\N	\N
cmnq3kayi00xf9gtkcc494ns4	403	VITORIA SERVICOS DE APOIO EMPRESARIAL LTDA	\N	05824383000136	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29160771	R MARIA DELUNARDO TRANCOSO - 98 - DE FATIMA	\N	\N	\N	SERRA	ES	(27) 3237-0259	sidval@vitoriaengenharia.com.br	\N	1	t	2026-04-08 13:41:50.586	2026-04-08 13:41:50.586	\N	\N	\N	425	\N	\N	\N
cmnq3kayn00xi9gtkcepk3b0g	404	DISMETER COMERCIAL ELETRICA LTDA	\N	05867938000208	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	27923220	AV GUADALAJARA - 1900 - PRAIA CAMPISTA	\N	\N	\N	MACAE	RJ	(22) 2765-2000	dismeter@dismeter.com.br	\N	1	t	2026-04-08 13:41:50.591	2026-04-08 13:41:50.591	\N	\N	\N	426	\N	\N	\N
cmnq3kays00xl9gtk5psrc0ck	405	GRANINTER BRASIL LTDA	\N	05882516000120	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3434-0700	celio.guerra@levantina.com.br	\N	1	t	2026-04-08 13:41:50.597	2026-04-08 13:41:50.597	\N	\N	\N	427	\N	\N	\N
cmnq3kayx00xo9gtk3owkbqd7	406	CLASSIC PERFUMARIA LTDA - EPP	\N	05894611000144	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.602	2026-04-08 13:41:50.602	\N	\N	\N	428	\N	\N	\N
cmnq3kaz200xr9gtksfdbbxn5	407	ARTE FINAL PROPAGANDA E SERVICOS EIRELI - EPP	\N	05928922000187	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3228-0668	ANDRESA@DIVULGUEOUTDOOR.COM.BR	\N	1	t	2026-04-08 13:41:50.606	2026-04-08 13:41:50.606	\N	\N	\N	429	\N	\N	\N
cmnq3kaz700xu9gtkckajyfb3	408	GRALHA AZUL TRANSPORTE LTDA	\N	05934975000100	CNPJ	1	AVULSO	ATIVA	GRUPO PARANÁ 	1	2010-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29164252	Rua Jose Luiz da Rocha - 100 - Camara	\N	\N	\N	Serra	ES	\N	grupotga.br@gmail.com	\N	1	t	2026-04-08 13:41:50.612	2026-04-08 13:41:50.612	\N	\N	\N	430	\N	\N	\N
cmnq3kazc00xx9gtkhhsai6qo	409	EDUCO REPRESENTAÇÕES LTDA	\N	05967893000162	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS ES	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.617	2026-04-08 13:41:50.617	\N	\N	\N	431	\N	\N	\N
cmnq3kazh00y09gtk5vb6sb3b	410	FLAVIO (FORTECH)	\N	05991044000144	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.621	2026-04-08 13:41:50.621	\N	\N	\N	432	\N	\N	\N
cmnq3kazm00y39gtkhs2tlzzq	411	DISTRICOMP ESPIRITO SANTO INFORMATICA LTDA	\N	06028932000129	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3208-8923	dulci_es@districomp.com.br	\N	1	t	2026-04-08 13:41:50.627	2026-04-08 13:41:50.627	\N	\N	\N	433	\N	\N	\N
cmnq3kazs00y69gtklwqrg0oc	412	R.E.D. GRANITI MINERAÇÃO LTDA	\N	06037082000125	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	02730245428	tania@redgraniti.com.br	\N	1	t	2026-04-08 13:41:50.632	2026-04-08 13:41:50.632	\N	\N	\N	434	\N	\N	\N
cmnq3kbue01fu9gtkt02vh6pa	624	MOWEN FLORA RESINAS LTDA	\N	14812039000118	CNPJ	9	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.734	2026-04-08 13:41:51.734	\N	\N	\N	646	\N	\N	\N
cmnq3kazx00y99gtk2oz2xhpi	413	NEOTASS PUBLICIDADE E PRODUCOES LTDA - ME	\N	06052772000153	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 4251 1200	nathalia@neotass.com.br	\N	1	t	2026-04-08 13:41:50.637	2026-04-08 13:41:50.637	\N	\N	\N	435	\N	\N	\N
cmnq3kb0100yc9gtkaw4fbc72	414	ACOS DISTRIBUIDORA LTDA - ME	\N	06055204000106	CNPJ	1	MENSAL	ATIVA	GRUPO EUROPA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3038-5999	george@civitt.com.br	\N	1	t	2026-04-08 13:41:50.641	2026-04-08 13:41:50.641	\N	\N	\N	436	\N	\N	\N
cmnq3kb0700yf9gtkz7hdqppq	415	COGRA DISTRIBUIDORA LTDA	\N	06064114000262	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	29147030	ROD GOVERNADOR MARIO COVAS - 10.600 - SERRA DO ANIL - SALA 66 LOTE TABAJARA	\N	\N	\N	CARIACICA	ES	(27) 3061-8258/ (27) 3335-4646	raul@cogra.com.br	\N	1	t	2026-04-08 13:41:50.647	2026-04-08 13:41:50.647	\N	\N	\N	437	\N	\N	\N
cmnq3kb0c00yi9gtkvhmrr65n	416	SUINCO - COOPERATIVA DE SUINOCULTORES LTDA	\N	06067949000780	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168069	RUA 3 B - 192 A - CIVIT II - SALA 11	\N	\N	\N	SERRA	ES	(34) 3826-1200	suelen.santos@suinco.com.br	\N	1	t	2026-04-08 13:41:50.652	2026-04-08 13:41:50.652	\N	\N	\N	438	\N	\N	\N
cmnq3kb0g00yl9gtkfg580cqp	417	MARMOBRÁS QUARRY COMÉRCIO DE MÁRMORES E GRANITOS LTDA	\N	06238404000102	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	almeidajeff@yahoo.com.br	\N	1	t	2026-04-08 13:41:50.657	2026-04-08 13:41:50.657	\N	\N	\N	439	\N	\N	\N
cmnq3kb0m00yo9gtkhjt8afk9	418	POLO ASSESSORIA E SERVICOS ADUANEIROS LTDA - EPP	\N	06238880000115	CNPJ	1	MENSAL	ATIVA	GRUPO STILE	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 2121-5622	rh@stilecomercial.com.br	\N	1	t	2026-04-08 13:41:50.662	2026-04-08 13:41:50.662	\N	\N	\N	440	\N	\N	\N
cmnq3kb0r00yr9gtkkk5y7cln	419	CLIMARIO 2004 COMERCIO E SERVICOS DE REFRIGERACAO LTDA	\N	06260055000117	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	21 30786100	elis.cordeiro@climario2004.com.br	\N	1	t	2026-04-08 13:41:50.667	2026-04-08 13:41:50.667	\N	\N	\N	441	\N	\N	\N
cmnq3kb0v00yu9gtk0n8apyf9	420	LITO TRANSPORTE DE CARGAS LTDA	\N	06302024000181	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.671	2026-04-08 13:41:50.671	\N	\N	\N	442	\N	\N	\N
cmnq3kb1000yx9gtkttrttnuo	421	VIB COMERCIAL IMPORTADORA E EXPORTADORA LTDA	VITORIA INTERNATIONAL BUSINESS	06305291000293	CNPJ	2	MENSAL	ATIVA	GRUPO VIB	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal	88301320	RUA SAMUEL HEUSI, 463	\N	\N	\N	ITAJAI	SC	(47) 3345-5292	financeiro@vib.com.br	\N	1	t	2026-04-08 13:41:50.676	2026-04-08 13:41:50.676	\N	\N	\N	443	\N	\N	\N
cmnq3kb1700z09gtkureo0cwi	422	VIB COMERCIAL IMPORTADORA E EXPORTADORA LTDA	VITORIA INTERNACIONAL BUSINESS	06305291000455	CNPJ	2	MENSAL	ATIVA	GRUPO VIB	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal	57020340	RUA BARAO DE PENEDO, 187	\N	\N	\N	MACEIO	AL	(82) 3317-5951 / (82) 3317-5952	atendimento@realcontabil-al.com.br	\N	1	t	2026-04-08 13:41:50.683	2026-04-08 13:41:50.683	\N	\N	\N	444	\N	\N	\N
cmnq3kb1c00z39gtknde4ph5j	423	UNISAM OFFSHORE AGENCIA MARITIMA E OPERADORA PORTUARIA LTDA	\N	06319981000110	CNPJ	1	AVULSO	ATIVA	GRUPO UNISAM	1	2016-06-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	\N	Rua Jony João de Deus - 100 - Enseada do Sua	\N	\N	\N	Vitoria	ES	27 92818729	fabio@unisam.com.br	\N	1	t	2026-04-08 13:41:50.688	2026-04-08 13:41:50.688	\N	\N	\N	445	\N	\N	\N
cmnq3kb1h00z69gtk1297u7vk	424	UNISAM OFFSHORE AGENCIA MARITIMA E OPERADORA PORTUARIA LTDA	\N	06319981000200	CNPJ	2	MENSAL	ATIVA	GRUPO UNISAM	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil	20090908	AV RIO BRANCO - 45 - CENTRO	\N	\N	\N	RIO DE JANEIRO	RJ	21 22421526	raphael@unisam.com.br	\N	1	t	2026-04-08 13:41:50.693	2026-04-08 13:41:50.693	\N	\N	\N	446	\N	\N	\N
cmnq3kb1n00z99gtk33zds3y4	425	UNISAM OFFSHORE AGENCIA MARITIMA E OPERADORA PORTUARIA LTDA	\N	06319981000382	CNPJ	2	MENSAL	ATIVA	GRUPO UNISAM	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil	23900290	R QUARESMA JUNIOR - 160 - CENTRO	\N	\N	\N	ANGRA DOS REIS	RJ	(27) 3041-3197	raphael@unisam.com.br	\N	1	t	2026-04-08 13:41:50.699	2026-04-08 13:41:50.699	\N	\N	\N	447	\N	\N	\N
cmnq3kb1s00zc9gtkqupxz122	426	UNISAM OFFSHORE AGENCIA MARITIMA E OPERADORA PORTUARIA LTDA	\N	06319981000463	CNPJ	2	MENSAL	ATIVA	GRUPO UNISAM	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil	57036850	AV ALVARO OTACILIO - 3731 - JATIUCA	\N	\N	\N	MACEIO	AL	82 32416338	raphael@unisam.com.br	\N	1	t	2026-04-08 13:41:50.705	2026-04-08 13:41:50.705	\N	\N	\N	448	\N	\N	\N
cmnq3kb1x00zf9gtk0maozgzr	427	EXOTIC IMPORTACAO, EXPORTACAO DE MARMORES E GRANITOS LTDA	\N	06864408000198	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2011-03-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27 3328-2885	\N	\N	1	t	2026-04-08 13:41:50.709	2026-04-08 13:41:50.709	\N	\N	\N	449	\N	\N	\N
cmnq3kb2300zi9gtkzrw9drfv	428	HF COMERCIO DE VEDACOES LTDA - ME	\N	06907527000180	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	7	2017-12-11 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29164010	Rua Acácio Godim. Qd. 07, Lote 31-A - 55 - Jardim Limoeiro	\N	\N	\N	Serra	ES	(27)3228-7969	comercial@hfvedacoes.com.br	\N	1	t	2026-04-08 13:41:50.715	2026-04-08 13:41:50.715	\N	\N	\N	450	\N	\N	\N
cmnq3kb2700zl9gtkf942sa4m	429	BELLAVER TRANSPORTES LTDA	\N	06960631000309	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29103091	RODOVIA DARLY SANTOS - SN - ARACAS - KM 2,5 LOJA 01	\N	\N	\N	\N	ES	(27) 3299-8586	\N	\N	1	t	2026-04-08 13:41:50.72	2026-04-08 13:41:50.72	\N	\N	\N	451	\N	\N	\N
cmnq3kb2c00zo9gtk4kwmvajd	430	POLICABOS - COMERCIO DE PRODUTOS DE TELEINFORMATICA LTDA	\N	07034260000127	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	2017-04-28 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	86010510	Rua Espírito Santo - 255 - Centro	\N	\N	\N	Londrina	PR	4333757738	financeiro@policabos.com.br	\N	1	t	2026-04-08 13:41:50.725	2026-04-08 13:41:50.725	\N	\N	\N	452	\N	\N	\N
cmnq3kb2i00zr9gtk8fc1ackx	431	SIDERMETAL METALURGICA LTDA	SIDERMETAL	07057918000116	CNPJ	1	MENSAL	ATIVA	GRUPO SIDERAL	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29168103	R REILLY DUARTE, 747D	\N	\N	\N	SERRA	ES	(27) 3328-3731	sidtec@sideraltec.com.br	\N	1	t	2026-04-08 13:41:50.731	2026-04-08 13:41:50.731	\N	\N	\N	453	\N	\N	\N
cmnq3kb2p00zu9gtk82rj6scl	432	JJI IMPORTACAO E EXPORTACAO LTDA	\N	07071009000132	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.737	2026-04-08 13:41:50.737	\N	\N	\N	454	\N	\N	\N
cmnq3kb2u00zx9gtkil1vb9vh	433	HIPER ENTREGAMOS MIX DE MATERIAIS LTDA - ME	\N	07100104000117	CNPJ	1	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29164072	AV BRIGADEIRO EDUARDO GOMES - 196 - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	27 21215665	sig@eletrosolda.com.br	\N	1	t	2026-04-08 13:41:50.742	2026-04-08 13:41:50.742	\N	\N	\N	455	\N	\N	\N
cmnq3kb3001009gtkoepz8x80	434	HIPER ENTREGAMOS MIX DE MATERIAIS LTDA - ME	\N	07100104000206	CNPJ	2	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	RUA CARAJAS II - 42 - CENTRO	\N	\N	\N	CANAA DOS CARAJAS	PA	27 21215665	sig@eletrosolda.com.br	\N	1	t	2026-04-08 13:41:50.748	2026-04-08 13:41:50.748	\N	\N	\N	456	\N	\N	\N
cmnq3kb3401039gtklgaopeka	435	MONTE D OURO MINERAÇÃO LTDA	\N	07208734000100	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	2018-04-27 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29843000	Crg Cacipore, S/N - Faz.Cruzeiro Do Sul Zona Rural, Vila Pavao, - S/N	\N	\N	\N	Vila Pavão	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.753	2026-04-08 13:41:50.753	\N	\N	\N	457	\N	\N	\N
cmnq3kb3901069gtkv4bvil7f	436	PBA SERVIÇOS E COMÉRCIO DE PEDRAS ORNAMENTAIS LTDA	\N	07214630000108	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	2018-05-02 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.757	2026-04-08 13:41:50.757	\N	\N	\N	458	\N	\N	\N
cmnq3kb3f01099gtkwuo1scbs	437	SUPRIBEM DISTRIBUIDORA LTDA	\N	07225951000108	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.763	2026-04-08 13:41:50.763	\N	\N	\N	459	\N	\N	\N
cmnq3kb3k010c9gtkx0u5jwpn	438	RLX INDUSTRIAL IMPORTADORA S/A	\N	07312248000137	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	51 9952 6684	RAMON@RCAPITAL.COM.BR	\N	1	t	2026-04-08 13:41:50.768	2026-04-08 13:41:50.768	\N	\N	\N	460	\N	\N	\N
cmnq3kb3o010f9gtk8n3cxdg8	439	MTR Logística EIRELI	\N	07360468000136	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	MICHEL@ativagestao.com.br	\N	1	t	2026-04-08 13:41:50.773	2026-04-08 13:41:50.773	\N	\N	\N	461	\N	\N	\N
cmnq3kb3t010i9gtkumno9b4d	440	REVEST MARMORES E GRANITOS LTDA	\N	07367727000150	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.777	2026-04-08 13:41:50.777	\N	\N	\N	462	\N	\N	\N
cmnq3kb3y010l9gtk1l0sld8r	441	ODONTO ENGEL LTDA	\N	07545135000181	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.783	2026-04-08 13:41:50.783	\N	\N	\N	463	\N	\N	\N
cmnq3kb43010o9gtkoge305f8	442	HIDRITEC COMERCIO E MANUTENCAO DE MATERIAL HIDRAULICO LTDA - EPP	\N	07545654000140	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 32013025	juniormachado@gbgrupo.com.br	\N	1	t	2026-04-08 13:41:50.787	2026-04-08 13:41:50.787	\N	\N	\N	464	\N	\N	\N
cmnq3kb4e010u9gtkk0w4ijqi	444	SERV-FOOD ALIMENTACAO E SERVICOS LTDA.	SERV FOOD	07567242000100	CNPJ	1	AVULSO	ATIVA	GRUPO REAL FOOD	5	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29162715	AVENIDA CORONEL MANOEL NUNES, 923	\N	\N	\N	SERRA	ES	(27) 3067-6006	contabilidade@servfood.com.br	\N	1	t	2026-04-08 13:41:50.798	2026-04-08 13:41:50.798	\N	\N	\N	466	\N	\N	\N
cmnq3kb4j010x9gtkr5t5h6j0	445	SERV-FOOD ALIMENTACAO E SERVICOS LTDA.	\N	07567242000704	CNPJ	2	AVULSO	ATIVA	GRUPO REAL FOOD	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.803	2026-04-08 13:41:50.803	\N	\N	\N	467	\N	\N	\N
cmnq3kb4n01109gtkq3cv5hcx	446	SERV-FOOD ALIMENTACAO E SERVICOS LTDA	\N	07567242000887	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.808	2026-04-08 13:41:50.808	\N	\N	\N	468	\N	\N	\N
cmnq3kb4t01139gtkm12xvxbf	447	SERV-FOOD ALIMENTACAO E SERVICOS LTDA.	\N	07567242001697	CNPJ	2	AVULSO	ATIVA	GRUPO REAL FOOD	\N	\N	\N	\N	\N	\N	\N	\N	\N	29129899	A RURAL - SN - AREA RURAL DE VILA VELHA - KM 313 PEVV-VI	\N	\N	\N	VILA VELHA	ES	(27) 3067-6006	contabilidade@servfood.com.br	\N	1	t	2026-04-08 13:41:50.814	2026-04-08 13:41:50.814	\N	\N	\N	469	\N	\N	\N
cmnq3kb4y01169gtkcugiarbm	448	AUTO POSTO CORAL LTDA	\N	07571908000102	CNPJ	1	AVULSO	ATIVA	GRUPO REDE NORTE SUL	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	272104-8300	comercial@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.818	2026-04-08 13:41:50.818	\N	\N	\N	470	\N	\N	\N
cmnq3kb5201199gtkrquzx4jx	449	CONVENIENCIA RECANTO DOS CORAIS LTDA-ME	\N	07571929000110	CNPJ	1	AVULSO	ATIVA	GRUPO REDE NORTE SUL	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	272104-8300	comercial@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.823	2026-04-08 13:41:50.823	\N	\N	\N	471	\N	\N	\N
cmnq3kb5a011c9gtkp2u9lmk0	450	PNEUS BRASIL COMERCIO E RENOVADORA LTDA	\N	07597544000202	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.831	2026-04-08 13:41:50.831	\N	\N	\N	472	\N	\N	\N
cmnq3kb5g011f9gtk6pkjp13j	451	CS3 MARMORES E GRANITOS LTDA	\N	07599291000125	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.836	2026-04-08 13:41:50.836	\N	\N	\N	473	\N	\N	\N
cmnq3kb5l011i9gtk1quuq4m6	452	HSM LOCACOES LTDA	\N	07657684000148	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	29164078	RUA ERICO VERISSIMO - 342 - JARDIM LIMOEIRO	\N	\N	\N	\N	ES	(27) 3328-0185 / (27) 3337-6737	ellen_hoffman_@hotmail.com	\N	1	t	2026-04-08 13:41:50.841	2026-04-08 13:41:50.841	\N	\N	\N	474	\N	\N	\N
cmnq3kb5r011l9gtk2wzdsia3	453	FUAD AUADA IMPORTACAO E EXPORTACAO LTDA	\N	07659728000179	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3224-9533	luciano@selezione.com.br	\N	1	t	2026-04-08 13:41:50.847	2026-04-08 13:41:50.847	\N	\N	\N	475	\N	\N	\N
cmnq3kb5w011o9gtkdbq6s20p	454	DNA DISTRIBUIDORA DE TECIDOS E CONFECCOES EIRELI	\N	07714532000130	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2006-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29135000	Rua Idalino de Carvalho - Parque Industrial	\N	\N	\N	Viana	ES	11 5531-5373	\N	\N	1	t	2026-04-08 13:41:50.852	2026-04-08 13:41:50.852	\N	\N	\N	476	\N	\N	\N
cmnq3kb66011u9gtk34h86iag	456	CINTYA COMERCIAL PECAS DE BICICLETAS LTDA	\N	07736307000102	CNPJ	1	POTENCIAL	ATIVA	GRUPO CINTYA 	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	29164140	Rodovia ES-010 - SN - Jardim Limoeiro	\N	\N	\N	Serra	ES	(27) 3205-8383	anderson.vidigal@grupocintya.com.br, jean.lacerda@grupocintya.com.br	\N	1	t	2026-04-08 13:41:50.862	2026-04-08 13:41:50.862	\N	\N	\N	478	\N	\N	\N
cmnq3kb6b011x9gtk45ivv0xv	457	R&D COMERCIO, IMPORTACAO, EXPORTACAO E INDUSTRIA DE MATERIAIS ELETRICOS S.A.	\N	07747715000232	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	sonia@flc.com.br	\N	1	t	2026-04-08 13:41:50.867	2026-04-08 13:41:50.867	\N	\N	\N	479	\N	\N	\N
cmnq3kb6f01209gtke2v04n7r	458	TARGET COM LUMINARIAS E DECORACAO EIRELI	\N	07859468000185	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2006-05-16 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.872	2026-04-08 13:41:50.872	\N	\N	\N	480	\N	\N	\N
cmnq3kb6l01239gtk08sqd9jo	459	VITALCORE IMPORTACAO E DISTRIBUICAO DE PRODUTOS MEDICOS LTDA	\N	07894229000166	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	29101350	RUA CONSTRUTOR SEBASTIAO SOARES DE SOUZA - 40 - PRAIA DA COSTA - SALA 607 EDIF INFINITY CENTER	\N	\N	\N	\N	ES	(27) 3235-8082 / (27) 3315-4706	elainesouza@vitalcordistribuidor.a.co	\N	1	t	2026-04-08 13:41:50.878	2026-04-08 13:41:50.878	\N	\N	\N	481	\N	\N	\N
cmnq3kb6r01269gtkudiwt1fd	460	MIXTEL DISTRIBUIDORA LTDA	\N	07941752000104	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.883	2026-04-08 13:41:50.883	\N	\N	\N	482	\N	\N	\N
cmnq3kb6v01299gtkl9za4tc1	461	LA VITA COMERCIO VAREJISTA E ATACADISTA DE PRODUTOS ALIMENTICIOS EIRELI	\N	07944657000156	CNPJ	1	MENSAL	ATIVA	GRUPO LA VITA	4	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29100100	Rua 23 de Maio - Centro de Vila Velha	\N	\N	\N	Vila Velha	ES	3311-2555	\N	\N	1	t	2026-04-08 13:41:50.888	2026-04-08 13:41:50.888	\N	\N	\N	483	\N	\N	\N
cmnq3kb71012c9gtkv60sq20y	462	ACTIVE IMPORTACAO E EXPORTACAO EIRELI	\N	07953696000110	CNPJ	1	MENSAL	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29050545	RUA JOSE ALEXANDRE BUAIZ, EDIF LONDON OFFICE TOWER SALA 1023 - 160 - ENSEADA DO SUA	\N	\N	\N	VITORIA	ES	2799962-0975	marcelobuteri@hotmail.com	\N	1	t	2026-04-08 13:41:50.893	2026-04-08 13:41:50.893	\N	\N	\N	484	\N	\N	\N
cmnq3kb76012f9gtkuls1xmen	463	BARBARA PERFUMARIA E COSMETICOS LTDA - ME	\N	07987199000132	CNPJ	1	AVULSO	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Trabalhista	29060120	Rua Carlos Eduardo Monteiro de Lemos - 262 - Jardim da Penha	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:50.899	2026-04-08 13:41:50.899	\N	\N	\N	485	\N	\N	\N
cmnq3kb7b012i9gtk3uq1h9fa	464	ESCRITA INDUSTRIA E SERVICOS DE SUPRIMENTOS PARA ESCRITORIO LTDA	\N	08053031000112	CNPJ	1	MENSAL	ATIVA	GRUPO ESCRITA	1	2006-05-29 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29163278	Rua Manoel Bandeira - 890 - São Doigo I	\N	\N	\N	Serra	ES	(11) 3665-1010	\N	\N	1	t	2026-04-08 13:41:50.903	2026-04-08 13:41:50.903	\N	\N	\N	486	\N	\N	\N
cmnq3kb7f012l9gtk4vzcrmvm	465	ESCRITA INDUSTRIA E SERVICOS DE SUPRIMENTOS PARA ESCRITORIO LTDA	\N	08053031000201	CNPJ	2	MENSAL	ATIVA	GRUPO ESCRITA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	01227000	Av Angelica - 321 - Santa Cecilia	\N	\N	\N	São Paulo	SP	(11) 5103-5950	catia@escritapen.com.br	\N	1	t	2026-04-08 13:41:50.907	2026-04-08 13:41:50.907	\N	\N	\N	487	\N	\N	\N
cmnq3kb7l012o9gtkmsyzptd0	466	SIDMEX LOGISTICA SA	\N	08140465000150	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3146-0003	elisabete.brossi@radac.com.br	\N	1	t	2026-04-08 13:41:50.914	2026-04-08 13:41:50.914	\N	\N	\N	488	\N	\N	\N
cmnq3kb7q012r9gtkqyuquwjp	467	LRD AUTOMOTIVE	\N	08185149000102	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	6	2018-10-09 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.918	2026-04-08 13:41:50.918	\N	\N	\N	489	\N	\N	\N
cmnq3kb7u012u9gtkye4p8ls8	468	REVEST BEM TECIDOS REVESTIMENTOS E DECORACOES LTDA	\N	08229025000173	CNPJ	9	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	44002300	PC FROES DA MOTA - 51 - CENTRO	\N	\N	\N	FEIRA DE SANTANA	BA	(75) 3225-1946/ (75) 3221-4724	revestbem@gmail.com	\N	1	t	2026-04-08 13:41:50.923	2026-04-08 13:41:50.923	\N	\N	\N	490	\N	\N	\N
cmnq3kb81012x9gtkm04qb5ov	469	MBUCKS PRODUTOS DE DECORAÇÃO LTDA	\N	08308319000190	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	000000000	lmykp@hotmail.com	\N	1	t	2026-04-08 13:41:50.929	2026-04-08 13:41:50.929	\N	\N	\N	491	\N	\N	\N
cmnq3kb8501309gtkqi1wbmni	470	PERFUMES WEB COMERCIO DE ARTIGOS DE PERFUMARIA LTDA - ME	\N	08352434000162	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 21458850	raquel@azperfumes.com.br	\N	1	t	2026-04-08 13:41:50.934	2026-04-08 13:41:50.934	\N	\N	\N	492	\N	\N	\N
cmnq3kb8a01339gtkggqnfvli	471	NORTE BEER DISTRIBUIDORA DE BEBIDAS LTDA	\N	08419214000109	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 21000000	lindalva@central-rnc.com.br	\N	1	t	2026-04-08 13:41:50.938	2026-04-08 13:41:50.938	\N	\N	\N	493	\N	\N	\N
cmnq3kb8f01369gtkjls7kqrx	472	CERIMONIAL CRISTALIS LTDA	\N	08486526000135	CNPJ	1	MENSAL	ATIVA	GRUPO CRISTALIS	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29166820	AVENIDA COPACABANA, S/N	\N	\N	\N	SERRA	ES	(27) 3328-1993	contato@cerimonialcristalis.com.br	\N	1	t	2026-04-08 13:41:50.944	2026-04-08 13:41:50.944	\N	\N	\N	494	\N	\N	\N
cmnq3kb8l01399gtk8oapbqfs	473	M. LOG TRANSPORTES LTDA - ME	\N	08581210000122	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(31) 21279000	daniela.araujo@magnun.com.br	\N	1	t	2026-04-08 13:41:50.949	2026-04-08 13:41:50.949	\N	\N	\N	495	\N	\N	\N
cmnq3kb8q013c9gtk86wjv9kq	474	AUTO POSTO SANTA PAULA LTDA	\N	08589031000131	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29042284	AVENIDA CORONEL JOSE MARTINS DE FIGUEIREDO - 15 - FRADINHOS - LOJA 02	\N	\N	\N	VITORIA	ES	(27) 3222-4802	postomaruipe@hotmail.com	\N	1	t	2026-04-08 13:41:50.954	2026-04-08 13:41:50.954	\N	\N	\N	496	\N	\N	\N
cmnq3kb8u013f9gtktyyebb98	475	SEREDE - SERVIÇOS DE REDE S.A	\N	08596854009736	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.959	2026-04-08 13:41:50.959	\N	\N	\N	497	\N	\N	\N
cmnq3kb91013i9gtkp09tjwh4	476	ACR COMERCIO DE ALIMENTOS LTDA EPP	\N	08606385000147	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:50.965	2026-04-08 13:41:50.965	\N	\N	\N	498	\N	\N	\N
cmnq3kb95013l9gtko850yuh9	477	INTERCOMM LOGISTICA LTDA	\N	08614527000118	CNPJ	1	MENSAL	ATIVA	GRUPO STILE	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	29147030	ROD GOVERNADOR MARIO COVAS - 10600 - SERRA DO ANIL	\N	\N	\N	CARIACICA	ES	27 2121-5645	\N	\N	1	t	2026-04-08 13:41:50.97	2026-04-08 13:41:50.97	\N	\N	\N	499	\N	\N	\N
cmnq3kb9a013o9gtkb4zmsnd7	478	DATASUL BAHIA SA	\N	08625228000189	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS BA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30386300	gilda.batista@totvs.com.br	\N	1	t	2026-04-08 13:41:50.974	2026-04-08 13:41:50.974	\N	\N	\N	500	\N	\N	\N
cmnq3kb9g013r9gtkuxh40a0t	479	STYLO DISTRIBUIDORA DE PRESENTES LTDA	\N	08771344000106	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 82186989	chicngd@gmail.com	\N	1	t	2026-04-08 13:41:50.98	2026-04-08 13:41:50.98	\N	\N	\N	501	\N	\N	\N
cmnq3kb9k013u9gtk4fd2aie5	480	Z3 COMERCIO E SERVICOS LTDA - ME	\N	08817671000151	CNPJ	1	MENSAL	ATIVA	GRUPO VIP REDE	1	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29050909	RUA ABIAIL DO AMARAL CARNEIRO - 191 - Enseada do Suá - LOJA 03 EDIF ARABICA	\N	\N	\N	VITORIA	ES	(27) 4009-4802	financeiro@viprede.com	\N	1	t	2026-04-08 13:41:50.985	2026-04-08 13:41:50.985	\N	\N	\N	502	\N	\N	\N
cmnq3kb9p013x9gtkzm7jik57	481	J. C. M. NITEROI REFRIGERACAO LTDA	\N	08824171000147	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	21 30786100	elis.cordeiro@climario2004.com.br	\N	1	t	2026-04-08 13:41:50.989	2026-04-08 13:41:50.989	\N	\N	\N	503	\N	\N	\N
cmnq3kb9u01409gtki5z9gm00	482	J. C. M. NITEROI REFRIGERACAO LTDA	\N	08824171000228	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	21 30786100	elis.cordeiro@climario2004.com.br	\N	1	t	2026-04-08 13:41:50.994	2026-04-08 13:41:50.994	\N	\N	\N	504	\N	\N	\N
cmnq3kb9z01439gtktx6mg2du	483	J. C. M. NITEROI REFRIGERAÇÃO LTDA	\N	08824171000570	CNPJ	2	AVULSO	ATIVA	GRUPO CLIMARIO	1	2013-10-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29168080	Avenida Talma Rodrigues - 1655 - Civit II	\N	\N	\N	Serra	ES	\N	renato.gimenes@climario2004.com.br	\N	1	t	2026-04-08 13:41:51	2026-04-08 13:41:51	\N	\N	\N	505	\N	\N	\N
cmnq3kba401469gtk8o5m398v	484	J. C. M. NITEROI REFRIGERAÇÃO LTDA	\N	08824171000651	CNPJ	2	MENSAL	ATIVA	GRUPO CLIMARIO	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29168080	Avenida Talma Rodrigues Ribeiro - 1655 - Civit II	\N	\N	\N	Serra	ES	\N	renato.gimenes@climario2004.com.br	\N	1	t	2026-04-08 13:41:51.004	2026-04-08 13:41:51.004	\N	\N	\N	506	\N	\N	\N
cmnq3kba901499gtko91kswxi	485	J. C. M. NITEROI REFRIGERACAO LTDA	\N	08824171000813	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	21 30786100	elis.cordeiro@climario2004.com.br	\N	1	t	2026-04-08 13:41:51.009	2026-04-08 13:41:51.009	\N	\N	\N	507	\N	\N	\N
cmnq3kbae014c9gtk2v7gy2xj	486	J. C. M. NITEROI REFRIGERACAO LTDA	\N	08824171000902	CNPJ	1	MENSAL	ATIVA	GRUPO CLIMARIO	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	29168080	Avenida Talma Rodrigues Ribeiro - 1655 - CIVIT II	\N	\N	\N	SERRA	ES	27 3218-5382	renato.gimenes@climario2004.com.br	\N	1	t	2026-04-08 13:41:51.015	2026-04-08 13:41:51.015	\N	\N	\N	508	\N	\N	\N
cmnq3kbaj014f9gtk4v06d69e	487	COSTA SERVICOS LTDA - ME	\N	08839744000106	CNPJ	1	MENSAL	ATIVA	GRUPO COSTANOX	1	2014-12-01 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29108040	Rua Antonio Barcelos - Santa Ines	\N	\N	\N	Vila Velha	ES	27 33190305	jjanox@jjanox.com.br	\N	1	t	2026-04-08 13:41:51.02	2026-04-08 13:41:51.02	\N	\N	\N	509	\N	\N	\N
cmnq3kbao014i9gtkfy58b3r8	488	EUROSOLDA COMERCIO E LOCACOES LTDA - ME	\N	08865942000144	CNPJ	1	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	AVENIDA ALMIRANTE PAULO MOREIRA - 434 - CIDADE GARAPU	\N	\N	\N	CABO DE SANTO AGOSTINHO	PE	81 35511718	CONTROL@ELETROSOLDA.COM.BR	\N	1	t	2026-04-08 13:41:51.024	2026-04-08 13:41:51.024	\N	\N	\N	510	\N	\N	\N
cmnq3kbau014l9gtkv7cd921z	489	EUROSOLDA COMERCIO E LOCACOES LTDA - ME	\N	08865942000225	CNPJ	2	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	AVENIDA FERNANDO FERRARI - 2913 - SOLON BORGES	\N	\N	\N	VITORIA	ES	27 21215656	ELETROSOLDA@ELETROSOLDA.COM.BR	\N	1	t	2026-04-08 13:41:51.031	2026-04-08 13:41:51.031	\N	\N	\N	511	\N	\N	\N
cmnq3kbaz014o9gtkdxh9aysj	490	LRX COMERCIAL IMPORTADORA & EXPORTADORA EIRELI	\N	08871748000171	CNPJ	1	MENSAL	ATIVA	GRUPO CILOMEX	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	rosangela@cilomex.xom.br	\N	1	t	2026-04-08 13:41:51.035	2026-04-08 13:41:51.035	\N	\N	\N	512	\N	\N	\N
cmnq3kbb3014r9gtkfef4db9v	491	GAVEA IMPORTAÇÃO E EXPORTAÇÃO EIRELI	\N	08912771000167	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	antonio@gaveadistribuidora.com.br	\N	1	t	2026-04-08 13:41:51.039	2026-04-08 13:41:51.039	\N	\N	\N	513	\N	\N	\N
cmnq3kbba014u9gtkwhj1h0de	492	BIANCOGRES VINILICO LTDA	\N	08930868000100	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29168073	RUA 5 - S/N - CIVIT II - LOTE 001 QUADRA8-A	\N	\N	\N	SERRA	ES	(27) 3421-9117	contabilidade@biancogres.com.br	\N	1	t	2026-04-08 13:41:51.046	2026-04-08 13:41:51.046	\N	\N	\N	514	\N	\N	\N
cmnq3kbbe014x9gtkjq26p4z4	493	GSN DISTRIBUIDORA DE MATERIAIS ELETRICOS EIRELI	\N	08943295000141	CNPJ	1	MENSAL	ATIVA	GRUPO GSN	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	19164046	Rua Guimarães Junior - Jardim Limoeiro	\N	\N	\N	Serra	ES	0273066-1315	administrativo@gsndistribuidora.com.br	\N	1	t	2026-04-08 13:41:51.051	2026-04-08 13:41:51.051	\N	\N	\N	515	\N	\N	\N
cmnq3kbbj01509gtkf6u8jo0t	494	RJ INDUSTRIA COMERCIO E ARMAZENAMENTO DE ALIMENTOS LTDA	\N	08960738000102	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	71-3251-8050	lucas silva@bomfimnet.com	\N	1	t	2026-04-08 13:41:51.055	2026-04-08 13:41:51.055	\N	\N	\N	516	\N	\N	\N
cmnq3kbbp01539gtkini3os5m	495	GENOMMA LABORATORIES DO BRASIL LTDA.	\N	09080907000182	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 21294700	CROMANHOLI@GENOMMALAB.COM.BR	\N	1	t	2026-04-08 13:41:51.061	2026-04-08 13:41:51.061	\N	\N	\N	517	\N	\N	\N
cmnq3kbbu01569gtkogqezyd9	496	GENOMMA LABORATORIES DO BRASIL LTDA.	\N	09080907000344	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 21294700	CROMANHOLI@GENOMMALAB.COM.BR	\N	1	t	2026-04-08 13:41:51.067	2026-04-08 13:41:51.067	\N	\N	\N	518	\N	\N	\N
cmnq3kbbz01599gtkr5ibwot1	497	EMBRATEL TVSAT TELECOMUNICACOES SA (GRUPO CLARO S.A)	\N	09132659000176	CNPJ	1	AVULSO	ATIVA	GRUPO CLARO	3	2017-05-12 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.071	2026-04-08 13:41:51.071	\N	\N	\N	519	\N	\N	\N
cmnq3kbc5015c9gtkjkjo0zrb	498	ARRUELA NACIONAL LTDA EPP	\N	09169227000130	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.077	2026-04-08 13:41:51.077	\N	\N	\N	520	\N	\N	\N
cmnq3kbca015f9gtk94uug411	499	AMP INDUSTRIA E COMERCIO DE CONDUTORES LTDA	\N	09171140000105	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	30520200	R SILEX - 110 - GLALIJA	\N	\N	\N	BELO HORIZONTE	MG	(31) 3498-1511	paulojs@atualizada.com.br	\N	1	t	2026-04-08 13:41:51.083	2026-04-08 13:41:51.083	\N	\N	\N	521	\N	\N	\N
cmnq3kbcf015i9gtkqeh09y4o	500	ALIMENTOS TRIGOMAIS INDUSTRIA E COMERCIO LTDA EPP	\N	09172048000151	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-10-04 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29170047	Rua Rio Pomba - 223 - Nova Carapina	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.087	2026-04-08 13:41:51.087	\N	\N	\N	522	\N	\N	\N
cmnq3kbck015l9gtkjmn403jv	501	RV INDUSTRIA E COMERCIO LTDA ME	\N	09261356000153	CNPJ	1	MENSAL	ATIVA	GRUPO RV INDUSTRIA	3	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	29140580	R EURICO GASPAR DUTRA - 41 - VASCO DA GAMA	\N	\N	\N	CARIACICA	ES	(27) 3326-4622	contato@trigoesabor.com.br	\N	1	t	2026-04-08 13:41:51.092	2026-04-08 13:41:51.092	\N	\N	\N	523	\N	\N	\N
cmnq3kbcq015o9gtkh4lmfj8p	502	RV INDUSTRIA E COMERCIO LTDA ME	\N	09261356000234	CNPJ	2	MENSAL	ATIVA	GRUPO RV INDUSTRIA	\N	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil	29111300	AVENIDA JOAO FRANCISCO GONCALVES - 0 - COBILANDIA - QUADRA131 LOTE 018 E 019	\N	\N	\N	VILA VELHA	ES	(27) 3326-4622	contato@trigoesabor.com.br	\N	1	t	2026-04-08 13:41:51.098	2026-04-08 13:41:51.098	\N	\N	\N	524	\N	\N	\N
cmnq3kbcv015r9gtkkf1sva6f	503	LOCKE COMERCIO E IMPORTACAO DE PRESENTES LTDA	\N	09276124000179	CNPJ	2	EM_CONSTITUICAO	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.103	2026-04-08 13:41:51.103	\N	\N	\N	525	\N	\N	\N
cmnq3kbcz015u9gtkzw8wwb17	504	ORNNA DISTRIBUIDORA EIRELI - EPP	\N	09287935000175	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	11 5549-4965	informatica@grupoornatus.com	\N	1	t	2026-04-08 13:41:51.108	2026-04-08 13:41:51.108	\N	\N	\N	526	\N	\N	\N
cmnq3kbd5015x9gtkku6ahuct	505	ORNNA DISTRIBUIDORA EIRELI - EPP	\N	09287935000256	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2017-08-16 03:00:00	\N	\N	\N	\N	\N	\N	\N	06454050	Alameda Grajaú - 129 - Alphaville Industrial	\N	\N	\N	Barueri	SP	\N	\N	\N	1	t	2026-04-08 13:41:51.114	2026-04-08 13:41:51.114	\N	\N	\N	527	\N	\N	\N
cmnq3kbda01609gtk959dluf4	506	BRUNO AMIGO GUSTAVO	\N	09382770000110	CNPJ	A DEFINIR	MENSAL	ATIVA	EMPRESA ÚNICA	0	2018-10-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.119	2026-04-08 13:41:51.119	\N	\N	\N	528	\N	\N	\N
cmnq3kbdf01639gtkiq5qtczx	507	BRASIL TRONIC COMERCIO DE ELETRO ELETRONICOS LTDA	\N	09382770000200	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29135160	RODOVIA GOVERNADOR MARIO COVAS, S/N	\N	\N	\N	VIANA	ES	(11) 6732-1194	simonefmartin@gmail.com	\N	1	t	2026-04-08 13:41:51.123	2026-04-08 13:41:51.123	\N	\N	\N	529	\N	\N	\N
cmnq3kbdl01669gtkwlks9341	508	ASTER DESENVOLVIMENTO E CONSULTORIA LTDA	\N	09426553000185	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS BA	1	2013-12-01 02:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	73 3222-7000	tais.mota@totvs.com.br	\N	1	t	2026-04-08 13:41:51.129	2026-04-08 13:41:51.129	\N	\N	\N	530	\N	\N	\N
cmnq3kbdq01699gtk4a8e0vqt	509	BAUHAUS EDUCACAO CULTURA E ARTE LTDA	\N	09438760000150	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.135	2026-04-08 13:41:51.135	\N	\N	\N	531	\N	\N	\N
cmnq3kbdv016c9gtktxv2bl9p	510	ARC BRASIL ASSIST - ASSOCIACAO RECREATIVA E CULTURAL DO BRASIL	\N	09476064000138	CNPJ	1	MENSAL	ATIVA	GRUPO ABRASP	0	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	2730248282	contato@asbrasp.com.br	\N	1	t	2026-04-08 13:41:51.139	2026-04-08 13:41:51.139	\N	\N	\N	532	\N	\N	\N
cmnq3kbe0016f9gtk4e9c11dn	511	HKM EMPREENDIMENTOS E PARTICIPAÇÕES LTDA	\N	09493879000125	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.145	2026-04-08 13:41:51.145	\N	\N	\N	533	\N	\N	\N
cmnq3kbe5016i9gtk221h7t0o	512	LT TECNOLOGIA LTDA - ME	\N	09494848000199	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29165025	RUA WAGNER - 167 - LARANJEIRAS	\N	\N	\N	SERRA	ES	(27) 3064-8800	leonardo@figeletro.com.br	\N	1	t	2026-04-08 13:41:51.149	2026-04-08 13:41:51.149	\N	\N	\N	534	\N	\N	\N
cmnq3kbea016l9gtkrse9pujw	513	CBI MEIO AMBIENTE E INFRAESTRUTURA LTDA	\N	09551724000440	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	48 3239-7771	vanessa.novgorodcev@cbi.com	\N	1	t	2026-04-08 13:41:51.154	2026-04-08 13:41:51.154	\N	\N	\N	535	\N	\N	\N
cmnq3kbef016o9gtkxbuofw1x	514	VIX OFFSHORE E SERVICOS MARITIMOS LTDA ME	\N	09569210000170	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29050911	Avenida Américo Buaiz - 501 - Enseada do Suá	\N	\N	\N	Vitória	ES	02731413197	michelle@unisam.com.br	\N	1	t	2026-04-08 13:41:51.16	2026-04-08 13:41:51.16	\N	\N	\N	536	\N	\N	\N
cmnq3kbek016r9gtkxcuyp3cm	515	MARES CONSULTORIA E REPRESENTACOES LTDA	\N	09635385000138	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 9251-0788	margareth@maresrep.com.br	\N	1	t	2026-04-08 13:41:51.165	2026-04-08 13:41:51.165	\N	\N	\N	537	\N	\N	\N
cmnq3kbep016u9gtkfb79tgud	516	GLOBALEX COMERCIO INTERNACIONAL LTDA	\N	10245831000187	CNPJ	1	AVULSO	ATIVA	GRUPO GLOBALEX	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.17	2026-04-08 13:41:51.17	\N	\N	\N	538	\N	\N	\N
cmnq3kbeu016x9gtkjid15d0u	517	TWI COMERCIO DE PNEUS LTDA	\N	10260700000179	CNPJ	9	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	36500001	AVENIDA DOS EX COMBATENTES - 614 - SANTA LUZIA	\N	\N	\N	UBA	MG	(32) 3539-2807	contabil1@jacarpneus.com.br	\N	1	t	2026-04-08 13:41:51.174	2026-04-08 13:41:51.174	\N	\N	\N	539	\N	\N	\N
cmnq3kbf001709gtkxcx08ezi	518	B11 - SERVICOS DE CARGA E DESCARGA E PROMOCOES LTDA	\N	10304787000139	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2019-10-07 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29146240	Rua Moreira Camargo - 448 - Campo Grande	\N	\N	\N	Cariacica	ES	\N	buru@b11servicos.com.br	\N	1	t	2026-04-08 13:41:51.18	2026-04-08 13:41:51.18	\N	\N	\N	540	\N	\N	\N
cmnq3kbf501739gtkzppcbk72	519	PHARMANUTRI COMERCIO DE MEDICAMENTOS E PRODUTOS NUTRICIONAIS LTDA EM RECUPERACAO JUDICIAL	\N	10323886000168	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2017-09-06 03:00:00	\N	\N	\N	\N	\N	\N	\N	32210120	Rua José Maria de Lacerda - 1900 - Cidade Industrial	\N	\N	\N	Contagem	MG	(31)2559-2908	\N	\N	1	t	2026-04-08 13:41:51.185	2026-04-08 13:41:51.185	\N	\N	\N	541	\N	\N	\N
cmnq3kbf901769gtkyiqszhty	520	PHARMANUTRI COMERCIO DE MEDICAMENTOS E PRODUTOS NUTRICIONAIS LTDA	\N	10323886000320	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	central@central-rnc.com.br	\N	1	t	2026-04-08 13:41:51.19	2026-04-08 13:41:51.19	\N	\N	\N	542	\N	\N	\N
cmnq3kbff01799gtkj8wzsg9b	521	NAJU-ES COMERCIO DE VEÍCULOS LTDA	\N	10428265000149	CNPJ	1	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	contador@gruponaju.com.br	\N	1	t	2026-04-08 13:41:51.195	2026-04-08 13:41:51.195	\N	\N	\N	543	\N	\N	\N
cmnq3kbfj017c9gtkwzzmobh6	522	NAJU-ES COMERCIAL DE VEICULOS LTDA	\N	10428265000220	CNPJ	2	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	janny@seisa.ind.br	\N	1	t	2026-04-08 13:41:51.2	2026-04-08 13:41:51.2	\N	\N	\N	544	\N	\N	\N
cmnq3kbfo017f9gtkvdec0008	523	SANTOS MIRANDA SOCIEDADE DE ENSINO LTDA - ME	\N	10436726000125	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	2017-09-13 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29165130	Avenida Central - 1300 - Parque Residencial Laranjeiras	\N	\N	\N	Serra	ES	(27) 3281-4555 - Celular: (27) 99798-6676	andre.junqueira@cna.com.br	\N	1	t	2026-04-08 13:41:51.205	2026-04-08 13:41:51.205	\N	\N	\N	545	\N	\N	\N
cmnq3kbfu017i9gtklqlw6by8	524	V3 HOLDING S/A	\N	10441417000143	CNPJ	1	MENSAL	ATIVA	GRUPO VIP REDE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	(27) 4009-4802	financeiro@viprede.com	\N	1	t	2026-04-08 13:41:51.21	2026-04-08 13:41:51.21	\N	\N	\N	546	\N	\N	\N
cmnq3kbfy017l9gtkmkwnmqtv	525	PREMIUM ROCK BURGER LANCHONETE LTDA - ME	\N	10460200000180	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2732259322	guilherme@rockburger.com.br	\N	1	t	2026-04-08 13:41:51.215	2026-04-08 13:41:51.215	\N	\N	\N	547	\N	\N	\N
cmnq3kbg3017o9gtk3iqvkm03	526	GUZZO PARAFUSOS LTDA	\N	10471800000144	CNPJ	1	POTENCIAL	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29931090	Rua Monsenhor Guilherme Schimitz - 908 - Dom José Dalvit	\N	\N	\N	São Mateus	ES	3763-2485	\N	\N	1	t	2026-04-08 13:41:51.219	2026-04-08 13:41:51.219	\N	\N	\N	548	\N	\N	\N
cmnq3kbg8017r9gtkcz77p4jr	527	CASA DO CERVEJEIRO LTDA	\N	10491705000102	CNPJ	1	MENSAL	ATIVA	GRUPO BEBIDAS EXPRESS	2	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29050333	Rua Licínio dos Santos Conte - Lojas 23 E 24 - 51 - Enseada do Suá	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.224	2026-04-08 13:41:51.224	\N	\N	\N	549	\N	\N	\N
cmnq3kbgd017u9gtkf0o4h928	528	DINAMICA HIDRO LTDA - ME	\N	10510805000139	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 0000-0000	naoinformado@naoinformado.com.br	\N	1	t	2026-04-08 13:41:51.229	2026-04-08 13:41:51.229	\N	\N	\N	550	\N	\N	\N
cmnq3kbgh017x9gtkqv07y30e	529	PRADO ALUMINIO INDUSTRIA E COMERCIO	\N	10549370000306	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.234	2026-04-08 13:41:51.234	\N	\N	\N	551	\N	\N	\N
cmnq3kbgm01809gtkcprmsbpa	530	POSTO CRISTOVAO COLOMBO LTDA	\N	10569345000114	CNPJ	1	POTENCIAL	ATIVA	GRUPO REDE NORTE SUL	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	272104-8300	comercial@central-rnc.com.br	\N	1	t	2026-04-08 13:41:51.239	2026-04-08 13:41:51.239	\N	\N	\N	552	\N	\N	\N
cmnq3kbgr01839gtkjz34npsa	531	FVR SERVICOS E COMERCIO DE EQUIPAMENTOS EIRELI	\N	10664239000110	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	95170404	R BARAO DO RIO BRANCO - 459 - CENTRO - SALA 21	\N	\N	\N	FARROUPILHA	RS	(54) 2628-8300	\N	\N	1	t	2026-04-08 13:41:51.244	2026-04-08 13:41:51.244	\N	\N	\N	553	\N	\N	\N
cmnq3kbgw01869gtkyl1ryzn5	532	LOGISTIC EMPREENDIMENTOS E GALPOES DE LOGISTICA LTDA	\N	10671652000101	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.248	2026-04-08 13:41:51.248	\N	\N	\N	554	\N	\N	\N
cmnq3kbh001899gtkg4t57g7d	533	CAD MARTINS-ES GESTAO DE EMPREENDIMENTOS S/A	\N	10680415000107	CNPJ	1	AVULSO	ATIVA	REDE NORTE SUL 	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:51.253	2026-04-08 13:41:51.253	\N	\N	\N	555	\N	\N	\N
cmnq3kbh5018c9gtkq9xk4u8v	534	LOPES & CASTELO SOCIEDADE DE ADVOGADOS	\N	10711773000130	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	1	2021-10-19 03:00:00	\N	\N	\N	\N	\N	\N	\N	01311000	AV PAULISTA - 575 - BELA VISTA	\N	\N	\N	SAO PAULO	SP	(11) 3876-1367	lcc@lcc.adv.br	\N	1	t	2026-04-08 13:41:51.258	2026-04-08 13:41:51.258	\N	\N	\N	556	\N	\N	\N
cmnq3kbha018f9gtk0s4ge0f3	535	ROTEC SERVICE MANUTENCOES INDUSTRIAIS LTDA - EPP	\N	10741286000110	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3298 4444	roberto.castiglioni@rotec-es.com.br	\N	1	t	2026-04-08 13:41:51.263	2026-04-08 13:41:51.263	\N	\N	\N	557	\N	\N	\N
cmnq3kbhf018i9gtk3cbfnlhg	536	G.R ETIQUETAS E ROTULOS LTDA ME	\N	10779624000102	CNPJ	1	AVULSO	ATIVA	GRUPO ROTOTEK	0	\N	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29167018	Rua Niteroi - 1 - Alterosas	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.267	2026-04-08 13:41:51.267	\N	\N	\N	558	\N	\N	\N
cmnq3kbhm018l9gtkd4cq5jrj	537	MARCIA SANTOS	CLOSET COLLECTION	10788657000119	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29060670	AVENIDA ANISIO FERNANDES COELHO, 385	\N	\N	\N	VITORIA	ES	(27) 3298-1900	cadastro@ccacontabilidade.com	\N	1	t	2026-04-08 13:41:51.275	2026-04-08 13:41:51.275	\N	\N	\N	559	\N	\N	\N
cmnq3kbhv018o9gtkfu8idphs	538	SUPER VINHOS DISTRIBUIDORA S.A.	\N	10791934000576	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	29126168	RUA HORTENCIA - 180 - SANTA PAULA I - GALPAO0 SETOR C MODULO 16 BOX 101 A 502	\N	\N	\N	VILA VELHA	ES	(32) 3234-9905	garrafaria@garrafaria.com.br	\N	1	t	2026-04-08 13:41:51.283	2026-04-08 13:41:51.283	\N	\N	\N	560	\N	\N	\N
cmnq3kbi0018r9gtkpqm0ursg	539	STRATEGY SOLUCOES TECNOLOGICAS LTDA ME	\N	10797045000192	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	35 3223-1341	rodrigo@grupomgcontabil.com.br	\N	1	t	2026-04-08 13:41:51.288	2026-04-08 13:41:51.288	\N	\N	\N	561	\N	\N	\N
cmnq3kbi4018u9gtk3aintd3f	540	FRANARI PARTICIPACOES LTDA	\N	10872559000165	CNPJ	1	MENSAL	ATIVA	GRUPO GSN	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	\N	29066040	AVENIDA CARLOS GOMES DE SA, 335	\N	\N	\N	VITORIA	ES	(27) 3134-7100 / (27) 2127-9923	expedicao05@tecnicontabil.com.br	\N	1	t	2026-04-08 13:41:51.293	2026-04-08 13:41:51.293	\N	\N	\N	562	\N	\N	\N
cmnq3kbi9018x9gtkfcpzno8k	541	VALFRE SOCIEDADE INDIVIDUAL DE ADVOCACIA	\N	10886199000150	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.297	2026-04-08 13:41:51.297	\N	\N	\N	563	\N	\N	\N
cmnq3kbid01909gtkleip9hs1	542	PRIME ESCRITORIOS COMPARTILHADOS LTDA	\N	10905508000192	CNPJ	1	MENSAL	ATIVA	GRUPO LA VITA	1	2019-01-01 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29100100	Rua 23 de Maio - 84 - Centro de Vila Velha - PAVMTOSUPERIOR	\N	\N	\N	Vila Velha	ES	2733112550	aluizio@grupolavita.com.br	\N	1	t	2026-04-08 13:41:51.302	2026-04-08 13:41:51.302	\N	\N	\N	564	\N	\N	\N
cmnq3kbii01939gtki4jnlmuw	543	INTERMED SAUDE SOLUCOES INTEGRADAS LTDA	\N	10910340000103	CNPJ	1	MENSAL	ATIVA	GRUPO INTERMED	5	2018-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29101260	Avenida Doutor Olívio Lira - SALA 311 BLOCO V - 353 - Praia da Costa	\N	\N	\N	Vila Velha	ES	(27) 3026-7073 / (27) 3029-8300 / 279 98528309	leandro.medeiros@intermedsaude.com.br	\N	1	t	2026-04-08 13:41:51.307	2026-04-08 13:41:51.307	\N	\N	\N	565	\N	\N	\N
cmnq3kbin01969gtkhquixhe1	544	UNIFRIO AR CONDICIONADO LTDA - ME	\N	10916828000148	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2018-02-06 02:00:00	\N	\N	\N	\N	\N	\N	\N	29112650	Rua Hugo Chagas - 28 - Rio Marinho	\N	\N	\N	Vila Velha	ES	2732255118	administracao@eletriclima.com.br	\N	1	t	2026-04-08 13:41:51.311	2026-04-08 13:41:51.311	\N	\N	\N	566	\N	\N	\N
cmnq3kbir01999gtkt4lcl713	545	FORTLEV INDUSTRIA E COMERCIO DE PLASTICOS LTDA	\N	10921911000539	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	2	2018-02-28 03:00:00	\N	\N	\N	\N	\N	\N	\N	29168062	Rua 7 - setor 2 - 120 - CIVIT II	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.316	2026-04-08 13:41:51.316	\N	\N	\N	567	\N	\N	\N
cmnq3kbiw019c9gtkntlqo8uy	546	VEXCOM COMERCIO DE EQUIPAMENTOS LTDA - EPP	\N	10977068000260	CNPJ	2	MENSAL	ATIVA	GRUPO GLOBALEX	1	2013-02-01 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	AV CEM - S/N - TIMS	\N	\N	\N	SERRA	ES	11 3372-7423	financeiro@bma.com.br	\N	1	t	2026-04-08 13:41:51.32	2026-04-08 13:41:51.32	\N	\N	\N	568	\N	\N	\N
cmnq3kbj1019f9gtkoa7o9dwa	547	TULI COMERCIO LTDA - ME	\N	10996911000174	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3328-4832	leonardo@figeletro.com.br	\N	1	t	2026-04-08 13:41:51.325	2026-04-08 13:41:51.325	\N	\N	\N	569	\N	\N	\N
cmnq3kbj6019i9gtkbp4zckwn	548	BROOKSDONNA COMERCIO DE ROUPAS LTDA	\N	11014557001501	CNPJ	2	MENSAL	ATIVA	GRUPO VIA VENETO	1	2011-08-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	29050902	Avenida Américo Buaiz - 200 - Enseada do Suá - LOJA 341 1º PISO SHOPPING VITORIA	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.33	2026-04-08 13:41:51.33	\N	\N	\N	570	\N	\N	\N
cmnq3kbjc019l9gtkx0cbuzp5	549	NDS DISTRIBUIDORA DE MEDICAMENTOS LTDA	\N	11034934000160	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	5	2018-01-30 02:00:00	\N	\N	\N	\N	\N	\N	\N	85915175	Avenida Egydio Geronymo Munaretto - s/n - César Park	\N	\N	\N	Toledo	PR	4521033791	alessandro.bragagnolo@pratidonaduzzi.com.br	\N	1	t	2026-04-08 13:41:51.336	2026-04-08 13:41:51.336	\N	\N	\N	571	\N	\N	\N
cmnq3kbjg019o9gtkf0otwx1t	550	EMANUEL TRANSPORTES E TURISMO LTDA	\N	11038482000195	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-03-14 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29163315	Rua Mandarim - 11 - Novo Horizonte	\N	\N	\N	Serra	ES	32417560	gerencia@emanueltransporte.com.br	\N	1	t	2026-04-08 13:41:51.341	2026-04-08 13:41:51.341	\N	\N	\N	572	\N	\N	\N
cmnq3kbjl019r9gtk68f2ra7z	551	MIX ETIQUETAS E ROTULOS EIRELI	\N	11059866000194	CNPJ	2	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	4	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	02037021	R CONSELHEIRO SARAIVA - 912 - SANTANA	\N	\N	\N	SAO PAULO	SP	(11) 2659-6027	financeiro@mixetiquetas.com.br	\N	1	t	2026-04-08 13:41:51.345	2026-04-08 13:41:51.345	\N	\N	\N	573	\N	\N	\N
cmnq3kbjq019u9gtkdeyr6jon	552	SOETA RESTAURANTE LTDA	\N	11172115000180	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.35	2026-04-08 13:41:51.35	\N	\N	\N	574	\N	\N	\N
cmnq3kbju019x9gtkrfn9zgkx	553	M2I SERVICOS DE IMPLANTACAO DE SOFTWARE LTDA	\N	11196167000196	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS BA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	27 30386300	gilda.batista@totvs.com.br	\N	1	t	2026-04-08 13:41:51.355	2026-04-08 13:41:51.355	\N	\N	\N	575	\N	\N	\N
cmnq3kbk001a09gtkx23iy2jp	554	CM COMÉRCIO DE ALIMENTOS LTDA - ME	\N	11227052000111	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 2227-5353	mwa@mwa.com.br	\N	1	t	2026-04-08 13:41:51.361	2026-04-08 13:41:51.361	\N	\N	\N	576	\N	\N	\N
cmnq3kbk501a39gtkwzbd86y3	555	JAWA TRANPORTES	\N	11229349000116	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.366	2026-04-08 13:41:51.366	\N	\N	\N	577	\N	\N	\N
cmnq3kbkb01a69gtkzt90zbml	556	HOX - INDUSTRIA DE OXICORTE E CORTE A PLASMA LTDA.	\N	11243655000107	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.371	2026-04-08 13:41:51.371	\N	\N	\N	578	\N	\N	\N
cmnq3kbkh01a99gtksffbm3ee	557	C & C COMERCIO IMPORTACAO E EXPORTACAO EIRELI - EPP	\N	11260642000146	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	41 3040 6100	cassio.cachoeira@planet.com.br	\N	1	t	2026-04-08 13:41:51.377	2026-04-08 13:41:51.377	\N	\N	\N	579	\N	\N	\N
cmnq3kbkn01ac9gtkqt1orgsv	558	FLOR DE ALECRIM PERFUMARIA E COSMETICOS LTDA - EPP	\N	11286164000143	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.384	2026-04-08 13:41:51.384	\N	\N	\N	580	\N	\N	\N
cmnq3kbks01af9gtkgav006sz	559	PANIFICADORA MR. MIX EIRELI	\N	11286164000224	CNPJ	2	MENSAL	ATIVA	GRUPO O BOTICÁRIO	6	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29166200	Avenida Região Sudeste - S/N - Barcelona	\N	\N	\N	Serra	ES	2733377845	GRUPOLARANJEIRAS@TERRA.COM.BR	\N	1	t	2026-04-08 13:41:51.389	2026-04-08 13:41:51.389	\N	\N	\N	581	\N	\N	\N
cmnq3kbkx01ai9gtk3i4koa0m	560	FLOR DE MENTA PERFUMARIA E COSMETICOS LTDA - EPP	\N	11286228000106	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165770	Avenida Eldes Scherrer Souza - 1996 - Valparaíso	\N	\N	\N	Serra	ES	27 3228-3027	\N	\N	1	t	2026-04-08 13:41:51.394	2026-04-08 13:41:51.394	\N	\N	\N	582	\N	\N	\N
cmnq3kbl301al9gtk0m6kqttw	561	FLOR DE MENTA PERFUMARIA E COSMETICOS LTDA - EPP	\N	11286228000297	CNPJ	2	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29167080	Avenida Eldes Scherrer Souza - 2162 - Colina de Laranjeiras	\N	\N	\N	Serra	ES	27 3221-5221	\N	\N	1	t	2026-04-08 13:41:51.399	2026-04-08 13:41:51.399	\N	\N	\N	583	\N	\N	\N
cmnq3kbl801ao9gtkz03ibbz6	562	CINTYA LOGISTICA LTDA	\N	11320198000107	CNPJ	1	AVULSO	ATIVA	GRUPO CINTYA 	1	2018-02-22 03:00:00	\N	\N	\N	\N	\N	\N	\N	29164140	Rodovia ES-010, KM 4,5 - SN - Jardim Limoeiro	\N	\N	\N	Serra	ES	(27)3205-8383	jean.lacerda@grupocintya.com.br	\N	1	t	2026-04-08 13:41:51.404	2026-04-08 13:41:51.404	\N	\N	\N	584	\N	\N	\N
cmnq3kbld01ar9gtkkgg1nf8t	563	PACIFIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	\N	11416596000121	CNPJ	1	MENSAL	ATIVA	GRUPO PACIFIC	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3888-3500	\N	\N	1	t	2026-04-08 13:41:51.409	2026-04-08 13:41:51.409	\N	\N	\N	585	\N	\N	\N
cmnq3kblj01au9gtkooveborq	564	PACIFIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	\N	11416596000202	CNPJ	2	MENSAL	ATIVA	GRUPO PACIFIC	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3888-3505	marcelo@dellar.com.br	\N	1	t	2026-04-08 13:41:51.415	2026-04-08 13:41:51.415	\N	\N	\N	586	\N	\N	\N
cmnq3kblo01ax9gtkglhwwnun	565	PACIFIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	\N	11416596000393	CNPJ	2	MENSAL	ATIVA	GRUPO PACIFIC	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3888-3500	\N	\N	1	t	2026-04-08 13:41:51.42	2026-04-08 13:41:51.42	\N	\N	\N	587	\N	\N	\N
cmnq3kblt01b09gtki57ppd9i	566	PACIFIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	\N	11416596000474	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3888-3505	marcelo@dellar.com.br	\N	1	t	2026-04-08 13:41:51.425	2026-04-08 13:41:51.425	\N	\N	\N	588	\N	\N	\N
cmnq3kbly01b39gtk701drtt1	567	PACIFIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	\N	11416596000555	CNPJ	2	MENSAL	ATIVA	GRUPO PACIFIC	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3888-3500	\N	\N	1	t	2026-04-08 13:41:51.431	2026-04-08 13:41:51.431	\N	\N	\N	589	\N	\N	\N
cmnq3kbm301b69gtk6f0urd9m	568	SEA MASTER SERVICOS MARITIMOS EIRELI	\N	11467576000151	CNPJ	1	POTENCIAL	ATIVA	GRUPO SEA MASTER 	0	2020-02-19 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.435	2026-04-08 13:41:51.435	\N	\N	\N	590	\N	\N	\N
cmnq3kbm801b99gtk38v25s7s	569	LC PRINT IMPORTACAO E COMERCIO DE MAQUINAS E SUPRIMENTOS DE ESCRITORIO LTDA	\N	11478152000110	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	29168055	RUA ATALYDES MOREIRA DE SOUZA - 1472 - CIVIT I - SALA 14	\N	\N	\N	SERRA	ES	(27) 4042-3868 / (11) 2281-6713	fiscal@lctecno.com.br	\N	1	t	2026-04-08 13:41:51.44	2026-04-08 13:41:51.44	\N	\N	\N	591	\N	\N	\N
cmnq3kbme01bc9gtk4ylpzur5	570	LC PRINT IMPORTACAO E COMERCIO DE MAQUINAS E SUPRIMENTOS DE ESCRITORIO LTDA	\N	11478152000200	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168055	RUA ATALYDES MOREIRA DE SOUZA - 1472 - CIVIT I - SALA 23	\N	\N	\N	SERRA	ES	(27) 4042-3868	fiscal@lctecno.com.br	\N	1	t	2026-04-08 13:41:51.446	2026-04-08 13:41:51.446	\N	\N	\N	592	\N	\N	\N
cmnq3kbmj01bf9gtkx9pg8i5j	571	SEA MASTER SERVICOS MARITIMOS EIRELI	\N	11567576000313	CNPJ	2	POTENCIAL	ATIVA	GRUPO SEA MASTER 	0	2020-02-19 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.451	2026-04-08 13:41:51.451	\N	\N	\N	593	\N	\N	\N
cmnq3kbmn01bi9gtk4ny4si7d	572	FENDER DO BRASIL IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA	\N	11718106000222	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	01178265484	mauricio.goncalves@fenderferramentas.com.br	\N	1	t	2026-04-08 13:41:51.456	2026-04-08 13:41:51.456	\N	\N	\N	594	\N	\N	\N
cmnq3kbmt01bl9gtkc903jlw8	573	BERTEK PRODUTOS, SERVICOS E MINERACAO LTDA	\N	11729330000139	CNPJ	1	MENSAL	ATIVA	GRUPO STILE	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	29147030	Rod Governador Mario Covas - 600 - Serra do Anil	\N	\N	\N	Cariacica	ES	27 2121-5600	\N	\N	1	t	2026-04-08 13:41:51.462	2026-04-08 13:41:51.462	\N	\N	\N	595	\N	\N	\N
cmnq3kbmy01bo9gtktwn29xnx	574	BERTEK PRODUTOS, SERVICOS E MINERACAO LTDA	\N	11729330000210	CNPJ	2	MENSAL	ATIVA	GRUPO STILE	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	45436000	FAZ PEDRA BRANCA - S/N - ZONA RURAL	\N	\N	\N	PIRAI DO NORTE	BA	27 2121-5600	liliana.telaroli@stilecomercial.com.br	\N	1	t	2026-04-08 13:41:51.467	2026-04-08 13:41:51.467	\N	\N	\N	596	\N	\N	\N
cmnq3kbn301br9gtkxckqwzwk	575	SEC - DISTRIBUIDORA DE COMBUSTIVEL LTDA	\N	11773875000142	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	19 83925089	renejunior001@hotmail.com	\N	1	t	2026-04-08 13:41:51.471	2026-04-08 13:41:51.471	\N	\N	\N	597	\N	\N	\N
cmnq3kbn801bu9gtkttgziksv	576	CENTRO LOGISTICO CARIACICA LTDA	\N	11885434000132	CNPJ	1	MENSAL	ATIVA	GRUPO STILE	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 3422-2502	elania.busato@stilecomercial.com.br	\N	1	t	2026-04-08 13:41:51.477	2026-04-08 13:41:51.477	\N	\N	\N	598	\N	\N	\N
cmnq3kbne01bx9gtkwhn59mto	577	EXBRA COMERCIO EIRELI	\N	11972773000156	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2019-05-30 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.482	2026-04-08 13:41:51.482	\N	\N	\N	599	\N	\N	\N
cmnq3kbni01c09gtkpqsb0nug	578	OPENVIX DISTRIBUIDORA LTDA - ME	\N	11978797000112	CNPJ	1	MENSAL	ATIVA	GRUPO OPENVIX	1	2016-04-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 2122- 1919	ilson.medeiros@openvix.com.br	\N	1	t	2026-04-08 13:41:51.487	2026-04-08 13:41:51.487	\N	\N	\N	600	\N	\N	\N
cmnq3kbnm01c39gtkexntrhzi	579	MB2 MULTIMIDIA LTDA - ME	\N	12000108000163	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30822405	CONTATO@AGENCIAMB2.COM.BR	\N	1	t	2026-04-08 13:41:51.491	2026-04-08 13:41:51.491	\N	\N	\N	601	\N	\N	\N
cmnq3kbnt01c69gtkrz3q7jqt	580	ALUCOMAXX BRASIL - INDUSTRIA E COMERCIO DE REVESTIMENTOS LTDA	\N	12047030000132	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	2	2018-02-19 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1124625866	contador@alucomaxx.com.br	\N	1	t	2026-04-08 13:41:51.497	2026-04-08 13:41:51.497	\N	\N	\N	602	\N	\N	\N
cmnq3kbnx01c99gtk6zeahsjy	581	YZF SERVICOS ADMINISTRATIVOS EIRELI	\N	12129423000195	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-03-01 03:00:00	\N	\N	\N	\N	\N	\N	\N	29105740	Rua Quatro - 16 - Cocal	\N	\N	\N	Vila Velha	ES	(27) 98129935	charles.douglas@hotmail.com.br	\N	1	t	2026-04-08 13:41:51.502	2026-04-08 13:41:51.502	\N	\N	\N	603	\N	\N	\N
cmnq3kbo201cc9gtkshhinxxp	582	EMCO HITRAX LOCAÇÕES DE EQUIPAMENTOS E SERVIÇOS DE ASSISTÊNCIA TÉCNICA LTDA	\N	12132556000110	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 2104 8300	massamiy@hkm.ind.br	\N	1	t	2026-04-08 13:41:51.506	2026-04-08 13:41:51.506	\N	\N	\N	604	\N	\N	\N
cmnq3kbo801cf9gtk1fvw4vx1	583	LIFE ASSESSORIA SMS LTDA	\N	12225444000104	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29163331	AVENIDA BRASIL - 623 - NOVO HORIZONTE - SALA: 104;	\N	\N	\N	SERRA	ES	(27) 3228-3659 / (27) 3228-3659	\N	\N	1	t	2026-04-08 13:41:51.512	2026-04-08 13:41:51.512	\N	\N	\N	605	\N	\N	\N
cmnq3kbod01ci9gtkdklfshec	584	ATIVA CONSULTORIA E GESTÃO DE NEGÓCIOS LTDA	\N	12228044000152	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2019-12-06 03:00:00	\N	\N	\N	\N	\N	\N	\N	88102310	Rua Koesa - 298 - Kobrasol - SALA 1003	\N	\N	\N	São José	SC	\N	\N	\N	1	t	2026-04-08 13:41:51.517	2026-04-08 13:41:51.517	\N	\N	\N	606	\N	\N	\N
cmnq3kboh01cl9gtkwo1j3yxn	585	BRASIL TANKS LTDA	\N	12628312000123	CNPJ	1	MENSAL	ATIVA	GRUPO STILE	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Trabalhista	\N	ROD GOVERNADOR MARIO COVAS - 600 - SERRA DO ANIL	\N	\N	\N	CARIACICA	ES	27 33297131	LUCIANA.CHRISTO@BRASILTANKS.COM.BR	\N	1	t	2026-04-08 13:41:51.521	2026-04-08 13:41:51.521	\N	\N	\N	607	\N	\N	\N
cmnq3kbol01co9gtktii3z42j	586	CHERY BRASIL IMPORTACAO, FABRICACAO E DISTRIBUICAO DE VEICULOS LTDA.	\N	12637366000317	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	qualidade@central-rnc.com.br	\N	1	t	2026-04-08 13:41:51.526	2026-04-08 13:41:51.526	\N	\N	\N	608	\N	\N	\N
cmnq3kbor01cr9gtkrbpzng7k	587	ESC PARTICIPAÇÕES	\N	12660489000107	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS ES	1	2011-01-03 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	jac.couto@totvs.com.br	\N	1	t	2026-04-08 13:41:51.532	2026-04-08 13:41:51.532	\N	\N	\N	609	\N	\N	\N
cmnq3kbov01cu9gtky620sdn6	588	FUN COMERCIO IMPORTAÇÃO E EXPORTAÇÃO LTDA	\N	12833800000253	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.536	2026-04-08 13:41:51.536	\N	\N	\N	610	\N	\N	\N
cmnq3kbp001cx9gtk798kh24e	589	GLOBAL ATACADISTA LTDA	\N	12978121000191	CNPJ	1	POTENCIAL	ATIVA	\N	6	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29164370	Rua Gustavo Barroso - Galpão 02 - 125 - Chácara Parreiral	\N	\N	\N	Serra	ES	27 99880-2011	marcelo.silva@grupouplog.com.br, edson.natal@grupouplog.com.br	\N	1	t	2026-04-08 13:41:51.54	2026-04-08 13:41:51.54	\N	\N	\N	611	\N	\N	\N
cmnq3kbp601d09gtkhfhshpty	590	DROGARIA SIQUARA	\N	12998352000167	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-02-14 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3328-1355	drogaria.siquara@gmail.com	\N	1	t	2026-04-08 13:41:51.546	2026-04-08 13:41:51.546	\N	\N	\N	612	\N	\N	\N
cmnq3kbpa01d39gtkvyi37axx	591	NEWROCK IMPORTADORA E DISTRIBUIDORA LTDA	\N	13094763000190	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.551	2026-04-08 13:41:51.551	\N	\N	\N	613	\N	\N	\N
cmnq3kbpf01d69gtka1b36w1y	592	NEWROCK IMPORTADORA E DISTRIBUIDORA LTDA	\N	13094763000271	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.555	2026-04-08 13:41:51.555	\N	\N	\N	614	\N	\N	\N
cmnq3kbpk01d99gtk2wm9cwmo	593	KERNEL DISTRIBUIDORA LTDA	\N	13100244000198	CNPJ	1	MENSAL	ATIVA	GRUPO KERNEL	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Trabalhista	29165130	AVENIDA CENTRAL - 1345 - PARQUE RESIDENCIAL LARANJEIRAS - PAVMTO02 SALA 02	\N	\N	\N	CARIACICA	ES	(27) 2125-0001 / (27) 2125-0001	contabil@kernel.com.br	\N	1	t	2026-04-08 13:41:51.56	2026-04-08 13:41:51.56	\N	\N	\N	615	\N	\N	\N
cmnq3kbpp01dc9gtkftiil7no	594	SOROFILTROS	\N	13150273000164	CNPJ	8	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.566	2026-04-08 13:41:51.566	\N	\N	\N	616	\N	\N	\N
cmnq3kbpu01df9gtkuvpyntyk	595	MINERAL STONE EXPORTACAO LTDA	\N	13293623000141	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29177211	RODOVIA BR-101 NORTE - S/N - DIVINOPOLIS - ENTRADA DE MURIBECA KM 251	\N	\N	\N	SERRA	ES	(27) 3291-5500 / (27) 9785-8910 / (27) 4009-4666	nfe@mineralstone.com.br	\N	1	t	2026-04-08 13:41:51.57	2026-04-08 13:41:51.57	\N	\N	\N	617	\N	\N	\N
cmnq3kbpz01di9gtku11cn1x5	596	PEREIRA E MENEZES ADVOGADOS ASSOCIADOS	\N	13585182000151	CNPJ	MATRIZ	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.575	2026-04-08 13:41:51.575	\N	\N	\N	618	\N	\N	\N
cmnq3kbq501dl9gtkptnv9ng4	597	RV INVESTIMENTOS LTDA	\N	13648919000138	CNPJ	1	MENSAL	ATIVA	GRUPO VITORIA STONE	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil;Trabalhista	\N	\N	\N	\N	\N	\N	\N	27 3038-9366	\N	\N	1	t	2026-04-08 13:41:51.582	2026-04-08 13:41:51.582	\N	\N	\N	619	\N	\N	\N
cmnq3kbqa01do9gtk9naceid8	598	FORTLINE COMERCIO, DISTRIBUICAO, IMPORTACAO E EXPORTACAO DE EPI LTDA	GRUPO FORTLINE	13843009000106	CNPJ	A DEFINIR	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	32010030	AMERICO SANTIAGO PIACENZA, 651, GALPAO03 - CINCO	\N	\N	\N	CONTAGEM	MG	(31) 2527-3244	CONTATO@GRUPOGSV.COM.BR	\N	1	t	2026-04-08 13:41:51.586	2026-04-08 13:41:51.586	\N	\N	\N	620	\N	\N	\N
cmnq3kbqe01dr9gtk4gv2x3g3	599	LARANJEIRAS COMERCIO DE UTILIDADES LTDA	\N	13900852000187	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3065-7090	\N	\N	1	t	2026-04-08 13:41:51.59	2026-04-08 13:41:51.59	\N	\N	\N	621	\N	\N	\N
cmnq3kbqk01du9gtkhq8o8y63	600	ASP ELETRIC EIRELI	\N	14070343000137	CNPJ	9	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	Rio e Janeiro	RJ	\N	\N	\N	1	t	2026-04-08 13:41:51.596	2026-04-08 13:41:51.596	\N	\N	\N	622	\N	\N	\N
cmnq3kbqp01dx9gtkyn7acqxl	601	ALIMENTARES REFEICOES EIRELI	\N	14086728000192	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2017-06-19 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29168096	Rua 1 B - 353 - CIVIT II	\N	\N	\N	Serra	ES	27 3065-0351	Lena Ribeiro - fiscal@alimentares.ind.br	\N	1	t	2026-04-08 13:41:51.601	2026-04-08 13:41:51.601	\N	\N	\N	623	\N	\N	\N
cmnq3kbqu01e09gtkk519b9yr	602	ALIMENTARES REFEICOES EIRELI	\N	14086728000273	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	2017-06-19 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29705718	Estrada Córrego Santa Fé - S/N - Santa Helena	\N	\N	\N	Colatina	ES	\N	Lena Ribeiro - fiscal@alimentares.ind.br	\N	1	t	2026-04-08 13:41:51.606	2026-04-08 13:41:51.606	\N	\N	\N	624	\N	\N	\N
cmnq3kbqz01e39gtks627mi9u	603	ALIMENTARES REFEICOES EIRELI	\N	14086728000354	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	2017-06-19 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29306100	Rua Coronel Borges - 194 - Coronel Borges	\N	\N	\N	Cachoeiro de Itapemirim	ES	\N	Lena Ribeiro - fiscal@alimentares.ind.br	\N	1	t	2026-04-08 13:41:51.612	2026-04-08 13:41:51.612	\N	\N	\N	625	\N	\N	\N
cmnq3kbr401e69gtkawtovirh	604	VOL IMPORTS COMERCIO IMPORTACAO E EXPORTACAO LTDA	\N	14172163000166	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 2198-3789	marcio@doccontabilidade.com.br	\N	1	t	2026-04-08 13:41:51.617	2026-04-08 13:41:51.617	\N	\N	\N	626	\N	\N	\N
cmnq3kbr801e99gtk4oprxo0g	605	CRISTALIS EMPREENDIMENTOS E PARTICIPACOES LTDA	CRISTALIS EMPREENDIMENTOS	14317071000127	CNPJ	1	MENSAL	ATIVA	GRUPO CRISTALIS	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Trabalhista	29166820	AVENIDA COPACABANA, 711	\N	\N	\N	SERRA	ES	(27) 3328-1993 / (27) 9825-6800 / (27) 3298-4800	contato@cerimonialcristalis.com.br	\N	1	t	2026-04-08 13:41:51.621	2026-04-08 13:41:51.621	\N	\N	\N	627	\N	\N	\N
cmnq3kbrd01ec9gtk0fu05cge	606	TOP DISTRIBUIDORA DE COSMETICOS LTDA	\N	14402098000118	CNPJ	1	MENSAL	ATIVA	GRUPO YBERA PARIS 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	29260000	AV PRESIDENTE VARGAS - 242 - CENTRO - LOJA 01 AREA B	\N	\N	\N	DOMINGOS MARTINS	ES	(27) 8167-0287	sergiolamassilva@gmail.com	\N	1	t	2026-04-08 13:41:51.626	2026-04-08 13:41:51.626	\N	\N	\N	628	\N	\N	\N
cmnq3kbrk01ef9gtkh0xtvh0e	607	TOP DISTRIBUIDORA DE COSMETICOS LTDA	\N	14402098000207	CNPJ	2	MENSAL	ATIVA	GRUPO YBERA PARIS 	\N	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	13290000	RUA WAGNER LUIZ BEVILACQUA - 525 - LEITAO - SETOR PARTE A3955	\N	\N	\N	LOUVEIRA	SP	(27) 8167-0287	sergiolamassilva@gmail.com	\N	1	t	2026-04-08 13:41:51.632	2026-04-08 13:41:51.632	\N	\N	\N	629	\N	\N	\N
cmnq3kbrp01ei9gtkwhepj5m2	608	TOP DISTRIBUIDORA DE COSMETICOS LTDA	\N	14402098000380	CNPJ	2	MENSAL	ATIVA	GRUPO YBERA PARIS 	\N	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	05275000	VIA ANHANGUERA - S/N - JARDIM JARAGUA - KM 25.5 P. LATERAL 130 SETOR PARTE C922	\N	\N	\N	SAO PAULO	SP	(27) 8167-0287	sergiolamassilva@gmail.com	\N	1	t	2026-04-08 13:41:51.638	2026-04-08 13:41:51.638	\N	\N	\N	630	\N	\N	\N
cmnq3kbru01el9gtkfigv78ei	609	PL - MINERAÇÃO E IMPORTAÇÃO E EXPORTAÇÃO LTDA	\N	14457194000163	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	02730919368	marcia@pedreirasdobrasil.com.br	\N	1	t	2026-04-08 13:41:51.643	2026-04-08 13:41:51.643	\N	\N	\N	631	\N	\N	\N
cmnq3kbs001eo9gtkk6js6okq	610	MARCUS VINICIUS DOMINGUES CANALI - ME	\N	14470327000131	CNPJ	1	MENSAL	ATIVA	GRUPO TRI UP TRADE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29164044	AVE DESEMBARGADOR MARIO DA SILVA NUNES - TORRE NORTE SALA 502 - 717 - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	27996345537	jp@triuptrade.com.br	\N	1	t	2026-04-08 13:41:51.649	2026-04-08 13:41:51.649	\N	\N	\N	632	\N	\N	\N
cmnq3kbs501er9gtkz82ow5wx	611	MARCUS VINICIUS DOMINGUES CANALI - ME	\N	14470327000212	CNPJ	2	MENSAL	ATIVA	GRUPO TRI UP TRADE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	57020510	RUA BARÃO DE ATALAIA - SALA 119 - 280 - CENTRO	\N	\N	\N	MACEIO	AL	27996345537	jp@triuptrade.com.br	\N	1	t	2026-04-08 13:41:51.654	2026-04-08 13:41:51.654	\N	\N	\N	633	\N	\N	\N
cmnq3kbsa01eu9gtk08l0uiif	612	EMPORIO MARLIN LTDA-ME	\N	14480417000103	CNPJ	1	AVULSO	ATIVA	GRUPO REDE NORTE SUL	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	272104-8300	comercial@central-rnc.com.br	\N	1	t	2026-04-08 13:41:51.658	2026-04-08 13:41:51.658	\N	\N	\N	634	\N	\N	\N
cmnq3kbsg01ex9gtk7s9h2ml0	613	SOLUCAO LOCACAO E TRANSPORTES LTDA	\N	14493773000161	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	27286040	R DELFIM MOREIRA - 279 - DOM BOSCO	\N	\N	\N	VOLTA REDONDA	RJ	(34) 3216-7321	ebenezer@portalebenezer.com	\N	1	t	2026-04-08 13:41:51.664	2026-04-08 13:41:51.664	\N	\N	\N	635	\N	\N	\N
cmnq3kbsk01f09gtkcvwmfni9	614	SANOG INTERMEDIACAO DE NEGOCIOS LTDA	\N	14531574000109	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2012-05-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3066-8383	leonardo.financeiro@sanog-es.com	\N	1	t	2026-04-08 13:41:51.669	2026-04-08 13:41:51.669	\N	\N	\N	636	\N	\N	\N
cmnq3kbsp01f39gtk9kiwljf1	615	IMBATÍVEL REPRESENTAÇÕES LTDA	\N	14553781000156	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	2020-04-06 03:00:00	\N	\N	\N	\N	\N	\N	\N	29100011	Avenida Champagnat - 689 - Centro de Vila Velha - Sala J - 07	\N	\N	\N	Vila Velha	ES	27 99311-7364	\N	\N	1	t	2026-04-08 13:41:51.673	2026-04-08 13:41:51.673	\N	\N	\N	637	\N	\N	\N
cmnq3kbsw01f69gtk0fax6nwz	616	SEA MASTER LOCAÇÕES E TRANSPORTES LTDA	\N	14609686000127	CNPJ	1	POTENCIAL	ATIVA	GRUPO SEA MASTER 	0	2020-02-19 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29100640	Avenida Carlos Lindenberg - Jaburuna	\N	\N	\N	Vila Velha	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.68	2026-04-08 13:41:51.68	\N	\N	\N	638	\N	\N	\N
cmnq3kbt301f99gtkwsai6p4p	617	LOCACAO VITORIA LTDA	\N	14661112000106	CNPJ	1	MENSAL	ATIVA	GRUPO EUROPA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.687	2026-04-08 13:41:51.687	\N	\N	\N	639	\N	\N	\N
cmnq3kbtc01fc9gtkhthp4ob7	618	ECO-PARK LOCACAO DE IMOVEIS LTDA	\N	14755930000160	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 41023256	luiz.serafim@hkm.ind.br	\N	1	t	2026-04-08 13:41:51.697	2026-04-08 13:41:51.697	\N	\N	\N	640	\N	\N	\N
cmnq3kbtk01ff9gtk78cqv1k3	619	MSD SOLUCOES BOMBAS E AUTOMACAO LTDA - ME	\N	14768409000167	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	2018-01-24 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29163348	Rua Pavão - 564 - Novo Horizonte	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.704	2026-04-08 13:41:51.704	\N	\N	\N	641	\N	\N	\N
cmnq3kbtr01fi9gtkwol7oaar	620	AGNI COMERCIO E REPRESENTACAO INTERNACIONAL LTDA	\N	14791105000110	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 2225-3225	erison.fernandes@globo.com	\N	1	t	2026-04-08 13:41:51.712	2026-04-08 13:41:51.712	\N	\N	\N	642	\N	\N	\N
cmnq3kbty01fl9gtkdang2mc8	621	BTG PACTUAL COMMODITIES S.A	\N	14796754000104	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	qualidade@central-rnc.com.br	\N	1	t	2026-04-08 13:41:51.719	2026-04-08 13:41:51.719	\N	\N	\N	643	\N	\N	\N
cmnq3kbu301fo9gtk98fdkkdw	622	BTG PACTUAL COMMODITIES S.A	\N	14796754000708	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	027 2507-5214	marceloxbp@gmail.com	\N	1	t	2026-04-08 13:41:51.723	2026-04-08 13:41:51.723	\N	\N	\N	644	\N	\N	\N
cmnq3kbu801fr9gtka5lv2fto	623	BTG PACTUAL COMMODITIES S.A.	\N	14796754000880	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(021) 3529 9150	claudio.cicero@br.gt.com	\N	1	t	2026-04-08 13:41:51.729	2026-04-08 13:41:51.729	\N	\N	\N	645	\N	\N	\N
cmnq3kbuj01fx9gtkokxj4ibp	625	MILENIO CONVENIENCIA LTDA - ME	\N	14937214000101	CNPJ	1	MENSAL	ATIVA	GRUPO POSTO LM E MILENIO CONVENIÊNCIA LTDA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29102170	Rua Humberto Pereira - Loja 01 - 120 - Praia de Itaparica - LOJA 01	\N	\N	\N	Vila Velha	ES	(27) 3020-8070	pspostolmltda@gmail.com	\N	1	t	2026-04-08 13:41:51.739	2026-04-08 13:41:51.739	\N	\N	\N	647	\N	\N	\N
cmnq3kbuq01g09gtknspb8atp	626	INNOVA COMERCIO E SERVICOS LTDA - EPP	\N	14993664000103	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2012-02-01 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	innova.granitos@hotmail.com	\N	1	t	2026-04-08 13:41:51.746	2026-04-08 13:41:51.746	\N	\N	\N	648	\N	\N	\N
cmnq3kbuw01g39gtklnbkto9j	627	POSTO LM EIRELI	\N	15003120000110	CNPJ	1	MENSAL	ATIVA	GRUPO POSTO LM E MILENIO CONVENIÊNCIA LTDA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29102170	Rua Humberto Pereira - 120 - Praia de Itaparica	\N	\N	\N	Vila Velha	ES	(27) 3020-8070	pspostolmltda@gmail.com	\N	1	t	2026-04-08 13:41:51.752	2026-04-08 13:41:51.752	\N	\N	\N	649	\N	\N	\N
cmnq3kbv101g69gtkqsgysw7d	628	CONSTRUTORA NOSSA CASA LTDA ME	\N	15017351000182	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2018-12-18 02:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.758	2026-04-08 13:41:51.758	\N	\N	\N	650	\N	\N	\N
cmnq3kbva01g99gtky4nk340m	629	OPENTEC EQUIPAMENTOS E SERVIÇOS PARA CONSTRUÇÃO CIVIL LTDA - ME	\N	15032015000109	CNPJ	1	MENSAL	ATIVA	GRUPO OPENVIX	1	2016-07-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 99254 0656	ilson.medeiros@openvix.com.br	\N	1	t	2026-04-08 13:41:51.766	2026-04-08 13:41:51.766	\N	\N	\N	651	\N	\N	\N
cmnq3kbvf01gc9gtkvb63yqvp	630	NAMASTE COSMETICOS LTDA	\N	15412776000277	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3886-8977	silene.mendonca@br.gt.com	\N	1	t	2026-04-08 13:41:51.772	2026-04-08 13:41:51.772	\N	\N	\N	652	\N	\N	\N
cmnq3kbvl01gf9gtkhcx3e3pc	631	J. R. PEREIRA - COMERCIO E RECICLAGEM DE METAIS	\N	15464376000124	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.777	2026-04-08 13:41:51.777	\N	\N	\N	654	\N	\N	\N
cmnq3kbvq01gi9gtkpo7t8kvi	632	ECO101 CONCESSIONARIA DE RODOVIAS S/A	\N	15484093000144	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 32024016	Layssa.Goelzer@eco101.com.br	\N	1	t	2026-04-08 13:41:51.782	2026-04-08 13:41:51.782	\N	\N	\N	655	\N	\N	\N
cmnq3kbvv01gl9gtk1pmggek4	633	DISTRIBUIDORA DE PERFUMARIA E COSMETICOS FLOR DA SERRA LTDA - EPP	\N	15495990000153	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165170	Rua Pitágoras - 71 - Parque Residencial Laranjeiras - TERREO E 2 PAVIMENTO	\N	\N	\N	Serra	ES	27 3228-0003	\N	\N	1	t	2026-04-08 13:41:51.787	2026-04-08 13:41:51.787	\N	\N	\N	656	\N	\N	\N
cmnq3kbw001go9gtklssb5qp7	634	MARCOS AURELIO BINDA COELHO	\N	15527042000152	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30955504	VENDAS@VIXSHOPPING.COM.BR	\N	1	t	2026-04-08 13:41:51.792	2026-04-08 13:41:51.792	\N	\N	\N	657	\N	\N	\N
cmnq3kbw601gr9gtkvitxgb23	635	NATUBRAS INDUSTRIA E COMERCIO DE PRODUTOS NATURAIS LTDA	\N	15652520000156	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	04599681016	washgaspar@natubras.ind.br	\N	1	t	2026-04-08 13:41:51.798	2026-04-08 13:41:51.798	\N	\N	\N	658	\N	\N	\N
cmnq3kbwa01gu9gtkjrqyccpq	636	IMPAK COMERCIAL E IMPORTADORA LTDA	\N	16554796000164	CNPJ	8	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.803	2026-04-08 13:41:51.803	\N	\N	\N	659	\N	\N	\N
cmnq3kbwf01gx9gtk7z0wsymk	637	CLINICA ODONTOLOGICA DENTEPRIDE SERRA ES LTDA	\N	16669470000182	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	1	2018-07-05 03:00:00	\N	\N	\N	\N	\N	\N	\N	29165130	Avenida Central - 811 - Parque Residencial Laranjeiras - PAVMTO; TERREO; LOJA; QUADRA: 03N; LOTE: 003	\N	\N	\N	Serra	ES	99978-1944	admsea@orthopride.com.br	\N	1	t	2026-04-08 13:41:51.807	2026-04-08 13:41:51.807	\N	\N	\N	660	\N	\N	\N
cmnq3kbwl01h09gtk8frmnea3	638	CLINICA GREEN HOUSE LTDA	\N	16738103000193	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	5	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29185000	DT IRUNDI - SN - IRUNDI	\N	\N	\N	Fundão	ES	27 992816000	andremachado@greenhousepsiquiatria.com.br	\N	1	t	2026-04-08 13:41:51.813	2026-04-08 13:41:51.813	\N	\N	\N	661	\N	\N	\N
cmnq3kbwq01h39gtk7cyx14md	639	D&M MARMORES E GRANITOS LTDA - ME	\N	17086878000194	CNPJ	1	AVULSO	ATIVA	GRUPO CAPIXABA	1	2014-01-11 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	2799951-1627	c.nounis@hotmail.com	\N	1	t	2026-04-08 13:41:51.818	2026-04-08 13:41:51.818	\N	\N	\N	662	\N	\N	\N
cmnq3kbwu01h69gtkterq5a5j	640	MAJ MOBILIDADE ELETRICA LTDA	\N	17120090000157	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.823	2026-04-08 13:41:51.823	\N	\N	\N	663	\N	\N	\N
cmnq3kbx001h99gtk7dzl21fs	641	COMUNIKI.ME SERVICOS DE INFORMATICA LTDA	\N	17328909000257	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29010935	AVENIDA JERONIMO MONTEIRO - 1000 - CENTRO - SALA 813 815 817 E 819 EDIF TRADE CENTER	\N	\N	\N	VITORIA	ES	(11) 2950-0251	fale.me@comuniki.me	\N	1	t	2026-04-08 13:41:51.829	2026-04-08 13:41:51.829	\N	\N	\N	664	\N	\N	\N
cmnq3kbx501hc9gtk1llzvhrn	642	EDUCO SERVIÇOS LTDA	\N	17353409000194	CNPJ	1	MENSAL	ATIVA	GRUPO TOTVS ES	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.834	2026-04-08 13:41:51.834	\N	\N	\N	665	\N	\N	\N
cmnq3kbxa01hf9gtkwy1vqgkx	643	EDUCO SERVIÇOS LTDA	\N	17353409000275	CNPJ	2	MENSAL	ATIVA	GRUPO TOTVS ES	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.838	2026-04-08 13:41:51.838	\N	\N	\N	666	\N	\N	\N
cmnq3kbxg01hi9gtkqjln8a54	644	NEWROCK TRADE LTDA	\N	17450723000195	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.844	2026-04-08 13:41:51.844	\N	\N	\N	667	\N	\N	\N
cmnq3kbxl01hl9gtkhmb0al1u	645	LAROMATIC INDUSTRIA COMERCIO EXPORTACAO E IMPORTACAO E SERVICOS LTDA	\N	17470182000167	CNPJ	1	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	RUA JOSE DE ANCHIETA - RECREIO IPITANGA - LOTEAMENTO RECREIO IPITANGA QUADRA11 LOTE 38 E 43 GALPAO02	\N	\N	\N	\N	BA	\N	\N	\N	1	t	2026-04-08 13:41:51.85	2026-04-08 13:41:51.85	\N	\N	\N	668	\N	\N	\N
cmnq3kbxq01ho9gtku9gg7hqs	646	CAF REFEICOES LTDA	\N	17502879000172	CNPJ	1	AVULSO	ATIVA	GRUPO FSA E CAF ALIMENTAÇÃO 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29163244	RUA LUCIO COSTA - SN - SAO DIOGO I - QUADRA06 LOTE 12	\N	\N	\N	SERRA	ES	(27) 9651-3420 / (27) 3066-8888	anapaula.fiusa@gmail.com	\N	1	t	2026-04-08 13:41:51.854	2026-04-08 13:41:51.854	\N	\N	\N	669	\N	\N	\N
cmnq3kbxv01hr9gtkeg20md7t	647	HOFEN ENGENHARIA PROJETOS E CONSULTORIA LTDA	\N	17595726000117	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	6	2019-03-26 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.859	2026-04-08 13:41:51.859	\N	\N	\N	670	\N	\N	\N
cmnq3kby101hu9gtkbks4uolr	648	SODRE REBOUCAS - ADVOCACIA	SODRE REBOUCAS - ADVOCACIA	17657781000194	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29066380	AVENIDA FERNANDO FERRARI, 1080	\N	\N	\N	VITORIA	ES	(27) 3376-1225	filipe@peterfilho.com.br	\N	1	t	2026-04-08 13:41:51.866	2026-04-08 13:41:51.866	\N	\N	\N	671	\N	\N	\N
cmnq3kby601hx9gtkc6yn3up6	649	MR. PAES & PANIFICADOS LTDA	\N	17677951000100	CNPJ	7	AVULSO	ATIVA	GRUPO DENISE MUNHÃO	6	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29172643	Rua Raimundo de Oliveira - Castelândia	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.87	2026-04-08 13:41:51.87	\N	\N	\N	672	\N	\N	\N
cmnq3kbya01i09gtkpgg7q41m	650	TRACTORBEL TRATORES E PECAS BELO  HORIZONTE LTDA	\N	17713959000410	CNPJ	2	MENSAL	ATIVA	GRUPO TRACTORBEL	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	30881292	\N	\N	\N	\N	\N	\N	2732989911	administrativoes@tractorbelequipamentos.com.br	\N	1	t	2026-04-08 13:41:51.875	2026-04-08 13:41:51.875	\N	\N	\N	673	\N	\N	\N
cmnq3kbyh01i39gtk6q0t5weu	651	VITORIALOG TRANSPORTE E PRESTAÇÃO DE SERVIÇOS LTDA	\N	17801124000179	CNPJ	1	AVULSO	ATIVA	GRUPO VITORIALOG	1	2013-07-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	21 2480-1777 / 27 3029-0512	\N	\N	1	t	2026-04-08 13:41:51.881	2026-04-08 13:41:51.881	\N	\N	\N	674	\N	\N	\N
cmnq3kbym01i69gtkwvp8d0py	652	VITORIALOG TRANSPORTE E PRESTAÇÃO DE SERVIÇOS LTDA	\N	17801124000250	CNPJ	2	AVULSO	ATIVA	GRUPO VITORIALOG	1	2013-07-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27 3029-0512	\N	\N	1	t	2026-04-08 13:41:51.887	2026-04-08 13:41:51.887	\N	\N	\N	675	\N	\N	\N
cmnq3kbyr01i99gtkgpt2z8a7	653	VITORIALOG TRANSPORTE E PRESTAÇÃO DE SERVIÇOS LTDA	\N	17801124000330	CNPJ	2	AVULSO	ATIVA	GRUPO VITORIALOG	1	2013-07-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.892	2026-04-08 13:41:51.892	\N	\N	\N	676	\N	\N	\N
cmnq3kbyx01ic9gtkytx0cqck	654	VITORIALOG TRANSPORTES E PRESTACAO DE SERVICOS  LTDA	\N	17801124000411	CNPJ	2	AVULSO	ATIVA	GRUPO VITORIALOG	1	2013-07-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	2721048300	patricia.katerine@rodoplanvix.com.br	\N	1	t	2026-04-08 13:41:51.898	2026-04-08 13:41:51.898	\N	\N	\N	677	\N	\N	\N
cmnq3kbz201if9gtkohrfrd9a	655	VITORIALOG TRANSPORTES E PRESTACAO DE SERVICOS LTDA	\N	17801124000500	CNPJ	2	AVULSO	ATIVA	GRUPO VITORIALOG	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	29065020	AVE ROZENDO SERAPIAO DE SOUZA FILHO - 595 - MATA DA PRAIA	\N	\N	\N	VITóRIA	ES	27 30290512	patricia.katerine@rodoplanvix.com.br	\N	1	t	2026-04-08 13:41:51.903	2026-04-08 13:41:51.903	\N	\N	\N	678	\N	\N	\N
cmnq3kbz701ii9gtkvci40v0a	656	ACCENT NUCLEO ESPECIALIZADO EM NEGOCIOS EMPRESARIAIS LTDA	\N	17811763000115	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(31) 9922-0093	alex.gustavo@accentbrasil.com	\N	1	t	2026-04-08 13:41:51.908	2026-04-08 13:41:51.908	\N	\N	\N	679	\N	\N	\N
cmnq3kbze01il9gtkc2a9feuv	657	NEWROCK DISTRIBUIDORA DE FIOS DIAMANTADOS E IMPLEMENTOS PARA MINERAÇÃO LTDA	\N	17828200000130	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.915	2026-04-08 13:41:51.915	\N	\N	\N	680	\N	\N	\N
cmnq3kbzj01io9gtke3bhzznl	658	ABC-INDUSTRIA E COMERCIO S/A-ABC-INCO	\N	17835042001540	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-03-29 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.92	2026-04-08 13:41:51.92	\N	\N	\N	681	\N	\N	\N
cmnq3kbzo01ir9gtky92tv9hy	659	RJX COMERCIO DE UTILIDADES PARA COZINHA E LAZER LTDA - ME	\N	17950102000170	CNPJ	1	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	7	2017-07-06 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	20930040	Avenida Brasil - 2306 - Benfica	\N	\N	\N	Rio de Janeiro	RJ	(21) 96539-0332	rafael@mopsrj.com.br	\N	1	t	2026-04-08 13:41:51.924	2026-04-08 13:41:51.924	\N	\N	\N	682	\N	\N	\N
cmnq3kbzw01iu9gtkdaus9j96	660	MUNHAO ADVOGADOS ASSOCIADOS	\N	18185810000125	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	3	2022-06-08 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29056250	AVENIDA NOSSA SENHORA DA PENHA - 595 - SANTA LUCIA - SALA: 1209; EDIF: TIFFANY;	\N	\N	\N	VITORIA	ES	(27) 3345-2686 / (27) 9962-0795	aloizio@munhaoadvogados.com.br	\N	1	t	2026-04-08 13:41:51.933	2026-04-08 13:41:51.933	\N	\N	\N	683	\N	\N	\N
cmnq3kc0101ix9gtktafpusmr	661	PEER BEARING DO BRASIL COMERCIO DE ROLAMENTOS LTDA	\N	18268454000294	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(011) 4506-9214	clayton@osfecontabilltda.onmicrosoft.com	\N	1	t	2026-04-08 13:41:51.938	2026-04-08 13:41:51.938	\N	\N	\N	684	\N	\N	\N
cmnq3kc0601j09gtkd7ewyzko	662	VAS COMERCIO E PRESTACAO DE SERVICOS DE INFORMACAO DIGITAL LTDA	\N	18344585000122	CNPJ	9	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.943	2026-04-08 13:41:51.943	\N	\N	\N	685	\N	\N	\N
cmnq3kc0d01j39gtkvbkil530	663	REI DO VINHO COMERCIO DE BEBIDAS - EIRELI - ME	\N	18353026000189	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30260596	raysa.bacco@gmail.com	\N	1	t	2026-04-08 13:41:51.95	2026-04-08 13:41:51.95	\N	\N	\N	686	\N	\N	\N
cmnq3kc0i01j69gtkbg94l81w	664	PREXX COMERCIO E IMPORTACAO LTDA	\N	18398145000581	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	1	2021-10-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	48 9155-9702	\N	\N	1	t	2026-04-08 13:41:51.955	2026-04-08 13:41:51.955	\N	\N	\N	687	\N	\N	\N
cmnq3kc0o01j99gtkm22xkf5z	665	STONEBRAX PROJETOS E GRANITOS LTDA	\N	18543243000131	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	6	2019-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.96	2026-04-08 13:41:51.96	\N	\N	\N	688	\N	\N	\N
cmnq3kc0t01jc9gtk9fdxd82f	666	BENTO STORE IMPORTACAO E COMERCIO DE UTENSILIOS PARA TRANSPORTE DE ALIMENTOS LTDA	\N	18713272000102	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	2017-10-05 03:00:00	\N	\N	\N	\N	\N	\N	\N	01416002	Rua da Consolação - 3344 - Cerqueira César	\N	\N	\N	São Paulo	SP	(11) 3732-5500	isabella@franco-rnc.com.br	\N	1	t	2026-04-08 13:41:51.966	2026-04-08 13:41:51.966	\N	\N	\N	690	\N	\N	\N
cmnq3kc0y01jf9gtk5fo6k69c	667	VITORIANA COMÉRCIO DE ARTEFATOS LTDA	\N	18756129000190	CNPJ	1	AVULSO	ATIVA	GRUPO BORSOINETTO	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:51.97	2026-04-08 13:41:51.97	\N	\N	\N	691	\N	\N	\N
cmnq3kc1301ji9gtkyxugq7jm	668	WINE4FRIENDS ADEGA & WINE BAR LTDA	\N	18810830000140	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2013-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	ccmagalhaes1@gmail.com	\N	1	t	2026-04-08 13:41:51.975	2026-04-08 13:41:51.975	\N	\N	\N	693	\N	\N	\N
cmnq3kc1901jl9gtkh57dnsug	669	CUBOS COMUNICACOES EIRELI	\N	18958450000157	CNPJ	1	MENSAL	ATIVA	GRUPO MR TEL	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27 33455443	financeira@mrtel.com.br	\N	1	t	2026-04-08 13:41:51.981	2026-04-08 13:41:51.981	\N	\N	\N	694	\N	\N	\N
cmnq3kc1e01jo9gtk5jn1ei57	670	BANDEIRANTES DISTRIBUIDORA DE PNEUS LTDA	\N	19403406000658	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 2104-5116	waraujo@magnumtires.com.br	\N	1	t	2026-04-08 13:41:51.986	2026-04-08 13:41:51.986	\N	\N	\N	695	\N	\N	\N
cmnq3kc1j01jr9gtk088cv7cq	671	PANIFICADORA MR. MIX EIRELI	\N	19413410000192	CNPJ	1	POTENCIAL	ATIVA	GRUPO DENISE MUNHÃO	0	2019-10-17 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29175520	Avenida Abido Saadi - 572 - Parque Jacaraípe	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:51.991	2026-04-08 13:41:51.991	\N	\N	\N	696	\N	\N	\N
cmnq3kc1p01ju9gtkod0zm7mt	672	GUINDASTES BONFIM LTDA	\N	19502996000323	CNPJ	FILIAL	AVULSO	ATIVA	GRUPO TRACTORBEL	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	0312105-1422	olivando@tractorbel.com.br	\N	1	t	2026-04-08 13:41:51.997	2026-04-08 13:41:51.997	\N	\N	\N	697	\N	\N	\N
cmnq3kc1u01jx9gtknlzkulqx	673	RAZOR DO BRASIL LTDA	\N	19847182000169	CNPJ	2	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	99062340	R DOUTOR PLINIO MOURA - 153C - PLANALTINA	\N	\N	\N	PASSO FUNDO	RS	(54) 3046-6350	atendimento@razorcomputadores.com.br	\N	1	t	2026-04-08 13:41:52.003	2026-04-08 13:41:52.003	\N	\N	\N	698	\N	\N	\N
cmnq3kc1z01k09gtk41xcsa1q	674	ZORZAL TREINAMENTOS - ME	\N	19898145000180	CNPJ	1	MENSAL	ATIVA	GRUPO ZORZAL	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	AVE CARLOS GOMES DE SA - 335 - MATA DA PRAIA	\N	\N	\N	VITORIA	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.007	2026-04-08 13:41:52.007	\N	\N	\N	699	\N	\N	\N
cmnq3kc2501k39gtko8e1eu79	675	WEX BRAZIL IMPORTADORA E EXPORTADORA LTDA	\N	20002806000398	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	2017-04-27 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.013	2026-04-08 13:41:52.013	\N	\N	\N	700	\N	\N	\N
cmnq3kc2a01k69gtk8jlevm51	676	BRASVILA COMERCIO IMPORTACAO E EXPORTACAO LTDA	\N	20079009000147	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(31) 2105-7456	alisson.bras13@gmail.com	\N	1	t	2026-04-08 13:41:52.018	2026-04-08 13:41:52.018	\N	\N	\N	701	\N	\N	\N
cmnq3kc2e01k99gtkufbppm32	677	VARGAS JR - EMPREENDIMENTOS COMERCIAIS LTDA	\N	20119431000189	CNPJ	1	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3345-6299	juridico@cartaovalemais.com.br	\N	1	t	2026-04-08 13:41:52.023	2026-04-08 13:41:52.023	\N	\N	\N	702	\N	\N	\N
cmnq3kc2k01kc9gtkj32lac0w	678	GRANDES LIVROS E PRESENTES LTDA	\N	20207244000157	CNPJ	1	MENSAL	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	29092910	Av Jose Maria Vivacqua Santos - 400 - Jardim Camburi	\N	\N	\N	Vitoria	ES	27 3101-0006  27 9944-3708 - Gleison	nunes-gleison@hotmail.com	\N	1	t	2026-04-08 13:41:52.028	2026-04-08 13:41:52.028	\N	\N	\N	703	\N	\N	\N
cmnq3kc2p01kf9gtkf7w5q9nk	679	PFX COMERCIO DE OCULOS E ACESSORIOS LTDA	\N	20329120000306	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.034	2026-04-08 13:41:52.034	\N	\N	\N	704	\N	\N	\N
cmnq3kc2u01ki9gtkfmrlvw2x	680	BRITO & SILVA COMERCIO E SERVICOS LTDA - ME	\N	20481247000184	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	339103-3688	bruno@construtorabr.com.br	\N	1	t	2026-04-08 13:41:52.038	2026-04-08 13:41:52.038	\N	\N	\N	705	\N	\N	\N
cmnq3kc3001kl9gtkl1nsf1qv	681	ANTONIO EDUARDO SILVA GALVAO	\N	20489088000164	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	5	2019-12-03 03:00:00	\N	\N	\N	\N	\N	\N	\N	06695479	Rua São João Papa - 165 - Estância São Francisco	\N	\N	\N	Itapevi	SP	11 94864-9650	eduardos-galvao@hotmail.com	\N	1	t	2026-04-08 13:41:52.044	2026-04-08 13:41:52.044	\N	\N	\N	706	\N	\N	\N
cmnq3kc3501ko9gtkqjfzj5o6	682	IMPERIUM CONDUTORES ELETRICOS E METALURGICA- EIRELI	\N	20503659000178	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.049	2026-04-08 13:41:52.049	\N	\N	\N	707	\N	\N	\N
cmnq3kc3901kr9gtkkl8h087b	683	EI ELETRO COMERCIO E PRESTAÇÃO DE SERVIÇOS EIRELE	\N	20606094000154	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2018-02-28 03:00:00	\N	\N	\N	\N	\N	\N	\N	30190000	Avenida Augusto de Lima - Sala 918 - 655 - Centro	\N	\N	\N	Belo Horizonte	MG	\N	jokacel@hotmail.com	\N	1	t	2026-04-08 13:41:52.054	2026-04-08 13:41:52.054	\N	\N	\N	708	\N	\N	\N
cmnq3kc3e01ku9gtk5isnl56g	684	MILETO DISTRIBUIDORA DE MATERIAIS ELETRICOS LTDA	\N	20710129000109	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30511001	fabiofborges@hotmail.com	\N	1	t	2026-04-08 13:41:52.058	2026-04-08 13:41:52.058	\N	\N	\N	709	\N	\N	\N
cmnq3kc3m01kx9gtkq377ql94	685	CAMPOS LIRIO ADVOGADOS ASSOCIADOS	\N	20725666000114	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 99766968	amauri@camposlirio.adv.br	\N	1	t	2026-04-08 13:41:52.067	2026-04-08 13:41:52.067	\N	\N	\N	710	\N	\N	\N
cmnq3kc3r01l09gtkp62mg39e	686	VITORIA DESENVOLVIMENTO LTDA	CANTINA DO BACCO	20861706000155	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29060670	AVENIDA ANISIO FERNANDES COELHO, 66	\N	\N	\N	VITORIA	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:52.072	2026-04-08 13:41:52.072	\N	\N	\N	711	\N	\N	\N
cmnq3kc3x01l39gtkgy5j8jn7	687	BOLOS E CONGELADOS MOXUARA EIRELI EPP	\N	20985228000195	CNPJ	1	MENSAL	ATIVA	GRUPO MOXUARA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	29156206	Rua São João - 452 - São João Batista	\N	\N	\N	Cariacica	ES	\N	Jose Paulo - Administrador  jose.paulo@congeladosmoxuara.com.br - 3254-1463.	\N	1	t	2026-04-08 13:41:52.077	2026-04-08 13:41:52.077	\N	\N	\N	712	\N	\N	\N
cmnq3kc4201l69gtk3jo6773h	688	BOLOS E CONGELADOS MOXUARA EIRELI EPP	\N	20985228000276	CNPJ	2	MENSAL	ATIVA	GRUPO MOXUARA	6	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	29156035	Rua João Rodrigues Filho - 536, ANEXO A - Cariacica Sede	\N	\N	\N	Cariacica	ES	32541463	jose.paulo@congeladosmoxuara.com.br	\N	1	t	2026-04-08 13:41:52.083	2026-04-08 13:41:52.083	\N	\N	\N	713	\N	\N	\N
cmnq3kc4701l99gtkq2ptaal0	689	C E S COMERCIAL LTDA	BOLOS E CONGELADOS MOXUARA	20985228000357	CNPJ	A DEFINIR	MENSAL	ATIVA	GRUPO MOXUARA	\N	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	21235400	ESTRADA DO PORTINHO, 00205	\N	\N	\N	RIO DE JANEIRO	RJ	(27) 3254-2505	jose.paulo@congeladosmoxuara.com	\N	1	t	2026-04-08 13:41:52.087	2026-04-08 13:41:52.087	\N	\N	\N	714	\N	\N	\N
cmnq3kc4c01lc9gtkdl5b3pw6	690	R O VARGAS - ENGENHARIA E SERVICOS	\N	21118590000121	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.092	2026-04-08 13:41:52.092	\N	\N	\N	715	\N	\N	\N
cmnq3kc4i01lf9gtk98yvnkr0	691	PGH LABORATORIOS DO BRASIL LTDA	\N	21120486000171	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	06712430	ESTV DE COTIA - 631 - JARDIM PASSARGADA I	\N	\N	\N	COTIA	SP	(11) 7720-3069	contabilidade@gnano.com.br	\N	1	t	2026-04-08 13:41:52.098	2026-04-08 13:41:52.098	\N	\N	\N	716	\N	\N	\N
cmnq3kc4m01li9gtk1txzypfo	692	PGH LABORATORIOS DO BRASIL LTDA	\N	21120486000252	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2020-11-06 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.103	2026-04-08 13:41:52.103	\N	\N	\N	717	\N	\N	\N
cmnq3kc4r01ll9gtkspdtmw1n	693	META ENGENHARIA - MENEGHELLI & TARDIN INDUSTRIA METALMECANICA, ENGENHARIA E REPRESENTACOES LTDA	\N	21207397000167	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	2019-03-19 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.108	2026-04-08 13:41:52.108	\N	\N	\N	718	\N	\N	\N
cmnq3kc4y01lo9gtk4gd7rqme	694	CGW BRASIL - INDUSTRIA E COMERCIO DE ABRASIVOS E SOLDAGEM LTDA	\N	21257850000140	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	4	2017-04-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	29164153	Av Brasil - 2078 - São Diogo 2 - Próximo ao sisterme portão verde (galpão)	\N	\N	\N	Serra	ES	27 3241-7267	adm@cgwbrasil.com.br	\N	1	t	2026-04-08 13:41:52.114	2026-04-08 13:41:52.114	\N	\N	\N	719	\N	\N	\N
cmnq3kc5301lr9gtkora7q615	695	CRZ3 ASSESSORIA EMPRESARIAL LTDA - OFFICE FARIA RJ	\N	21279398000117	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29200360	R DOUTOR SILVA MELLO - 09 - CENTRO	\N	\N	\N	GUARAPARI	ES	21982884466	cordeirodefaria@hotmail.com	\N	1	t	2026-04-08 13:41:52.119	2026-04-08 13:41:52.119	\N	\N	\N	720	\N	\N	\N
cmnq3kc5801lu9gtkhpxonpyd	696	PREMMIA ALIMENTOS ORGANICOS E NATURAIS LTDA	\N	21355960000144	CNPJ	1	MENSAL	ATIVA	GRUPO PADOCA 	1	2018-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Trabalhista	29160771	Rua Maria Delunardo Trancoso - 595 - de Fátima	\N	\N	\N	Serra	ES	\N	gabriela@novapadoca.com.br	\N	1	t	2026-04-08 13:41:52.124	2026-04-08 13:41:52.124	\N	\N	\N	721	\N	\N	\N
cmnq3kc5e01lx9gtktk6ha60e	697	RAFAEL TEIXEIRA SEA MASTER FINANCEIRA	\N	21367810000150	CNPJ	1	POTENCIAL	ATIVA	GRUPO SEA MASTER 	0	2020-02-19 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.13	2026-04-08 13:41:52.13	\N	\N	\N	722	\N	\N	\N
cmnq3kc5j01m09gtkt51e6esf	698	ATLANTICA AUTOMOTOR LTDA	\N	21439992000128	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2734343232	ludmila.falcao@atlantica-es.com.br	\N	1	t	2026-04-08 13:41:52.135	2026-04-08 13:41:52.135	\N	\N	\N	723	\N	\N	\N
cmnq3kc5n01m39gtkp6o6u8bq	699	ATLANTICA AUTOMOTOR LTDA	\N	21439992000209	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2733484444	ludmila.falcao@atlantica-es.com.br	\N	1	t	2026-04-08 13:41:52.14	2026-04-08 13:41:52.14	\N	\N	\N	724	\N	\N	\N
cmnq3kc5u01m69gtkebr0enk7	700	TECHNOFOCUS COMERCIO, IMPORTACAO E EXPORTACAO LTDA	\N	21498124000208	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	2015-03-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	RUA MISAEL PEDREIRA DA SILVA - 98 - SANTA LUCIA	\N	\N	\N	VITORIA	ES	(27) 3025-7444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:52.146	2026-04-08 13:41:52.146	\N	\N	\N	725	\N	\N	\N
cmnq3kc6001m99gtk7o25n9h1	701	TECHNOFOCUS COMERCIO, IMPORTACAO E EXPORTACAO LTDA	\N	21498124000461	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	RUA SANTA REGINA - 19 - JARDIM DO COLEGIO	\N	\N	\N	SAO PAULO	SP	(27) 3025-7444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:52.153	2026-04-08 13:41:52.153	\N	\N	\N	726	\N	\N	\N
cmnq3kc6501mc9gtkxml75kn6	702	TECHNOFOCUS COMERCIO, IMPORTACAO E EXPORTACAO LTDA	\N	21498124000542	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	2015-03-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	RUA MISAEL PEDREIRA DA SILVA - 98 - SANTA LUCIA	\N	\N	\N	VITORIA	ES	27 30257444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:52.158	2026-04-08 13:41:52.158	\N	\N	\N	727	\N	\N	\N
cmnq3kc6a01mf9gtkgd6iprhm	703	SARAH PENIDO ARQUITETURA E DESIGN LTDA	\N	21669673000109	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.163	2026-04-08 13:41:52.163	\N	\N	\N	728	\N	\N	\N
cmnq3kc6f01mi9gtk2gweyt7a	704	PFI DISTRIBUIDORA DE PERFUMES LTDA	\N	21734680000147	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2017-11-14 02:00:00	\N	\N	\N	\N	\N	\N	\N	29164092	Rua Antônio Francisco Vecci - Chacara 344 Proximo a Quimetal - 85 - Jardim Limoeiro	\N	\N	\N	Serra	ES	(11) 4841-2078	ana.silva@controlebrasil.com.br	\N	1	t	2026-04-08 13:41:52.167	2026-04-08 13:41:52.167	\N	\N	\N	729	\N	\N	\N
cmnq3kc6j01ml9gtkuzma0h1s	705	TAMAR PEQUENAS CENTRAIS HIDROELÉTRICAS S.A	\N	21813271000306	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	2020-01-14 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3098-7474	fernanda@x3brazil.com/isabella@x3brazil.com	\N	1	t	2026-04-08 13:41:52.172	2026-04-08 13:41:52.172	\N	\N	\N	730	\N	\N	\N
cmnq3kc6p01mo9gtk2q8c03gj	706	MESTRIA PSICOLOGIA E DESENVOLVIMENTO HUMANO LTDA - ME	\N	21857368000140	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29056230	R MISAEL PEDREIRA DA SILVA - sala 509 - 98 - SANTA LUCIA	\N	\N	\N	VITORIA	ES	27 21048300	eduardo@central-rnc.com.br	\N	1	t	2026-04-08 13:41:52.177	2026-04-08 13:41:52.177	\N	\N	\N	731	\N	\N	\N
cmnq3kc6t01mr9gtkqgu3z1a1	707	MN COMERCIAL DE ARTIGOS ESPORTIVOS EIRELI	\N	21896151000140	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29056245	AV NOSSA SENHORA DA PENHA - 565 - SANTA LUCIA	\N	\N	\N	VITORIA	ES	(31) 3284-9570	bh@kikos.com.br	\N	1	t	2026-04-08 13:41:52.182	2026-04-08 13:41:52.182	\N	\N	\N	732	\N	\N	\N
cmnq3kc6y01mu9gtkce6l7837	708	FC TRANSPORTES E LOGISTICA LTDA	\N	21918382000107	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	29113300	AV SAO GABRIEL DA PALHA - S/N - VALE ENCANTADO - SALA 01	\N	\N	\N	VILA VELHA	ES	(27) 8134-1476	ronilcardoso@a3soma.com.br	\N	1	t	2026-04-08 13:41:52.186	2026-04-08 13:41:52.186	\N	\N	\N	733	\N	\N	\N
cmnq3kc7201mx9gtk3c7f0k4y	709	GLOBAL MED CENTER LTDA	\N	21969275000108	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2015-03-03 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 99229383	rafaelrmccontrucoes@gmail.com	\N	1	t	2026-04-08 13:41:52.191	2026-04-08 13:41:52.191	\N	\N	\N	734	\N	\N	\N
cmnq3kc7801n09gtkm7heg5vn	710	CANTINA DO BACCO JARDIM DA PENHA EIRELI - EPP	\N	21995970000144	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	1	2015-03-05 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29060670	Av Anisio Fernandes Coelho - 66 - Jardim da Penha	\N	\N	\N	Vitoria	ES	27 21048300	cantinadobacco@gmail.com	\N	1	t	2026-04-08 13:41:52.196	2026-04-08 13:41:52.196	\N	\N	\N	735	\N	\N	\N
cmnq3kc7c01n39gtkbwei7nzp	711	GO COMERCIO DE ARTIGOS ELETRONICOS E ACESSORIOS LTDA (NOME FANTASIA: GO CASE)	\N	22165464000190	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	taygro.menezes@gocase.com.br	\N	1	t	2026-04-08 13:41:52.2	2026-04-08 13:41:52.2	\N	\N	\N	736	\N	\N	\N
cmnq3kc7g01n69gtksjcu2ral	712	ARBEIT-MATERIAL ELETRICO INDUSTRIAL LTDA	\N	22201381000290	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	2022-12-19 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29164252	RUA JOSE LUIZ DA ROCHA - 281 - CAMARA - SALA BOX 23	\N	\N	\N	RIO DE JANEIRO	ES	(21) 9458-1907	romulo@arbeiteletrica.com.br	\N	1	t	2026-04-08 13:41:52.205	2026-04-08 13:41:52.205	\N	\N	\N	737	\N	\N	\N
cmnq3kc7m01n99gtkoztri8r3	713	ONERIO DE SOUSA OLIVEIRA 11885534701	\N	22214160000176	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.21	2026-04-08 13:41:52.21	\N	\N	\N	738	\N	\N	\N
cmnq3kc7q01nc9gtkv0w8vc11	714	CONSORCIO JOTA ELE / EXXA / BASALTO	\N	22215629000191	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2722339292	contabil@consorciojde.com.br	\N	1	t	2026-04-08 13:41:52.215	2026-04-08 13:41:52.215	\N	\N	\N	739	\N	\N	\N
cmnq3kc7v01nf9gtk25cffkgv	715	SGLA COMERCIO DE BRINDES LTDA	\N	22225848000151	CNPJ	9	POTENCIAL	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.22	2026-04-08 13:41:52.22	\N	\N	\N	740	\N	\N	\N
cmnq3kc8001ni9gtko1jtqyk9	716	AGE ENGENHARIA LTDA	\N	22387876000175	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	1	2025-03-01 03:00:00	\N	\N	SIMPLES_NACIONAL	COMPETENCIA	\N	\N	\N	29190415	RUA EPHIFANIO PONTIN - 25 - POLIVALENTE - FUNDOS: ESCRITORIO;	\N	\N	\N	ARACRUZ	ES	(27) 99756-3005	ederaldomonteiro@hotmail.com	\N	1	t	2026-04-08 13:41:52.224	2026-04-08 13:41:52.224	\N	\N	\N	741	\N	\N	\N
cmnq3kc8501nl9gtkovwuz5b7	717	GJ GROUP HOME OFFICE LTDA	\N	22417691000166	CNPJ	7	POTENCIAL	ATIVA	GRUPO ARELL (GUSTAVO SCHAEFFER)	2	2018-02-06 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29146440	Rua Francisco Alves - Pav 2 Direito - 06 - Campo Grande	\N	\N	\N	Cariacica	ES	\N	gus@nssusa.com	\N	1	t	2026-04-08 13:41:52.229	2026-04-08 13:41:52.229	\N	\N	\N	742	\N	\N	\N
cmnq3kc8901no9gtky4jq2f9q	718	AT FITNESS COMERCIO DE SUPLEMENTOS ALIMENTICIOS - EIRELI	\N	22449131000193	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	\N	Avenida das Americas - 5000 - Barra da Tijuca	\N	\N	\N	Rio de Janeiro	RJ	21 96621-5211	juan.alonso@gnclivewell.com.br	\N	1	t	2026-04-08 13:41:52.233	2026-04-08 13:41:52.233	\N	\N	\N	743	\N	\N	\N
cmnq3kc8d01nr9gtkssdp5hf9	719	TRI UP TRADE IMPORT EXPORT LTDA	\N	22572224000100	CNPJ	1	AVULSO	ATIVA	GRUPO TRI UP TRADE	1	2017-05-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29164153	RUA FRANCISCO SOUSA DOS SANTOS - SALA 130 - 03 - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	2799634-5537	jp@triuptrade.com.br	\N	1	t	2026-04-08 13:41:52.237	2026-04-08 13:41:52.237	\N	\N	\N	744	\N	\N	\N
cmnq3kc8i01nu9gtkd15zxk5x	720	TRI UP TRADE IMPORT EXPORT LTDA	\N	22572224000291	CNPJ	2	MENSAL	ATIVA	GRUPO TRI UP TRADE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	57020510	R BARAO DE ATALAIA - SALA 104 - CENTRO	\N	\N	\N	ALAGOAS	MA	2799634-5537	jp@triuptrade.com.br	\N	1	t	2026-04-08 13:41:52.243	2026-04-08 13:41:52.243	\N	\N	\N	745	\N	\N	\N
cmnq3kc8n01nx9gtkk31lqige	721	PADOCA PRODUTOS NATURAIS EIRELI	\N	22630085000124	CNPJ	1	MENSAL	ATIVA	GRUPO PADOCA 	1	2018-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Trabalhista	29165150	Rua da Aldeia - 76 - Parque Residencial Laranjeiras - Centro Comercial da Aldeia Loja 02	\N	\N	\N	Serra	ES	\N	gabriela@novapadoca.com.br	\N	1	t	2026-04-08 13:41:52.247	2026-04-08 13:41:52.247	\N	\N	\N	746	\N	\N	\N
cmnq3kc8r01o09gtkw05zpzu9	722	MULTI FAST COMERCIO ATACADISTA DE MERCADORIAS EIRELI	\N	22955980000208	CNPJ	9	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29164140	ROD ES-010 - 2594 - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	(21) 4063-8830	contato@multifast.com.br	\N	1	t	2026-04-08 13:41:52.251	2026-04-08 13:41:52.251	\N	\N	\N	747	\N	\N	\N
cmnq3kc8v01o39gtklfnetavo	723	KONICA MINOLTA BUSINESS SOLUTIONS DO BRASIL LTDA	\N	23022114000480	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3050-5361	marcos.takekoshi@konicaminolta.com	\N	1	t	2026-04-08 13:41:52.255	2026-04-08 13:41:52.255	\N	\N	\N	748	\N	\N	\N
cmnq3kc8z01o69gtktj863039	724	AEGEAN PETROLEO LTDA	\N	23170758000173	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	212114-1700	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:52.26	2026-04-08 13:41:52.26	\N	\N	\N	749	\N	\N	\N
cmnq3kc9401o99gtkk9k7i0v2	725	AEGEAN PETROLEO LTDA	\N	23170758000254	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.264	2026-04-08 13:41:52.264	\N	\N	\N	750	\N	\N	\N
cmnq3kc9801oc9gtkh86n546r	726	RFM BRASIL COSMETICOS E PRODUTOS DE PERFUMARIA LTDA	\N	23235837000115	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.268	2026-04-08 13:41:52.268	\N	\N	\N	751	\N	\N	\N
cmnq3kc9d01of9gtkgqnsw14e	727	ORGBRISTOL ORGANIZAÇÕES BRISTOL LTDA	\N	23306087000110	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3397 1300	erubens@redebristol.com.br	\N	1	t	2026-04-08 13:41:52.273	2026-04-08 13:41:52.273	\N	\N	\N	752	\N	\N	\N
cmnq3kc9h01oi9gtk1s9xo002	728	ELO INTELIGENCIA CONTABIL LTDA	\N	23318618000108	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	5	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.278	2026-04-08 13:41:52.278	\N	\N	\N	753	\N	\N	\N
cmnq3kc9m01ol9gtkehhs0bit	729	TOP CANA LTDA - ME	\N	23364175000183	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29090410	Rua José Celso Cláudio - 135 - Jardim Camburi - LOJA 01	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.282	2026-04-08 13:41:52.282	\N	\N	\N	755	\N	\N	\N
cmnq3kc9q01oo9gtko7tgpqsn	730	TOP CANA LTDA	\N	23364175000264	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	6	2017-09-01 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29075685	Avenida Roza Helena Schorling Albuquerque - S/N - Aeroporto - LOJA 48 AL1019 CACHACARIA	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.286	2026-04-08 13:41:52.286	\N	\N	\N	756	\N	\N	\N
cmnq3kc9u01or9gtk9fe586ly	731	ORGANIZA DIGITAL LTDA - ME	\N	23402345000177	CNPJ	1	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	R SAO PEDRO - 1001 - SAO GERALDO	\N	\N	\N	SERRA	ES	(27) 2121-5665	LAIS.ARAUJO@DOCSYSTEMCORP.COM.BR	\N	1	t	2026-04-08 13:41:52.291	2026-04-08 13:41:52.291	\N	\N	\N	757	\N	\N	\N
cmnq3kc9z01ou9gtk4q0q8pq8	732	INVICTA STONES LTDA	\N	23649679000140	CNPJ	1	MENSAL	ATIVA	GRUPO TRI UP TRADE	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27996345537	jp@triuptrade.com.br	\N	1	t	2026-04-08 13:41:52.295	2026-04-08 13:41:52.295	\N	\N	\N	758	\N	\N	\N
cmnq3kca301ox9gtkqy7alz5u	733	FLYTEC SEGURANCA ELETRONICA LTDA	\N	23706789000104	CNPJ	9	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.299	2026-04-08 13:41:52.299	\N	\N	\N	759	\N	\N	\N
cmnq3kca901p09gtkqv8l7vta	734	VIVAMED COMERCIO DE MEDICAMENTOS E MATERIAL HOSPITALAR EIRELI	\N	23708186000133	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.305	2026-04-08 13:41:52.305	\N	\N	\N	760	\N	\N	\N
cmnq3kcaf01p39gtk78f6dikj	735	SHHC SAUDE SOLUCOES INTEGRADAS LTDA	\N	23776993000193	CNPJ	1	MENSAL	ATIVA	GRUPO INTERMED	5	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29101291	Rua Ceará - 1505 - Praia da Costa	\N	\N	\N	Vila Velha	ES	27998528309	leandro.medeiros@intermedsaude.com.br	\N	1	t	2026-04-08 13:41:52.311	2026-04-08 13:41:52.311	\N	\N	\N	761	\N	\N	\N
cmnq3kcaj01p69gtklyf0kflv	736	HCN SAUDE SOLUCOES INTEGRADAS LTDA	\N	23784506000134	CNPJ	1	MENSAL	ATIVA	GRUPO INTERMED	5	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29101291	Rua Ceará - 1505 - Praia da Costa	\N	\N	\N	Vila Velha	ES	27998528309	leandro.medeiros@intermedsaude.com.br	\N	1	t	2026-04-08 13:41:52.316	2026-04-08 13:41:52.316	\N	\N	\N	762	\N	\N	\N
cmnq3kcao01p99gtkboniljs8	737	UNIQUE SAUDE HOSPER LTDA	\N	23789171000147	CNPJ	1	AVULSO	ATIVA	GRUPO INTERMED	5	2018-09-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29129652	Alameda Sebastião Rodrigues de Souza - s/n - Interlagos	\N	\N	\N	Vila Velha	ES	279 98528309	leandro.medeiros@intermedsaude.com.br	\N	1	t	2026-04-08 13:41:52.32	2026-04-08 13:41:52.32	\N	\N	\N	763	\N	\N	\N
cmnq3kcas01pc9gtkb2h6i7hz	738	UNIAO COMERCIAL BARAO LTDA	\N	24013278001648	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	7	2017-07-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	29164140	Rodovia ES-010, QUADRA CHA; LOTE 338 - 2914 - Jardim Limoeiro	\N	\N	\N	Serra	ES	(31) 25192946	bruna.assis@lafaete.com.br	\N	1	t	2026-04-08 13:41:52.324	2026-04-08 13:41:52.324	\N	\N	\N	764	\N	\N	\N
cmnq3kcax01pf9gtk2q64gh50	739	PANIFICADORA MR. BREAD LTDA	MR PAO	24127096000111	CNPJ	1	MENSAL	ATIVA	GRUPO DENISE MUNHÃO	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29175269	AV ABIDO SAADI, 1930	\N	\N	\N	SERRA	ES	(27) 3103-3188/ (27) 3068-4588	deniseciuffi@hotmail.com	\N	1	t	2026-04-08 13:41:52.329	2026-04-08 13:41:52.329	\N	\N	\N	765	\N	\N	\N
cmnq3kcb101pi9gtktpo2amvz	740	BERNHOEFT ASSESSORIA DOCUMENTAL LTDA	\N	24723343000142	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.334	2026-04-08 13:41:52.334	\N	\N	\N	766	\N	\N	\N
cmnq3kcb701pl9gtknhazc96i	741	ICONEX LOGISTICA LTDA - ME	\N	24775412000161	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2018-01-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29167080	Avenida Eldes Scherrer Souza, SALA 914 COND COMPLEXO MONTSERRAT - 2096 - Colina de Laranjeiras	\N	\N	\N	Serra	ES	(27) 3221-5279	alexandre@iconexlog.com.br, marcio@iconexlog.com.br	\N	1	t	2026-04-08 13:41:52.339	2026-04-08 13:41:52.339	\N	\N	\N	767	\N	\N	\N
cmnq3kcbc01po9gtkf93s0tcc	742	VSS COMERCIO E MANUTENCAO INDUSTRIAL EIRELI - ME	\N	24821813000100	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 99323916	ludmila_santana@hotmail.com	\N	1	t	2026-04-08 13:41:52.344	2026-04-08 13:41:52.344	\N	\N	\N	768	\N	\N	\N
cmnq3kcbh01pr9gtk2o7wapw3	743	RESTAURANTE SHOPPING VITORIA LTDA - ME	\N	24846501000151	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	1	2016-05-20 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29050420	AV AMERICO BUAIZ - 200 - ENSEADA DO SUA	\N	\N	\N	Vitoria	ES	(27) 3325-0847	raysa.bacco@gmail.com	\N	1	t	2026-04-08 13:41:52.349	2026-04-08 13:41:52.349	\N	\N	\N	769	\N	\N	\N
cmnq3kcbm01pu9gtktyjg471d	744	ELETRICA TI LTDA	\N	25041538000256	CNPJ	2	MENSAL	ATIVA	GRUPO COMAG	2	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29168085	Rua 6 B - 80 - Civit II - LOTE 11 SALA BOX 066	\N	\N	\N	Serra	ES	(31) 3025-4283	amfp2005@gmail.com	\N	1	t	2026-04-08 13:41:52.355	2026-04-08 13:41:52.355	\N	\N	\N	770	\N	\N	\N
cmnq3kcbs01px9gtkswtsmsba	745	MB FOOD SERVICE LTDA ME	\N	25116417000145	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3067 6006	ezequiel@servfood.com.br	\N	1	t	2026-04-08 13:41:52.36	2026-04-08 13:41:52.36	\N	\N	\N	771	\N	\N	\N
cmnq3kcbx01q09gtkt7ime7uw	746	DC CONSULTORIA EMPRESARIAL LTDA	\N	25125503000114	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29102130	RUA IBITIRAMA - 50 - PRAIA DE ITAPARICA - APT 201	\N	\N	\N	VILA VELHA	ES	(27) 8848-2873	salomao_contabilidade@hotmail.com	\N	1	t	2026-04-08 13:41:52.365	2026-04-08 13:41:52.365	\N	\N	\N	772	\N	\N	\N
cmnq3kcc401q39gtkg2yx0mpd	747	NOVA GLOBAL DISTRIBUIÇÃO, LOGÍSTICA E TRANSPORTE EIRELI ME	\N	25178355000104	CNPJ	1	POTENCIAL	ATIVA	GRUPO BR ATACADISTA E NOVA GLOBAL	6	2017-11-20 02:00:00	\N	\N	\N	\N	\N	\N	\N	18035075	Rua Leopoldo Machado - 574 - Centro	\N	\N	\N	Sorocaba	SP	\N	comercial@dbrdistribuidora.com.br, jhn@jhncontabilidade.com.br	\N	1	t	2026-04-08 13:41:52.372	2026-04-08 13:41:52.372	\N	\N	\N	773	\N	\N	\N
cmnq3kccb01q69gtkm0d04kgy	748	R BARBOSA ENGENHARIA E REFORMA LTDA - EPP	\N	25215713000101	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29045402	Av. Nossa Senhora da Penha - Ed. Impacto Empresarial, sala 804 - 2796 - santa Luiza	\N	\N	\N	Vitoria	ES	27 99242-2895	rodsbarbosa@gmail.com	\N	1	t	2026-04-08 13:41:52.379	2026-04-08 13:41:52.379	\N	\N	\N	774	\N	\N	\N
cmnq3kccg01q99gtkjyslt8az	749	AYKO CYBER SEGURANCA LTDA	AYKO CYBER	25328763000197	CNPJ	7	MENSAL	ATIVA	GRUPO VIP REDE	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	29101430	RUA INACIO HIGINO, 994	\N	\N	\N	VILA VELHA	ES	(27) 4009-4802	financeiro@viprede.com	\N	1	t	2026-04-08 13:41:52.384	2026-04-08 13:41:52.384	\N	\N	\N	775	\N	\N	\N
cmnq3kcck01qc9gtkldte42jx	750	NORTHCOMM CONSULTORIA EM GESTÃO EMPRESARIAL LTDA (Empresa Baixada)	\N	25382752000195	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	6	2016-08-04 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29166828	AV PAULO PEREIRA GOMES - TORRE 3 NATURALE RESIDENCIAL APT 907 - 140 - MORADA DE LARANJEIRAS	\N	\N	\N	SERRA	ES	(27) 9.9254-2840, (13) 9.8123-9502	joseluiz@northcomm.com.br, raphael@northcomm.com.br	\N	1	t	2026-04-08 13:41:52.388	2026-04-08 13:41:52.388	\N	\N	\N	776	\N	\N	\N
cmnq3kccp01qf9gtksxz7nvgu	751	NEOBETEL EPI, EQUIPAMENTOS DE PROTECAO INDIVIDUAL LTDA	\N	25464260000220	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.394	2026-04-08 13:41:52.394	\N	\N	\N	777	\N	\N	\N
cmnq3kccv01qi9gtk33eatf1n	752	MITSUSHIBA DO BRASIL LTDA (MARCOS SHIMOJO)	\N	26092852000140	CNPJ	9	EM_CONSTITUICAO	ATIVA	GRUPO ADISTEC 	3	2019-11-04 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 99110-7482	mshimojo@mitsushiba.com.br	\N	1	t	2026-04-08 13:41:52.4	2026-04-08 13:41:52.4	\N	\N	\N	778	\N	\N	\N
cmnq3kcd001ql9gtkf4rfzyt5	753	TIAGO GOMES DE OLIVEIRA 12802056794  (OLIVEIRA CONSTRUCOES)	\N	26114387000109	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	2019-04-11 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	?evandamusiello@hotmail.com	\N	1	t	2026-04-08 13:41:52.404	2026-04-08 13:41:52.404	\N	\N	\N	779	\N	\N	\N
cmnq3kcd501qo9gtkyhkiflxq	754	SANKHYA JIVA TECNOLOGIA E INOVACAO LTDA	\N	26314062000161	CNPJ	2	EM_CONSTITUICAO	ATIVA	EMPRESA ÚNICA	6	2018-05-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	38400328	Avenida Marcos de Freitas Costa - 369 - Daniel Fonseca	\N	\N	\N	Uberlândia	MG	(27) 3024-8601	aline.oliveira@jiva.com.br	\N	1	t	2026-04-08 13:41:52.409	2026-04-08 13:41:52.409	\N	\N	\N	780	\N	\N	\N
cmnq3kcdb01qr9gtk2m5u7pgi	755	METZKER SOCIEDADE INDIVIDUAL DE ADVOCACIA	\N	26499314000174	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	2019-09-17 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.415	2026-04-08 13:41:52.415	\N	\N	\N	781	\N	\N	\N
cmnq3kcdf01qu9gtkxuc35opi	756	DISFRIO DISTRIBUIDORA DE AR CONDICIONADO E PECAS LTDA	\N	26531206000131	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	88813400	AV MANOEL DELFINO DE FREITAS - 285 - NOSSA SENHORA DA SALETE	\N	\N	\N	CRICIUMA	SC	(48) 3055-3999	athos@athoscontabil.com	\N	1	t	2026-04-08 13:41:52.42	2026-04-08 13:41:52.42	\N	\N	\N	782	\N	\N	\N
cmnq3kcdk01qx9gtk56czihiv	757	L.A RÓTULOS E ETIQUETAS ADESIVAS LTDA	\N	26593520000149	CNPJ	1	POTENCIAL	ATIVA	GRUPO ROTOTEK	0	\N	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29167018	Rua Niteroi - 1 - Alterosas	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.424	2026-04-08 13:41:52.424	\N	\N	\N	783	\N	\N	\N
cmnq3kcdq01r09gtk0uqwye8y	758	E-CONIC COMERCIO E IMPORTADORA LTDA	\N	26598157000154	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-11-05 02:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.431	2026-04-08 13:41:52.431	\N	\N	\N	784	\N	\N	\N
cmnq3kcdv01r39gtk8x2ya69w	759	CARTAO MAIS SAUDE FAMILIAR LTDA - ME	\N	26683908000130	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2017-09-28 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.435	2026-04-08 13:41:52.435	\N	\N	\N	785	\N	\N	\N
cmnq3kce001r69gtk2wbgcu9n	760	MEPY TRANSPORTES LTDA - ME	\N	26724924000124	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-01-04 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11991188928	wagner@grupowprado.com.br	\N	1	t	2026-04-08 13:41:52.44	2026-04-08 13:41:52.44	\N	\N	\N	786	\N	\N	\N
cmnq3kce501r99gtkunpwu574	761	BEV BREW STORE LTDA	\N	26726108000150	CNPJ	1	MENSAL	ATIVA	GRUPO BEBIDAS EXPRESS	2	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29070025	Rua José Martins da Cunha - 09 - República - PAVMT O1	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.445	2026-04-08 13:41:52.445	\N	\N	\N	787	\N	\N	\N
cmnq3kcea01rc9gtkg9py1sex	762	TRIDAN COMPONENTES ELETRICOS LTDA	\N	26727928000247	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-03-21 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	27916000	Rua Teixeira de Gouvêa - 1727 - Cajueiros	\N	\N	\N	Macaé	RJ	22 2772-0157	felipe.vieira@tridan.com.br	\N	1	t	2026-04-08 13:41:52.45	2026-04-08 13:41:52.45	\N	\N	\N	788	\N	\N	\N
cmnq3kcef01rf9gtk6bftbrc8	763	SERGIO LAMAS DA SILVA 01986168727	\N	26794862000127	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	29150280	RUA NILTON BALESTREIRO - 35 - ITACIBA	\N	\N	\N	CARIACICA	ES	(27) 8142-5268	sergiolamassilva@gmail.com	\N	1	t	2026-04-08 13:41:52.455	2026-04-08 13:41:52.455	\N	\N	\N	789	\N	\N	\N
cmnq3kcek01ri9gtkcxstjn4d	764	AUTO POSTO VITORIA COMERCIO DE COMBUSTIVEIS LTDA	\N	26980450000181	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29072290	RUA OLYMPIO RODRIGUES PASSOS - 14 - JABOUR - LOJA 01	\N	\N	\N	VITORIA	ES	(27) 2142-0419 / (27) 3421-6191	postopresidente1@hotmail.com	\N	1	t	2026-04-08 13:41:52.46	2026-04-08 13:41:52.46	\N	\N	\N	790	\N	\N	\N
cmnq3kceq01rl9gtkllmqtyni	765	MTZ EMPREENDIMENTOS LTDA	\N	27094242000148	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	2026-01-08 03:00:00	\N	\N	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29560000	AVENIDA JOAQUIM MACHADO DE FARIA - 435 - QUINCAS MACHADO	\N	\N	\N	GUAÇUÍ	ES	(27) 9970-3161 / (28) 3553-1571	\N	\N	1	t	2026-04-08 13:41:52.467	2026-04-08 13:41:52.467	\N	\N	\N	791	\N	\N	\N
cmnq3kcew01ro9gtk6i9h3uxr	766	BELGRADO COMERCIAL ES LTDA ME	\N	27173989000191	CNPJ	1	AVULSO	ATIVA	GRUPO BELGRADO 	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29010913	Rua Henrique Novaes - Sala 202 - 76 - Centro	\N	\N	\N	Vitória	ES	11999388991	felipe@belgradodist.com.br	\N	1	t	2026-04-08 13:41:52.473	2026-04-08 13:41:52.473	\N	\N	\N	792	\N	\N	\N
cmnq3kcf301rr9gtk1pwl0fet	767	L D AMARAL ALVARINDO EIRELI - ME	\N	27233868000198	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	2017-12-11 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	28010320	Rua Doutor Oliveira Botelho - 44 - Centro	\N	\N	\N	Campos dos Goytacazes	RJ	(22) 2105-0270	naiara.vieira@adailcosta.com	\N	1	t	2026-04-08 13:41:52.48	2026-04-08 13:41:52.48	\N	\N	\N	793	\N	\N	\N
cmnq3kcf801ru9gtkbfp2mqk9	768	CEDISA CENTRAL DE ACO S/A	\N	27244680000145	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2799626-9210	manoela.loyola@cedisa.com.br	\N	1	t	2026-04-08 13:41:52.485	2026-04-08 13:41:52.485	\N	\N	\N	794	\N	\N	\N
cmnq3kcfd01rx9gtkhz31yn8c	769	FORNECEDORA COMERCIAL MAR LTDA	\N	27272103000167	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30229092	mirtes@comercialmar.com.br	\N	1	t	2026-04-08 13:41:52.489	2026-04-08 13:41:52.489	\N	\N	\N	795	\N	\N	\N
cmnq3kcfi01s09gtkhokvt83e	770	LMA COMERCIO LTDA	\N	27363015000170	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil	29101063	RUA ROMERO LOFEGO BOTELHO, 45	\N	\N	\N	VILA VELHA	ES	(27) 9920-0753	mla.carneiro@hotmail.com	\N	1	t	2026-04-08 13:41:52.494	2026-04-08 13:41:52.494	\N	\N	\N	796	\N	\N	\N
cmnq3kcfn01s39gtkvpo9azlm	771	INSTAR EMPREENDIMENTOS E PARTICIPAÇÕES LTDA	\N	27404886000195	CNPJ	1	MENSAL	ATIVA	GRUPO INSTAR E KARMA (DRº CLAUDIO DE OLIVEIRA)	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29055270	RUA EUGENIO NETTO - 488 - PRAIA DO CANTO	\N	\N	\N	VITORIA	ES	27 2123-7688	claudio@bergi.adv.br	\N	1	t	2026-04-08 13:41:52.499	2026-04-08 13:41:52.499	\N	\N	\N	797	\N	\N	\N
cmnq3kcfr01s69gtkjrdinn4a	772	CLINICA ODONTOLOGICA DENTAL CCA LTDA	\N	27451636000106	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	1	2018-07-05 03:00:00	\N	\N	\N	\N	\N	\N	\N	29146200	Avenida Expedito Garcia - 178 - Campo Grande - COM. 02 PAV. 02	\N	\N	\N	Cariacica	ES	999781944	admsea@orthopride.com.br	\N	1	t	2026-04-08 13:41:52.504	2026-04-08 13:41:52.504	\N	\N	\N	798	\N	\N	\N
cmnq3kcfw01s99gtkweo9z8ah	773	TQARJO SERVICOS DE ESCRITORIO E ESTETICA LTDA	\N	27452760000196	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.509	2026-04-08 13:41:52.509	\N	\N	\N	799	\N	\N	\N
cmnq3kcg201sc9gtkxh3o28lx	774	VS IMPORTACAO E EXPORTACAO LTDA	\N	27452853000110	CNPJ	1	AVULSO	ATIVA	GRUPO VITORIA STONE	1	2005-07-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.515	2026-04-08 13:41:52.515	\N	\N	\N	800	\N	\N	\N
cmnq3kcg701sf9gtkkcty41dn	775	GRANICAP GRANITOS CAPIXABA LTDA	\N	27462217000170	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	29066380	AV FERNANDO FERRARI - 1080 - MATA DA PRAIA - SALA 504 EDIF AMERICA CENTRO EMPR	\N	\N	\N	VITORIA	ES	(27) 3315-0938/ (27) 3325-6935	granicap@granicap.com.br	\N	1	t	2026-04-08 13:41:52.519	2026-04-08 13:41:52.519	\N	\N	\N	801	\N	\N	\N
cmnq3kcgh01sl9gtktih8ybb7	777	SIDERAL INDUSTRIA E COMERCIO LTDA	\N	27489855000184	CNPJ	1	MENSAL	ATIVA	GRUPO SIDERAL	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	\N	29168103	Rua Reilly Duarte - 747 - CIVIT II	\N	\N	\N	Serra	ES	27 3328-3731	juliana@sidermetal.ind.br	\N	1	t	2026-04-08 13:41:52.53	2026-04-08 13:41:52.53	\N	\N	\N	803	\N	\N	\N
cmnq3kcgm01so9gtktiax4ram	778	REVEST EXPORT PISOS E REVESTIMENTOS LTDA	\N	27557883000191	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.534	2026-04-08 13:41:52.534	\N	\N	\N	804	\N	\N	\N
cmnq3kcgq01sr9gtkcqdpy6o3	779	FERRAMENTAS REAL LTDA - ME	\N	27574284000186	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 32283843	marcos.moreira@newrocktrade.com.br	\N	1	t	2026-04-08 13:41:52.539	2026-04-08 13:41:52.539	\N	\N	\N	805	\N	\N	\N
cmnq3kcgv01su9gtkjejyky0b	780	FOTON MOTOR DO BRASIL VENDAS LTDA.	\N	27580185000107	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	93334180	R TIMBAUVA - 930 - IDEAL - SALA 07	\N	\N	\N	NOVO HAMBURGO	RS	(51) 9596-4979	foton@fotondobrasil.com	\N	1	t	2026-04-08 13:41:52.544	2026-04-08 13:41:52.544	\N	\N	\N	806	\N	\N	\N
cmnq3kch001sx9gtkf1jxz62u	781	SOLUCAO INTEGRADA ASSESSORIA E CONSULTORIA LTDA - ME	\N	27648647000180	CNPJ	1	MENSAL	ATIVA	GRUPO PEREIRA & AVILA (GISELE)	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29101350	Rua Construtor Sebastião Soares de Souza - Edif. Infinity Center, Sala 108 - 40 - Praia da Costa	\N	\N	\N	Vila Velha	ES	\N	Gisele Pereira - gisele@pereiraeavila.com.br	\N	1	t	2026-04-08 13:41:52.549	2026-04-08 13:41:52.549	\N	\N	\N	807	\N	\N	\N
cmnq3kch501t09gtk5zfu4xa8	782	CALAZANS SERVICOS  MEDICOS LTDA ME	\N	27690514000172	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.553	2026-04-08 13:41:52.553	\N	\N	\N	808	\N	\N	\N
cmnq3kch901t39gtkflscxk6h	783	MOVEL NA CAIXA LTDA	\N	27709140000351	CNPJ	2	PARALIZADO	ATIVA	\N	1	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Fiscal	29147030	Rodovia Governador Mário Covas - 10600 - Serra do Anil - GALPAO24	\N	\N	\N	Cariacica	ES	\N	Jefersonkrug@gmail.com	\N	1	t	2026-04-08 13:41:52.557	2026-04-08 13:41:52.557	\N	\N	\N	809	\N	\N	\N
cmnq3kchf01t69gtkqrfmo6se	784	MOVEL NA CAIXA LTDA	\N	27709140000432	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2023-01-04 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	\N	29164252	R JOSE LUIZ DA ROCHA - 281 - CAMARA - SALA BOX 75	\N	\N	\N	BENTO GONCALVES	ES	(51) 9565-7434	sac@movelnacaixa.com.br	\N	1	t	2026-04-08 13:41:52.563	2026-04-08 13:41:52.563	\N	\N	\N	810	\N	\N	\N
cmnq3kchj01t99gtk35ji40ao	785	BONI BRASIL MARKETING E COMERCIO LTDA	\N	27734736000140	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.568	2026-04-08 13:41:52.568	\N	\N	\N	811	\N	\N	\N
cmnq3kchn01tc9gtkr2znean3	786	SEISA METALMECANICA LTDA ME	\N	27981463000138	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	2012-05-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	janny@seisa.ind.br;karla@seisa.ind.br	\N	1	t	2026-04-08 13:41:52.572	2026-04-08 13:41:52.572	\N	\N	\N	812	\N	\N	\N
cmnq3kchs01tf9gtk3n6ikc8n	787	SEISA METALMECANICA LTDA ME	\N	27981463000219	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	2012-05-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	janny@seisa.ind.br	\N	1	t	2026-04-08 13:41:52.577	2026-04-08 13:41:52.577	\N	\N	\N	813	\N	\N	\N
cmnq3kchy01ti9gtkwo1cw20m	788	KARMA REPRESENTAÇÕES LTDA	\N	28092348000175	CNPJ	1	MENSAL	ATIVA	GRUPO INSTAR E KARMA (DRº CLAUDIO DE OLIVEIRA)	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29055270	RUA EUGENIO NETTO, SALA 1011- PARTE B - 488 - PRAIA DO CANTO	\N	\N	\N	VITORIA	ES	(27) 98134-6236	claudio@bergi.adv.br	\N	1	t	2026-04-08 13:41:52.582	2026-04-08 13:41:52.582	\N	\N	\N	814	\N	\N	\N
cmnq3kci201tl9gtkoxe5gfhg	789	GRAFICA SAMORINI LTDA	\N	28130334000107	CNPJ	1	MENSAL	ATIVA	GRUPO GRAFITUSA	\N	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29052123	AV JOAO BAPTISTA PARRA - 633 - PRAIA DO SUA - SALA 1401 EDIF ENSEADA OFFICE	\N	\N	\N	VITORIA	ES	(27) 3434-2241	graficasamorini@outlook.com	\N	1	t	2026-04-08 13:41:52.587	2026-04-08 13:41:52.587	\N	\N	\N	815	\N	\N	\N
cmnq3kci601to9gtkjl9gmm14	790	CAPIXABA DISTRIBUIDORA E LOGISTICA DE ALIMENTOS LTDA	\N	28135705000135	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-02-23 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	29165680	AV ELDES SCHERRER SOUZA - 1500 - CIVIT II - ANEXO UNIDADE 01 A 05	\N	\N	\N	Serra	ES	32282929	COMERCICIALCAPIXABA@GMAIL.COM	\N	1	t	2026-04-08 13:41:52.591	2026-04-08 13:41:52.591	\N	\N	\N	816	\N	\N	\N
cmnq3kcid01tr9gtkly9q6nh9	791	PARTNER COMERCIAL E IMPORTADORA LTDA	\N	28140177000374	CNPJ	2	MENSAL	ATIVA	GRUPO PARTNER	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	29164140	Rodovia ES-010 - 2594 - Jardim Limoeiro	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.597	2026-04-08 13:41:52.597	\N	\N	\N	817	\N	\N	\N
cmnq3kcim01tx9gtkue75fm92	793	CIV COMERCIO E IMPORTACAO VITORIA LTDA	\N	28155158000150	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3886-8977	silene.mendonca@br.gt.com	\N	1	t	2026-04-08 13:41:52.606	2026-04-08 13:41:52.606	\N	\N	\N	819	\N	\N	\N
cmnq3kcir01u09gtk64l88bo7	794	RDS SERVICOS DE SAUDE LTDA (CAREMAIS CUIDADORES)	\N	28361573000160	CNPJ	A DEFINIR	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	2020-02-28 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.612	2026-04-08 13:41:52.612	\N	\N	\N	820	\N	\N	\N
cmnq3kciw01u39gtkl6odtphe	795	LM TINTAS LTDA	LUIZ TINTAS	28392018000103	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29900060	AV AUGUSTO CALMON, 1366	\N	\N	\N	LINHARES	ES	(27) 3763-2652	adm@luiztintas.com.br	\N	1	t	2026-04-08 13:41:52.617	2026-04-08 13:41:52.617	\N	\N	\N	821	\N	\N	\N
cmnq3kcj101u69gtkfop15f0u	796	PEDREIRAS DO BRASIL SA	\N	28396794000173	CNPJ	1	POTENCIAL	ATIVA	GRUPO VITORIA STONE	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 30919368	natalia@pedreirasdobrasil.com.br	\N	1	t	2026-04-08 13:41:52.621	2026-04-08 13:41:52.621	\N	\N	\N	822	\N	\N	\N
cmnq3kcj601u99gtkbazc2c3f	797	COMERCIAL NORTE SUL LTDA	\N	28413219000131	CNPJ	1	AVULSO	ATIVA	GRUPO REDE NORTE SUL	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2721048300	comercial@central-rnc.com.br	\N	1	t	2026-04-08 13:41:52.626	2026-04-08 13:41:52.626	\N	\N	\N	827	\N	\N	\N
cmnq3kcjb01uc9gtk1v70anea	798	FREIJO INDUSTRIA E COMERCIO DE MOVEIS E DECORACOES LTDA - ME	\N	28529576000160	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2017-12-07 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29167082	Avenida Monte das Oliveiras - S/N - Colina de Laranjeiras	\N	\N	\N	Serra	ES	27 3328-2048	\N	\N	1	t	2026-04-08 13:41:52.632	2026-04-08 13:41:52.632	\N	\N	\N	828	\N	\N	\N
cmnq3kcjg01uf9gtkbk0jcv7z	799	BR ATACADISTA, DISTRIBUIÇÃO E LOGÍSTICA LTDA ME	\N	28594164000103	CNPJ	1	AVULSO	ATIVA	GRUPO BR ATACADISTA E NOVA GLOBAL	6	\N	\N	\N	\N	\N	\N	\N	\N	06429120	Avenida dos Patos - 35 - Residencial Morada das Estrelas (Aldeia da Serra)	\N	\N	\N	Barueri	SP	\N	comercial@dbrdistribuidora.com.br, jhn@jhncontabilidade.com.br	\N	1	t	2026-04-08 13:41:52.636	2026-04-08 13:41:52.636	\N	\N	\N	829	\N	\N	\N
cmnq3kcih01tu9gtkxtlmxlwf	792	A MADEIRA INDUSTRIA E COMERCIO LTDA	\N	28154862000198	CNPJ	1	AVULSO	ATIVA	\N	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29160161	Avenida João Palácio - 501 - Eurico Salles	\N	\N	\N	Serra	ES	3434-5085 / 3434-5051	vivian@amadeira.com.br	\N	3	t	2026-04-08 13:41:52.602	2026-04-08 14:15:48.203	\N	\N	\N	818	\N	\N	\N
cmnq3kcjr01ul9gtkx2j5wful	801	E-CLIK SERVICOS DIGITAIS LTDA	\N	28670205000284	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.648	2026-04-08 13:41:52.648	\N	\N	\N	831	\N	\N	\N
cmnq3kcjw01uo9gtkctf5jehy	802	AUTO POSTO PORTO LTDA	\N	28761038000104	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29018190	AV PRESIDENTE FLORENTINO AVIDOS - 190 - PARQUE MOSCOSO	\N	\N	\N	VITORIA	ES	(27) 3134-7100/ (27) 3134-3104	expedicao08@tecnicontabil.com.br	\N	1	t	2026-04-08 13:41:52.652	2026-04-08 13:41:52.652	\N	\N	\N	832	\N	\N	\N
cmnq3kck101ur9gtkfcpc9bq1	803	TEIXEIRA ALIMENTACAO LTDA	\N	28871656000107	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	6	2017-10-17 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29060670	AV ANISIO FERNANDES COELHO - LOJA 12 - 66 - JARDIM DA PENHA	\N	\N	\N	VITORIA	ES	2733250847	CANTINADOBACCO@GMAIL.COM	\N	1	t	2026-04-08 13:41:52.657	2026-04-08 13:41:52.657	\N	\N	\N	833	\N	\N	\N
cmnq3kck801uu9gtkogdgczvn	804	BELGRADO COMERCIO ELETRONICO LTDA (FELIPE GREGORIO LOUREIRO)	\N	29099350000139	CNPJ	1	AVULSO	ATIVA	GRUPO BELGRADO 	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	114224-6525	felipe@belgradodist.com.br	\N	1	t	2026-04-08 13:41:52.664	2026-04-08 13:41:52.664	\N	\N	\N	834	\N	\N	\N
cmnq3kcke01ux9gtkdg8kwhbw	805	ATLAS DE IGUACU DISTRIBUIDORA DE ALIMENTOS LTDA	\N	29310554000177	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	6	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	26262020	Rua LUIZ SILVA - 236 - COMENDADOR SOARES	\N	\N	\N	Nova Iguaçu	RJ	21-26665250	luzia@atlasrio.com.br	\N	1	t	2026-04-08 13:41:52.671	2026-04-08 13:41:52.671	\N	\N	\N	835	\N	\N	\N
cmnq3kckn01v09gtky5cl0c40	806	ATLAS DE IGUACU DISTRIBUIDORA DE ALIMENTOS LTDA	\N	29310554001653	CNPJ	2	MENSAL	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29168080	Avenida Talma Rodrigues Ribeiro - 236 - CIVIT II - Galpão 04	\N	\N	\N	Serra	ES	21-26665250	luzia@atlasrio.com.br, edimar.claro@atlasrio.com.br	\N	1	t	2026-04-08 13:41:52.679	2026-04-08 13:41:52.679	\N	\N	\N	836	\N	\N	\N
cmnq3kcku01v39gtkpgt70a8e	807	AUTO POSTO PRAIA DE CAMBURI LTDA	\N	29326587000105	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29060235	AVENIDA DANTE MICHELINI - 1187 - JARDIM DA PENHA	\N	\N	\N	VITORIA	ES	(27) 3314-0083	postopresidente1@hotmail.com	\N	1	t	2026-04-08 13:41:52.687	2026-04-08 13:41:52.687	\N	\N	\N	837	\N	\N	\N
cmnq3kcl301v69gtkfe0ucid0	808	IRIS TELECOM SCM EIRELI	\N	29461351000181	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-01-22 02:00:00	\N	\N	\N	\N	\N	\N	\N	29052280	Rua Neves Armond - 210 - Praia do Suá	\N	\N	\N	Vitória	ES	3132443100	baeta@intervip.net.br alexandre@intervip.net.br	\N	1	t	2026-04-08 13:41:52.695	2026-04-08 13:41:52.695	\N	\N	\N	838	\N	\N	\N
cmnq3kcl901v99gtkp854sxnr	809	CRBFA EMPREENDIMENTOS E PARTICIPACOES LTDA	\N	29631404000165	CNPJ	1	AVULSO	ATIVA	GRUPO INSTAR E KARMA (DRº CLAUDIO DE OLIVEIRA)	1	2018-05-17 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.702	2026-04-08 13:41:52.702	\N	\N	\N	839	\N	\N	\N
cmnq3kclg01vc9gtkfci5uqr2	810	OMEGA ENGENHARIA, SERVICOS E SOLUCOES INTEGRADAS LTDA	OMEGA ENGENHARIA	29754052000135	CNPJ	1	MENSAL	ATIVA	GRUPO RAIOS SOLDAS 	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29167638	RUA MANOEL LOPES, S/N	\N	\N	\N	SERRA	ES	(27) 3241-1455	financeiro@grupoomegaengenharia.com.br	\N	1	t	2026-04-08 13:41:52.708	2026-04-08 13:41:52.708	\N	\N	\N	840	\N	\N	\N
cmnq3kcln01vf9gtkc4lq7f21	811	WILFEX TRADE IMPORTACAO E EXPORTACAO LTDA.	\N	29821533000205	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-07-23 03:00:00	\N	\N	\N	\N	\N	\N	\N	57020510	Rua Barão de Atalaia - 268 - Centro	\N	\N	\N	Maceió	AL	(11) 2396-1500 - Bianca Salvini	bsalvini@focusg.com.br	\N	1	t	2026-04-08 13:41:52.715	2026-04-08 13:41:52.715	\N	\N	\N	841	\N	\N	\N
cmnq3kclt01vi9gtkk41aucj4	812	ARELL IMPORTACAO E EXPORTAÇÃO LTDA	\N	29842995000110	CNPJ	1	MENSAL	ATIVA	GRUPO ARELL (GUSTAVO SCHAEFFER)	2	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29158900	Rodovia Governador Mário Covas - 1941 - Padre Mathias - SALA 137 KM 281.3	\N	\N	\N	Cariacica	ES	27998836259	sac@arell.com.br	\N	1	t	2026-04-08 13:41:52.721	2026-04-08 13:41:52.721	\N	\N	\N	842	\N	\N	\N
cmnq3kcm001vl9gtkyy2bnz35	813	ARELL IMPORTACAO E EXPORTAÇÃO LTDA	\N	29842995000209	CNPJ	2	MENSAL	ATIVA	\N	2	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29056260	Avenida Rio Branco - 274 - Santa Lúcia - EDIF RIO BRANCO LOJA 41	\N	\N	\N	Vitória	ES	\N	sac@arell.com.br	\N	1	t	2026-04-08 13:41:52.728	2026-04-08 13:41:52.728	\N	\N	\N	843	\N	\N	\N
cmnq3kcm701vo9gtkw39csut3	814	BR PARTNER EQUIPAMENTOS ELETRÔNICOS EIRELI	\N	29951131000136	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.735	2026-04-08 13:41:52.735	\N	\N	\N	844	\N	\N	\N
cmnq3kcme01vr9gtkw43v9cch	815	CUSTOM BOX LTDA	\N	30064795000243	CNPJ	2	MENSAL	ATIVA	GRUPO CUSTOM BOX	\N	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal;Contábil	29102020	RODOVIA DO SOL - SN - PRAIA DE ITAPARICA	\N	\N	\N	VILA VELHA	ES	(27) 3072-3042	financeiro@custombox.com.br	\N	1	t	2026-04-08 13:41:52.742	2026-04-08 13:41:52.742	\N	\N	\N	845	\N	\N	\N
cmnq3kcmm01vu9gtkuljd5g21	816	D2M COMERCIO DE SERVICOS DIGITAIS LTDA	\N	30119050000153	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.75	2026-04-08 13:41:52.75	\N	\N	\N	846	\N	\N	\N
cmnq3kcmu01vx9gtkvx20wx2r	817	I SERVICE LOGISTICA E TRANSPORTES LTDA	\N	30201814000155	CNPJ	1	MENSAL	ATIVA	GRUPO VITOR STORCK	1	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29052120	Avenida João Baptista Parra - 633 - Praia do Suá - SALA 1401 EDIFICIO ENSEADA OFFICE	\N	\N	\N	Vitória	ES	9.9619-0525	VITOR@FASTLOGBRASIL.COM.BR	\N	1	t	2026-04-08 13:41:52.759	2026-04-08 13:41:52.759	\N	\N	\N	847	\N	\N	\N
cmnq3kcn301w09gtkixmwvjir	818	JPJ REPRESENTACOES LTDA	\N	30275650000100	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal;Trabalhista	29056035	Rua José Teixeira - 711 - Santa Lúcia	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.767	2026-04-08 13:41:52.767	\N	\N	\N	848	\N	\N	\N
cmnq3kcna01w39gtkrfp515t5	819	TRANSPORTADORA NORTE FLUMINENSE DE MACAE LTDA	\N	30411573000683	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.775	2026-04-08 13:41:52.775	\N	\N	\N	849	\N	\N	\N
cmnq3kcnj01w69gtkblm6w9dz	820	L OLFATTO INDUSTRIA, COMERCIO E DISTRIBUICAO DE COSMETICOS LTDA	\N	30441578000144	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	04310030	AV DR HUGO BEOLCHI - 445 - VILA GUARANI (Z SUL) - CONJ 51	\N	\N	\N	SAO PAULO	SP	(11) 5019-1199	alexandre@lolfatto.com.br	\N	1	t	2026-04-08 13:41:52.784	2026-04-08 13:41:52.784	\N	\N	\N	850	\N	\N	\N
cmnq3kcnr01w99gtki40en94e	821	U SOLUTIONS CONSULTORIA EMPRESARIAL LTDA	\N	30632282000100	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	1	2019-07-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	29101320	Rua José Penna Medina - 195 - Praia da Costa	\N	\N	\N	Vila Velha	ES	\N	\N	\N	1	t	2026-04-08 13:41:52.791	2026-04-08 13:41:52.791	\N	\N	\N	851	\N	\N	\N
cmnq3kco501wf9gtk8wpb9lwj	823	UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA	\N	30691293000242	CNPJ	2	MENSAL	ATIVA	GRUPO UP LOG	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Trabalhista	29168062	RUA 7, 630	\N	\N	\N	SERRA	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:52.806	2026-04-08 13:41:52.806	\N	\N	\N	853	\N	\N	\N
cmnq3kcoc01wi9gtktnzufv4c	824	ATOL COMUNICACAO VISUAL LTDA	\N	30821270000124	CNPJ	9	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	27945402	R ALCIDES MOURAO - 1100 - AROEIRA - SALA 02	\N	\N	\N	MACAE	RJ	(22) 2763-0284	atendimento@ilhamidias.com.br	\N	1	t	2026-04-08 13:41:52.812	2026-04-08 13:41:52.812	\N	\N	\N	854	\N	\N	\N
cmnq3kcoh01wl9gtkyynwdg86	825	PLAY WORLD AUDIO E VIDEO EIRELI	\N	30846360000170	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	2018-12-11 02:00:00	\N	\N	\N	\N	\N	\N	\N	74937190	Rua H 120 - 0 - Cidade Vera Cruz	\N	\N	\N	Aparecida de Goiânia	GO	(11)983264191	quality.import@hotmail.com	\N	1	t	2026-04-08 13:41:52.817	2026-04-08 13:41:52.817	\N	\N	\N	855	\N	\N	\N
cmnq3kcol01wo9gtkt2cnzm6o	826	COSTALOG TRANSPORTES EIRELI	\N	31042305000190	CNPJ	7	MENSAL	ATIVA	GRUPO COSTANOX	6	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29110172	Rua Quartzo - 7 - Nossa Senhora da Penha - anexo a	\N	\N	\N	Vila Velha	ES	(27) 3319-0305	rosiane@jjanox.com.br	\N	1	t	2026-04-08 13:41:52.822	2026-04-08 13:41:52.822	\N	\N	\N	856	\N	\N	\N
cmnq3kcor01wr9gtk0ocv6rrd	827	LEONARDO CEZAR DO NASCIMENTO ALVES 13972595743	\N	31086585000138	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.827	2026-04-08 13:41:52.827	\N	\N	\N	857	\N	\N	\N
cmnq3kcow01wu9gtk5vgsr1ko	828	ALPHAVILLE CLINIC CARE SERVICOS EM SAUDE LTDA	\N	31248683000124	CNPJ	1	MENSAL	ATIVA	GRUPO INTERMED	5	2018-09-01 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29160670	Al Enseada - 0 - Jacuhy	\N	\N	\N	Serra	ES	279 98528309	leandro.medeiros@intermedsaude.com.br	\N	1	t	2026-04-08 13:41:52.832	2026-04-08 13:41:52.832	\N	\N	\N	858	\N	\N	\N
cmnq3kcp001wx9gtk3gmunscm	829	CAFETERIA ERVILHA BONFIM EIRELI	CHEIRIN BAO	31352813000174	CNPJ	1	MENSAL	ATIVA	\N	5	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	29100011	AVENIDA CHAMPAGNAT, 975	\N	\N	\N	VILA VELHA	ES	(27) 9944-0402	pablo.bonfim@bol.com.br	\N	1	t	2026-04-08 13:41:52.837	2026-04-08 13:41:52.837	\N	\N	\N	859	\N	\N	\N
cmnq3kcp501x09gtkb7jsy2o6	830	CASAJOLI COMERCIO DE BEBIDAS LTDA	\N	31546266002020	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.841	2026-04-08 13:41:52.841	\N	\N	\N	860	\N	\N	\N
cmnq3kcpb01x39gtka1wd74a2	831	SALUD COMERCIO VAREJISTA DE PRODUTOS ALIMENTICIOS E DESCARTAVEIS LTDA	\N	31558431000100	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29090370	Rua Italina Pereira Motta - 99 - Jardim Camburi	\N	\N	\N	Vitória	ES	\N	MATHEUSRMELO@YAHOO.COM.BR	\N	1	t	2026-04-08 13:41:52.847	2026-04-08 13:41:52.847	\N	\N	\N	861	\N	\N	\N
cmnq3kcpf01x69gtk7mm40vji	832	A3 ROTULOS E ETIQUETAS ADESIVAS EIRELI	\N	31716935000100	CNPJ	1	AVULSO	ATIVA	GRUPO ROTOTEK	2	\N	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29167018	RUA NITEROI - 01 - ALTEROSAS - LOTE 004 PAVMTO02	\N	\N	\N	\N	ES	(27) 9929-0883	administrativo@rototek.com.br	\N	1	t	2026-04-08 13:41:52.852	2026-04-08 13:41:52.852	\N	\N	\N	862	\N	\N	\N
cmnq3kcpk01x99gtkh7n6wypb	833	CONTROL WARE - AUTOMATIZANDO - SF AUTOMAÇÃO (Carlos Elias)	\N	31745141000167	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 3018-1980	carloselias@controlware.com.br	\N	1	t	2026-04-08 13:41:52.856	2026-04-08 13:41:52.856	\N	\N	\N	863	\N	\N	\N
cmnq3kcpq01xc9gtkywmwyhpb	834	TORRES & CIA LTDA (FORTLEV)	\N	31751050000134	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	02721216786	alyne@fortlev.com.br	\N	1	t	2026-04-08 13:41:52.862	2026-04-08 13:41:52.862	\N	\N	\N	864	\N	\N	\N
cmnq3kcpv01xf9gtkv29f000y	835	ANDRADE INDUSTRIA E COMERCIO DE MARMORES E GRANITOS LTDA	\N	31751233000150	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168020	RUA ANTONIO AUGUSTO VAZ - S/N - CIVIT I - QUADRAUM ANTIGA RUA UM	\N	\N	\N	\N	ES	(27) 2124-1243	contabil@andradesa.com.br	\N	1	t	2026-04-08 13:41:52.867	2026-04-08 13:41:52.867	\N	\N	\N	865	\N	\N	\N
cmnq3kcq001xi9gtkwtzdafsh	836	GRUPO GL TINTAS - LM TINTAS - GUZZO PARAFUSOS	\N	31764947000100	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29931090	Rua Monsenhor Guilherme Schimitz - 900 - Dom José Dalvit	\N	\N	\N	São Mateus	ES	3763-2652	\N	\N	1	t	2026-04-08 13:41:52.872	2026-04-08 13:41:52.872	\N	\N	\N	866	\N	\N	\N
cmnq3kcq501xl9gtkopucxwck	837	ROOTING EXPORT EIRELI	\N	31813363000170	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2017-07-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3288-1275  | 27 999701585	lays.santana@rootingexport.com	\N	1	t	2026-04-08 13:41:52.878	2026-04-08 13:41:52.878	\N	\N	\N	867	\N	\N	\N
cmnq3kcqb01xo9gtkgt3lpbh5	838	AGUA AZUL ARTIGOS DE VESTUARIO LTDA	USE AGUA AZUL	32117501000149	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29122300	RUA DOM PEDRO II, 292	\N	\N	\N	VILA VELHA	ES	(27) 9261-0737 / (27) 9926-1073	financeiro@useaguaazul.com.br	\N	1	t	2026-04-08 13:41:52.883	2026-04-08 13:41:52.883	\N	\N	\N	868	\N	\N	\N
cmnq3kcqg01xr9gtkzu2rykrg	839	VITORIA ALIMENTACAO SAUDAVEL EIRELI	\N	32120977000139	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2018-11-27 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	29072285	RUA JOSE VIVACQUA - 160 - JABOUR	\N	\N	\N	\N	ES	(27) 9817-1848	palomakkt@hotmail.com	\N	1	t	2026-04-08 13:41:52.888	2026-04-08 13:41:52.888	\N	\N	\N	869	\N	\N	\N
cmnq3kcql01xu9gtkh4gdx827	840	XAVIER E MOUTINHO CONSULTORIA LTDA	\N	32281485000125	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	0	2018-12-18 02:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.893	2026-04-08 13:41:52.893	\N	\N	\N	870	\N	\N	\N
cmnq3kcqq01xx9gtkr12e80jc	841	WAIVER COMISSARIA DE DESPACHOS LTDA	\N	32339921000411	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	2018-09-10 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.899	2026-04-08 13:41:52.899	\N	\N	\N	871	\N	\N	\N
cmnq3kcqv01y09gtk869gnfgr	842	PIZZA MOSCHEM VILA VELHA EIRELI	\N	32385800000164	CNPJ	7	MENSAL	ATIVA	GRUPO BACCO	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.904	2026-04-08 13:41:52.904	\N	\N	\N	872	\N	\N	\N
cmnq3kcr001y39gtkrnypx6cb	843	CENTRAL DE AVIAMENTOS SAO PAULO LTDA	CENTRAL DE AVIAMENTOS SAO PAULO	32424350000252	CNPJ	2	MENSAL	ATIVA	GRUPO CENTRAL DE AVIAMENTOS	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29050810	AVENIDA VITORIA, 2826	\N	\N	\N	VITORIA	ES	(27) 3357-8888	financeiro@centraldeaviamentos.com.br	\N	1	t	2026-04-08 13:41:52.909	2026-04-08 13:41:52.909	\N	\N	\N	873	\N	\N	\N
cmnq3kcr701y69gtkcb5rcgmx	844	EUROPA COMERCIAL LTDA	\N	32463085000130	CNPJ	1	AVULSO	ATIVA	GRUPO EUROPA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 3038-5999	\N	\N	1	t	2026-04-08 13:41:52.915	2026-04-08 13:41:52.915	\N	\N	\N	874	\N	\N	\N
cmnq3kcrc01y99gtke353cn1h	845	EUROPA COMERCIAL LTDA	\N	32463085000300	CNPJ	2	MENSAL	ATIVA	GRUPO EUROPA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Fiscal;Trabalhista	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.92	2026-04-08 13:41:52.92	\N	\N	\N	875	\N	\N	\N
cmnq3kcrg01yc9gtksno5pxo1	846	HAILTOOLS COMERCIO E REPRESENTACOES LTDA	\N	32468225000163	CNPJ	A DEFINIR	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	2019-07-05 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.925	2026-04-08 13:41:52.925	\N	\N	\N	876	\N	\N	\N
cmnq3kcrm01yf9gtk27ebiq04	847	BRASIGRAN BRASILEIRA DE GRANITOS LTDA (CORCOVADO)	\N	32476525000194	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	2018-03-19 03:00:00	\N	\N	\N	\N	\N	\N	\N	29168069	Rua 3 B - 115 - CIVIT II	\N	\N	\N	Serra	ES	(27) 21244700	vssouza@mcorcovado.com.br	\N	1	t	2026-04-08 13:41:52.93	2026-04-08 13:41:52.93	\N	\N	\N	877	\N	\N	\N
cmnq3kcrr01yi9gtknmpizscn	848	CONSCAM CONSTRUTORA CAMPOS LTDA	\N	32583395000199	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(22) 2737-3000	gilberto@conscam.com.br	\N	1	t	2026-04-08 13:41:52.935	2026-04-08 13:41:52.935	\N	\N	\N	878	\N	\N	\N
cmnq3kcrv01yl9gtkdfmteg9x	849	NORTHCOMM CONSULTORIA EMPRESARIAL LTDA	\N	32601382000103	CNPJ	7	MENSAL	ATIVA	\N	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29166630	Avenida dos Sabiás - 182 - Morada de Laranjeiras - COND HAPPY DAYS MANGUINHOBLOCO 03 APT 1104	\N	\N	\N	Serra	ES	13 8123952	raphael@northcomm.com.br	\N	1	t	2026-04-08 13:41:52.939	2026-04-08 13:41:52.939	\N	\N	\N	879	\N	\N	\N
cmnq3kcs101yo9gtkf3cjdb5c	850	JOAO VITOR DE SOUZA E SILVA 15058615789	\N	32622697000129	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:52.945	2026-04-08 13:41:52.945	\N	\N	\N	880	\N	\N	\N
cmnq3kcs701yr9gtk0g5tte40	851	ARCH TENDAS LOCACAO DE TENDAS E COBERTURAS LTDA	\N	32640395000183	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29168707	AV DISTRITO FEDERAL - SN - PLANICIE DA SERRA - LOJA 01	\N	\N	\N	SERRA	ES	(27) 8802-6840	\N	\N	1	t	2026-04-08 13:41:52.951	2026-04-08 13:41:52.951	\N	\N	\N	881	\N	\N	\N
cmnq3kcsd01yu9gtkm514nx5c	852	BCO EXPRESS ALIMENTACAO LTDA	\N	32653576000144	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	6	2019-02-04 02:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29102080	Rua Professor Augusto Rusch - S/N - Praia de Itaparica - QUADRA15 LOTE 01 LOJA 02	\N	\N	\N	Vila Velha	ES	27.3325.0847	catinadobacco@gmail.com paulosergio.bacco@gmail.com	\N	1	t	2026-04-08 13:41:52.958	2026-04-08 13:41:52.958	\N	\N	\N	882	\N	\N	\N
cmnq3kcsk01yx9gtkegq6r5ik	853	VIX LOGISTICA S/A	\N	32681371000172	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 21251238	PatrickG@vix.com.br	\N	1	t	2026-04-08 13:41:52.965	2026-04-08 13:41:52.965	\N	\N	\N	883	\N	\N	\N
cmnq3kcsq01z09gtklcnetrud	854	X3 - BRAZIL CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA	\N	32683243000168	CNPJ	A DEFINIR	AVULSO	ATIVA	EMPRESA ÚNICA	1	2020-02-27 03:00:00	\N	\N	\N	\N	\N	\N	\N	05407003	Rua Cardeal Arcoverde - 2365 - Pinheiros	\N	\N	\N	São Paulo	SP	(11) 3098-7474	isabella@x3brazil.com	\N	1	t	2026-04-08 13:41:52.97	2026-04-08 13:41:52.97	\N	\N	\N	884	\N	\N	\N
cmnq3kcsx01z39gtkz13cypx1	855	C A PARTICIPACOES E INVESTIMENTOS LTDA	\N	33023240000160	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL DE AVIAMENTOS	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil	29206170	AVENIDA VINA DEL MAR, 1812	\N	\N	\N	GUARAPARI	ES	(27) 3357-8876	financeiro@centraldeaviamentos.com.br	\N	1	t	2026-04-08 13:41:52.977	2026-04-08 13:41:52.977	\N	\N	\N	885	\N	\N	\N
cmnq3kct201z69gtktitsb98x	856	MEGALABS FARMACEUTICA S.A.	\N	33026055000120	CNPJ	9	EM_CONSTITUICAO	ATIVA	GRUPO ADISTEC 	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	21540100	R SIMOES DA MOTA - 57 - TURIACU	\N	\N	\N	RIO DE JANEIRO	RJ	(21) 3369-8500/ (21) 3369-8500	raphael.lima@megalabsbrasil.com.br	\N	1	t	2026-04-08 13:41:52.983	2026-04-08 13:41:52.983	\N	\N	\N	886	\N	\N	\N
cmnq3kct701z99gtksffcz5bc	857	VIA VAREJO S/A	\N	33041260063913	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3289-1670/ (27) 3031-0579	dinacont.vix@terra.com.br	\N	1	t	2026-04-08 13:41:52.988	2026-04-08 13:41:52.988	\N	\N	\N	887	\N	\N	\N
cmnq3kdl402dr9gtkl13ltclc	1031	RIBEIRO DO VALLE SERVICOS LTDA	\N	63669244000181	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.993	2026-04-08 13:41:53.993	\N	\N	\N	1063	\N	\N	\N
cmnq3kctc01zc9gtkilwn0d3h	858	THAIS EMANNUELLE MARTINS DOS REIS MAFRA	\N	33153316000172	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	2019-04-16 03:00:00	\N	\N	MEI	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	992320389	thais.mafra@4cloudes.org	\N	1	t	2026-04-08 13:41:52.993	2026-04-08 13:41:52.993	\N	\N	\N	888	\N	\N	\N
cmnq3kctj01zf9gtkj8ppo9s7	859	FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA	\N	33247450000728	CNPJ	2	MENSAL	ATIVA	GRUPO GSHIELD	7	2025-01-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Trabalhista	05275000	VIA ANHANGUERA - S/N - JARDIM JARAGUA - KM 25.5 P. LATERAL 130 SETOR PARTE C2723	\N	\N	\N	SAO PAULO	SP	(31) 9910-4981	contabil@gorilashield.com.br	\N	1	t	2026-04-08 13:41:52.999	2026-04-08 13:41:52.999	\N	\N	\N	889	\N	\N	\N
cmnq3kctp01zi9gtkzrg0knci	860	KOTAR METAIS LTDA	\N	33310213000411	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29175706	RUA PORTO ALEGRE, 307	\N	\N	\N	SERRA	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.006	2026-04-08 13:41:53.006	\N	\N	\N	890	\N	\N	\N
cmnq3kcu101zl9gtk4wlt6g38	861	SDN COMERCIO VAREJISTA DE EQUIPAMENTOS DE INFORMATICA EIRELI	\N	33355969000134	CNPJ	9	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	78050280	AVENIDA HISTORIADOR RUBENS DE MENDONCA - 1836 - JARDIM ACLIMACAO - EDIF WORK CENTER SALA 905	\N	\N	\N	CUIABA	MT	(65) 2127-7922	fernando.jaco@aptum.com.br	\N	1	t	2026-04-08 13:41:53.018	2026-04-08 13:41:53.018	\N	\N	\N	891	\N	\N	\N
cmnq3kcu801zo9gtk63efig8z	862	AEROPORTOS DO SUDESTE DO BRASIL S.A. (ZURICH)	\N	33402939000131	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	21 3736-3669	janine.barreiros@zurich-airport.lat	\N	1	t	2026-04-08 13:41:53.024	2026-04-08 13:41:53.024	\N	\N	\N	892	\N	\N	\N
cmnq3kcui01zr9gtknds74w9m	863	POSTO SANTA RITA LTDA	\N	33457341000140	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29072260	AV FERNANDO FERRARI - 3227 - JABOUR	\N	\N	\N	VITORIA	ES	(12) 3147-2549	contato@contabilidadeflorian.o.co	\N	1	t	2026-04-08 13:41:53.034	2026-04-08 13:41:53.034	\N	\N	\N	893	\N	\N	\N
cmnq3kcuo01zu9gtk94y5kyys	864	EMPRESA BRASILEIRA DE TELECOMUNICACOES S A EMBRATEL	\N	33530486000129	CNPJ	1	AVULSO	ATIVA	GRUPO CLARO	1	2017-10-23 02:00:00	\N	\N	\N	\N	\N	\N	\N	20071004	Avenida Presidente Vargas - 1012 - Centro	\N	\N	\N	Rio de Janeiro	RJ	212528-9155	mauro.costa-net@claro.com.br	\N	1	t	2026-04-08 13:41:53.04	2026-04-08 13:41:53.04	\N	\N	\N	894	\N	\N	\N
cmnq3kcuv01zx9gtkukf4rn1q	865	EMPRESA BRASILEIRA DE TELECOMUNICACOES S A EMBRATEL	\N	33530486015746	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 99415-6059	sirleine.oliveira-net@claro.com.br	\N	1	t	2026-04-08 13:41:53.047	2026-04-08 13:41:53.047	\N	\N	\N	895	\N	\N	\N
cmnq3kcv102009gtkpitzaw2v	866	JULIANA GERHARDT	\N	33679258000115	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29165155	AVENIDA PRIMEIRA AVENIDA - 232 - PARQUE RESIDENCIAL LARANJEIRAS - SALA 04	\N	\N	\N	SERRA	ES	(27) 9973-5651	juliana.consultora1@yahoo.com.br	\N	1	t	2026-04-08 13:41:53.053	2026-04-08 13:41:53.053	\N	\N	\N	896	\N	\N	\N
cmnq3kcv602039gtkzki4zknd	867	IFAST LOGISTICA E TRANSPORTES LTDA	\N	33757160000139	CNPJ	7	MENSAL	ATIVA	GRUPO VITOR STORCK	1	\N	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	\N	\N	\N	\N	\N	\N	\N	27996180525	vitor@verustecnologia.com	\N	1	t	2026-04-08 13:41:53.058	2026-04-08 13:41:53.058	\N	\N	\N	897	\N	\N	\N
cmnq3kcvc02069gtkzm38rxcm	868	IFAST LOGISTICA E TRANSPORTES LTDA	\N	33757160000210	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	7	2021-04-05 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	26315020	R PRESIDENTE DUTRA - 30480 - PARQUE OLIMPO	\N	\N	\N	QUEIMADOS	RJ	(27) 3180-0173	atendimento@ifastlogistica.com.br	\N	1	t	2026-04-08 13:41:53.065	2026-04-08 13:41:53.065	\N	\N	\N	898	\N	\N	\N
cmnq3kcvh02099gtksm6r0b0h	869	IFAST LOGISTICA E TRANSPORTES LTDA	\N	33757160000309	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	7	2021-04-05 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	32113150	RUA HIBISCO - 340 - ARVOREDO	\N	\N	\N	CONTAGEM	MG	(27) 3180-0173	atendimeto@ifastlogistica.com.br	\N	1	t	2026-04-08 13:41:53.07	2026-04-08 13:41:53.07	\N	\N	\N	899	\N	\N	\N
cmnq3kcvm020c9gtkkdq98qct	870	RENOVA INDUSTRIA E COMERCIO DE CONDUTORES ELETRICOS E SERVICOS EIRELI	\N	33935882000306	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 4328-9316	administrativo@renovacondutores.com.br	\N	1	t	2026-04-08 13:41:53.074	2026-04-08 13:41:53.074	\N	\N	\N	900	\N	\N	\N
cmnq3kcvs020f9gtkqd73t15l	871	CAIXA SEGURADORA S/A	\N	34020354001353	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-04-20 03:00:00	\N	\N	\N	\N	\N	\N	\N	29055170	Praça San Martin - 84 - Praia do Canto	\N	\N	\N	Vitória	ES	(61) 34269000	comercial@vector-rnc.com.br	\N	1	t	2026-04-08 13:41:53.081	2026-04-08 13:41:53.081	\N	\N	\N	901	\N	\N	\N
cmnq3kcvx020i9gtk61h6vvv8	872	MAIS PÃO EIRELI	\N	34460339000192	CNPJ	1	MENSAL	ATIVA	GRUPO MOXUARA	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	29156206	Rua São João - 452 - São João Batista	\N	\N	\N	Cariacica	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.086	2026-04-08 13:41:53.086	\N	\N	\N	902	\N	\N	\N
cmnq3kcw2020l9gtkn0wavtai	873	HOPPECKE BATERIAS DO BRASIL IMPORTACAO E EXPORTACAO LTDA	\N	34590698000164	CNPJ	1	MENSAL	ATIVA	GRUPO ADISTEC 	1	2019-09-01 03:00:00	\N	\N	LUCRO_REAL	CAIXA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.09	2026-04-08 13:41:53.09	\N	\N	\N	903	\N	\N	\N
cmnq3kcw8020o9gtkr8p74zsh	874	PETROHOUSE APOIO A EXTRACAO DE PETROLEO LTDA	\N	34644857000166	CNPJ	9	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	28898008	R DAS PALMEIRAS - 120 - IMPERIAL - GALPAOO	\N	\N	\N	RIO DAS OSTRAS	RJ	(22) 2211-0054	info@petro-house.com	\N	1	t	2026-04-08 13:41:53.096	2026-04-08 13:41:53.096	\N	\N	\N	904	\N	\N	\N
cmnq3kcwc020r9gtktdu320hb	875	MC ROCHA HORTIFRUTI OPA	\N	34766296000178	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2019-09-04 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29166820	Avenida Copacabana - s/n - Morada de Laranjeiras - QUADRA001 LOTE 016 PAVMTOTERREO	\N	\N	\N	Serra	ES	27997431404	hortifruti.opa@outlook.com	\N	1	t	2026-04-08 13:41:53.101	2026-04-08 13:41:53.101	\N	\N	\N	905	\N	\N	\N
cmnq3kcwh020u9gtkbirw1qhy	876	FSA REFEICOES LTDA	\N	35072477000167	CNPJ	1	AVULSO	ATIVA	GRUPO FSA E CAF ALIMENTAÇÃO 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29165460	RUA MIGUEL ANGELO - 675 - PARQUE RESIDENCIAL LARANJEIRAS	\N	\N	\N	\N	ES	(27) 3066-8888	financeiro@quall.com.br	\N	1	t	2026-04-08 13:41:53.105	2026-04-08 13:41:53.105	\N	\N	\N	906	\N	\N	\N
cmnq3kcwm020x9gtkekkm34vm	877	FSA REFEICOES LTDA	\N	35072477000248	CNPJ	2	AVULSO	ATIVA	GRUPO FSA E CAF ALIMENTAÇÃO 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29151055	RODOVIA GOVERNADOR JOSE HENRIQUE SETTE - 686 - ALTO LAGE	\N	\N	\N	CARIACICA	ES	(27) 9514-6758	financeiro@quall.com.br	\N	1	t	2026-04-08 13:41:53.11	2026-04-08 13:41:53.11	\N	\N	\N	907	\N	\N	\N
cmnq3kcwr02109gtktiq41xmv	878	B2C BRASIL INTERMEDIACOES LTDA	\N	35689522000127	CNPJ	1	MENSAL	ATIVA	GRUPO YBERA PARIS 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	29135008	Avenida Alcacibas Furtado - 800 - Canaã - GALPAO03-MOD 11-PATI02 COND LOG. G. VITORIA-CLGV	\N	\N	\N	Viana	ES	(27) 8167-0287	b2c.bra@gmail.com	\N	1	t	2026-04-08 13:41:53.116	2026-04-08 13:41:53.116	\N	\N	\N	908	\N	\N	\N
cmnq3kcww02139gtkgrwnsp27	879	GYP INDUSTRIA DE COSMETICOS LTDA	\N	35691423000180	CNPJ	1	MENSAL	ATIVA	GRUPO YBERA PARIS 	\N	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	29210505	LD DAS FLORES - 16 - SOL NASCENTE	\N	\N	\N	GUARAPARI	ES	(27) 3180-0202	adm@ybera.paris	\N	1	t	2026-04-08 13:41:53.12	2026-04-08 13:41:53.12	\N	\N	\N	909	\N	\N	\N
cmnq3kcx002169gtk0pemw4iv	880	GYP INDUSTRIA DE COSMETICOS LTDA	\N	35691423000260	CNPJ	2	MENSAL	ATIVA	GRUPO YBERA PARIS 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	29227404	RODOVIA GOVERNADOR MARIO COVAS, SN	\N	\N	\N	GUARAPARI	ES	(27) 3180-0202	adm@ybera.paris	\N	1	t	2026-04-08 13:41:53.125	2026-04-08 13:41:53.125	\N	\N	\N	910	\N	\N	\N
cmnq3kcx702199gtkwckt2bnd	881	GYP INDUSTRIA DE COSMETICOS LTDA	\N	35691423000341	CNPJ	2	MENSAL	ATIVA	GRUPO YBERA PARIS 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	29135008	AVENIDA ALCACIBAS FURTADO - 800 - CANAA - GALPAO03 - MODULOS 09 E 10	\N	\N	\N	VIANA	ES	(27) 3180-0202	adm@ybera.paris	\N	1	t	2026-04-08 13:41:53.131	2026-04-08 13:41:53.131	\N	\N	\N	911	\N	\N	\N
cmnq3kcxc021c9gtk8ciomua3	882	INTERVITA COMÉRCIO VAREJISTA E ATACADISTA LTDA	\N	35736946000103	CNPJ	7	MENSAL	ATIVA	GRUPO LA VITA	6	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29100100	Rua 23 de Maio - Centro de Vila Velha	\N	\N	\N	Vila Velha	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.137	2026-04-08 13:41:53.137	\N	\N	\N	912	\N	\N	\N
cmnq3kcxh021f9gtkgqp6qv10	883	BENVINDO STOCO - ME	\N	35953892000120	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 30654801	eduardo@grupostoco.com	\N	1	t	2026-04-08 13:41:53.141	2026-04-08 13:41:53.141	\N	\N	\N	913	\N	\N	\N
cmnq3kcxn021i9gtk4l1ujtrb	884	ELETROSOLDA LOGISTICA E IMPORTACAO LTDA	\N	35968825000189	CNPJ	1	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	2014-02-01 02:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	RUA SÃO PEDRO - 1001 - SÃO GERALDO	\N	\N	\N	SERRA	ES	\N	sig@eletrosolda.com.br	\N	1	t	2026-04-08 13:41:53.147	2026-04-08 13:41:53.147	\N	\N	\N	914	\N	\N	\N
cmnq3kcxu021l9gtk63h1jfrs	885	ELETROSOLDA LOGISTICA E IMPORTACAO LTDA	\N	35968825000260	CNPJ	2	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	Rua São Pedo - 1001 - São Geraldo	\N	\N	\N	Serra	ES	27 21215665	sig@eletrosolda.com.br	\N	1	t	2026-04-08 13:41:53.154	2026-04-08 13:41:53.154	\N	\N	\N	915	\N	\N	\N
cmnq3kcy1021o9gtkmuqzr197	886	ELETROSOLDA LOGISTICA E IMPORTACAO LTDA	\N	35968825000340	CNPJ	2	MENSAL	ATIVA	GRUPO ELETROSOLDA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	AVENIDA G - 05 - CIDADE JARDIM	\N	\N	\N	PARAUAPEBAS	PA	27 21215656	nfe@eletrosolda.com.br	\N	1	t	2026-04-08 13:41:53.161	2026-04-08 13:41:53.161	\N	\N	\N	916	\N	\N	\N
cmnq3kcy6021r9gtkkgwdam1v	887	V  & M EMPREENDIMENTOS S.A	\N	35969294000149	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2016-01-01 02:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	29010935	Avenida Jerônimo Monteiro - 1000 - Centro - SALA 1619	\N	\N	\N	Vitória	ES	999816506	mdarumjr@gmail.com	\N	1	t	2026-04-08 13:41:53.167	2026-04-08 13:41:53.167	\N	\N	\N	917	\N	\N	\N
cmnq3kcyb021u9gtkfr5io1w0	888	V & M EMPREENDIMENTOS S/A	\N	35969294000572	CNPJ	2	MENSAL	ATIVA	GRUPO V & M EMPREENDIMENTOS	\N	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29163373	Rua Piauí - 242 - São Geraldo	\N	\N	\N	Serra	ES	3038-1484 / 3038-1488	\N	\N	1	t	2026-04-08 13:41:53.172	2026-04-08 13:41:53.172	\N	\N	\N	918	\N	\N	\N
cmnq3kcyi021x9gtkor6t66xb	889	JARDIM PERFUMARIA E COSMETICOS LTDA - EPP	\N	35986298000135	CNPJ	1	MENSAL	ATIVA	GRUPO O BOTICÁRIO	1	2017-09-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29060140	Avenida Francisco Generoso da Fonseca - 777 - Jardim da Penha	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.178	2026-04-08 13:41:53.178	\N	\N	\N	919	\N	\N	\N
cmnq3kcyp02209gtkrrq5qfh8	890	OFTALMOLOGICA LTDA	\N	35992734000189	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL OFTALMICA	1	2015-03-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3025-7444	fiscal@centraloftalmica.com	\N	1	t	2026-04-08 13:41:53.186	2026-04-08 13:41:53.186	\N	\N	\N	920	\N	\N	\N
cmnq3kcyv02239gtk0adb35gk	891	MOMO SHOPPING DO BRASIL COMERCIO EIRELI	\N	35993956000116	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29164140	RODOVIA ES-010 - 2594 - JARDIM LIMOEIRO - SALA B 83	\N	\N	\N	SERRA	ES	(11) 2297-3587	ronaldo@cabralassessoria.com.br	\N	1	t	2026-04-08 13:41:53.192	2026-04-08 13:41:53.192	\N	\N	\N	921	\N	\N	\N
cmnq3kcz102269gtk3hhb5xix	892	J LEITE REPRESENTACOES LTDA	\N	36010668000167	CNPJ	1	AVULSO	ATIVA	REDE NORTE SUL 	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	02733245036	beatrizleite@globo.com	\N	1	t	2026-04-08 13:41:53.198	2026-04-08 13:41:53.198	\N	\N	\N	922	\N	\N	\N
cmnq3kcz702299gtk0bap0tf8	893	MATRICAL ENGENHARIA E CONSTRUÇÕES LTDA	\N	36019891000175	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	29163330	Rua Sabiá - 201 - Novo Horizonte	\N	\N	\N	Serra	ES	3328-3080	\N	\N	1	t	2026-04-08 13:41:53.203	2026-04-08 13:41:53.203	\N	\N	\N	923	\N	\N	\N
cmnq3kczd022c9gtkxr55s29y	894	MARCIO AURELIO SOARES ME	\N	36049302000100	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.209	2026-04-08 13:41:53.209	\N	\N	\N	924	\N	\N	\N
cmnq3kczj022f9gtksyc4tvfs	895	ATIVE MEDICAMENTOS ESPECIAIS LTDA	\N	36130310000178	CNPJ	1	AVULSO	ATIVA	\N	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29164252	Rua José Luiz da Rocha - 281 - Camará - Sala 11	\N	\N	\N	Serra	ES	11 98201-1224	jptotti@hotmail.com	\N	1	t	2026-04-08 13:41:53.215	2026-04-08 13:41:53.215	\N	\N	\N	925	\N	\N	\N
cmnq3kczq022i9gtkh79231au	896	METROLOGICA ENGENHARIA EIRELI	\N	36338911000170	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29010080	PCA COSTA PEREIRA - 168 - CENTRO	\N	\N	\N	VITORIA	ES	27 3218-5461	\N	\N	1	t	2026-04-08 13:41:53.222	2026-04-08 13:41:53.222	\N	\N	\N	926	\N	\N	\N
cmnq3kczy022l9gtkv89hcjxc	897	DEALER COMERCIAL EXPORTADORA E IMPORTADORA S/A	\N	36358976000188	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 3853-2934	vander@solutionsnet.com.br	\N	1	t	2026-04-08 13:41:53.23	2026-04-08 13:41:53.23	\N	\N	\N	927	\N	\N	\N
cmnq3kd05022o9gtkea2h3k3j	898	REVESTEC COMERCIO IMPORTACAO E EXPORTACAO LTDA	\N	36446769000185	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29168068	R 2 B - 270 - CIVIT II	\N	\N	\N	SERRA	ES	(27) 9316-8201/ (11) 2412-4422	juliano.almeida@revestec.com.br	\N	1	t	2026-04-08 13:41:53.237	2026-04-08 13:41:53.237	\N	\N	\N	928	\N	\N	\N
cmnq3kd0c022r9gtklv5db1gz	899	ND2H SERVICOS DE TECNOLOGIA E COMERCIO LTDA	\N	36488502000150	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29055642	AVENIDA RIO BRANCO, 1383	\N	\N	\N	VITORIA	ES	(27) 3100-0060	comercial@nd2h.com.br	\N	1	t	2026-04-08 13:41:53.245	2026-04-08 13:41:53.245	\N	\N	\N	929	\N	\N	\N
cmnq3kd0i022u9gtk0z3h42pv	900	INFOVARIEDADES IMPORTADORA E EXPORTADORA LTDA	\N	37361277000150	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29100020	AVENIDA HENRIQUE MOSCOSO - 1019 - CENTRO DE VILA VELHA - SALA 813	\N	\N	\N	VILA VELHA	ES	(31) 2527-3244	contato@grupogsv.com.br	\N	1	t	2026-04-08 13:41:53.251	2026-04-08 13:41:53.251	\N	\N	\N	930	\N	\N	\N
cmnq3kd0o022x9gtk8et1cgpn	901	OTIMIZA SERVICE SERVICOS E CONSERVACAO LTDA	OTIMIZA SERVICE	37567102000101	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29162738	RUA MARATAIZES, 250	\N	\N	\N	SERRA	ES	(27) 9852-7842	otimiza.vix@gmail.com	\N	1	t	2026-04-08 13:41:53.257	2026-04-08 13:41:53.257	\N	\N	\N	931	\N	\N	\N
cmnq3kd0u02309gtk546y1yk6	902	BRUNA MARA PAIVA VAILLANT 11167231740	\N	38467869000113	CNPJ	7	AVULSO	ATIVA	\N	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.262	2026-04-08 13:41:53.262	\N	\N	\N	932	\N	\N	\N
cmnq3kd0z02339gtk19cgjo5z	903	FABERLOVE LTDA	\N	39226309000130	CNPJ	7	MENSAL	ATIVA	GRUPO YBERA PARIS 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil;Fiscal	29135008	AVENIDA ALCACIBAS FURTADO, 800	\N	\N	\N	VIANA	ES	(27) 8879-4712	sauana@ybera.paris	\N	1	t	2026-04-08 13:41:53.268	2026-04-08 13:41:53.268	\N	\N	\N	933	\N	\N	\N
cmnq3kd1402369gtkneluy1sg	904	PIZZARIA D AMPEZZO LTDA	\N	39275789000129	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	29050420	AV AMERICO BUAIZ - 200 - ENSEADA DO SUA - LOJA 266 SHOPPING VITORIA	\N	\N	\N	VITORIA	ES	(27) 3324-1434	juridico@antoniomaiacontabili.dade.co	\N	1	t	2026-04-08 13:41:53.273	2026-04-08 13:41:53.273	\N	\N	\N	934	\N	\N	\N
cmnq3kd1a02399gtk54ovznqb	905	J. Z. TRANSPORTES LTDA	\N	39278270000102	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.278	2026-04-08 13:41:53.278	\N	\N	\N	935	\N	\N	\N
cmnq3kd1g023c9gtk0dszz3qg	906	GEOPORTANTE ENGENHARIA LTDA	\N	39309240000108	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.285	2026-04-08 13:41:53.285	\N	\N	\N	936	\N	\N	\N
cmnq3kd1m023f9gtkuzkfiq0o	907	KERNEL IMPORTACAO E EXPORTACAO LTDA	KERNEL - CD CARIACICA	39311386000430	CNPJ	2	MENSAL	ATIVA	GRUPO KERNEL	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 2125-0001 / (27) 2125-0001	contabil@kernel.com.br	\N	1	t	2026-04-08 13:41:53.291	2026-04-08 13:41:53.291	\N	\N	\N	937	\N	\N	\N
cmnq3kd1s023i9gtkyq6ricox	908	KERNEL IMPORTACAO E EXPORTACAO LTDA	\N	39311386000511	CNPJ	2	MENSAL	ATIVA	GRUPO KERNEL	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Contábil;Fiscal	29147030	RODOVIA GOVERNADOR MARIO COVAS, 600	\N	\N	\N	CARIACICA	ES	(27) 2125-0001	contoladoria@kernel.com.br	\N	1	t	2026-04-08 13:41:53.296	2026-04-08 13:41:53.296	\N	\N	\N	938	\N	\N	\N
cmnq3kd1x023l9gtk5idfrhmt	909	PAES ERLACHER ENGENHARIA LTDA	PAES ERLACHER ENGENHARIA	39338934000173	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	29101350	RUA CONSTRUTOR SEBASTIAO SOARES DE SOUZA, 70	\N	\N	\N	VILA VELHA	ES	(27) 2104-8300	paeserlacher@yahoo.com.br	\N	1	t	2026-04-08 13:41:53.302	2026-04-08 13:41:53.302	\N	\N	\N	939	\N	\N	\N
cmnq3kd23023o9gtk5olbw7bu	910	APES - ASSOCIAÇÃO DOS PROCURADORES DO ESTADO DO ES	\N	39351689000134	CNPJ	1	AVULSO	ATIVA	\N	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.307	2026-04-08 13:41:53.307	\N	\N	\N	940	\N	\N	\N
cmnq3kd29023r9gtkuojp9teo	911	EQUIMAQ EQUIPAMENTOS E MAQUINAS LTDA-EPP	\N	39359955000175	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.313	2026-04-08 13:41:53.313	\N	\N	\N	941	\N	\N	\N
cmnq3kd2e023u9gtk8jt7tgs1	912	NAFIS ASSESSORIA,CONSULT.,ADM E CORRETORA DE SEGUROS SS LTDA	\N	39390042000111	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29165160	R CASSIMIRO DE ABREU - 413 - PARQUE RESIDENCIAL LARANJEIRAS - LOJA 01 E 02	\N	\N	\N	SERRA	ES	(27) 3324-5415	ednete@nafiscorretora.com.br	\N	1	t	2026-04-08 13:41:53.319	2026-04-08 13:41:53.319	\N	\N	\N	942	\N	\N	\N
cmnq3kd2k023x9gtk6xun1gt6	913	RESTAURANTE SALSA DA PRAIA EIRELI	\N	39392766000102	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29055320	R MADEIRA DE FREITAS - 76 - PRAIA DO CANTO - 1 PAVIMENTO	\N	\N	\N	VITORIA	ES	(27) 3315-7511/ (27) 3395-0190	contass@terra.com.br	\N	1	t	2026-04-08 13:41:53.325	2026-04-08 13:41:53.325	\N	\N	\N	943	\N	\N	\N
cmnq3kd2q02409gtk9jzn2zfi	914	EQUIPO - EQUIPAMENTOS RODOVIARIOS LTDA	\N	39398755000121	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	1998-08-01 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	\N	rosangela@equipoequipmentos.com.br	\N	1	t	2026-04-08 13:41:53.33	2026-04-08 13:41:53.33	\N	\N	\N	944	\N	\N	\N
cmnq3kd2x02439gtk0n9xam39	915	AUTO POSTO PRESIDENTE LTDA	\N	39400494000137	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29075010	AV FERNANDO FERRARI - 808 - JARDIM DA PENHA	\N	\N	\N	VITORIA	ES	(27) 3134-7100	expedicao05@tecnicontabil.com.br	\N	1	t	2026-04-08 13:41:53.337	2026-04-08 13:41:53.337	\N	\N	\N	945	\N	\N	\N
cmnq3kd3202469gtk72fyp9v3	916	TRANSBEM LOGISTICA E PRESTACAO DE SERVICO LTDA	\N	39401445000119	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.342	2026-04-08 13:41:53.342	\N	\N	\N	946	\N	\N	\N
cmnq3kd3702499gtk34fu1txm	917	STILUSADO LTDA	\N	39405998000140	CNPJ	1	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	1993-03-18 03:00:00	\N	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	Contábil;Fiscal	29165680	AVENIDA ELDES SCHERRER SOUZA - S/N - PARQUE RESIDENCIAL LARANJEIRAS - LOJA 25- TERM ROD LARANJE	\N	\N	\N	Serra	ES	(27) 3328-3768	tako1@veloxmail.com.br	\N	1	t	2026-04-08 13:41:53.348	2026-04-08 13:41:53.348	\N	\N	\N	947	\N	\N	\N
cmnq3kd3c024c9gtkcak6rd80	918	STILUSADO LTDA	\N	39405998000301	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	27 3328-3768	\N	\N	1	t	2026-04-08 13:41:53.352	2026-04-08 13:41:53.352	\N	\N	\N	948	\N	\N	\N
cmnq3kd3g024f9gtkdusksp0x	919	CILOMEX COMERCIAL IMPORTADORA & LOGISTICA EM MERCADO EXTERIOR SA	\N	39615547000137	CNPJ	1	AVULSO	ATIVA	GRUPO CILOMEX	1	2002-08-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RUA ALBERTO DE OLIVEIRA SANTOS, SALAS 1607,1608 E 1609, EDIF. AMES - 42 - CENTRO	\N	\N	\N	VITORIA	ES	\N	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.356	2026-04-08 13:41:53.356	\N	\N	\N	949	\N	\N	\N
cmnq3kd3m024i9gtkn5w5ddas	920	CILOMEX COMERCIAL IMPORTADORA & LOGISTICA EM MERCADO EXTERIOR SA	\N	39615547000307	CNPJ	2	MENSAL	ATIVA	GRUPO CILOMEX	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RUA ALBERTO DE OLIVEIRA SANTOS, SALAS 1609, EDIF. AMES - 42 - CENTRO	\N	\N	\N	VITORIA	ES	\N	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.362	2026-04-08 13:41:53.362	\N	\N	\N	950	\N	\N	\N
cmnq3kd3r024l9gtkm524ckr8	921	CILOMEX COMERCIAL IMPORTADORA & LOGISTICA EM MERCADO EXTERIOR SA	\N	39615547000480	CNPJ	2	MENSAL	ATIVA	GRUPO CILOMEX	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RUA VINTE E NOVE - 16 - SANTA MONICA POPULAR	\N	\N	\N	VILA VELHA	ES	\N	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.367	2026-04-08 13:41:53.367	\N	\N	\N	951	\N	\N	\N
cmnq3kd3v024o9gtkmw66hu4e	922	VACCIN EXPRESS DISTRIBUIDORA DE VACINAS E MEDICAMENTOS LTDA	\N	39717546000101	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal	29157100	RODOVIA GOVERNADOR MARIO COVAS, 882	\N	\N	\N	CARIACICA	ES	(11) 5521-6028 / (11) 5548-9994	dinamica@dinamicaorg.cnt.br	\N	1	t	2026-04-08 13:41:53.372	2026-04-08 13:41:53.372	\N	\N	\N	952	\N	\N	\N
cmnq3kd40024r9gtke8ue9v2i	923	RAIO SOLDAS INSPECOES S/S - ME	\N	39785589000205	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil	\N	\N	\N	\N	\N	\N	\N	27 3322-6686	comercial@raiosoldas.com.br	\N	1	t	2026-04-08 13:41:53.376	2026-04-08 13:41:53.376	\N	\N	\N	953	\N	\N	\N
cmnq3kd46024u9gtkaq1m3gug	924	SOLUX LAVANDERIA LTDA	\N	39799762000135	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	2019-11-04 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	3320-0900	rh@soluxlavanderia.com.br	\N	1	t	2026-04-08 13:41:53.383	2026-04-08 13:41:53.383	\N	\N	\N	954	\N	\N	\N
cmnq3kd4b024x9gtkfnwpgihm	925	DIVULGUE OUTDOOR & COMUNICACAO VISUAL EIRELI - EPP	\N	39816459000101	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(27) 3228-0668	ANDRESA@DIVULGUEOUTDOOR.COM.BR	\N	1	t	2026-04-08 13:41:53.387	2026-04-08 13:41:53.387	\N	\N	\N	955	\N	\N	\N
cmnq3kd4g02509gtk7mujieyi	926	JMF COMÉRCIO - E-COMMERCE NOVALAR	\N	40186394000139	CNPJ	8	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.393	2026-04-08 13:41:53.393	\N	\N	\N	956	\N	\N	\N
cmnq3kd4m02539gtku7wamwrd	927	CLARO S.A.	\N	40432544000147	CNPJ	1	AVULSO	ATIVA	GRUPO CLARO	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	lucyval@ativagestao.com.br	\N	1	t	2026-04-08 13:41:53.398	2026-04-08 13:41:53.398	\N	\N	\N	957	\N	\N	\N
cmnq3kd4r02569gtkbkyud4i7	928	CLARO S.A.	\N	40432544011858	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RUA VITÓRIO NUNES DA SILVA - 200 - ENSEADA DO SUA	\N	\N	\N	VITORIA	ES	11 9415-7350	lucyval@ativagestao.com.br	\N	1	t	2026-04-08 13:41:53.403	2026-04-08 13:41:53.403	\N	\N	\N	958	\N	\N	\N
cmnq3kd4v02599gtksp2mvnyq	929	CLARO S.A.	\N	40432544011939	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV AMERICO BUAIZ - 200 - ENSEADA DO SUA	\N	\N	\N	VITORIA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.408	2026-04-08 13:41:53.408	\N	\N	\N	959	\N	\N	\N
cmnq3kd51025c9gtkatxt6nro	930	CLARO S.A.	\N	40432544012153	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV DR OLIVIO LIRA - 353 - PRAIA DA COSTA	\N	\N	\N	VILA VELHA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.414	2026-04-08 13:41:53.414	\N	\N	\N	960	\N	\N	\N
cmnq3kd56025f9gtk8k7vpzcw	931	CLARO S.A.	\N	40432544019913	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	RUA VITORIO NUNES DA MOTTA - 95 - ENSEADA DO SUA	\N	\N	\N	VITORIA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.419	2026-04-08 13:41:53.419	\N	\N	\N	961	\N	\N	\N
cmnq3kd5b025i9gtk4lsc7co5	932	CLARO S.A.	\N	40432544021144	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RUA CAPITAO DESLANDES - 35 - CENTRO	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.423	2026-04-08 13:41:53.423	\N	\N	\N	962	\N	\N	\N
cmnq3kd5g025l9gtkjnpylomm	933	CLARO S.A.	\N	40432544023198	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV AMERICO BUAIZ - 200 - ENSEADA DO SUA	\N	\N	\N	VITORIA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.429	2026-04-08 13:41:53.429	\N	\N	\N	963	\N	\N	\N
cmnq3kd5l025o9gtkh7uq3hnt	934	CLARO S.A	\N	40432544024674	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.434	2026-04-08 13:41:53.434	\N	\N	\N	964	\N	\N	\N
cmnq3kd5q025r9gtk6coknaai	935	CLARO S.A.	\N	40432544026707	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	PC MUNICIPAL - 31 - CENTRO	\N	\N	\N	COLATINA	ES	11 94156974	darlene.santos@claro.com.br	\N	1	t	2026-04-08 13:41:53.438	2026-04-08 13:41:53.438	\N	\N	\N	965	\N	\N	\N
cmnq3kd5v025u9gtk6vwypnox	936	CLARO S.A.	\N	40432544026880	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	1	2015-09-01 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	R XV DE NOVEMBRO - 141 - CAMPO GRANDE	\N	\N	\N	CARIACICA	ES	11 94157350	elisangela.pferreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.444	2026-04-08 13:41:53.444	\N	\N	\N	966	\N	\N	\N
cmnq3kd61025x9gtkkh1voucr	937	CLARO S.A.	\N	40432544026960	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV NOGUEIRA DA GAMA - S/N - CENTRO	\N	\N	\N	LINHARES	ES	(11) 94157350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.449	2026-04-08 13:41:53.449	\N	\N	\N	967	\N	\N	\N
cmnq3kd6502609gtkp21s2v2l	938	CLARO S.A.	\N	40432544028238	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AVENIDA CENTRAL - 739 - PARQUE RESIDENCIAL LARANJEIRAS	\N	\N	\N	SERRA	ES	(11) 94157350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.454	2026-04-08 13:41:53.454	\N	\N	\N	968	\N	\N	\N
cmnq3kd6a02639gtkrngge1wp	939	CLARO S.A	\N	40432544030135	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.458	2026-04-08 13:41:53.458	\N	\N	\N	969	\N	\N	\N
cmnq3kd6g02669gtk5kzmpphb	940	CLARO S.A.	\N	40432544040289	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV JOÃO PALÁCIOS - 300 - EURICO SALLES	\N	\N	\N	SERRA	ES	(11) 94157350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.464	2026-04-08 13:41:53.464	\N	\N	\N	970	\N	\N	\N
cmnq3kd6k02699gtkadg858f6	941	CLARO S.A.	\N	40432544053348	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	0	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	ROD BR-262 6555 - 6555 - SAO FRANCISCO	\N	\N	\N	CARIACICA	ES	11 94156285	elisangela.pferreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.469	2026-04-08 13:41:53.469	\N	\N	\N	971	\N	\N	\N
cmnq3kd6p026c9gtkl66h3d0u	942	CLARO S.A.	\N	40432544053500	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	RUA LUCIANO DAS NEVES - 2418 - DIVINO ESPIRITO SANTO	\N	\N	\N	VILA VELHA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.473	2026-04-08 13:41:53.473	\N	\N	\N	972	\N	\N	\N
cmnq3kd6u026f9gtkga5rvdcc	943	CLARO S.A	\N	40432544077875	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	2015-09-01 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	+55 11 2111-2304	jeffer@ativagestao.com.br	\N	1	t	2026-04-08 13:41:53.479	2026-04-08 13:41:53.479	\N	\N	\N	973	\N	\N	\N
cmnq3kd6z026i9gtkxvk159r9	944	CLARO S.A.	\N	40432544077956	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RODOVIA DO SOL - S/N - PRAIA DE ITAPARICA	\N	\N	\N	VILA VELHA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.484	2026-04-08 13:41:53.484	\N	\N	\N	974	\N	\N	\N
cmnq3kd74026l9gtk5p6u5l30	945	CLARO S.A.	\N	40432544078090	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV JONES DOS SANTOS NEVES - 1083 - SENAMBY	\N	\N	\N	SÃO MATEUS	ES	(11) 94157350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.488	2026-04-08 13:41:53.488	\N	\N	\N	975	\N	\N	\N
cmnq3kd7a026o9gtki7ucmyb8	946	CLARO S.A.	\N	40432544078170	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV JERONIMO MONTEIRO - 174 - CENTRO	\N	\N	\N	VITORIA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.494	2026-04-08 13:41:53.494	\N	\N	\N	976	\N	\N	\N
cmnq3kd7f026r9gtk489dq92j	947	CLARO S.A.	\N	40432544080400	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	RUA ALMERINDA ALVES DA SILVA - S/N - JARDIM LIMOEIRO	\N	\N	\N	SERRA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.5	2026-04-08 13:41:53.5	\N	\N	\N	977	\N	\N	\N
cmnq3kd7k026u9gtknc6yj929	948	CLARO S.A.	\N	40432544080582	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV GETULIO VARGAS - 500 - CENTRO	\N	\N	\N	COLATINA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.504	2026-04-08 13:41:53.504	\N	\N	\N	978	\N	\N	\N
cmnq3kd7o026x9gtkyb5ic1te	949	CLARO S.A.	\N	40432544081201	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	AV JERONIMO MONTEIRO - 174 - CENTRO	\N	\N	\N	VITORIA	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.509	2026-04-08 13:41:53.509	\N	\N	\N	979	\N	\N	\N
cmnq3kd7v02709gtkd302408h	950	CLARO S.A.	\N	40432544085207	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	0	2015-09-01 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	\N	R HILARINA MARTINS BUENO - 65 - AMARAL	\N	\N	\N	CACHOEIRO DE ITAPEMIRIM	ES	11 9415-7350	Elisangela.PFerreira@claro.com.br	\N	1	t	2026-04-08 13:41:53.515	2026-04-08 13:41:53.515	\N	\N	\N	980	\N	\N	\N
cmnq3kd8002739gtk7z1ctbdx	951	CLARO S.A.	\N	40432544088567	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	1	2015-11-26 02:00:00	\N	\N	\N	\N	\N	\N	\N	29102020	Rodovia do Sol - S/N - Praia de Itaparica	\N	\N	\N	Vila Velha	ES	(21)2528-9155	mauro.costa-net@claro.com.br	\N	1	t	2026-04-08 13:41:53.52	2026-04-08 13:41:53.52	\N	\N	\N	981	\N	\N	\N
cmnq3kd8402769gtkptf9jqj0	952	CLARO S.A.	\N	40432544094109	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2125289155	mauro.costa-net@claro.com.br	\N	1	t	2026-04-08 13:41:53.524	2026-04-08 13:41:53.524	\N	\N	\N	982	\N	\N	\N
cmnq3kd8a02799gtknsxt79cj	953	CLARO S.A.	\N	40432544094290	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	1	2017-07-04 03:00:00	\N	\N	\N	\N	\N	\N	\N	29303310	Rua Resk Salim Carone - 26-28 - Gilberto Machado	\N	\N	\N	Cachoeiro de Itapemirim	ES	2125289155	mauro.costa-net@claro.com.br	\N	1	t	2026-04-08 13:41:53.531	2026-04-08 13:41:53.531	\N	\N	\N	983	\N	\N	\N
cmnq3kd8f027c9gtkm3t1leqp	954	CLARO S.A	\N	40432544099259	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	0	2020-01-30 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 4313-4606	eduardo@ativagestao.com.br	\N	1	t	2026-04-08 13:41:53.536	2026-04-08 13:41:53.536	\N	\N	\N	984	\N	\N	\N
cmnq3kd8k027f9gtkaco7w59d	955	SPCRED FACTORING FOMENTO MERCANTIL LTDA	\N	40776202000144	CNPJ	1	POTENCIAL	ATIVA	GRUPO CINTYA 	2	\N	\N	\N	\N	\N	\N	\N	\N	07151370	AV MARCIAL LOURENCO SERODIO - 170 - CIDADE SERODIO	\N	\N	\N	GUARULHOS	SP	(27) 3300-9000	societario@controltech.com.br	\N	1	t	2026-04-08 13:41:53.54	2026-04-08 13:41:53.54	\N	\N	\N	985	\N	\N	\N
cmnq3kd8q027i9gtkukkk1skh	956	INFINITY TRADE EQUIPAMENTOS ELETRÔNICOS LTDA	\N	40865843000175	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	VITORIA	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.546	2026-04-08 13:41:53.546	\N	\N	\N	986	\N	\N	\N
cmnq3kd8v027l9gtkux3b35ap	957	TYKYRAS WATER TECHNOLOGIES LTDA	\N	41037967000125	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	66060020	RUA ANTONIO BARRETO - 1695 - FATIMA	\N	\N	\N	BELEM	PA	(91) 3015-4430 / (91) 9381-7575 / (00) 0000-0000	tykyraswater@gmail.com	\N	1	t	2026-04-08 13:41:53.551	2026-04-08 13:41:53.551	\N	\N	\N	987	\N	\N	\N
cmnq3kd8z027o9gtk2tn6a83y	958	MERX ATACADISTA E DISTRIBUIDORA LTDA	\N	41337711000133	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.556	2026-04-08 13:41:53.556	\N	\N	\N	988	\N	\N	\N
cmnq3kd95027r9gtkngbojl66	959	ILHA DAS FERRAMENTAS COMERCIO VAREJISTA LTDA	\N	41424561000286	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2024-08-01 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista	07750020	AVENIDA DOUTOR ANTONIO JOAO ABDALLA - 2010 - EMPRESARIAL COLINA - GALPAOA ANEXO PARTE 125	\N	\N	\N	CAJAMAR	SP	(11) 4564-3336	societario@mistercont.com.br	\N	1	t	2026-04-08 13:41:53.562	2026-04-08 13:41:53.562	\N	\N	\N	989	\N	\N	\N
cmnq3kd9a027u9gtky2wy4u77	960	NEW LINK CONTABILIDADE LTDA	\N	42154236000122	CNPJ	9	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	89030030	R IGUACU - 209 - ITOUPAVA SECA	\N	\N	\N	BLUMENAU	SC	(47) 9163-3334	carlosmainhardt@gmail.com	\N	1	t	2026-04-08 13:41:53.567	2026-04-08 13:41:53.567	\N	\N	\N	990	\N	\N	\N
cmnq3kd9f027x9gtkj5v9g4dd	961	BOER DO BRASIL LTDA	\N	42186118000104	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.571	2026-04-08 13:41:53.571	\N	\N	\N	991	\N	\N	\N
cmnq3kd9l02809gtk957oern1	962	COBRA TECNOLOGIA SA	\N	42318949003108	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	3	2018-05-18 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.577	2026-04-08 13:41:53.577	\N	\N	\N	992	\N	\N	\N
cmnq3kd9v02869gtk9udwjouu	964	PLL COMERCIO LTDA	\N	42597144000117	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29101063	RUA ROMERO LOFEGO BOTELHO, 45	\N	\N	\N	VILA VELHA	ES	(27) 9920-0753	mla.carneiro@hotmail.com	\N	1	t	2026-04-08 13:41:53.588	2026-04-08 13:41:53.588	\N	\N	\N	994	\N	\N	\N
cmnq3kda002899gtknp46g139	965	PLL COMERCIO LTDA	\N	42597144000206	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	CAIXA	\N	\N	\N	29075685	AVENIDA ROZA HELENA SCHORLING ALBUQUERQUE, 856	\N	\N	\N	VITORIA	ES	(27) 9920-0753	mla.carneiro@hotmail.com	\N	1	t	2026-04-08 13:41:53.592	2026-04-08 13:41:53.592	\N	\N	\N	995	\N	\N	\N
cmnq3kda7028c9gtkegbo8z43	966	LCM FOOD LTDA	\N	42698773000133	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	2021-07-13 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	29165310	R EUCLIDES DA CUNHA - 762 - PARQUE RESIDENCIAL LARANJEIRAS	\N	\N	\N	SERRA	ES	27988095195	leticiacastrom@gmail.com.	\N	1	t	2026-04-08 13:41:53.6	2026-04-08 13:41:53.6	\N	\N	\N	996	\N	\N	\N
cmnq3kdac028f9gtka3lp485i	967	ALNITAK COMERCIO DE ARTIGOS PARA CASA LTDA	\N	42840578000287	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	\N	\N	\N	\N	\N	29161124	RUA Q - 135 - ROSARIO DE FATIMA - SALA 01	\N	\N	\N	SERRA	ES	(11) 4524-3811	contato@leonardozanini.com.br	\N	1	t	2026-04-08 13:41:53.604	2026-04-08 13:41:53.604	\N	\N	\N	997	\N	\N	\N
cmnq3kdag028i9gtkctm9km9b	968	ALNITAK COMERCIO DE ARTIGOS PARA CASA LTDA	\N	42840578000368	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29161124	R Q - 135 - ROSARIO DE FATIMA - SALA 02	\N	\N	\N	SERRA	ES	(11) 4524-3811	contato@leonardozanini.com.br	\N	1	t	2026-04-08 13:41:53.609	2026-04-08 13:41:53.609	\N	\N	\N	998	\N	\N	\N
cmnq3kdan028l9gtk8li0r4a4	969	KAL ELETROMOVEIS SOCIEDADE UNIPESSOAL LTDA	\N	43173778000296	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	2023-03-21 03:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	\N	29168062	R 7 - 630 - CIVIT II - SETOR II SALA BOX 02 ANEXO A	\N	\N	\N	\N	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.615	2026-04-08 13:41:53.615	\N	\N	\N	999	\N	\N	\N
cmnq3kdar028o9gtkrk2s88gk	970	KAL ELETROMOVEIS SOCIEDADE UNIPESSOAL LTDA	\N	43173778000377	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	\N	29168062	R 7 - 630 - CIVIT II - SALA BOX 03 ANEXO A	\N	\N	\N	SERRA	ES	(27) 2104-8300	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.62	2026-04-08 13:41:53.62	\N	\N	\N	1000	\N	\N	\N
cmnq3kdaw028r9gtkn2q8861k	971	ITALIA NO BOX RESTAURANTE ITALIANO LTDA	\N	43271753000144	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	3	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29102020	ROD DO SOL - 785 - PRAIA DE ITAPARICA - LOJA 08	\N	\N	\N	\N	ES	(33) 9959-0141	viniciusferrazsaroriz@gmail.com	\N	1	t	2026-04-08 13:41:53.624	2026-04-08 13:41:53.624	\N	\N	\N	1001	\N	\N	\N
cmnq3kdb2028u9gtke6wc36nd	972	TEXTIL DALUTEX LTDA	\N	43390996000959	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29154504	Rodovia Governador Mário Covas - 600 - Tabajara - CONTORNO KM 290 SALA 40	\N	\N	\N	Cariacica	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.631	2026-04-08 13:41:53.631	\N	\N	\N	1002	\N	\N	\N
cmnq3kdb7028x9gtk06n3v6hy	973	STEEZ COMERCIO E IMPORTACAO LTDA	\N	43945059000165	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	08810280	R PEDRO GENOVES - 1110 - VILA SUISSA - GALPAO4 A	\N	\N	\N	MOGI DAS CRUZES	SP	(11) 9595-1741/ (27) 3300-9000	societario@controltech.com.br	\N	1	t	2026-04-08 13:41:53.636	2026-04-08 13:41:53.636	\N	\N	\N	1003	\N	\N	\N
cmnq3kdbc02909gtkmsyds6c2	974	MAIS LOG SERVICOS E TRANSPORTES LTDA	\N	44346079000182	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29162706	AV SAO JOSE - 199 - PLANALTO DE CARAPINA - SALA 41	\N	\N	\N	SERRA	ES	(27) 9639-9299	leonilsonl2c@gmail.com	\N	1	t	2026-04-08 13:41:53.64	2026-04-08 13:41:53.64	\N	\N	\N	1004	\N	\N	\N
cmnq3kdbi02939gtkwoy5yzl4	975	GLENMARK FARMACEUTICA LTDA	\N	44363661000580	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11) 55046220	nicole.souza@glenmarkpharma.com	\N	1	t	2026-04-08 13:41:53.646	2026-04-08 13:41:53.646	\N	\N	\N	1005	\N	\N	\N
cmnq3kdbn02969gtkge6lqkht	976	THG COMERCIO E DISTRIBUICAO DE ELETRONICOS E ELETRODOMESTICOS LTDA	\N	44490805000136	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2021-12-06 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	Trabalhista	29168085	Rua 6 B - 2796 - Civit II - SALA 807 COND IMPACTO EMPRESARIAL	\N	\N	\N	Serra	ES	(11) 4775-0616	thiago.saul@gmail.com	\N	1	t	2026-04-08 13:41:53.652	2026-04-08 13:41:53.652	\N	\N	\N	1006	\N	\N	\N
cmnq3kdbu02999gtk7pq8e0eo	977	CENTRO MEDICO CARAMURU LTDA	\N	44906217000130	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	5	\N	\N	\N	\N	\N	\N	\N	\N	29051070	RUA JOAQUIM PLACIDO DA SILVA - 190 - ILHA DE SANTA MARIA - PAVMTO1 E 2	\N	\N	\N	VITORIA	ES	(27) 3223-7439	financeiro@cmcaramuru.com.br	\N	1	t	2026-04-08 13:41:53.658	2026-04-08 13:41:53.658	\N	\N	\N	1008	\N	\N	\N
cmnq3kdc1029c9gtkp1koggry	978	ENGEL VIX DIAGNOSTICO DE IMAGEM ESPECIALIZADO EM ODONTOLOGIA LTDA	\N	44969098000165	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.665	2026-04-08 13:41:53.665	\N	\N	\N	1009	\N	\N	\N
cmnq3kdc7029f9gtkuwsbx7l1	979	MFT COMERCIO DE ALIMENTOS LTDA	\N	44977716000119	CNPJ	1	MENSAL	ATIVA	GRUPO BACCO	2	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29060670	AVENIDA ANÍSIO FERNANDES COELHO, 66	\N	\N	\N	VITORIA	ES	(27) 3118-6547 / (0000) 0000-0000	marcusft@gmail.com	\N	1	t	2026-04-08 13:41:53.671	2026-04-08 13:41:53.671	\N	\N	\N	1010	\N	\N	\N
cmnq3kdcd029i9gtkfwfn75bh	980	CASA NAMORADA LTDA	\N	45116355000189	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29162122	ROD GOVERNADOR MÁRIO COVAS - 6685 - LARANJEIRAS VELHA	\N	\N	\N	SERRA	ES	(27) 3298-8800/ (0000) 0000-0000	allan.azevedo@jazevedo.com.br	\N	1	t	2026-04-08 13:41:53.678	2026-04-08 13:41:53.678	\N	\N	\N	1011	\N	\N	\N
cmnq3kdcj029l9gtktay2a2cx	981	NOVALOG LOGISTICA LTDA	\N	45263294000182	CNPJ	1	POTENCIAL	ATIVA	GRUPO CINTYA 	2	\N	\N	\N	\N	\N	\N	\N	\N	29162208	R CRISTAL - 409 - RESIDENCIAL VISTA DO MESTRE - SALA 02	\N	\N	\N	SERRA	ES	(27) 3300-9000/ (0000) 0000-0000	tributario1@controltech.com.br	\N	1	t	2026-04-08 13:41:53.684	2026-04-08 13:41:53.684	\N	\N	\N	1012	\N	\N	\N
cmnq3kdcp029o9gtk0tip50jx	982	BEAUTY IN FACTORY INDUSTRIA E COMERCIO LTDA	\N	45352540000172	CNPJ	1	MENSAL	ATIVA	GRUPO YBERA PARIS 	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	29210530	LADEIRA DA MATA - 16 - SOL NASCENTE	\N	\N	\N	GUARAPARI	ES	(27) 9938-9058	johnathanarealalves@gmail.com	\N	1	t	2026-04-08 13:41:53.689	2026-04-08 13:41:53.689	\N	\N	\N	1013	\N	\N	\N
cmnq3kdcw029r9gtkn65sk8kh	983	VERGELLO DI RAME BRAZIL LTDA	\N	46232011000106	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	\N	29175706	RUA PORTO ALEGRE - 307 - NOVA ZELÂNDIA - GALPAO05 B	\N	\N	\N	MIAMI	ES	(11) 5056-9430 / (0000) 0000-0000	gmeggiolaro@kotarmetals.com	\N	1	t	2026-04-08 13:41:53.696	2026-04-08 13:41:53.696	\N	\N	\N	1014	\N	\N	\N
cmnq3kdd1029u9gtk27xn9oag	984	HUB TRIBUTOS INTELIGENCIA FISCAL LTDA	HUB TRIBUTOS	46238491000104	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 2104-8300 / (0000) 0000-0000	comercial@hubtributos.com.br	\N	1	t	2026-04-08 13:41:53.702	2026-04-08 13:41:53.702	\N	\N	\N	1015	\N	\N	\N
cmnq3kdd7029x9gtk9bsq37ou	985	OCEANA INVESTIMENTOS E PARTICIPACOES LTDA	\N	46246517000166	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29100010	AVENIDA CHAMPAGNAT, 620	\N	\N	\N	VILA VELHA	ES	(27) 9277-6643	aluizio@grupolavita.com.br	\N	1	t	2026-04-08 13:41:53.707	2026-04-08 13:41:53.707	\N	\N	\N	1016	\N	\N	\N
cmnq3kddd02a09gtkdn193grh	986	OCEANA HOLDING PATRIMONIAL LTDA	\N	46290337000181	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29100010	AV CHAMPAGNAT - 620 - CENTRO DE VILA VELHA - SALA 27	\N	\N	\N	VILA VELHA	ES	(27) 3315-4852/ (0000) 0000-0000	aloizio@munhaoadvogados.com.br	\N	1	t	2026-04-08 13:41:53.714	2026-04-08 13:41:53.714	\N	\N	\N	1017	\N	\N	\N
cmnq3kddj02a39gtkq2l9h0gq	987	DM SERVIÇOS LTDA EPP	\N	46413063000170	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2022-05-17 03:00:00	\N	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2799466106	daiassis@hotmail.com	\N	1	t	2026-04-08 13:41:53.72	2026-04-08 13:41:53.72	\N	\N	\N	1018	\N	\N	\N
cmnq3kddp02a69gtkk1bthrtt	988	WEVERTON COELHO DA SILVA 12869787774	\N	46666156000107	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29164370	R GUSTAVO BARROSO - 401 - CHACARA PARREIRAL - CONJ S APTO 404	\N	\N	\N	SERRA	ES	(27) 9316-5468	agencia.artpixx@hotmail.com	\N	1	t	2026-04-08 13:41:53.726	2026-04-08 13:41:53.726	\N	\N	\N	1019	\N	\N	\N
cmnq3kddw02a99gtkivcan6ab	989	VR2 PRINT SOLUTIONS LTDA	\N	46729895000109	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	CAIXA	\N	\N	Contábil;Fiscal	29164252	RUA JOSÉ LUIZ DA ROCHA, 281	\N	\N	\N	SERRA	ES	(27) 2104-8300 / (0000) 0000-0000	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.732	2026-04-08 13:41:53.732	\N	\N	\N	1020	\N	\N	\N
cmnq3kde202ac9gtkcm45geyy	990	VIA VENETO ROUPAS LTDA	\N	47100110009650	CNPJ	2	AVULSO	ATIVA	GRUPO VIA VENETO	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29050902	Avenida Américo Buaiz - 200 - Enseada do Suá - LOJA 330 1 PISO	\N	\N	\N	Vitória	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.738	2026-04-08 13:41:53.738	\N	\N	\N	1021	\N	\N	\N
cmnq3kde902af9gtk2mr98r52	991	VIA VENETO ROUPAS LTDA	\N	47100110014220	CNPJ	2	AVULSO	ATIVA	GRUPO VIA VENETO	1	\N	\N	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29050902	Avenida Américo Buaiz - 200 - Enseada do Suá - LOJA: 423/424/424-A; : 2 PISO ;	\N	\N	\N	Vitória	ES	11 2101-8600	paralegal@viaveneto.com.br	\N	1	t	2026-04-08 13:41:53.745	2026-04-08 13:41:53.745	\N	\N	\N	1022	\N	\N	\N
cmnq3kdef02ai9gtkrp6wlpep	992	KELLY REGINA PEREIRA	\N	47527380000180	CNPJ	7	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.751	2026-04-08 13:41:53.751	\N	\N	\N	1023	\N	\N	\N
cmnq3kdek02al9gtke1p93bit	993	COMERCIAL E-COMAG LTDA	\N	47767079000144	CNPJ	1	MENSAL	ATIVA	GRUPO COMAG	2	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Trabalhista;Contábil	29168085	Rua 6 B - 80 - LOTE 11 SALA BOX 065 - SALA BOX 62	\N	\N	\N	Serra	ES	(31) 3025-4283 / (0000) 0000-0000	amfp2005@gmail.com	\N	1	t	2026-04-08 13:41:53.757	2026-04-08 13:41:53.757	\N	\N	\N	1024	\N	\N	\N
cmnq3kder02ao9gtklpe1q70a	994	ROBERTA BATISTA VERNEQUE 09654612704	\N	48032821000136	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29168152	RUA MESTRE ALVARO - 673 - MATA DA SERRA	\N	\N	\N	SERRA	ES	(27) 3251-0309	robertasocial@hotmail.com	\N	1	t	2026-04-08 13:41:53.764	2026-04-08 13:41:53.764	\N	\N	\N	1025	\N	\N	\N
cmnq3kdex02ar9gtknwwr06dy	995	CONTABIL GUARARAPES S/S LTDA	\N	48756191000142	CNPJ	1	AVULSO	ATIVA	\N	1	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 51035950	alex@guararapes-rnc.com.br	\N	1	t	2026-04-08 13:41:53.77	2026-04-08 13:41:53.77	\N	\N	\N	1026	\N	\N	\N
cmnq3kdf402au9gtk5nyh47hr	996	AGUA AZUL DIGITAL LTDA	AGUA AZUL DIGITAL	48852213000178	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29122300	RUA DOM PEDRO II, 292	\N	\N	\N	VILA VELHA	ES	(27) 9973-9615 / (0000) 0000-0000	rayssapt@useaguaazul.com.br	\N	1	t	2026-04-08 13:41:53.777	2026-04-08 13:41:53.777	\N	\N	\N	1027	\N	\N	\N
cmnq3kdfc02ax9gtkiocu1jfg	997	RAF SERVICOS LTDA	\N	48884083000155	CNPJ	1	MENSAL	ATIVA	GRUPO RV INDUSTRIA	2	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	29111840	AVENIDA IRACY CORTELETTI - 21 - NOVA AMÉRICA - LOTE 021	\N	\N	\N	VILA VELHA	ES	(27) 9816-4299 / (0000) 0000-0000	rafservicoss@gmail.com	\N	1	t	2026-04-08 13:41:53.785	2026-04-08 13:41:53.785	\N	\N	\N	1028	\N	\N	\N
cmnq3kdfj02b09gtkqilv93tu	998	AGUA AZUL CONFECCAO LTDA	\N	48885805000196	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	\N	29041265	RUA PROFESSOR ARNAUD CABRAL - 300 - NAZARETH - PAVMTO2	\N	\N	\N	\N	ES	(27) 9933-0041 / (0000) 0000-0000	rosely@useaguaazul.com.br	\N	1	t	2026-04-08 13:41:53.792	2026-04-08 13:41:53.792	\N	\N	\N	1029	\N	\N	\N
cmnq3kdft02b39gtkngrgf5qf	999	DISTRIBUIDORA MOTOPECAS UAI LTDA	\N	48953811000133	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	4	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	Fiscal	29167650	RUA SAMUEL MEIRA BRASIL - 394 - TAQUARA II - CONJ C3 PARTE B1 A B6 CONJ PARTE B7 A B11	\N	\N	\N	BELO HORIZONTE	ES	(31) 9417-0400 / (0000) 0000-0000	fiscal1@sigmagestao.com.br	\N	1	t	2026-04-08 13:41:53.801	2026-04-08 13:41:53.801	\N	\N	\N	1030	\N	\N	\N
cmnq3kdfz02b69gtk231i818z	1000	FULL ATACADO E DISTRIBUICAO DE MOTO PECAS LTDA	\N	49072380000169	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	27213020	RUA BERNARDO FERRAZ - 54 - ATERRADO	\N	\N	\N	VOLTA REDONDA	RJ	(24) 7401-5019	fullatacadopecas@gmail.com	\N	1	t	2026-04-08 13:41:53.808	2026-04-08 13:41:53.808	\N	\N	\N	1031	\N	\N	\N
cmnq3kdg602b99gtktznv5nru	1001	AYCA COMERCIO DE MATERIAIS PARA ARTES GRAFICAS LTDA	\N	49368251000384	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1151887666	fiscal@ayca.com.br	\N	1	t	2026-04-08 13:41:53.814	2026-04-08 13:41:53.814	\N	\N	\N	1032	\N	\N	\N
cmnq3kdgb02bc9gtkao1s8741	1002	BENDO LOGISTICA LTDA	\N	51410529000548	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	29163266	AV TERCEIRA AVENIDA - 28 - SAO DIOGO I - QUADRA010 LOTE 028 TERREOC/ MEZANINO	\N	\N	\N	\N	ES	(48) 9985-2308	tulio@bendo.com.br	\N	1	t	2026-04-08 13:41:53.82	2026-04-08 13:41:53.82	\N	\N	\N	1034	\N	\N	\N
cmnq3kdgg02bf9gtk3qjbjv3j	1003	BORSOI INCORPORADORA LTDA	\N	52426353000151	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2026-01-01 03:00:00	\N	\N	\N	\N	\N	\N	Fiscal;Trabalhista;Contábil	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.825	2026-04-08 13:41:53.825	\N	\N	\N	1035	\N	\N	\N
cmnq3kdgm02bi9gtk5gcvlto1	1004	GRUPO BELMAN LTDA	\N	52500863000121	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.831	2026-04-08 13:41:53.831	\N	\N	\N	1036	\N	\N	\N
cmnq3kdgr02bl9gtkpgwe0caj	1005	COMERCIAL K HAGE LTDA	\N	52832276000725	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.835	2026-04-08 13:41:53.835	\N	\N	\N	1037	\N	\N	\N
cmnq3kdgv02bo9gtkclipsh1u	1006	JORGE ERNANDES AGUILAR	\N	53119581000141	CNPJ	7	MENSAL	ATIVA	EMPRESA ÚNICA	\N	2023-12-06 03:00:00	\N	\N	\N	\N	\N	\N	\N	29152864	RUA SAO JOAO - 331 - APARECIDA	\N	\N	\N	CARIACICA	ES	(27) 9981-7770	leg@central-rnc.com.br	\N	1	t	2026-04-08 13:41:53.84	2026-04-08 13:41:53.84	\N	\N	\N	1038	\N	\N	\N
cmnq3kdh202br9gtkb3gwa9nh	1007	ALUMIPLAST COMERCIO DE METAIS LIMITADA	\N	53742607000103	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	09061000	R ILHA BELA - 200 - VILA AQUILINO	\N	\N	\N	SANTO ANDRE	SP	(11) 4428-6188	contabilidade@alumiplast.com.br	\N	1	t	2026-04-08 13:41:53.846	2026-04-08 13:41:53.846	\N	\N	\N	1039	\N	\N	\N
cmnq3kdh802bu9gtk9chqbucw	1008	LIDA SERVICOS ADMINISTRATIVOS LTDA	\N	54083499000177	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.853	2026-04-08 13:41:53.853	\N	\N	\N	1040	\N	\N	\N
cmnq3kdhf02bx9gtkh45em9j5	1009	JOHNSON & JOHNSON PRODUTOS PROFISSIONAIS LTDA	\N	54516661003542	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.859	2026-04-08 13:41:53.859	\N	\N	\N	1041	\N	\N	\N
cmnq3kdhm02c09gtkz5f7k22w	1010	SUKHOVERSKA LTDA	\N	54811374000116	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.867	2026-04-08 13:41:53.867	\N	\N	\N	1042	\N	\N	\N
cmnq3kdhs02c39gtklrirr5ph	1011	SCR LICITACOES COMERCIO E SERVICOS LTDA	\N	54823817000199	CNPJ	9	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29168085	RUA 6 B, 80	\N	\N	\N	SERRA	ES	(17) 9188-6095 / (0000) 0000-0000	scrlicitacoes@gmail.com	\N	1	t	2026-04-08 13:41:53.872	2026-04-08 13:41:53.872	\N	\N	\N	1043	\N	\N	\N
cmnq3kdhy02c69gtkcbsz68l0	1012	SVIT MARKETING LTDA	\N	54837674000174	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	Contábil	29066040	AV CARLOS GOMES DE SÁ - 335 - MATA DA PRAIA - EDIF CENTRO EMPRESARIAL SALA 101	\N	\N	\N	VITORIA	ES	(48) 99163-1609	s.sukhoverskaya@gmail.com	\N	1	t	2026-04-08 13:41:53.879	2026-04-08 13:41:53.879	\N	\N	\N	1044	\N	\N	\N
cmnq3kdi502c99gtk4auima1y	1013	CAROLINA HEMERLY GUERINI SERVICOS ADMINISTRATIVOS LTDA	\N	55060988000176	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.885	2026-04-08 13:41:53.885	\N	\N	\N	1045	\N	\N	\N
cmnq3kdie02cc9gtku2x06bfb	1014	IGP - CLINI COMERCIO, IMPORTACAO, EXPORTACAO E REPRESENTACOES LTDA	\N	55093694000302	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.894	2026-04-08 13:41:53.894	\N	\N	\N	1046	\N	\N	\N
cmnq3kdik02cf9gtkpvkiqiud	1015	IGP - CLINI COMERCIO, IMPORTACAO, EXPORTACAO E REPRESENTACOES LTDA	\N	55093694000493	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	19 3392-2947	marcia@opinioncontabil.com.br	\N	1	t	2026-04-08 13:41:53.9	2026-04-08 13:41:53.9	\N	\N	\N	1047	\N	\N	\N
cmnq3kdip02ci9gtk2n7dhg47	1016	GNEXUM PLATFORM LTDA	\N	55399279000110	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	29100011	635	\N	\N	\N	\N	\N	\N	willian.lovato@globalsys.com.br	\N	1	t	2026-04-08 13:41:53.905	2026-04-08 13:41:53.905	\N	\N	\N	1048	\N	\N	\N
cmnq3kdiw02cl9gtkuu9iueb6	1017	BLUE WORKS COMERCIO E SERVICOS LTDA	\N	56340389000179	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	41 8809-0933	luishpestun@gmail.com	\N	1	t	2026-04-08 13:41:53.912	2026-04-08 13:41:53.912	\N	\N	\N	1049	\N	\N	\N
cmnq3kdj102co9gtk6a9t3gfl	1018	ALCATEIA ENGENHARIA DE SISTEMAS LTDA EM RECUPERACAO JUDICIAL	\N	56525025000678	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	29161376	AV ACESSO RODOVIARIO - S/N - TERMINAL INTERMODAL DA SERRA - SALA 15 QUADRA11 MOD 01 02 E 03 QUADRA12 MOD 01 PARTE GALPAO05 06 07 08 E 09	\N	\N	\N	SERRA	ES	(11) 3226-2626	fiscal@alcateia.com.br	\N	1	t	2026-04-08 13:41:53.918	2026-04-08 13:41:53.918	\N	\N	\N	1050	\N	\N	\N
cmnq3kdj602cr9gtk8bb88mhg	1019	TRANSLUTE TRANSPORTES RODOVIÁRIOS LTDA	\N	57012098000386	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_REAL	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.923	2026-04-08 13:41:53.923	\N	\N	\N	1051	\N	\N	\N
cmnq3kdjd02cu9gtk8lqfq50z	1020	VERANEIO LOGIN ATACADO E VAREJO LTDA	\N	57062486000100	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	29111630	R ANA MEROTTO STEFANON - 30 - COBILÂNDIA - GALPAO03	\N	\N	\N	VILA VELHA	ES	(21) 2525-7373/ (0000) 0000-0000	veraneioatacadoss@gmail.com	\N	1	t	2026-04-08 13:41:53.929	2026-04-08 13:41:53.929	\N	\N	\N	1052	\N	\N	\N
cmnq3kdji02cx9gtksom5m61k	1021	HENRIQUE ROMMEL REPRESENTACAO COMERCIAL LTDA	\N	57168679000140	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	2	2024-09-05 03:00:00	\N	\N	\N	\N	\N	\N	Contábil;Fiscal	29050555	RUA TENENTE MÁRIO FRANCISCO BRITO, 420	\N	\N	\N	VITORIA	ES	(27) 9849-0568 / (0000) 0000-0000	henriquerommel@hotmail.com	\N	1	t	2026-04-08 13:41:53.935	2026-04-08 13:41:53.935	\N	\N	\N	1053	\N	\N	\N
cmnq3kdjn02d09gtks93wx68h	1022	CLOU COMERCIO DE COSMETICOS LTDA	\N	57274930000150	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.94	2026-04-08 13:41:53.94	\N	\N	\N	1054	\N	\N	\N
cmnq3kdju02d39gtk0fkhj1fi	1023	REAL FOOD ALIMENTACAO LTDA	\N	57609398000185	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	11 44227777	contabilidade@realfood.com.br	\N	1	t	2026-04-08 13:41:53.946	2026-04-08 13:41:53.946	\N	\N	\N	1055	\N	\N	\N
cmnq3kdk002d69gtkoop8bko4	1024	RADIOVAL COMERCIO DE MOVEIS LTDA	\N	57895278000191	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	6	2018-07-31 03:00:00	\N	\N	\N	\N	\N	\N	\N	15200000	AVENIDA 9 DE JULHO - 864 - CENTRO	\N	\N	\N	José Bonifácio	SP	(17) 99788-1997 ou (17) 99129-3728	vitor@radioval.com.br	\N	1	t	2026-04-08 13:41:53.952	2026-04-08 13:41:53.952	\N	\N	\N	1056	\N	\N	\N
cmnq3kdk502d99gtk1vzytd98	1025	DINPAR-DISTRIBUIDORA NACIONAL DE PARAFUSOS E PECAS LTDA	\N	58763053000144	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	1	\N	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Fiscal	02143060	R SOLDADO JOSE ANTONIO MOREIRA - 200 - JARDIM JAPAO	\N	\N	\N	SAO PAULO	SP	11.2984.6844    11.94071.6031	joseildo@dinpar.com.br rodolfo@dinpar.com.br aniltonmarinho@icloud.com	\N	1	t	2026-04-08 13:41:53.957	2026-04-08 13:41:53.957	\N	\N	\N	1057	\N	\N	\N
cmnq3kdkc02dc9gtkcjux62fc	1026	ALPHA MARKTEC MATERIAIS ELETRICOS LTDA	\N	59274316000467	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	2018-10-04 03:00:00	\N	\N	LUCRO_REAL	\N	\N	\N	\N	29163269	Rua O - 08 - São Diogo I	\N	\N	\N	Serra	ES	\N	\N	\N	1	t	2026-04-08 13:41:53.964	2026-04-08 13:41:53.964	\N	\N	\N	1058	\N	\N	\N
cmnq3kdki02df9gtkawm11aw8	1027	PRIMESYS SOLUCOES EMPRESARIAIS S.A.  (GRUPO CLARO S.A)	\N	59335976001059	CNPJ	2	AVULSO	ATIVA	GRUPO CLARO	3	2017-11-22 02:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.97	2026-04-08 13:41:53.97	\N	\N	\N	1059	\N	\N	\N
cmnq3kdkp02di9gtkvpjo93td	1028	EISA - EMPRESA INTERAGRICOLA S/A	\N	62356878004702	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	6	\N	\N	\N	\N	\N	\N	\N	\N	29164140	ROD ES-010 - S/N - JARDIM LIMOEIRO - SALA A CH 379 E 380	\N	\N	\N	SERRA	ES	(11) 3330-3900	giovana.baggio@columbiabr.com	\N	1	t	2026-04-08 13:41:53.978	2026-04-08 13:41:53.978	\N	\N	\N	1060	\N	\N	\N
cmnq3kdkv02dl9gtkpc5csrsf	1029	EATON POWER SOLUTION LTDA	\N	62532007000101	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	AV ACESSO RODOVIARIO - S/N - TIMS	\N	\N	\N	SERRA	ES	11 30488272	caique.harb@trenchrossi.com	\N	1	t	2026-04-08 13:41:53.983	2026-04-08 13:41:53.983	\N	\N	\N	1061	\N	\N	\N
cmnq3kdkz02do9gtkim88h1gl	1030	R DO VALLE INVESTIMENTOS E PARTICIPACOES LTDA	\N	63597742000166	CNPJ	1	POTENCIAL	ATIVA	EMPRESA ÚNICA	\N	2025-11-10 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:53.987	2026-04-08 13:41:53.987	\N	\N	\N	1062	\N	\N	\N
cmnq3kdla02du9gtk214r3dxi	1032	MARTFER COMERCIO DE FERRAMENTAS LTDA	\N	65640591000107	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	14095220	AV PRESIDENTE KENNEDY - 2020 - PARQUE INDUSTRIAL LAGOINHA - CONJ B	\N	\N	\N	RIBEIRAO PRETO	SP	(16) 3516-1430	adm01@martfer.com.br	\N	1	t	2026-04-08 13:41:53.998	2026-04-08 13:41:53.998	\N	\N	\N	1064	\N	\N	\N
cmnq3kdlf02dx9gtkkl4rgti2	1033	EQUANT BRASIL LTDA	\N	66624776001839	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 38864800	maria.gracas@br.gt.com	\N	1	t	2026-04-08 13:41:54.003	2026-04-08 13:41:54.003	\N	\N	\N	1065	\N	\N	\N
cmnq3kdlj02e09gtk9ae5sy9f	1034	CLARO NXT TELECOMUNICACOES S/A	\N	66970229010472	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:54.008	2026-04-08 13:41:54.008	\N	\N	\N	1066	\N	\N	\N
cmnq3kdlp02e39gtka5z4oxxl	1035	ECCO CONTABILIDADE LIMITADA - ME	\N	67178061000114	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 49905177	aline@ecco-contabilidade.com.br	\N	1	t	2026-04-08 13:41:54.014	2026-04-08 13:41:54.014	\N	\N	\N	1067	\N	\N	\N
cmnq3kdlu02e69gtkdpgy4tfu	1036	POWER-ON INFORMATICA & ENERGIA LTDA	\N	72858459000131	CNPJ	1	PARALIZADO	ATIVA	EMPRESA ÚNICA	1	2012-06-01 03:00:00	\N	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 4177-4477	central@central-rnc.com.br	\N	1	t	2026-04-08 13:41:54.018	2026-04-08 13:41:54.018	\N	\N	\N	1068	\N	\N	\N
cmnq3kdly02e99gtkb0ztmazw	1037	BOSCH REXROTH LTDA	\N	72908817000173	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	11 4414 5601	priscila.andrade@boschrexroth.com.br	\N	1	t	2026-04-08 13:41:54.023	2026-04-08 13:41:54.023	\N	\N	\N	1069	\N	\N	\N
cmnq3kdm302ec9gtk09jl2989	1038	B&T CORRETORA DE CAMBIO LTDA	\N	73622748001171	CNPJ	8	AVULSO	ATIVA	EMPRESA ÚNICA	7	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	t	2026-04-08 13:41:54.028	2026-04-08 13:41:54.028	\N	\N	\N	1070	\N	\N	\N
cmnq3kdm902ef9gtkdcxlb1hl	1039	VECTOR CONTADORES ASSOCIADOS LTDA	\N	79375382000198	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	27 36269000	comercial@vector-rnc.com.br	\N	1	t	2026-04-08 13:41:54.033	2026-04-08 13:41:54.033	\N	\N	\N	1071	\N	\N	\N
cmnq3kdmd02ei9gtkzdmgrush	1040	METALURGICA CACUPE - EIRELI	\N	79655197000157	CNPJ	7	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	2018-11-07 02:00:00	\N	\N	\N	\N	\N	\N	\N	88032000	Rodovia Virgílio Várzea - 259 - Monte Verde	\N	\N	\N	Florianópolis	SC	\N	paulo@metalcacupe.com.br	\N	1	t	2026-04-08 13:41:54.037	2026-04-08 13:41:54.037	\N	\N	\N	1072	\N	\N	\N
cmnq3kdmi02el9gtkvp07t0dm	1041	METISA METALURGICA TIMBOENSE S/A	\N	86375425000109	CNPJ	1	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	2026-01-08 03:00:00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	(11)5093-1845	mauro@metisa.com.br	\N	1	t	2026-04-08 13:41:54.042	2026-04-08 13:41:54.042	\N	\N	\N	1073	\N	\N	\N
cmnq3kdmo02eo9gtkdbp0jfjw	1042	POLIVIDROS COML. LTDA.	\N	86910353000497	CNPJ	2	POTENCIAL	ATIVA	EMPRESA ÚNICA	3	\N	\N	\N	\N	\N	\N	\N	\N	29161411	AV QUATROCENTOS - S/N - TERMINAL INTERMODAL DA SERRA - QUADRA019 LOTE M10 SALA 01	\N	\N	\N	SERRA	ES	(47) 3221-4900	leticia@polividroscomercial.com.br	\N	1	t	2026-04-08 13:41:54.048	2026-04-08 13:41:54.048	\N	\N	\N	1074	\N	\N	\N
cmnq3kdms02er9gtkx27ffqj3	1043	REFRIGERAÇÃO CAPITAL LTDA	\N	92195650000581	CNPJ	2	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Fiscal	\N	\N	\N	\N	\N	\N	\N	51 3326-2366	marcelo@rcapital.com.br	\N	1	t	2026-04-08 13:41:54.053	2026-04-08 13:41:54.053	\N	\N	\N	1075	\N	\N	\N
cmnq3kdmx02eu9gtkq8zzatqk	1044	MAZER DISTRIBUIDORA LTDA	\N	94623741000504	CNPJ	2	AVULSO	ATIVA	EMPRESA ÚNICA	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	51 21012175	carolina@mazer.com.br	\N	1	t	2026-04-08 13:41:54.057	2026-04-08 13:41:54.057	\N	\N	\N	1076	\N	\N	\N
cmnq3kdn302ex9gtk5h42ozwq	1045	AKL TECNOLOGIA E SERVICOS LTDA	AKL TECNOLOGIA E SERVICOS LTDA	64515496000119	CNPJ	A DEFINIR	MENSAL	ATIVA	\N	\N	2026-01-15 03:00:00	\N	\N	\N	\N	\N	\N	Trabalhista;Fiscal	29166700	R DAS COTOVIAS, 1345	\N	\N	\N	SERRA	ES	(27) 9235-1567/ (0000) 0000-0000	akltecnologiaeservicos@gmail.com	\N	1	t	2026-04-08 13:41:54.064	2026-04-08 13:41:54.064	\N	\N	\N	1080	\N	\N	\N
cmnq3kdn802f09gtkwmtibtwa	1046	FORTLINE COMERCIO, DISTRIBUICAO, IMPORTACAO E EXPORTACAO DE EPI LTDA	\N	13843009000530	CNPJ	A DEFINIR	MENSAL	ATIVA	\N	INDICAÇÃO DE PARCEIRO	2026-03-01 03:00:00	\N	<p>GABRIEL - indicação do Pedro Nery - GSV Contabilidade em BH</p><p><a href="https://trello.com/c/shbiulJk/9-fortline-gabriel-contador-master" rel="noopener noreferrer" target="_blank">https://trello.com/c/shbiulJk/9-fortline-gabriel-contador-master</a></p><p>FM COM E ATA -&nbsp;192.168.0.9clientes extraordinariosCOMERCIAL2025FORTLINE - GABRIEL GSV CONTABILIDADE - MASTER - FORTLINE</p><p><strong>ATA DE REUNIÃO - FORTLINE COMÉRCIO DISTRIBUIÇÃO IMPORTAÇÃO E EXPORTAÇÃO DE EPI LTDA</strong></p><p><strong>Data:</strong> 23/01/2025</p><p><strong>Local:</strong> Reunião Online</p><p><strong>Participantes:</strong></p><ul><li><strong>Cliente:</strong> Gabriel Santana Vieira (Contador e responsável pela indicação do cliente)</li><li><strong>Cliente Final:</strong> Fortline Comércio Distribuição Importação e Exportação de EPI Ltda</li><li><strong>Central Contábil:</strong> Giovana, Joséli</li></ul><p><strong>Pontos Principais Tratados:</strong></p><ol><li><strong>Objetivo da Reunião:</strong></li></ol><ul><li class="ql-indent-1">Alinhar as condições para solicitação de benefícios fiscais no Estado do Espírito Santo (ES) e definir as próximas etapas para o atendimento da empresa.</li></ul><ol><li><strong>nformações Gerais da Empresa:</strong></li></ol><ul><li class="ql-indent-3"><strong>Atividade Principal:</strong> Comércio atacadista e varejista de Equipamentos de Proteção Individual (EPI).</li><li class="ql-indent-3"><strong>CNPJ da Matriz:</strong> 13.843.009/0001-06.</li><li class="ql-indent-3"><strong>Sede Atual:</strong> Localizada em Minas Gerais, com intenção de abrir filial no Espírito Santo.</li><li class="ql-indent-3"><strong>Previsão de Faturamento Mensal:</strong> R$ 500.000,00.</li><li class="ql-indent-3"><strong>Proporção de Vendas:</strong> 90% fora do ES e 10% dentro do ES.</li><li class="ql-indent-2"><strong>Estados de Destino das Vendas:</strong> Minas Gerais, Pará, São Paulo, Rio de Janeiro, Bahia.</li></ul><ol><li><strong>Discussões Sobre Benefícios Fiscais:</strong></li></ol><ul><li>Orientado que as operações no ES devem atender às condicionantes para usufruir dos benefícios fiscais, incluindo:</li><li class="ql-indent-4">Mínimo de 05 funcionários registrados e espaço físico de 300 m² ou contrato com centro logístico devidamente regulamentado.</li><li class="ql-indent-4">Mercadorias devem estar fisicamente no ES com fiscalização ativa da SEFAZ-ES.</li><li class="ql-indent-3">Obrigatoriedade de sistema de gestão que gere SPED Fiscal, com controle de estoque e envio dos Blocos K e H.</li><li class="ql-indent-2">Caso a empresa trabalhe com operações para consumidores finais (e-commerce), será necessário constituir uma segunda filial, pois os benefícios fiscais não podem ser acumulados em um único CNPJ.</li></ul><ol><li><strong>Operações de Importação:</strong></li></ol><ul><li class="ql-indent-3">A empresa não realizará importações diretamente, mas poderá comprar produtos importados através de trading.</li><li class="ql-indent-2">As operações interestaduais para consumidores finais e PJ não contribuintes terão ICMS reduzido a 1,1385%.</li></ul><ol><li><strong>Condições Tributárias:</strong></li></ol><ul><li>Foi detalhado que as operações fora do benefício seguirão a tributação normal de débito e crédito, sendo:</li><li class="ql-indent-4">12% para mercadorias nacionais.</li><li class="ql-indent-3">4% para mercadorias importadas.</li><li class="ql-indent-2">Orientado que a empresa precisa estar atenta ao Convenio 109 e ao Decreto do ES que regulamenta operações tributadas entre matriz e filial, com prazo de 30 dias para opção tributária após constituição.</li></ul><ol><li><strong>Encaminhamentos:</strong></li></ol><ul><li class="ql-indent-3">Gabriel: Enviar minuta de alteração do contrato social para validação da Central Contábil.</li><li class="ql-indent-2">Giovana: Envio do formulário de mapeamento comercial (FM-COM) para levantamento de informações detalhadas.</li><li>Giovana: Preparação das seguintes propostas:</li><li class="ql-indent-4"><strong>Constituição de 01 filial no ES com benefício fiscal Compete Atacadista.</strong></li><li class="ql-indent-2"><strong>Serviços fiscais mensais para acompanhamento das operações.</strong></li><li><strong>Observação:</strong> Foi reforçada a importância de adequação aos requisitos legais e fiscais do Estado do ES para evitar penalidades ou perda de benefícios fiscais.</li><li><strong>Encerramento:</strong></li><li>A reunião foi finalizada com o compromisso da Central Contábil de enviar as propostas detalhadas e dar suporte em todas as etapas do processo.</li><li>Serra-ES, 24 de Janeiro de 2025.</li><li>Atenciosamente,</li><li><strong>&nbsp;Departamento de Relacionamento Corporativo</strong></li><li class="ql-indent-1">Tel.: (27) 2104-8300 I WhatsApp: (27) 99605-0879 - E-mail: contato@central-rnc.com.br</li></ul><p><br></p>	\N	\N	\N	\N	Fiscal;Legalização	29165752	NORTE SUL, 4125, GALPAO02 - SANTA LUZIA, 4125	\N	\N	\N	SERRA	ES	\N	CONTATO@GRUPOGSV.COM.BR	\N	1	t	2026-04-08 13:41:54.069	2026-04-08 13:41:54.069	\N	\N	\N	1089	\N	\N	\N
cmnq3kcgb01si9gtk0v1d6ofe	776	244 PUB LTDA - EPP	\N	27472146000196	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil;Fiscal	29055320	Rua Madeira de Freitas - 244 - Praia do Canto	\N	\N	\N	Vitória	ES	\N	custodiobarros@terra.com.br,  castro.helcias@gmail.com	\N	1	t	2026-04-08 13:41:52.524	2026-04-08 14:01:44.668	\N	2026-04-08 14:01:44.667	\N	802	\N	\N	\N
cmnq3kd9r02839gtkbqimwhli	963	3 FIT ALIMENTACAO SAUDAVEL LTDA	\N	42569379000103	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	\N	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	04679080	RUA JOAO CARLOS DE ARTUR, 76	\N	\N	\N	SAO PAULO	SP	(11) 5573-4266	contato@offycyo.com.br	\N	1	t	2026-04-08 13:41:53.583	2026-04-08 14:01:52.071	\N	2026-04-08 14:01:52.07	\N	993	\N	\N	\N
cmnq3kco001wc9gtk861q2w39	822	55 NATURAL STONE INDUSTRIA E COMERCIO LTDA	\N	30658748000147	CNPJ	1	MENSAL	ATIVA	\N	5	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Trabalhista	29168068	Rua 2 B - CIVIT II	\N	\N	\N	Serra	ES	11 973156778 Alexandre	adm@dhtools.com.br	\N	1	t	2026-04-08 13:41:52.8	2026-04-08 14:01:59.615	\N	2026-04-08 14:01:59.614	\N	852	\N	\N	\N
cmnq3kaxj00wu9gtkqyovb046	396	ABRASTONE DO BRASIL LTDA	\N	05672383000168	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	Contábil;Fiscal	29100296	Rua Arlindo Alcântara - 1841 - Centro de Vila Velha	\N	\N	\N	Vila Velha	ES	(27) 3534-6704	abrastonedobrasil@terra.com.br	\N	1	t	2026-04-08 13:41:50.551	2026-04-08 14:33:44.553	\N	2026-04-08 14:33:44.551	\N	418	\N	\N	\N
cmnq3kann00qu9gtkz0w0ctq1	324	ABSP-ASSOCIACAO BRASILEIRA DOS SERVIDORES PUBLICOS	\N	03212151000100	CNPJ	1	MENSAL	ATIVA	EMPRESA ÚNICA	1	\N	2026-01-08 03:00:00	\N	LUCRO_PRESUMIDO	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2730248282	contato@asbrasp.com.br	\N	1	t	2026-04-08 13:41:50.195	2026-04-08 14:33:44.568	\N	2026-04-08 14:33:44.567	\N	346	\N	\N	\N
cmnq3kb60011r9gtkddv1nu97	455	ACITEL TELECOMUNICACOES LTDA	\N	07717774000187	CNPJ	1	MENSAL	ATIVA	GRUPO OSI PARTICIPACOES	6	\N	2026-01-08 03:00:00	\N	SIMPLES_NACIONAL	\N	\N	\N	Contábil	29187000	r2 - S/N - PRAIA GRANDE - LOTE 13	\N	\N	\N	FUNDAO	ES	(27) 9724-4454 / (27) 3267-2452	financeiro@consultoriagsm.com.br	\N	1	t	2026-04-08 13:41:50.857	2026-04-08 14:33:44.584	\N	2026-04-08 14:33:44.582	\N	477	\N	\N	\N
cmnq3k9nv006c9gtkdwigjhm4	78	ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA	ACAI BRASIL	11318082000133	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	INTERNET	2020-01-01 03:00:00	\N	<p>O sócio Alencar Duarte é conhecido do Marcelo Munhão</p><p>O leonardo gerente financeiro da empresa ligou e pediu agendamento de visita na central</p><p>Virá com ele o consultor&nbsp;da empresa que mora em belo Horizonte&nbsp;</p><p>Dia 26/08 vieram na central os socios&nbsp;Alencar, Edvânia, o gerente Leonardo e Márcio (consultor)</p><p><br></p>	LUCRO_REAL	COMPETENCIA	\N	\N	Contábil;Fiscal;Trabalhista	29164510	RUA GILSEPPI VERDI, 349	\N	\N	\N	SERRA	ES	(27) 3281-3375	administrativo@acaibrasilmix.com.br	\N	3	t	2026-04-08 13:41:48.907	2026-04-08 18:25:48.762	\N	\N	\N	2	\N	\N	\N
cmnq3k9bk000f9gtk2ozho7g6	7	CENTRAL CONTABIL LTDA	CENTRAL SOLUCOES EMPRESARIAIS	32401481000133	CNPJ	MATRIZ	MENSAL	ATIVA	GRUPO CENTRAL CONTÁBIL	INDICAÇÃO DE COLABORADOR	1991-01-18 00:00:00	\N	<p></p>	SIMPLES_NACIONAL	CAIXA	null	null	Contábil;Fiscal;Legalização;Trabalhista	29165-130	CENTRAL	1345	PAVMTO3 3 A	PARQUE RESIDENCIAL LARANJEIRAS	SERRA	ES	(27) 2104-8300/ (27) 2104-8308	FINANCEIRO@CENTRAL-RNC.COM.BR	\N	10	t	2026-04-08 13:41:48.464	2026-04-09 16:23:37.184	STANDARD	\N	622828233	29	http://localhost:4000/api/upload/931bef95-24d5-41c8-8888-c1e60325a46f.png	CENTRAL	\N
cmnq3k9la00539gtkzuxym3f3	63	MR PARTICIPACOES LTDA	\N	29315387000157	CNPJ	1	MENSAL	ATIVA	GRUPO CENTRAL CONTÁBIL	6	2017-12-22 02:00:00	\N	\N	LUCRO_PRESUMIDO	CAIXA	\N	\N	Contábil;Fiscal;Trabalhista	29165130	AVENIDA CENTRAL, 1345	\N	\N	\N	SERRA	ES	(27) 2104-8300	financeiro@central-rnc.com.br	\N	1	t	2026-04-08 13:41:48.815	2026-04-09 18:59:07.541	\N	2026-04-09 18:59:07.516	\N	63	\N	\N	\N
cmnq3k9b500099gtk30clc154	5	ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA	ADRIA BRASIL	07799121000194	CNPJ	MATRIZ	MENSAL	ATIVA	EMPRESA ÚNICA	null	2007-09-01 00:00:00	\N	<p>Empresa Fundapiana</p>	LUCRO_REAL	COMPETENCIA	null	null	Contábil;Fiscal;Legalização;Trabalhista	29167015	TALMA RODRIGUES RIBEIRO, 5341 - ALTEROSAS	null	null	null	SERRA	ES	3218-5558	NFE@ADRIABRASIL.COM.BR	\N	9	t	2026-04-08 13:41:48.449	2026-04-09 20:53:35.968	ADVANCED	\N	null	3	http://localhost:4000/api/upload/c722a908-a018-4a38-b101-781ba29d66e2.jpg	null	\N
\.


--
-- Data for Name: empresa_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.empresa_events (id, empresa_id, user_id, type, version, changes, created_at) FROM stdin;
\.


--
-- Data for Name: empresas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.empresas (id, code, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal, tax_regime, is_active, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, email, site, logo_url, created_at, updated_at, logo_dark_url, version) FROM stdin;
cmnn7xm6e00009gqgoii3ims2	1	CENTRAL CONTABIL LTDA	CENTRAL SOLUCOES EMPRESARIAIS	32401481000133	\N	\N	SIMPLES_NACIONAL	t	29165130	CENTRAL	1345	PAVMTO3 3 A	PARQUE RESIDENCIAL LARANJEIRAS	SERRA	ES	2721048300	wagner@central-rnc.com.br	\N	http://localhost:4000/api/upload/fd1910df-2502-4a85-875b-ae36e8b7bf10.png	2026-04-06 13:20:51.59	2026-04-06 14:41:49.06	http://localhost:4000/api/upload/940531a6-809c-4a21-acb8-4995dbf1d278.png	1
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plans (id, name, description, stripe_price_id, "interval", price, features, max_users, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: saved_query; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saved_query (id, name, sql, db_type, created_at, updated_at) FROM stdin;
cmnt93i4l00049g50a38cjw73	NFE - ENTRADAS - TOTAIS	SELECT\n    COUNT(DISTINCT BDCHAVE) AS TOTAL_NOTAS_FISICAS, -- Deve retornar 28\n    COUNT(*) AS TOTAL_POR_CFOP                   -- Deve retornar 30\nFROM (\n    -- Subconsulta que reflete exatamente os filtros da sua listagem correta\n    SELECT DISTINCT\n        M.BDCHAVE,\n        I.BDCODNAT\n    FROM VEF_EMP_TMOVENT M\n    INNER JOIN VEF_EMP_TMOVENTITENS I\n        ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\n    WHERE M.BDCODEMP = 3\n      AND M.BDREFLAN = 202601\n      AND M.BDCODSITNF <> 2\n      AND CAST(I.BDCODNAT AS VARCHAR(20)) NOT LIKE '%933%'\n) AS BASE;	firebird	2026-04-10 18:40:02.948	2026-04-10 18:42:37.979
cmnt9aa6s00059g506dta4qrl	NFE - SAIDAS - LISTAGEM	SELECT DISTINCT\n    M.BDNUMDOCINI AS NUMERO_NOTA,\n    CAST(M.BDDATAEMISSAO AS DATE) AS DATA_EMISSAO,\n    CAST(M.BDDATASAIDA AS DATE) AS DATA_SAIDA,      -- Equivalente à data de entrada nas compras\n    M.BDCODTER AS PARTICIPANTE,\n    T.BDAPELIDOTER AS NOME_FANTASIA,\n    T.BDNOMETER AS NOME_PARTICIPANTE,\n    M.BDESPECIE AS ESPECIE,\n    M.BDVALORNOTA AS VALOR_NOTA,\n    I.BDCODNAT AS CFOP\nFROM VEF_EMP_TMOVSAI M\nINNER JOIN VEF_EMP_TMOVSAIITENS I\n    ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\nLEFT JOIN TTERCEIRO_REF T\n    ON T.BDCODTER = M.BDCODTER\n    AND T.BDREFEMP = (\n        -- Busca o nome vigente conforme o Manual de BI (pág. 18)\n        SELECT MAX(TR.BDREFEMP)\n        FROM TTERCEIRO_REF TR\n        WHERE TR.BDCODTER = M.BDCODTER AND TR.BDREFEMP <= M.BDREFLAN\n    )\nWHERE M.BDCODEMP = 3\n  AND M.BDREFLAN = 202601\n  AND M.BDCODSITNF <> 2 -- Exclui notas canceladas\n  AND CAST(I.BDCODNAT AS VARCHAR(20)) NOT LIKE '%933%' -- Isola produtos\nORDER BY 2, 1;	firebird	2026-04-10 18:45:19.252	2026-04-10 18:45:19.252
cmnt8x2fg00039g501mqnu36n	NFE - ENTRADAS - LISTAGEN	SELECT DISTINCT\n    M.BDNUMDOCINI AS NUMERO_NOTA,\n    CAST(M.BDDATAEMISSAO AS DATE) AS DATA_EMISSAO, -- Correção para evitar troca de dia\n    CAST(M.BDDATAENTRADAENT AS DATE) AS DATA_ENTRADA, -- Data que o SCI usa para o período\n    M.BDCODTER AS PARTICIPANTE,\n    T.BDAPELIDOTER AS NOME_FANTASIA,\n    T.BDNOMETER AS NOME_PARTICIPANTE,\n    M.BDESPECIE AS ESPECIE,\n    M.BDVALORNOTA AS VALOR_NOTA,\n    I.BDCODNAT AS CFOP\nFROM VEF_EMP_TMOVENT M\nINNER JOIN VEF_EMP_TMOVENTITENS I\n    ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\nLEFT JOIN TTERCEIRO_REF T\n    ON T.BDCODTER = M.BDCODTER\n    AND T.BDREFEMP = (\n        SELECT MAX(TR.BDREFEMP)\n        FROM TTERCEIRO_REF TR\n        WHERE TR.BDCODTER = M.BDCODTER AND TR.BDREFEMP <= M.BDREFLAN\n    )\nWHERE M.BDCODEMP = 3\n  AND M.BDREFLAN = 202601  -- Garante o alinhamento com o fechamento do SCI\n  AND M.BDCODSITNF <> 2\n  AND CAST(I.BDCODNAT AS VARCHAR(20)) NOT LIKE '%933%'\nORDER BY 2, 1; -- Ordenado por Data de Emissão e Número	firebird	2026-04-10 18:35:02.668	2026-04-10 18:45:35.38
cmnt74kr700019g500hayg3kb	NFE - SERVICOS - LISTAGEM	SELECT\n    M.BDNUMDOCINI AS NUMERO,\n    M.BDDATAEMISSAO AS DATA,\n    M.BDESPECIE,\n    M.BDVALORNOTA AS VALOR,\n    I.BDCODNAT AS CFOP_NATUREZA,\n    CASE\n        WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '1933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '2933%' THEN 'TOMADO'\n        WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '5933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '6933%' THEN 'PRESTADO'\n        ELSE 'OUTROS'\n    END AS CLASSIFICACAO\nFROM VEF_EMP_TMOVSER M\nINNER JOIN VEF_EMP_TMOVSERITENS I\n    ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\nWHERE M.BDCODEMP = 3\n  AND M.BDREFLAN = 202601\n  AND M.BDCODSITNF <> 2\n\nUNION ALL\n\n-- Parte 2: Notas Conjugadas (Tabela TMOVSAI)\nSELECT\n    M.BDNUMDOCINI,\n    M.BDDATAEMISSAO,\n    M.BDESPECIE,\n    M.BDVALORNOTA,\n    I.BDCODNAT,\n    CASE\n        WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '1933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '2933%' THEN 'TOMADO'\n        WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '5933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '6933%' THEN 'PRESTADO'\n        ELSE 'OUTROS'\n    END\nFROM VEF_EMP_TMOVSAI M\nINNER JOIN VEF_EMP_TMOVSAIITENS I\n    ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\nWHERE M.BDCODEMP = 3\n  AND M.BDREFLAN = 202601\n  AND M.BDCODSITNF <> 2\n  AND (CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '5933%'\n       OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '6933%')\n\nORDER BY 1;	firebird	2026-04-10 17:44:53.779	2026-04-10 18:46:04.43
cmnt7bu6100029g50t3b7hmcm	NFE - SERVICOS - TOTAIS	SELECT\n    CATEGORIAS.TIPO AS CLASSIFICACAO,\n    COUNT(DISTINCT DADOS.BDCHAVE) AS TOTAL_DE_NOTAS\nFROM (\n    -- Cria as duas linhas fixas no relatório\n    SELECT 'TOMADO' AS TIPO FROM RDB$DATABASE\n    UNION ALL\n    SELECT 'PRESTADO' FROM RDB$DATABASE\n) CATEGORIAS\nLEFT JOIN (\n    -- Busca Notas de Serviço (TMOVSER)\n    SELECT\n        M.BDCHAVE,\n        CASE\n            WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '1933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '2933%' THEN 'TOMADO'\n            WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '5933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '6933%' THEN 'PRESTADO'\n        END AS CLASSIF_DADO\n    FROM VEF_EMP_TMOVSER M\n    INNER JOIN VEF_EMP_TMOVSERITENS I\n        ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\n    WHERE M.BDCODEMP = 3 AND M.BDREFLAN = 202601 AND M.BDCODSITNF <> 2\n\n    UNION ALL\n\n    -- Busca Notas Conjugadas (TMOVSAI)\n    SELECT\n        M.BDCHAVE,\n        CASE\n            WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '1933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '2933%' THEN 'TOMADO'\n            WHEN CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '5933%' OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '6933%' THEN 'PRESTADO'\n        END\n    FROM VEF_EMP_TMOVSAI M\n    INNER JOIN VEF_EMP_TMOVSAIITENS I\n        ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\n    WHERE M.BDCODEMP = 3 AND M.BDREFLAN = 202601 AND M.BDCODSITNF <> 2\n      AND (CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '5933%'\n           OR CAST(I.BDCODNAT AS VARCHAR(20)) LIKE '6933%')\n) DADOS ON CATEGORIAS.TIPO = DADOS.CLASSIF_DADO\nGROUP BY CATEGORIAS.TIPO;	firebird	2026-04-10 17:50:32.569	2026-04-10 18:45:54.69
cmnt9cy5600069g50g5ienrcy	NFE - SAIDAS - TOTAIS	SELECT\n    COUNT(DISTINCT BDCHAVE) AS TOTAL_NOTAS_FISICAS,\n    COUNT(*) AS TOTAL_POR_CFOP\nFROM (\n    SELECT DISTINCT\n        M.BDCHAVE,\n        I.BDCODNAT\n    FROM VEF_EMP_TMOVSAI M\n    INNER JOIN VEF_EMP_TMOVSAIITENS I\n        ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\n    WHERE M.BDCODEMP = 3\n      AND M.BDREFLAN = 202601\n      AND M.BDCODSITNF <> 2\n      AND CAST(I.BDCODNAT AS VARCHAR(20)) NOT LIKE '%933%'\n) AS BASE;	firebird	2026-04-10 18:47:23.601	2026-04-10 18:47:23.601
cmntaeefz00009g8oau11lifl	TEMPLATE - NFE - SAIDAS - TOTAIS	SELECT\n    COUNT(DISTINCT BDCHAVE) AS TOTAL_NOTAS_FISICAS,\n    COUNT(*) AS TOTAL_POR_CFOP\nFROM (\n    SELECT DISTINCT\n        M.BDCHAVE,\n        I.BDCODNAT\n    FROM VEF_EMP_TMOVSAI M\n    INNER JOIN VEF_EMP_TMOVSAIITENS I\n        ON M.BDCODEMP = I.BDCODEMP AND M.BDCHAVE = I.BDCHAVE\n    WHERE M.BDCODEMP = {{cod_cliente}}\n      AND M.BDREFLAN BETWEEN {{dt_ini}} AND {{dt_fim}}\n      AND M.BDCODSITNF <> 2\n      AND CAST(I.BDCODNAT AS VARCHAR(20)) NOT LIKE '%933%'\n) AS BASE;	firebird	2026-04-10 19:16:31.008	2026-04-10 19:16:31.008
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (id, user_id, token, expires_at, ip_address, user_agent, created_at, updated_at) FROM stdin;
PkUMFFjhpRuXRliaOGXL4NlvaDARYbe8	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	XKjNJUjNhktENuOkS5i1umQsvEZvO3J5	2026-04-09 21:04:02.501		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-02 21:04:02.501	2026-04-02 21:04:02.501
CgfM0ydhIKpBCe2DGatyY2GAEMTPVqwA	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	mJQpBiXJouw31vOJ4bsfWpJp1r6UcwMV	2026-04-09 21:29:38.854		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-02 21:29:38.854	2026-04-02 21:29:38.854
xuKlAGODZnm8EzZtEM6kFBKNJP2a0T3q	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	ZZLRzY161SvH7ClizZcUne7MwKgdEUtH	2026-04-13 11:12:14.599		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-06 11:12:14.6	2026-04-06 11:12:14.6
XwSj3RSpThxzxA12CKUQrNswK8BfXbVV	cmnncxsay00019gcsu69uqo35	AfAmTbxWG9cBOKBRCbrMYf2QsE7j4NzD	2026-04-13 16:04:50.449		curl/8.14.1	2026-04-06 16:04:50.449	2026-04-06 16:04:50.449
6gCVhIgM8ReRkTGg8nCgaBl3mLrNNipf	cmnncxsay00019gcsu69uqo35	L7Q0g1pM2ybIbmISzgE0VsdJhEGwYUJ4	2026-04-13 16:20:41.599		curl/8.14.1	2026-04-06 16:20:41.6	2026-04-06 16:20:41.6
8eGhlkt0ipCOdpJhSTbhvPPY8jS0dDRq	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	Xb0Nb5PSNpKRoI0ansfF8m9p0GCCChsd	2026-04-13 16:21:54.318		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-06 16:21:54.318	2026-04-06 16:21:54.318
dIGUr18mvzF89Un6eL4oDxgPEj49HY6L	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	Am8EqKo7qAYyHQeLJbeZbGwdsaoqRepl	2026-04-13 17:58:10.146		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-06 17:58:10.147	2026-04-06 17:58:10.147
IeOMNBCFh5I0uyGxefjy5H0wt1IzHBVc	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	ERAt9xSHRzeKTenvjOrsnRJEeSWOrYSw	2026-04-14 11:25:02.626		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-07 11:25:02.627	2026-04-07 11:25:02.627
agjv4FyfTmxoD4NyqkHPtglu7SJvMQjD	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	LVmbl3CTAnYvB6DoI64CwBbsLrMrZYUK	2026-04-14 16:08:24.695		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-07 16:08:24.695	2026-04-07 16:08:24.695
cbIQpSkI6Czdog9iRbl8EF1OWHFmCelb	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	obSIZOnRepFLQiUBdZUbSnQIThaMNsNG	2026-04-14 16:28:29.091		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-07 16:28:29.092	2026-04-07 16:28:29.092
5fXo7xCVi4vaCmHMmN1J0o4x7bp1HI5j	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	EYxJvmikQc05Fy6dDdk2REDzpqTH3Va9	2026-04-14 21:20:07.232		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-07 21:20:07.233	2026-04-07 21:20:07.233
KeYF06fDbT3vD0HY7rWDigvoxhXdfVay	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	ho8HJpYxRrV4l2Kcc8qMODCvGsjjYWva	2026-04-15 11:25:09.161		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.2.234 Chrome/144.0.7559.236 Electron/40.8.5 Safari/537.36 MSIX	2026-04-08 11:25:09.162	2026-04-08 11:25:09.162
0Yw1lJu2YMyipogmYWrKjgk6OelBysnE	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	rhu086wCerQURH1RYyVQLa3DurTO4F5r	2026-04-15 17:10:38.117		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-08 17:10:38.118	2026-04-08 17:10:38.118
jyPGR6h3GA8EN22lZU49FkWipOSajZ1W	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	OOHe9KhKxyK2myqRKPkVVOaZLzuzUxR4	2026-04-15 20:32:41.167		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-08 20:32:41.168	2026-04-08 20:32:41.168
xyHlXu5LdasJUBKSTR2N1MuWII4DoNWr	WpNpMLBUja8nt6tSHEQvToepffsHTGZS	kzdQiri0J4qm739CfDrrGR4evzr2zlbh	2026-04-18 19:11:09.609		Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-04-09 18:58:42.722	2026-04-11 19:11:09.609
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscriptions (id, tenant_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_config (id, key, value, label, "group", encrypted, updated_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenants (id, name, slug, schema, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_permissions (id, user_id, module_slug, can_read, can_write, can_delete, created_at, sub_permissions) FROM stdin;
cmnndlev100009gdox4du8p29	cmnncxsay00019gcsu69uqo35	clientes	t	f	f	2026-04-06 15:59:19.934	{}
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, name, email_verified, image, role, tenant_id, created_at, updated_at, empresa_id, is_active, is_master, area_id, cargo_id, data_admissao, id_oneclick, incluir_ferias, profile, salario, telefone, is_empresa_master) FROM stdin;
cmnncxsay00019gcsu69uqo35	wagner_guerra@hotmail.com	Wagner Teste	f	\N	COLABORADOR_INTERNO	\N	2026-04-06 15:40:57.61	2026-04-06 15:59:19.843	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N	\N	t	OPERADOR	\N	\N	f
WpNpMLBUja8nt6tSHEQvToepffsHTGZS	wagner.guerra@gmail.com	Wagner Guerra	f	\N	COLABORADOR_INTERNO	\N	2026-04-02 20:44:05.292	2026-04-06 16:21:48.611	\N	t	t	\N	\N	\N	\N	t	OPERADOR	\N	\N	f
cmnornfya00059gu4abz3khft	andrea@central-rnc.com.br	Andreia Salles	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:35.458	2026-04-07 15:31:23.493	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsyjt000d9gmw0wx44kkv	2024-03-01 00:00:00	221	t	OPERADOR	3614.00	\N	f
cmnornj45003h9gu4lf2zdamr	ronaldo@central-rnc.com.br	Ronaldo Belloti	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.557	2026-04-07 15:20:39.557	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8f5000x9g2wuyt5sybw	\N	2024-07-01 00:00:00	48	t	OPERADOR	2520.00		f
cmnornfun00019gu40z1r7nlx	aline@central-rnc.com.br	Aline Lemes	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:35.327	2026-04-07 15:31:03.177	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8fi00179g2w5ahz45bf	cmnojsyjj00099gmwug29h9u3	2025-01-20 00:00:00	257	t	OPERADOR	3932.00	2721048300	f
cmnornj7r003l9gu4s596tc12	rose@central-rnc.com.br	Rose Munhão	f	\N	DIRETOR	\N	2026-04-07 15:20:39.688	2026-04-07 15:20:39.688	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
cmnornjb7003p9gu4rre7lgpd	rosimeri@central-rnc.com.br	Rosimeri Victor	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.811	2026-04-07 15:20:39.811	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyll00179gmwgmrxy4ev	2025-07-14 00:00:00	264	t	OPERADOR	5000.00		f
cmnornjej003t9gu4x2vujbi6	ruth@central-rnc.com.br	Ruth Amparo	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.931	2026-04-07 15:20:39.931	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8ev000p9g2wqtt03g9r	cmnojsykd000n9gmwfqr6azdr	2025-06-02 00:00:00		t	OPERADOR	1579.00		f
cmnorng1k00099gu4xmtdhqz2	arthur@central-rnc.com.br	Arthur Vieira	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:35.576	2026-04-07 15:20:35.576	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsykc000m9gmwfud3j5gc	2025-09-08 00:00:00	297	t	OPERADOR	2655.00		f
cmnorng55000d9gu4a5b07fbq	bruno@central-rnc.com.br	Bruno Borges	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:35.706	2026-04-07 15:20:35.706	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8ff00159g2w5pcdajhu	cmnojsyjn000a9gmw4u13cubb	2022-06-27 00:00:00	200	t	OPERADOR	2242.00		f
cmnorng9f000h9gu49q8b6m5h	elisangela@central-rnc.com.br	Elisangela Santana	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:35.859	2026-04-07 15:20:35.859	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8e900079g2wc7kqp3in	cmnojsyk2000h9gmw9z0vyccp	2024-07-01 00:00:00	180	t	OPERADOR	2974.00		f
cmnornge0000l9gu44m7lvl10	enoque@central-rnc.com.br	Enoque do Carmo	f	\N	GESTOR	\N	2026-04-07 15:20:36.025	2026-04-07 15:20:36.025	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8fi00179g2w5ahz45bf	cmnojsylo00199gmwbyojm180	2003-02-12 00:00:00	23	t	OPERADOR	6065.00		f
cmnornghn000p9gu4l732j4zm	erica.nogueira@central-rnc.com.br	Erica Nögueira	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:36.155	2026-04-07 15:20:36.155	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8er000n9g2w30ux0p45	cmnojsyln00189gmw5ie4dygj	2024-02-19 00:00:00	228	t	OPERADOR	3672.00		f
cmnornglf000t9gu47s6vlg5p	fabiana@central-rnc.com.br	Fabiana Alves	f	\N	COORDENADOR	\N	2026-04-07 15:20:36.291	2026-04-07 15:20:36.291	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	2019-07-01 00:00:00	24	t	OPERADOR	\N		f
cmnorngow000x9gu42enrv8us	gabriel@central-rnc.com.br	Gabriel Scardini	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:36.416	2026-04-07 15:20:36.416	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8fi00179g2w5ahz45bf	cmnojsyka000l9gmw51v7a3b8	2025-05-22 00:00:00		t	OPERADOR	2242.00		f
cmnorngsm00119gu4sxqjy3e8	gilciane@central-rnc.com.br	Gilciane Lecchi	f	\N	GESTOR	\N	2026-04-07 15:20:36.55	2026-04-07 15:20:36.55	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	2014-01-22 00:00:00	27	t	OPERADOR	\N		f
cmnorngw400159gu44dv1z5i0	gilvana@central-rnc.com.br	Gilvana Soares	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:36.676	2026-04-07 15:20:36.676	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyj700039gmwq0juyz2n	2024-01-02 00:00:00	176	t	OPERADOR	3932.00		f
cmnornh0000199gu4yck4vfa3	giovana@central-rnc.com.br	Giovana Castiglioni	f	\N	DIRETOR	\N	2026-04-07 15:20:36.817	2026-04-07 15:20:36.817	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	2014-04-01 00:00:00	4	t	OPERADOR	\N		f
cmnornh48001d9gu4jpqraj2r	gustavo@central-rnc.com.br	Gustavo Viana	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:36.968	2026-04-07 15:20:36.968	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsyjt000d9gmw0wx44kkv	2024-04-15 00:00:00	235	t	OPERADOR	3614.00		f
cmnornhav001h9gu40wevliy8	hilary@central-rnc.com.br	Hilary Yasmin	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:37.207	2026-04-07 15:20:37.207	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8fi00179g2w5ahz45bf	cmnojsyko000r9gmwa84jzhp0	2024-10-07 00:00:00	252	t	OPERADOR	1600.00		f
cmnornhg5001l9gu4q1mj21er	ingrid@central-rnc.com.br	Ingrid Rocha	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:37.397	2026-04-07 15:20:37.397	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8fi00179g2w5ahz45bf	cmnojsyjg00089gmwue63wxpr	2025-01-01 00:00:00	258	t	OPERADOR	3212.00		f
cmnornhjz001p9gu4qwrkce7n	isadora@central-rnc.com.br	Isadora Calmon	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:37.535	2026-04-07 15:20:37.535	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
cmnornhnf001t9gu4vubzwwj2	ivanessa@central-rnc.com.br	Ivanessa Souza	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:37.659	2026-04-07 15:20:37.659	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8er000n9g2w30ux0p45	cmnojsyk9000k9gmwg7qwao22	2025-11-03 00:00:00	300	t	OPERADOR	2655.00		f
cmnornhr3001x9gu4ovql0aao	ivone@central-rnc.com.br	Ivone Torrente	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:37.791	2026-04-07 15:20:37.791	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyj000019gmwu0zw2xkg	2022-05-03 00:00:00	194	t	OPERADOR	3025.00		f
cmnornhut00219gu4gukmozxg	joao.victor@central-rnc.com.br	João Victor Carvalho	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:37.925	2026-04-07 15:20:37.925	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsykc000m9gmwfud3j5gc	2025-10-20 00:00:00	299	t	OPERADOR	2655.00		f
cmnornhyd00259gu4ad3db405	joao@central-rnc.com.br	João Vitor Castiglioni	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:38.054	2026-04-07 15:20:38.054	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
cmnorni1u00299gu4xrn89mgl	joseli@central-rnc.com.br	Joseli Feitoza	f	\N	GESTOR	\N	2026-04-07 15:20:38.179	2026-04-07 15:20:38.179	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	2024-01-08 00:00:00	225	t	OPERADOR	\N		f
cmnorni5c002d9gu4cyzf20d0	juliana.ferreira@central-rnc.com.br	Juliana Ferreira	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:38.304	2026-04-07 15:20:38.304	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyj400029gmwczy3ll7r	2025-06-02 00:00:00	220	t	OPERADOR	3025.00		f
cmnorni8t002h9gu4726q80sd	leonardo@central-rnc.com.br	Leonardo Ramos	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:38.429	2026-04-07 15:20:38.429	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyj000019gmwu0zw2xkg	2024-03-20 00:00:00	234	t	OPERADOR	3025.00		f
cmnornic6002l9gu4z94vys1i	liliane@central-rnc.com.br	Liliane Moreira	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:38.551	2026-04-07 15:20:38.551	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyj700039gmwq0juyz2n	2024-07-22 00:00:00	250	t	OPERADOR	3932.00		f
cmnornifg002p9gu4lvo9sv4u	lucimara@central-rnc.com.br	Lucimara Moreira	f	\N	GESTOR	\N	2026-04-07 15:20:38.669	2026-04-07 15:20:38.669	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
cmnorniiu002t9gu43ttoinen	ludmilla@central-rnc.com.br	Ludmilla Teodoro	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:38.79	2026-04-07 15:20:38.79	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyj400029gmwczy3ll7r	2017-07-19 00:00:00	116	t	OPERADOR	3932.00		f
cmnornim9002x9gu4ow9lmtak	marcelo@central-rnc.com.br	Marcelo Munhão	f	\N	DIRETOR	\N	2026-04-07 15:20:38.913	2026-04-07 15:20:38.913	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
cmnornipp00319gu4wrs0fk8a	maria.helena@central-rnc.com.br	Maria Helena	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.037	2026-04-07 15:20:39.037	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsyjs000c9gmw15i3n7s8	2023-05-10 00:00:00	217	t	OPERADOR	3025.00		f
cmnornitj00359gu4wl51g7hb	mayrce@central-rnc.com.br	Mayrce Viana	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.175	2026-04-07 15:20:39.175	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsyjv000e9gmwymewq8ne	2021-07-01 00:00:00	128	t	OPERADOR	3614.00		f
cmnornix200399gu4uwgqpok2	operador.teste@local	Operador Teste	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.302	2026-04-07 15:20:39.302	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
cmnornj0n003d9gu4zrh1cjdt	priscilapuppin@central-rnc.com.br	Priscila Puppin	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:39.431	2026-04-07 15:20:39.431	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eo000j9g2wx0l230oz	cmnojsyjw000f9gmw09msn16x	2021-09-01 00:00:00	181	t	OPERADOR	4515.00		f
cmnornji3003x9gu4kog9tvgj	thais@central-rnc.com.br	Thais Medeiros	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:40.059	2026-04-07 15:20:40.059	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8eb00099g2w8d9yi0v3	cmnojsyk7000j9gmwzzq3t2mv	2025-08-18 00:00:00	294	t	OPERADOR	2655.00		f
cmnornjzr004f9gu4dtpqpeyl	wagnerguerra@gmail.com	Wagner Teste	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:40.695	2026-04-07 15:20:40.695	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8ff00159g2w5pcdajhu	cmnojsyku000v9gmw4d4jl1ee	\N		f	OPERADOR	\N		f
cmnornjlg00419gu465rgnqb1	thayza@central-rnc.com.br	Thayza Lima	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:40.18	2026-04-07 15:20:40.18	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8e900079g2wc7kqp3in	cmnojsyki000p9gmwu1qy0ydo	2025-02-01 00:00:00	260	t	OPERADOR	3025.00		f
cmnornjp100459gu4mv6tkyhw	vaneza@central-rnc.com.br	Vaneza Gomes	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:40.309	2026-04-07 15:20:40.309	cmnn7xm6e00009gqgoii3ims2	t	f	cmnoig8fi00179g2w5ahz45bf	cmnojsyjj00099gmwug29h9u3	2024-08-01 00:00:00	55	t	OPERADOR	3932.00		f
cmnornjsh00499gu4jxtjxp4y	visualizador.teste@local	Visualizador Teste	f	\N	COLABORADOR_INTERNO	\N	2026-04-07 15:20:40.433	2026-04-07 15:20:40.433	cmnn7xm6e00009gqgoii3ims2	t	f	\N	\N	\N		f	OPERADOR	\N		f
\.


--
-- Data for Name: verifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.verifications (id, identifier, value, expires_at, created_at, updated_at) FROM stdin;
OrLTf9yyQ9Z8N6CONPzQkYAtWaobHuPg	reset-password:jV30SrCWaUKjVBawKZYidSTI	cmnncxsay00019gcsu69uqo35	2026-04-06 17:03:50.035	2026-04-06 16:03:50.036	2026-04-06 16:03:50.036
o1ZfqtqIPM0CUaATuiYJ30i1dhlAp2gY	reset-password:4iDnHjwCrJ7krPNzjlXPFYer	cmnncxsay00019gcsu69uqo35	2026-04-06 17:04:05.412	2026-04-06 16:04:05.413	2026-04-06 16:04:05.413
\.


--
-- Name: areas_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.areas_code_seq', 22, true);


--
-- Name: cargos_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargos_code_seq', 47, true);


--
-- Name: clientes_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.clientes_code_seq', 1046, true);


--
-- Name: empresas_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.empresas_code_seq', 1, true);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: api_logs api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_pkey PRIMARY KEY (id);


--
-- Name: api_pricing api_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_pricing
    ADD CONSTRAINT api_pricing_pkey PRIMARY KEY (id);


--
-- Name: areas areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);


--
-- Name: cargo_events cargo_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_events
    ADD CONSTRAINT cargo_events_pkey PRIMARY KEY (id);


--
-- Name: cargos cargos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT cargos_pkey PRIMARY KEY (id);


--
-- Name: cliente_arquivos cliente_arquivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_arquivos
    ADD CONSTRAINT cliente_arquivos_pkey PRIMARY KEY (id);


--
-- Name: cliente_contatos cliente_contatos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contatos
    ADD CONSTRAINT cliente_contatos_pkey PRIMARY KEY (id);


--
-- Name: cliente_contrato_params cliente_contrato_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contrato_params
    ADD CONSTRAINT cliente_contrato_params_pkey PRIMARY KEY (id);


--
-- Name: cliente_erp_snapshots cliente_erp_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_erp_snapshots
    ADD CONSTRAINT cliente_erp_snapshots_pkey PRIMARY KEY (id);


--
-- Name: cliente_events cliente_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_events
    ADD CONSTRAINT cliente_events_pkey PRIMARY KEY (id);


--
-- Name: cliente_historicos cliente_historicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_historicos
    ADD CONSTRAINT cliente_historicos_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: empresa_events empresa_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_events
    ADD CONSTRAINT empresa_events_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: saved_query saved_query_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_query
    ADD CONSTRAINT saved_query_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- Name: api_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_logs_created_at_idx ON public.api_logs USING btree (created_at);


--
-- Name: api_logs_source_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_logs_source_created_at_idx ON public.api_logs USING btree (source, created_at);


--
-- Name: api_pricing_source_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_pricing_source_key ON public.api_pricing USING btree (source);


--
-- Name: cliente_contrato_params_cliente_id_empresa_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cliente_contrato_params_cliente_id_empresa_id_key ON public.cliente_contrato_params USING btree (cliente_id, empresa_id);


--
-- Name: cliente_erp_snapshots_cliente_id_empresa_id_mes_indicador_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cliente_erp_snapshots_cliente_id_empresa_id_mes_indicador_key ON public.cliente_erp_snapshots USING btree (cliente_id, empresa_id, mes, indicador);


--
-- Name: cliente_erp_snapshots_cliente_id_mes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cliente_erp_snapshots_cliente_id_mes_idx ON public.cliente_erp_snapshots USING btree (cliente_id, mes);


--
-- Name: empresas_cnpj_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX empresas_cnpj_key ON public.empresas USING btree (cnpj);


--
-- Name: plans_stripe_price_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_stripe_price_id_key ON public.plans USING btree (stripe_price_id);


--
-- Name: sessions_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token);


--
-- Name: subscriptions_stripe_subscription_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key ON public.subscriptions USING btree (stripe_subscription_id);


--
-- Name: system_config_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_config_key_key ON public.system_config USING btree (key);


--
-- Name: tenants_schema_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_schema_key ON public.tenants USING btree (schema);


--
-- Name: tenants_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_slug_key ON public.tenants USING btree (slug);


--
-- Name: user_permissions_user_id_module_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_permissions_user_id_module_slug_key ON public.user_permissions USING btree (user_id, module_slug);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: accounts accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: areas areas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: areas areas_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: areas areas_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.areas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cargo_events cargo_events_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_events
    ADD CONSTRAINT cargo_events_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cargo_events cargo_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_events
    ADD CONSTRAINT cargo_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cargos cargos_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT cargos_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cargos cargos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargos
    ADD CONSTRAINT cargos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cliente_arquivos cliente_arquivos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_arquivos
    ADD CONSTRAINT cliente_arquivos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cliente_arquivos cliente_arquivos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_arquivos
    ADD CONSTRAINT cliente_arquivos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cliente_contatos cliente_contatos_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contatos
    ADD CONSTRAINT cliente_contatos_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cliente_contatos cliente_contatos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contatos
    ADD CONSTRAINT cliente_contatos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cliente_contrato_params cliente_contrato_params_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contrato_params
    ADD CONSTRAINT cliente_contrato_params_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cliente_erp_snapshots cliente_erp_snapshots_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_erp_snapshots
    ADD CONSTRAINT cliente_erp_snapshots_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cliente_events cliente_events_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_events
    ADD CONSTRAINT cliente_events_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cliente_events cliente_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_events
    ADD CONSTRAINT cliente_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cliente_historicos cliente_historicos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_historicos
    ADD CONSTRAINT cliente_historicos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cliente_historicos cliente_historicos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_historicos
    ADD CONSTRAINT cliente_historicos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: clientes clientes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: empresa_events empresa_events_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_events
    ADD CONSTRAINT empresa_events_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: empresa_events empresa_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_events
    ADD CONSTRAINT empresa_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users users_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict ERSJ2HuAyzIhkbHiWi1bh0ZY1sXwrfLoKuOaeV6fWPCaScuf1UybxbuKjBxIdFi

