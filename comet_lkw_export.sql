--
-- PostgreSQL database dump
--

\restrict aOdNb0uM4pQ9KGbrFIsuWmPgQ8Qgr7flz5ZZ8xp1aobOmr9adWYOMSf5iTgmXZn

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    user_id integer,
    module text NOT NULL,
    record_id integer NOT NULL,
    field text,
    old_value text,
    new_value text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: lkw_austraege; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lkw_austraege (
    id integer NOT NULL,
    shipment_id integer,
    ladelistennummer text,
    palettenscheinnummer text,
    datum date NOT NULL,
    kennzeichen text,
    beauftragte_spedition_id integer,
    sub_spedition text,
    von_comet_europaletten integer DEFAULT 0 NOT NULL,
    von_comet_ladungssicherung integer DEFAULT 0 NOT NULL,
    von_defekte_paletten integer DEFAULT 0 NOT NULL,
    an_comet_europaletten integer DEFAULT 0 NOT NULL,
    an_comet_ladungssicherung integer DEFAULT 0 NOT NULL,
    an_defekte_paletten integer DEFAULT 0 NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tor text
);


--
-- Name: lkw_austraege_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lkw_austraege_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lkw_austraege_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lkw_austraege_id_seq OWNED BY public.lkw_austraege.id;


--
-- Name: pallet_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pallet_movements (
    id integer NOT NULL,
    spedition_id integer NOT NULL,
    shipment_id integer,
    movement_type text NOT NULL,
    movement_date date NOT NULL,
    amount integer NOT NULL,
    bemerkungen text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    palettenscheinnummer text,
    von_comet_europaletten integer DEFAULT 0,
    von_comet_ladungssicherung integer DEFAULT 0,
    von_defekte_paletten integer DEFAULT 0,
    an_comet_europaletten integer DEFAULT 0,
    an_comet_ladungssicherung integer DEFAULT 0,
    an_defekte_paletten integer DEFAULT 0
);


--
-- Name: pallet_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pallet_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pallet_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pallet_movements_id_seq OWNED BY public.pallet_movements.id;


--
-- Name: pallet_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pallet_reconciliations (
    id integer NOT NULL,
    spedition_id integer NOT NULL,
    date_from date NOT NULL,
    date_to date NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    comet_balance integer,
    spedition_balance integer,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pallet_reconciliations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pallet_reconciliations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pallet_reconciliations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pallet_reconciliations_id_seq OWNED BY public.pallet_reconciliations.id;


--
-- Name: reconciliation_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_comments (
    id integer NOT NULL,
    reconciliation_id integer NOT NULL,
    user_id integer NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reconciliation_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reconciliation_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reconciliation_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reconciliation_comments_id_seq OWNED BY public.reconciliation_comments.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id integer NOT NULL,
    role text NOT NULL,
    permission text NOT NULL,
    allowed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    role_key text NOT NULL,
    label text NOT NULL,
    role_group text DEFAULT 'Sonstiges'::text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipments (
    id integer NOT NULL,
    bezeichnung text,
    kennzeichen text,
    relation text,
    spedition_id integer,
    sub_spedition_id integer,
    bemerkungen text,
    telefon text,
    eta_date date,
    eta_time text,
    ata_date date,
    ata_time text,
    lkw_art text,
    status text DEFAULT 'Angemeldet'::text NOT NULL,
    tor text,
    comet_bearbeitet boolean DEFAULT false NOT NULL,
    gesperrt_fuer_spedition boolean DEFAULT false NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ware_status text DEFAULT 'nicht bereit'::text
);


--
-- Name: shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shipments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shipments_id_seq OWNED BY public.shipments.id;


--
-- Name: spedition_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spedition_contacts (
    id integer NOT NULL,
    spedition_id integer NOT NULL,
    name text NOT NULL,
    bereich text,
    telefon text,
    email text,
    bemerkungen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spedition_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spedition_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spedition_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spedition_contacts_id_seq OWNED BY public.spedition_contacts.id;


--
-- Name: spedition_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spedition_permissions (
    id integer NOT NULL,
    granting_spedition_id integer NOT NULL,
    receiving_spedition_id integer NOT NULL,
    permission_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: spedition_permissions_granting_spedition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spedition_permissions_granting_spedition_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spedition_permissions_granting_spedition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spedition_permissions_granting_spedition_id_seq OWNED BY public.spedition_permissions.granting_spedition_id;


--
-- Name: spedition_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spedition_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spedition_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spedition_permissions_id_seq OWNED BY public.spedition_permissions.id;


--
-- Name: spedition_permissions_receiving_spedition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spedition_permissions_receiving_spedition_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spedition_permissions_receiving_spedition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spedition_permissions_receiving_spedition_id_seq OWNED BY public.spedition_permissions.receiving_spedition_id;


--
-- Name: speditionen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speditionen (
    id integer NOT NULL,
    name text NOT NULL,
    kuerzel text NOT NULL,
    ansprechpartner text,
    email text,
    telefon text,
    status text DEFAULT 'aktiv'::text NOT NULL,
    bemerkungen text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: speditionen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.speditionen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: speditionen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.speditionen_id_seq OWNED BY public.speditionen.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    spedition_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: lkw_austraege id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lkw_austraege ALTER COLUMN id SET DEFAULT nextval('public.lkw_austraege_id_seq'::regclass);


--
-- Name: pallet_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_movements ALTER COLUMN id SET DEFAULT nextval('public.pallet_movements_id_seq'::regclass);


--
-- Name: pallet_reconciliations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_reconciliations ALTER COLUMN id SET DEFAULT nextval('public.pallet_reconciliations_id_seq'::regclass);


--
-- Name: reconciliation_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_comments ALTER COLUMN id SET DEFAULT nextval('public.reconciliation_comments_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments ALTER COLUMN id SET DEFAULT nextval('public.shipments_id_seq'::regclass);


--
-- Name: spedition_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_contacts ALTER COLUMN id SET DEFAULT nextval('public.spedition_contacts_id_seq'::regclass);


--
-- Name: spedition_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_permissions ALTER COLUMN id SET DEFAULT nextval('public.spedition_permissions_id_seq'::regclass);


--
-- Name: spedition_permissions granting_spedition_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_permissions ALTER COLUMN granting_spedition_id SET DEFAULT nextval('public.spedition_permissions_granting_spedition_id_seq'::regclass);


--
-- Name: spedition_permissions receiving_spedition_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_permissions ALTER COLUMN receiving_spedition_id SET DEFAULT nextval('public.spedition_permissions_receiving_spedition_id_seq'::regclass);


--
-- Name: speditionen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speditionen ALTER COLUMN id SET DEFAULT nextval('public.speditionen_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, user_id, module, record_id, field, old_value, new_value, changed_at) FROM stdin;
\.


--
-- Data for Name: lkw_austraege; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lkw_austraege (id, shipment_id, ladelistennummer, palettenscheinnummer, datum, kennzeichen, beauftragte_spedition_id, sub_spedition, von_comet_europaletten, von_comet_ladungssicherung, von_defekte_paletten, an_comet_europaletten, an_comet_ladungssicherung, an_defekte_paletten, created_by, created_at, tor) FROM stdin;
\.


--
-- Data for Name: pallet_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pallet_movements (id, spedition_id, shipment_id, movement_type, movement_date, amount, bemerkungen, created_by, created_at, palettenscheinnummer, von_comet_europaletten, von_comet_ladungssicherung, von_defekte_paletten, an_comet_europaletten, an_comet_ladungssicherung, an_defekte_paletten) FROM stdin;
\.


--
-- Data for Name: pallet_reconciliations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pallet_reconciliations (id, spedition_id, date_from, date_to, status, comet_balance, spedition_balance, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: reconciliation_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reconciliation_comments (id, reconciliation_id, user_id, comment, created_at) FROM stdin;
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_permissions (id, role, permission, allowed, updated_at) FROM stdin;
1	comet_leitstand	pallet.create	t	2026-06-15 21:44:00.052516+00
2	comet_leitstand	pallet.edit	t	2026-06-15 21:44:00.052516+00
3	comet_leitstand	pallet.delete	t	2026-06-15 21:44:00.052516+00
4	comet_leitstand	shipment.create	t	2026-06-15 21:44:00.052516+00
5	comet_leitstand	shipment.edit	t	2026-06-15 21:44:00.052516+00
6	comet_leitstand	shipment.delete	t	2026-06-15 21:44:00.052516+00
7	comet_leitstand	shipment.lock	t	2026-06-15 21:44:00.052516+00
8	comet_leitstand	austrag.create	t	2026-06-15 21:44:00.052516+00
9	comet_leitstand	austrag.delete	t	2026-06-15 21:44:00.052516+00
10	comet_leitstand	reconciliation.create	t	2026-06-15 21:44:00.052516+00
11	comet_leitstand	reconciliation.sign	t	2026-06-15 21:44:00.052516+00
12	comet_lager	pallet.create	f	2026-06-15 21:44:00.052516+00
13	comet_lager	pallet.edit	f	2026-06-15 21:44:00.052516+00
14	comet_lager	pallet.delete	f	2026-06-15 21:44:00.052516+00
15	comet_lager	shipment.create	t	2026-06-15 21:44:00.052516+00
16	comet_lager	shipment.edit	t	2026-06-15 21:44:00.052516+00
18	comet_lager	shipment.lock	f	2026-06-15 21:44:00.052516+00
19	comet_lager	austrag.create	f	2026-06-15 21:44:00.052516+00
20	comet_lager	austrag.delete	f	2026-06-15 21:44:00.052516+00
21	comet_lager	reconciliation.create	f	2026-06-15 21:44:00.052516+00
22	comet_lager	reconciliation.sign	f	2026-06-15 21:44:00.052516+00
23	comet_viewer	pallet.create	f	2026-06-15 21:44:00.052516+00
24	comet_viewer	pallet.edit	f	2026-06-15 21:44:00.052516+00
25	comet_viewer	pallet.delete	f	2026-06-15 21:44:00.052516+00
26	comet_viewer	shipment.create	f	2026-06-15 21:44:00.052516+00
27	comet_viewer	shipment.edit	f	2026-06-15 21:44:00.052516+00
28	comet_viewer	shipment.delete	f	2026-06-15 21:44:00.052516+00
29	comet_viewer	shipment.lock	f	2026-06-15 21:44:00.052516+00
30	comet_viewer	austrag.create	f	2026-06-15 21:44:00.052516+00
31	comet_viewer	austrag.delete	f	2026-06-15 21:44:00.052516+00
32	comet_viewer	reconciliation.create	f	2026-06-15 21:44:00.052516+00
33	comet_viewer	reconciliation.sign	f	2026-06-15 21:44:00.052516+00
34	speditions_admin	pallet.create	f	2026-06-15 21:44:00.052516+00
35	speditions_admin	pallet.edit	f	2026-06-15 21:44:00.052516+00
36	speditions_admin	pallet.delete	f	2026-06-15 21:44:00.052516+00
37	speditions_admin	shipment.create	t	2026-06-15 21:44:00.052516+00
38	speditions_admin	shipment.edit	t	2026-06-15 21:44:00.052516+00
39	speditions_admin	shipment.delete	f	2026-06-15 21:44:00.052516+00
40	speditions_admin	shipment.lock	f	2026-06-15 21:44:00.052516+00
41	speditions_admin	austrag.create	f	2026-06-15 21:44:00.052516+00
42	speditions_admin	austrag.delete	f	2026-06-15 21:44:00.052516+00
43	speditions_admin	reconciliation.create	f	2026-06-15 21:44:00.052516+00
44	speditions_admin	reconciliation.sign	t	2026-06-15 21:44:00.052516+00
45	speditions_bearbeiter	pallet.create	f	2026-06-15 21:44:00.052516+00
46	speditions_bearbeiter	pallet.edit	f	2026-06-15 21:44:00.052516+00
47	speditions_bearbeiter	pallet.delete	f	2026-06-15 21:44:00.052516+00
48	speditions_bearbeiter	shipment.create	t	2026-06-15 21:44:00.052516+00
49	speditions_bearbeiter	shipment.edit	t	2026-06-15 21:44:00.052516+00
50	speditions_bearbeiter	shipment.delete	f	2026-06-15 21:44:00.052516+00
51	speditions_bearbeiter	shipment.lock	f	2026-06-15 21:44:00.052516+00
52	speditions_bearbeiter	austrag.create	f	2026-06-15 21:44:00.052516+00
53	speditions_bearbeiter	austrag.delete	f	2026-06-15 21:44:00.052516+00
54	speditions_bearbeiter	reconciliation.create	f	2026-06-15 21:44:00.052516+00
55	speditions_bearbeiter	reconciliation.sign	f	2026-06-15 21:44:00.052516+00
56	speditions_viewer	pallet.create	f	2026-06-15 21:44:00.052516+00
57	speditions_viewer	pallet.edit	f	2026-06-15 21:44:00.052516+00
58	speditions_viewer	pallet.delete	f	2026-06-15 21:44:00.052516+00
59	speditions_viewer	shipment.create	f	2026-06-15 21:44:00.052516+00
60	speditions_viewer	shipment.edit	f	2026-06-15 21:44:00.052516+00
61	speditions_viewer	shipment.delete	f	2026-06-15 21:44:00.052516+00
62	speditions_viewer	shipment.lock	f	2026-06-15 21:44:00.052516+00
63	speditions_viewer	austrag.create	f	2026-06-15 21:44:00.052516+00
64	speditions_viewer	austrag.delete	f	2026-06-15 21:44:00.052516+00
65	speditions_viewer	reconciliation.create	f	2026-06-15 21:44:00.052516+00
66	speditions_viewer	reconciliation.sign	f	2026-06-15 21:44:00.052516+00
161	comet_leitstand	spedition.create	t	2026-06-16 06:12:57.4576+00
17	comet_lager	shipment.delete	f	2026-06-15 21:48:37.133245+00
69	comet_leitstand	shipment.reschedule	t	2026-06-15 21:59:08.68457+00
70	comet_lager	shipment.reschedule	f	2026-06-15 21:59:08.68457+00
71	comet_viewer	shipment.reschedule	f	2026-06-15 21:59:08.68457+00
72	speditions_admin	shipment.reschedule	f	2026-06-15 21:59:08.68457+00
74	speditions_viewer	shipment.reschedule	f	2026-06-15 21:59:08.68457+00
73	speditions_bearbeiter	shipment.reschedule	t	2026-06-16 06:08:19.124147+00
76	comet_admin	pallet.create	f	2026-06-16 06:11:08.083764+00
83	comet_admin	pallet.edit	f	2026-06-16 06:11:08.526447+00
90	comet_admin	pallet.delete	f	2026-06-16 06:11:08.57538+00
97	comet_admin	shipment.create	f	2026-06-16 06:11:08.592634+00
104	comet_admin	shipment.edit	f	2026-06-16 06:11:08.61571+00
111	comet_admin	shipment.delete	f	2026-06-16 06:11:08.650268+00
118	comet_admin	shipment.lock	f	2026-06-16 06:11:08.687126+00
125	comet_admin	shipment.reschedule	f	2026-06-16 06:11:08.708068+00
132	comet_admin	austrag.create	f	2026-06-16 06:11:08.738719+00
139	comet_admin	austrag.delete	f	2026-06-16 06:11:08.763934+00
146	comet_admin	reconciliation.create	f	2026-06-16 06:11:08.785792+00
153	comet_admin	reconciliation.sign	f	2026-06-16 06:11:08.810496+00
160	comet_admin	spedition.create	f	2026-06-16 06:11:08.831084+00
162	comet_lager	spedition.create	f	2026-06-16 06:11:08.831084+00
163	comet_viewer	spedition.create	f	2026-06-16 06:11:08.831084+00
164	speditions_admin	spedition.create	f	2026-06-16 06:11:08.831084+00
165	speditions_bearbeiter	spedition.create	f	2026-06-16 06:11:08.831084+00
166	speditions_viewer	spedition.create	f	2026-06-16 06:11:08.831084+00
167	comet_admin	spedition.edit	f	2026-06-16 06:11:08.89478+00
169	comet_lager	spedition.edit	f	2026-06-16 06:11:08.89478+00
170	comet_viewer	spedition.edit	f	2026-06-16 06:11:08.89478+00
171	speditions_admin	spedition.edit	f	2026-06-16 06:11:08.89478+00
172	speditions_bearbeiter	spedition.edit	f	2026-06-16 06:11:08.89478+00
173	speditions_viewer	spedition.edit	f	2026-06-16 06:11:08.89478+00
168	comet_leitstand	spedition.edit	t	2026-06-16 06:12:58.16175+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, role_key, label, role_group, is_system, created_at) FROM stdin;
1	comet_admin	COMET Admin	COMET intern	t	2026-06-15 21:50:04.796277+00
2	comet_leitstand	COMET Leitstand	COMET intern	t	2026-06-15 21:50:04.796277+00
3	comet_lager	COMET Lager	COMET intern	t	2026-06-15 21:50:04.796277+00
4	comet_viewer	COMET Viewer	COMET intern	t	2026-06-15 21:50:04.796277+00
5	speditions_admin	Spedition Admin	Speditionen	t	2026-06-15 21:50:04.796277+00
6	speditions_bearbeiter	Spedition Bearbeiter	Speditionen	t	2026-06-15 21:50:04.796277+00
7	speditions_viewer	Spedition Viewer	Speditionen	t	2026-06-15 21:50:04.796277+00
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (sid, sess, expire) FROM stdin;
r6N_Rw-m3p_comctMwsPoYebfYKaS0gv	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:33:31.022Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1,"role":"comet_admin","speditionId":null}	2026-06-22 11:33:40
ZyrTNKZEzIMe_SHImUny10iceh9phwrD	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:34:59.836Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1,"role":"comet_admin","speditionId":null}	2026-06-22 11:35:00
FDRn_YCJ4iVoaODVJEwxNV1nZknOGmP0	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:43:00.903Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":5,"role":"speditions_admin","speditionId":1}	2026-06-22 11:43:02
Rlfmbfa1rXNhKXOeevzRksXXFhed16Wt	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:43:05.865Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1,"role":"comet_admin","speditionId":null}	2026-06-22 11:43:07
fOBgN8MwTPu7ffdpiAvIVpZ1OPUI13cb	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:43:05.449Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":5,"role":"speditions_admin","speditionId":1}	2026-06-22 11:43:07
U3vwY-4IdHQrb_2uDr4dPPAQIZVPDu6O	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-23T06:41:43.699Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":9,"role":"comet_admin","speditionId":null,"username":"JustinKlame"}	2026-06-23 07:24:47
XglqqHsRe1vxPjgrNHZ5-846BpW84B4t	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:43:21.972Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1,"role":"comet_admin","speditionId":null}	2026-06-22 11:44:05
cdwCBi5MagTKBqLlIXVeLbh9fN8qvJiU	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T11:43:33.207Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":5,"role":"speditions_admin","speditionId":1}	2026-06-22 11:44:05
ibmZiQrIHdkONALx568_ytYJtdWQdbDy	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T13:04:53.351Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":1,"role":"comet_admin","speditionId":null,"username":"admin"}	2026-06-22 13:05:17
NbURgFb_AWBL-21533osYuepEnna44Xh	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T13:32:38.940Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":5,"role":"speditions_admin","speditionId":1,"username":"mueller.admin"}	2026-06-22 13:51:20
LYVaeStDrykH1S4BoaGPTHxdERRfWZey	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T21:42:49.058Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":9,"role":"comet_admin","speditionId":null,"username":"JustinKlame"}	2026-06-22 22:34:30
L7-D3JAnK2F5zgO3jrbaOgIw7D0pUpA2	{"cookie":{"originalMaxAge":604800000,"expires":"2026-06-22T21:58:56.566Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":2,"role":"comet_leitstand","speditionId":null,"username":"leitstand"}	2026-06-22 21:59:00
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (key, value, updated_by, updated_at) FROM stdin;
login_subtitle	LKW-Verladungsverwaltung	\N	2026-06-15 20:51:08.797239+00
email_subject_template		\N	2026-06-15 20:51:08.797239+00
email_body_template		\N	2026-06-15 20:51:08.797239+00
company_name	COMET Feuerwerk GmbH	1	2026-06-15 20:54:35.146+00
app_name	Easy-Verladung	1	2026-06-15 20:54:45.79+00
default_bemerkung		9	2026-06-15 21:44:08.124+00
\.


--
-- Data for Name: shipments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shipments (id, bezeichnung, kennzeichen, relation, spedition_id, sub_spedition_id, bemerkungen, telefon, eta_date, eta_time, ata_date, ata_time, lkw_art, status, tor, comet_bearbeitet, gesperrt_fuer_spedition, created_by, created_at, updated_by, updated_at, ware_status) FROM stdin;
\.


--
-- Data for Name: spedition_contacts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.spedition_contacts (id, spedition_id, name, bereich, telefon, email, bemerkungen, created_at) FROM stdin;
1	5	Carsten Hett	Verladungen	+49 421 52 38 276	carsten.hett@dhl.com	\N	2026-06-16 05:48:08.12614+00
2	5	Christoph Bräuner	Verladungen	+49 421 52 38 192	christoph.braeuner@dhl.com	\N	2026-06-16 05:48:50.705221+00
3	5	Michael Bauckner	Verladungen	+49 421 52 38 230	michael.bauckner@dhl.com	\N	2026-06-16 05:49:27.006283+00
4	5	Nicole Gerkens	Verladungen	+49 421 52 38 140	nicole.gerkens@dhl.com	\N	2026-06-16 05:50:18.058779+00
5	5	Thomas Dziubinski	Verladungen	\N	thomas.dziubinski@dhl.com	\N	2026-06-16 05:51:12.369098+00
6	4	Julian Arciszewski	Allgemein	+49 421 84 96 2-43	julian.arciszewski@seatrader.de	\N	2026-06-16 05:52:31.387839+00
7	4	Andree Fleischer	Allgemein	+49 421 84 96 2-12	andree.fleischer@seatrader.de	\N	2026-06-16 05:52:50.061359+00
8	4	Lars Reiners	Allgemein	+49 421 84 96 2-14	lars.reiners@seatrader.de	\N	2026-06-16 05:53:03.249323+00
9	4	Daniel Stöver	Allgemein	+49 421 84 96 2-33	daniel.stoever@seatrader.de	\N	2026-06-16 05:53:16.234111+00
10	6	Ole Clos	Allgemein	+49 421 87 150 252	clos@panatlantic.de	\N	2026-06-16 05:54:15.862914+00
11	11	Tobias Brimmers	Allgemein	+49 028 39 56 24 020	tobias.brimmers@raeth.de	\N	2026-06-16 05:55:45.105742+00
12	12	Galina Ehnes	Allgemein	+49 152 33 56 56 42	info@lehn-paletten.de	\N	2026-06-16 05:57:03.647177+00
13	9	Severina Hesse	Allgemein	+49 421 522 3200	Severina.Hesse@hellmann.com	\N	2026-06-16 05:58:08.512997+00
14	9	Lars Thieme	Allgemein	+49 151 184 767 04	Lars.Thieme@hellmann.com	\N	2026-06-16 05:58:46.001279+00
15	7	Andreas Meyer	Allgemein	04761 868-10	a.meyer@em-spedition.de	\N	2026-06-16 06:00:54.726254+00
16	7	Rouven Rogge	Allgemein	04761 868-19	r.rogge@em-spedition.de	\N	2026-06-16 06:01:07.735415+00
17	7	Marcus Hölling	Allgemein	04761 868-14	m.hoelling@em-spedition.de	\N	2026-06-16 06:01:31.354891+00
18	7	Sina Kriesel	Allgemein	04761 868-12	s.kriesel@em-spedition.de	\N	2026-06-16 06:01:45.438287+00
19	7	Kenneth Böttjer	Allgemein	04761 868-58	k.boettjer@em-spedition.de	\N	2026-06-16 06:02:10.146697+00
20	7	Sophie Bittner	Allgemein	04761 868-45 	s.bittner@em-spedition.de	\N	2026-06-16 06:03:13.209576+00
\.


--
-- Data for Name: spedition_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.spedition_permissions (id, granting_spedition_id, receiving_spedition_id, permission_level, created_at) FROM stdin;
\.


--
-- Data for Name: speditionen; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.speditionen (id, name, kuerzel, ansprechpartner, email, telefon, status, bemerkungen, created_at, updated_at) FROM stdin;
8	TNT	TNT				aktiv		2026-06-15 21:39:16.246483+00	2026-06-15 21:39:16.246483+00
10	DPD	DPD				aktiv		2026-06-15 21:39:34.117045+00	2026-06-15 21:39:34.117045+00
13	Container	CT	Michael Holm	michael.holm@imotrans.com	+49 40 238 346 713	aktiv		2026-06-15 21:40:14.471652+00	2026-06-16 05:45:10.295+00
5	DHL Freight GmbH	DHL	Nicole Gerkens	nicole.gerkens@dhl.com	+49 421 52 38 140	aktiv		2026-06-15 21:38:40.534878+00	2026-06-16 05:51:19.05+00
4	Seatrader	SEAT	Julian Arciszewski	julian.arciszewski@seatrader.de	+49 421 84 96 2-43	aktiv		2026-06-15 21:37:40.29075+00	2026-06-16 05:53:19.096+00
6	Panatlantic	PAN	Ole Clos	clos@panatlantic.de	+49 421 87 150 252	aktiv		2026-06-15 21:38:50.763252+00	2026-06-16 05:54:16.791+00
11	Raeth	RAETH	Tobias Brimmers	tobias.brimmers@raeth.de	+49 028 39 56 24 020	aktiv		2026-06-15 21:39:46.446036+00	2026-06-16 05:55:45.977+00
12	LEHN Paletten	LEHN	Galina Ehnes	info@lehn-paletten.de	+49 152 33 56 56 42	aktiv		2026-06-15 21:39:53.851266+00	2026-06-16 05:57:04.612+00
9	Hellmann	HELL	Severina Hesse	Severina.Hesse@hellmann.com	+49 421 522 3200	aktiv		2026-06-15 21:39:25.164043+00	2026-06-16 05:58:46.965+00
7	Eduard Meyer	EM	Andreas Meyer	a.meyer@em-spedition.de	04761 868-10	aktiv		2026-06-15 21:39:07.502152+00	2026-06-16 06:05:39.683+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, email, password_hash, role, spedition_id, is_active, created_at, updated_at) FROM stdin;
1	admin	admin@comet.de	$2b$12$elhDhx5MiWcxShn3xNRdFeJ6hEt53z.C.yW9OmuoSmrCsPVtqQ3na	comet_admin	\N	t	2026-06-15 11:28:26.395506+00	2026-06-15 11:28:26.395506+00
2	leitstand	leitstand@comet.de	$2b$12$GHC0oDNd/udGnaLDC.CSg.Rv6g7/pAs1isWgaz9YASLwtvSp6LYKi	comet_leitstand	\N	t	2026-06-15 11:28:26.787039+00	2026-06-15 11:28:26.787039+00
3	lager	lager@comet.de	$2b$12$fJfs2T9fQyD9K0iQUVis6O7FlOjV24zZHnlFD/IwqnyaqdTYIIuc6	comet_lager	\N	t	2026-06-15 11:28:27.188398+00	2026-06-15 11:28:27.188398+00
4	viewer	viewer@comet.de	$2b$12$5IXPxBIZZBx2uJmJkGBokOKgJnNWk62SbMs4KOHjHd23tJ8GfF0SO	comet_viewer	\N	t	2026-06-15 11:28:27.598165+00	2026-06-15 11:28:27.598165+00
9	JustinKlame	JustinKlame@comet-seasonal.de	$2b$12$eevKb6Ng8i/hWKUfUP73xuY0QDBw5VSZOpILl1j2U.YG3UairBbq6	comet_admin	\N	t	2026-06-15 20:58:57.399633+00	2026-06-16 06:36:21.771+00
\.


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 101, true);


--
-- Name: lkw_austraege_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lkw_austraege_id_seq', 1, true);


--
-- Name: pallet_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pallet_movements_id_seq', 14, true);


--
-- Name: pallet_reconciliations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pallet_reconciliations_id_seq', 2, true);


--
-- Name: reconciliation_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reconciliation_comments_id_seq', 2, true);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.role_permissions_id_seq', 470, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 7, true);


--
-- Name: shipments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shipments_id_seq', 14, true);


--
-- Name: spedition_contacts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.spedition_contacts_id_seq', 20, true);


--
-- Name: spedition_permissions_granting_spedition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.spedition_permissions_granting_spedition_id_seq', 1, false);


--
-- Name: spedition_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.spedition_permissions_id_seq', 2, true);


--
-- Name: spedition_permissions_receiving_spedition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.spedition_permissions_receiving_spedition_id_seq', 1, false);


--
-- Name: speditionen_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.speditionen_id_seq', 13, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 9, true);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: lkw_austraege lkw_austraege_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lkw_austraege
    ADD CONSTRAINT lkw_austraege_pkey PRIMARY KEY (id);


--
-- Name: pallet_movements pallet_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_movements
    ADD CONSTRAINT pallet_movements_pkey PRIMARY KEY (id);


--
-- Name: pallet_reconciliations pallet_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallet_reconciliations
    ADD CONSTRAINT pallet_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_comments reconciliation_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_comments
    ADD CONSTRAINT reconciliation_comments_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_permission_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_permission_key UNIQUE (role, permission);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_role_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_key_key UNIQUE (role_key);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: spedition_contacts spedition_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_contacts
    ADD CONSTRAINT spedition_contacts_pkey PRIMARY KEY (id);


--
-- Name: spedition_permissions spedition_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_permissions
    ADD CONSTRAINT spedition_permissions_pkey PRIMARY KEY (id);


--
-- Name: speditionen speditionen_kuerzel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speditionen
    ADD CONSTRAINT speditionen_kuerzel_unique UNIQUE (kuerzel);


--
-- Name: speditionen speditionen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speditionen
    ADD CONSTRAINT speditionen_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: idx_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_expire ON public.session USING btree (expire);


--
-- Name: idx_spedition_contacts_spedition_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spedition_contacts_spedition_id ON public.spedition_contacts USING btree (spedition_id);


--
-- Name: lkw_austraege lkw_austraege_beauftragte_spedition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lkw_austraege
    ADD CONSTRAINT lkw_austraege_beauftragte_spedition_id_fkey FOREIGN KEY (beauftragte_spedition_id) REFERENCES public.speditionen(id);


--
-- Name: lkw_austraege lkw_austraege_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lkw_austraege
    ADD CONSTRAINT lkw_austraege_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id);


--
-- Name: settings settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: spedition_contacts spedition_contacts_spedition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spedition_contacts
    ADD CONSTRAINT spedition_contacts_spedition_id_fkey FOREIGN KEY (spedition_id) REFERENCES public.speditionen(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict aOdNb0uM4pQ9KGbrFIsuWmPgQ8Qgr7flz5ZZ8xp1aobOmr9adWYOMSf5iTgmXZn

