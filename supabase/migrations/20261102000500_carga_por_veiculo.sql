begin;
create or replace function public.operacao_carga_veiculo_base(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p separacoes_pedidos; itens jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into itens from operacao_conferencia_pecas(p.id) x;
 return jsonb_build_object('itens',itens,'veiculos',coalesce(p.operacao->'carga_por_veiculo','[]'),
  'token',md5(itens::text||coalesce((p.operacao->'carga_por_veiculo')::text,'')),
  'concluido',p.operacao->'carregamento'->>'concluido_em' is not null);
end $$;
create or replace function public.operacao_carga_veiculo_salvar(p_pedido uuid,p_caminhao uuid,p_itens jsonb,p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; b jsonb; cam caminhoes; v jsonb; x jsonb; outros jsonb; total numeric; lista jsonb:='[]'; q numeric;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao para conferir'; end if;
 if p.encerrado_operacional_em is not null or coalesce(p.status_comercial,'') not in ('aprovado','enviado') then raise exception 'Pedido nao esta liberado'; end if;
 perform pedido_pagamento_conferir(p.id,'carregamento');
 perform operacao_caminhao_conferir(p.id);
 b:=operacao_carga_veiculo_base(p.id);
 if (b->>'concluido')::boolean then raise exception 'Carregamento ja concluido'; end if;
 if p_token is distinct from b->>'token' then raise exception 'A carga mudou. Atualize antes de salvar'; end if;
 select * into cam from caminhoes where id=p_caminhao and empresa_id=p.empresa_id;
 if cam.id is null then raise exception 'Caminhao invalido'; end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)<>jsonb_array_length(b->'itens')
  or (select count(distinct t->>'chave') from jsonb_array_elements(p_itens) t)<>jsonb_array_length(p_itens) then raise exception 'Confira todos os itens uma unica vez'; end if;
 select coalesce(jsonb_agg(t),'[]') into outros from jsonb_array_elements(b->'veiculos') t where t->>'caminhao_id'<>p_caminhao::text;
 for x in select * from jsonb_array_elements(b->'itens') loop
  select t into v from jsonb_array_elements(p_itens) t where t->>'chave'=x->>'chave';
  if v is null or jsonb_typeof(v->'quantidade') is distinct from 'number' then raise exception 'Quantidade ausente'; end if;
  q:=(v->>'quantidade')::numeric;
  if q::text in ('NaN','Infinity','-Infinity') or q<0 or q<>trunc(q) then raise exception 'Quantidade invalida'; end if;
  select coalesce(sum((i->>'quantidade')::numeric),0) into total from jsonb_array_elements(outros) c,
   jsonb_array_elements(c->'itens') i where i->>'chave'=x->>'chave';
  if total+q>(x->>'esperado')::numeric then raise exception 'A soma nos caminhoes excede o pedido: %',x->>'nome'; end if;
  lista:=lista||jsonb_build_array(jsonb_build_object('chave',x->>'chave','nome',x->>'nome','quantidade',q));
 end loop;
 if exists(select 1 from jsonb_array_elements(lista) i where (i->>'quantidade')::numeric>0) then
  outros:=outros||jsonb_build_array(jsonb_build_object('caminhao_id',cam.id,'codigo',cam.codigo,'placa',cam.placa,'itens',lista,'por',auth.uid(),'em',now()));
 end if;
 update separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),'{carga_por_veiculo}',outros),atualizado_em=now() where id=p.id;
 return operacao_carga_veiculo_base(p.id);
end $$;
create or replace function public.operacao_carga_distribuicao_conferir(p_pedido uuid,p_quantidades jsonb default null) returns void
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; x record; distribuido numeric; conferido numeric;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if jsonb_array_length(coalesce(p.operacao->'carga_por_veiculo','[]'))=0 then return; end if;
 for x in select * from operacao_conferencia_pecas(p.id) loop
  select coalesce(sum((i->>'quantidade')::numeric),0) into distribuido
   from jsonb_array_elements(p.operacao->'carga_por_veiculo') c,jsonb_array_elements(c->'itens') i where i->>'chave'=x.chave;
  if p_quantidades is not null then conferido:=coalesce((p_quantidades->>x.chave)::numeric,0);
  else select count(*) into conferido from separacoes_etiquetas where separacao_pedido_id=p.id and separacao_item_id::text||'|'||item_id::text=x.chave and lida_carregamento_em is not null; end if;
  if distribuido<>conferido then raise exception 'Revise a distribuicao por caminhao de %. Distribuido: %, conferido: %',x.nome,distribuido,conferido; end if;
 end loop;
end $$;
revoke all on function public.operacao_carga_distribuicao_conferir(uuid,jsonb) from public,anon,authenticated;
do $$ declare d text; novo text;
begin
 select pg_get_functiondef('public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb,jsonb)'::regprocedure) into d;
 if position('operacao_carga_distribuicao_conferir' in d)=0 then
  novo:=replace(d,'perform public.operacao_caminhao_conferir(p_pedido);','perform public.operacao_caminhao_conferir(p_pedido); perform public.operacao_carga_distribuicao_conferir(p_pedido,p_quantidades);');
  if novo=d then raise exception 'Conclusao de carga inesperada'; end if; execute novo;
 end if;
end $$;
revoke all on function public.operacao_carga_veiculo_base(uuid),public.operacao_carga_veiculo_salvar(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.operacao_carga_veiculo_base(uuid),public.operacao_carga_veiculo_salvar(uuid,uuid,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
