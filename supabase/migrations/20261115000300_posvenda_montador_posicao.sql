-- Pós-venda (15/11/2026): cada pedido da ligação traz o montador responsável (etapa Montagem do cronograma) e a posição
-- final (ocorrências). E o documento da posição final pode ser aberto pelo pós-venda sem dar acesso ao Financeiro.

create or replace function public.posvenda_contato_json(c posvenda_contatos)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select to_jsonb(c) - 'cliente_chave' || jsonb_build_object(
    'foto', (select e.catalogo_logo_url from clientes_empresas e where e.id = c.cliente_id),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'numero', p.numero_pedido, 'data_evento', p.data_evento, 'tipo', p.tipo_evento,
                  'local', p.local_nome, 'valor', p.valor_total,
                  'montador', (select jsonb_build_object('nome', pe.nome, 'funcionario_id', pe.funcionario_id, 'free_foto', fc.foto_url)
                                 from operacao_etapas e join operacao_etapa_pessoas pe on pe.etapa_id = e.id and pe.papel = 'responsavel'
                                 left join free_cadastros fc on fc.id = pe.free_id
                                where e.pedido_id = p.id and e.tipo = 'montagem' order by e.data, pe.ordem limit 1),
                  'posicao_final', exists (select 1 from fin_posicoes_finais f where f.pedido_id = p.id and f.status = 'confirmado'),
                  'ocorrencias', (select count(*) from fin_posicoes_finais f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.itens) = 'array' then f.itens else '[]'::jsonb end) i
                                   where f.pedido_id = p.id and i->>'tipo' in ('avaria', 'desaparecido'))
                ) order by p.data_evento) from posvenda_contato_pedidos cp join separacoes_pedidos p on p.id = cp.pedido_id
                where cp.contato_id = c.id), '[]'),
    'ultimo_contato', (select max(x.concluido_em) from posvenda_contatos x where x.empresa_id = c.empresa_id and x.cliente_chave = c.cliente_chave and x.status = 'concluido' and x.id <> c.id))
$function$;

-- Leitura da posição final pelo pós-venda: a função do Financeiro exige 'financeiro.fluxo.visualizar'. O pós-venda só
-- libera essa leitura dentro desta chamada (marca da transação), para pedido com posição final confirmada e que está
-- numa ligação de pós-venda, e para quem vê pedidos.
create or replace function public.fin_pode(p_empresa uuid, p_chave text)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select auth.uid() is not null and (public.funcionario_pode(p_empresa, auth.uid(), p_chave)
    or (p_chave = 'financeiro.fluxo.visualizar' and current_setting('acervo.posvenda_documento', true) = 'sim'));
$function$;

create or replace function public.posvenda_posicao_final(p_empresa uuid, p_pedido uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r jsonb;
begin
  if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if not exists (select 1 from fin_posicoes_finais f where f.pedido_id = p_pedido and f.empresa_id = p_empresa and f.status = 'confirmado') then raise exception 'A posição final deste pedido ainda não foi confirmada.'; end if;
  if not exists (select 1 from posvenda_contato_pedidos cp join posvenda_contatos c on c.id = cp.contato_id where cp.pedido_id = p_pedido and c.empresa_id = p_empresa) then raise exception 'Pedido sem ligação de pós-venda.'; end if;
  perform set_config('acervo.posvenda_documento', 'sim', true);
  r := fin_posicao_final_base(p_empresa, p_pedido);
  perform set_config('acervo.posvenda_documento', '', true);
  return r;
exception when others then
  perform set_config('acervo.posvenda_documento', '', true);
  raise;
end $function$;
revoke all on function public.posvenda_posicao_final(uuid, uuid) from public, anon;
grant execute on function public.posvenda_posicao_final(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
