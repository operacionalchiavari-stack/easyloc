-- Free automático (nov/2026): a escala do Painel Logístico escolhe os free; quando o Comercial confirma as datas do pedido
-- e falta no máximo N dias para a etapa, a vaga vai sozinha para o App do Freelancer. Primeiro só para os escalados;
-- depois de X horas, para todos os free aprovados. Diária, encontro e ponto vêm daqui; líder = responsável da etapa.
alter table public.free_vagas add column if not exists automatica boolean not null default false;

create table if not exists public.free_automacao_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ativa boolean not null default false,
  antecedencia_dias int not null default 7 check (antecedencia_dias between 0 and 90),
  encontro_min_antes int not null default 30 check (encontro_min_antes between 0 and 600),
  ponto_encontro text not null default '',
  ponto_lat numeric, ponto_lng numeric,
  horas_prioridade int not null default 4 check (horas_prioridade between 0 and 168),
  diarias jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.free_automacao_config enable row level security;
revoke all on public.free_automacao_config from anon,authenticated;

create or replace function public.free_automacao_parametros(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  return coalesce((select to_jsonb(c)-'empresa_id' from free_automacao_config c where c.empresa_id=p_empresa),
    jsonb_build_object('ativa',false,'antecedencia_dias',7,'encontro_min_antes',30,'ponto_encontro','','horas_prioridade',4,'diarias','{}'::jsonb))
    ||jsonb_build_object('pode_editar',coalesce(escala_controle_pode(p_empresa),false));
end $$;

create or replace function public.free_automacao_salvar(p_empresa uuid,p_config jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare d jsonb:='{}'::jsonb; k text;
begin
  if not coalesce(escala_controle_pode(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false) then
    raise exception 'Sem permissão para alterar o free automático' using errcode='42501';
  end if;
  for k in select unnest(array['montagem','desmontagem','carregamento','descarregamento','triagem']) loop
    if coalesce((p_config->'diarias'->>k)::numeric,0)>0 then d:=d||jsonb_build_object(k,round((p_config->'diarias'->>k)::numeric,2));end if;
  end loop;
  if coalesce((p_config->>'ativa')::boolean,false) and d='{}'::jsonb then raise exception 'Informe a diária de pelo menos um tipo de etapa';end if;
  insert into free_automacao_config(empresa_id,ativa,antecedencia_dias,encontro_min_antes,ponto_encontro,ponto_lat,ponto_lng,horas_prioridade,diarias,atualizado_em)
  values(p_empresa,coalesce((p_config->>'ativa')::boolean,false),coalesce((p_config->>'antecedencia_dias')::int,7),
    coalesce((p_config->>'encontro_min_antes')::int,30),left(btrim(coalesce(p_config->>'ponto_encontro','')),300),
    nullif(p_config->>'ponto_lat','')::numeric,nullif(p_config->>'ponto_lng','')::numeric,coalesce((p_config->>'horas_prioridade')::int,4),d,now())
  on conflict(empresa_id) do update set ativa=excluded.ativa,antecedencia_dias=excluded.antecedencia_dias,encontro_min_antes=excluded.encontro_min_antes,
    ponto_encontro=excluded.ponto_encontro,ponto_lat=excluded.ponto_lat,ponto_lng=excluded.ponto_lng,horas_prioridade=excluded.horas_prioridade,
    diarias=excluded.diarias,atualizado_em=now();
  perform free_automacao_processar(p_empresa);
end $$;

-- Roda pelo agendador (todas as empresas), ao confirmar datas e ao abrir a aba Free anunciados.
create or replace function public.free_automacao_processar(p_empresa uuid default null) returns int
language plpgsql security definer set search_path=public as $$
declare cfg free_automacao_config; e record; v free_vagas; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
  escalados uuid[]; lider text; diaria numeric; horario text; ponto text; conf int; n int:=0;
begin
  for cfg in select * from free_automacao_config where ativa and (p_empresa is null or empresa_id=p_empresa) loop
    perform pg_advisory_xact_lock(hashtextextended('free_automatico:'||cfg.empresa_id::text,0));
    -- etapas com free escalado, dentro da antecedência
    for e in
      select et.*,p.local_nome,p.data_entrega pe,p.data_evento pv,p.data_coleta pc
        from operacao_etapas et join separacoes_pedidos p on p.id=et.pedido_id and p.empresa_id=cfg.empresa_id
       where et.empresa_id=cfg.empresa_id and et.servico_ref is null and et.data between hoje and hoje+cfg.antecedencia_dias
         and (et.data>hoje or et.hora is null or et.hora>(now() at time zone 'America/Sao_Paulo')::time)
         and p.status_comercial in ('aprovado','enviado','finalizado') and coalesce(p.status,'')<>'cancelado' and p.encerrado_operacional_em is null
         and exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id=et.id and ep.empresa_id=cfg.empresa_id and ep.free_id is not null)
    loop
      begin
        -- só depois de o Comercial confirmar as datas atuais do pedido
        if not exists(select 1 from comercial_confirmacoes_datas c where c.pedido_id=e.pedido_id and c.empresa_id=cfg.empresa_id
             and c.data_entrega is not distinct from e.pe and c.data_evento is not distinct from e.pv and c.data_coleta is not distinct from e.pc) then continue;end if;
        select array_agg(distinct ep.free_id) into escalados from operacao_etapa_pessoas ep
          where ep.etapa_id=e.id and ep.empresa_id=cfg.empresa_id and ep.free_id is not null;
        select * into v from free_vagas where etapa_id=e.id and empresa_id=cfg.empresa_id and status<>'CANCELADA' limit 1 for update;
        if v.id is null then
          diaria:=nullif(cfg.diarias->>e.tipo,'')::numeric;
          if coalesce(diaria,0)<=0 or e.hora is null then continue;end if;
          select coalesce(nullif(btrim(ep.nome),''),f.nome) into lider from operacao_etapa_pessoas ep
            left join funcionarios_acesso f on f.id=ep.funcionario_id
            where ep.etapa_id=e.id and ep.empresa_id=cfg.empresa_id and ep.papel='responsavel' limit 1;
          horario:=to_char(e.hora-make_interval(mins=>cfg.encontro_min_antes),'HH24:MI');
          ponto:=coalesce(nullif(cfg.ponto_encontro,''),nullif(e.local_nome,''),'Local do evento');
          insert into free_vagas(empresa_id,etapa_id,horario,horario_etapa_base,ponto_encontro,ponto_lat,ponto_lng,lider,quantidade,observacao,
            valor,modo,preferidos,liberar_em,criado_por,automatica)
          values(cfg.empresa_id,e.id,horario,to_char(e.hora,'HH24:MI'),ponto,
            case when cfg.ponto_encontro<>'' then cfg.ponto_lat end,case when cfg.ponto_encontro<>'' then cfg.ponto_lng end,
            coalesce(nullif(lider,''),'Responsável da etapa'),greatest(1,least(50,cardinality(escalados))),'',diaria,
            'PRIORIDADE',escalados,now()+make_interval(hours=>cfg.horas_prioridade),'Free automático',true);
          n:=n+1;
        elsif v.automatica and v.status='ABERTA' then
          select count(*) into conf from free_inscricoes i where i.vaga_id=v.id and i.status='CONFIRMADO';
          if v.preferidos is distinct from escalados or v.quantidade<>greatest(1,least(50,greatest(cardinality(escalados),conf))) then
            update free_vagas set preferidos=escalados,quantidade=greatest(1,least(50,greatest(cardinality(escalados),conf))),atualizado_em=now() where id=v.id;
          end if;
        end if;
      exception when others then
        raise warning 'free automático, etapa %: %',e.id,sqlerrm;
      end;
    end loop;
    -- vaga automática cuja etapa ficou sem free escalado e sem ninguém confirmado: cancela
    update free_vagas fv set status='CANCELADA',atualizado_em=now()
     where fv.empresa_id=cfg.empresa_id and fv.automatica and fv.status='ABERTA'
       and not exists(select 1 from operacao_etapa_pessoas ep where ep.etapa_id=fv.etapa_id and ep.free_id is not null)
       and not exists(select 1 from free_inscricoes i where i.vaga_id=fv.id and i.status='CONFIRMADO');
  end loop;
  return n;
end $$;
revoke all on function public.free_automacao_processar(uuid) from public,anon,authenticated;

create or replace function public.free_automacao_rodar(p_empresa uuid) returns int
language plpgsql security definer set search_path=public as $$
begin perform logistica_servicos_autorizar(p_empresa); return free_automacao_processar(p_empresa); end $$;

revoke all on function public.free_automacao_parametros(uuid),public.free_automacao_salvar(uuid,jsonb),public.free_automacao_rodar(uuid) from public,anon;
grant execute on function public.free_automacao_parametros(uuid),public.free_automacao_salvar(uuid,jsonb),public.free_automacao_rodar(uuid) to authenticated;

-- Confirmou as datas: publica na hora (sem esperar o agendador).
create or replace function public.free_automacao_ao_confirmar() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  begin perform free_automacao_processar(new.empresa_id);
  exception when others then raise warning 'free automático: %',sqlerrm; end;
  return new;
end $$;
revoke all on function public.free_automacao_ao_confirmar() from public,anon,authenticated;
drop trigger if exists free_automacao_confirmacao on public.comercial_confirmacoes_datas;
create trigger free_automacao_confirmacao after insert or update on public.comercial_confirmacoes_datas
  for each row execute function public.free_automacao_ao_confirmar();

do $$ begin
  perform cron.unschedule('free-automatico') where exists(select 1 from cron.job where jobname='free-automatico');
  perform cron.schedule('free-automatico','*/5 * * * *','select public.free_automacao_processar()');
end $$;
notify pgrst,'reload schema';
