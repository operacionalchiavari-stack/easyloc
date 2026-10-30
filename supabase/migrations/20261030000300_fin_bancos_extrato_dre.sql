-- Extrato dos bancos: cada linha traz o indicativo da DRE (categoria do plano de contas, centro de custo e competência)
-- dos títulos baixados por ela. Transferência e linha ignorada não entram na DRE.
create or replace function public.fin_extrato_dre(p_extrato uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'codigo', c.codigo, 'categoria', c.nome, 'centro', cc.nome,
           'competencia', coalesce(t.competencia, t.vencimento))), '[]'::jsonb)
    from fin_baixas b
    cross join lateral (
      select r.categoria_id, r.centro_custo_id, r.competencia, r.vencimento from fin_receber r where r.id = b.receber_id
      union all
      select g.categoria_id, g.centro_custo_id, g.competencia, g.vencimento from fin_pagar g where g.id = b.pagar_id) t
    left join fin_categorias c on c.id = t.categoria_id
    left join fin_centros_custo cc on cc.id = t.centro_custo_id
   where b.extrato_id = p_extrato and b.estornado_em is null
$$;
revoke all on function public.fin_extrato_dre(uuid) from public, anon, authenticated;

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
                 'resumo', coalesce(e.conciliado_acao->>'resumo', e.sugestao->>'resumo'),
                 'dre', case when e.ignorado or e.transferencia_grupo is not null then '[]'::jsonb else fin_extrato_dre(e.id) end)
               order by e.data, l.created_at, coalesce(e.ordem, 0))
               from fin_extrato e join fin_extrato_lotes l on l.id = e.lote_id join fin_contas c on c.id = e.conta_id
              where e.empresa_id = p_empresa and l.status = 'finalizado' and c.ativo and (p_conta is null or e.conta_id = p_conta)
                and e.data between p_ini and p_fim), '[]'::jsonb),
    'pendentes', (select count(*) from fin_extrato e join fin_contas c on c.id = e.conta_id
                   where e.empresa_id = p_empresa and c.ativo and (p_conta is null or e.conta_id = p_conta) and fin_extrato_pendente(e)));
end $$;
