begin;
create table public.catalogo_creditos_carteiras (
 empresa_id uuid not null references public.empresas(id), cliente_id uuid not null references public.clientes_empresas(id),
 saldo integer not null default 0 check(saldo>=0), primary key(empresa_id,cliente_id)
);
create table public.catalogo_creditos_precos (
 empresa_id uuid not null references public.empresas(id), recurso text not null check(recurso in ('tecido','render','planta','layout')),
 custo integer not null default 1 check(custo between 0 and 100000), primary key(empresa_id,recurso)
);
create table public.catalogo_creditos_movimentos (
 id uuid primary key, empresa_id uuid not null, cliente_id uuid not null, recurso text,
 quantidade integer not null, tipo text not null check(tipo in ('recarga','uso')),
 status text not null check(status in ('reservado','concluido','estornado')), nota text not null default '',
 usuario_id uuid, created_at timestamptz not null default now(), expires_at timestamptz,
 foreign key(empresa_id,cliente_id) references public.catalogo_creditos_carteiras(empresa_id,cliente_id)
);
create index on public.catalogo_creditos_movimentos(empresa_id,cliente_id,created_at desc);
alter table public.catalogo_creditos_carteiras enable row level security;
alter table public.catalogo_creditos_precos enable row level security;
alter table public.catalogo_creditos_movimentos enable row level security;
revoke all on public.catalogo_creditos_carteiras,public.catalogo_creditos_precos,public.catalogo_creditos_movimentos from anon,authenticated;
grant all on public.catalogo_creditos_carteiras,public.catalogo_creditos_precos,public.catalogo_creditos_movimentos to service_role;
insert into public.permissoes_catalogo(chave,modulo,submodulo,acao,descricao,ordem) values
 ('comercial.creditos.visualizar','Comercial','Créditos de IA','visualizar','Consultar créditos dos decoradores',920),
 ('comercial.creditos.editar','Comercial','Créditos de IA','editar','Adicionar créditos e definir custos',921) on conflict(chave) do nothing;

create function public.creditos_liberar_expirados(p_empresa uuid,p_cliente uuid) returns void
language plpgsql security definer set search_path=public as $$
declare total integer;
begin
 perform 1 from catalogo_creditos_carteiras where empresa_id=p_empresa and cliente_id=p_cliente for update;
 with expirados as (update catalogo_creditos_movimentos set status='estornado',nota='Reserva expirada: créditos devolvidos'
 where empresa_id=p_empresa and cliente_id=p_cliente and status='reservado' and expires_at<now() returning quantidade)
 select coalesce(sum(quantidade),0) into total from expirados;
 update catalogo_creditos_carteiras set saldo=saldo+total where empresa_id=p_empresa and cliente_id=p_cliente;
end; $$;

create function public.catalogo_creditos_saldo(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare sessao jsonb; e uuid; c uuid;
begin
 sessao:=public.catalogo_validar_sessao(p_token);
 if not coalesce((sessao->>'valido')::boolean,false) then raise exception 'Sessão expirada'; end if;
 e:=(sessao->>'empresa_id')::uuid; c:=(sessao->>'cliente_id')::uuid;
 perform creditos_liberar_expirados(e,c);
 return jsonb_build_object('saldo',coalesce((select saldo from catalogo_creditos_carteiras where empresa_id=e and cliente_id=c),0),
 'custos',(select jsonb_object_agg(r.recurso,coalesce(p.custo,1)) from unnest(array['tecido','render','planta','layout']) r(recurso) left join catalogo_creditos_precos p on p.recurso=r.recurso and p.empresa_id=e),
 'historico',coalesce((select jsonb_agg(m order by created_at desc) from (select id,recurso,quantidade,tipo,status,created_at from catalogo_creditos_movimentos where empresa_id=e and cliente_id=c order by created_at desc limit 30) m),'[]'::jsonb));
end; $$;

create function public.creditos_painel(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c record;
begin
 if not public.funcionario_pode(p_empresa,auth.uid(),'comercial.creditos.visualizar') then raise exception 'Sem permissão para consultar créditos'; end if;
 for c in select cliente_id from catalogo_creditos_carteiras where empresa_id=p_empresa loop perform creditos_liberar_expirados(p_empresa,c.cliente_id); end loop;
 return jsonb_build_object('clientes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome_razao,'logo_url',c.catalogo_logo_url,'saldo',coalesce(w.saldo,0)) order by c.nome_razao)
 from clientes_empresas c join catalogo_acessos a on a.cliente_id=c.id and a.empresa_id=c.empresa_id left join catalogo_creditos_carteiras w on w.cliente_id=c.id and w.empresa_id=c.empresa_id where c.empresa_id=p_empresa),'[]'::jsonb),
 'custos',(select jsonb_object_agg(r.recurso,coalesce(p.custo,1)) from unnest(array['tecido','render','planta','layout']) r(recurso) left join catalogo_creditos_precos p on p.recurso=r.recurso and p.empresa_id=p_empresa),
 'historico',coalesce((select jsonb_agg(m order by created_at desc) from (select m.id,m.cliente_id,c.nome_razao as nome,m.recurso,m.quantidade,m.tipo,m.status,m.nota,m.created_at from catalogo_creditos_movimentos m join clientes_empresas c on c.id=m.cliente_id where m.empresa_id=p_empresa order by m.created_at desc limit 100) m),'[]'::jsonb));
end; $$;

create function public.creditos_adicionar(p_empresa uuid,p_cliente uuid,p_quantidade integer,p_nota text,p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.funcionario_pode(p_empresa,auth.uid(),'comercial.creditos.editar') then raise exception 'Sem permissão para adicionar créditos'; end if;
 if p_quantidade is null or p_quantidade not between 1 and 1000000 or length(coalesce(p_nota,''))>300 then raise exception 'Recarga inválida'; end if;
 if not exists(select 1 from clientes_empresas where empresa_id=p_empresa and id=p_cliente) then raise exception 'Cliente inválido'; end if;
 insert into catalogo_creditos_carteiras(empresa_id,cliente_id) values(p_empresa,p_cliente) on conflict do nothing;
 perform 1 from catalogo_creditos_carteiras where empresa_id=p_empresa and cliente_id=p_cliente for update;
 if exists(select 1 from catalogo_creditos_movimentos where id=p_id) then
  if exists(select 1 from catalogo_creditos_movimentos where id=p_id and empresa_id=p_empresa and cliente_id=p_cliente and quantidade=p_quantidade and tipo='recarga') then return; end if;
  raise exception 'Identificador já utilizado';
 end if;
 insert into catalogo_creditos_movimentos(id,empresa_id,cliente_id,quantidade,tipo,status,nota,usuario_id) values(p_id,p_empresa,p_cliente,p_quantidade,'recarga','concluido',coalesce(p_nota,''),auth.uid());
 update catalogo_creditos_carteiras set saldo=saldo+p_quantidade where empresa_id=p_empresa and cliente_id=p_cliente;
end; $$;

create function public.creditos_definir_custos(p_empresa uuid,p_custos jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r text;
begin
 if not public.funcionario_pode(p_empresa,auth.uid(),'comercial.creditos.editar') then raise exception 'Sem permissão para definir custos'; end if;
 foreach r in array array['tecido','render','planta','layout'] loop
  if not(p_custos ? r) or (p_custos->>r)::integer not between 0 and 100000 then raise exception 'Custo inválido'; end if;
  insert into catalogo_creditos_precos(empresa_id,recurso,custo) values(p_empresa,r,(p_custos->>r)::integer) on conflict(empresa_id,recurso) do update set custo=excluded.custo;
 end loop;
end; $$;

-- Reserva e conclusão somente no backend. A identidade vem da sessão validada, nunca do formulário.
create function public.creditos_reservar(p_empresa uuid,p_cliente uuid,p_recurso text,p_id uuid,p_custo_aceito integer) returns integer
language plpgsql security definer set search_path=public as $$
declare custo_atual integer; disponivel integer;
begin
 if p_recurso not in ('tecido','render','planta','layout') then raise exception 'Recurso inválido'; end if;
 if not exists(select 1 from catalogo_acessos where empresa_id=p_empresa and cliente_id=p_cliente and ativo) then raise exception 'Acesso inválido'; end if;
 insert into catalogo_creditos_carteiras(empresa_id,cliente_id) values(p_empresa,p_cliente) on conflict do nothing;
 perform creditos_liberar_expirados(p_empresa,p_cliente);
 select saldo into disponivel from catalogo_creditos_carteiras where empresa_id=p_empresa and cliente_id=p_cliente for update;
 select coalesce((select custo from catalogo_creditos_precos where empresa_id=p_empresa and recurso=p_recurso),1) into custo_atual;
 if p_custo_aceito is distinct from custo_atual then raise exception 'O custo mudou. Confirme o valor atualizado.'; end if;
 if exists(select 1 from catalogo_creditos_movimentos where id=p_id) then raise exception 'Esta operação já foi recebida. Consulte seu histórico.'; end if;
 if disponivel<custo_atual then raise exception 'Créditos insuficientes. Solicite uma recarga à Chiavari.'; end if;
 update catalogo_creditos_carteiras set saldo=saldo-custo_atual where empresa_id=p_empresa and cliente_id=p_cliente;
 insert into catalogo_creditos_movimentos(id,empresa_id,cliente_id,recurso,quantidade,tipo,status,expires_at) values(p_id,p_empresa,p_cliente,p_recurso,custo_atual,'uso','reservado',now()+interval '15 minutes');
 return custo_atual;
end; $$;

create function public.creditos_finalizar(p_id uuid,p_sucesso boolean) returns void
language plpgsql security definer set search_path=public as $$
declare m catalogo_creditos_movimentos;
begin
 select * into m from catalogo_creditos_movimentos where id=p_id;
 if not found then return; end if;
 perform 1 from catalogo_creditos_carteiras where empresa_id=m.empresa_id and cliente_id=m.cliente_id for update;
 select * into m from catalogo_creditos_movimentos where id=p_id for update;
 if m.status<>'reservado' then return; end if;
 update catalogo_creditos_movimentos set status=case when p_sucesso then 'concluido' else 'estornado' end where id=p_id;
 if not p_sucesso then update catalogo_creditos_carteiras set saldo=saldo+m.quantidade where empresa_id=m.empresa_id and cliente_id=m.cliente_id; end if;
end; $$;

revoke all on function public.creditos_liberar_expirados(uuid,uuid),public.creditos_reservar(uuid,uuid,text,uuid,integer),public.creditos_finalizar(uuid,boolean) from public,anon,authenticated;
grant execute on function public.creditos_liberar_expirados(uuid,uuid),public.creditos_reservar(uuid,uuid,text,uuid,integer),public.creditos_finalizar(uuid,boolean) to service_role;
revoke all on function public.creditos_painel(uuid),public.creditos_adicionar(uuid,uuid,integer,text,uuid),public.creditos_definir_custos(uuid,jsonb) from public,anon;
grant execute on function public.creditos_painel(uuid),public.creditos_adicionar(uuid,uuid,integer,text,uuid),public.creditos_definir_custos(uuid,jsonb) to authenticated;
revoke all on function public.catalogo_creditos_saldo(text) from public;
grant execute on function public.catalogo_creditos_saldo(text) to anon,authenticated,service_role;
commit;
