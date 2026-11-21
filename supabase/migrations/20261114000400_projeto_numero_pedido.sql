-- Número do pedido gerado a partir do projeto do catálogo (nov/2026), para mostrar na tela do projeto.
-- Mesma regra de acesso de projeto_obter (projeto_ctx + projeto_do_chamador): decorador só o próprio projeto.
create or replace function public.projeto_numero_pedido(p_token text default null, p_empresa_id uuid default null, p_id uuid default null)
 returns text language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare c jsonb; r public.projetos; v text;
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  r := public.projeto_do_chamador(c, p_id);
  select sp.numero_pedido::text into v from public.separacoes_pedidos sp
   where sp.empresa_id = r.empresa_id and sp.observacoes->>'projeto_catalogo_id' = r.id::text
     and coalesce(sp.status_comercial, '') <> 'cancelado'
   order by sp.data_hora desc nulls last limit 1;
  return v;
end $function$;
revoke all on function public.projeto_numero_pedido(text, uuid, uuid) from public;
grant execute on function public.projeto_numero_pedido(text, uuid, uuid) to anon, authenticated;
