-- Uma exclusão não pode apagar silenciosamente o contexto de uma ligação já registrada.
begin;
alter table public.posvenda_contato_pedidos
  drop constraint if exists posvenda_contato_pedidos_pedido_id_fkey;
alter table public.posvenda_contato_pedidos
  add constraint posvenda_contato_pedidos_pedido_id_fkey
  foreign key (pedido_id) references public.separacoes_pedidos(id) on delete restrict;
commit;
