-- (2026-11-14) Matriz de complexidade 100% automática (pedido do usuário: "quero que de fato seja automático").
-- O contexto passa a trazer a data/horário de entrega (estimativa do carregamento antes do cronograma), a data em que o
-- pedido virou Reservado (confirmação) e, sem itens de separação, os itens do projeto do pedido. Partiu da definição que
-- estava no banco (inclui custos e complexidade da personalização).
CREATE OR REPLACE FUNCTION public.complexidade_contexto(p_empresa uuid, p_pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p separacoes_pedidos; r jsonb;
begin
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;
 if p.id is null then raise exception 'Pedido não encontrado nesta empresa';end if;
 select contexto||jsonb_build_object('congelado_em',congelado_em) into r from complexidade_fechamentos where pedido_id=p.id and empresa_id=p_empresa;
 if r is not null then return r;end if;
 return jsonb_build_object(
 'id',p.id,'empresa_id',p.empresa_id,'numero',p.numero_pedido,'cliente_nome',p.cliente_nome,'local_nome',p.local_nome,'data_evento',p.data_evento,
 'tipo_evento',p.tipo_evento,'data_entrega',p.data_entrega,'hora_entrega',nullif(p.observacoes->>'horario_entrega',''),
 'reservado_em',case when p.status_comercial in ('aprovado','enviado','finalizado') then coalesce((select min(h.criado_em) from comercial_historico h where h.empresa_id=p_empresa and h.pedido_id=p.id and h.descricao like 'Mudou a situação:%→ Reservado'),p.criado_em) end,
'status',p.status_comercial,'valor_locacao',coalesce(p.observacoes->'valores'->'locacao_bv','0'),
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
 -- Sem itens de separação (orçamento, pré-reserva sem itens): usa os itens do projeto do pedido (nov/2026).
 'itens',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'familia',i.familia,'categoria',i.categoria,'produto_base',i.produto_base,
   'complexidade',i.complexidade,'quantidade',s.quantidade_solicitada)) from separacoes_itens s join itens i on i.id=s.item_id and i.empresa_id=p_empresa where s.separacao_pedido_id=p.id),
   (select jsonb_agg(jsonb_build_object('item_id',i.id,'familia',i.familia,'categoria',i.categoria,'produto_base',i.produto_base,
   'complexidade',i.complexidade,'quantidade',coalesce(nullif(x->>'quantidade','')::numeric,0)))
    from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) a
    cross join lateral jsonb_array_elements(coalesce(a->'itens','[]')) x join itens i on i.id::text=x->>'item_id' and i.empresa_id=p_empresa),'[]'),
 'pecas',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'quantidade',c.esperado,'material',i.material,'complexidade',i.complexidade))
   from operacao_conferencia_pecas(p.id,false) c join itens i on i.id=c.item_id and i.empresa_id=p_empresa),
   (select jsonb_agg(jsonb_build_object('item_id',i.id,'quantidade',coalesce(nullif(x->>'quantidade','')::numeric,0),'material',i.material,'complexidade',i.complexidade))
    from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) a
    cross join lateral jsonb_array_elements(coalesce(a->'itens','[]')) x join itens i on i.id::text=x->>'item_id' and i.empresa_id=p_empresa),'[]'),
 'custos_personalizacao',(select valor->'custos' from almoxarifado_configuracoes where empresa_id=p_empresa and chave='cadastros_operacao'),'servicos',coalesce((select jsonb_agg(jsonb_build_object('item_id',x->>'item_id','quantidade',x->'quantidade','tipo',pers.tipo,'personalizacao_complexidade',pers.complexidade,
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
end $function$;
revoke all on function public.complexidade_contexto(uuid,uuid) from public,anon,authenticated;
