begin;
create or replace function public.operacao_caminhoes_volta_programados(p_pedidos uuid[])
returns table(pedido_id uuid,caminhao_id uuid,codigo text,placa text,modelo text,tipo text,foto_url text,etapas text[])
language sql stable security definer set search_path=public as $$
 select e.pedido_id,c.id,c.codigo,c.placa,c.modelo,c.tipo,c.foto_url,array_agg(distinct e.tipo order by e.tipo)
 from operacao_etapas e join operacao_etapa_caminhoes ec on ec.etapa_id=e.id join caminhoes c on c.id=ec.caminhao_id
 where e.pedido_id=any(p_pedidos) and e.tipo in ('desmontagem','descarregamento') and eh_membro_empresa(e.empresa_id)
 group by e.pedido_id,c.id,c.codigo,c.placa,c.modelo,c.tipo,c.foto_url order by e.pedido_id,c.codigo,c.placa;
$$;
create or replace function public.operacao_descarga_veiculo_base(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p separacoes_pedidos;itens jsonb;base jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso';end if;
 base:=pedido_grupo_carregamento(p.id);
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('esperado',coalesce((select (i->>'conferido')::numeric from jsonb_array_elements(base) i where i->>'chave'=x.chave limit 1),
 case when base is not null then 0 when exists(select 1 from separacoes_etiquetas e where e.separacao_item_id::text||'|'||e.item_id::text=x.chave) then (select count(*) from separacoes_etiquetas e where e.separacao_item_id::text||'|'||e.item_id::text=x.chave and e.lida_carregamento_em is not null) else x.esperado end)) order by x.chave),'[]') into itens from operacao_conferencia_pecas(p.id,true) x;
 return jsonb_build_object('itens',itens,'veiculos',coalesce(p.operacao->'descarga_por_veiculo','[]'),
 'token',md5(itens::text||coalesce((p.operacao->'descarga_por_veiculo')::text,'')), 'concluido',p.operacao->'descarregamento'->>'concluido_em' is not null);
end $$;
create or replace function public.operacao_descarregamento_lote(p_pedido uuid,p_caminhao uuid,p_itens jsonb,p_token text,p_observacoes jsonb default '{}',p_finalizar boolean default false,p_pendencia jsonb default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;b jsonb;cam caminhoes;x jsonb;v jsonb;q numeric;lista jsonb:='[]';veiculos jsonb;totais jsonb;obs jsonb;registro jsonb;completo boolean;lidas numeric;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 b:=operacao_descarga_veiculo_base(p.id);
 if not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao';end if;
 perform operacao_validar_etapa(p,'descarregamento');
 if (b->>'concluido')::boolean then raise exception 'Descarregamento ja concluido';end if;
 if p_token is distinct from b->>'token' then raise exception 'A descarga mudou. Atualize antes de salvar';end if;
 if jsonb_typeof(p_observacoes) is distinct from 'object' then raise exception 'Observacoes invalidas';end if;
 veiculos:=b->'veiculos';
 if p_caminhao is not null then
  select * into cam from caminhoes where id=p_caminhao and empresa_id=p.empresa_id and status='ativo';
  if cam.id is null then raise exception 'Caminhao invalido';end if;
  if exists(select 1 from jsonb_array_elements(veiculos) c where c->>'caminhao_id'=p_caminhao::text) then raise exception 'Este caminhao ja teve o descarregamento concluido';end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)<>jsonb_array_length(b->'itens') or (select count(distinct i->>'chave') from jsonb_array_elements(p_itens) i)<>jsonb_array_length(p_itens) then raise exception 'Itens invalidos';end if;
  for x in select * from jsonb_array_elements(b->'itens') loop
   select i into v from jsonb_array_elements(p_itens) i where i->>'chave'=x->>'chave';
   if v is null or jsonb_typeof(v->'quantidade') is distinct from 'number' then raise exception 'Quantidade ausente';end if;
   q:=(v->>'quantidade')::numeric;
   if q::text in ('NaN','Infinity','-Infinity') or q<0 or q<>trunc(q) then raise exception 'Quantidade invalida';end if;
   if coalesce(p.modo_separacao,'qr')='qr' and exists(select 1 from separacoes_etiquetas where separacao_pedido_id=p.id) and cardinality(pedido_grupo(p.id))=1 then
    select count(*) into lidas from separacoes_etiquetas e where e.separacao_item_id::text||'|'||e.item_id::text=x->>'chave' and e.empresa_id=p.empresa_id and e.lida_descarregamento_em is not null;
    if q+coalesce((select sum((i->>'quantidade')::numeric) from jsonb_array_elements(veiculos) c,jsonb_array_elements(c->'itens') i where i->>'chave'=x->>'chave'),0)>lidas then raise exception 'Bipe os itens deste caminhao antes de concluir';end if;
   end if;
   lista:=lista||jsonb_build_array(jsonb_build_object('chave',x->>'chave','nome',x->>'nome','quantidade',q));
  end loop;
  if not exists(select 1 from jsonb_array_elements(lista) i where (i->>'quantidade')::numeric>0) then raise exception 'Informe os itens descarregados neste caminhao';end if;
  veiculos:=veiculos||jsonb_build_array(jsonb_build_object('caminhao_id',cam.id,'codigo',cam.codigo,'placa',cam.placa,'itens',lista,'por',auth.uid(),'em',now()));
 elsif not p_finalizar then raise exception 'Selecione um unico caminhao';end if;
 obs:=coalesce(p.operacao->'descarregamento_observacoes','{}')||p_observacoes;
 update separacoes_pedidos set operacao=coalesce(operacao,'{}')||jsonb_build_object('descarga_por_veiculo',veiculos,'descarregamento_observacoes',obs),atualizado_em=now() where id=p.id;
 select coalesce(jsonb_object_agg(z->>'chave',coalesce((select sum((i->>'quantidade')::numeric) from jsonb_array_elements(veiculos) c,jsonb_array_elements(c->'itens') i where i->>'chave'=z->>'chave'),0)),'{}') into totais from jsonb_array_elements(b->'itens') z;
 select not exists(select 1 from jsonb_array_elements(b->'itens') z where coalesce((totais->>(z->>'chave'))::numeric,0)<(z->>'esperado')::numeric) into completo;
 if completo or p_finalizar then
  if jsonb_array_length(veiculos)=0 then raise exception 'Nenhum caminhao descarregado';end if;
  registro:=operacao_concluir_conferencia(p.id,'descarregamento',p_finalizar,totais,obs);
 end if;
 select * into p from separacoes_pedidos where id=p.id;
 return jsonb_build_object('base',operacao_descarga_veiculo_base(p.id),'operacao',p.operacao,'registro',registro);
end $$;
revoke all on function public.operacao_caminhoes_volta_programados(uuid[]),public.operacao_descarga_veiculo_base(uuid),public.operacao_descarregamento_lote(uuid,uuid,jsonb,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.operacao_caminhoes_volta_programados(uuid[]),public.operacao_descarga_veiculo_base(uuid),public.operacao_descarregamento_lote(uuid,uuid,jsonb,text,jsonb,boolean,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
