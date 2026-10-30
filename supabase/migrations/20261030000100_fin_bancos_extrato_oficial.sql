-- =====================================================================================
-- Aba "Bancos" (out/2026): conciliação + extrato oficial de cada conta.
-- Cada arquivo enviado é uma CONCILIAÇÃO (fin_extrato_lotes). Ela só é FINALIZADA quando todas as linhas dela
-- foram reconhecidas (baixa, transferência, lançamento ou ignorada). Só as linhas de conciliações finalizadas
-- formam o EXTRATO oficial da conta, igual ao do banco (descrição, valor e saldo exatamente como vieram no arquivo).
-- Desfazer uma linha reabre a conciliação dela (as linhas saem do extrato até fechar de novo).
-- =====================================================================================

alter table public.fin_extrato add column if not exists ordem integer;
alter table public.fin_extrato_lotes
  add column if not exists status text not null default 'aberto' check (status in ('aberto','finalizado')),
  add column if not exists finalizado_em timestamptz,
  add column if not exists finalizado_por uuid;

-- linha pendente = ainda não reconhecida
create or replace function public.fin_extrato_pendente(e fin_extrato)
returns boolean language sql immutable as $$
  select e.baixa_id is null and e.transferencia_grupo is null and e.conciliado_em is null and not e.ignorado;
$$;

-- Finaliza a conciliação quando não sobra linha pendente; devolve true se finalizou agora.
create or replace function public.fin_lote_conferir(p_lote uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_lote is null then return false; end if;
  select status into v_status from fin_extrato_lotes where id = p_lote for update;
  if v_status is null or v_status = 'finalizado' then return false; end if;
  if exists (select 1 from fin_extrato e where e.lote_id = p_lote and fin_extrato_pendente(e)) then return false; end if;
  update fin_extrato_lotes set status = 'finalizado', finalizado_em = now(), finalizado_por = auth.uid() where id = p_lote;
  return true;
end $$;

-- Importação guarda a ordem cronológica das linhas (para o saldo do fim do dia) e fecha o lote sem linhas novas.
create or replace function public.fin_importar_extrato_lote(p_empresa uuid, p_conta uuid, p_linhas jsonb, p_lote jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lote uuid; v_n int; v_total int;
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if not exists (select 1 from fin_contas where id = p_conta and empresa_id = p_empresa) then raise exception 'Conta inválida'; end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Linhas inválidas'; end if;
  v_total := jsonb_array_length(p_linhas);
  insert into fin_extrato_lotes(empresa_id, conta_id, arquivo_nome, formato, banco_detectado, periodo_ini, periodo_fim, linhas, saldo_banco, saldo_data, criado_por)
  values (p_empresa, p_conta, left(p_lote->>'arquivo', 200), left(p_lote->>'formato', 20), left(p_lote->>'banco', 120),
          nullif(p_lote->>'periodo_ini','')::date, nullif(p_lote->>'periodo_fim','')::date, v_total,
          nullif(p_lote->>'saldo_banco','')::numeric, nullif(p_lote->>'saldo_data','')::date, auth.uid())
  returning id into v_lote;
  with ins as (
    insert into fin_extrato(empresa_id, conta_id, fitid, data, valor, descricao, documento, contraparte, contraparte_doc, saldo, lote_id, ordem)
    select p_empresa, p_conta, left(x->>'fitid', 200), (x->>'data')::date, round((x->>'valor')::numeric, 2), left(x->>'descricao', 300),
           left(nullif(x->>'documento',''), 80), left(nullif(x->>'contraparte',''), 160), nullif(left(regexp_replace(coalesce(x->>'contraparte_doc',''), '\D', '', 'g'), 20), ''),
           nullif(x->>'saldo','')::numeric, v_lote, nullif(x->>'seq','')::int
      from jsonb_array_elements(p_linhas) x
     where coalesce(x->>'fitid','') <> '' and coalesce(x->>'data','') <> '' and coalesce((x->>'valor')::numeric, 0) <> 0
    on conflict (conta_id, fitid) do nothing returning 1)
  select count(*) into v_n from ins;
  update fin_extrato_lotes set novas = v_n where id = v_lote;
  if v_n = 0 then update fin_extrato_lotes set status = 'finalizado', finalizado_em = now(), finalizado_por = auth.uid() where id = v_lote; end if;
  perform fin_auditar(p_empresa, 'fin_extrato_lotes', v_lote, 'importacao', null, jsonb_build_object('linhas', v_total, 'novas', v_n), p_lote->>'arquivo');
  return jsonb_build_object('lote_id', v_lote, 'novas', v_n, 'total', v_total);
end $$;

-- Aplicar: a função existente (renomeada para _base) + fecha a conciliação quando for a última linha.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'fin_assist_aplicar_base') then
    alter function public.fin_assist_aplicar(uuid, uuid, jsonb) rename to fin_assist_aplicar_base;
  end if;
end $$;
revoke all on function public.fin_assist_aplicar_base(uuid, uuid, jsonb) from public, anon, authenticated;
create or replace function public.fin_assist_aplicar(p_empresa uuid, p_extrato uuid, p_acao jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_lote uuid; v_fim boolean; v_par uuid;
begin
  r := fin_assist_aplicar_base(p_empresa, p_extrato, p_acao);
  select lote_id into v_lote from fin_extrato where id = p_extrato;
  v_fim := fin_lote_conferir(v_lote);
  -- transferência que reconheceu a linha da outra conta também pode fechar a conciliação de lá
  v_par := nullif(p_acao->>'par_extrato','')::uuid;
  if v_par is not null then perform fin_lote_conferir((select lote_id from fin_extrato where id = v_par)); end if;
  return r || jsonb_build_object('conciliacao_finalizada', v_fim, 'lote_id', v_lote,
    'faltam', (select count(*) from fin_extrato e where e.lote_id = v_lote and fin_extrato_pendente(e)));
end $$;

-- Desfazer reabre a conciliação da linha (e a da linha par, numa transferência criada por ela).
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'fin_assist_desfazer_base') then
    alter function public.fin_assist_desfazer(uuid, uuid) rename to fin_assist_desfazer_base;
  end if;
end $$;
revoke all on function public.fin_assist_desfazer_base(uuid, uuid) from public, anon, authenticated;
create or replace function public.fin_assist_desfazer(p_empresa uuid, p_extrato uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lote uuid; v_grupo uuid;
begin
  select lote_id, transferencia_grupo into v_lote, v_grupo from fin_extrato where id = p_extrato and empresa_id = p_empresa;
  perform fin_assist_desfazer_base(p_empresa, p_extrato);
  update fin_extrato_lotes set status = 'aberto', finalizado_em = null, finalizado_por = null
   where empresa_id = p_empresa and status = 'finalizado'
     and (id = v_lote or id in (select e.lote_id from fin_extrato e where e.empresa_id = p_empresa and fin_extrato_pendente(e) and e.lote_id is not null));
end $$;

-- Saldo OFICIAL de uma conta ao fim de um dia: o último saldo informado pelo banco (linhas de conciliações
-- finalizadas) + o que veio depois dele; sem saldo do banco, saldo inicial da conta + linhas oficiais.
create or replace function public.fin_bancos_saldo_em(p_conta uuid, p_data date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare c fin_contas%rowtype; u record; v numeric;
begin
  select * into c from fin_contas where id = p_conta;
  if not found then return null; end if;
  select e.data, e.saldo, coalesce(e.ordem, 0) ordem, l.created_at into u
    from fin_extrato e join fin_extrato_lotes l on l.id = e.lote_id
   where e.conta_id = p_conta and l.status = 'finalizado' and e.saldo is not null and e.data <= p_data
   order by e.data desc, l.created_at desc, coalesce(e.ordem, 0) desc limit 1;
  if found then
    select u.saldo + coalesce(sum(e.valor), 0) into v
      from fin_extrato e join fin_extrato_lotes l on l.id = e.lote_id
     where e.conta_id = p_conta and l.status = 'finalizado' and e.data <= p_data
       and (e.data, l.created_at, coalesce(e.ordem, 0)) > (u.data, u.created_at, u.ordem);
    return v;
  end if;
  select c.saldo_inicial + coalesce(sum(e.valor), 0) into v
    from fin_extrato e join fin_extrato_lotes l on l.id = e.lote_id
   where e.conta_id = p_conta and l.status = 'finalizado' and e.data <= p_data and e.data >= c.saldo_inicial_data;
  return v;
end $$;

-- Resumo para a lista de contas da aba Bancos.
create or replace function public.fin_bancos_resumo(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'conta_id', c.id,
      'saldo', fin_bancos_saldo_em(c.id, current_date),
      'ultima_data', (select max(e.data) from fin_extrato e join fin_extrato_lotes l on l.id = e.lote_id where e.conta_id = c.id and l.status = 'finalizado'),
      'pendentes', (select count(*) from fin_extrato e where e.conta_id = c.id and fin_extrato_pendente(e)),
      'abertas', (select count(*) from fin_extrato_lotes l where l.conta_id = c.id and l.status = 'aberto')
    ) order by c.nome) from fin_contas c where c.empresa_id = p_empresa and c.ativo), '[]'::jsonb);
end $$;

-- Extrato oficial de uma conta (ou de todas, p_conta null) num período, com o saldo de antes do período por conta.
create or replace function public.fin_bancos_extrato(p_empresa uuid, p_conta uuid, p_ini date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return jsonb_build_object(
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'banco', c.banco,
                 'saldo_antes', fin_bancos_saldo_em(c.id, p_ini - 1), 'saldo_fim', fin_bancos_saldo_em(c.id, p_fim)) order by c.nome)
               from fin_contas c where c.empresa_id = p_empresa and c.ativo and (p_conta is null or c.id = p_conta)), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'conta_id', e.conta_id, 'data', e.data, 'descricao', e.descricao,
                 'contraparte', e.contraparte, 'documento', e.documento, 'valor', e.valor, 'saldo', e.saldo,
                 'tipo', case when e.ignorado then 'ignorar' else coalesce(e.conciliado_acao->>'tipo', case when e.baixa_id is not null then 'baixar' end) end,
                 'resumo', coalesce(e.conciliado_acao->>'resumo', e.sugestao->>'resumo'))
               order by e.data, l.created_at, coalesce(e.ordem, 0))
               from fin_extrato e join fin_extrato_lotes l on l.id = e.lote_id join fin_contas c on c.id = e.conta_id
              where e.empresa_id = p_empresa and l.status = 'finalizado' and c.ativo and (p_conta is null or e.conta_id = p_conta)
                and e.data between p_ini and p_fim), '[]'::jsonb),
    'pendentes', (select count(*) from fin_extrato e join fin_contas c on c.id = e.conta_id
                   where e.empresa_id = p_empresa and c.ativo and (p_conta is null or e.conta_id = p_conta) and fin_extrato_pendente(e)));
end $$;

-- conciliações que já estavam completas
update fin_extrato_lotes l set status = 'finalizado', finalizado_em = coalesce(finalizado_em, now())
 where status = 'aberto' and not exists (select 1 from fin_extrato e where e.lote_id = l.id and fin_extrato_pendente(e));

revoke all on function public.fin_lote_conferir(uuid), public.fin_bancos_saldo_em(uuid, date) from public, anon, authenticated;
revoke all on function public.fin_bancos_resumo(uuid), public.fin_bancos_extrato(uuid, uuid, date, date), public.fin_assist_aplicar(uuid, uuid, jsonb), public.fin_assist_desfazer(uuid, uuid) from public, anon;
grant execute on function public.fin_bancos_resumo(uuid), public.fin_bancos_extrato(uuid, uuid, date, date), public.fin_assist_aplicar(uuid, uuid, jsonb), public.fin_assist_desfazer(uuid, uuid) to authenticated;
