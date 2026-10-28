begin;
-- Retira as operações antigas de lote/certificado. Dados históricos não são apagados.
do $$
declare definicao text; inicio int; fim int;
begin
 select pg_get_functiondef('public.compras_operar(uuid,text,jsonb)'::regprocedure) into definicao;
 inicio:=strpos(definicao,' elsif p_acao=''lote'' then');
 fim:=strpos(definicao,' elsif p_acao=''criar_rnc'' then');
 if inicio>0 and fim>inicio then
  execute substr(definicao,1,inicio-1)||substr(definicao,fim);
 elsif strpos(definicao,'p_acao=''lote''')>0 then raise exception 'Formato inesperado da função de Compras';
 end if;
end $$;

-- Nenhum pedido antigo ou novo exige rastreio de lote ou certificado.
create or replace function public.compras_sem_rastreio() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.tipo in ('pedido','cotacao') and jsonb_typeof(new.dados->'items')='array' then
  new.dados:=jsonb_set(new.dados,'{items}',coalesce((select jsonb_agg(x||jsonb_build_object('requer_lote',false,'requer_certificado',false) order by ord)
   from jsonb_array_elements(new.dados->'items') with ordinality t(x,ord)),'[]'::jsonb));
 end if;
 return new;
end $$;
revoke all on function public.compras_sem_rastreio() from public,anon,authenticated;
drop trigger if exists compras_sem_rastreio on public.compras_registros;
create trigger compras_sem_rastreio before insert or update of dados on public.compras_registros for each row execute function public.compras_sem_rastreio();
update public.compras_registros set dados=dados where tipo in ('pedido','cotacao')
 and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(dados->'items')='array' then dados->'items' else '[]'::jsonb end) x
  where x->>'requer_lote'='true' or x->>'requer_certificado'='true');
notify pgrst,'reload schema';
commit;
