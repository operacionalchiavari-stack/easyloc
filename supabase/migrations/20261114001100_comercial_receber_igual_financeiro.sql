-- Contas a receber do Comercial com a mesma tabela do Financeiro (nov/2026):
-- 1) comercial_contas_receber passa a devolver a conta da parcela (nome + documento/PIX mascarados), entrega, coleta e a foto do cliente;
-- 2) recebimentos previstos (pré-reserva e orçamento) também para o Comercial, pela mesma regra do Financeiro.

create or replace function public.fin_recebimentos_previstos_base(p_empresa uuid)
returns table(pedido_id uuid, pedido_numero text, cliente_nome text, situacao text, pre_reserva_ate date, data_evento date, dia date, valor numeric, componente text, parcela integer, parcelas integer, forma text, sem_parcelas boolean, valor_pedido numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_sit text[];
begin
  select array_remove(array[case when coalesce(f.previsto_pre_reserva, true) then 'pre_reserva' end,
                            case when coalesce(f.previsto_orcamento, true) then 'orcamento' end], null)
    into v_sit from (select 1) x left join empresa_financeiro f on f.empresa_id = p_empresa;
  return query
  with ped as (
    select p.* from separacoes_pedidos p
     where p.empresa_id = p_empresa and p.status_comercial = any(v_sit)
       and coalesce(p.status, '') <> 'cancelado'
       and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true' and coalesce(p.observacoes->>'teste_ia', '') <> 'true'
  ), parc as (
    select p.id, x, row_number() over (partition by p.id, coalesce(x->>'componente', 'locacao') order by nullif(x->>'vencimento', ''), o) n,
           count(*) over (partition by p.id, coalesce(x->>'componente', 'locacao')) t
      from ped p, jsonb_array_elements(case when jsonb_typeof(p.observacoes->'parcelas_financeiras') = 'array' then p.observacoes->'parcelas_financeiras' else '[]'::jsonb end) with ordinality as e(x, o)
     where coalesce(nullif(x->>'valor', '')::numeric, 0) > 0
  )
  select p.id, p.numero_pedido::text, p.cliente_nome::text, p.status_comercial::text, p.pre_reserva_ate, p.data_evento,
         nullif(left(pa.x->>'vencimento', 10), '')::date, nullif(pa.x->>'valor', '')::numeric,
         coalesce(pa.x->>'componente', 'locacao'), pa.n::int, pa.t::int, pa.x->>'metodo', false, p.valor_total
    from parc pa join ped p on p.id = pa.id
  union all
  select p.id, p.numero_pedido::text, p.cliente_nome::text, p.status_comercial::text, p.pre_reserva_ate, p.data_evento,
         p.data_evento, p.valor_total, 'locacao', 1, 1, null, true, p.valor_total
    from ped p
   where coalesce(p.valor_total, 0) > 0 and not exists (select 1 from parc pa where pa.id = p.id);
end $$;
revoke all on function public.fin_recebimentos_previstos_base(uuid) from public, anon, authenticated;

create or replace function public.fin_recebimentos_previstos(p_empresa uuid)
returns table(pedido_id uuid, pedido_numero text, cliente_nome text, situacao text, pre_reserva_ate date, data_evento date, dia date, valor numeric, componente text, parcela integer, parcelas integer, forma text, sem_parcelas boolean, valor_pedido numeric)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then
    raise exception 'Sem acesso ao financeiro' using errcode = '42501';
  end if;
  return query select * from fin_recebimentos_previstos_base(p_empresa);
end $$;

create or replace function public.comercial_recebimentos_previstos(p_empresa uuid)
returns table(pedido_id uuid, pedido_numero text, cliente_nome text, situacao text, pre_reserva_ate date, data_evento date, dia date, valor numeric, componente text, parcela integer, parcelas integer, forma text, sem_parcelas boolean, valor_pedido numeric)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_membro_empresa(p_empresa) or not (public.operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or public.operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return query select * from fin_recebimentos_previstos_base(p_empresa);
end $$;
revoke all on function public.comercial_recebimentos_previstos(uuid) from public, anon;
grant execute on function public.comercial_recebimentos_previstos(uuid) to authenticated;

create or replace function public.comercial_contas_receber(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.eh_membro_empresa(p_empresa) or not (public.operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or public.operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.vencimento, x.numero_pedido), '[]') into r from (
    select t.id, t.pedido_id, coalesce(p.numero_pedido, t.pedido_numero) numero_pedido, coalesce(p.cliente_id, t.cliente_id) cliente_id,
           coalesce(nullif(p.cliente_nome, ''), t.cliente_nome) cliente_nome, p.tipo_evento, p.data_evento, p.data_evento_fim, p.local_nome,
           p.data_entrega, p.data_coleta, p.valor_total valor_pedido,
           p.status_comercial, t.descricao, t.documento, t.componente, t.parcela, t.parcelas, t.vencimento, t.valor, t.recebido, t.aberto, t.status,
           (select max(b.data) from fin_baixas b where b.receber_id = t.id and b.estornado_em is null) recebido_em,
           nullif(p.observacoes->>'equipe_id', '') equipe_id,
           coalesce(eq.nome, nullif(p.observacoes->>'equipe_nome', '')) equipe_nome,
           t.conta_id, c.nome conta_nome,
           case when c.titular_documento like 'cofre:%' then coalesce(c.cofre_mascaras->>'titular_documento', '••••') else c.titular_documento end conta_doc,
           case when c.pix_chave like 'cofre:%' then coalesce(c.cofre_mascaras->>'pix_chave', '••••') else c.pix_chave end conta_pix,
           ce.catalogo_logo_url cliente_foto
      from fin_receber t
      left join separacoes_pedidos p on p.id = t.pedido_id
      left join clientes_equipes eq on eq.id::text = p.observacoes->>'equipe_id' and eq.empresa_id = p_empresa
      left join fin_contas c on c.id = t.conta_id
      left join lateral (select x.catalogo_logo_url from clientes_empresas x
                          where x.empresa_id = p_empresa and (x.id = coalesce(p.cliente_id, t.cliente_id)
                             or lower(trim(x.nome_razao)) = lower(trim(coalesce(nullif(p.cliente_nome, ''), t.cliente_nome))))
                          order by (x.id = coalesce(p.cliente_id, t.cliente_id)) desc nulls last limit 1) ce on true
     where t.empresa_id = p_empresa and t.status <> 'cancelado') x;
  return r;
end $$;
