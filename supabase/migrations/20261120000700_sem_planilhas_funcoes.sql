-- Últimas funções do banco que liam as planilhas copiadas do Google (nov/2026).
-- 1) Ordens de serviço antigas (aba "Itens Danificados"): a aba estava vazia; as O.S são do acervo (acervo_os).
create or replace function public.acervo_ordens_legado(p_empresa uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$ select '[]'::jsonb $$;
revoke all on function public.acervo_ordens_legado(uuid) from public, anon, authenticated;

-- 2) Pergunta 5 da complexidade ("cliente possui reclamação operacional?"): lia a aba Feedback (vazia).
--    Agora vem do Pós-venda do sistema: ligação concluída que precisou de atenção = reclamação.
create or replace function public.complexidade_reclamacao_cliente(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare cadastro jsonb; registros int := 0; reclamacoes int := 0;
begin
  select complexidade->'reclamacao' into cadastro from clientes_empresas where id = p_cliente and empresa_id = p_empresa;
  if not found then
    return jsonb_build_object('valor', null, 'fonte', 'Cadastro do cliente', 'detalhe', 'Vincule o pedido a um cliente desta empresa');
  end if;
  if cadastro = 'true'::jsonb then
    return jsonb_build_object('valor', true, 'fonte', 'Cadastro do cliente', 'detalhe', 'Reclamação operacional registrada no cadastro do cliente');
  end if;
  select count(*)::int, count(*) filter (where atencao)::int into registros, reclamacoes
  from posvenda_contatos where empresa_id = p_empresa and cliente_id = p_cliente and concluido_em is not null;
  return jsonb_build_object('valor', reclamacoes > 0, 'fonte', 'Histórico de feedbacks',
    'detalhe', case when reclamacoes > 0 then reclamacoes || ' ligação(ões) de pós-venda com reclamação do cliente'
      else 'Nenhuma reclamação registrada para este cliente no pós-venda' end,
    'registros', registros, 'reclamacoes', reclamacoes);
end $$;
revoke all on function public.complexidade_reclamacao_cliente(uuid, uuid) from public, anon, authenticated;

-- 3) Gatilho da compra automática do almoxarifado antigo (planilha): o almoxarifado novo tem o próprio gatilho.
drop function if exists public.almox_gatilho_produtos();
