begin;

-- Registros de campo são separados da bipagem e não alteram o estoque nem a lista comercial.
create table public.logistica_confirmacoes (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 pedido_id uuid not null references public.separacoes_pedidos(id),
 etapa text not null check(etapa in ('entrega','coleta')),
 versao integer not null,
 criado_em timestamptz not null default now(),
 criado_por uuid not null,
 responsavel text not null,
 observacao text not null default '',
 itens jsonb not null check(jsonb_typeof(itens)='array'),
 unique(pedido_id,etapa,versao)
);
alter table public.logistica_confirmacoes enable row level security;
create policy logistica_confirmacoes_ler on public.logistica_confirmacoes for select to authenticated
 using(public.eh_membro_empresa(empresa_id) and public.funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','select'));
grant select on public.logistica_confirmacoes to authenticated;
revoke insert,update,delete on public.logistica_confirmacoes from anon,authenticated;

create function public.logistica_confirmacao_base(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos; entrega logistica_confirmacoes; atual logistica_confirmacoes; itens jsonb; hist jsonb; carregamento jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso ao pedido';end if;
 if p_etapa is null or p_etapa not in ('entrega','coleta') then raise exception 'Etapa inválida';end if;
 select * into entrega from logistica_confirmacoes where pedido_id=p.id and etapa='entrega' order by versao desc limit 1;
 select * into atual from logistica_confirmacoes where pedido_id=p.id and etapa=p_etapa order by versao desc limit 1;
 carregamento:=coalesce(p.operacao->'carregamento','{}');
 if p_etapa='coleta' then
  select coalesce(jsonb_agg((x-'retirado_lista'-'observacao'-'nao_entregue') || jsonb_build_object('previsto',greatest(0,(x->>'entregue')::numeric-(x->>'voltou_antes')::numeric)) order by x->>'nome'),'[]') into itens
  from jsonb_array_elements(coalesce(entrega.itens,'[]')) x;
 else
  -- A união mantém itens do carregamento e da confirmação anterior mesmo se saírem da lista atual.
  with pecas as(select * from operacao_conferencia_pecas(p.id)),
  carga as(select x from jsonb_array_elements(coalesce(carregamento->'itens','[]')) x),
  anteriores as(select x from jsonb_array_elements(coalesce(entrega.itens,'[]')) x),
  etiquetas as(select separacao_item_id::text||'|'||item_id::text chave,count(*) previsto,count(*) filter(where lida_carregamento_em is not null) carregado from separacoes_etiquetas where separacao_pedido_id=p.id and empresa_id=p.empresa_id group by 1),
  chaves as(select chave from pecas union select x->>'chave' from carga union select x->>'chave' from anteriores union select chave from etiquetas)
  select coalesce(jsonb_agg(jsonb_build_object('chave',k.chave,'item_id',coalesce(pc.item_id::text,a.x->>'item_id',split_part(k.chave,'|',2)),
   'nome',coalesce(pc.nome,a.x->>'nome',c.x->>'item','Item'),
   'previsto',greatest(coalesce(pc.esperado,0),coalesce((c.x->>'esperado')::numeric,0),coalesce(e.previsto,0),coalesce((a.x->>'previsto')::numeric,0)),
   'carregado',coalesce((c.x->>'conferido')::numeric,e.carregado), 'fora_lista',pc.chave is null) order by coalesce(pc.nome,a.x->>'nome',c.x->>'item','Item')),'[]') into itens
  from chaves k left join pecas pc on pc.chave=k.chave left join carga c on c.x->>'chave'=k.chave left join anteriores a on a.x->>'chave'=k.chave left join etiquetas e on e.chave=k.chave;
 end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.versao desc),'[]') into hist from logistica_confirmacoes c where pedido_id=p.id and etapa=p_etapa;
 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'cliente_nome',p.cliente_nome,'local_nome',p.local_nome,'data_entrega',p.data_entrega,'data_coleta',p.data_coleta),
  'itens',itens,'atual',case when atual.id is null then null else to_jsonb(atual) end,'historico',hist,
  'token',md5(itens::text||carregamento::text||coalesce(entrega.id::text,'')||coalesce(atual.id::text,'')),
  'bloqueio',case when p.encerrado_operacional_em is not null then 'Operação encerrada.'
    when p.status='cancelado' or coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then 'O pedido precisa estar aprovado.'
    when p_etapa='coleta' and entrega.id is null then 'Confirme a entrega antes de registrar a coleta.'
    when p_etapa='entrega' and exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='coleta') then 'A coleta já foi confirmada. Consulte o histórico da entrega.'
    when carregamento->>'concluido_em' is null then 'Conclua o carregamento na Expedição antes de confirmar.' end);
end $$;

create function public.logistica_confirmacao_salvar(p_pedido uuid,p_etapa text,p_token text,p_itens jsonb,p_responsavel text,p_observacao text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p separacoes_pedidos; b jsonb; x jsonb; v jsonb; resultado jsonb:='[]'; q numeric; entregue numeric; antes numeric; retirado numeric; coletado numeric; dano numeric; obs text; versao_nova int;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','editar') then raise exception 'Sem permissão para confirmar';end if;
 b:=logistica_confirmacao_base(p.id,p_etapa);
 if b->>'bloqueio' is not null then raise exception '%',b->>'bloqueio';end if;
 if p_token is distinct from b->>'token' then raise exception 'A lista mudou ou outra pessoa confirmou. Atualize a tela e revise os itens.';end if;
 if length(trim(coalesce(p_responsavel,''))) not between 2 and 150 then raise exception 'Informe o responsável pela entrega ou coleta';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'Lista de itens inválida';end if;
 if jsonb_array_length(b->'itens')=0 or jsonb_array_length(p_itens)<>jsonb_array_length(b->'itens') or (select count(distinct t->>'chave') from jsonb_array_elements(p_itens) t)<>jsonb_array_length(p_itens) then raise exception 'Preencha todos os itens uma única vez';end if;
 for x in select * from jsonb_array_elements(b->'itens') loop
  select t into v from jsonb_array_elements(p_itens) t where t->>'chave'=x->>'chave';
  if v is null then raise exception 'Item ausente: %',x->>'nome';end if;
  q:=(x->>'previsto')::numeric;obs:=trim(coalesce(v->>'observacao',''));
  if length(obs)>2000 then raise exception 'Observação do item muito longa';end if;
  if p_etapa='entrega' then
   if jsonb_typeof(v->'entregue') is distinct from 'number' or jsonb_typeof(v->'voltou_antes') is distinct from 'number' or jsonb_typeof(v->'retirado_lista') is distinct from 'number' then raise exception 'Informe todas as quantidades';end if;
   entregue:=(v->>'entregue')::numeric;antes:=(v->>'voltou_antes')::numeric;retirado:=(v->>'retirado_lista')::numeric;
   if least(entregue,antes,retirado)<0 or entregue+retirado>q or antes>entregue or trunc(entregue)<>entregue or trunc(antes)<>antes or trunc(retirado)<>retirado then raise exception 'Quantidades inválidas para %',x->>'nome';end if;
   if (entregue<q or antes>0 or retirado>0) and length(obs)<3 then raise exception 'Explique a diferença ou o retorno antecipado de %',x->>'nome';end if;
   resultado:=resultado||jsonb_build_array(x||jsonb_build_object('entregue',entregue,'voltou_antes',antes,'retirado_lista',retirado,'nao_entregue',q-entregue-retirado,'observacao',obs));
  else
   if jsonb_typeof(v->'coletado') is distinct from 'number' or jsonb_typeof(v->'danificado') is distinct from 'number' or jsonb_typeof(v->'retirado_lista') is distinct from 'number' then raise exception 'Informe todas as quantidades';end if;
   coletado:=(v->>'coletado')::numeric;dano:=(v->>'danificado')::numeric;retirado:=(v->>'retirado_lista')::numeric;
   if least(coletado,dano,retirado)<0 or coletado+retirado>q or dano>coletado or trunc(coletado)<>coletado or trunc(dano)<>dano or trunc(retirado)<>retirado then raise exception 'Quantidades inválidas para %',x->>'nome';end if;
   if (coletado<q or dano>0 or retirado>0) and length(obs)<3 then raise exception 'Descreva o dano, a falta ou a retirada de %',x->>'nome';end if;
   resultado:=resultado||jsonb_build_array(x||jsonb_build_object('coletado',coletado,'danificado',dano,'retirado_lista',retirado,'nao_coletado',q-coletado-retirado,'observacao',obs));
  end if;
 end loop;
 select coalesce(max(versao),0)+1 into versao_nova from logistica_confirmacoes where pedido_id=p.id and etapa=p_etapa;
 insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,criado_por,responsavel,observacao,itens)
 values(p.empresa_id,p.id,p_etapa,versao_nova,auth.uid(),trim(p_responsavel),left(coalesce(p_observacao,''),4000),resultado);
 return logistica_confirmacao_base(p.id,p_etapa);
end $$;
revoke all on function public.logistica_confirmacao_base(uuid,text),public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.logistica_confirmacao_base(uuid,text),public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
