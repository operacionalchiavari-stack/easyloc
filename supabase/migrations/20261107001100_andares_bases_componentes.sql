-- Andares e bases de estante/aparador vieram da planilha como "Item" e apareciam no catálogo (nov/2026).
-- São peças de kit: viram Componente. Cópia do tipo anterior em itens_tipo_backup_20261107.
create table if not exists public.itens_tipo_backup_20261107 as
  select id, tipo, now() as copiado_em from public.itens where false;
alter table public.itens_tipo_backup_20261107 enable row level security;
insert into public.itens_tipo_backup_20261107(id, tipo, copiado_em)
select id, tipo, now() from public.itens
 where tipo = 'Item' and (descricao_total ilike 'andar estante%' or descricao_total ilike 'base estante%' or descricao_total ilike 'base aparador%');
update public.itens set tipo = 'Componente'
 where id in (select id from public.itens_tipo_backup_20261107);
