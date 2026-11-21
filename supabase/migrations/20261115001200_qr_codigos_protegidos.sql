-- 15/11/2026: aba QR Code do item só para ver e imprimir. Os códigos são gerados pelo sistema e não mudam:
-- (1) itens.qr_code nasce sozinho e, depois de gravado, nunca muda (o banco mantém o anterior);
-- (2) itens_patrimonios (QR fixo de cada unidade) só é criado pela função itens_patrimonios_garantir, que gera um
--     código por unidade do estoque; ninguém grava nem altera essa tabela pela tela.

-- (1) QR do item
create or replace function public.itens_qr_protegido() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and coalesce(old.qr_code,'')<>'' then
  new.qr_code := old.qr_code;                       -- já tinha código: fica o mesmo, venha o que vier da tela
 else
  new.qr_code := gen_random_uuid()::text;           -- código novo: sempre o banco que gera (a tela não escolhe)
 end if;
 return new;
end $$;
drop trigger if exists itens_qr_protegido on public.itens;
create trigger itens_qr_protegido before insert or update of qr_code on public.itens
 for each row execute function public.itens_qr_protegido();

-- itens antigos sem código ganham um agora
-- (gatilhos pausados só neste comando: só o qr_code muda e os gatilhos de ocorrências/histórico deixariam lento demais)
set local session_replication_role = replica;
update public.itens set qr_code = gen_random_uuid()::text where coalesce(trim(qr_code),'')='';
set local session_replication_role = origin;

-- (2) QR fixo por unidade (patrimônio)
revoke insert, update, delete on public.itens_patrimonios from authenticated, anon;

create or replace function public.itens_patrimonios_protegido() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.codigo_patrimonio is distinct from old.codigo_patrimonio or new.item_id is distinct from old.item_id or new.empresa_id is distinct from old.empresa_id then
  raise exception 'O código da etiqueta é gerado pelo sistema e não pode ser alterado.';
 end if;
 return new;
end $$;
drop trigger if exists itens_patrimonios_protegido on public.itens_patrimonios;
create trigger itens_patrimonios_protegido before update on public.itens_patrimonios
 for each row execute function public.itens_patrimonios_protegido();

-- Garante um código por unidade em estoque (nunca apaga nem renumera os que já existem) e devolve a lista.
create or replace function public.itens_patrimonios_garantir(p_empresa uuid, p_item uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare it itens; base text; maior int; faltam int; i int := 0; cod text;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'itens','select') or not seguranca_2fa_ok() then
  raise exception 'Sem permissão para ver as etiquetas deste item.';
 end if;
 select * into it from itens where id=p_item and empresa_id=p_empresa;
 if not found then raise exception 'Item não encontrado.'; end if;
 if it.tipo is distinct from 'Kit' then
  perform pg_advisory_xact_lock(hashtext('patrimonio:'||p_item::text));
  base := upper(regexp_replace(coalesce(nullif(trim(it.referencia),''),nullif(trim(it.codigo),''),'ITEM'),'\s+','','g'));
  select coalesce(max(nullif(regexp_replace(codigo_patrimonio,'^.*-',''),'')::int),0) into maior
   from itens_patrimonios where empresa_id=p_empresa and item_id=p_item and codigo_patrimonio ~ '-[0-9]+$';
  faltam := greatest(coalesce(it.estoque_total,0)::int - (select count(*) from itens_patrimonios where empresa_id=p_empresa and item_id=p_item)::int, 0);
  while faltam > 0 and i < 2000 loop
   i := i + 1; maior := maior + 1;
   cod := base || '-' || lpad(maior::text, 3, '0');
   insert into itens_patrimonios(empresa_id,item_id,codigo_patrimonio) values(p_empresa,p_item,cod) on conflict (empresa_id,codigo_patrimonio) do nothing;
   if found then faltam := faltam - 1; end if;
  end loop;
 end if;
 return jsonb_build_object(
  'item', jsonb_build_object('id',it.id,'tipo',it.tipo,'qr_code',it.qr_code,'estoque_total',it.estoque_total),
  'etiquetas', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'codigo',p.codigo_patrimonio,'status',p.status,'criado_em',p.created_at) order by p.codigo_patrimonio)
   from itens_patrimonios p where p.empresa_id=p_empresa and p.item_id=p_item),'[]'::jsonb));
end $$;
revoke all on function public.itens_patrimonios_garantir(uuid,uuid) from public, anon;
grant execute on function public.itens_patrimonios_garantir(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
