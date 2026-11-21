-- Pós-venda (15/11/2026): aba "Painel" (gerencial), no lugar da aba Conversas (removida, junto com a captura das
-- mensagens do WhatsApp no zapi-webhook). Devolve as ligações já feitas no período (concluída, sem contato ou não ligar,
-- pela data em que foram fechadas), os elogios/negativos marcados para a equipe e o formulário atual (categorias).

create or replace function public.posvenda_painel(p_empresa uuid, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ini timestamptz; fim timestamptz;
begin
  if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido.'; end if;
  ini := (p_de::timestamp at time zone 'America/Sao_Paulo');
  fim := ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo');
  return jsonb_build_object(
    'config', posvenda_cfg(p_empresa),
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'contatos', coalesce((select jsonb_agg(posvenda_contato_json(c) order by coalesce(c.concluido_em, c.ultima_tentativa_em) desc)
                            from posvenda_contatos c
                           where c.empresa_id = p_empresa and c.status in ('concluido', 'sem_contato', 'dispensado')
                             and coalesce(c.concluido_em, c.ultima_tentativa_em, c.created_at) >= ini
                             and coalesce(c.concluido_em, c.ultima_tentativa_em, c.created_at) < fim), '[]'),
    -- ligações ainda abertas (para a fila e os atrasos de hoje)
    'pendentes', (select jsonb_build_object('total', count(*), 'atrasadas', count(*) filter (where c.prazo < (now() at time zone 'America/Sao_Paulo')::date))
                    from posvenda_contatos c where c.empresa_id = p_empresa and c.status = 'pendente'),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('nome', f.nome, 'funcionario_id', f.funcionario_id, 'free_id', f.free_id,
                          'free_foto', fc.foto_url, 'setor', fa.setor, 'tipo', f.tipo, 'etapa', f.etapa_tipo, 'pedido', p.numero_pedido,
                          'cliente', p.cliente_nome, 'em', f.criado_em, 'por', f.criado_por_nome))
                          from posvenda_equipe_feedback f
                          join separacoes_pedidos p on p.id = f.pedido_id
                          left join free_cadastros fc on fc.id = f.free_id
                          left join funcionarios_acesso fa on fa.id = f.funcionario_id
                         where f.empresa_id = p_empresa and f.criado_em >= ini and f.criado_em < fim), '[]'));
end $$;
revoke all on function public.posvenda_painel(uuid, date, date) from public, anon;
grant execute on function public.posvenda_painel(uuid, date, date) to authenticated;
notify pgrst, 'reload schema';
