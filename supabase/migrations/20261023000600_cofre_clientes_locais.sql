-- Cofre, etapa 4a: CPF/CNPJ de clientes e locais cifrados (a chave fica fora do banco, nas Edge Functions).
-- cpf_cnpj passa a guardar "cofre:v1:..."; cpf_cnpj_hash é o índice cego (procurar e checar duplicado);
-- cofre_mascaras guarda o que a tela mostra (ex.: •••.•••.•••-09). A trava que recusa texto aberto vem depois da conversão.
alter table public.clientes_empresas add column if not exists cpf_cnpj_hash text;
alter table public.clientes_empresas add column if not exists cofre_mascaras jsonb not null default '{}'::jsonb;
alter table public.locais_empresas add column if not exists cpf_cnpj_hash text;
alter table public.locais_empresas add column if not exists cofre_mascaras jsonb not null default '{}'::jsonb;
create index if not exists clientes_empresas_cpf_cnpj_hash_idx on public.clientes_empresas (empresa_id, cpf_cnpj_hash);
create index if not exists locais_empresas_cpf_cnpj_hash_idx on public.locais_empresas (empresa_id, cpf_cnpj_hash);
