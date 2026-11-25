-- Uber: pedido obrigatorio ou solicitacao interna criada pelo supervisor.
alter table public.uber_vagas alter column etapa_id drop not null;
alter table public.uber_vagas
  add column if not exists solicitacao_interna boolean not null default false,
  add column if not exists solicitacao_motivo text,
  add column if not exists solicitacao_motorista_id uuid references public.uber_motoristas(id),
  add column if not exists solicitacao_autorizada_em timestamptz;

create or replace function public.uber_vinculo_validar(p_empresa uuid,p_vaga uuid,p_motorista uuid default null)
returns void language plpgsql stable security definer set search_path=public as $$
declare v uber_vagas;
begin
  select * into v from uber_vagas where id=p_vaga and empresa_id=p_empresa;
  if v.id is null then raise exception 'Solicitação de Uber não encontrada nesta empresa.'; end if;
  if v.solicitacao_interna then
    if v.pedido_id is not null or v.etapa_id is not null or length(btrim(coalesce(v.solicitacao_motivo,'')))<3
      or v.criado_por is null or v.solicitacao_autorizada_em is null or v.solicitacao_motorista_id is null then
      raise exception 'A solicitação interna precisa ser cadastrada pelo supervisor na Logística.';
    end if;
    if p_motorista is not null and p_motorista is distinct from v.solicitacao_motorista_id then
      raise exception 'Esta solicitação interna foi liberada para outro motorista.';
    end if;
  elsif v.pedido_id is null or not exists(select 1 from separacoes_pedidos p where p.id=v.pedido_id and p.empresa_id=p_empresa) then
    raise exception 'Vincule a corrida a um pedido ou solicite ao supervisor uma solicitação interna na Logística.';
  end if;
  if v.etapa_id is not null and not exists(select 1 from operacao_etapas e where e.id=v.etapa_id and e.empresa_id=p_empresa and e.pedido_id=v.pedido_id) then
    raise exception 'A etapa da corrida não corresponde ao pedido.';
  end if;
  if p_motorista is not null and not exists(select 1 from uber_motoristas m where m.id=p_motorista and m.empresa_id=p_empresa) then
    raise exception 'Motorista não pertence à empresa.';
  end if;
end $$;
revoke all on function public.uber_vinculo_validar(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.uber_vaga_vinculo_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare ped uuid;
begin
  if new.solicitacao_interna then
    perform logistica_servicos_autorizar(new.empresa_id,true);
    if new.pedido_id is not null or new.etapa_id is not null or length(btrim(coalesce(new.solicitacao_motivo,'')))<3 then
      raise exception 'Informe o motivo da solicitação interna; ela não deve usar um pedido ou etapa.';
    end if;
    if not exists(select 1 from uber_motoristas m where m.id=new.solicitacao_motorista_id and m.empresa_id=new.empresa_id and m.status='ativo') then
      raise exception 'Escolha o motorista ativo para a solicitação interna.';
    end if;
    if new.criado_por is null or new.solicitacao_autorizada_em is null then
      raise exception 'A solicitação interna precisa ser autorizada pelo supervisor na Logística.';
    end if;
  else
    if new.etapa_id is not null then
      select e.pedido_id into ped from operacao_etapas e where e.id=new.etapa_id and e.empresa_id=new.empresa_id;
      if ped is null then raise exception 'A etapa da corrida precisa estar vinculada a um pedido.'; end if;
      if new.pedido_id is null then new.pedido_id:=ped; end if;
      if new.pedido_id is distinct from ped then raise exception 'A etapa da corrida não corresponde ao pedido.'; end if;
    end if;
    if new.pedido_id is null or not exists(select 1 from separacoes_pedidos p where p.id=new.pedido_id and p.empresa_id=new.empresa_id) then
      raise exception 'A corrida precisa de pedido. Sem pedido, o supervisor deve criar uma solicitação interna na Logística.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.uber_vaga_vinculo_trg() from public,anon,authenticated;
create trigger uber_vaga_vinculo before insert or update of empresa_id,etapa_id,pedido_id,solicitacao_interna,solicitacao_motivo,solicitacao_motorista_id,solicitacao_autorizada_em,criado_por on public.uber_vagas
for each row execute function public.uber_vaga_vinculo_trg();

create or replace function public.uber_corrida_vinculo_trg() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if row(new.empresa_id,new.vaga_id,new.motorista_id,new.valor_final,new.conferido_em,new.fechamento_id)
      is not distinct from row(old.empresa_id,old.vaga_id,old.motorista_id,old.valor_final,old.conferido_em,old.fechamento_id)
      and (new.status is not distinct from old.status or new.status='cancelada') then return new; end if;
  end if;
  perform uber_vinculo_validar(new.empresa_id,new.vaga_id,new.motorista_id);
  return new;
end $$;
revoke all on function public.uber_corrida_vinculo_trg() from public,anon,authenticated;
create trigger uber_corrida_vinculo before insert or update on public.uber_corridas
for each row execute function public.uber_corrida_vinculo_trg();

create or replace function public.logistica_uber_solicitacoes_motoristas(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa,true);
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'nome',m.nome) order by m.nome)
    from uber_motoristas m where m.empresa_id=p_empresa and m.status='ativo'),'[]'::jsonb);
end $$;
revoke all on function public.logistica_uber_solicitacoes_motoristas(uuid) from public,anon;
grant execute on function public.logistica_uber_solicitacoes_motoristas(uuid) to authenticated;

create or replace function public.logistica_uber_solicitacao_salvar(p_empresa uuid,p_dados jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare mot uuid; d date; h time; km numeric; iv boolean; val numeric; resultado uuid;
begin
  perform logistica_servicos_autorizar(p_empresa,true);
  mot:=nullif(p_dados->>'motorista_id','')::uuid;d:=nullif(p_dados->>'data','')::date;h:=nullif(p_dados->>'hora','')::time;
  km:=round(coalesce(nullif(p_dados->>'km','')::numeric,0),1);iv:=coalesce((p_dados->>'ida_volta')::boolean,false);
  if d is null or h is null then raise exception 'Informe data e horário da solicitação interna.'; end if;
  if length(btrim(coalesce(p_dados->>'origem','')))<2 or length(btrim(coalesce(p_dados->>'destino','')))<2 then raise exception 'Informe origem e destino da corrida.'; end if;
  if length(btrim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Informe o motivo da solicitação interna.'; end if;
  if km<=0 then raise exception 'Informe a distância do trajeto em km.'; end if;
  val:=uber_valor_trecho(p_empresa,km)*case when iv then 2 else 1 end;
  if coalesce(val,0)<=0 then raise exception 'Configure as faixas de km do Uber nos Parâmetros da Logística.'; end if;
  insert into uber_vagas(empresa_id,etapa_id,pedido_id,quantidade,ida_volta,ponto_encontro,destino,km,valor,data,hora,obs,
    solicitacao_interna,solicitacao_motivo,solicitacao_motorista_id,solicitacao_autorizada_em,criado_por)
  values(p_empresa,null,null,1,iv,btrim(p_dados->>'origem'),btrim(p_dados->>'destino'),km,val,d,h,nullif(btrim(coalesce(p_dados->>'observacao','')),''),
    true,btrim(p_dados->>'motivo'),mot,now(),auth.uid()) returning id into resultado;
  return resultado;
end $$;
revoke all on function public.logistica_uber_solicitacao_salvar(uuid,jsonb) from public,anon;
grant execute on function public.logistica_uber_solicitacao_salvar(uuid,jsonb) to authenticated;

create or replace function public.fin_uber_vinculo_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare corrida record;
begin
  if new.origem is distinct from 'uber' then return new; end if;
  if not exists(select 1 from logistica_fechamentos f where f.id=new.origem_id and f.empresa_id=new.empresa_id and f.tipo='uber')
    or not exists(select 1 from uber_corridas c where c.fechamento_id=new.origem_id and c.empresa_id=new.empresa_id) then
    raise exception 'A conta do Uber precisa de corridas com pedido ou solicitação interna autorizada.';
  end if;
  for corrida in select * from uber_corridas where fechamento_id=new.origem_id and empresa_id=new.empresa_id loop
    perform uber_vinculo_validar(corrida.empresa_id,corrida.vaga_id,corrida.motorista_id);
  end loop;
  return new;
end $$;
revoke all on function public.fin_uber_vinculo_trg() from public,anon,authenticated;
create trigger fin_uber_vinculo before insert or update of empresa_id,origem,origem_id on public.fin_pagar
for each row execute function public.fin_uber_vinculo_trg();

notify pgrst,'reload schema';
