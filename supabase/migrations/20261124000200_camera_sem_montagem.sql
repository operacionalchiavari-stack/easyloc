-- Câmera ao vivo sem escolher montagem (pedido do usuário: "só ligar e pronto").
-- p_etapa virou opcional: sem ela, o banco procura sozinho uma montagem/desmontagem de hoje em que a pessoa está escalada
-- (a mais perto do horário atual) só para mostrar o cliente no mosaico; se não houver, a câmera fica só com o nome de quem filma.
create or replace function public.camera_iniciar(p_empresa uuid, p_etapa uuid default null, p_aparelho text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare e operacao_etapas; p separacoes_pedidos; nome text; v_id uuid; titulo text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not camera_pode_transmitir(p_empresa) then raise exception 'Sem acesso à câmera ao vivo.'; end if;
  if p_etapa is not null then
    select * into e from operacao_etapas where id = p_etapa and empresa_id = p_empresa;
  else
    select oe.* into e from operacao_etapas oe
     where oe.empresa_id = p_empresa and oe.tipo in ('montagem','desmontagem') and oe.data = hoje
       and exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id = oe.id and ep.funcionario_id = auth.uid())
     order by abs(extract(epoch from (coalesce(oe.hora, '12:00') - (now() at time zone 'America/Sao_Paulo')::time)))
     limit 1;
  end if;
  if e.id is not null then select * into p from separacoes_pedidos where id = e.pedido_id; end if;
  nome := coalesce(nullif((select f.nome from funcionarios_acesso f where f.id = auth.uid()), ''),
                   nullif((select u.nome from usuarios u where u.id = auth.uid()), ''), 'Equipe');
  titulo := case when e.id is null then 'Câmera de ' || split_part(nome, ' ', 1)
                 else initcap(coalesce(e.tipo, 'montagem')) || coalesce(' · Pedido ' || p.numero_pedido, '') end;
  update logistica_cameras set status = 'encerrada', encerrada_em = now()
   where usuario_id = auth.uid() and empresa_id = p_empresa and status = 'ao_vivo';
  insert into logistica_cameras(empresa_id, etapa_id, pedido_id, titulo, usuario_nome, aparelho)
  values (p_empresa, e.id, p.id, titulo, nome, left(coalesce(p_aparelho, ''), 120)) returning id into v_id;
  delete from logistica_camera_sinais where criado_em < now() - interval '2 hours';
  return jsonb_build_object('id', v_id, 'titulo', titulo, 'nome', nome,
    'cliente', p.cliente_nome, 'numero', p.numero_pedido, 'local', p.local_nome, 'tipo', e.tipo);
end $$;
revoke all on function public.camera_iniciar(uuid, uuid, text) from public, anon;
grant execute on function public.camera_iniciar(uuid, uuid, text) to authenticated;
