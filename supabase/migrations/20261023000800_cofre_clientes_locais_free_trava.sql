-- Cofre, etapa 4 (trava): depois de converter os dados existentes, o banco recusa CPF/CNPJ e chave PIX em texto puro.
-- Clientes e locais só gravam pelo cadastro-protegido; os Free só pela free-protegido. Vazio continua permitido.
alter table public.clientes_empresas drop constraint if exists clientes_empresas_cofre_doc;
alter table public.clientes_empresas add constraint clientes_empresas_cofre_doc
  check (coalesce(cpf_cnpj, '') = '' or cpf_cnpj like 'cofre:v1:%');

alter table public.locais_empresas drop constraint if exists locais_empresas_cofre_doc;
alter table public.locais_empresas add constraint locais_empresas_cofre_doc
  check (coalesce(cpf_cnpj, '') = '' or cpf_cnpj like 'cofre:v1:%');

alter table public.free_cadastros drop constraint if exists free_cadastros_cofre;
alter table public.free_cadastros add constraint free_cadastros_cofre
  check (cpf like 'cofre:v1:%' and (coalesce(chave_pix, '') = '' or chave_pix like 'cofre:v1:%'));

-- As funções antigas do app do Free gravavam CPF e PIX em texto: ninguém mais executa.
revoke all on function public.free_app_cadastrar(jsonb) from public, anon, authenticated;
revoke all on function public.free_app_login(text, text) from public, anon, authenticated;
revoke all on function public.free_app_pix(text, text) from public, anon, authenticated;
