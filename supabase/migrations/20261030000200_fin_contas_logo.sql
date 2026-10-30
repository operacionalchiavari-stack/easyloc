-- Foto (logo do banco) de cada conta do Financeiro, mostrada na aba Bancos. Arquivo no bucket público
-- "empresas-logos", pasta <empresa>/bancos/ (as regras do bucket já limitam à pasta da própria empresa).
alter table public.fin_contas add column if not exists logo_url text;
