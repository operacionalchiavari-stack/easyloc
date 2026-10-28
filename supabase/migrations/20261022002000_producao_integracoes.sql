create or replace function public.almox_reservas_personalizacao(p_empresa_id uuid)
returns table(produto_id text, reservado numeric, pre_reserva numeric, pedidos jsonb)
language sql stable security definer set search_path = public as $$
  with ped as (
    select p.id, p.numero_pedido, p.cliente_nome, p.data_evento,
           case when p.status_comercial = 'pre_reserva' then 'pre' else 'res' end as tipo,
           p.observacoes->'projeto_comercial'->'dados'->'ambientes' as ambs
      from separacoes_pedidos p
     where p.empresa_id = p_empresa_id
       and public.eh_membro_empresa(p_empresa_id)
       and p.status_comercial in ('pre_reserva','aprovado','finalizado','enviado')
       and coalesce(p.data_evento_fim, p.data_evento, current_date) >= current_date
       and p.encerrado_operacional_em is null
  ), linhas as (
    select ped.id, ped.numero_pedido, ped.cliente_nome, ped.data_evento, ped.tipo,
           (it->>'personalizacao_id')::uuid as pers,
           case when jsonb_typeof(it->'personalizacao_escolhas') = 'object' then it->'personalizacao_escolhas' else '{}'::jsonb end as escolhas,
           greatest(coalesce(public.almox_num(it->>'quantidade'), 0), 0) as qtd
      from ped
      cross join lateral jsonb_array_elements(case when jsonb_typeof(ped.ambs) = 'array' then ped.ambs else '[]'::jsonb end) a
      cross join lateral jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) it
     where coalesce(it->>'personalizacao_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), materiais as (
    -- material fixo da personalização
    select pi.almox_produto_id as prod, l.id, l.numero_pedido, l.cliente_nome, l.data_evento, l.tipo, l.qtd * pi.quantidade as q
      from linhas l
      join personalizacoes_insumos pi on pi.personalizacao_id = l.pers and pi.empresa_id = p_empresa_id
     where pi.almox_produto_id is not null
    union all
    -- material escolhido na cartela (só reserva se a opção estiver ligada a um material do Almoxarifado)
    select o.almox_produto_id, l.id, l.numero_pedido, l.cliente_nome, l.data_evento, l.tipo, l.qtd * pi.quantidade
      from linhas l
      join personalizacoes_insumos pi on pi.personalizacao_id = l.pers and pi.empresa_id = p_empresa_id and pi.cartela_tipo is not null
      join cartela_opcoes o on o.empresa_id = p_empresa_id
       and o.id::text = l.escolhas->pi.cartela_tipo->>'opcao_id'
     where o.almox_produto_id is not null
  ), por_pedido as (
    select prod, id, numero_pedido, cliente_nome, data_evento, tipo, sum(q) as q
      from materiais group by 1,2,3,4,5,6
  )
  select prod,
         coalesce(sum(saldo) filter (where tipo = 'res'), 0),
         coalesce(sum(saldo) filter (where tipo = 'pre'), 0),
         jsonb_agg(jsonb_build_object('pedido_id', id, 'numero', numero_pedido, 'cliente', cliente_nome,
                                      'data_evento', data_evento, 'tipo', tipo, 'quantidade', saldo) order by data_evento)
    from (select pp.*,greatest(0,pp.q-coalesce((select sum(m.recebido-m.devolvido)
      from producao_materiais m join producao_etapas e on e.id=m.etapa_id join producao_itens t on t.id=e.producao_item_id
      where t.pedido_id=pp.id and m.produto_id=pp.prod),0)) saldo from por_pedido pp) conciliado group by prod
$$;
create function producao_atualizar(p_empresa uuid) returns void language plpgsql security definer set search_path=public as $$
declare p record;
begin
 if not eh_membro_empresa(p_empresa) or not (operacao_pode(p_empresa,'producao.ordens.visualizar') or operacao_pode(p_empresa,'estoque.almoxarifado.visualizar') or operacao_pode(p_empresa,'configuracoes.empresa.editar')) then raise exception 'Sem acesso' using errcode='42501';end if;
 for p in select id from separacoes_pedidos where empresa_id=p_empresa and
  ((coalesce(data_coleta,data_evento)>=current_date and status_comercial in ('pre_reserva','aprovado','enviado','finalizado'))
   or id in(select pedido_id from producao_itens where empresa_id=p_empresa and not cancelado)) order by id
 loop perform producao_sincronizar(p.id);end loop;
end $$;
revoke all on function producao_atualizar(uuid) from public,anon;
grant execute on function producao_atualizar(uuid) to authenticated;

create function producao_validar_cadastro() returns trigger language plpgsql set search_path=public as $$
declare e jsonb;g int:=0;total numeric:=0;
begin
 if jsonb_typeof(new.producao_etapas) is distinct from 'array' or jsonb_array_length(new.producao_etapas)>30 then raise exception 'Etapas inválidas';end if;
 for e in select * from jsonb_array_elements(new.producao_etapas) loop
  if length(trim(coalesce(e->>'nome','')))=0 or e->>'setor' not in ('pintura','forracao','personalizacao')
   or coalesce((e->>'horas')::numeric,0)<=0 or coalesce((e->>'grupo')::int,0)<g or coalesce((e->>'grupo')::int,0)<1 then
   raise exception 'Informe nome, setor, fase e horas positivas em cada etapa';end if;
  g:=(e->>'grupo')::int;total:=total+(e->>'horas')::numeric;
 end loop;
 if jsonb_array_length(new.producao_etapas)>0 and abs(total-coalesce(new.tempo,0))>0.001 then
  raise exception 'A soma das horas das etapas deve coincidir com o tempo por peça';end if;
 return new;
end $$;
create trigger producao_cadastro before insert or update of producao_etapas,tempo on personalizacoes
 for each row execute function producao_validar_cadastro();
revoke all on function producao_validar_cadastro() from public,anon,authenticated;
