-- Motor das planilhas: formato de número por célula (igual ao Sheets, onde
-- cada célula tem o seu). gs_abas.formatos continua sendo o padrão da coluna;
-- gs_linhas.formatos só é preenchido quando a linha foge do padrão.

alter table public.gs_linhas add column if not exists formatos jsonb;

create or replace function public.gs_ler_aba(p_planilha text, p_aba text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'versao', a.versao,
    'colunas', a.colunas,
    'formatos', a.formatos,
    'sheet_id', a.sheet_id,
    'linhas', coalesce((
      select jsonb_agg(l.valores order by l.linha)
      from public.gs_linhas l
      where l.planilha_id = a.planilha_id and l.aba = a.nome
    ), '[]'::jsonb),
    'formatos_linhas', coalesce((
      select jsonb_agg(l.formatos order by l.linha)
      from public.gs_linhas l
      where l.planilha_id = a.planilha_id and l.aba = a.nome
    ), '[]'::jsonb)
  )
  from public.gs_abas a
  where a.planilha_id = p_planilha and a.nome = p_aba;
$$;

-- gs_gravar: cada linha agora pode vir como [n, valores, formatos]
create or replace function public.gs_gravar(p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  a jsonb;
  l jsonb;
  v_atual bigint;
begin
  perform pg_advisory_xact_lock(hashtext('gs_gravar'));

  for c in select * from jsonb_array_elements(coalesce(p_dados->'conferir', '[]'::jsonb)) loop
    select versao into v_atual from public.gs_abas where planilha_id = c->>0 and nome = c->>1;
    if coalesce(v_atual, 0) <> coalesce((c->>2)::bigint, 0) then
      raise exception 'GS_CONFLITO %/%', c->>0, c->>1 using errcode = 'P0001';
    end if;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_dados->'planilhas', '[]'::jsonb)) loop
    insert into public.gs_planilhas (id, nome, fuso) values (c->>0, c->>1, coalesce(c->>2, 'America/Sao_Paulo'))
    on conflict (id) do update set nome = excluded.nome;
  end loop;

  for a in select * from jsonb_array_elements(coalesce(p_dados->'abas', '[]'::jsonb)) loop
    if coalesce((a->>'excluir')::boolean, false) then
      delete from public.gs_abas where planilha_id = a->>'planilha' and nome = a->>'aba';
      continue;
    end if;

    insert into public.gs_abas (planilha_id, nome, sheet_id, ordem, colunas, formatos)
    values (a->>'planilha', a->>'aba', (a->>'sheet_id')::bigint, coalesce((a->>'ordem')::int, 999),
            coalesce((a->>'colunas')::int, 0), coalesce(a->'formatos', '[]'::jsonb))
    on conflict (planilha_id, nome) do update
      set colunas = coalesce((excluded.colunas), gs_abas.colunas),
          formatos = case when a ? 'formatos' then excluded.formatos else gs_abas.formatos end,
          versao = gs_abas.versao + 1,
          atualizado_em = now();

    if a->>'modo' = 'tudo' then
      delete from public.gs_linhas where planilha_id = a->>'planilha' and aba = a->>'aba';
    end if;

    for l in select * from jsonb_array_elements(coalesce(a->'linhas', '[]'::jsonb)) loop
      insert into public.gs_linhas (planilha_id, aba, linha, valores, formatos)
      values (a->>'planilha', a->>'aba', (l->>0)::int, l->1, nullif(l->2, 'null'::jsonb))
      on conflict (planilha_id, aba, linha) do update set valores = excluded.valores, formatos = excluded.formatos;
    end loop;

    if a ? 'total' then
      delete from public.gs_linhas
      where planilha_id = a->>'planilha' and aba = a->>'aba' and linha > (a->>'total')::int;
    end if;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_dados->'props', '[]'::jsonb)) loop
    if c->>2 is null then
      delete from public.gs_propriedades where projeto = c->>0 and chave = c->>1;
    else
      insert into public.gs_propriedades (projeto, chave, valor) values (c->>0, c->>1, c->>2)
      on conflict (projeto, chave) do update set valor = excluded.valor;
    end if;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p_dados->'cache', '[]'::jsonb)) loop
    if c->>2 is null then
      delete from public.gs_cache where projeto = c->>0 and chave = c->>1;
    else
      insert into public.gs_cache (projeto, chave, valor, expira_em)
      values (c->>0, c->>1, c->>2, now() + make_interval(secs => coalesce((c->>3)::int, 600)))
      on conflict (projeto, chave) do update set valor = excluded.valor, expira_em = excluded.expira_em;
    end if;
  end loop;

  delete from public.gs_cache where expira_em < now() - interval '1 day';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.gs_ler_aba(text, text) from public, anon, authenticated;
revoke all on function public.gs_gravar(jsonb) from public, anon, authenticated;
grant execute on function public.gs_ler_aba(text, text) to service_role;
grant execute on function public.gs_gravar(jsonb) to service_role;
