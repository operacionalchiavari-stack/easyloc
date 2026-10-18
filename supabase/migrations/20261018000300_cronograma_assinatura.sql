-- (out/2026) Cronograma recarrega só quando algo muda.
-- Antes a tela recarregava tudo (com "Carregando cronograma...") a cada minuto. Agora ela pergunta só esta
-- assinatura, a cada 20 s; quando a assinatura muda, recarrega em silêncio.
-- A assinatura junta: versão das abas que o cronograma lê (planilha do Cronograma e a Matriz, sem as abas de
-- sessão/cadastro, que mudam o tempo todo e não aparecem na tela) + andamento da separação/conferência
-- dos pedidos do sistema (pedidos, itens e etiquetas lidas).

create or replace function public.cronograma_assinatura()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.gs_empresa_dona();
  v_abas text;
  v_pedidos text;
  v_itens text;
  v_etiquetas text;
begin
  if not public.gs_eh_da_equipe() then
    return null;
  end if;

  select string_agg(planilha_id || '/' || nome || ':' || versao, ',' order by planilha_id, nome)
    into v_abas
    from public.gs_abas
   where (planilha_id = '14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ'
          and (nome in ('Agenda', 'Alertas_Motoristas', 'Carregamento_Conclusoes', 'Cronograma',
                        'Cronograma_Alteracoes', 'Desmontagem_Conclusoes', 'Desmontagem_ListaConferida',
                        'Free_Vagas', 'Free_Inscricoes', 'Responsaveis', 'Equipes', 'Caminhoes')
               or nome like 'Montagem%'))
      or (planilha_id = '1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78' and nome = 'Matriz');

  select md5(coalesce(string_agg(id::text || coalesce(status, '') || coalesce(status_comercial, '')
               || coalesce(status_operacional, '') || coalesce(operacao::text, '')
               || coalesce(atualizado_em::text, ''), ',' order by id), ''))
    into v_pedidos
    from public.separacoes_pedidos
   where empresa_id = v_empresa;

  select count(*)::text || '-' || coalesce(sum(quantidade_separada), 0)::text || '-'
         || coalesce(max(atualizado_em)::text, '') || '-' || md5(coalesce(string_agg(coalesce(componentes::text, ''), ''), ''))
    into v_itens
    from public.separacoes_itens
   where empresa_id = v_empresa;

  select count(*)::text || '-' || count(lida_separacao_em)::text || '-' || count(lida_carregamento_em)::text || '-'
         || count(lida_retorno_em)::text
    into v_etiquetas
    from public.separacoes_etiquetas
   where empresa_id = v_empresa;

  return md5(concat_ws('|', v_abas, v_pedidos, v_itens, v_etiquetas));
end;
$$;

revoke all on function public.cronograma_assinatura() from public, anon;
grant execute on function public.cronograma_assinatura() to authenticated;
