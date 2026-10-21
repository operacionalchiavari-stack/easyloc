-- Kits com o mesmo componente repetido (out/2026): salvar de novo um kit editado no Cadastro de Itens inseria os
-- componentes outra vez, sem apagar os de antes (kits.modal.mjs, corrigido). Cada repetição contava as peças em dobro
-- na reserva, na disponibilidade e na separação. Ficou uma linha por componente (a mais antiga; as repetidas tinham a
-- mesma quantidade) e uma regra impede repetir de novo. Cópia do que saiu: kit_itens_duplicados_20261020.
begin;
create table if not exists public.kit_itens_duplicados_20261020 as
  select k.* from public.kit_itens k
   where k.id not in (select distinct on (kit_id, item_id) id from public.kit_itens order by kit_id, item_id, created_at, id);
alter table public.kit_itens_duplicados_20261020 enable row level security;
delete from public.kit_itens k where k.id in (select id from public.kit_itens_duplicados_20261020);
create unique index if not exists kit_itens_kit_item_uidx on public.kit_itens (kit_id, item_id);
commit;
