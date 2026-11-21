-- Início: últimos retornos registrados no Pós-venda, para a equipe da mesma empresa.
-- Projeção própria: não libera telefone, valores, tentativas ou dados internos da tratativa.
create index if not exists posvenda_contatos_portal_recentes
  on public.posvenda_contatos (empresa_id, concluido_em desc, id)
  where status = 'concluido';

create or replace function public.portal_feedbacks_decoradores(p_empresa uuid, p_limite integer default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_empresa is null or not public.eh_membro_empresa(p_empresa) then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  return jsonb_build_object('itens', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'decorador', c.cliente_nome,
      'foto', (select cl.catalogo_logo_url from clientes_empresas cl where cl.id = c.cliente_id and cl.empresa_id = p_empresa),
      'recebido_em', c.concluido_em, 'atencao', c.atencao,
      'retorno_concluido', c.tratativa_concluida_em is not null,
      'observacao', c.observacao,
      'respostas', coalesce((select jsonb_agg(jsonb_build_object('pergunta', r->>'pergunta', 'respostas', r->'respostas', 'ruim', r->'ruim'))
        from jsonb_array_elements(case when jsonb_typeof(c.respostas) = 'array' then c.respostas else '[]'::jsonb end) r
        where jsonb_array_length(case when jsonb_typeof(r->'respostas') = 'array' then r->'respostas' else '[]'::jsonb end) > 0), '[]'::jsonb),
      'observacoes_setor', coalesce((select jsonb_object_agg(k, v)
        from jsonb_each_text(case when jsonb_typeof(c.observacoes_setor) = 'object' then c.observacoes_setor else '{}'::jsonb end) s(k, v)
        where k in ('triagem', 'carregamento', 'montagem') and nullif(btrim(v), '') is not null), '{}'::jsonb),
      'eventos', (select jsonb_agg(jsonb_build_object('pedido', p.numero_pedido, 'data', p.data_evento, 'tipo', p.tipo_evento, 'local', p.local_nome)
                      order by p.data_evento desc nulls last, p.numero_pedido)
        from posvenda_contato_pedidos cp join separacoes_pedidos p on p.id = cp.pedido_id and p.empresa_id = p_empresa
        where cp.contato_id = c.id
          and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true'
          and coalesce(p.observacoes->>'teste_ia', '') <> 'true')
    ) order by c.concluido_em desc, c.id)
    from (
      select c.* from posvenda_contatos c
      where c.empresa_id = p_empresa and c.status = 'concluido' and c.concluido_em is not null
        and (nullif(btrim(c.observacao), '') is not null
          or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(c.respostas) = 'array' then c.respostas else '[]'::jsonb end) r
                       cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r->'respostas') = 'array' then r->'respostas' else '[]'::jsonb end) a
                      where nullif(btrim(a), '') is not null)
          or exists (select 1 from jsonb_each_text(case when jsonb_typeof(c.observacoes_setor) = 'object' then c.observacoes_setor else '{}'::jsonb end) s(k, v)
                      where k in ('triagem', 'carregamento', 'montagem') and nullif(btrim(v), '') is not null))
        and exists (select 1 from posvenda_contato_pedidos cp join separacoes_pedidos p on p.id = cp.pedido_id and p.empresa_id = p_empresa
                     where cp.contato_id = c.id
                       and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true'
                       and coalesce(p.observacoes->>'teste_ia', '') <> 'true')
      order by c.concluido_em desc, c.id limit greatest(1, least(coalesce(p_limite, 6), 12))
    ) c
  ), '[]'::jsonb));
end $$;
revoke all on function public.portal_feedbacks_decoradores(uuid, integer) from public, anon;
grant execute on function public.portal_feedbacks_decoradores(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
