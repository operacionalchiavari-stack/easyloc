-- Reclamações vêm do histórico de feedbacks, sem exigir uma resposta manual por cliente.
create function public.complexidade_nome_cliente(p_nome text)
returns text language sql immutable set search_path=public as $$
 select regexp_replace(translate(lower(trim(coalesce(p_nome,''))),
 'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'\s+',' ','g');
$$;
revoke all on function complexidade_nome_cliente(text) from public,anon,authenticated;

create function public.complexidade_reclamacao_cliente(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare nome text; cadastro jsonb; cabecalho jsonb; col_cliente int; col_reclamacao int;
 registros int:=0; reclamacoes int:=0;
begin
 select nome_razao,complexidade->'reclamacao' into nome,cadastro
 from clientes_empresas where id=p_cliente and empresa_id=p_empresa;
 if not found then
  return jsonb_build_object('valor',null,'fonte','Cadastro do cliente','detalhe','Vincule o pedido a um cliente desta empresa');
 end if;
 if cadastro='true'::jsonb then
  return jsonb_build_object('valor',true,'fonte','Cadastro do cliente','detalhe','Reclamação operacional registrada no cadastro do cliente');
 end if;
 -- A fonte legada de feedback pertence exclusivamente à empresa dona dos sistemas.
 if p_empresa<>gs_empresa_dona() then
  return jsonb_build_object('valor',case when cadastro='false'::jsonb then false else null end,
   'fonte','Cadastro do cliente','detalhe','Histórico legado de feedbacks indisponível para esta empresa');
 end if;
 if complexidade_nome_cliente(nome)='' or (select count(*) from clientes_empresas
  where empresa_id=p_empresa and complexidade_nome_cliente(nome_razao)=complexidade_nome_cliente(nome))<>1 then
  return jsonb_build_object('valor',null,'fonte','Histórico de feedbacks','detalhe','Não foi possível identificar unicamente o cliente no histórico de feedbacks');
 end if;
 select valores into cabecalho from gs_linhas where planilha_id='1lh7ArXcVK11PxGrmbMhTA9plR_S8eiESi3s49ZrgYOA'
 and aba='Feedback' and linha=1;
 if cabecalho is not null then
  select (ordinality-1)::int into col_cliente from jsonb_array_elements_text(cabecalho) with ordinality
   where complexidade_nome_cliente(value)='cliente' limit 1;
  select (ordinality-1)::int into col_reclamacao from jsonb_array_elements_text(cabecalho) with ordinality
   where complexidade_nome_cliente(value) in ('houve ponto de melhoria','houve reclamacao')
   order by case when complexidade_nome_cliente(value)='houve ponto de melhoria' then 0 else 1 end limit 1;
  if col_cliente is null or col_reclamacao is null then
   return jsonb_build_object('valor',null,'fonte','Histórico de feedbacks','detalhe','Confira as colunas Cliente e Houve Ponto de Melhoria ou Houve Reclamação no histórico');
  end if;
  select count(*)::int,count(*) filter(where complexidade_nome_cliente(valores->>col_reclamacao)='sim')::int
  into registros,reclamacoes from gs_linhas
  where planilha_id='1lh7ArXcVK11PxGrmbMhTA9plR_S8eiESi3s49ZrgYOA' and aba='Feedback' and linha>1
   and complexidade_nome_cliente(valores->>col_cliente)=complexidade_nome_cliente(nome);
 elsif exists(select 1 from gs_linhas where planilha_id='1lh7ArXcVK11PxGrmbMhTA9plR_S8eiESi3s49ZrgYOA' and aba='Feedback' and linha>1) then
  return jsonb_build_object('valor',null,'fonte','Histórico de feedbacks','detalhe','Cabeçalho do histórico de feedbacks indisponível');
 end if;
 return jsonb_build_object('valor',reclamacoes>0,'fonte','Histórico de feedbacks',
  'detalhe',case when reclamacoes>0 then reclamacoes||' registro(s) de reclamação ou ponto de melhoria do cliente'
   else 'Nenhuma reclamação registrada para este cliente no histórico de feedbacks' end,
  'registros',registros,'reclamacoes',reclamacoes);
end $$;
revoke all on function complexidade_reclamacao_cliente(uuid,uuid) from public,anon,authenticated;

create or replace function public.complexidade_contexto(p_empresa uuid,p_pedido uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; r jsonb;
begin
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;
 if p.id is null then raise exception 'Pedido não encontrado nesta empresa';end if;
 select contexto||jsonb_build_object('congelado_em',congelado_em) into r from complexidade_fechamentos where pedido_id=p.id and empresa_id=p_empresa;
 if r is not null then return r;end if;
 return jsonb_build_object(
 'id',p.id,'empresa_id',p.empresa_id,'numero',p.numero_pedido,'cliente_nome',p.cliente_nome,'local_nome',p.local_nome,'data_evento',p.data_evento,
 'tipo_evento',p.tipo_evento,'status',p.status_comercial,'valor_locacao',coalesce(p.observacoes->'valores'->'locacao_bv','0'),
 'valor_montagem',coalesce(p.observacoes->'valores'->'montagem','0'),'valor_frete',coalesce(p.observacoes->'valores'->'frete','0'),
 'config',complexidade_config_padrao()||coalesce((select config from complexidade_config where empresa_id=p_empresa),'{}'),
 'excecoes',coalesce((select dados from complexidade_excecoes where pedido_id=p.id and empresa_id=p_empresa),'{}'),
 'local',(select jsonb_build_object('complexidade',complexidade,'tags',tags) from locais_empresas where id=p.local_id and empresa_id=p_empresa),
 'cliente',jsonb_build_object('complexidade',coalesce((select complexidade from clientes_empresas where id=p.cliente_id and empresa_id=p_empresa),'{}'),
 'reclamacao_historico',complexidade_reclamacao_cliente(p_empresa,p.cliente_id)),
 'pedidos_anteriores',case when p.cliente_id is null then null else
  (select count(*) from separacoes_pedidos a where a.empresa_id=p_empresa and a.cliente_id=p.cliente_id and a.id<>p.id
   and a.pedido_origem_id is null and a.status_comercial in ('aprovado','enviado','finalizado') and a.criado_em<p.criado_em) end,
 'confirmado_em',(select min(b.created_at) from fin_baixas b join fin_receber t on t.id=b.receber_id and t.empresa_id=b.empresa_id
  where t.empresa_id=p_empresa and t.pedido_id=p.id and b.estornado_em is null and b.valor>0),
 'carregamento',(select jsonb_build_object('data',data,'hora',hora) from operacao_etapas where empresa_id=p_empresa and pedido_id=p.id and tipo='carregamento' order by data,hora limit 1),
 'montagem',(select jsonb_build_object('data',data,'hora',hora) from operacao_etapas where empresa_id=p_empresa and pedido_id=p.id and tipo='montagem' order by data,hora limit 1),
 'caminhoes',(select count(distinct c.caminhao_id) from operacao_etapa_caminhoes c join operacao_etapas e on e.id=c.etapa_id
  where e.empresa_id=p_empresa and c.empresa_id=p_empresa and e.pedido_id=p.id and e.tipo='carregamento'),
 'itens',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'familia',i.familia,'categoria',i.categoria,'produto_base',i.produto_base,
   'complexidade',i.complexidade,'quantidade',s.quantidade_solicitada)) from separacoes_itens s join itens i on i.id=s.item_id and i.empresa_id=p_empresa where s.separacao_pedido_id=p.id),'[]'),
 'pecas',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'quantidade',c.esperado,'material',i.material,'complexidade',i.complexidade))
   from operacao_conferencia_pecas(p.id,false) c join itens i on i.id=c.item_id and i.empresa_id=p_empresa),'[]'),
 'servicos',coalesce((select jsonb_agg(jsonb_build_object('item_id',x->>'item_id','quantidade',x->'quantidade','tipo',pers.tipo,
   'item',jsonb_build_object('familia',i.familia,'categoria',i.categoria,'produto_base',i.produto_base,'complexidade',i.complexidade),
   'etapas',coalesce((select jsonb_agg(jsonb_build_object('setor',pe.setor,'revisao',pi.revisao))
    from producao_itens pi join producao_etapas pe on pe.producao_item_id=pi.id and pe.empresa_id=p_empresa and pe.estado<>'cancelada'
    where pi.pedido_id=p.id and pi.empresa_id=p_empresa and not pi.cancelado and pi.origem->>'personalizacao_id'=x->>'personalizacao_id'
     and pi.origem->>'item_id'=x->>'item_id' and pi.origem->>'ambiente_id'=a->>'id'),pers.producao_etapas)))
   from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) a
   cross join lateral jsonb_array_elements(coalesce(a->'itens','[]')) x
   left join personalizacoes pers on pers.id::text=x->>'personalizacao_id' and pers.empresa_id=p_empresa
   left join itens i on i.id::text=x->>'item_id' and i.empresa_id=p_empresa
   where nullif(x->>'personalizacao_id','') is not null),'[]')
 );
end $$;
revoke all on function complexidade_contexto(uuid,uuid) from public,anon,authenticated;
