-- Fotos somente das pessoas e veículos vinculados à etapa autorizada.
create or replace function public.mont_fotos_etapa(p_token text, p_etapa uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare s app_sessoes; e operacao_etapas; r jsonb;
begin
  s := app_sessao(p_token, 'montador');
  select * into e from operacao_etapas where id = p_etapa and empresa_id = s.empresa_id;
  if e.id is null or not mont_pode_ver(s, p_etapa) then
    raise exception 'Sem acesso à etapa.';
  end if;
  select jsonb_build_object(
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.funcionario_id, 'nome', p.nome, 'papel', p.papel,
      'foto', case when f.foto_url ~* '^https?://' then f.foto_url else null end,
      'avatar', case when exists (select 1 from storage.objects o where o.bucket_id = 'avatares'
        and o.name = s.empresa_id::text || '/' || f.id::text || '.jpg')
        then s.empresa_id::text || '/' || f.id::text || '.jpg' else null end
    ) order by p.ordem, p.id)
      from operacao_etapa_pessoas p
      left join funcionarios_acesso f on f.id = p.funcionario_id and f.empresa_id = s.empresa_id
      where p.etapa_id = e.id and p.empresa_id = s.empresa_id and p.funcionario_id is not null), '[]'::jsonb),
    'caminhoes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.codigo,
      'foto', case when c.foto_url ~* '^https?://' then c.foto_url else null end) order by c.codigo)
      from operacao_etapa_caminhoes v join caminhoes c on c.id = v.caminhao_id and c.empresa_id = s.empresa_id
      where v.etapa_id = e.id and v.empresa_id = s.empresa_id), '[]'::jsonb),
    'solicitante', (select jsonb_build_object('id', c.id, 'nome', coalesce(c.nome_razao, p.cliente_nome),
      'foto', case when c.catalogo_logo_url ~* '^https?://' then c.catalogo_logo_url else null end)
      from separacoes_pedidos p left join clientes_empresas c on c.id = p.cliente_id and c.empresa_id = s.empresa_id
      where p.id = e.pedido_id and p.empresa_id = s.empresa_id)
  ) into r;
  return r;
end;
$$;
revoke all on function public.mont_fotos_etapa(text, uuid) from public;
grant execute on function public.mont_fotos_etapa(text, uuid) to anon, authenticated;
