-- Jornadas versionadas por setor ou pessoa e ausências usadas também pela Logística.
create table public.rh_jornadas (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id) on delete cascade,
 setor text, funcionario_id uuid references public.funcionarios_acesso(id) on delete cascade,
 vigencia date not null, configuracao jsonb not null, atualizado_em timestamptz not null default now(),
 check ((funcionario_id is not null and setor is null) or (funcionario_id is null and nullif(btrim(setor),'') is not null))
);
create unique index rh_jornadas_versao on public.rh_jornadas(empresa_id,coalesce(funcionario_id::text,'setor:'||setor),vigencia);
create table public.rh_ausencias (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id) on delete cascade,
 funcionario_id uuid not null references public.funcionarios_acesso(id) on delete cascade,
 tipo text not null check(tipo in ('folga','atestado','afastamento','licenca','trabalho')),
 inicio date not null, fim date not null, observacao text, cancelada boolean not null default false,
 criado_por uuid default auth.uid(), criado_em timestamptz not null default now(), check(fim>=inicio)
);
create index rh_ausencias_periodo on public.rh_ausencias(empresa_id,funcionario_id,inicio,fim) where not cancelada;
alter table public.rh_jornadas enable row level security;
alter table public.rh_ausencias enable row level security;
create policy rh_jornadas_ler on public.rh_jornadas for select to authenticated using(seguranca_2fa_ok() and rh_pode(empresa_id,'rh.colaboradores.visualizar'));
create policy rh_ausencias_ler on public.rh_ausencias for select to authenticated using(seguranca_2fa_ok() and rh_pode(empresa_id,'rh.colaboradores.visualizar'));
grant select on public.rh_jornadas,public.rh_ausencias to authenticated;

create function public.rh_jornada_salvar(p_empresa uuid,p_id uuid,p_dados jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg jsonb:=p_dados->'configuracao'; f uuid:=nullif(p_dados->>'funcionario_id','')::uuid;
 s text:=nullif(btrim(p_dados->>'setor'),''); v date:=(p_dados->>'vigencia')::date; k text; h jsonb;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.editar') then raise exception 'Sem permissão para alterar jornadas.'; end if;
 if f is not null then
  if not exists(select 1 from funcionarios_acesso where id=f and empresa_id=p_empresa) then raise exception 'Funcionário inválido.'; end if; s:=null;
 elsif s is null then raise exception 'Informe o setor ou funcionário.'; end if;
 if v is null or cfg is null or cfg->>'tipo' is null or cfg->>'tipo' not in ('semanal','ciclo') then raise exception 'Informe a vigência e o tipo de escala.'; end if;
 if cfg->>'tipo'='semanal' then
  if jsonb_typeof(cfg->'dias') is distinct from 'array' then raise exception 'Informe os dias trabalhados.'; end if;
  if jsonb_array_length(cfg->'dias') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(cfg->'dias') d where d::int not between 0 and 6) then raise exception 'Dias de trabalho inválidos.'; end if;
 else
  if coalesce((cfg->>'trabalho')::int,0) not between 1 and 365 or coalesce((cfg->>'folga')::int,0) not between 1 and 365 or nullif(cfg->>'base','') is null then raise exception 'Informe o ciclo e o primeiro dia trabalhado.'; end if;
  perform (cfg->>'base')::date;
 end if;
 if nullif(cfg->>'carga_semanal','') is not null and (cfg->>'carga_semanal')::numeric not between 0.1 and 168 then raise exception 'Carga semanal inválida.'; end if;
 if jsonb_typeof(cfg->'horarios') is distinct from 'object' then raise exception 'Informe os horários de trabalho.'; end if;
 for k,h in select * from jsonb_each(cfg->'horarios') loop
  if k not in ('0','1','2','3','4','5','6','ciclo') then raise exception 'Dia inválido.'; end if;
  if nullif(h->>'inicio','') is null or nullif(h->>'fim','') is null then raise exception 'Informe entrada e saída.'; end if;
  perform (h->>'inicio')::time; perform (h->>'fim')::time;
  if coalesce((h->>'intervalo')::int,-1) not between 0 and 1439 or ((extract(epoch from ((h->>'fim')::time-(h->>'inicio')::time))::int/60+1440)%1440)<=coalesce((h->>'intervalo')::int,0) then raise exception 'Intervalo e horários inválidos.'; end if;
 end loop;
 if cfg->>'tipo'='ciclo' and not cfg->'horarios'?'ciclo' or cfg->>'tipo'='semanal' and exists(select 1 from jsonb_array_elements_text(cfg->'dias') d where not cfg->'horarios'?d) then raise exception 'Faltam horários dos dias trabalhados.'; end if;
 if p_id is null then
  insert into rh_jornadas(empresa_id,setor,funcionario_id,vigencia,configuracao) values(p_empresa,s,f,v,cfg) returning id into p_id;
 else
  update rh_jornadas set setor=s,funcionario_id=f,vigencia=v,configuracao=cfg,atualizado_em=now() where id=p_id and empresa_id=p_empresa;
  if not found then raise exception 'Jornada não encontrada.'; end if;
 end if;
 return p_id;
end $$;

create function public.rh_ausencia_salvar(p_empresa uuid,p_dados jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare f uuid:=(p_dados->>'funcionario_id')::uuid; id uuid;
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.editar') then raise exception 'Sem permissão para registrar ausências.'; end if;
 if not exists(select 1 from funcionarios_acesso where funcionarios_acesso.id=f and empresa_id=p_empresa) then raise exception 'Funcionário inválido.'; end if;
 insert into rh_ausencias(empresa_id,funcionario_id,tipo,inicio,fim,observacao)
 values(p_empresa,f,p_dados->>'tipo',(p_dados->>'inicio')::date,(p_dados->>'fim')::date,nullif(btrim(p_dados->>'observacao'),'')) returning rh_ausencias.id into id;
 return id;
end $$;
create function public.rh_ausencia_cancelar(p_empresa uuid,p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.editar') then raise exception 'Sem permissão para cancelar ausências.'; end if;
 update rh_ausencias set cancelada=true where id=p_id and empresa_id=p_empresa;
 if not found then raise exception 'Registro não encontrado.'; end if;
end $$;

create function public.rh_jornada_no_dia(p_empresa uuid,p_func uuid,p_data date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select j.configuracao from rh_jornadas j join funcionarios_acesso f on f.id=p_func and f.empresa_id=p_empresa
 where j.empresa_id=p_empresa and j.vigencia<=p_data and (j.funcionario_id=p_func or j.funcionario_id is null and j.setor=f.setor)
 order by (j.funcionario_id is not null) desc,j.vigencia desc limit 1
$$;
create function public.rh_escala_dia(p_empresa uuid,p_func uuid,p_data date) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare f record; cfg jsonb; v_tipo text; ciclo int; pos int;
begin
 select a.ativo,r.status,r.afastamento_inicio,r.afastamento_fim,r.desligamento_data into f
 from funcionarios_acesso a left join rh_fichas r on r.funcionario_id=a.id and r.empresa_id=p_empresa
 where a.id=p_func and a.empresa_id=p_empresa;
 if not found then return 'Funcionário indisponível'; end if;
 if not f.ativo or f.status='desligado' and (f.desligamento_data is null or p_data>=f.desligamento_data) then return 'Funcionário inativo'; end if;
 select a.tipo into v_tipo from rh_ausencias a where a.empresa_id=p_empresa and a.funcionario_id=p_func and not a.cancelada and p_data between a.inicio and a.fim and a.tipo<>'trabalho' order by case a.tipo when 'atestado' then 0 when 'afastamento' then 1 else 2 end,a.criado_em desc limit 1;
 if found then return case v_tipo when 'atestado' then 'Atestado' when 'afastamento' then 'Afastamento' when 'licenca' then 'Licença' else 'Folga' end; end if;
 if exists(select 1 from rh_ferias where empresa_id=p_empresa and funcionario_id=p_func and status<>'cancelada' and p_data between inicio and fim) then return 'Férias'; end if;
 if f.status='afastado' and p_data>=coalesce(f.afastamento_inicio,'-infinity'::date) and p_data<=coalesce(f.afastamento_fim,'infinity'::date) then return 'Afastamento'; end if;
 -- Ocorrências antigas não têm data final: um atestado registrado ali vale para o dia informado.
 if exists(select 1 from controle_rh_ocorrencias where empresa_id=p_empresa and funcionario_id=p_func and data_ocorrencia=p_data and tipo ilike 'atestado%') then return 'Atestado'; end if;
 if exists(select 1 from rh_ausencias where empresa_id=p_empresa and funcionario_id=p_func and not cancelada and tipo='trabalho' and p_data between inicio and fim) then return null; end if;
 cfg:=rh_jornada_no_dia(p_empresa,p_func,p_data);
 if cfg is null then return null; end if;
 if cfg->>'tipo'='semanal' then
  if not (cfg->'dias')@>jsonb_build_array(extract(dow from p_data)::int) then return 'Folga da escala'; end if;
 else
  ciclo:=(cfg->>'trabalho')::int+(cfg->>'folga')::int;
  pos:=((p_data-(cfg->>'base')::date)%ciclo+ciclo)%ciclo;
  if pos>=(cfg->>'trabalho')::int then return 'Folga da escala'; end if;
 end if;
 return null;
end $$;
create function public.rh_escala_motivo(p_empresa uuid,p_func uuid,p_janela tsrange) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select rh_escala_dia(p_empresa,p_func,d::date) from generate_series(lower(p_janela)::date,(upper(p_janela)-interval '1 microsecond')::date,interval '1 day') d
 where rh_escala_dia(p_empresa,p_func,d::date) is not null order by d limit 1
$$;

-- Mantém todas as restrições existentes; o gerador automático já usa esta função.
alter function public.escala_pessoa_compativel(uuid,uuid,uuid,uuid) rename to escala_pessoa_compativel_sem_rh;
revoke all on function public.escala_pessoa_compativel_sem_rh(uuid,uuid,uuid,uuid) from public,anon,authenticated;
create function public.escala_pessoa_compativel(p_empresa uuid,p_etapa uuid,p_func uuid,p_free uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select (p_func is null or not exists(select 1 from operacao_etapas e where e.id=p_etapa and e.empresa_id=p_empresa and rh_escala_motivo(p_empresa,p_func,operacao_janela(e.data,e.hora,e.tipo,operacao_regras_escala(p_empresa))) is not null))
 and escala_pessoa_compativel_sem_rh(p_empresa,p_etapa,p_func,p_free)
$$;
create function public.rh_proteger_alocacao() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare e record; motivo text;
begin
 if new.funcionario_id is null then return new; end if;
 select * into e from operacao_etapas where id=new.etapa_id and empresa_id=new.empresa_id;
 if not found then raise exception 'Etapa inválida.'; end if;
 motivo:=rh_escala_motivo(new.empresa_id,new.funcionario_id,operacao_janela(e.data,e.hora,e.tipo,operacao_regras_escala(new.empresa_id)));
 if motivo is not null then raise exception 'Funcionário indisponível: %.',motivo; end if;
 return new;
end $$;
create trigger a_rh_disponibilidade before insert or update on public.operacao_etapa_pessoas for each row execute function public.rh_proteger_alocacao();
create function public.rh_proteger_data_etapa() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; motivo text;
begin
 if (new.data,new.hora,new.tipo) is not distinct from (old.data,old.hora,old.tipo) then return new; end if;
 for p in select funcionario_id from operacao_etapa_pessoas where etapa_id=new.id and funcionario_id is not null loop
  motivo:=rh_escala_motivo(new.empresa_id,p.funcionario_id,operacao_janela(new.data,new.hora,new.tipo,operacao_regras_escala(new.empresa_id)));
  if motivo is not null then raise exception 'A nova data possui funcionário indisponível: %.',motivo; end if;
 end loop;
 return new;
end $$;
create trigger a_rh_data_etapa before update of data,hora,tipo on public.operacao_etapas for each row execute function public.rh_proteger_data_etapa();

create function public.rh_escala_contexto(p_empresa uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not seguranca_2fa_ok() or not rh_pode(p_empresa,'rh.colaboradores.visualizar') then raise exception 'Sem permissão para consultar a escala.'; end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>62 then raise exception 'Consulte até 63 dias por vez.'; end if;
 return jsonb_build_object(
 'regras',coalesce((select jsonb_agg(to_jsonb(j) order by j.vigencia desc) from rh_jornadas j where j.empresa_id=p_empresa),'[]'),
 'ausencias',coalesce((select jsonb_agg(to_jsonb(a) order by a.inicio) from rh_ausencias a where a.empresa_id=p_empresa and not a.cancelada and a.inicio<=p_fim and a.fim>=p_inicio),'[]'),
 'dias',coalesce((select jsonb_agg(jsonb_build_object('funcionario_id',f.id,'data',d::date,'motivo',rh_escala_dia(p_empresa,f.id,d::date))) from funcionarios_acesso f cross join generate_series(p_inicio,p_fim,interval '1 day') d where f.empresa_id=p_empresa and f.ativo),'[]'));
end $$;
create function public.rh_disponibilidade_logistica(p_inicio date,p_fim date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare emp uuid:=gs_empresa_dona();
begin
 if not seguranca_2fa_ok() or not eh_membro_empresa(emp) or not (funcionario_pode(emp,auth.uid(),'logistica.planejamento.visualizar') or funcionario_pode(emp,auth.uid(),'logistica.planejamento.editar')) then raise exception 'Sem permissão para consultar a disponibilidade.'; end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>62 then raise exception 'Consulte até 63 dias por vez.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('etapa_id',e.id,'funcionario_id',f.id,'motivo',m.motivo))
 from operacao_etapas e cross join funcionarios_acesso f cross join lateral (select rh_escala_motivo(emp,f.id,operacao_janela(e.data,e.hora,e.tipo,operacao_regras_escala(emp))) motivo) m
 where e.empresa_id=emp and e.data between p_inicio and p_fim and f.empresa_id=emp and (f.ativo or exists(select 1 from operacao_etapa_pessoas p where p.etapa_id=e.id and p.funcionario_id=f.id)) and m.motivo is not null),'[]');
end $$;

revoke all on function public.rh_jornada_salvar(uuid,uuid,jsonb),public.rh_ausencia_salvar(uuid,jsonb),public.rh_ausencia_cancelar(uuid,uuid),public.rh_jornada_no_dia(uuid,uuid,date),public.rh_escala_dia(uuid,uuid,date),public.rh_escala_motivo(uuid,uuid,tsrange),public.escala_pessoa_compativel(uuid,uuid,uuid,uuid),public.rh_proteger_alocacao(),public.rh_proteger_data_etapa(),public.rh_escala_contexto(uuid,date,date),public.rh_disponibilidade_logistica(date,date) from public,anon,authenticated;
grant execute on function public.rh_jornada_salvar(uuid,uuid,jsonb),public.rh_ausencia_salvar(uuid,jsonb),public.rh_ausencia_cancelar(uuid,uuid),public.rh_escala_contexto(uuid,date,date),public.rh_disponibilidade_logistica(date,date) to authenticated;
notify pgrst,'reload schema';
