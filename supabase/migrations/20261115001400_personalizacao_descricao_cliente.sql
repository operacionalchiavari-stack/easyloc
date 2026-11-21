-- 15/11/2026: descrição da personalização que vai para o cliente no pedido
-- (a "Observação para a equipe de produção" continua só interna).
alter table public.personalizacoes add column if not exists descricao_cliente text;

create or replace function public.personalizacao_lista(p_token text DEFAULT NULL::text, p_empresa_id uuid DEFAULT NULL::uuid, p_pedido boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ctx jsonb := public.projeto_ctx(p_token, p_empresa_id); emp uuid := (ctx->>'empresa_id')::uuid; ver_preco boolean;
begin
  ver_preco := public.personalizacao_ver_preco(ctx, p_pedido);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'vinculo_id', p.vinculo_id, 'tipo', p.tipo,
      'descricao', nullif(btrim(coalesce(p.descricao_cliente, '')), ''),
      'preco_base', case when ver_preco then public.personalizacao_preco_base(p) end,
      'tipos_cartela', (select coalesce(jsonb_agg(distinct pi.cartela_tipo), '[]') from personalizacoes_insumos pi where pi.personalizacao_id = p.id and pi.cartela_tipo is not null)
    ) order by p.tipo)
    from personalizacoes p where p.empresa_id = emp and upper(coalesce(p.status, 'ATIVO')) <> 'INATIVO'), '[]');
end $function$;
