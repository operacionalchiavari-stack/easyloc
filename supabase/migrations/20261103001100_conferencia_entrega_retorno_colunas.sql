-- Entrega: separar o que ficou no evento, desistencias e avarias, preservando os saldos do fluxo existente.
alter function public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text) rename to logistica_confirmacao_salvar_antes_colunas;
revoke all on function public.logistica_confirmacao_salvar_antes_colunas(uuid,text,text,jsonb,text,text) from public,anon,authenticated;
create function public.logistica_confirmacao_salvar(p_pedido uuid,p_etapa text,p_token text,p_itens jsonb,p_responsavel text,p_observacao text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;x jsonb;lista jsonb:='[]';b jsonb;novos jsonb;d numeric;a numeric;fica numeric;foto boolean;app jsonb;id_conf uuid;reg acervo_retornos;ev jsonb;t text;novo boolean;id_retorno uuid;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao para confirmar';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'Lista invalida';end if;
 app:=case when p_etapa='coleta' then operacao_danificados_app(p.id) else '{}'::jsonb end;
 for x in select * from jsonb_array_elements(p_itens) loop
  if p_etapa='entrega' and x ? 'entregue_local' then
   if jsonb_typeof(x->'entregue_local') is distinct from 'number' or jsonb_typeof(x->'desistencia') is distinct from 'number' or jsonb_typeof(x->'danificado') is distinct from 'number' then raise exception 'Informe entregue, desistencia e danificado';end if;
   fica:=(x->>'entregue_local')::numeric;d:=(x->>'desistencia')::numeric;a:=(x->>'danificado')::numeric;
   if least(fica,d,a)<0 or trunc(fica)<>fica or trunc(d)<>d or trunc(a)<>a then raise exception 'Quantidades invalidas';end if;
   x:=x||jsonb_build_object('entregue',fica+d+a,'voltou_antes',d+a);
  else d:=coalesce((x->>'voltou_antes')::numeric,0);a:=coalesce((x->>'danificado')::numeric,0);end if;
  if (p_etapa='entrega' and coalesce((x->>'voltou_antes')::numeric,0)>0) or(p_etapa='coleta' and a>0) then
   select exists(select 1 from logistica_evidencias where pedido_id=p.id and empresa_id=p.empresa_id and etapa=p_etapa and chave=x->>'chave') into foto;
   if not foto and not(p_etapa='coleta' and jsonb_array_length(coalesce(app->(x->>'chave')->'fotos','[]'))>0) then raise exception 'Adicione uma foto dos itens que voltam ou estao danificados.';end if;
  end if;
  lista:=lista||jsonb_build_array(x);
 end loop;
 b:=logistica_confirmacao_salvar_antes_colunas(p_pedido,p_etapa,p_token,lista,p_responsavel,p_observacao);
 if p_etapa='entrega' then
  select id,itens into id_conf,novos from logistica_confirmacoes where pedido_id=p.id and etapa='entrega' order by versao desc limit 1;
  select jsonb_agg(z||case when v_entrega ? 'entregue_local' then jsonb_build_object('entregue_local',v_entrega->'entregue_local','desistencia',v_entrega->'desistencia','danificado',v_entrega->'danificado') else '{}'::jsonb end)
  into novos from jsonb_array_elements(novos) z join jsonb_array_elements(lista) v_entrega on v_entrega->>'chave'=z->>'chave';
  update logistica_confirmacoes set itens=novos where id=id_conf;
  for x in select * from jsonb_array_elements(novos) loop
   foreach t in array array['avaria','revisao'] loop
   a:=coalesce((x->>case when t='avaria' then 'danificado' else 'desistencia' end)::numeric,0);
   select * into reg from acervo_retornos where pedido_id=p.id and chave='entrega:'||(x->>'chave') and tipo=t for update;
   if reg.id is not null and reg.quantidade<>a and (reg.estado not in('aguardando_retorno','triagem') or reg.os_id is not null) then raise exception 'A avaria deste item ja esta em tratamento na Gestao do acervo.';end if;
   novo:=reg.id is null;
   if a>0 then
    select coalesce(jsonb_agg(jsonb_build_object('path',path,'bucket','evidencias-operacionais','origem','entrega')),'[]') into ev from logistica_evidencias where pedido_id=p.id and etapa='entrega' and chave=x->>'chave';
    insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado,motivo,atualizado_por,origem,evidencias)
    values(p.empresa_id,p.id,'entrega:'||(x->>'chave'),(x->>'item_id')::uuid,t,a,'aguardando_retorno',coalesce(x->>'observacao','Dano na entrega'),auth.uid(),'triagem_retorno',ev)
    on conflict(pedido_id,chave,tipo) do update set quantidade=excluded.quantidade,evidencias=excluded.evidencias,motivo=excluded.motivo returning id into id_retorno;
    if novo then insert into acervo_historico(empresa_id,retorno_id,estado,motivo,usuario_id) values(p.empresa_id,id_retorno,'aguardando_retorno','Retorno antecipado registrado na entrega',auth.uid());end if;
   elsif reg.id is not null then
    delete from acervo_historico where retorno_id=reg.id;delete from acervo_retornos where id=reg.id;
   end if;
   end loop;
  end loop;
 elsif p_etapa='coleta' then
  for x in select * from jsonb_array_elements(lista) loop
   if coalesce((x->>'danificado')::numeric,0)<=0 then continue;end if;
   select coalesce(jsonb_agg(jsonb_build_object('path',path,'bucket','evidencias-operacionais','origem','coleta')),'[]') into ev from logistica_evidencias where pedido_id=p.id and etapa='coleta' and chave=x->>'chave';
   if jsonb_array_length(ev)>0 then
    update acervo_retornos ar set evidencias=(select jsonb_agg(distinct elemento) from jsonb_array_elements(coalesce(ar.evidencias,'[]')||ev) elemento)
     where ar.pedido_id=any(pedido_grupo(p.id)) and ar.chave=x->>'chave' and ar.tipo='avaria';
   end if;
  end loop;
 end if;
 return logistica_confirmacao_base(p.id,p_etapa);
end $$;
revoke all on function public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text) to authenticated;

-- A triagem de volta usa as quantidades digitadas tambem em pedidos originalmente separados por QR.
do $patch$ declare fonte text; begin
 select pg_get_functiondef('public.operacao_concluir_conferencia_sem_pagamento(uuid,text,boolean,jsonb,jsonb,jsonb)'::regprocedure) into fonte;
 if position('and not agrupado then' in fonte)=0 then raise exception 'Trecho de conferencia QR nao encontrado';end if;
 fonte:=replace(fonte,'and not agrupado then','and not agrupado and (p_etapa<>''retorno'' or p_quantidades is null) then');
 fonte:=replace(fonte,'case when agrupado then (select count(*) filter','case when agrupado or p_etapa=''retorno'' then (select count(*) filter');
 execute fonte;
end $patch$;

-- Quantidade de dano e contagem da volta sao confirmadas na mesma transacao.
create function public.operacao_concluir_retorno_avarias(p_pedido uuid,p_etapa text,p_aceitar_faltas boolean default false,p_quantidades jsonb default null,p_observacoes jsonb default null,p_primeira jsonb default null,p_danificados jsonb default '{}',p_fotos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos;r jsonb;c record;k text;q numeric;conhecida numeric;adicional numeric;atual numeric;f jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissao para confirmar';end if;
 if p_etapa<>'retorno' then raise exception 'Esta confirmacao e exclusiva da triagem de volta';end if;
 if p.operacao->'retorno'->>'concluido_em' is not null then raise exception 'Triagem ja confirmada. Atualize a tela.';end if;
 if jsonb_typeof(p_danificados) is distinct from 'object' then raise exception 'Quantidades de danos invalidas';end if;
 for k in select jsonb_object_keys(p_danificados) loop
  if not exists(select 1 from operacao_conferencia_pecas(p.id,true) pc where pc.chave=k) then raise exception 'Item danificado nao pertence ao pedido';end if;
  q:=(p_danificados->>k)::numeric;
  if q is null or q<0 or q<>trunc(q) or q>coalesce((p_quantidades->>k)::numeric,0) then raise exception 'Danificados devem fazer parte da quantidade que voltou';end if;
 end loop;
 r:=operacao_concluir_conferencia(p_pedido,p_etapa,p_aceitar_faltas,p_quantidades,p_observacoes,p_primeira);
 for c in select * from operacao_conferencia_pecas(p.id,true) loop
  if not(p_danificados ? c.chave) then continue;end if;
  q:=(p_danificados->>c.chave)::numeric;
  select coalesce(sum(quantidade),0) into conhecida from acervo_retornos where pedido_id=any(pedido_grupo(p.id)) and item_id=c.item_id and tipo='avaria' and chave<>'retorno:'||c.chave;
  adicional:=greatest(q-conhecida,0);
  select quantidade into atual from acervo_retornos where pedido_id=c.pedido_id and chave='retorno:'||c.chave and tipo='avaria';
  f:=coalesce(p_fotos->c.chave,'[]'::jsonb);
  if adicional<>coalesce(atual,0) or jsonb_array_length(f)>0 then
   perform operacao_avaria_retorno(p.id,c.chave,adicional,coalesce(nullif(p_observacoes->>c.chave,''),'Danificado identificado na triagem da volta'),f);
  end if;
 end loop;
 r:=r||jsonb_build_object('danificados',p_danificados);
 update separacoes_pedidos set operacao=jsonb_set(operacao,'{retorno}',r) where id=p.id;
 return r;
end $$;
revoke all on function public.operacao_concluir_retorno_avarias(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.operacao_concluir_retorno_avarias(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
