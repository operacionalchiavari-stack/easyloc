-- A etapa é derivada dos registros existentes, sem duplicar o pedido entre filas.
create table public.empresa_fluxo_pedidos (
 empresa_id uuid primary key references public.empresas(id),
 pre_reservas_consulta boolean not null default false,
 retorno_simultaneo boolean not null default true,
 atualizado_em timestamptz not null default now(),atualizado_por uuid
);
alter table public.empresa_fluxo_pedidos enable row level security;
create policy fluxo_config_ler on public.empresa_fluxo_pedidos for select to authenticated using(eh_membro_empresa(empresa_id));
revoke all on public.empresa_fluxo_pedidos from anon,authenticated;
grant select on public.empresa_fluxo_pedidos to authenticated;
create function public.pedido_fluxo_configurar(p_empresa uuid,p_pre_reservas boolean,p_retorno_simultaneo boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'configuracoes.empresa.editar') then raise exception 'Sem permissão para alterar o fluxo'; end if;
 insert into empresa_fluxo_pedidos(empresa_id,pre_reservas_consulta,retorno_simultaneo,atualizado_por)
 values(p_empresa,p_pre_reservas,p_retorno_simultaneo,auth.uid()) on conflict(empresa_id) do update
 set pre_reservas_consulta=excluded.pre_reservas_consulta,retorno_simultaneo=excluded.retorno_simultaneo,atualizado_em=now(),atualizado_por=auth.uid();
end $$;

create function public.pedido_fluxo_etapa(p public.separacoes_pedidos) returns text
language plpgsql stable security definer set search_path=public as $$
declare simultaneo boolean;
begin
 if p.status='cancelado' or p.status_comercial='cancelado' then return 'cancelado'; end if;
 if coalesce(p.status_comercial,'') not in ('pre_reserva','aprovado','enviado','finalizado') then return 'comercial'; end if;
 if p.status_comercial='pre_reserva' then return 'pre_reserva'; end if;
 if p.reducao_liberada_em is not null then return 'comercial'; end if;
 if exists(select 1 from fin_posicoes_finais where pedido_id=p.id and status='confirmado') then return 'posicao_final'; end if;
 if p.encerrado_operacional_em is not null then return 'posicao_final'; end if;
 if exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='coleta') then
  if p.operacao->'descarregamento'->>'concluido_em' is not null and p.operacao->'retorno'->>'concluido_em' is not null then return 'posicao_final'; end if;
  select retorno_simultaneo into simultaneo from empresa_fluxo_pedidos where empresa_id=p.empresa_id;
  if coalesce(simultaneo,true) and p.operacao->'retorno'->>'concluido_em' is null and p.operacao->'descarregamento'->>'concluido_em' is null then return 'retorno_simultaneo'; end if;
  if p.operacao->'descarregamento'->>'concluido_em' is null then return 'descarregamento'; end if;
  return 'triagem_retorno';
 end if;
 if exists(select 1 from logistica_confirmacoes where pedido_id=p.id and etapa='entrega') then return 'coleta'; end if;
 if p.operacao->'carregamento'->>'concluido_em' is not null or p.status_operacional in ('carregado','descarregado','retornado') then return 'entrega'; end if;
 if p.status in ('separado','separado_com_divergencia') then return 'expedicao'; end if;
 return 'triagem';
end $$;
revoke all on function public.pedido_fluxo_etapa(public.separacoes_pedidos) from public,anon,authenticated;

create function public.pedido_fluxo_fila(p_empresa uuid,p_setor text,p_de integer default 0,p_limite integer default 500) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare resultado jsonb; pre boolean;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso à empresa'; end if;
 if p_setor is null or p_setor not in ('triagem','expedicao','entrega','coleta','entregas_coletas','posicao_final') then raise exception 'Setor inválido'; end if;
 if p_setor='posicao_final' then
  if not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then raise exception 'Sem permissão financeira'; end if;
 elsif not funcionario_tabela_permitida(p_empresa,case when p_setor='triagem' then 'separacoes_itens' else 'separacoes_pedidos' end,'select') then raise exception 'Sem permissão para consultar esta fila'; end if;
 select pre_reservas_consulta into pre from empresa_fluxo_pedidos where empresa_id=p_empresa;
 with candidatos as(select p,pedido_fluxo_etapa(p) etapa from separacoes_pedidos p where p.empresa_id=p_empresa),
 fila as(select p,etapa from candidatos where
  (p_setor='triagem' and etapa in ('triagem','triagem_retorno','retorno_simultaneo')) or
  (p_setor='expedicao' and etapa in ('expedicao','descarregamento','retorno_simultaneo')) or
  etapa=p_setor or (p_setor='entregas_coletas' and etapa in ('entrega','coleta')) or
  (coalesce(pre,false) and etapa='pre_reserva' and p_setor in ('triagem','entrega','entregas_coletas')
   and ((p).pre_reserva_ate is null or (p).pre_reserva_ate>=(now() at time zone 'America/Sao_Paulo')::date))
 order by (p).data_entrega nulls last,(p).id offset greatest(p_de,0) limit least(greatest(p_limite,1),1000))
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('fluxo_etapa',etapa,'somente_consulta',etapa='pre_reserva')),'[]') into resultado from fila;
 return resultado;
end $$;

create or replace function public.operacao_validar_etapa(p public.separacoes_pedidos,p_etapa text) returns void
language plpgsql security definer set search_path=public as $$
declare etapa text; simultaneo boolean;
begin
 if p.encerrado_operacional_em is not null then raise exception 'Operação encerrada'; end if;
 if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') then raise exception 'Pré-reserva e orçamento são somente consulta. Reserve o pedido para executar'; end if;
 if p.reducao_liberada_em is not null then raise exception 'Pedido aguardando revisão do Comercial'; end if;
 etapa:=pedido_fluxo_etapa(p);
 if p_etapa='carregamento' then
  if etapa<>'expedicao' then raise exception 'Finalize a separação antes do carregamento. Etapa atual: %',etapa; end if;
 elsif p_etapa='descarregamento' then
  if etapa not in ('descarregamento','retorno_simultaneo') then raise exception 'Confirme a coleta antes do descarregamento. Etapa atual: %',etapa; end if;
 elsif p_etapa='retorno' then
  if etapa not in ('triagem_retorno','retorno_simultaneo') then raise exception 'Triagem de retorno indisponível. Conclua a coleta e, no modo sequencial, o descarregamento. Etapa atual: %',etapa; end if;
 else raise exception 'Etapa inválida'; end if;
end $$;
-- Se a Triagem finalizar antes do descarregamento, o status resumido não pode regredir.
do $$ declare fonte text; begin
 select pg_get_functiondef('public.operacao_concluir_conferencia(uuid,text,boolean,jsonb,jsonb)'::regprocedure) into fonte;
 if position('status_operacional=case p_etapa' in fonte)=0 then raise exception 'Conclusão de conferência incompatível com o fluxo'; end if;
 fonte:=replace(fonte,'status_operacional=case p_etapa when', 'status_operacional=case when p.operacao->''retorno''->>''concluido_em'' is not null then ''retornado'' else case p_etapa when');
 fonte:=replace(fonte,'else ''retornado'' end,','else ''retornado'' end end,');
 execute fonte;
end $$;

alter function public.logistica_confirmacao_base(uuid,text) rename to logistica_confirmacao_base_antes_fluxo;
revoke all on function public.logistica_confirmacao_base_antes_fluxo(uuid,text) from public,anon,authenticated;
create function public.logistica_confirmacao_base(p_pedido uuid,p_etapa text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; b jsonb; etapa text; pre boolean;
begin
 b:=logistica_confirmacao_base_antes_fluxo(p_pedido,p_etapa);
 select * into strict p from separacoes_pedidos where id=p_pedido;
 etapa:=pedido_fluxo_etapa(p);
 if etapa in ('comercial','cancelado') then raise exception 'Pedido não disponível para este setor'; end if;
 if etapa='pre_reserva' then
  select pre_reservas_consulta into pre from empresa_fluxo_pedidos where empresa_id=p.empresa_id;
  if not coalesce(pre,false) or p_etapa<>'entrega' or p.pre_reserva_ate<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Pré-reserva não disponível para este setor'; end if;
  b:=b||jsonb_build_object('bloqueio','Pré-reserva — somente consulta. Aguarde a reserva comercial.','somente_consulta',true);
 elsif etapa<>p_etapa then
  b:=b||jsonb_build_object('bloqueio','Pedido na etapa '||etapa||'. Esta lista está disponível apenas para consulta.','somente_consulta',true);
 end if;
 return b||jsonb_build_object('fluxo_etapa',etapa);
end $$;
alter function public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text) rename to logistica_confirmacao_salvar_antes_fluxo;
revoke all on function public.logistica_confirmacao_salvar_antes_fluxo(uuid,text,text,jsonb,text,text) from public,anon,authenticated;
create function public.logistica_confirmacao_salvar(p_pedido uuid,p_etapa text,p_token text,p_itens jsonb,p_responsavel text,p_observacao text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos; etapa text;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if not eh_membro_empresa(p.empresa_id) or auth.uid() is null then raise exception 'Sem acesso ao pedido'; end if;
 etapa:=pedido_fluxo_etapa(p);
 if etapa<>p_etapa then raise exception 'Não é possível executar esta etapa. Etapa atual: %',etapa; end if;
 return logistica_confirmacao_salvar_antes_fluxo(p_pedido,p_etapa,p_token,p_itens,p_responsavel,p_observacao);
end $$;

create function public.pedido_fluxo_proteger_triagem() returns trigger language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;
begin
 if current_setting('app.pedido_salvar',true)='sim' or current_setting('app.fluxo_transferencia',true)='sim' then return new; end if;
 if TG_TABLE_NAME='separacoes_itens' then
  if row(new.quantidade_separada,new.componentes,new.patrimonios_lidos) is not distinct from row(old.quantidade_separada,old.componentes,old.patrimonios_lidos) then return new; end if;
  select * into strict p from separacoes_pedidos where id=new.separacao_pedido_id for update;
 else
  if new.status is not distinct from old.status or new.status not in ('em_separacao','pausado','separado','separado_com_divergencia') then return new; end if;
  p:=old;
 end if;
 if pedido_fluxo_etapa(p)<>'triagem' then raise exception 'Pedido indisponível para executar a Triagem. Etapa atual: %',pedido_fluxo_etapa(p); end if;
 return new;
end $$;
create trigger pedido_fluxo_triagem before update on public.separacoes_itens for each row execute function public.pedido_fluxo_proteger_triagem();
create trigger pedido_fluxo_triagem before update on public.separacoes_pedidos for each row execute function public.pedido_fluxo_proteger_triagem();

-- Encerramento e posição final exigem as duas conferências de retorno.
alter function public.operacao_encerrar(uuid) rename to operacao_encerrar_antes_fluxo;
revoke all on function public.operacao_encerrar_antes_fluxo(uuid) from public,anon,authenticated;
create function public.operacao_encerrar(p_pedido uuid) returns void language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 if not eh_membro_empresa(p.empresa_id) then raise exception 'Sem acesso ao pedido'; end if;
 if p.operacao->'descarregamento'->>'concluido_em' is null then raise exception 'Conclua o descarregamento antes de encerrar'; end if;
 perform operacao_encerrar_antes_fluxo(p_pedido);
end $$;
alter function public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean) rename to fin_posicao_final_salvar_antes_fluxo;
revoke all on function public.fin_posicao_final_salvar_antes_fluxo(uuid,uuid,text,integer,jsonb,boolean) from public,anon,authenticated;
create function public.fin_posicao_final_salvar(p_empresa uuid,p_pedido uuid,p_fonte text,p_versao integer,p_decisoes jsonb,p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso ao pedido'; end if;
 if pedido_fluxo_etapa(p)<>'posicao_final' then raise exception 'Conclua a coleta, o descarregamento e a Triagem de retorno antes da Posição final'; end if;
 return fin_posicao_final_salvar_antes_fluxo(p_empresa,p_pedido,p_fonte,p_versao,p_decisoes,p_confirmar);
end $$;
revoke all on function public.pedido_fluxo_fila(uuid,text,integer,integer),public.pedido_fluxo_configurar(uuid,boolean,boolean),public.logistica_confirmacao_base(uuid,text),public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text),public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean),public.operacao_encerrar(uuid) from public,anon;
grant execute on function public.pedido_fluxo_fila(uuid,text,integer,integer),public.pedido_fluxo_configurar(uuid,boolean,boolean),public.logistica_confirmacao_base(uuid,text),public.logistica_confirmacao_salvar(uuid,text,text,jsonb,text,text),public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean),public.operacao_encerrar(uuid) to authenticated;
-- A produção recebe apenas pedidos reservados; a pré-reserva de consulta pertence à Triagem/Entrega.
do $$ declare fonte text; begin
 if to_regprocedure('public.producao_quadro(uuid)') is not null then
  select pg_get_functiondef('public.producao_quadro(uuid)'::regprocedure) into fonte;
  if position('where t.empresa_id=p_empresa;' in fonte)=0 then raise exception 'Quadro de produção incompatível com o fluxo'; end if;
  execute replace(fonte,'where t.empresa_id=p_empresa;','where t.empresa_id=p_empresa and p.status_comercial in (''aprovado'',''enviado'',''finalizado'') and p.status<>''cancelado'';');
 end if;
end $$;
notify pgrst,'reload schema';
