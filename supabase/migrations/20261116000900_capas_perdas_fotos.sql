-- 16/11/2026: Perdas da equipe com foto do cliente e dos free (funcionário: foto da conta, montada na tela)
create or replace function public.capas_perdas_equipe(p_empresa uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.capas_pode(p_empresa) then raise exception 'Sem acesso ao material de proteção.' using errcode = '42501'; end if;
  return (
    with base as (
      select c.pedido_id, c.item_id, c.modelo_id, c.quantidade saiu,
             d.quantidade descarregou, d.concluida_em desc_em, r.quantidade voltou, r.concluida_em ret_em
        from capas_contagens c
        join capas_contagens d on d.pedido_id = c.pedido_id and d.item_id = c.item_id and d.etapa = 'descarregamento' and d.concluida_em is not null
        left join capas_contagens r on r.pedido_id = c.pedido_id and r.item_id = c.item_id and r.etapa = 'retorno' and r.concluida_em is not null
       where c.empresa_id = p_empresa and c.etapa = 'carregamento' and c.concluida_em is not null
         and (d.concluida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    ), perdas as (
      select b.*, greatest(0, coalesce(b.saiu, 0) - coalesce(b.descarregou, 0)) no_evento,
             case when b.ret_em is not null then greatest(0, coalesce(b.descarregou, 0) - coalesce(b.voltou, 0)) else 0 end no_galpao
        from base b
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'pedido_id', pe.pedido_id, 'numero', sp.numero_pedido, 'cliente', sp.cliente_nome,
      'cliente_foto', coalesce((select nullif(ce.catalogo_logo_url, '') from clientes_empresas ce where ce.id = sp.cliente_id),
                               (select nullif(ce.catalogo_logo_url, '') from clientes_empresas ce where ce.empresa_id = p_empresa and lower(ce.nome_razao) = lower(sp.cliente_nome) limit 1)), 'data', (pe.desc_em at time zone 'America/Sao_Paulo')::date,
      'item', coalesce(i.descricao_total, i.produto), 'modelo', m.nome, 'tipo', coalesce(m.tipo_material, 'capa'), 'custo', m.custo,
      'saiu', pe.saiu, 'descarregou', pe.descarregou, 'voltou', pe.voltou,
      'no_evento', pe.no_evento, 'no_galpao', pe.no_galpao,
      'valor_evento', pe.no_evento * m.custo, 'valor_galpao', pe.no_galpao * m.custo,
      'equipe', (select coalesce(jsonb_agg(jsonb_build_object('nome', ep.nome, 'papel', ep.papel, 'funcionario_id', ep.funcionario_id, 'free_id', ep.free_id,
                                           'foto', case when ep.free_id is not null then (select nullif(fc.foto_url, '') from free_cadastros fc where fc.id = ep.free_id) end)
                                           order by ep.papel desc, ep.ordem, ep.nome), '[]')
                   from operacao_etapas e join operacao_etapa_pessoas ep on ep.etapa_id = e.id
                  where e.pedido_id = pe.pedido_id and e.tipo = 'desmontagem' and e.servico_ref is null)
    ) order by pe.desc_em desc), '[]')
    from perdas pe
    join capas_modelos m on m.id = pe.modelo_id
    join itens i on i.id = pe.item_id
    join separacoes_pedidos sp on sp.id = pe.pedido_id
    where pe.no_evento > 0 or pe.no_galpao > 0
  );
end $function$;
revoke all on function public.capas_perdas_equipe(uuid, date, date) from public, anon;
grant execute on function public.capas_perdas_equipe(uuid, date, date) to authenticated;
