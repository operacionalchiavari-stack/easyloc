-- O recebimento da produção já confirmado satisfaz a parte personalizada da triagem.
-- Não grava essa quantidade na separação normal, para evitar dupla contagem.
do $patch$
declare definicao text; inicio integer; fim integer; trecho text;
begin
 select pg_get_functiondef('public.operacao_validar_pedido_update()'::regprocedure) into definicao;
 inicio:=position('if exists(select 1 from public.separacoes_itens where separacao_pedido_id=new.id and quantidade_separada<quantidade_solicitada)' in definicao);
 if inicio=0 then
  if position('producao_recebida_na_triagem' in definicao)>0 then return; end if;
  raise exception 'Validação da triagem diferente da esperada';
 end if;
 fim:=inicio+position('end if;' in substring(definicao from inicio))+length('end if;')-1;
 trecho:=$sql$
 -- producao_recebida_na_triagem: soma por item, inclusive linhas repetidas do pedido.
 if exists (
  select 1 from public.separacoes_itens s
  left join public.separacao_producao_calc(new.id) p on p.item_id=s.item_id
  where s.separacao_pedido_id=new.id group by s.item_id
  having sum(coalesce(s.quantidade_separada,0))+coalesce(max(least(p.confirmadas,p.prontas,p.unidades)),0)<sum(s.quantidade_solicitada)
 ) then
  raise exception using message='Há itens pendentes na separação. Confira os itens e as quantidades abaixo.', detail=(
   select jsonb_agg(jsonb_build_object('item_id',q.item_id,'nome',coalesce(nullif(i.descricao_total,''),nullif(i.produto,''),q.item_id::text),
    'codigo',i.codigo,'setor',i.setor_estoque,'solicitada',q.solicitada,'separada',q.separada,'faltante',q.solicitada-q.separada) order by q.item_id)::text
   from (
    select s.item_id,sum(s.quantidade_solicitada) solicitada,
     sum(coalesce(s.quantidade_separada,0))+coalesce(max(least(p.confirmadas,p.prontas,p.unidades)),0) separada
    from public.separacoes_itens s left join public.separacao_producao_calc(new.id) p on p.item_id=s.item_id
    where s.separacao_pedido_id=new.id group by s.item_id
   ) q left join public.itens i on i.id=q.item_id and i.empresa_id=new.empresa_id
   where q.separada<q.solicitada
  );
 end if;
 $sql$;
 execute substring(definicao from 1 for inicio-1)||trecho||substring(definicao from fim);
end $patch$;
