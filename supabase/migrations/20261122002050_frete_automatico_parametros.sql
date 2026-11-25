-- Frete automático em Parâmetros (22/11): liga/desliga, antecedência e esperar a confirmação das datas pelo Comercial.
-- Sem configuração = como antes (ligado, sem limite de dias, sem exigir confirmação). Só vale para anúncios NOVOS.
create table if not exists public.frete_automacao_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ativa boolean not null default true,
  antecedencia_dias int not null default 3650 check (antecedencia_dias between 0 and 3650),
  exigir_confirmacao boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table public.frete_automacao_config enable row level security;
revoke all on public.frete_automacao_config from anon,authenticated;

create or replace function public.pedido_datas_confirmadas(p_empresa uuid,p_pedido uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from separacoes_pedidos p join comercial_confirmacoes_datas c on c.pedido_id=p.id and c.empresa_id=p_empresa
    where p.id=p_pedido and p.empresa_id=p_empresa and c.data_entrega is not distinct from p.data_entrega
      and c.data_evento is not distinct from p.data_evento and c.data_coleta is not distinct from p.data_coleta)
$$;
revoke all on function public.pedido_datas_confirmadas(uuid,uuid) from public,anon,authenticated;

create or replace function public.frete_automacao_parametros(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  perform logistica_servicos_autorizar(p_empresa);
  return coalesce((select to_jsonb(c)-'empresa_id' from frete_automacao_config c where c.empresa_id=p_empresa),
      jsonb_build_object('ativa',true,'antecedencia_dias',3650,'exigir_confirmacao',false))
    ||jsonb_build_object('pode_editar',coalesce(escala_controle_pode(p_empresa),false),'galpao',frete_galpao(p_empresa),
      'escala_automatica',coalesce((select automatica from empresa_escala_controle where empresa_id=p_empresa),true));
end $$;

create or replace function public.frete_automacao_salvar(p_empresa uuid,p_config jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(escala_controle_pode(p_empresa),false) or not coalesce(seguranca_2fa_ok(),false) then
    raise exception 'Sem permissão para alterar o frete automático' using errcode='42501';
  end if;
  insert into frete_automacao_config(empresa_id,ativa,antecedencia_dias,exigir_confirmacao,atualizado_em)
  values(p_empresa,coalesce((p_config->>'ativa')::boolean,true),least(3650,greatest(0,coalesce((p_config->>'antecedencia_dias')::int,3650))),
    coalesce((p_config->>'exigir_confirmacao')::boolean,false),now())
  on conflict(empresa_id) do update set ativa=excluded.ativa,antecedencia_dias=excluded.antecedencia_dias,
    exigir_confirmacao=excluded.exigir_confirmacao,atualizado_em=now();
end $$;
revoke all on function public.frete_automacao_parametros(uuid),public.frete_automacao_salvar(uuid,jsonb) from public,anon;
grant execute on function public.frete_automacao_parametros(uuid),public.frete_automacao_salvar(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.frete_anuncios_sincronizar(p_empresa uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g record; a frete_anuncios; calc jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  auto boolean := coalesce((select automatica from empresa_escala_controle where empresa_id = p_empresa), true);
  cam uuid; n int := 0; cfg frete_automacao_config; vdest text; vend text; vlat numeric; vlng numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('frete_anuncios:' || p_empresa::text, 0));
  select * into cfg from frete_automacao_config where empresa_id = p_empresa;
  for g in
    select e.pedido_id, frete_direcao(e.tipo) dir,
           array_agg(e.id order by e.data, e.hora nulls first) etapas,
           (array_agg(e.data order by e.data, e.hora nulls first))[1] data,
           (array_agg(e.hora order by e.data, e.hora nulls first))[1] hora
      from operacao_etapas e join separacoes_pedidos p on p.id = e.pedido_id
     where e.empresa_id = p_empresa and e.servico_ref is null and frete_direcao(e.tipo) is not null and e.data >= hoje
       and p.status_comercial in ('aprovado', 'enviado', 'finalizado')
       and coalesce(p.status, '') <> 'cancelado' and p.encerrado_operacional_em is null
     group by 1, 2
  loop
    select * into a from frete_anuncios where pedido_id = g.pedido_id and direcao = g.dir and status <> 'cancelado' for update;
    select p.local_nome, l.endereco, l.latitude, l.longitude into vdest, vend, vlat, vlng
      from separacoes_pedidos p left join locais_empresas l on l.id = p.local_id where p.id = g.pedido_id;
    vdest := concat_ws(' · ', nullif(btrim(coalesce(vdest, '')), ''), nullif(btrim(coalesce(vend, '')), ''));
    if coalesce(vdest, '') = '' then vdest := 'Local do evento'; end if;

    -- caminhão próprio (ou de transportadora) já escalado: não precisa de freteiro
    if exists (select 1 from operacao_etapa_caminhoes ec join caminhoes k on k.id = ec.caminhao_id
                where ec.etapa_id = any(g.etapas) and k.freteiro_id is null) then
      if a.id is not null and a.status = 'aberto' then
        update frete_anuncios set status = 'cancelado', cancelado_em = now(), updated_at = now() where id = a.id;
      end if;
      continue;
    end if;

    if a.id is null then
      if not auto or not logistica_anuncio_datas_liberadas(p_empresa,g.pedido_id) then continue; end if;
      -- Parâmetros › Frete automático: desligado, fora da antecedência ou esperando a confirmação do Comercial
      if not coalesce(cfg.ativa, true) or g.data > hoje + coalesce(cfg.antecedencia_dias, 3650) then continue; end if;
      if coalesce(cfg.exigir_confirmacao, false) and not pedido_datas_confirmadas(p_empresa, g.pedido_id) then continue; end if;
      perform operacao_escala_preencher_sem_fluxo(p_empresa, g.etapas);   -- tenta um caminhão próprio antes de anunciar
      if exists (select 1 from operacao_etapa_caminhoes ec join caminhoes k on k.id = ec.caminhao_id
                  where ec.etapa_id = any(g.etapas) and k.freteiro_id is null) then continue; end if;
      calc := frete_anuncio_calculo(p_empresa, g.pedido_id, g.dir);
      if (calc->>'valor')::numeric <= 0 then continue; end if;          -- sem km ou sem categoria de frete: não anuncia
      insert into frete_anuncios (empresa_id, pedido_id, direcao, etapas, data, hora, ponto_encontro, destino, destino_lat, destino_lng, km, m3, valor)
      values (p_empresa, g.pedido_id, g.dir, g.etapas, g.data, g.hora, frete_galpao(p_empresa), vdest, vlat, vlng,
              (calc->>'km')::numeric, (calc->>'m3')::numeric, (calc->>'valor')::numeric);
      n := n + 1;
    elsif a.status = 'aberto' then
      calc := frete_anuncio_calculo(p_empresa, g.pedido_id, g.dir);
      update frete_anuncios set etapas = g.etapas, data = g.data, hora = g.hora, destino = vdest, destino_lat = vlat, destino_lng = vlng,
             ponto_encontro = frete_galpao(p_empresa), km = (calc->>'km')::numeric, m3 = (calc->>'m3')::numeric,
             valor = case when (calc->>'valor')::numeric > 0 then (calc->>'valor')::numeric else valor end, updated_at = now()
       where id = a.id
         and (etapas, data, hora, destino, km, m3) is distinct from (g.etapas, g.data, g.hora, vdest, (calc->>'km')::numeric, (calc->>'m3')::numeric);
    else
      -- aceito: o caminhão do freteiro tem que estar em todas as etapas; se a logística tirou, o frete volta para o app
      select caminhao_id into cam from frete_freteiros where id = a.freteiro_id;
      if a.checkin_em is null and (cam is null or not exists (select 1 from operacao_etapa_caminhoes where caminhao_id = cam and etapa_id = any(a.etapas))) then
        if not logistica_anuncio_datas_liberadas(p_empresa,g.pedido_id) then continue;end if;
        update frete_anuncios set status = 'aberto', freteiro_id = null, aceito_em = null, etapas = g.etapas, data = g.data, hora = g.hora, updated_at = now() where id = a.id;
      else
        if cam is not null then
          insert into operacao_etapa_caminhoes (etapa_id, caminhao_id, empresa_id)
            select x, cam, p_empresa from unnest(g.etapas) x on conflict do nothing;
        end if;
        update frete_anuncios set etapas = g.etapas, data = g.data, hora = g.hora, destino = vdest, destino_lat = vlat, destino_lng = vlng, updated_at = now()
         where id = a.id and (etapas, data, hora, destino) is distinct from (g.etapas, g.data, g.hora, vdest);
      end if;
    end if;
  end loop;

  -- pedido cancelado/encerrado ou etapas que sumiram: o anúncio aberto sai do app
  update frete_anuncios fa set status = 'cancelado', cancelado_em = now(), updated_at = now()
   where fa.empresa_id = p_empresa and fa.status = 'aberto'
     and not exists (select 1 from operacao_etapas e join separacoes_pedidos p on p.id = e.pedido_id
                      where e.pedido_id = fa.pedido_id and frete_direcao(e.tipo) = fa.direcao and e.servico_ref is null
                        and p.status_comercial in ('aprovado', 'enviado', 'finalizado') and coalesce(p.status, '') <> 'cancelado');
  update frete_anuncios fa set status = 'cancelado', cancelado_em = now(), updated_at = now()
   where fa.empresa_id = p_empresa and fa.status = 'aceito' and fa.checkin_em is null
     and exists (select 1 from separacoes_pedidos p where p.id = fa.pedido_id and (p.status_comercial = 'cancelado' or p.status = 'cancelado'));
  return n;
end $function$;
notify pgrst,'reload schema';
