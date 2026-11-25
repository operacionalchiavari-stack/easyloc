-- Divergências com os dois lados (22/11/2026). O supervisor (Logística › Divergências) dá a palavra final; o parceiro argumenta no
-- app dele (frete já tinha; agora Uber e Free); o Financeiro (Fechamentos de parceiros: frete e Uber) e o RH (Pagamento de Freelancer:
-- free) acompanham as duas justificativas. O pagamento do free só vai ao financeiro sem divergência aberta.

create table if not exists public.logistica_div_explicacoes (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  chave text not null,
  autor text not null default '',
  texto text not null,
  criado_em timestamptz not null default now(),
  primary key (empresa_id, chave)
);
alter table public.logistica_div_explicacoes enable row level security;
revoke all on public.logistica_div_explicacoes from anon,authenticated;


-- frete_div_lista exige a permissão da Logística; a leitura dos dados vira frete_div_dados (sem conferir, uso interno).
do $$ declare d text; ln text:='if not operacao_pode(p_empresa, ''logistica.planejamento.visualizar'') then raise exception ''Sem permissão.''; end if;';
begin
  if exists(select 1 from pg_proc where proname='frete_div_dados') then return; end if;
  d:=pg_get_functiondef('public.frete_div_lista(uuid)'::regprocedure);
  if position(ln in d)=0 then raise exception 'frete_div_lista mudou: revisar esta migração'; end if;
  d:=replace(replace(d,ln,''),'public.frete_div_lista(','public.frete_div_dados(');
  execute d;
end $$;
revoke all on function public.frete_div_dados(uuid) from public,anon,authenticated;
create or replace function public.frete_div_lista(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not operacao_pode(p_empresa,'logistica.planejamento.visualizar') then raise exception 'Sem permissão.';end if;
  return frete_div_dados(p_empresa);
end $$;

-- Os dados (sem conferir permissão; quem chama confere). Mesma regra de antes + a explicação do parceiro em cada divergência.
create or replace function public.logistica_divergencias_dados(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare fretes jsonb; abertas jsonb; resolvidas jsonb;
begin
  fretes:=frete_div_dados(p_empresa);
  select coalesce(jsonb_agg(c.dados||jsonb_build_object('chave',c.chave,'versao',c.versao,'explicacao',x.texto,'explicacao_em',x.criado_em) order by c.dados->>'data'),'[]'::jsonb)
    into abertas from logistica_divergencias_candidatas(p_empresa) c
    left join logistica_div_explicacoes x on x.empresa_id=p_empresa and x.chave=c.chave
    where not exists(select 1 from logistica_divergencias_tratamentos t where t.empresa_id=p_empresa and t.chave=c.chave and t.versao=c.versao);
  select coalesce(jsonb_agg(t.dados||jsonb_build_object('chave',t.chave,'versao',t.versao,'motivo',t.motivo,
    'tratado_por',t.tratado_por_nome,'tratado_em',t.tratado_em,'explicacao',x.texto,'explicacao_em',x.criado_em) order by t.tratado_em desc),'[]'::jsonb)
    into resolvidas from logistica_divergencias_tratamentos t
    left join logistica_div_explicacoes x on x.empresa_id=p_empresa and x.chave=t.chave
    where t.empresa_id=p_empresa and t.tratado_em>now()-interval '30 days';
  select abertas||coalesce(jsonb_agg(jsonb_build_object('origem','frete','chave','frete:'||(f->>'id'),'referencia',f->>'id',
      'tipo','valor','nome',f->>'freteiro','data',f->>'data','local',f->>'destino','titulo',case f->>'divergencia'
        when 'sem_frete' then 'Frete não encontrado no sistema' when 'nao_lancado' then 'Frete não lançado no relatório' else 'Valor diferente do combinado' end,
      'valor_previsto',f->'valor_sistema','valor_informado',coalesce(f->'total',f->'valor'),'explicacao',f->>'explicacao','explicacao_em',f->>'explicacao_em','registro',f)),'[]'::jsonb)
    into abertas from jsonb_array_elements(coalesce(fretes->'abertas','[]')) f;
  select resolvidas||coalesce(jsonb_agg(jsonb_build_object('origem','frete','chave','frete:'||(f->>'id'),'tipo','valor',
      'nome',f->>'freteiro','data',f->>'data','local',f->>'destino','titulo','Divergência de frete',
      'motivo',f->>'decisao_motivo','tratado_por',f->>'decisao_por','tratado_em',f->>'decisao_em','valor_previsto',f->'valor_sistema',
      'valor_informado',f->'valor_final','explicacao',f->>'explicacao','registro',f)),'[]'::jsonb)
    into resolvidas from jsonb_array_elements(coalesce(fretes->'resolvidas','[]')) f;
  return jsonb_build_object('abertas',abertas,'resolvidas',resolvidas);
end $$;
revoke all on function public.logistica_divergencias_dados(uuid) from public,anon,authenticated;

create or replace function public.logistica_divergencias_lista(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin perform logistica_servicos_autorizar(p_empresa); return logistica_divergencias_dados(p_empresa); end $$;

-- Financeiro (frete e Uber) e RH (free) só acompanham. Também devolve os relatórios de frete enviados ainda em conferência.
create or replace function public.divergencias_acompanhar(p_empresa uuid,p_origens text[]) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d jsonb; pode boolean;
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false) then
    raise exception 'Sem permissão' using errcode='42501';
  end if;
  pode:=coalesce(operacao_pode(p_empresa,'logistica.planejamento.visualizar'),false)
    or (p_origens && array['frete','uber'] and coalesce(operacao_pode(p_empresa,'financeiro.fluxo.visualizar'),false))
    or (p_origens && array['free'] and coalesce(operacao_pode(p_empresa,'rh.colaboradores.visualizar'),false));
  if not pode then raise exception 'Sem permissão' using errcode='42501';end if;
  d:=logistica_divergencias_dados(p_empresa);
  return jsonb_build_object(
    'abertas',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'abertas') x where x->>'origem'=any(p_origens)),'[]'::jsonb),
    'resolvidas',coalesce((select jsonb_agg(x) from jsonb_array_elements(d->'resolvidas') x where x->>'origem'=any(p_origens)),'[]'::jsonb),
    'relatorios',case when 'frete'=any(p_origens) then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'freteiro',f.nome,'periodo_ini',r.periodo_ini,
        'periodo_fim',r.periodo_fim,'status',r.status,'enviado_em',r.enviado_em,'total',r.total_informado) order by r.enviado_em desc)
      from frete_relatorios r left join frete_freteiros f on f.id=r.freteiro_id
      where r.empresa_id=p_empresa and r.status='enviado'),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.divergencias_acompanhar(uuid,text[]) from public,anon;
grant execute on function public.divergencias_acompanhar(uuid,text[]) to authenticated;

-- Apps: o parceiro vê as próprias divergências e explica.
create or replace function public.app_divergencias_minhas(p_empresa uuid,p_origem text,p_pessoa uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  with d as (select logistica_divergencias_dados(p_empresa) j),
  minhas as (
    select x,false resolvida from d,jsonb_array_elements(d.j->'abertas') x
    union all select x,true from d,jsonb_array_elements(d.j->'resolvidas') x)
  select coalesce(jsonb_agg(m.x||jsonb_build_object('resolvida',m.resolvida) order by m.resolvida,m.x->>'data' desc),'[]'::jsonb) from minhas m
  where m.x->>'origem'=p_origem and (
    (p_origem='free' and exists(select 1 from free_inscricoes i where i.id::text=m.x->>'referencia' and i.free_id=p_pessoa))
    or (p_origem='uber' and exists(select 1 from uber_corridas c where c.id::text=m.x->>'referencia' and c.motorista_id=p_pessoa)))
$$;
revoke all on function public.app_divergencias_minhas(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.app_div_explicar_(s app_sessoes,p_origem text,p_chave text,p_texto text) returns void
language plpgsql security definer set search_path=public as $$
declare ref text:=split_part(p_chave,':',2);
begin
  if length(btrim(coalesce(p_texto,'')))<3 then raise exception 'Escreva a sua explicação.';end if;
  if split_part(p_chave,':',1)<>p_origem then raise exception 'Divergência não encontrada.';end if;
  if (p_origem='free' and not exists(select 1 from free_inscricoes where id::text=ref and free_id=s.free_id))
     or (p_origem='uber' and not exists(select 1 from uber_corridas where id::text=ref and motorista_id=s.motorista_id)) then
    raise exception 'Divergência não encontrada.';
  end if;
  insert into logistica_div_explicacoes(empresa_id,chave,autor,texto,criado_em) values(s.empresa_id,p_chave,coalesce(s.nome,''),left(btrim(p_texto),2000),now())
  on conflict(empresa_id,chave) do update set texto=excluded.texto,autor=excluded.autor,criado_em=now();
end $$;
revoke all on function public.app_div_explicar_(app_sessoes,text,text,text) from public,anon,authenticated;

create or replace function public.free_app_divergencias(p_token text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'free');
begin return app_divergencias_minhas(s.empresa_id,'free',s.free_id); end $$;
create or replace function public.free_app_div_explicar(p_token text,p_chave text,p_texto text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'free');
begin perform app_div_explicar_(s,'free',p_chave,p_texto); return app_divergencias_minhas(s.empresa_id,'free',s.free_id); end $$;
create or replace function public.uber_app_divergencias(p_token text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'motorista');
begin return app_divergencias_minhas(s.empresa_id,'uber',s.motorista_id); end $$;
create or replace function public.uber_app_div_explicar(p_token text,p_chave text,p_texto text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s app_sessoes:=app_sessao(p_token,'motorista');
begin perform app_div_explicar_(s,'uber',p_chave,p_texto); return app_divergencias_minhas(s.empresa_id,'uber',s.motorista_id); end $$;
revoke all on function public.free_app_divergencias(text),public.free_app_div_explicar(text,text,text),public.uber_app_divergencias(text),public.uber_app_div_explicar(text,text,text) from public;
grant execute on function public.free_app_divergencias(text),public.free_app_div_explicar(text,text,text),public.uber_app_divergencias(text),public.uber_app_div_explicar(text,text,text) to anon,authenticated;

-- Pagamento do free: não vai ao financeiro com divergência aberta naquela diária.
do $$ begin
  if not exists(select 1 from pg_proc where proname='free_rh_enviar_financeiro_base') then
    alter function public.free_rh_enviar_financeiro(uuid,jsonb,date,text) rename to free_rh_enviar_financeiro_base;
  end if;
end $$;
revoke all on function public.free_rh_enviar_financeiro_base(uuid,jsonb,date,text) from public,anon,authenticated;
create or replace function public.free_rh_enviar_financeiro(p_empresa uuid,p_itens jsonb,p_vencimento date,p_obs text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare abertas jsonb; nomes text;
begin
  if not free_rh_pode(p_empresa) then raise exception 'Sem permissão para enviar pagamentos de freelancer.';end if;
  abertas:=logistica_divergencias_dados(p_empresa)->'abertas';
  select string_agg(distinct x->>'nome',', ') into nomes from jsonb_array_elements(abertas) x
   where x->>'origem'='free' and x->>'referencia' in (select i->>'inscricao' from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) i);
  if nomes is not null then
    raise exception 'Há divergência aberta para %. A Logística precisa decidir (Painel Logístico › Divergências) antes do pagamento.',nomes;
  end if;
  return free_rh_enviar_financeiro_base(p_empresa,p_itens,p_vencimento,p_obs);
end $$;
revoke all on function public.free_rh_enviar_financeiro(uuid,jsonb,date,text) from public,anon;
grant execute on function public.free_rh_enviar_financeiro(uuid,jsonb,date,text) to authenticated;
notify pgrst,'reload schema';
