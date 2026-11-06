-- Item de sublocação no formato do nosso cadastro de item (nov/2026): galeria (2 fotos de detalhe + 3 ambientadas),
-- modelo 3D (GLB), exibir no catálogo/site e os campos de classificação. Campos de uso interno (setor de estoque,
-- grupo de separação, referência do cliente, kit) ficam de fora.
alter table public.terceirizacao_itens add column if not exists produto_base text;
alter table public.terceirizacao_itens add column if not exists marca_modelo text;
alter table public.terceirizacao_itens add column if not exists subcategoria text;
alter table public.terceirizacao_itens add column if not exists familia text;
alter table public.terceirizacao_itens add column if not exists estilo text;
alter table public.terceirizacao_itens add column if not exists valor_reposicao numeric(12,2) not null default 0;
alter table public.terceirizacao_itens add column if not exists exibir_site boolean not null default false;
alter table public.terceirizacao_itens add column if not exists destaque_site boolean not null default false;
-- {"detalhe_01": {"url": "...", "path": "..."}, "galeria_01": {...}, ...}
alter table public.terceirizacao_itens add column if not exists fotos jsonb not null default '{}'::jsonb;
alter table public.terceirizacao_itens add column if not exists modelo_3d_url text;
alter table public.terceirizacao_itens add column if not exists modelo_3d_path text;
alter table public.terceirizacao_itens add column if not exists modelo_3d_nome text;
alter table public.terceirizacao_itens add column if not exists modelo_3d_tamanho bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'terceirizacao_itens_fotos_objeto') then
    alter table public.terceirizacao_itens add constraint terceirizacao_itens_fotos_objeto check (jsonb_typeof(fotos) = 'object');
  end if;
end $$;
notify pgrst, 'reload schema';
