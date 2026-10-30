-- Conferência por quantidade mostra, embaixo do componente, o Kit de que ele faz parte (out/2026, igual à Triagem):
-- operacao_conferencia_pecas passa a devolver kit_nome e por_kit (vazios para item comum).
begin;
drop function if exists public.operacao_conferencia_pecas(uuid);
create function public.operacao_conferencia_pecas(p_pedido uuid)
 returns table(chave text, linha uuid, item_id uuid, nome text, esperado numeric, kit_nome text, por_kit numeric)
 language sql stable set search_path to 'public' as $function$
  with linhas as (
    select si.id linha, si.item_id, coalesce(si.item_nome, i.descricao_total, i.produto, 'Item') nome,
           coalesce(si.quantidade_solicitada,0) q, lower(coalesce(i.tipo,'')) tipo
      from public.separacoes_itens si left join public.itens i on i.id=si.item_id
     where si.separacao_pedido_id=p_pedido)
  select l.linha::text||'|'||k.item_id::text, l.linha, k.item_id, coalesce(c.descricao_total,c.produto,'Componente'), k.quantidade*l.q,
         l.nome, k.quantidade
    from linhas l join public.kit_itens k on k.kit_id=l.item_id left join public.itens c on c.id=k.item_id
   where l.tipo='kit'
  union all
  select l.linha::text||'|'||l.item_id::text, l.linha, l.item_id, l.nome, l.q, null::text, null::numeric
    from linhas l
   where l.tipo<>'kit' or not exists(select 1 from public.kit_itens k where k.kit_id=l.item_id)
$function$;
revoke all on function public.operacao_conferencia_pecas(uuid) from public, anon;
grant execute on function public.operacao_conferencia_pecas(uuid) to authenticated, service_role;
notify pgrst,'reload schema';
commit;
