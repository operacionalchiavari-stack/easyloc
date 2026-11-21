-- Particularidades de cada local (ex.: "não passar caminhão na grama, tem irrigação"), para o Comercial e a equipe de entrega.
alter table public.locais_empresas add column if not exists particularidades text;
