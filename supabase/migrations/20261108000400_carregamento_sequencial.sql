-- Cada lote pertence a um unico caminhao. A conclusao do pedido e atomica com o ultimo lote.
begin;
create or replace function public.operacao_carregamento_lote(
 p_pedido uuid,p_caminhao uuid,p_itens jsonb,p_token text,
 p_observacoes jsonb default '{}'::jsonb,p_finalizar boolean default false,p_pendencia jsonb default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;b jsonb;obs jsonb;totais jsonb;completo boolean;registro jsonb;ids uuid[];
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 b:=operacao_carga_veiculo_base(p.id);
 if not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao para conferir';end if;
 if (b->>'concluido')::boolean then raise exception 'Carregamento ja concluido';end if;
 if p_token is distinct from b->>'token' then raise exception 'A carga mudou. Atualize antes de salvar';end if;
 perform pedido_pagamento_conferir(p.id,'carregamento');perform operacao_caminhao_conferir(p.id);
 if p_observacoes is null then p_observacoes:='{}';end if;
 if jsonb_typeof(p_observacoes)<>'object' then raise exception 'Observacoes invalidas';end if;
 if p_caminhao is not null then
  if exists(select 1 from jsonb_array_elements(b->'veiculos') c where c->>'caminhao_id'=p_caminhao::text) then raise exception 'Este caminhao ja teve o carregamento concluido. Selecione outro caminhao';end if;
  if not exists(select 1 from caminhoes where id=p_caminhao and empresa_id=p.empresa_id and status='ativo') then raise exception 'Caminhao inativo ou invalido';end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'Itens invalidos';end if;
  if not exists(select 1 from jsonb_array_elements(p_itens) i where jsonb_typeof(i->'quantidade')='number' and (i->>'quantidade')::numeric>0) then raise exception 'Informe os itens carregados neste caminhao';end if;
  b:=operacao_carga_veiculo_salvar(p.id,p_caminhao,p_itens,p_token);
 elsif not p_finalizar then raise exception 'Selecione um unico caminhao';end if;
 obs:=coalesce(p.operacao->'carregamento_observacoes','{}')||p_observacoes;
 update separacoes_pedidos set operacao=jsonb_set(coalesce(operacao,'{}'),'{carregamento_observacoes}',obs) where id=p.id;
 select coalesce(jsonb_object_agg(x->>'chave',coalesce((select sum((i->>'quantidade')::numeric) from jsonb_array_elements(b->'veiculos') c,jsonb_array_elements(c->'itens') i where i->>'chave'=x->>'chave'),0)),'{}') into totais from jsonb_array_elements(b->'itens') x;
 select not exists(select 1 from jsonb_array_elements(b->'itens') x where coalesce((totais->>(x->>'chave'))::numeric,0)<>(x->>'esperado')::numeric) into completo;
 if completo or p_finalizar then
  if jsonb_array_length(b->'veiculos')=0 then raise exception 'Nenhum caminhao carregado';end if;
  if not completo and p_pendencia is null then raise exception 'Informe o motivo e a programacao dos itens pendentes';end if;
  select array_agg((c->>'caminhao_id')::uuid) into ids from jsonb_array_elements(b->'veiculos') c;
  perform operacao_registrar_caminhoes(p.id,ids);
  if completo then registro:=operacao_concluir_conferencia(p.id,'carregamento',false,totais,obs);
  else registro:=operacao_concluir_com_pendencia(p.id,'carregamento',true,totais,obs,p_pendencia);end if;
  b:=operacao_carga_veiculo_base(p.id);
 end if;
 select * into p from separacoes_pedidos where id=p.id;
 return jsonb_build_object('base',b,'operacao',p.operacao,'registro',registro);
end $$;
revoke all on function public.operacao_carregamento_lote(uuid,uuid,jsonb,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.operacao_carregamento_lote(uuid,uuid,jsonb,text,jsonb,boolean,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
