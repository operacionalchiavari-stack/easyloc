-- Uber automatico: somente o excedente de pessoas sobre a lotacao cadastrada dos caminhoes.
create table public.uber_automacao_config (
 empresa_id uuid primary key references public.empresas(id) on delete cascade,
 ativa boolean not null default false,
 montagem boolean not null default true,
 desmontagem boolean not null default true,
 passageiros_carro integer not null default 4 check(passageiros_carro between 1 and 6),
 antecedencia_horas integer not null default 24 check(antecedencia_horas between 1 and 168),
 ponto_encontro text not null default '',
 ida_volta boolean not null default false,
 lugares_caminhoes jsonb not null default '{}' check(jsonb_typeof(lugares_caminhoes)='object')
);
alter table public.uber_automacao_config enable row level security;
grant select on public.uber_automacao_config to authenticated;
create policy uber_automacao_ler on public.uber_automacao_config for select to authenticated
 using(public.operacao_pode(empresa_id,'logistica.planejamento.visualizar'));
create policy seguranca_2fa on public.uber_automacao_config as restrictive for all to authenticated
 using((select public.seguranca_2fa_ok())) with check((select public.seguranca_2fa_ok()));
alter table public.uber_vagas add column if not exists automatica boolean not null default false;
create unique index uber_automatica_etapa_uk on public.uber_vagas(etapa_id) where automatica;

create function public.uber_automacao_salvar(p_empresa uuid,p_config jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare k text; v jsonb; ativa boolean:=coalesce((p_config->>'ativa')::boolean,false);
begin
 if not escala_controle_pode(p_empresa) then raise exception 'Sem permissao para alterar os parametros.';end if;
 if jsonb_typeof(coalesce(p_config->'lugares_caminhoes','{}'))<>'object' then raise exception 'Lotacoes invalidas.';end if;
 for k,v in select * from jsonb_each(coalesce(p_config->'lugares_caminhoes','{}')) loop
  if not exists(select 1 from caminhoes where id::text=k and empresa_id=p_empresa) then raise exception 'Caminhao nao encontrado nesta empresa.';end if;
  if jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or (v::text)::int not between 0 and 20 then raise exception 'Informe de 0 a 20 lugares para a equipe.';end if;
 end loop;
 if ativa and nullif(btrim(p_config->>'ponto_encontro'),'') is null then raise exception 'Informe o endereco do galpao.';end if;
 if ativa and not coalesce((p_config->>'montagem')::boolean,false) and not coalesce((p_config->>'desmontagem')::boolean,false) then raise exception 'Selecione ao menos uma etapa.';end if;
 insert into uber_automacao_config(empresa_id,ativa,montagem,desmontagem,passageiros_carro,antecedencia_horas,ponto_encontro,ida_volta,lugares_caminhoes)
 values(p_empresa,ativa,coalesce((p_config->>'montagem')::boolean,false),coalesce((p_config->>'desmontagem')::boolean,false),(p_config->>'passageiros_carro')::int,(p_config->>'antecedencia_horas')::int,btrim(coalesce(p_config->>'ponto_encontro','')),coalesce((p_config->>'ida_volta')::boolean,false),coalesce(p_config->'lugares_caminhoes','{}'))
 on conflict(empresa_id) do update set ativa=excluded.ativa,montagem=excluded.montagem,desmontagem=excluded.desmontagem,passageiros_carro=excluded.passageiros_carro,antecedencia_horas=excluded.antecedencia_horas,ponto_encontro=excluded.ponto_encontro,ida_volta=excluded.ida_volta,lugares_caminhoes=excluded.lugares_caminhoes;
end $$;
revoke all on function public.uber_automacao_salvar(uuid,jsonb) from public,anon;
grant execute on function public.uber_automacao_salvar(uuid,jsonb) to authenticated;

-- Executada pelo agendador do banco, independente do painel estar aberto.
create function public.uber_automacao_processar() returns integer
language plpgsql security definer set search_path=public as $$
declare r record; pessoas int; lugares int; desconhecidos int; existentes int; carros int; km numeric; valor numeric; destino text; criadas int:=0;
 agora timestamp:=(now() at time zone 'America/Sao_Paulo');
begin
 for r in select e.id,e.empresa_id,e.pedido_id,e.data,e.hora,p.local_id,c.ativa,c.montagem,c.desmontagem,c.passageiros_carro,c.antecedencia_horas,c.ponto_encontro,c.ida_volta,c.lugares_caminhoes
 from operacao_etapas e join uber_automacao_config c on c.empresa_id=e.empresa_id
 join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=e.empresa_id
 where c.ativa and ((e.tipo='montagem' and c.montagem) or(e.tipo='desmontagem' and c.desmontagem))
 and p.status_comercial in('aprovado','enviado','finalizado') and coalesce(p.status,'')<>'cancelado'
 and e.hora is not null and e.data+e.hora>agora and e.data+e.hora<=agora+make_interval(hours=>c.antecedencia_horas)
 loop
  perform pg_advisory_xact_lock(hashtextextended('uber-auto:'||r.id::text,0));
  if exists(select 1 from uber_vagas where etapa_id=r.id and automatica) then continue;end if;
  select count(distinct lower(btrim(nome))) into pessoas from operacao_etapa_pessoas where etapa_id=r.id and nullif(btrim(nome),'') is not null;
  if pessoas=0 then continue;end if;
  select count(*) filter(where not(r.lugares_caminhoes ? caminhao_id::text)),coalesce(sum((r.lugares_caminhoes->>caminhao_id::text)::int),0)
  into desconhecidos,lugares from operacao_etapa_caminhoes where etapa_id=r.id;
  if desconhecidos>0 then continue;end if; -- nunca adivinhar lotacao nao cadastrada
  select coalesce(sum(quantidade),0) into existentes from uber_vagas where etapa_id=r.id and status='aberta';
  carros:=ceil(greatest(pessoas-lugares-existentes*r.passageiros_carro,0)::numeric/r.passageiros_carro);
  if carros<1 or carros>30 then continue;end if;
  select distancia_galpao_km,concat_ws(', ',nullif(endereco,''),nullif(numero_endereco::text,'')) into km,destino
   from locais_empresas where id=r.local_id and empresa_id=r.empresa_id;
  if coalesce(km,0)<=0 or nullif(btrim(destino),'') is null then continue;end if;
  valor:=uber_valor_trecho(r.empresa_id,km)*case when r.ida_volta then 2 else 1 end;
  if valor<=0 then continue;end if;
  insert into uber_vagas(empresa_id,etapa_id,pedido_id,quantidade,ida_volta,ponto_encontro,destino,km,valor,data,hora,obs,automatica)
   values(r.empresa_id,r.id,r.pedido_id,carros,r.ida_volta,r.ponto_encontro,destino,km,valor,r.data,r.hora,
    'Automatico: '||pessoas||' pessoas na equipe e '||lugares||' lugares nos caminhoes.',true);
  criadas:=criadas+1;
 end loop;
 return criadas;
end $$;
revoke all on function public.uber_automacao_processar() from public,anon,authenticated;
-- pg_cron ja faz parte da infraestrutura de agendamentos deste projeto.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('uber-automatico-lotacao','*/5 * * * *','select public.uber_automacao_processar()');
 end if;
end $$;
