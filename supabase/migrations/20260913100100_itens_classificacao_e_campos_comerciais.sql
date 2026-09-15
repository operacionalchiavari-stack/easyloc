-- Novos campos de classificação e comerciais em `itens`, para suportar a
-- importação em massa do catálogo real do cliente (planilha com colunas que
-- não têm campo correspondente hoje).
--
-- Migration aditiva e idempotente: só adiciona colunas/índices novos, nunca
-- remove ou altera dados existentes. `setor_estoque` deixa de ser NOT NULL
-- (decisão documentada abaixo) mas continua existindo e sendo usado
-- normalmente por quem já depende dele.

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. Referência do cliente (código externo/SKU da planilha do cliente)
-- =====================================================================
-- O sistema já gera seu próprio `codigo` (usado internamente e no QR).
-- `referencia` guarda o código que o CLIENTE já usa na planilha dele —
-- é a chave usada para casar linhas da planilha com itens já importados
-- (reimportar o mesmo arquivo atualiza em vez de duplicar) e para resolver
-- os componentes de um kit pela referência de cada linha.
alter table public.itens add column if not exists referencia text;

comment on column public.itens.referencia is
  'Código/SKU do cliente (planilha externa), distinto do `codigo` interno gerado pelo sistema. Usado como chave de idempotência na importação em massa.';

-- Único por empresa (dois itens da mesma empresa não podem ter a mesma
-- referência), mas permite null (itens cadastrados manualmente raramente
-- terão uma referência externa).
create unique index if not exists itens_empresa_referencia_uidx
  on public.itens (empresa_id, referencia)
  where referencia is not null;

-- =====================================================================
-- 2. Classificações oficiais além de categoria/familia (que já existiam)
-- =====================================================================
-- Continuam como texto livre (mesmo padrão de `categoria`/`familia`, que já
-- são inputs de texto simples, sem tabela de apoio) — criar tabelas de
-- lookup normalizadas agora exigiria migrar toda a base de itens e reescrever
-- catálogo/filtros/importação que hoje tratam esses campos como string, um
-- risco maior do que o problema resolve. A normalização (trim, case,
-- reaproveitar grafia já usada) é feita na camada de importação, documentada
-- em CLAUDE.md.
alter table public.itens add column if not exists subcategoria text;
alter table public.itens add column if not exists grupo_separacao text;
alter table public.itens add column if not exists estilo text;

comment on column public.itens.subcategoria is 'Subcategoria do item (classificação oficial). Texto livre, normalizado na importação.';
comment on column public.itens.grupo_separacao is 'Grupo operacional usado para separar/localizar o item na operação de logística — distinto de `setor_estoque` (área de armazenamento) e de `categoria`.';
comment on column public.itens.estilo is 'Estilo do item (ex.: Clássico, Contemporâneo). Texto livre, normalizado na importação.';

-- =====================================================================
-- 3. `setor_estoque` deixa de ser obrigatório no banco
-- =====================================================================
-- Decisão documentada: a planilha real do cliente não tem uma coluna
-- equivalente a `setor_estoque` (a coluna parecida, "SETOR SEPARAÇÃO",
-- corresponde ao novo `grupo_separacao` acima — um conceito operacional
-- diferente). Manter `setor_estoque` NOT NULL bloquearia a importação em
-- massa sempre que não houver um valor seguro pra preencher. O cadastro
-- manual (item-detalhes.html / itens.api.mjs) já valida esse campo como
-- obrigatório na camada de aplicação antes de salvar — então relaxar aqui
-- não abre brecha para o fluxo manual, só permite que itens importados
-- fiquem sem valor até serem revisados manualmente.
alter table public.itens alter column setor_estoque drop not null;

-- =====================================================================
-- 4. Fornecedor (vínculo com o cadastro já existente)
-- =====================================================================
-- `fornecedor_id` é a referência "de verdade" quando a importação consegue
-- casar o nome da planilha com um fornecedor já cadastrado com segurança.
-- `fornecedor_nome_origem` preserva o texto original da planilha sempre —
-- mesmo quando o vínculo foi feito, serve de auditoria; quando NÃO foi
-- possível casar com segurança, é o único registro do fornecedor informado
-- (evita perder a informação e evita vincular errado).
alter table public.itens add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null;
alter table public.itens add column if not exists fornecedor_nome_origem text;

comment on column public.itens.fornecedor_id is 'FK opcional para fornecedores.id — só preenchido quando a importação encontrou uma correspondência segura por nome normalizado.';
comment on column public.itens.fornecedor_nome_origem is 'Nome do fornecedor exatamente como veio da planilha de origem, preservado mesmo quando não foi possível (ou não foi seguro) vincular a um fornecedor cadastrado.';

create index if not exists itens_fornecedor_id_idx on public.itens (fornecedor_id);

-- =====================================================================
-- 5. Marca/Modelo, exposição no site, destaque, exclusividade
-- =====================================================================
alter table public.itens add column if not exists marca_modelo text;
alter table public.itens add column if not exists ordem_exposicao_site integer;
alter table public.itens add column if not exists destaque_site boolean not null default false;
alter table public.itens add column if not exists locar_somente_kit boolean not null default false;
alter table public.itens add column if not exists exclusivo boolean not null default false;

comment on column public.itens.marca_modelo is 'Marca/Modelo do item, texto livre preservado integralmente da planilha de origem.';
comment on column public.itens.ordem_exposicao_site is 'Ordem de exibição no catálogo/site. NULL = sem ordem definida (não é o mesmo que 0). Itens com a mesma ordem, ou sem ordem, desempatam por nome (aplicado na consulta, não no banco).';
comment on column public.itens.destaque_site is 'Se o item recebe destaque no catálogo/site.';
comment on column public.itens.locar_somente_kit is 'Se verdadeiro, o item não pode ser locado isoladamente — só como componente de um kit. Aplicado na busca de itens dos Pedidos (js/pedido/pedido.itens.mjs).';
comment on column public.itens.exclusivo is 'Marca o item como exclusivo (informativo — exibido no cadastro, sem regra comercial automática associada).';

create index if not exists itens_empresa_ordem_site_idx on public.itens (empresa_id, ordem_exposicao_site);
