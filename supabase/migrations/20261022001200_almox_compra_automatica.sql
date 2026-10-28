-- Out/2026 — Almoxarifado: estoque ideal + solicitação de compra automática.
-- Pedido do usuário: "quando o item chegar no estoque mínimo, se em Parâmetros eu escolhi compra automática, com mínimo 2
-- e ideal 10 o sistema já faz uma solicitação de compra de 8". Decisões: a solicitação fica numa aba do próprio
-- Almoxarifado; nasce quando o estoque fica IGUAL ou ABAIXO do mínimo; uma aberta por material.
-- O estoque ideal mora na planilha do Almoxarifado (aba Produtos, coluna nova "EstoqueIdeal"); a regra roda num gatilho
-- da tabela da planilha (gs_linhas), então vale para qualquer mudança de estoque (saída, entrada, contagem, edição).

-- 1) Coluna EstoqueIdeal na aba Produtos
do $$
declare pl constant text := '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI'; cab jsonb;
begin
  select valores into cab from gs_linhas where planilha_id = pl and aba = 'Produtos' and linha = 1;
  if cab is not null and not (cab ? 'EstoqueIdeal') then
    update gs_linhas set valores = cab || '["EstoqueIdeal"]'::jsonb where planilha_id = pl and aba = 'Produtos' and linha = 1;
    update gs_abas set colunas = greatest(colunas, jsonb_array_length(cab) + 1), versao = versao + 1, atualizado_em = now()
     where planilha_id = pl and nome = 'Produtos';
  end if;
end $$;

-- 2) Solicitações
create table if not exists public.almox_solicitacoes_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  numero bigint not null,
  produto_id text not null,
  codigo text, produto text, unidade text, categoria text,
  estoque_no_pedido numeric, estoque_minimo numeric, estoque_ideal numeric,
  quantidade numeric not null check (quantidade > 0),
  status text not null default 'aberta' check (status in ('aberta','comprada','cancelada')),
  origem text not null default 'automatica',
  liberada boolean not null default false,  -- concluída: só volta a pedir depois que o estoque sair do mínimo
  observacao text,
  concluida_em timestamptz, concluida_por uuid, concluida_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, numero)
);
create unique index if not exists almox_solicitacoes_compra_uma_aberta on public.almox_solicitacoes_compra (empresa_id, produto_id) where status = 'aberta';
alter table public.almox_solicitacoes_compra enable row level security;
drop policy if exists almox_solicitacoes_compra_ler on public.almox_solicitacoes_compra;
create policy almox_solicitacoes_compra_ler on public.almox_solicitacoes_compra for select to authenticated
  using (public.eh_membro_empresa(empresa_id) and public.operacao_pode(empresa_id, 'estoque.almoxarifado.visualizar'));
grant select on public.almox_solicitacoes_compra to authenticated;

-- 3) Parâmetro (almoxarifado_configuracoes: chave/valor jsonb)
create or replace function public.almox_compra_automatica_ligada(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::boolean from almoxarifado_configuracoes
                    where empresa_id = p_empresa and chave = 'compra_automatica' order by updated_at desc nulls last limit 1), false)
$$;

-- 4) Regra para um produto (linha da aba Produtos)
create or replace function public.almox_avaliar_produto(p_empresa uuid, v jsonb, cab jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  ix jsonb := '{}'; e text; o int;
  pid text; atual numeric; minimo numeric; ideal numeric; v_status text; qtd numeric; num bigint;
begin
  for e, o in select x, n - 1 from jsonb_array_elements_text(cab) with ordinality t(x, n) loop
    ix := ix || jsonb_build_object(e, o);
  end loop;
  pid := v->>((ix->>'ID')::int);
  if coalesce(pid, '') = '' then return; end if;
  atual  := public.almox_num(v->>((ix->>'EstoqueAtual')::int));
  minimo := public.almox_num(v->>((ix->>'EstoqueMinimo')::int));
  ideal  := case when ix ? 'EstoqueIdeal' then public.almox_num(v->>((ix->>'EstoqueIdeal')::int)) else 0 end;
  v_status := lower(coalesce(v->>((ix->>'Status')::int), ''));

  -- Estoque saiu do mínimo: a aberta é dada como comprada e as concluídas voltam a valer.
  if atual > minimo then
    update almox_solicitacoes_compra set status = 'comprada', concluida_em = now(), concluida_por_nome = 'Automático (estoque reposto)',
           liberada = true, atualizado_em = now()
     where empresa_id = p_empresa and produto_id = pid and status = 'aberta';
    update almox_solicitacoes_compra set liberada = true, atualizado_em = now()
     where empresa_id = p_empresa and produto_id = pid and status <> 'aberta' and not liberada;
    return;
  end if;

  if not public.almox_compra_automatica_ligada(p_empresa) or v_status = 'inativo' or ideal <= 0 or ideal <= atual then return; end if;
  qtd := ideal - atual;

  if exists (select 1 from almox_solicitacoes_compra where empresa_id = p_empresa and produto_id = pid and status = 'aberta') then
    update almox_solicitacoes_compra set quantidade = qtd, estoque_no_pedido = atual, estoque_minimo = minimo, estoque_ideal = ideal, atualizado_em = now()
     where empresa_id = p_empresa and produto_id = pid and status = 'aberta' and (quantidade <> qtd or estoque_no_pedido is distinct from atual);
    return;
  end if;
  -- Concluída à mão (comprada aguardando chegar / cancelada) segura um novo pedido até o estoque sair do mínimo.
  if exists (select 1 from almox_solicitacoes_compra where empresa_id = p_empresa and produto_id = pid and status <> 'aberta' and not liberada) then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('almox_compra:' || p_empresa::text, 0));
  select coalesce(max(numero), 0) + 1 into num from almox_solicitacoes_compra where empresa_id = p_empresa;
  insert into almox_solicitacoes_compra (empresa_id, numero, produto_id, codigo, produto, unidade, categoria,
                                         estoque_no_pedido, estoque_minimo, estoque_ideal, quantidade)
  values (p_empresa, num, pid, v->>((ix->>'Codigo')::int), trim(v->>((ix->>'Produto')::int)), v->>((ix->>'Unidade')::int),
          v->>((ix->>'Categoria')::int), atual, minimo, ideal, qtd)
  on conflict do nothing;
end $$;

-- 5) Gatilho na planilha
create or replace function public.almox_gatilho_produtos()
returns trigger language plpgsql security definer set search_path = public as $$
declare cab jsonb; emp uuid;
begin
  if new.planilha_id <> '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' or new.aba <> 'Produtos' or new.linha <= 1 then return null; end if;
  if tg_op = 'UPDATE' and new.valores is not distinct from old.valores then return null; end if;
  begin
    emp := public.gs_empresa_dona();
    select valores into cab from gs_linhas where planilha_id = new.planilha_id and aba = 'Produtos' and linha = 1;
    if emp is not null and cab is not null then perform public.almox_avaliar_produto(emp, new.valores, cab); end if;
  exception when others then
    raise warning 'almox compra automática: %', sqlerrm;  -- nunca impede gravar a planilha
  end;
  return null;
end $$;
drop trigger if exists almox_compra_automatica on public.gs_linhas;
create trigger almox_compra_automatica after insert or update on public.gs_linhas
  for each row execute function public.almox_gatilho_produtos();

-- 6) Varre todos os produtos (ao ligar o parâmetro)
create or replace function public.almox_avaliar_todos(p_empresa uuid)
returns int language plpgsql security definer set search_path = public as $$
declare cab jsonb; r record; n int := 0;
begin
  select valores into cab from gs_linhas where planilha_id = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and aba = 'Produtos' and linha = 1;
  if cab is null then return 0; end if;
  for r in select valores from gs_linhas where planilha_id = '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI' and aba = 'Produtos' and linha > 1 loop
    perform public.almox_avaliar_produto(p_empresa, r.valores, cab); n := n + 1;
  end loop;
  return n;
end $$;

-- 7) RPCs da tela
create or replace function public.almox_compra_config(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro_empresa(p_empresa) then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return jsonb_build_object('automatica', public.almox_compra_automatica_ligada(p_empresa));
end $$;

create or replace function public.almox_compra_config_salvar(p_empresa uuid, p_automatica boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare abertas int;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'configuracoes.empresa.editar') then
    raise exception 'Sem permissão para alterar os parâmetros.' using errcode = '42501';
  end if;
  delete from almoxarifado_configuracoes where empresa_id = p_empresa and chave = 'compra_automatica';
  insert into almoxarifado_configuracoes (empresa_id, chave, valor) values (p_empresa, 'compra_automatica', to_jsonb(coalesce(p_automatica, false)));
  if p_automatica and p_empresa = public.gs_empresa_dona() then perform public.almox_avaliar_todos(p_empresa); end if;
  select count(*) into abertas from almox_solicitacoes_compra where empresa_id = p_empresa and status = 'aberta';
  return jsonb_build_object('automatica', coalesce(p_automatica, false), 'abertas', abertas);
end $$;

create or replace function public.almox_set_valor(arr jsonb, idx int, val jsonb)
returns jsonb language plpgsql immutable as $$
declare a jsonb := coalesce(arr, '[]'::jsonb);
begin
  while jsonb_array_length(a) <= idx loop a := a || '[""]'::jsonb; end loop;
  return jsonb_set(a, array[idx::text], val);
end $$;

-- Estoque mínimo e ideal de um material (grava na planilha; o gatilho reavalia na hora).
create or replace function public.almox_produto_limites(p_empresa uuid, p_produto_id text, p_minimo numeric, p_ideal numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl constant text := '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI'; cab jsonb; i_id int; i_min int; i_ideal int; i_atu int; ln int; vals jsonb;
begin
  if p_empresa is distinct from public.gs_empresa_dona() or not public.eh_membro_empresa(p_empresa)
     or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.movimentar') then
    raise exception 'Sem permissão para alterar o estoque mínimo/ideal.' using errcode = '42501';
  end if;
  if p_minimo is null or p_minimo < 0 or p_ideal is null or p_ideal < 0 then raise exception 'Informe mínimo e ideal (zero ou mais).'; end if;
  if p_ideal > 0 and p_ideal < p_minimo then raise exception 'O estoque ideal não pode ser menor que o mínimo.'; end if;
  select valores into cab from gs_linhas where planilha_id = pl and aba = 'Produtos' and linha = 1;
  select (o-1) into i_id    from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'ID';
  select (o-1) into i_min   from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'EstoqueMinimo';
  select (o-1) into i_ideal from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'EstoqueIdeal';
  select (o-1) into i_atu   from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'AtualizadoEm';
  select linha, valores into ln, vals from gs_linhas where planilha_id = pl and aba = 'Produtos' and linha > 1 and valores->>i_id = p_produto_id limit 1;
  if ln is null then raise exception 'Material não encontrado no Almoxarifado.'; end if;
  vals := public.almox_set_valor(vals, i_min, to_jsonb(p_minimo));
  vals := public.almox_set_valor(vals, i_ideal, to_jsonb(p_ideal));
  if i_atu is not null then vals := public.almox_set_valor(vals, i_atu, to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))); end if;
  update gs_linhas set valores = vals where planilha_id = pl and aba = 'Produtos' and linha = ln;
  update gs_abas set versao = versao + 1, atualizado_em = now() where planilha_id = pl and nome = 'Produtos';
  return jsonb_build_object('ok', true, 'aberta', exists (select 1 from almox_solicitacoes_compra where empresa_id = p_empresa and produto_id = p_produto_id and status = 'aberta'));
end $$;

create or replace function public.almox_solicitacao_concluir(p_empresa uuid, p_id uuid, p_status text, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nome text;
begin
  if not public.eh_membro_empresa(p_empresa) or not public.operacao_pode(p_empresa, 'estoque.almoxarifado.movimentar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_status not in ('comprada', 'cancelada') then raise exception 'Situação inválida.'; end if;
  select coalesce(fa.nome, u.nome, au.email) into nome
    from auth.users au left join usuarios u on u.id = au.id
    left join funcionarios_acesso fa on fa.id = au.id and fa.empresa_id = p_empresa
   where au.id = auth.uid();
  update almox_solicitacoes_compra set status = p_status, observacao = nullif(trim(coalesce(p_observacao, '')), ''),
         concluida_em = now(), concluida_por = auth.uid(), concluida_por_nome = nome, liberada = false, atualizado_em = now()
   where id = p_id and empresa_id = p_empresa and status = 'aberta';
  if not found then raise exception 'Solicitação não encontrada ou já concluída.'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.almox_avaliar_produto(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.almox_avaliar_todos(uuid) from public, anon, authenticated;
revoke all on function public.almox_gatilho_produtos() from public, anon, authenticated;
revoke all on function public.almox_compra_automatica_ligada(uuid) from public, anon;
revoke all on function public.almox_compra_config(uuid) from public, anon;
revoke all on function public.almox_compra_config_salvar(uuid, boolean) from public, anon;
revoke all on function public.almox_produto_limites(uuid, text, numeric, numeric) from public, anon;
revoke all on function public.almox_solicitacao_concluir(uuid, uuid, text, text) from public, anon;
grant execute on function public.almox_compra_config(uuid) to authenticated;
grant execute on function public.almox_compra_config_salvar(uuid, boolean) to authenticated;
grant execute on function public.almox_produto_limites(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.almox_solicitacao_concluir(uuid, uuid, text, text) to authenticated;
