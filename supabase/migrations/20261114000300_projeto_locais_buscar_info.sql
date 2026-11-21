-- Busca de locais do projeto devolve também tipo, distância do galpão, referência e as observações do local (nov/2026).
-- Local do evento no projeto do catálogo buscado no Cadastro de Locais (nov/2026, igual ao pedido).
-- Decorador entra por token (sem auth.uid()), então lê pelos dados mínimos via função: nome, endereço e coordenadas.
create or replace function public.projeto_locais_buscar(p_token text default null, p_empresa_id uuid default null, p_termo text default '')
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare c jsonb; emp uuid; t text := trim(coalesce(p_termo, ''));
begin
  c := public.projeto_ctx(p_token, p_empresa_id);
  emp := (c->>'empresa_id')::uuid;
  if length(t) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome_razao,
      'endereco', trim(concat_ws(', ', nullif(l.endereco, ''), case when nullif(l.numero_endereco, '') is not null and position(l.numero_endereco in coalesce(l.endereco, '')) = 0 then l.numero_endereco end)),
      'lat', l.latitude, 'lng', l.longitude,
      'referencia', nullif(l.ponto_referencia, ''), 'distancia', nullif(l.distancia_galpao_texto, ''),
      'tipo', nullif(l.tags->>'tipo', ''),
      'observacoes', case when jsonb_typeof(l.tags->'observacoes') = 'array' then l.tags->'observacoes' else '[]'::jsonb end) order by l.nome_razao)
    from (select * from public.locais_empresas where empresa_id = emp and lower(coalesce(status, 'ativo')) <> 'inativo'
            and (nome_razao ilike '%' || t || '%' or endereco ilike '%' || t || '%') order by nome_razao limit 12) l), '[]'::jsonb);
end $function$;
revoke all on function public.projeto_locais_buscar(text, uuid, text) from public;
grant execute on function public.projeto_locais_buscar(text, uuid, text) to anon, authenticated;
