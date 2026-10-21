-- Início do Portal: "Resumo do dia" lido das tabelas da operação (antes vinha da planilha do Cronograma).
-- Toda a equipe da empresa vê (como antes), só leitura e só o dia pedido.
create or replace function public.operacao_resumo_dia(p_data date default null) returns jsonb
language sql stable security definer set search_path=public as $$
  with emp as (select gs_empresa_dona() id),
  dia as (select coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date) d),
  et as (
    select e.nome etapa, coalesce(to_char(e.hora, 'HH24:MI'), '') horario,
           coalesce(p.numero_pedido, '') pedido, coalesce(p.cliente_nome, '') cliente, coalesce(p.local_nome, '') local,
           coalesce((select string_agg(k.codigo, ', ' order by k.codigo) from operacao_etapa_caminhoes c join caminhoes k on k.id = c.caminhao_id where c.etapa_id = e.id), '') caminhao,
           coalesce((select x.nome from operacao_etapa_pessoas x where x.etapa_id = e.id and x.papel = 'responsavel' limit 1), '') responsavel,
           coalesce((select string_agg(x.nome, ', ' order by x.ordem) from operacao_etapa_pessoas x where x.etapa_id = e.id and x.papel = 'equipe'), '') equipe
      from operacao_etapas e left join separacoes_pedidos p on p.id = e.pedido_id, emp, dia
     where e.empresa_id = emp.id and e.data = dia.d
  )
  select case when eh_membro_empresa((select id from emp)) then jsonb_build_object(
    'data', (select to_char(d, 'YYYY-MM-DD') from dia),
    'etapas', coalesce((select jsonb_agg(to_jsonb(et) order by et.horario = '', et.horario) from et), '[]'),
    'agenda', coalesce((select jsonb_agg(jsonb_build_object('horario', coalesce(to_char(a.hora, 'HH24:MI'), ''), 'tipo', a.tipo, 'setor', a.setor,
                         'descricao', a.descricao, 'responsavel', a.enviado_por) order by a.hora nulls last)
                        from operacao_agenda a, emp, dia where a.empresa_id = emp.id and a.data = dia.d), '[]')
  ) end
$$;
revoke all on function public.operacao_resumo_dia(date) from public, anon;
grant execute on function public.operacao_resumo_dia(date) to authenticated;
