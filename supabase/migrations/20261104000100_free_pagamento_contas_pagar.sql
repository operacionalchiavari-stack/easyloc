-- Nov/2026: Pagamento de Freelancer (Gestão de Pessoas) manda para o Contas a Pagar, como a Conciliação de Fretes.
-- O RH marca na aba "A pagar" o que vai ser pago e envia: uma conta a pagar por freelancer (cada um recebe no seu PIX)
-- + um custo por pedido (Resultados do Gerencial). Cancelar a conta no Financeiro (ou "Desfazer" no RH, sem pagamento)
-- devolve as diárias para "A pagar". Pago no Financeiro aparece como pago no RH.

alter table public.logistica_fechamentos drop constraint if exists logistica_fechamentos_tipo_check;
alter table public.logistica_fechamentos add constraint logistica_fechamentos_tipo_check check (tipo in ('frete', 'uber', 'free'));
alter table public.logistica_fechamentos add column if not exists free_id uuid references public.free_cadastros(id) on delete set null;
alter table public.free_rh_pagamentos add column if not exists fechamento_id uuid references public.logistica_fechamentos(id) on delete set null;
alter table public.free_rh_pagamentos add column if not exists valor_enviado numeric;

create or replace function public.free_rh_pode(p_empresa uuid) returns boolean language sql stable security definer set search_path = public as $$
  select operacao_pode(p_empresa, 'rh.colaboradores.editar') or operacao_pode(p_empresa, 'logistica.cronograma.montagem');
$$;
revoke all on function public.free_rh_pode(uuid) from public, anon;
grant execute on function public.free_rh_pode(uuid) to authenticated;

-- p_itens = [{ "inscricao": uuid, "valor": número }] (o valor é o total calculado na tela: diária + hora extra marcada + ajuste)
create or replace function public.free_rh_enviar_financeiro(p_empresa uuid, p_itens jsonb, p_vencimento date, p_obs text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; f record; fech logistica_fechamentos; pg uuid; num int; doc text; docs jsonb := '[]'; total_geral numeric := 0; n int;
begin
  if not free_rh_pode(p_empresa) then raise exception 'Sem permissão para enviar pagamentos de freelancer.'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento do pagamento.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Marque o que vai ser pago.'; end if;

  create temp table _fi on commit drop as
    select (x->>'inscricao')::uuid inscricao, round((x->>'valor')::numeric, 2) valor from jsonb_array_elements(p_itens) x;
  if exists (select 1 from _fi where inscricao is null or valor is null or valor <= 0) then raise exception 'Todo pagamento enviado precisa ter valor maior que zero.'; end if;
  if (select count(*) from _fi) <> (select count(distinct inscricao) from _fi) then raise exception 'Pagamento repetido na lista.'; end if;

  perform 1 from free_inscricoes where id in (select inscricao from _fi) for update;
  create temp table _fd on commit drop as
    select fi.inscricao, fi.valor, i.free_id, i.nome, i.status, v.empresa_id, o.pedido_id, o.data, o.tipo etapa, sp.numero_pedido,
           p.nao_pagar, p.pago_em, p.fechamento_id, lf.status fech_status
      from _fi fi join free_inscricoes i on i.id = fi.inscricao join free_vagas v on v.id = i.vaga_id
      left join operacao_etapas o on o.id = v.etapa_id left join separacoes_pedidos sp on sp.id = o.pedido_id
      left join free_rh_pagamentos p on p.inscricao_id = fi.inscricao left join logistica_fechamentos lf on lf.id = p.fechamento_id;
  if (select count(*) from _fd) <> (select count(*) from _fi) or exists (select 1 from _fd where empresa_id <> p_empresa) then raise exception 'Algum pagamento não foi encontrado.'; end if;
  if exists (select 1 from _fd where status <> 'CONFIRMADO') then raise exception 'Algum freelancer não está confirmado na vaga.'; end if;
  if exists (select 1 from _fd where nao_pagar) then raise exception 'Algum pagamento está marcado para não pagar.'; end if;
  if exists (select 1 from _fd where pago_em is not null) then raise exception 'Algum pagamento já foi pago. Atualize a tela.'; end if;
  if exists (select 1 from _fd where fechamento_id is not null and fech_status = 'ativo') then raise exception 'Algum pagamento já foi enviado ao financeiro. Atualize a tela.'; end if;

  perform fin_semear(p_empresa);
  perform pg_advisory_xact_lock(hashtextextended('logistica_fech:' || p_empresa::text, 0));
  for f in select free_id, max(nome) nome, sum(valor) total, count(*) qtd from _fd group by free_id order by max(nome) loop
    select coalesce(max(numero), 0) + 1 into num from logistica_fechamentos where empresa_id = p_empresa and tipo = 'free';
    doc := 'FL-' || lpad(num::text, 4, '0');
    insert into logistica_fechamentos (empresa_id, tipo, numero, free_id, beneficiario, total, vencimento, obs, criado_por, criado_por_nome)
    values (p_empresa, 'free', num, f.free_id, coalesce(f.nome, 'Freelancer'), f.total, p_vencimento, nullif(btrim(coalesce(p_obs, '')), ''), auth.uid(), logistica_nome_usuario(p_empresa))
    returning * into fech;
    insert into fin_pagar (empresa_id, origem, origem_id, fornecedor_nome, documento, descricao, emissao, competencia, vencimento, valor, parcela, parcelas,
                           forma, categoria_id, observacoes, criado_por)
    values (p_empresa, 'free', fech.id, coalesce(f.nome, 'Freelancer'), doc,
            'Freelancer ' || doc || ' · ' || coalesce(f.nome, '') || ' · ' || f.qtd || ' diária(s)', current_date, current_date, p_vencimento, f.total, 1, 1, 'pix',
            fin_categoria(p_empresa, 'equipe_free'),
            concat_ws(E'\n', 'Enviado pelo Pagamento de Freelancer (Gestão de Pessoas), ' || doc || '.',
              'PIX: no cadastro do freelancer (Gestão de Pessoas > Cadastro de Freelancer).',
              (select string_agg(coalesce(etapa, 'Diária') || ' ' || to_char(data, 'DD/MM') || coalesce(' · pedido ' || numero_pedido, '') || ': R$ ' || to_char(valor, 'FM999G990D00'), E'\n' order by data) from _fd where free_id = f.free_id),
              nullif(btrim(coalesce(p_obs, '')), '')), auth.uid())
    returning id into pg;
    update logistica_fechamentos set pagar_id = pg where id = fech.id;
    for r in select pedido_id, sum(valor) valor, count(*) qtd from _fd where free_id = f.free_id and pedido_id is not null group by pedido_id loop
      insert into fin_custos_evento (empresa_id, pedido_id, categoria, descricao, valor, pagar_id, fechamento_id, criado_por)
      values (p_empresa, r.pedido_id, 'equipe', 'Freelancer ' || doc || ' · ' || coalesce(f.nome, '') || ' · ' || r.qtd || ' diária(s)', r.valor, pg, fech.id, auth.uid());
      delete from fin_resultados_revisados where pedido_id = r.pedido_id;
    end loop;
    insert into free_rh_pagamentos (inscricao_id, empresa_id, ciclo, fechamento_id, valor_enviado, atualizado_por, atualizado_em)
      select d.inscricao, p_empresa, coalesce(d.data, current_date) - ((extract(isodow from coalesce(d.data, current_date))::int - 2 + 7) % 7), fech.id, d.valor, logistica_nome_usuario(p_empresa), now()
        from _fd d where d.free_id = f.free_id
      on conflict (inscricao_id) do update set fechamento_id = excluded.fechamento_id, valor_enviado = excluded.valor_enviado, atualizado_por = excluded.atualizado_por, atualizado_em = now();
    docs := docs || jsonb_build_object('documento', doc, 'nome', f.nome, 'total', f.total, 'pagar_id', pg);
    total_geral := total_geral + f.total;
  end loop;
  return jsonb_build_object('ok', true, 'contas', docs, 'total', total_geral);
end $$;
revoke all on function public.free_rh_enviar_financeiro(uuid, jsonb, date, text) from public, anon;
grant execute on function public.free_rh_enviar_financeiro(uuid, jsonb, date, text) to authenticated;

-- Situação no financeiro de cada diária enviada (para a tela do RH).
create or replace function public.free_rh_financeiro(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not free_rh_pode(p_empresa) then raise exception 'Sem permissão.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('inscricao', p.inscricao_id, 'fechamento', f.id, 'documento', 'FL-' || lpad(f.numero::text, 4, '0'),
            'vencimento', f.vencimento, 'enviado_em', f.criado_em, 'enviado_por', f.criado_por_nome, 'valor', p.valor_enviado,
            'pagar_status', fp.status, 'pago', coalesce(fp.pago, 0), 'total_conta', fp.valor))
      from free_rh_pagamentos p join logistica_fechamentos f on f.id = p.fechamento_id and f.status = 'ativo'
      left join fin_pagar fp on fp.id = f.pagar_id
     where p.empresa_id = p_empresa), '[]');
end $$;
revoke all on function public.free_rh_financeiro(uuid) from public, anon;
grant execute on function public.free_rh_financeiro(uuid) to authenticated;

-- Desfazer o envio (só sem pagamento no financeiro): cancela a conta; o gatilho devolve as diárias para "A pagar".
create or replace function public.free_rh_desfazer_envio(p_empresa uuid, p_fechamento uuid) returns void language plpgsql security definer set search_path = public as $$
declare f logistica_fechamentos; p fin_pagar;
begin
  if not free_rh_pode(p_empresa) then raise exception 'Sem permissão.'; end if;
  select * into f from logistica_fechamentos where id = p_fechamento and empresa_id = p_empresa and tipo = 'free' for update;
  if f.id is null or f.status <> 'ativo' then raise exception 'Envio não encontrado.'; end if;
  select * into p from fin_pagar where id = f.pagar_id;
  if coalesce(p.pago, 0) > 0 then raise exception 'Este pagamento já foi pago (ou pago em parte) no Financeiro. Estorne por lá primeiro.'; end if;
  if p.id is not null and p.status <> 'cancelado' then
    update fin_pagar set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = 'Envio desfeito no Pagamento de Freelancer' where id = p.id;
  else
    perform logistica_fechamento_reabrir(f.id);
  end if;
end $$;
revoke all on function public.free_rh_desfazer_envio(uuid, uuid) from public, anon;
grant execute on function public.free_rh_desfazer_envio(uuid, uuid) to authenticated;

create or replace function public.logistica_fechamento_reabrir(p_fechamento uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update logistica_fechamentos set status = 'cancelado' where id = p_fechamento;
  update fin_custos_evento set cancelado_em = now(), cancelamento_motivo = 'Fechamento da logística cancelado' where fechamento_id = p_fechamento and cancelado_em is null;
  update frete_viagens set status = 'aberto', fechamento_id = null, updated_at = now() where fechamento_id = p_fechamento;
  if to_regclass('public.uber_corridas') is not null then
    execute 'update uber_corridas set fechamento_id = null where fechamento_id = $1' using p_fechamento;
  end if;
  update free_rh_pagamentos set fechamento_id = null, valor_enviado = null, atualizado_em = now() where fechamento_id = p_fechamento;
end $$;
revoke all on function public.logistica_fechamento_reabrir(uuid) from public, anon, authenticated;

create or replace function public.logistica_fechamento_pagar_cancelado() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' and new.origem in ('frete', 'uber', 'free') and new.origem_id is not null then
    perform logistica_fechamento_reabrir(new.origem_id);
  end if;
  return new;
end $$;
