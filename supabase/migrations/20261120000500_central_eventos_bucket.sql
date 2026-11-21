-- Central de Metas (nov/2026): contexto de complexidade dos eventos de um período (inclusive pedidos já encerrados,
-- que complexidade_contextos deixa de fora) e bucket das fotos das premiações.
create or replace function public.central_eventos_mes(p_empresa uuid, p_ini date, p_fim date)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(complexidade_contexto(p_empresa, p.id) order by p.data_evento, p.numero_pedido), '[]')
  from separacoes_pedidos p
  where p.empresa_id = p_empresa
    and p.status_comercial in ('aprovado', 'finalizado', 'enviado')
    and p.data_evento >= p_ini and p.data_evento < p_fim
    and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true';
$$;
revoke all on function public.central_eventos_mes(uuid, date, date) from public, anon, authenticated;
grant execute on function public.central_eventos_mes(uuid, date, date) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('central-premiacoes', 'central-premiacoes', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
