create or replace function public.operacao_atualizar_separacao(p_item uuid,p_dados jsonb,p_quantidade_anterior numeric,p_componentes_anteriores jsonb default '{}',p_etiqueta uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare i public.separacoes_itens;p public.separacoes_pedidos;q numeric;limite integer;c record;comp jsonb;
begin
  select * into strict i from public.separacoes_itens where id=p_item;
  select * into strict p from public.separacoes_pedidos where id=i.separacao_pedido_id for update;
  if not public.eh_membro_empresa(p.empresa_id) or not public.funcionario_tabela_permitida(p.empresa_id,'separacoes_itens','editar') then raise exception 'Sem permissão para separar'; end if;
  select * into strict i from public.separacoes_itens where id=p_item for update;
  if p.status in ('separado','separado_com_divergencia') or coalesce(p.status_operacional,'')<>'' then raise exception 'Separação finalizada'; end if;
  if p.reducao_liberada_em is not null then raise exception 'Separação pausada para revisão do comercial'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'Aguarde a aprovação comercial'; end if;
  select coalesce(separacao_dias_antes_evento,2) into limite from public.empresa_logistica_regras where empresa_id=p.empresa_id;
  if coalesce(p.data_entrega,p.data_evento)>(now() at time zone 'America/Sao_Paulo')::date+coalesce(limite,2) then raise exception 'Separação ainda fora da janela de liberação'; end if;
  if i.quantidade_separada is distinct from p_quantidade_anterior or coalesce(i.componentes,'{}') is distinct from coalesce(p_componentes_anteriores,'{}') then raise exception 'Outro aparelho atualizou este item. Atualize a lista e tente novamente'; end if;
  q:=(p_dados->>'quantidade_separada')::numeric;
  if q is null or q<0 or q>i.quantidade_solicitada then raise exception 'Quantidade separada inválida'; end if;
  comp:=coalesce(p_dados->'componentes',i.componentes);
  if p_dados ? 'componentes' then
    for c in select x.key,(x.value->>'separado')::numeric depois,coalesce((i.componentes->x.key->>'separado')::numeric,0) antes from jsonb_each(comp) x loop
      if c.depois<c.antes then
        update public.separacoes_etiquetas set lida_separacao_em=null where id in (
          select id from public.separacoes_etiquetas where separacao_item_id=i.id and item_id=c.key::uuid and lida_separacao_em is not null order by sequencia desc limit (c.antes-c.depois)::integer
        );
        comp:=jsonb_set(comp,array[c.key,'patrimonios'],coalesce((select jsonb_agg(v.codigo order by v.pos) from jsonb_array_elements(coalesce(comp->c.key->'patrimonios','[]')) with ordinality v(codigo,pos) where v.pos<=c.depois),'[]'));
      end if;
    end loop;
  elsif q<i.quantidade_separada then
    update public.separacoes_etiquetas set lida_separacao_em=null where id in (
      select id from public.separacoes_etiquetas where separacao_item_id=i.id and lida_separacao_em is not null order by sequencia desc limit (i.quantidade_separada-q)::integer
    );
  end if;
  if p_etiqueta is not null then
    if not exists(select 1 from public.separacoes_etiquetas where id=p_etiqueta and separacao_item_id=i.id and lida_separacao_em is null for update) then raise exception 'Etiqueta já lida ou de outro item'; end if;
    update public.separacoes_etiquetas set lida_separacao_em=now() where id=p_etiqueta;
  end if;
  update public.separacoes_itens set quantidade_separada=q,
    componentes=comp,
    patrimonios_lidos=case when p_dados ? 'patrimonios_lidos' then array(select jsonb_array_elements_text(p_dados->'patrimonios_lidos')) when q<i.quantidade_separada then i.patrimonios_lidos[1:q::integer] else patrimonios_lidos end,
    status=coalesce(p_dados->>'status',status),atualizado_por=auth.uid(),atualizado_em=now() where id=i.id;
  with vinculos as (
    select i.item_id item_id,v.codigo,v.posicao from jsonb_array_elements_text(coalesce(p_dados->'patrimonios_lidos','[]')) with ordinality v(codigo,posicao)
    union all
    select componente.key::uuid,v.codigo,v.posicao from jsonb_each(coalesce(p_dados->'componentes','{}')) componente
      cross join lateral jsonb_array_elements_text(coalesce(componente.value->'patrimonios','[]')) with ordinality v(codigo,posicao)
  ) update public.separacoes_etiquetas e set patrimonio_codigo=v.codigo from vinculos v
    where e.separacao_item_id=i.id and e.item_id=v.item_id and e.sequencia=v.posicao and e.patrimonio_codigo is null;
  update public.separacoes_pedidos set status='em_separacao',atualizado_em=now() where id=p.id;
end $$;
revoke all on function public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid) from public,anon;
grant execute on function public.operacao_atualizar_separacao(uuid,jsonb,numeric,jsonb,uuid) to authenticated;
