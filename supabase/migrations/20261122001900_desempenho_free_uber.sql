-- Cadastro e desempenho de Free/Uber na Logística. Nota pública no próprio app: 0 a 10.
create table if not exists public.logistica_desempenho_parametros(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id) on delete cascade,
 chave text not null,nome text not null,peso numeric(4,2) not null check(peso between 0 and 10),ativo boolean not null default true,
 ordem int not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(empresa_id,chave));
create table if not exists public.logistica_desempenho_historico(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id) on delete cascade,
 pessoa_tipo text not null check(pessoa_tipo in ('free','uber')),pessoa_id uuid not null,parametro_id uuid not null references logistica_desempenho_parametros(id),
 quantidade numeric(6,2) not null default 1 check(quantidade>0),peso_aplicado numeric(4,2) not null check(peso_aplicado between 0 and 10),
 pontos numeric(6,2) generated always as (round(peso_aplicado*quantidade,2)) stored,
 etapa_id uuid references operacao_etapas(id) on delete set null,pedido_id uuid references separacoes_pedidos(id) on delete set null,
 observacao text,origem text not null default 'manual' check(origem in ('manual','luisa','sistema')),criado_por uuid default auth.uid(),criado_por_nome text,created_at timestamptz not null default now());
create index if not exists log_desempenho_pessoa_idx on logistica_desempenho_historico(empresa_id,pessoa_tipo,pessoa_id,created_at desc);
alter table logistica_desempenho_parametros enable row level security;alter table logistica_desempenho_historico enable row level security;
create policy log_des_param_ler on logistica_desempenho_parametros for select to authenticated using(seguranca_2fa_ok() and eh_membro_empresa(empresa_id));
create policy log_des_hist_ler on logistica_desempenho_historico for select to authenticated using(seguranca_2fa_ok() and eh_membro_empresa(empresa_id));

create or replace function public.logistica_desempenho_preparar(p_empresa uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into logistica_desempenho_parametros(empresa_id,chave,nome,peso,ordem) values
 (p_empresa,'atraso','Atraso',0.5,10),(p_empresa,'falta','Falta',2,20),(p_empresa,'sem_uniforme','Sem uniforme',0.5,30),
 (p_empresa,'muita_conversa','Muita conversa',0.3,40),(p_empresa,'ma_postura','Má postura',1,50)
 on conflict(empresa_id,chave) do nothing;
end $$;
create or replace function public.logistica_desempenho_nota(p_empresa uuid,p_tipo text,p_pessoa uuid) returns numeric language sql stable security definer set search_path=public,pg_temp as $$
 select greatest(0,least(10,round(10-coalesce((select sum(pontos) from logistica_desempenho_historico where empresa_id=p_empresa and pessoa_tipo=p_tipo and pessoa_id=p_pessoa),0),2)))
$$;
create or replace function public.logistica_desempenho_pode(p_empresa uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select seguranca_2fa_ok() and eh_membro_empresa(p_empresa) and (funcionario_pode(p_empresa,auth.uid(),'logistica.planejamento.editar') or funcionario_pode(p_empresa,auth.uid(),'rh.colaboradores.editar'))
$$;
create or replace function public.logistica_desempenho_lista(p_empresa uuid,p_tipo text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pessoas jsonb;begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso.';end if;
 if p_tipo not in('free','uber') then raise exception 'Tipo inválido.';end if;perform logistica_desempenho_preparar(p_empresa);
 if p_tipo='free' then select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'telefone',f.telefone,'foto_url',f.foto_url,'status',f.status,'nota',logistica_desempenho_nota(p_empresa,'free',f.id),'historico',(select count(*) from logistica_desempenho_historico h where h.pessoa_tipo='free' and h.pessoa_id=f.id)) order by f.nome),'[]') into pessoas from free_cadastros f where f.empresa_id=p_empresa;
 else select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'nome',m.nome,'telefone',m.telefone,'status',m.status,'carro',concat_ws(' · ',m.carro_modelo,m.carro_cor,m.carro_placa),'nota',logistica_desempenho_nota(p_empresa,'uber',m.id),'historico',(select count(*) from logistica_desempenho_historico h where h.pessoa_tipo='uber' and h.pessoa_id=m.id)) order by m.nome),'[]') into pessoas from uber_motoristas m where m.empresa_id=p_empresa;end if;
 return jsonb_build_object('tipo',p_tipo,'pessoas',pessoas,'parametros',coalesce((select jsonb_agg(to_jsonb(x) order by ordem,nome) from logistica_desempenho_parametros x where x.empresa_id=p_empresa),'[]'),'pode_editar',logistica_desempenho_pode(p_empresa));
end $$;
create or replace function public.logistica_desempenho_detalhe(p_empresa uuid,p_tipo text,p_pessoa uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin if not seguranca_2fa_ok() or not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso.';end if;
 return jsonb_build_object('nota',logistica_desempenho_nota(p_empresa,p_tipo,p_pessoa),'historico',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'parametro',p.nome,'chave',p.chave,'quantidade',h.quantidade,'peso',h.peso_aplicado,'pontos',h.pontos,'observacao',h.observacao,'origem',h.origem,'criado_por',h.criado_por_nome,'created_at',h.created_at,'pedido',(select numero_pedido from separacoes_pedidos where id=h.pedido_id),'etapa',(select nome from operacao_etapas where id=h.etapa_id)) order by h.created_at desc) from logistica_desempenho_historico h join logistica_desempenho_parametros p on p.id=h.parametro_id where h.empresa_id=p_empresa and h.pessoa_tipo=p_tipo and h.pessoa_id=p_pessoa),'[]'));
end $$;
create or replace function public.logistica_desempenho_parametro_salvar(p_empresa uuid,p_id uuid,p_nome text,p_peso numeric,p_ativo boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r logistica_desempenho_parametros;begin if not logistica_desempenho_pode(p_empresa) then raise exception 'Sem permissão.';end if;if length(btrim(coalesce(p_nome,'')))<2 or p_peso not between 0 and 10 then raise exception 'Confira o nome e o peso de 0 a 10.';end if;
 if p_id is null then insert into logistica_desempenho_parametros(empresa_id,chave,nome,peso,ativo,ordem) values(p_empresa,'personalizado_'||replace(gen_random_uuid()::text,'-',''),btrim(p_nome),p_peso,coalesce(p_ativo,true),100) returning * into r;
 else update logistica_desempenho_parametros set nome=btrim(p_nome),peso=p_peso,ativo=coalesce(p_ativo,true),updated_at=now() where id=p_id and empresa_id=p_empresa returning * into r;end if;return to_jsonb(r);end $$;
create or replace function public.logistica_desempenho_registrar(p_empresa uuid,p_tipo text,p_pessoa uuid,p_parametro uuid,p_quantidade numeric,p_observacao text,p_etapa uuid default null,p_origem text default 'manual') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare par logistica_desempenho_parametros; nome text; ped uuid;begin if not logistica_desempenho_pode(p_empresa) then raise exception 'Sem permissão.';end if;if p_tipo not in('free','uber') then raise exception 'Tipo inválido.';end if;
 if (p_tipo='free' and not exists(select 1 from free_cadastros where id=p_pessoa and empresa_id=p_empresa)) or (p_tipo='uber' and not exists(select 1 from uber_motoristas where id=p_pessoa and empresa_id=p_empresa)) then raise exception 'Cadastro não encontrado.';end if;
 select * into par from logistica_desempenho_parametros where id=p_parametro and empresa_id=p_empresa and ativo;if par.id is null then raise exception 'Parâmetro inativo ou inválido.';end if;if coalesce(p_quantidade,0)<=0 then raise exception 'Quantidade inválida.';end if;
 select pedido_id into ped from operacao_etapas where id=p_etapa and empresa_id=p_empresa;select coalesce(nullif(f.nome,''),nullif(u.raw_user_meta_data->>'nome',''),'Logística') into nome from auth.users u left join funcionarios_acesso f on f.id=u.id and f.empresa_id=p_empresa where u.id=auth.uid();
 insert into logistica_desempenho_historico(empresa_id,pessoa_tipo,pessoa_id,parametro_id,quantidade,peso_aplicado,etapa_id,pedido_id,observacao,origem,criado_por_nome) values(p_empresa,p_tipo,p_pessoa,par.id,p_quantidade,par.peso,p_etapa,ped,nullif(btrim(coalesce(p_observacao,'')),''),case when p_origem='luisa' then 'luisa' else 'manual' end,nome);
 return logistica_desempenho_detalhe(p_empresa,p_tipo,p_pessoa);end $$;
create or replace function public.logistica_desempenho_excluir(p_empresa uuid,p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin if not logistica_desempenho_pode(p_empresa) then raise exception 'Sem permissão.';end if;delete from logistica_desempenho_historico where id=p_id and empresa_id=p_empresa;end$$;
create or replace function public.logistica_desempenho_status(p_empresa uuid,p_tipo text,p_pessoa uuid,p_status text) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin if not logistica_desempenho_pode(p_empresa) then raise exception 'Sem permissão.';end if;if p_tipo='free' and p_status in('pendente','aprovado','recusado','bloqueado') then update free_cadastros set status=p_status where id=p_pessoa and empresa_id=p_empresa;elsif p_tipo='uber' and p_status in('ativo','bloqueado') then update uber_motoristas set status=p_status where id=p_pessoa and empresa_id=p_empresa;else raise exception 'Situação inválida.';end if;end$$;
create or replace function public.logistica_desempenho_app(p_token text,p_tipo text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare s app_sessoes:=app_sessao(p_token,case when p_tipo='free' then 'free' else 'motorista' end);pid uuid;begin pid:=case when p_tipo='free' then s.free_id else s.motorista_id end;return jsonb_build_object('nota',logistica_desempenho_nota(s.empresa_id,p_tipo,pid),'historico',coalesce((select jsonb_agg(jsonb_build_object('motivo',p.nome,'pontos',h.pontos,'data',h.created_at,'observacao',h.observacao) order by h.created_at desc) from logistica_desempenho_historico h join logistica_desempenho_parametros p on p.id=h.parametro_id where h.empresa_id=s.empresa_id and h.pessoa_tipo=p_tipo and h.pessoa_id=pid and h.created_at>now()-interval '12 months'),'[]'));end$$;
revoke all on function public.logistica_desempenho_app(text,text) from public;grant execute on function public.logistica_desempenho_app(text,text) to anon,authenticated;
grant execute on function public.logistica_desempenho_lista(uuid,text),public.logistica_desempenho_detalhe(uuid,text,uuid),public.logistica_desempenho_parametro_salvar(uuid,uuid,text,numeric,boolean),public.logistica_desempenho_registrar(uuid,text,uuid,uuid,numeric,text,uuid,text),public.logistica_desempenho_excluir(uuid,uuid),public.logistica_desempenho_status(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
-- Só quem está logado chama as funções da tela (a do app continua liberada para a sessão do app).
revoke all on function public.logistica_desempenho_lista(uuid,text),public.logistica_desempenho_detalhe(uuid,text,uuid),public.logistica_desempenho_parametro_salvar(uuid,uuid,text,numeric,boolean),public.logistica_desempenho_registrar(uuid,text,uuid,uuid,numeric,text,uuid,text),public.logistica_desempenho_excluir(uuid,uuid),public.logistica_desempenho_status(uuid,text,uuid,text) from public,anon;
revoke all on function public.logistica_desempenho_preparar(uuid),public.logistica_desempenho_nota(uuid,text,uuid),public.logistica_desempenho_pode(uuid) from public,anon,authenticated;
grant execute on function public.logistica_desempenho_lista(uuid,text),public.logistica_desempenho_detalhe(uuid,text,uuid),public.logistica_desempenho_parametro_salvar(uuid,uuid,text,numeric,boolean),public.logistica_desempenho_registrar(uuid,text,uuid,uuid,numeric,text,uuid,text),public.logistica_desempenho_excluir(uuid,uuid),public.logistica_desempenho_status(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
