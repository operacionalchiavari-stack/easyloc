-- Teto de gastos do Almoxarifado sem planilha (nov/2026). Antes: aba "Config Percentuais" (só cabeçalho) e
-- "Metas e Gastos" (nunca calculada, dependia da planilha "Matriz", vazia) + rotina diária na Vercel.
-- Agora: % por setor e mês numa tabela; teto = faturamento dos pedidos com evento no mês × % do setor;
-- gasto = saídas do Almoxarifado novo (warehouse_movements) no mês, pelo setor.
create table if not exists public.almox_teto_percentuais (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  setor text not null check (btrim(setor) <> ''),
  mes int not null check (mes between 1 and 12),
  percentual numeric not null default 0 check (percentual >= 0 and percentual <= 100),
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, setor, mes)
);
alter table public.almox_teto_percentuais enable row level security;
drop policy if exists almox_teto_ler on public.almox_teto_percentuais;
create policy almox_teto_ler on public.almox_teto_percentuais for select to authenticated using (public.eh_membro_empresa(empresa_id));
drop policy if exists seguranca_2fa on public.almox_teto_percentuais;
create policy seguranca_2fa on public.almox_teto_percentuais as restrictive for all to authenticated using (public.seguranca_2fa_ok()) with check (public.seguranca_2fa_ok());
grant select on public.almox_teto_percentuais to authenticated;

-- Setores (do RH + os que já têm %), cada um com os 12 percentuais.
create or replace function public.almox_teto_percentuais_ler(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('nome', s.setor, 'valores',
      (select jsonb_agg(coalesce((select p.percentual from almox_teto_percentuais p where p.empresa_id = p_empresa and p.setor = s.setor and p.mes = m), 0) order by m) from generate_series(1,12) m))
      order by s.setor)
    from (select distinct btrim(nome) setor from rh_cadastro_opcoes where empresa_id = p_empresa and tipo = 'setor' and coalesce(ativo, true)
          union select setor from almox_teto_percentuais where empresa_id = p_empresa) s
  ), '[]'::jsonb);
end $$;

create or replace function public.almox_teto_percentuais_salvar(p_empresa uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v jsonb; m int; val numeric;
begin
  if auth.uid() is null or not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
  if not (public.operacao_pode(p_empresa, 'configuracoes.empresa.editar') or public.operacao_pode(p_empresa, 'estoque.almoxarifado.aprovar')) then
    raise exception 'Sem permissão para alterar o teto de gastos'; end if;
  for v in select * from jsonb_array_elements(coalesce(p_dados, '[]'::jsonb)) loop
    if btrim(coalesce(v->>'nome','')) = '' then continue; end if;
    for m in 1..12 loop
      val := coalesce(nullif(replace(v->'valores'->>(m-1), ',', '.'), '')::numeric, 0);
      if val < 0 or val > 100 then raise exception 'Percentual inválido em %: use de 0 a 100', v->>'nome'; end if;
      insert into almox_teto_percentuais(empresa_id, setor, mes, percentual, atualizado_em) values (p_empresa, btrim(v->>'nome'), m, val, now())
      on conflict (empresa_id, setor, mes) do update set percentual = excluded.percentual, atualizado_em = now();
    end loop;
  end loop;
end $$;

-- Teto e gasto de um mês por setor (p_mes = qualquer dia do mês).
create or replace function public.almox_teto_gastos(p_empresa uuid, p_mes date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare ini date := date_trunc('month', p_mes)::date; fim date := (date_trunc('month', p_mes) + interval '1 month')::date; fat numeric;
begin
  if auth.uid() is not null and not public.eh_membro_empresa(p_empresa) then raise exception 'Sem acesso'; end if;
  -- pedidos extras somam junto (são faturamento do mês)
  select coalesce(sum(coalesce(p.valor_total, 0)), 0) into fat from separacoes_pedidos p
   where p.empresa_id = p_empresa and p.status_comercial in ('aprovado','finalizado','enviado') and p.data_evento >= ini and p.data_evento < fim
     and coalesce((p.observacoes->>'teste_cronograma')::boolean, false) = false;
  return jsonb_build_object('mes', to_char(ini, 'MM/YYYY'), 'faturamento', fat, 'setores', coalesce((
    select jsonb_agg(jsonb_build_object('setor', s.setor, 'percentual', s.pct, 'teto', round(fat * s.pct / 100, 2),
      'gasto', coalesce((select round(sum(coalesce(w.valor_total, w.quantidade * coalesce(w.valor_unitario, 0), 0)), 2) from warehouse_movements w
        where w.empresa_id = p_empresa and w.tipo in ('saida','retirada','consumo') and w.created_at >= ini and w.created_at < fim
          and lower(btrim(coalesce(w.setor_nome, ''))) = lower(s.setor)), 0)) order by s.setor)
    from (select btrim(nome) setor, coalesce((select percentual from almox_teto_percentuais t where t.empresa_id = p_empresa and t.setor = btrim(r.nome) and t.mes = extract(month from ini)), 0) pct
          from (select distinct nome from rh_cadastro_opcoes where empresa_id = p_empresa and tipo = 'setor' and coalesce(ativo, true)
                union select setor from almox_teto_percentuais where empresa_id = p_empresa) r) s), '[]'::jsonb));
end $$;
revoke all on function public.almox_teto_percentuais_ler(uuid), public.almox_teto_percentuais_salvar(uuid,jsonb), public.almox_teto_gastos(uuid,date) from public, anon;
grant execute on function public.almox_teto_percentuais_ler(uuid), public.almox_teto_percentuais_salvar(uuid,jsonb), public.almox_teto_gastos(uuid,date) to authenticated;
